"""Relatorios que cruzam PDV, estoque e financeiro."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select

from app import models
from app.core.deps import DB, CurrentUser, exigir_admin

# Modulo de gestao: fora do alcance de quem so opera o caixa.
router = APIRouter(
    prefix="/api/relatorios",
    tags=["relatorios"],
    dependencies=[Depends(exigir_admin)],
)

VENDA_VALIDA = models.Venda.status == models.StatusVenda.FINALIZADA


def _intervalo(inicio: date | None, fim: date | None) -> tuple[datetime, datetime]:
    fim = fim or date.today()
    inicio = inicio or (fim - timedelta(days=29))
    return datetime.combine(inicio, time.min), datetime.combine(fim, time.max)


@router.get("/dashboard")
def dashboard(db: DB, _: CurrentUser):
    hoje_ini, hoje_fim = _intervalo(date.today(), date.today())
    mes_ini, mes_fim = _intervalo(date.today().replace(day=1), date.today())

    def total_vendas(ini: datetime, fim: datetime) -> Decimal:
        return Decimal(
            str(
                db.scalar(
                    select(func.coalesce(func.sum(models.Venda.total), 0)).where(
                        VENDA_VALIDA, models.Venda.criado_em.between(ini, fim)
                    )
                )
                or 0
            )
        )

    qtd_hoje = db.scalar(
        select(func.count(models.Venda.id)).where(
            VENDA_VALIDA, models.Venda.criado_em.between(hoje_ini, hoje_fim)
        )
    )
    vendas_hoje = total_vendas(hoje_ini, hoje_fim)

    criticos = db.scalar(
        select(func.count(models.Produto.id)).where(
            models.Produto.ativo.is_(True),
            models.Produto.estoque_atual <= models.Produto.estoque_minimo,
        )
    )
    valor_estoque = db.scalar(
        select(
            func.coalesce(
                func.sum(models.Produto.estoque_atual * models.Produto.preco_custo), 0
            )
        ).where(models.Produto.ativo.is_(True))
    )

    abertos = [models.StatusTitulo.ABERTO, models.StatusTitulo.PARCIAL]

    def saldo_titulos(tipo: models.TipoTitulo, vencidos: bool = False) -> Decimal:
        stmt = select(
            func.coalesce(func.sum(models.Titulo.valor - models.Titulo.valor_pago), 0)
        ).where(models.Titulo.tipo == tipo, models.Titulo.status.in_(abertos))
        if vencidos:
            stmt = stmt.where(models.Titulo.vencimento < date.today())
        return Decimal(str(db.scalar(stmt) or 0))

    return {
        "vendas_hoje": vendas_hoje,
        "vendas_mes": total_vendas(mes_ini, mes_fim),
        "qtd_vendas_hoje": qtd_hoje or 0,
        "ticket_medio_hoje": (vendas_hoje / qtd_hoje) if qtd_hoje else Decimal("0"),
        "produtos_criticos": criticos or 0,
        "valor_estoque": Decimal(str(valor_estoque or 0)),
        "a_receber": saldo_titulos(models.TipoTitulo.RECEBER),
        "a_receber_vencido": saldo_titulos(models.TipoTitulo.RECEBER, vencidos=True),
        "a_pagar": saldo_titulos(models.TipoTitulo.PAGAR),
        "a_pagar_vencido": saldo_titulos(models.TipoTitulo.PAGAR, vencidos=True),
        "funcionarios_ativos": db.scalar(
            select(func.count(models.Usuario.id)).where(models.Usuario.ativo.is_(True))
        )
        or 0,
    }


@router.get("/vendas-por-dia")
def vendas_por_dia(db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None):
    ini, f = _intervalo(inicio, fim)
    dia = func.date(models.Venda.criado_em)
    linhas = db.execute(
        select(dia, func.sum(models.Venda.total), func.count(models.Venda.id))
        .where(VENDA_VALIDA, models.Venda.criado_em.between(ini, f))
        .group_by(dia)
        .order_by(dia)
    ).all()
    return [
        {"dia": d, "total": Decimal(str(total or 0)), "quantidade": qtd}
        for d, total, qtd in linhas
    ]


@router.get("/produtos-mais-vendidos")
def produtos_mais_vendidos(
    db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None, limite: int = 10
):
    ini, f = _intervalo(inicio, fim)
    linhas = db.execute(
        select(
            models.VendaItem.produto_id,
            models.VendaItem.descricao,
            func.sum(models.VendaItem.quantidade),
            func.sum(models.VendaItem.total),
            func.sum(
                (models.VendaItem.preco_unitario - models.VendaItem.custo_unitario)
                * models.VendaItem.quantidade
            ),
        )
        .join(models.Venda, models.Venda.id == models.VendaItem.venda_id)
        .where(VENDA_VALIDA, models.Venda.criado_em.between(ini, f))
        .group_by(models.VendaItem.produto_id, models.VendaItem.descricao)
        .order_by(func.sum(models.VendaItem.total).desc())
        .limit(limite)
    ).all()
    return [
        {
            "produto_id": pid,
            "produto": nome,
            "quantidade": Decimal(str(qtd or 0)),
            "faturamento": Decimal(str(fat or 0)),
            "lucro_bruto": Decimal(str(lucro or 0)),
        }
        for pid, nome, qtd, fat, lucro in linhas
    ]


@router.get("/vendas-por-pagamento")
def vendas_por_pagamento(
    db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None
):
    ini, f = _intervalo(inicio, fim)
    linhas = db.execute(
        select(
            models.Venda.forma_pagamento,
            func.sum(models.Venda.total),
            func.count(models.Venda.id),
        )
        .where(VENDA_VALIDA, models.Venda.criado_em.between(ini, f))
        .group_by(models.Venda.forma_pagamento)
    ).all()
    return [
        {"forma": forma.value, "total": Decimal(str(total or 0)), "quantidade": qtd}
        for forma, total, qtd in linhas
    ]


@router.get("/dre-simplificado")
def dre_simplificado(db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None):
    """Receita de vendas x CMV x despesas pagas no periodo."""
    ini, f = _intervalo(inicio, fim)

    receita = Decimal(
        str(
            db.scalar(
                select(func.coalesce(func.sum(models.Venda.total), 0)).where(
                    VENDA_VALIDA, models.Venda.criado_em.between(ini, f)
                )
            )
            or 0
        )
    )
    cmv = Decimal(
        str(
            db.scalar(
                select(
                    func.coalesce(
                        func.sum(models.VendaItem.custo_unitario * models.VendaItem.quantidade),
                        0,
                    )
                )
                .join(models.Venda, models.Venda.id == models.VendaItem.venda_id)
                .where(VENDA_VALIDA, models.Venda.criado_em.between(ini, f))
            )
            or 0
        )
    )
    despesas = Decimal(
        str(
            db.scalar(
                select(func.coalesce(func.sum(models.Titulo.valor_pago), 0)).where(
                    models.Titulo.tipo == models.TipoTitulo.PAGAR,
                    models.Titulo.quitado_em.between(ini.date(), f.date()),
                )
            )
            or 0
        )
    )

    lucro_bruto = receita - cmv
    return {
        "receita_bruta": receita,
        "cmv": cmv,
        "lucro_bruto": lucro_bruto,
        "margem_bruta": (lucro_bruto / receita * 100) if receita else Decimal("0"),
        "despesas_pagas": despesas,
        "resultado": lucro_bruto - despesas,
    }


@router.get("/curva-abc")
def curva_abc(db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None):
    """Classifica produtos por participacao no faturamento (A=80%, B=95%, C=resto)."""
    ini, f = _intervalo(inicio, fim)
    linhas = db.execute(
        select(models.VendaItem.descricao, func.sum(models.VendaItem.total))
        .join(models.Venda, models.Venda.id == models.VendaItem.venda_id)
        .where(VENDA_VALIDA, models.Venda.criado_em.between(ini, f))
        .group_by(models.VendaItem.descricao)
        .order_by(func.sum(models.VendaItem.total).desc())
    ).all()

    total = sum((Decimal(str(v or 0)) for _, v in linhas), Decimal("0"))
    resultado = []
    acumulado = Decimal("0")
    for nome, valor in linhas:
        valor = Decimal(str(valor or 0))
        acumulado += valor
        percentual = (acumulado / total * 100) if total else Decimal("0")
        classe = "A" if percentual <= 80 else "B" if percentual <= 95 else "C"
        resultado.append(
            {
                "produto": nome,
                "faturamento": valor,
                "participacao": (valor / total * 100) if total else Decimal("0"),
                "acumulado": percentual,
                "classe": classe,
            }
        )
    return resultado


# --------------------------------------------------------------------------- #
# Quebras de caixa
# --------------------------------------------------------------------------- #
# A quebra e atribuida a quem OPEROU o turno (abriu), nao a quem fechou: um
# gerente pode fechar o turno de quem esqueceu, e a diferenca continua sendo do
# operador que trabalhou com aquela gaveta.
TURNO_FECHADO = models.CaixaSessao.status == models.StatusCaixa.FECHADA


def _periodo_turnos(inicio: date | None, fim: date | None):
    ini, f = _intervalo(inicio, fim)
    return models.CaixaSessao.fechado_em.between(ini, f)


@router.get("/quebras-por-operador")
def quebras_por_operador(
    db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None
):
    """Resumo das diferencas de caixa por operador no periodo.

    Sobra e falta aparecem separadas de proposito: um operador com +50 num turno
    e -50 em outro tem saldo zero, mas nao e o mesmo caso de quem fecha certo
    todos os dias.
    """
    diferenca = models.CaixaSessao.diferenca
    positiva = case((diferenca > 0, diferenca), else_=0)
    negativa = case((diferenca < 0, diferenca), else_=0)

    linhas = db.execute(
        select(
            models.CaixaSessao.usuario_abertura_id,
            models.Usuario.nome,
            func.count(models.CaixaSessao.id),
            func.coalesce(func.sum(diferenca), 0),
            func.coalesce(func.sum(positiva), 0),
            func.coalesce(func.sum(negativa), 0),
            func.sum(case((diferenca > 0, 1), else_=0)),
            func.sum(case((diferenca < 0, 1), else_=0)),
            func.sum(case((diferenca == 0, 1), else_=0)),
            func.coalesce(func.min(diferenca), 0),
            func.coalesce(func.sum(models.CaixaSessao.valor_esperado), 0),
        )
        .join(models.Usuario, models.Usuario.id == models.CaixaSessao.usuario_abertura_id)
        .where(TURNO_FECHADO, _periodo_turnos(inicio, fim))
        .group_by(models.CaixaSessao.usuario_abertura_id, models.Usuario.nome)
        .order_by(func.coalesce(func.sum(negativa), 0))
    ).all()

    resultado = []
    for (
        usuario_id,
        nome,
        turnos,
        saldo,
        sobras,
        faltas,
        qtd_sobras,
        qtd_faltas,
        qtd_exatos,
        maior_falta,
        esperado,
    ) in linhas:
        esperado = Decimal(str(esperado or 0))
        faltas = abs(Decimal(str(faltas or 0)))
        resultado.append(
            {
                "usuario_id": usuario_id,
                "operador": nome,
                "turnos": turnos,
                "turnos_exatos": qtd_exatos or 0,
                "turnos_com_sobra": qtd_sobras or 0,
                "turnos_com_falta": qtd_faltas or 0,
                "sobras": Decimal(str(sobras or 0)),
                "faltas": faltas,
                "saldo": Decimal(str(saldo or 0)),
                "maior_falta": abs(Decimal(str(maior_falta or 0))),
                "movimentado": esperado,
                # Quanto a falta representa do dinheiro que passou pela gaveta.
                "falta_percentual": (faltas / esperado * 100) if esperado > 0 else Decimal("0"),
                "precisao": (Decimal(qtd_exatos or 0) / turnos * 100) if turnos else Decimal("0"),
            }
        )
    return resultado


@router.get("/quebras-detalhe")
def quebras_detalhe(
    db: DB,
    _: CurrentUser,
    inicio: date | None = None,
    fim: date | None = None,
    usuario_id: int | None = None,
    apenas_com_quebra: bool = True,
    limite: int = 100,
):
    """Turnos fechados do periodo, do pior para o melhor."""
    stmt = (
        select(models.CaixaSessao)
        .where(TURNO_FECHADO, _periodo_turnos(inicio, fim))
        .order_by(models.CaixaSessao.diferenca)
        .limit(limite)
    )
    if usuario_id:
        stmt = stmt.where(models.CaixaSessao.usuario_abertura_id == usuario_id)
    if apenas_com_quebra:
        stmt = stmt.where(models.CaixaSessao.diferenca != 0)

    return [
        {
            "sessao_id": s.id,
            "caixa": s.caixa.nome if s.caixa else None,
            "operador": s.usuario_abertura.nome if s.usuario_abertura else None,
            "fechado_por": s.usuario_fechamento.nome if s.usuario_fechamento else None,
            "aberto_em": s.aberto_em,
            "fechado_em": s.fechado_em,
            "esperado": Decimal(str(s.valor_esperado or 0)),
            "contado": Decimal(str(s.valor_informado or 0)),
            "diferenca": Decimal(str(s.diferenca or 0)),
            "observacao": s.observacao_fechamento,
        }
        for s in db.scalars(stmt).all()
    ]
