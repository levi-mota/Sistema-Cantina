"""Contas a pagar e a receber (titulos)."""

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app import models, schemas
from app.core.deps import DB, CurrentUser, exigir_admin

# Modulo de gestao: fora do alcance de quem so opera o caixa.
router = APIRouter(
    prefix="/api/financeiro",
    tags=["financeiro"],
    dependencies=[Depends(exigir_admin)],
)

ABERTOS = [models.StatusTitulo.ABERTO, models.StatusTitulo.PARCIAL]


def _titulo_out(t: models.Titulo) -> schemas.TituloOut:
    valor = Decimal(str(t.valor))
    pago = Decimal(str(t.valor_pago or 0))
    return schemas.TituloOut(
        id=t.id,
        tipo=t.tipo,
        descricao=t.descricao,
        categoria=t.categoria,
        parceiro_id=t.parceiro_id,
        parceiro_nome=t.parceiro.nome if t.parceiro else None,
        venda_id=t.venda_id,
        valor=valor,
        valor_pago=pago,
        saldo=valor - pago,
        vencimento=t.vencimento,
        quitado_em=t.quitado_em,
        status=t.status,
        forma_pagamento=t.forma_pagamento,
        observacao=t.observacao,
        vencido=t.status in ABERTOS and t.vencimento < date.today(),
        criado_em=t.criado_em,
    )


@router.get("/titulos", response_model=list[schemas.TituloOut])
def listar(
    db: DB,
    _: CurrentUser,
    tipo: models.TipoTitulo | None = None,
    status_titulo: models.StatusTitulo | None = None,
    parceiro_id: int | None = None,
    inicio: date | None = None,
    fim: date | None = None,
    apenas_vencidos: bool = False,
    limite: int = 300,
):
    stmt = select(models.Titulo)
    if tipo:
        stmt = stmt.where(models.Titulo.tipo == tipo)
    if status_titulo:
        stmt = stmt.where(models.Titulo.status == status_titulo)
    if parceiro_id:
        stmt = stmt.where(models.Titulo.parceiro_id == parceiro_id)
    if inicio:
        stmt = stmt.where(models.Titulo.vencimento >= inicio)
    if fim:
        stmt = stmt.where(models.Titulo.vencimento <= fim)
    if apenas_vencidos:
        stmt = stmt.where(
            models.Titulo.vencimento < date.today(), models.Titulo.status.in_(ABERTOS)
        )
    titulos = db.scalars(stmt.order_by(models.Titulo.vencimento).limit(limite)).all()
    return [_titulo_out(t) for t in titulos]


@router.get("/resumo")
def resumo(db: DB, _: CurrentUser, dias_a_vencer: int = 7):
    hoje = date.today()
    horizonte = hoje + timedelta(days=dias_a_vencer)

    def soma(tipo: models.TipoTitulo, **filtros) -> Decimal:
        stmt = select(
            func.coalesce(func.sum(models.Titulo.valor - models.Titulo.valor_pago), 0)
        ).where(models.Titulo.tipo == tipo, models.Titulo.status.in_(ABERTOS))
        if filtros.get("vencidos"):
            stmt = stmt.where(models.Titulo.vencimento < hoje)
        if filtros.get("a_vencer"):
            stmt = stmt.where(
                models.Titulo.vencimento >= hoje, models.Titulo.vencimento <= horizonte
            )
        return Decimal(str(db.scalar(stmt) or 0))

    a_pagar = soma(models.TipoTitulo.PAGAR)
    a_receber = soma(models.TipoTitulo.RECEBER)
    return {
        "a_pagar_total": a_pagar,
        "a_pagar_vencido": soma(models.TipoTitulo.PAGAR, vencidos=True),
        "a_pagar_proximos": soma(models.TipoTitulo.PAGAR, a_vencer=True),
        "a_receber_total": a_receber,
        "a_receber_vencido": soma(models.TipoTitulo.RECEBER, vencidos=True),
        "a_receber_proximos": soma(models.TipoTitulo.RECEBER, a_vencer=True),
        "saldo_projetado": a_receber - a_pagar,
    }


@router.post(
    "/titulos", response_model=list[schemas.TituloOut], status_code=status.HTTP_201_CREATED
)
def criar(dados: schemas.TituloCreate, db: DB, _: CurrentUser):
    """Cria o titulo; com `parcelas > 1` divide o valor em parcelas mensais."""
    parcelas = dados.parcelas
    base = dados.model_dump(exclude={"parcelas", "intervalo_dias"})
    valor_total = Decimal(str(base.pop("valor")))
    valor_parcela = (valor_total / parcelas).quantize(Decimal("0.01"))

    criados: list[models.Titulo] = []
    for i in range(parcelas):
        # A ultima parcela absorve a diferenca de arredondamento.
        valor = (
            valor_total - valor_parcela * (parcelas - 1) if i == parcelas - 1 else valor_parcela
        )
        descricao = base["descricao"]
        if parcelas > 1:
            descricao = f"{descricao} ({i + 1}/{parcelas})"
        titulo = models.Titulo(
            **{**base, "descricao": descricao},
            valor=valor,
            vencimento=dados.vencimento + timedelta(days=dados.intervalo_dias * i),
        )
        db.add(titulo)
        criados.append(titulo)

    db.commit()
    for t in criados:
        db.refresh(t)
    return [_titulo_out(t) for t in criados]


@router.put("/titulos/{titulo_id}", response_model=schemas.TituloOut)
def atualizar(titulo_id: int, dados: schemas.TituloUpdate, db: DB, _: CurrentUser):
    titulo = db.get(models.Titulo, titulo_id)
    if not titulo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Titulo nao encontrado")
    if titulo.status == models.StatusTitulo.PAGO:
        raise HTTPException(status.HTTP_409_CONFLICT, "Titulo quitado nao pode ser alterado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(titulo, campo, valor)
    db.commit()
    db.refresh(titulo)
    return _titulo_out(titulo)


@router.post("/titulos/{titulo_id}/baixar", response_model=schemas.TituloOut)
def baixar(titulo_id: int, dados: schemas.BaixaIn, db: DB, _: CurrentUser):
    """Registra pagamento/recebimento total ou parcial."""
    titulo = db.get(models.Titulo, titulo_id)
    if not titulo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Titulo nao encontrado")
    if titulo.status in (models.StatusTitulo.PAGO, models.StatusTitulo.CANCELADO):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Titulo ja esta {titulo.status.value}")

    valor = Decimal(str(dados.valor))
    saldo = Decimal(str(titulo.valor)) - Decimal(str(titulo.valor_pago or 0))
    if valor > saldo:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Valor maior que o saldo devedor (R$ {saldo})",
        )

    titulo.valor_pago = Decimal(str(titulo.valor_pago or 0)) + valor
    titulo.forma_pagamento = dados.forma_pagamento
    if Decimal(str(titulo.valor_pago)) >= Decimal(str(titulo.valor)):
        titulo.status = models.StatusTitulo.PAGO
        titulo.quitado_em = dados.data or date.today()
    else:
        titulo.status = models.StatusTitulo.PARCIAL

    db.commit()
    db.refresh(titulo)
    return _titulo_out(titulo)


@router.post("/titulos/{titulo_id}/cancelar", response_model=schemas.TituloOut)
def cancelar(titulo_id: int, db: DB, _: CurrentUser):
    titulo = db.get(models.Titulo, titulo_id)
    if not titulo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Titulo nao encontrado")
    if titulo.status == models.StatusTitulo.PAGO:
        raise HTTPException(status.HTTP_409_CONFLICT, "Titulo quitado nao pode ser cancelado")
    titulo.status = models.StatusTitulo.CANCELADO
    db.commit()
    db.refresh(titulo)
    return _titulo_out(titulo)
