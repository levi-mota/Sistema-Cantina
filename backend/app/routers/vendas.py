"""Ponto de venda (PDV).

Uma venda finalizada dispara tres integracoes:
  * baixa de estoque (um movimento de SAIDA por item);
  * financeiro -> venda no fiado gera uma conta a receber do cliente;
  * caixa -> a venda se vincula ao turno aberto, para conferir a gaveta.
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.core.config import settings
from app.core.deps import DB, CurrentUser, Gestao
from app.services import caixa as servico_caixa
from app.services import estoque as servico_estoque

router = APIRouter(prefix="/api/vendas", tags=["pdv"])


def _venda_out(v: models.Venda) -> schemas.VendaOut:
    return schemas.VendaOut(
        id=v.id,
        cliente_id=v.cliente_id,
        cliente_nome=v.cliente.nome if v.cliente else None,
        usuario_id=v.usuario_id,
        usuario_nome=v.usuario.nome if v.usuario else None,
        caixa_sessao_id=v.caixa_sessao_id,
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
    if dados.forma_pagamento == models.FormaPagamento.FIADO and not dados.cliente_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Venda no fiado exige um cliente identificado",
        )

    cliente = db.get(models.Parceiro, dados.cliente_id) if dados.cliente_id else None
    if dados.cliente_id and not cliente:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente nao encontrado")

    # Dinheiro passa pela gaveta, entao precisa de um turno aberto para ser
    # conferido no fechamento. As demais formas apenas se vinculam se houver.
    if dados.forma_pagamento == models.FormaPagamento.DINHEIRO and settings.exigir_caixa_aberto:
        sessao = servico_caixa.exigir_sessao_aberta(db)
    else:
        sessao = servico_caixa.sessao_aberta(db)

    venda = models.Venda(
        cliente_id=dados.cliente_id,
        usuario_id=usuario.id,
        caixa_sessao_id=sessao.id if sessao else None,
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

    if dados.forma_pagamento == models.FormaPagamento.FIADO:
        limite = Decimal(str(cliente.limite_credito or 0)) if cliente else Decimal("0")
        if limite > 0:
            em_aberto = db.scalars(
                select(models.Titulo).where(
                    models.Titulo.tipo == models.TipoTitulo.RECEBER,
                    models.Titulo.parceiro_id == cliente.id,
                    models.Titulo.status.in_(
                        [models.StatusTitulo.ABERTO, models.StatusTitulo.PARCIAL]
                    ),
                )
            ).all()
            devido = sum(
                (Decimal(str(t.valor)) - Decimal(str(t.valor_pago)) for t in em_aberto),
                Decimal("0"),
            )
            if devido + venda.total > limite:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Limite de credito excedido: em aberto R$ {devido}, limite R$ {limite}",
                )

        db.add(
            models.Titulo(
                tipo=models.TipoTitulo.RECEBER,
                descricao=f"Venda fiado #{venda.id}",
                categoria="Vendas",
                parceiro_id=cliente.id if cliente else None,
                venda_id=venda.id,
                valor=venda.total,
                vencimento=dados.vencimento_fiado or (date.today() + timedelta(days=30)),
            )
        )
        venda.valor_recebido = Decimal("0")

    db.commit()
    db.refresh(venda)
    return _venda_out(venda)


@router.post("/{venda_id}/cancelar", response_model=schemas.VendaOut)
def cancelar(venda_id: int, db: DB, gestor: Gestao):
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
