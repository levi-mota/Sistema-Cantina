"""Geracao do BR Code do PIX (o "copia e cola" que vira QR Code).

O payload segue o padrão EMV(R) QRCPS do Banco Central: campos no formato
ID + tamanho + valor, encerrados por um CRC16 do próprio texto.

Este é um QR **estático com valor**: serve para o cliente pagar o valor exato da
venda. Ele não confirma o pagamento -- quem confirma é o operador, olhando a
notificacao do banco. Confirmacao automática exigiria integração com a API PIX
do banco (webhook de cobranca), que é outro assunto.
"""

import re

from fastapi import HTTPException, status

from app.core.config import settings

# Campos do payload
PAYLOAD_FORMATO = "00"
MERCHANT_ACCOUNT = "26"
CATEGORIA = "52"
MOEDA = "53"
VALOR = "54"
PAIS = "58"
BENEFICIARIO = "59"
CIDADE = "60"
ADICIONAL = "62"
CRC = "63"

GUI_PIX = "br.gov.bcb.pix"


def _campo(identificador: str, valor: str) -> str:
    return f"{identificador}{len(valor):02d}{valor}"


def _sanitizar(texto: str, limite: int) -> str:
    """O padrão aceita apenas ASCII imprimivel; acentos viram a letra base."""
    trocas = str.maketrans("ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç",
                           "AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc")
    limpo = (texto or "").translate(trocas)
    limpo = re.sub(r"[^A-Za-z0-9 .-]", "", limpo).strip().upper()
    return limpo[:limite]


def crc16(payload: str) -> str:
    """CRC-16/CCITT-FALSE, exigido pelo padrão."""
    resto = 0xFFFF
    for byte in payload.encode("utf-8"):
        resto ^= byte << 8
        for _ in range(8):
            if resto & 0x8000:
                resto = (resto << 1) ^ 0x1021
            else:
                resto <<= 1
            resto &= 0xFFFF
    return f"{resto:04X}"


def configurado() -> bool:
    return bool(settings.pix_chave.strip())


def gerar_brcode(valor: float, identificador: str = "***") -> str:
    """Monta o BR Code para o valor informado."""
    if not configurado():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Chave PIX não configurada. Preencha PIX_CHAVE no arquivo .env do backend.",
        )
    if valor <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor deve ser maior que zero")

    conta = _campo("00", GUI_PIX) + _campo("01", settings.pix_chave.strip())

    payload = (
        _campo(PAYLOAD_FORMATO, "01")
        + _campo(MERCHANT_ACCOUNT, conta)
        + _campo(CATEGORIA, "0000")
        + _campo(MOEDA, "986")  # BRL
        + _campo(VALOR, f"{valor:.2f}")
        + _campo(PAIS, "BR")
        + _campo(BENEFICIARIO, _sanitizar(settings.pix_beneficiario or "CANTINA", 25))
        + _campo(CIDADE, _sanitizar(settings.pix_cidade or "CIDADE", 15))
        + _campo(ADICIONAL, _campo("05", _sanitizar(identificador, 25) or "***"))
    )

    parcial = payload + CRC + "04"
    return parcial + crc16(parcial)
