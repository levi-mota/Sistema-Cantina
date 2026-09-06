"""Fuso do balcão: os carimbos são gravados em UTC, mas "hoje" é dito no
relógio da cantina. Sem esta conversão o dia do relatório começaria às 21h da
véspera, e a última hora de venda cairia no dia seguinte.
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
    """Fim exclusivo (00:00 do dia seguinte): `time.max` perderia o último
    milionésimo de segundo."""
    return _para_utc(datetime.combine(dia + timedelta(days=1), time.min))


def dia_local(momento: datetime) -> date:
    """Em que dia da cantina caiu este carimbo (que esta em UTC)."""
    return momento.replace(tzinfo=timezone.utc).astimezone(FUSO).date()


def intervalo(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """Os carimbos UTC que cercam o período pedido em datas locais."""
    return inicio_do_dia(inicio), fim_do_dia(fim)
