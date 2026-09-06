"""Relatórios que cruzam PDV, estoque e financeiro."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select

from app import models
from app.core import tempo
from app.core.deps import DB, CurrentUser, exigir_admin

# Modulo de gestao: fora do alcance de quem so opera o caixa.
router = APIRouter(
    prefix="/api/relatorios",
    tags=["relatorios"],
    dependencies=[Depends(exigir_admin)],
)

VENDA_VALIDA = models.Venda.status == models.StatusVenda.FINALIZADA


def _datas(inicio: date | None, fim: date | None) -> tuple[date, date]:
    """O periodo pedido, em datas do calendario da cantina."""
    fim = fim or tempo.hoje()
    inicio = inicio or (fim - timedelta(days=29))
    return inicio, fim


def _intervalo(inicio: date | None, fim: date | None) -> tuple[datetime, datetime]:
    """O mesmo período em UTC. O fim é exclusivo: use `>= ini` e `< fim`."""
    return tempo.intervalo(*_datas(inicio, fim))


@router.get("/dashboard")
def dashboard(db: DB, _: CurrentUser):
    """Os quatro números do topo do painel: vendas e estoque.

    O financeiro tem tela própria, então não entra aqui -- cada consulta a mais
    é uma consulta que roda a cada abertura do painel.
    """
    hoje = tempo.hoje()
    hoje_ini, hoje_fim = _intervalo(hoje, hoje)
    mes_ini, mes_fim = _intervalo(hoje.replace(day=1), hoje)

    def total_vendas(ini: datetime, fim: datetime) -> Decimal:
        return Decimal(
            str(
                db.scalar(
                    select(func.coalesce(func.sum(models.Venda.total), 0)).where(
                        VENDA_VALIDA, models.Venda.criado_em >= ini,
                        models.Venda.criado_em < fim
                    )
                )
                or 0
            )
        )

    qtd_hoje = db.scalar(
        select(func.count(models.Venda.id)).where(
            VENDA_VALIDA, models.Venda.criado_em >= hoje_ini,
            models.Venda.criado_em < hoje_fim
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

    return {
        "vendas_hoje": vendas_hoje,
        "vendas_mes": total_vendas(mes_ini, mes_fim),
        "qtd_vendas_hoje": qtd_hoje or 0,
        "ticket_medio_hoje": (vendas_hoje / qtd_hoje) if qtd_hoje else Decimal("0"),
        "produtos_criticos": criticos or 0,
        "valor_estoque": Decimal(str(valor_estoque or 0)),
    }


@router.get("/vendas-por-dia")
def vendas_por_dia(db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None):
    """Uma linha por dia do calendário da cantina. O agrupamento é feito aqui
    porque o banco só conhece o carimbo em UTC."""
    ini, f = _intervalo(inicio, fim)
    linhas = db.execute(
        select(models.Venda.criado_em, models.Venda.total).where(
            VENDA_VALIDA, models.Venda.criado_em >= ini, models.Venda.criado_em < f
        )
    ).all()

    por_dia: dict[str, dict] = {}
    for criado_em, total in linhas:
        chave = tempo.dia_local(criado_em).isoformat()
        registro = por_dia.setdefault(chave, {"dia": chave, "total": Decimal("0"), "quantidade": 0})
        registro["total"] += Decimal(str(total or 0))
        registro["quantidade"] += 1
    return [por_dia[k] for k in sorted(por_dia)]


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
        .where(VENDA_VALIDA, models.Venda.criado_em >= ini,
            models.Venda.criado_em < f)
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
        .where(VENDA_VALIDA, models.Venda.criado_em >= ini,
            models.Venda.criado_em < f)
        .group_by(models.Venda.forma_pagamento)
    ).all()
    return [
        {"forma": forma.value, "total": Decimal(str(total or 0)), "quantidade": qtd}
        for forma, total, qtd in linhas
    ]


@router.get("/dre-simplificado")
def dre_simplificado(db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None):
    """Receita de vendas x CMV x despesas pagas no período."""
    ini, f = _intervalo(inicio, fim)
    # Titulo tem data pura, sem hora: o periodo entra como o gestor digitou.
    dia_inicial, dia_final = _datas(inicio, fim)

    receita = Decimal(
        str(
            db.scalar(
                select(func.coalesce(func.sum(models.Venda.total), 0)).where(
                    VENDA_VALIDA, models.Venda.criado_em >= ini,
            models.Venda.criado_em < f
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
                .where(VENDA_VALIDA, models.Venda.criado_em >= ini,
            models.Venda.criado_em < f)
            )
            or 0
        )
    )
    despesas = Decimal(
        str(
            db.scalar(
                select(func.coalesce(func.sum(models.Titulo.valor_pago), 0)).where(
                    models.Titulo.tipo == models.TipoTitulo.PAGAR,
                    models.Titulo.quitado_em >= dia_inicial,
                    models.Titulo.quitado_em <= dia_final,
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
    """Classifica produtos por participação no faturamento (A=80%, B=95%, C=resto)."""
    ini, f = _intervalo(inicio, fim)
    linhas = db.execute(
        select(models.VendaItem.descricao, func.sum(models.VendaItem.total))
        .join(models.Venda, models.Venda.id == models.VendaItem.venda_id)
        .where(VENDA_VALIDA, models.Venda.criado_em >= ini,
            models.Venda.criado_em < f)
        .group_by(models.VendaItem.descricao)
        .order_by(func.sum(models.VendaItem.total).desc())
    ).all()

    total = sum((Decimal(str(v or 0)) for _, v in linhas), Decimal("0"))
    resultado = []
    acumulado = Decimal("0")
    for nome, valor in linhas:
        valor = Decimal(str(valor or 0))
        # A faixa e decidida pelo que veio ANTES do item: quem cruza os 80% e
        # justamente quem forma a classe A, e nao pode ser rebaixado por isso.
        anterior = (acumulado / total * 100) if total else Decimal("0")
        acumulado += valor
        percentual = (acumulado / total * 100) if total else Decimal("0")
        classe = "A" if anterior < 80 else "B" if anterior < 95 else "C"
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
    return (models.CaixaSessao.fechado_em >= ini, models.CaixaSessao.fechado_em < f)


@router.get("/quebras-por-operador")
def quebras_por_operador(
    db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None
):
    """Resumo das diferencas de caixa por operador no período.

    Sobra e falta aparecem separadas de proposito: um operador com +50 num turno
    e -50 em outro tem saldo zero, mas não e o mesmo caso de quem fecha certo
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
            func.coalesce(func.min(negativa), 0),
            func.coalesce(func.sum(models.CaixaSessao.valor_esperado), 0),
        )
        .join(models.Usuario, models.Usuario.id == models.CaixaSessao.usuario_abertura_id)
        .where(TURNO_FECHADO, *_periodo_turnos(inicio, fim))
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
    """Turnos fechados do período, do pior para o melhor."""
    stmt = (
        select(models.CaixaSessao)
        .where(TURNO_FECHADO, *_periodo_turnos(inicio, fim))
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


@router.get("/pagamentos")
def pagamentos(db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None):
    """Recebimento por forma de pagamento no período.

    Além do total, traz o ticket médio e a participação de cada forma -- e o
    número que responde "quanto entrou em dinheiro e quanto entrou em PIX",
    que é o que separa a conferência da gaveta do extrato do banco.
    """
    ini, f = _intervalo(inicio, fim)

    linhas = db.execute(
        select(
            models.Venda.forma_pagamento,
            func.coalesce(func.sum(models.Venda.total), 0),
            func.count(models.Venda.id),
            func.coalesce(func.sum(models.Venda.desconto), 0),
        )
        .where(VENDA_VALIDA, models.Venda.criado_em >= ini,
            models.Venda.criado_em < f)
        .group_by(models.Venda.forma_pagamento)
        .order_by(func.sum(models.Venda.total).desc())
    ).all()

    total_geral = sum((Decimal(str(t or 0)) for _, t, _, _ in linhas), Decimal("0"))
    qtd_geral = sum(q for _, _, q, _ in linhas)

    formas = [
        {
            "forma": forma.value,
            "total": Decimal(str(total or 0)),
            "quantidade": quantidade,
            "desconto": Decimal(str(desconto or 0)),
            "ticket_medio": (Decimal(str(total or 0)) / quantidade) if quantidade else Decimal("0"),
            "participacao": (Decimal(str(total or 0)) / total_geral * 100)
            if total_geral
            else Decimal("0"),
        }
        for forma, total, quantidade, desconto in linhas
    ]

    return {
        "formas": formas,
        "total_geral": total_geral,
        "quantidade_geral": qtd_geral,
        "ticket_medio_geral": (total_geral / qtd_geral) if qtd_geral else Decimal("0"),
    }


@router.get("/pagamentos-por-dia")
def pagamentos_por_dia(
    db: DB, _: CurrentUser, inicio: date | None = None, fim: date | None = None
):
    """Uma linha por dia, com uma coluna por forma de pagamento.

    O dia é o do calendário da cantina; ver `vendas_por_dia`.
    """
    ini, f = _intervalo(inicio, fim)
    linhas = db.execute(
        select(
            models.Venda.criado_em, models.Venda.forma_pagamento, models.Venda.total
        ).where(VENDA_VALIDA, models.Venda.criado_em >= ini, models.Venda.criado_em < f)
    ).all()

    por_dia: dict[str, dict[str, object]] = {}
    for criado_em, forma, total in linhas:
        chave = tempo.dia_local(criado_em).isoformat()
        registro = por_dia.setdefault(chave, {"dia": chave, "total": Decimal("0")})
        valor = Decimal(str(total or 0))
        registro[forma.value] = Decimal(str(registro.get(forma.value, 0))) + valor
        registro["total"] = registro["total"] + valor  # type: ignore[operator]
    return [por_dia[k] for k in sorted(por_dia)]
