"""Compras: monta a lista de reposição e gera o relatório para o comprador.

A lista nasce de uma sugestão (o que está abaixo do mínimo), é ajustada à mão e
vira um texto pronto para mandar a quem vai comprar. Ela não mexe no estoque --
a entrada é feita no módulo de estoque quando a mercadoria chegar.
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.core.deps import DB, CurrentUser, exigir_admin

router = APIRouter(
    prefix="/api/compras",
    tags=["compras"],
    dependencies=[Depends(exigir_admin)],
)


def _item_out(item: models.ItemListaCompra) -> schemas.ItemCompraOut:
    quantidade = Decimal(str(item.quantidade))
    custo = Decimal(str(item.custo_estimado or 0))
    produto = item.produto
    return schemas.ItemCompraOut(
        id=item.id,
        produto_id=item.produto_id,
        produto=produto.nome if produto else "-",
        codigo=produto.codigo if produto else None,
        unidade=produto.unidade if produto else "UN",
        fornecedor=produto.fornecedor.nome if produto and produto.fornecedor else None,
        quantidade=quantidade,
        custo_estimado=custo,
        estoque_no_momento=Decimal(str(item.estoque_no_momento or 0)),
        estoque_minimo=Decimal(str(produto.estoque_minimo or 0)) if produto else Decimal("0"),
        total_estimado=quantidade * custo,
        observacao=item.observacao,
    )


def _lista_out(lista: models.ListaCompra) -> schemas.ListaCompraOut:
    itens = [_item_out(i) for i in sorted(lista.itens, key=lambda i: i.id)]
    return schemas.ListaCompraOut(
        id=lista.id,
        titulo=lista.titulo,
        status=lista.status,
        comprador=lista.comprador,
        observacao=lista.observacao,
        usuario_nome=lista.usuario.nome if lista.usuario else None,
        criado_em=lista.criado_em,
        enviada_em=lista.enviada_em,
        concluida_em=lista.concluida_em,
        itens=itens,
        total_estimado=sum((i.total_estimado for i in itens), Decimal("0")),
        quantidade_itens=len(itens),
    )


def _montar_itens(db: DB, lista: models.ListaCompra, itens: list[schemas.ItemCompraIn]) -> None:
    """Substitui os itens da lista, congelando custo e estoque do momento."""
    lista.itens.clear()
    db.flush()
    for entrada in itens:
        produto = db.get(models.Produto, entrada.produto_id)
        if not produto:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"Produto {entrada.produto_id} não encontrado"
            )
        lista.itens.append(
            models.ItemListaCompra(
                produto_id=produto.id,
                quantidade=entrada.quantidade,
                custo_estimado=Decimal(str(produto.preco_custo or 0)),
                estoque_no_momento=Decimal(str(produto.estoque_atual or 0)),
                observacao=entrada.observacao,
            )
        )


def _quantidade_legivel(valor: Decimal) -> str:
    """3.000 -> "3"; 1.500 -> "1,5". O comprador le a lista, não o banco."""
    inteiro = valor.to_integral_value()
    if valor == inteiro:
        return str(int(inteiro))
    return f"{valor.normalize():f}".replace(".", ",")


def _exigir_editavel(lista: models.ListaCompra) -> None:
    if lista.status != models.StatusCompra.RASCUNHO:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Lista {lista.status.value.lower()} não pode mais ser alterada",
        )


# --------------------------------------------------------------------------- #
# Sugestao
# --------------------------------------------------------------------------- #
@router.get("/sugestao", response_model=list[schemas.SugestaoCompra])
def sugestao(db: DB, _: CurrentUser, cobertura: int = 2):
    """Produtos no mínimo ou abaixo, com a quantidade que recompoe o estoque.

    `cobertura` e quantas vezes o estoque mínimo se quer ter após a compra: com
    mínimo 10, estoque 4 e cobertura 2, a sugestão é comprar 16.
    """
    produtos = db.scalars(
        select(models.Produto)
        .where(
            models.Produto.ativo.is_(True),
            models.Produto.estoque_atual <= models.Produto.estoque_minimo,
        )
        .order_by(models.Produto.nome)
    ).all()

    resultado = []
    for p in produtos:
        atual = Decimal(str(p.estoque_atual or 0))
        minimo = Decimal(str(p.estoque_minimo or 0))
        alvo = minimo * cobertura
        quantidade = max(alvo - atual, Decimal("1"))
        custo = Decimal(str(p.preco_custo or 0))
        resultado.append(
            schemas.SugestaoCompra(
                produto_id=p.id,
                produto=p.nome,
                codigo=p.codigo,
                unidade=p.unidade,
                fornecedor=p.fornecedor.nome if p.fornecedor else None,
                estoque_atual=atual,
                estoque_minimo=minimo,
                sugestao=quantidade,
                custo_estimado=custo,
                total_estimado=quantidade * custo,
            )
        )
    return resultado


# --------------------------------------------------------------------------- #
# Listas
# --------------------------------------------------------------------------- #
@router.get("/listas", response_model=list[schemas.ListaCompraOut])
def listar(
    db: DB,
    _: CurrentUser,
    status_lista: models.StatusCompra | None = None,
    limite: int = 50,
):
    stmt = select(models.ListaCompra)
    if status_lista:
        stmt = stmt.where(models.ListaCompra.status == status_lista)
    listas = db.scalars(stmt.order_by(models.ListaCompra.id.desc()).limit(limite)).all()
    return [_lista_out(l) for l in listas]


@router.get("/listas/{lista_id}", response_model=schemas.ListaCompraOut)
def obter(lista_id: int, db: DB, _: CurrentUser):
    lista = db.get(models.ListaCompra, lista_id)
    if not lista:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lista não encontrada")
    return _lista_out(lista)


@router.post("/listas", response_model=schemas.ListaCompraOut, status_code=201)
def criar(dados: schemas.ListaCompraIn, db: DB, usuario: CurrentUser):
    lista = models.ListaCompra(
        titulo=dados.titulo.strip(),
        comprador=dados.comprador,
        observacao=dados.observacao,
        usuario_id=usuario.id,
    )
    db.add(lista)
    db.flush()
    _montar_itens(db, lista, dados.itens)
    db.commit()
    db.refresh(lista)
    return _lista_out(lista)


@router.put("/listas/{lista_id}", response_model=schemas.ListaCompraOut)
def atualizar(lista_id: int, dados: schemas.ListaCompraUpdate, db: DB, _: CurrentUser):
    lista = db.get(models.ListaCompra, lista_id)
    if not lista:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lista não encontrada")
    _exigir_editavel(lista)

    campos = dados.model_dump(exclude_unset=True)
    itens = campos.pop("itens", None)
    for campo, valor in campos.items():
        setattr(lista, campo, valor)
    if itens is not None:
        _montar_itens(db, lista, [schemas.ItemCompraIn(**i) for i in itens])

    db.commit()
    db.refresh(lista)
    return _lista_out(lista)


@router.delete("/listas/{lista_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir(lista_id: int, db: DB, _: CurrentUser):
    lista = db.get(models.ListaCompra, lista_id)
    if not lista:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lista não encontrada")
    db.delete(lista)
    db.commit()


@router.post("/listas/{lista_id}/status", response_model=schemas.ListaCompraOut)
def mudar_status(lista_id: int, novo: models.StatusCompra, db: DB, _: CurrentUser):
    """Marca a lista como enviada ao comprador, concluida ou cancelada."""
    lista = db.get(models.ListaCompra, lista_id)
    if not lista:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lista não encontrada")
    if not lista.itens and novo != models.StatusCompra.CANCELADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A lista não tem itens")

    agora = datetime.now(timezone.utc)
    lista.status = novo
    if novo == models.StatusCompra.ENVIADA:
        lista.enviada_em = agora
    elif novo == models.StatusCompra.CONCLUIDA:
        lista.concluida_em = agora
        lista.enviada_em = lista.enviada_em or agora
    elif novo == models.StatusCompra.RASCUNHO:
        lista.enviada_em = None
        lista.concluida_em = None

    db.commit()
    db.refresh(lista)
    return _lista_out(lista)


@router.get("/listas/{lista_id}/relatorio")
def relatorio(lista_id: int, db: DB, _: CurrentUser):
    """Texto pronto para mandar ao comprador (WhatsApp, e-mail, impressao).

    Os itens saem agrupados por fornecedor: quem compra costuma fazer uma
    parada por fornecedor, não uma por produto.
    """
    lista = db.get(models.ListaCompra, lista_id)
    if not lista:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lista não encontrada")

    saida = _lista_out(lista)
    por_fornecedor: dict[str, list[schemas.ItemCompraOut]] = {}
    for item in saida.itens:
        por_fornecedor.setdefault(item.fornecedor or "Sem fornecedor definido", []).append(item)

    linhas = [f"*{lista.titulo}*", f"Criada em {lista.criado_em.strftime('%d/%m/%Y')}"]
    if lista.comprador:
        linhas.append(f"Comprador: {lista.comprador}")
    linhas.append("")

    for fornecedor, itens in sorted(por_fornecedor.items()):
        linhas.append(f"*{fornecedor}*")
        for item in itens:
            linha = f"- {_quantidade_legivel(item.quantidade)} {item.unidade} - {item.produto}"
            if item.observacao:
                linha += f" ({item.observacao})"
            linhas.append(linha)
        linhas.append("")

    linhas.append(f"Itens: {saida.quantidade_itens}")
    linhas.append(f"Custo estimado: R$ {saida.total_estimado:.2f}".replace(".", ","))
    if lista.observacao:
        linhas += ["", lista.observacao]

    return {
        "titulo": lista.titulo,
        "texto": "\n".join(linhas).strip(),
        "total_estimado": saida.total_estimado,
        "quantidade_itens": saida.quantidade_itens,
    }
