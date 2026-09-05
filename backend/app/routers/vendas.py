"""Ponto de venda (PDV).

Toda venda pertence ao turno de caixa do operador que a registrou -- sem caixa
aberto nao ha venda. O consumidor e "diverso" por padrao; digitar um CPF/CNPJ
valido identifica a venda e, se o documento estiver cadastrado, vincula o
cliente.

Uma venda finalizada dispara duas integracoes:
  * baixa de estoque (um movimento de SAIDA por item);
  * caixa -> a venda entra na conferencia da gaveta daquele turno.
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.core.deps import DB, CurrentUser, SomenteAdmin
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
    inicio: date | None = None,
    fim: date | None = None,
    cliente_id: int | None = None,
    status_venda: models.StatusVenda | None = None,
    limite: int = 100,
):
    stmt = select(models.Venda)
    if inicio:
        stmt = stmt.where(models.Venda.criado_em >= datetime.combine(inicio, time.min))
    if fim:
        stmt = stmt.where(models.Venda.criado_em <= datetime.combine(fim, time.max))
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda nao encontrada")
    return _venda_out(venda)


@router.post("", response_model=schemas.VendaOut, status_code=status.HTTP_201_CREATED)
def finalizar_venda(dados: schemas.VendaIn, db: DB, usuario: CurrentUser):
    cliente = db.get(models.Parceiro, dados.cliente_id) if dados.cliente_id else None
    if dados.cliente_id and not cliente:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente nao encontrado")

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
    for item in dados.itens:
        produto = db.get(models.Produto, item.produto_id)
        if not produto or not produto.ativo:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"Produto {item.produto_id} indisponivel"
            )

        preco = Decimal(str(item.preco_unitario or produto.preco_venda))
        quantidade = Decimal(str(item.quantidade))
        desconto_item = Decimal(str(item.desconto or 0))
        total_item = preco * quantidade - desconto_item
        if total_item < 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Desconto maior que o valor do item '{produto.nome}'",
            )
        subtotal += total_item

        db.add(
            models.VendaItem(
                venda_id=venda.id,
                produto_id=produto.id,
                descricao=produto.nome,
                quantidade=quantidade,
                preco_unitario=preco,
                custo_unitario=Decimal(str(produto.preco_custo or 0)),
                desconto=desconto_item,
                total=total_item,
            )
        )

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


@router.post("/{venda_id}/cancelar", response_model=schemas.VendaOut)
def cancelar(venda_id: int, db: DB, gestor: SomenteAdmin):
    """Cancela a venda, devolve os itens ao estoque e cancela o titulo gerado."""
    venda = db.get(models.Venda, venda_id)
    if not venda:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda nao encontrada")
    if venda.status == models.StatusVenda.CANCELADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Venda ja cancelada")

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
                usuario_id=gestor.id,
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
