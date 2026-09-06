"""Ponto de venda (PDV).

Toda venda pertence ao turno de caixa do operador que a registrou -- sem caixa
aberto não ha venda. O consumidor é "diverso" por padrão; digitar um CPF/CNPJ
valido identifica a venda e, se o documento estiver cadastrado, vincula o
cliente.

Uma venda finalizada dispara duas integrações:
  * baixa de estoque (um movimento de SAIDA por item);
  * caixa -> a venda entra na conferência da gaveta daquele turno.
"""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app import models, schemas
from app.core import tempo
from app.core.deps import DB, CurrentUser
from app.services import caixa as servico_caixa
from app.services import documento as servico_documento
from app.services import estoque as servico_estoque

router = APIRouter(prefix="/api/vendas", tags=["pdv"])


def _venda_out(v: models.Venda) -> schemas.VendaOut:
    return schemas.VendaOut(
        id=v.id,
        cliente_id=v.cliente_id,
        cliente_nome=v.cliente.nome if v.cliente else None,
        documento_cliente=v.documento_cliente,
        usuario_id=v.usuario_id,
        usuario_nome=v.usuario.nome if v.usuario else None,
        caixa_sessao_id=v.caixa_sessao_id,
        caixa_nome=v.caixa_sessao.caixa.nome if v.caixa_sessao and v.caixa_sessao.caixa else None,
        status=v.status,
        forma_pagamento=v.forma_pagamento,
        subtotal=Decimal(str(v.subtotal)),
        desconto=Decimal(str(v.desconto)),
        total=Decimal(str(v.total)),
        valor_recebido=Decimal(str(v.valor_recebido)),
        troco=Decimal(str(v.troco)),
        observacao=v.observacao,
        criado_em=v.criado_em,
        itens=[schemas.VendaItemOut.model_validate(i) for i in v.itens],
    )


@router.get("", response_model=list[schemas.VendaOut])
def listar(
    db: DB,
    _: CurrentUser,
    busca: str | None = None,
    inicio: date | None = None,
    fim: date | None = None,
    cliente_id: int | None = None,
    caixa_sessao_id: int | None = None,
    status_venda: models.StatusVenda | None = None,
    limite: int = 100,
):
    stmt = select(models.Venda)
    if busca:
        alvo = busca.strip()
        # No balcão se procura pelo número da venda ou pelo CPF do cliente; o
        # nome vem depois, quando não se lembra de nenhum dos dois.
        condicoes = [
            models.Venda.documento_cliente.ilike(f"%{alvo}%"),
            models.Venda.cliente.has(models.Parceiro.nome.ilike(f"%{alvo}%")),
        ]
        somente_digitos = "".join(c for c in alvo if c.isdigit())
        if somente_digitos:
            condicoes.append(models.Venda.id == int(somente_digitos))
        stmt = stmt.where(or_(*condicoes))
    if caixa_sessao_id:
        stmt = stmt.where(models.Venda.caixa_sessao_id == caixa_sessao_id)
    # As datas vem do calendario da cantina; os carimbos estao em UTC.
    if inicio:
        stmt = stmt.where(models.Venda.criado_em >= tempo.inicio_do_dia(inicio))
    if fim:
        stmt = stmt.where(models.Venda.criado_em < tempo.fim_do_dia(fim))
    if cliente_id:
        stmt = stmt.where(models.Venda.cliente_id == cliente_id)
    if status_venda:
        stmt = stmt.where(models.Venda.status == status_venda)
    vendas = db.scalars(stmt.order_by(models.Venda.id.desc()).limit(limite)).all()
    return [_venda_out(v) for v in vendas]


@router.get("/{venda_id}", response_model=schemas.VendaOut)
def obter(venda_id: int, db: DB, _: CurrentUser):
    venda = db.get(models.Venda, venda_id)
    if not venda:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda não encontrada")
    return _venda_out(venda)


def _produto_vendavel(db: DB, produto_id: int) -> models.Produto:
    """O produto pode ser vendido no balcão agora?"""
    produto = db.get(models.Produto, produto_id)
    if not produto or not produto.ativo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Produto {produto_id} indisponível")
    if produto.tipo != models.TipoProduto.FINAL:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"'{produto.nome}' é de uso e consumo e não pode ser vendido",
        )
    return produto


def _montar_item(produto: models.Produto, entrada: schemas.VendaItemIn) -> models.VendaItem:
    """Uma linha da venda, com o preço e o custo congelados no momento."""
    preco = Decimal(str(entrada.preco_unitario or produto.preco_venda))
    quantidade = Decimal(str(entrada.quantidade))
    desconto = Decimal(str(entrada.desconto or 0))
    total = preco * quantidade - desconto
    if total < 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Desconto maior que o valor do item '{produto.nome}'",
        )
    return models.VendaItem(
        produto_id=produto.id,
        descricao=produto.nome,
        quantidade=quantidade,
        preco_unitario=preco,
        custo_unitario=Decimal(str(produto.preco_custo or 0)),
        desconto=desconto,
        total=total,
    )


@router.post("", response_model=schemas.VendaOut, status_code=status.HTTP_201_CREATED)
def finalizar_venda(dados: schemas.VendaIn, db: DB, usuario: CurrentUser):
    cliente = db.get(models.Parceiro, dados.cliente_id) if dados.cliente_id else None
    if dados.cliente_id and not cliente:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente não encontrado")

    # Consumidor diverso e o padrao: so identificamos se o documento vier.
    try:
        documento = servico_documento.validar(dados.documento_cliente)
    except ValueError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

    # Documento cadastrado vincula o cliente automaticamente.
    if documento and not cliente:
        cliente = db.scalar(
            select(models.Parceiro).where(models.Parceiro.documento == documento)
        )
    # Cliente escolhido sem documento digitado herda o documento do cadastro.
    if cliente and not documento:
        documento = cliente.documento

    sessao = servico_caixa.exigir_sessao_do_usuario(db, usuario.id)

    venda = models.Venda(
        cliente_id=cliente.id if cliente else None,
        documento_cliente=documento,
        usuario_id=usuario.id,
        caixa_sessao_id=sessao.id,
        forma_pagamento=dados.forma_pagamento,
        observacao=dados.observacao,
        status=models.StatusVenda.FINALIZADA,
    )
    db.add(venda)
    db.flush()

    subtotal = Decimal("0")
    for entrada in dados.itens:
        produto = _produto_vendavel(db, entrada.produto_id)
        item = _montar_item(produto, entrada)
        item.venda_id = venda.id
        quantidade = Decimal(str(item.quantidade))
        subtotal += Decimal(str(item.total))
        db.add(item)

        servico_estoque.movimentar(
            db,
            produto=produto,
            tipo=models.TipoMovimento.SAIDA,
            quantidade=quantidade,
            motivo=f"Venda #{venda.id}",
            venda_id=venda.id,
            usuario_id=usuario.id,
        )

    desconto = Decimal(str(dados.desconto or 0))
    if desconto > subtotal:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Desconto maior que o total da venda"
        )

    venda.subtotal = subtotal
    venda.desconto = desconto
    venda.total = subtotal - desconto

    if dados.forma_pagamento == models.FormaPagamento.DINHEIRO:
        recebido = Decimal(str(dados.valor_recebido or 0))
        if recebido and recebido < venda.total:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor recebido menor que o total"
            )
        venda.valor_recebido = recebido or venda.total
        venda.troco = Decimal(str(venda.valor_recebido)) - venda.total
    else:
        venda.valor_recebido = venda.total

    db.commit()
    db.refresh(venda)
    return _venda_out(venda)


def _exigir_venda_ajustavel(db: DB, venda: models.Venda, usuario: models.Usuario) -> None:
    """Uma venda só muda enquanto o turno dela ainda está aberto.

    Depois do fechamento, mexer na venda mudaria retroativamente a conferência
    de um turno que já foi conferido e assinado -- o registro deixaria de bater
    com o dinheiro que foi contado na gaveta.
    """
    if venda.status == models.StatusVenda.CANCELADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Venda cancelada não pode ser alterada")

    sessao = venda.caixa_sessao
    if not sessao or sessao.status != models.StatusCaixa.ABERTA:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "O turno desta venda já foi fechado. Só é possível alterar vendas do turno aberto.",
        )

    dono = venda.usuario_id == usuario.id
    if not dono and usuario.perfil != models.Perfil.ADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Esta venda é de outro operador. Só ele ou a gerência pode alterá-la.",
        )


@router.put("/{venda_id}", response_model=schemas.VendaOut)
def alterar(venda_id: int, dados: schemas.VendaAlteracaoIn, db: DB, usuario: CurrentUser):
    """Troca os itens de uma venda já finalizada.

    O cliente muda de ideia no último segundo, e refazer a venda inteira geraria
    dois registros para a mesma compra. Aqui a venda continua sendo uma só: o
    estoque recebe apenas a diferença, item a item.
    """
    venda = db.get(models.Venda, venda_id)
    if not venda:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda não encontrada")
    _exigir_venda_ajustavel(db, venda, usuario)

    antes = {item.produto_id: Decimal(str(item.quantidade)) for item in venda.itens}

    novos: list[models.VendaItem] = []
    depois: dict[int, Decimal] = {}
    subtotal = Decimal("0")
    for entrada in dados.itens:
        produto = _produto_vendavel(db, entrada.produto_id)
        item = _montar_item(produto, entrada)
        subtotal += Decimal(str(item.total))
        depois[produto.id] = depois.get(produto.id, Decimal("0")) + Decimal(str(item.quantidade))
        novos.append(item)

    desconto = Decimal(str(dados.desconto if dados.desconto is not None else venda.desconto))
    if desconto > subtotal:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Desconto maior que o total da venda"
        )

    # Só a diferença mexe no estoque: quem ficou na venda não sai nem volta.
    for produto_id in set(antes) | set(depois):
        delta = depois.get(produto_id, Decimal("0")) - antes.get(produto_id, Decimal("0"))
        if not delta:
            continue
        produto = db.get(models.Produto, produto_id)
        if not produto:
            continue
        servico_estoque.movimentar(
            db,
            produto=produto,
            tipo=(
                models.TipoMovimento.SAIDA if delta > 0 else models.TipoMovimento.ENTRADA
            ),
            quantidade=abs(delta),
            motivo=f"Ajuste da venda #{venda.id}",
            venda_id=venda.id,
            usuario_id=usuario.id,
        )

    venda.itens.clear()
    db.flush()
    venda.itens.extend(novos)

    venda.subtotal = subtotal
    venda.desconto = desconto
    venda.total = subtotal - desconto
    if dados.forma_pagamento is not None:
        venda.forma_pagamento = dados.forma_pagamento

    if venda.forma_pagamento == models.FormaPagamento.DINHEIRO:
        recebido = Decimal(str(dados.valor_recebido or 0))
        if recebido and recebido < venda.total:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor recebido menor que o total"
            )
        venda.valor_recebido = recebido or venda.total
        venda.troco = Decimal(str(venda.valor_recebido)) - venda.total
    else:
        venda.valor_recebido = venda.total
        venda.troco = Decimal("0")

    db.commit()
    db.refresh(venda)
    return _venda_out(venda)


@router.post("/{venda_id}/cancelar", response_model=schemas.VendaOut)
def cancelar(venda_id: int, db: DB, usuario: CurrentUser):
    """Cancela a venda, devolve os itens ao estoque e cancela o titulo gerado.

    O operador cancela a própria venda enquanto o turno dele está aberto -- é o
    erro que se percebe no balcão, na hora. Passado o fechamento, ou sendo a
    venda de outra pessoa, só a gerência.
    """
    venda = db.get(models.Venda, venda_id)
    if not venda:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda não encontrada")
    if venda.status == models.StatusVenda.CANCELADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Venda já cancelada")

    if usuario.perfil != models.Perfil.ADMIN:
        _exigir_venda_ajustavel(db, venda, usuario)

    for item in venda.itens:
        produto = db.get(models.Produto, item.produto_id)
        if produto:
            servico_estoque.movimentar(
                db,
                produto=produto,
                tipo=models.TipoMovimento.ENTRADA,
                quantidade=Decimal(str(item.quantidade)),
                motivo=f"Cancelamento da venda #{venda.id}",
                venda_id=venda.id,
                usuario_id=usuario.id,
            )

    titulos = db.scalars(
        select(models.Titulo).where(models.Titulo.venda_id == venda.id)
    ).all()
    for titulo in titulos:
        if titulo.status != models.StatusTitulo.PAGO:
            titulo.status = models.StatusTitulo.CANCELADO

    venda.status = models.StatusVenda.CANCELADA
    db.commit()
    db.refresh(venda)
    return _venda_out(venda)
