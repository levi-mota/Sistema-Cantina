"""Cobranca PIX do PDV: gera o BR Code (copia e cola / QR) do valor da venda."""

from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import CurrentUser
from app.services import pix as servico

router = APIRouter(prefix="/api/pix", tags=["pix"])


class CobrancaIn(BaseModel):
    valor: Decimal = Field(gt=0)
    identificador: str = "***"


class CobrancaOut(BaseModel):
    brcode: str
    valor: Decimal
    beneficiario: str
    chave: str


@router.get("/config")
def config(_: CurrentUser):
    """Diz ao PDV se ele pode oferecer o QR Code."""
    return {
        "configurado": servico.configurado(),
        "beneficiario": settings.pix_beneficiario,
        "chave": settings.pix_chave,
    }


@router.post("/cobranca", response_model=CobrancaOut)
def cobranca(dados: CobrancaIn, _: CurrentUser):
    return CobrancaOut(
        brcode=servico.gerar_brcode(float(dados.valor), dados.identificador),
        valor=dados.valor,
        beneficiario=settings.pix_beneficiario,
        chave=settings.pix_chave,
    )
