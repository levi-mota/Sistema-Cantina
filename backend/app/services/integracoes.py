"""Consulta de CNPJ e CEP.

Ordem de tentativa:
  1. ApiBrasil  -> usado apenas se APIBRASIL_TOKEN estiver configurado
  2. BrasilAPI  -> publica, sem token
  3. ViaCEP     -> publica, sem token (somente CEP)

Qualquer falha em um provedor cai para o próximo, entao o sistema continua
funcionando mesmo sem credenciais.
"""

import re

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas import EmpresaOut, EnderecoOut

TIMEOUT = httpx.Timeout(12.0)
APIBRASIL_BASE = "https://gateway.apibrasil.io/api/v2/dados"

_cache: dict[str, EnderecoOut | EmpresaOut] = {}


def so_digitos(valor: str) -> str:
    return re.sub(r"\D", "", valor or "")


def _apibrasil_headers() -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {settings.apibrasil_token}",
        "Content-Type": "application/json",
    }
    if settings.apibrasil_device_token:
        headers["DeviceToken"] = settings.apibrasil_device_token
    return headers


def _desaninhar(payload: dict) -> dict:
    """ApiBrasil devolve o conteudo util dentro de response/data/retorno."""
    for chave in ("response", "data", "retorno"):
        interno = payload.get(chave)
        if isinstance(interno, dict):
            return _desaninhar(interno)
    return payload


# --------------------------------------------------------------------------- #
# CEP
# --------------------------------------------------------------------------- #
async def _cep_apibrasil(client: httpx.AsyncClient, cep: str) -> EnderecoOut | None:
    if not settings.apibrasil_token:
        return None
    resposta = await client.post(
        f"{APIBRASIL_BASE}/cep", json={"cep": cep}, headers=_apibrasil_headers()
    )
    resposta.raise_for_status()
    d = _desaninhar(resposta.json())
    if not d:
        return None
    return EnderecoOut(
        cep=cep,
        logradouro=d.get("logradouro") or d.get("street"),
        bairro=d.get("bairro") or d.get("neighborhood"),
        cidade=d.get("cidade") or d.get("localidade") or d.get("city"),
        uf=d.get("uf") or d.get("estado") or d.get("state"),
        fonte="apibrasil",
    )


async def _cep_brasilapi(client: httpx.AsyncClient, cep: str) -> EnderecoOut | None:
    resposta = await client.get(f"https://brasilapi.com.br/api/cep/v2/{cep}")
    resposta.raise_for_status()
    d = resposta.json()
    return EnderecoOut(
        cep=cep,
        logradouro=d.get("street"),
        bairro=d.get("neighborhood"),
        cidade=d.get("city"),
        uf=d.get("state"),
        fonte="brasilapi",
    )


async def _cep_viacep(client: httpx.AsyncClient, cep: str) -> EnderecoOut | None:
    resposta = await client.get(f"https://viacep.com.br/ws/{cep}/json/")
    resposta.raise_for_status()
    d = resposta.json()
    if d.get("erro"):
        return None
    return EnderecoOut(
        cep=cep,
        logradouro=d.get("logradouro"),
        bairro=d.get("bairro"),
        cidade=d.get("localidade"),
        uf=d.get("uf"),
        fonte="viacep",
    )


async def consultar_cep(cep_bruto: str) -> EnderecoOut:
    cep = so_digitos(cep_bruto)
    if len(cep) != 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "CEP deve ter 8 digitos")

    chave = f"cep:{cep}"
    if chave in _cache:
        return _cache[chave]  # type: ignore[return-value]

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for provedor in (_cep_apibrasil, _cep_brasilapi, _cep_viacep):
            try:
                resultado = await provedor(client, cep)
            except Exception:
                continue
            if resultado:
                _cache[chave] = resultado
                return resultado

    raise HTTPException(status.HTTP_404_NOT_FOUND, "CEP não encontrado")


# --------------------------------------------------------------------------- #
# CNPJ
# --------------------------------------------------------------------------- #
async def _cnpj_apibrasil(client: httpx.AsyncClient, cnpj: str) -> EmpresaOut | None:
    if not settings.apibrasil_token:
        return None
    resposta = await client.post(
        f"{APIBRASIL_BASE}/cnpj", json={"cnpj": cnpj}, headers=_apibrasil_headers()
    )
    resposta.raise_for_status()
    d = _desaninhar(resposta.json())
    if not d:
        return None
    return EmpresaOut(
        documento=cnpj,
        razao_social=d.get("razao_social") or d.get("nome"),
        nome_fantasia=d.get("nome_fantasia") or d.get("fantasia"),
        situacao=d.get("situacao") or d.get("descricao_situacao_cadastral"),
        atividade_principal=d.get("atividade_principal")
        if isinstance(d.get("atividade_principal"), str)
        else d.get("cnae_fiscal_descricao"),
        email=d.get("email"),
        telefone=d.get("telefone") or d.get("ddd_telefone_1"),
        cep=so_digitos(d.get("cep") or ""),
        logradouro=d.get("logradouro"),
        numero=d.get("numero"),
        complemento=d.get("complemento"),
        bairro=d.get("bairro"),
        cidade=d.get("municipio") or d.get("cidade"),
        uf=d.get("uf"),
        fonte="apibrasil",
    )


async def _cnpj_brasilapi(client: httpx.AsyncClient, cnpj: str) -> EmpresaOut | None:
    resposta = await client.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}")
    resposta.raise_for_status()
    d = resposta.json()
    return EmpresaOut(
        documento=cnpj,
        razao_social=d.get("razao_social"),
        nome_fantasia=d.get("nome_fantasia"),
        situacao=d.get("descricao_situacao_cadastral"),
        atividade_principal=d.get("cnae_fiscal_descricao"),
        email=d.get("email"),
        telefone=d.get("ddd_telefone_1"),
        cep=so_digitos(d.get("cep") or ""),
        logradouro=f"{d.get('descricao_tipo_de_logradouro') or ''} {d.get('logradouro') or ''}".strip(),
        numero=d.get("numero"),
        complemento=d.get("complemento"),
        bairro=d.get("bairro"),
        cidade=d.get("municipio"),
        uf=d.get("uf"),
        fonte="brasilapi",
    )


async def consultar_cnpj(cnpj_bruto: str) -> EmpresaOut:
    cnpj = so_digitos(cnpj_bruto)
    if len(cnpj) != 14:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "CNPJ deve ter 14 digitos")

    chave = f"cnpj:{cnpj}"
    if chave in _cache:
        return _cache[chave]  # type: ignore[return-value]

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for provedor in (_cnpj_apibrasil, _cnpj_brasilapi):
            try:
                resultado = await provedor(client, cnpj)
            except Exception:
                continue
            if resultado:
                _cache[chave] = resultado
                return resultado

    raise HTTPException(status.HTTP_404_NOT_FOUND, "CNPJ não encontrado")
