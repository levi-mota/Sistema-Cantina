"""Fuso do balcão.

Os carimbos de data e hora são gravados em UTC -- é o que mantém o histórico
coerente se o servidor mudar de máquina ou o horário de verão voltar. Mas todo
recorte que o usuário pede ("hoje", "este mês", "de 01/09 a 07/09") é dito no
relógio da cantina, e é aqui que um vira o outro.

Sem esta conversão, o dia do relatório começa às 21h do dia anterior: a última
hora de venda cai no dia seguinte e o total do dia nunca bate com a gaveta.
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

FUSO = ZoneInfo(settings.fuso)


def hoje() -> date:
    """A data de hoje no relógio da cantina, não no do servidor."""
    return datetime.now(FUSO).date()


def _para_utc(momento: datetime) -> datetime:
    """Hora local -> UTC sem fuso, que é como a coluna guarda."""
    return momento.replace(tzinfo=FUSO).astimezone(timezone.utc).replace(tzinfo=None)


def inicio_do_dia(dia: date) -> datetime:
    return _para_utc(datetime.combine(dia, time.min))


def fim_do_dia(dia: date) -> datetime:
    """Fim exclusivo: 00:00 do dia seguinte.

    Exclusivo por causa dos microssegundos -- `time.max` deixa de fora tudo o
    que acontecer no último milionésimo de segundo do dia.
    """
    return _para_utc(datetime.combine(dia + timedelta(days=1), time.min))


def dia_local(momento: datetime) -> date:
    """Em que dia da cantina caiu este carimbo (que esta em UTC)."""
    return momento.replace(tzinfo=timezone.utc).astimezone(FUSO).date()


def intervalo(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """Os dois carimbos em UTC que cercam o período pedido em datas locais."""
    return inicio_do_dia(inicio), fim_do_dia(fim)
