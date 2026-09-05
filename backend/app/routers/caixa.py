"""Sessao de caixa: abertura, sangria/suprimento, conferencia e fechamento."""

from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.core.deps import DB, CurrentUser, Gestao
from app.services import caixa as servico

router = APIRouter(prefix="/api/caixa", tags=["caixa"])


@router.get("/atual", response_model=schemas.CaixaOut | None)
def atual(db: DB, _: CurrentUser):
    """Sessao aberta no momento, ou `null` se o caixa estiver fechado."""
    sessao = servico.sessao_aberta(db)
    return servico.montar_saida(db, sessao) if sessao else None


@router.get("/sessoes", response_model=list[schemas.CaixaOut])
def listar(
    db: DB,
    _: CurrentUser,
    inicio: date | None = None,
    fim: date | None = None,
    limite: int = 60,
):
    stmt = select(models.CaixaSessao)
    if inicio:
        stmt = stmt.where(models.CaixaSessao.aberto_em >= datetime.combine(inicio, time.min))
    if fim:
        stmt = stmt.where(models.CaixaSessao.aberto_em <= datetime.combine(fim, time.max))
    sessoes = db.scalars(stmt.order_by(models.CaixaSessao.id.desc()).limit(limite)).all()
    # Sessoes fechadas ja guardam a conferencia congelada; nao recalculamos.
    return [
        servico.montar_saida(db, s, incluir_conferencia=s.status == models.StatusCaixa.ABERTA)
        for s in sessoes
    ]


@router.get("/sessoes/{sessao_id}", response_model=schemas.CaixaOut)
def obter(sessao_id: int, db: DB, _: CurrentUser):
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessao de caixa nao encontrada")
    return servico.montar_saida(db, sessao)


@router.post("/abrir", response_model=schemas.CaixaOut, status_code=status.HTTP_201_CREATED)
def abrir(dados: schemas.AberturaIn, db: DB, usuario: CurrentUser):
    if servico.sessao_aberta(db):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ja existe um caixa aberto. Feche o turno atual antes de abrir outro.",
        )

    sessao = models.CaixaSessao(
        usuario_abertura_id=usuario.id,
        valor_abertura=dados.valor_abertura,
        observacao_abertura=dados.observacao,
    )
    db.add(sessao)
    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao)


@router.post("/movimentos", response_model=schemas.CaixaOut, status_code=status.HTTP_201_CREATED)
def lancar_movimento(dados: schemas.MovimentoCaixaIn, db: DB, usuario: CurrentUser):
    """Sangria (retirada) ou suprimento (reforco de troco) no turno aberto."""
    sessao = servico.exigir_sessao_aberta(db)

    if dados.tipo == models.TipoMovimentoCaixa.SANGRIA:
        disponivel = servico.conferir(db, sessao).valor_esperado
        if Decimal(str(dados.valor)) > disponivel:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Sangria maior que o disponivel na gaveta (R$ {disponivel})",
            )

    db.add(
        models.MovimentoCaixa(
            sessao_id=sessao.id,
            tipo=dados.tipo,
            valor=dados.valor,
            motivo=dados.motivo,
            usuario_id=usuario.id,
        )
    )
    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao)


@router.post("/fechar", response_model=schemas.CaixaOut)
def fechar(dados: schemas.FechamentoIn, db: DB, usuario: CurrentUser):
    """Confere o valor contado contra o esperado e congela a quebra do turno."""
    sessao = servico.exigir_sessao_aberta(db)
    conferencia = servico.conferir(db, sessao)

    informado = Decimal(str(dados.valor_informado))
    sessao.valor_informado = informado
    sessao.valor_esperado = conferencia.valor_esperado
    sessao.diferenca = informado - conferencia.valor_esperado
    sessao.observacao_fechamento = dados.observacao
    sessao.usuario_fechamento_id = usuario.id
    sessao.fechado_em = datetime.now(timezone.utc)
    sessao.status = models.StatusCaixa.FECHADA

    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao, incluir_conferencia=False)


@router.post("/sessoes/{sessao_id}/reabrir", response_model=schemas.CaixaOut)
def reabrir(sessao_id: int, db: DB, _: Gestao):
    """Reabre um turno fechado por engano. Restrito a gerencia."""
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessao de caixa nao encontrada")
    if sessao.status == models.StatusCaixa.ABERTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta sessao ja esta aberta")
    if servico.sessao_aberta(db):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Feche o caixa atual antes de reabrir outro turno"
        )

    sessao.status = models.StatusCaixa.ABERTA
    sessao.fechado_em = None
    sessao.usuario_fechamento_id = None
    sessao.valor_informado = None
    sessao.valor_esperado = None
    sessao.diferenca = None
    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao)
