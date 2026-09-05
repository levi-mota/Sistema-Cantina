"""Consultas externas usadas para agilizar cadastros."""

from fastapi import APIRouter

from app import schemas
from app.core.config import settings
from app.core.deps import CurrentUser
from app.services import integracoes

router = APIRouter(prefix="/api/integracoes", tags=["integracoes"])


@router.get("/cep/{cep}", response_model=schemas.EnderecoOut)
async def cep(cep: str, _: CurrentUser):
    return await integracoes.consultar_cep(cep)


@router.get("/cnpj/{cnpj}", response_model=schemas.EmpresaOut)
async def cnpj(cnpj: str, _: CurrentUser):
    return await integracoes.consultar_cnpj(cnpj)


@router.get("/status")
def status(_: CurrentUser):
    return {
        "apibrasil": bool(settings.apibrasil_token),
        "provedores_cep": (["apibrasil"] if settings.apibrasil_token else [])
        + ["brasilapi", "viacep"],
        "provedores_cnpj": (["apibrasil"] if settings.apibrasil_token else []) + ["brasilapi"],
    }
