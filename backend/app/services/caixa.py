"""Regras da sessao de caixa.

A cantina pode ter varios caixas (terminais), cada um com a sua propria gaveta.
Um caixa comporta no maximo um turno aberto por vez, e um operador comporta no
maximo um turno aberto por vez -- e por esse turno que as vendas dele entram.

A conferencia responde a uma unica pergunta: quanto deveria estar nesta gaveta
agora? A conta e sempre a mesma:

    abertura + vendas em dinheiro + suprimentos - sangrias

Vendas em PIX, cartao e fiado nao entram porque nao passam pela gaveta.
"""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas


def sessoes_abertas(db: Session) -> list[models.CaixaSessao]:
    """Todos os turnos abertos no momento, um por caixa."""
    return list(
        db.scalars(
            select(models.CaixaSessao)
            .where(models.CaixaSessao.status == models.StatusCaixa.ABERTA)
            .order_by(models.CaixaSessao.caixa_id)
        ).all()
    )


def sessao_do_caixa(db: Session, caixa_id: int) -> models.CaixaSessao | None:
    """Turno aberto de um caixa especifico, se houver."""
    return db.scalar(
        select(models.CaixaSessao).where(
            models.CaixaSessao.caixa_id == caixa_id,
            models.CaixaSessao.status == models.StatusCaixa.ABERTA,
        )
    )


def sessao_do_usuario(db: Session, usuario_id: int) -> models.CaixaSessao | None:
    """Turno que este operador tem aberto, se houver."""
    return db.scalar(
        select(models.CaixaSessao).where(
            models.CaixaSessao.usuario_abertura_id == usuario_id,
            models.CaixaSessao.status == models.StatusCaixa.ABERTA,
        )
    )


def exigir_sessao_do_usuario(db: Session, usuario_id: int) -> models.CaixaSessao:
    """Toda venda pertence ao turno do operador que a registrou."""
    sessao = sessao_do_usuario(db, usuario_id)
    if not sessao:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Voce nao tem um caixa aberto. Abra o seu caixa para registrar vendas.",
        )
    return sessao


def conferir(db: Session, sessao: models.CaixaSessao) -> schemas.ConferenciaOut:
    """Monta a composicao do saldo esperado da sessao."""

    def total_vendas(*formas: models.FormaPagamento) -> tuple[Decimal, int]:
        linha = db.execute(
            select(
                func.coalesce(func.sum(models.Venda.total), 0),
                func.count(models.Venda.id),
            ).where(
                models.Venda.caixa_sessao_id == sessao.id,
                models.Venda.status == models.StatusVenda.FINALIZADA,
                models.Venda.forma_pagamento.in_(formas),
            )
        ).one()
        return Decimal(str(linha[0] or 0)), int(linha[1] or 0)

    def total_movimentos(tipo: models.TipoMovimentoCaixa) -> Decimal:
        valor = db.scalar(
            select(func.coalesce(func.sum(models.MovimentoCaixa.valor), 0)).where(
                models.MovimentoCaixa.sessao_id == sessao.id,
                models.MovimentoCaixa.tipo == tipo,
            )
        )
        return Decimal(str(valor or 0))

    dinheiro, qtd_dinheiro = total_vendas(models.FormaPagamento.DINHEIRO)
    outras, _ = total_vendas(
        models.FormaPagamento.PIX,
        models.FormaPagamento.DEBITO,
        models.FormaPagamento.CREDITO,
        models.FormaPagamento.FIADO,
    )
    suprimentos = total_movimentos(models.TipoMovimentoCaixa.SUPRIMENTO)
    sangrias = total_movimentos(models.TipoMovimentoCaixa.SANGRIA)
    abertura = Decimal(str(sessao.valor_abertura or 0))

    return schemas.ConferenciaOut(
        valor_abertura=abertura,
        vendas_dinheiro=dinheiro,
        qtd_vendas_dinheiro=qtd_dinheiro,
        suprimentos=suprimentos,
        sangrias=sangrias,
        valor_esperado=abertura + dinheiro + suprimentos - sangrias,
        vendas_outras_formas=outras,
        total_vendas=dinheiro + outras,
    )


def montar_saida(
    db: Session, sessao: models.CaixaSessao, *, incluir_conferencia: bool = True
) -> schemas.CaixaOut:
    saida = schemas.CaixaOut(
        id=sessao.id,
        caixa_id=sessao.caixa_id,
        caixa_nome=sessao.caixa.nome if sessao.caixa else None,
        status=sessao.status,
        usuario_abertura_id=sessao.usuario_abertura_id,
        usuario_abertura_nome=sessao.usuario_abertura.nome if sessao.usuario_abertura else None,
        usuario_fechamento_id=sessao.usuario_fechamento_id,
        usuario_fechamento_nome=(
            sessao.usuario_fechamento.nome if sessao.usuario_fechamento else None
        ),
        aberto_em=sessao.aberto_em,
        fechado_em=sessao.fechado_em,
        valor_abertura=Decimal(str(sessao.valor_abertura or 0)),
        valor_informado=(
            Decimal(str(sessao.valor_informado)) if sessao.valor_informado is not None else None
        ),
        valor_esperado=(
            Decimal(str(sessao.valor_esperado)) if sessao.valor_esperado is not None else None
        ),
        diferenca=Decimal(str(sessao.diferenca)) if sessao.diferenca is not None else None,
        observacao_abertura=sessao.observacao_abertura,
        observacao_fechamento=sessao.observacao_fechamento,
        movimentos=[
            schemas.MovimentoCaixaOut(
                id=m.id,
                tipo=m.tipo,
                valor=Decimal(str(m.valor)),
                motivo=m.motivo,
                usuario_id=m.usuario_id,
                usuario_nome=m.usuario.nome if m.usuario else None,
                criado_em=m.criado_em,
            )
            for m in sorted(sessao.movimentos, key=lambda m: m.id, reverse=True)
        ],
    )
    if incluir_conferencia:
        saida.conferencia = conferir(db, sessao)
    return saida
