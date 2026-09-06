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
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import configuracao
from app.services import documento as servico_documento

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


EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.IGNORECASE)
ALEATORIA = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def validar_chave(bruta: str) -> tuple[str, str]:
    """Devolve a chave normalizada e que tipo de chave é ela.

    Uma chave errada só aparece quando o cliente tenta pagar e o app do banco
    recusa o QR -- com a fila esperando. Conferir aqui é mais barato.
    """
    chave = (bruta or "").strip()
    if not chave:
        raise ValueError("Informe a chave PIX")

    if EMAIL.match(chave):
        return chave.lower(), "E-mail"
    if ALEATORIA.match(chave):
        return chave.lower(), "Chave aleatória"

    digitos = re.sub(r"\D", "", chave)
    telefone = chave.startswith("+") or (len(digitos) == 11 and digitos[2] == "9")
    if telefone:
        # O +55 do pais e opcional na digitacao; a chave sempre o leva.
        nacional = digitos[2:] if digitos.startswith("55") and len(digitos) > 11 else digitos
        if len(nacional) not in (10, 11):
            raise ValueError("Telefone deve ter DDD e 8 ou 9 dígitos")
        return f"+55{nacional}", "Telefone"
    if len(digitos) in (11, 14):
        # CPF e CNPJ entram só com os dígitos, e precisam ser válidos.
        return servico_documento.validar(digitos) or "", (
            "CPF" if len(digitos) == 11 else "CNPJ"
        )

    raise ValueError("Chave inválida: use CPF, CNPJ, e-mail, telefone ou chave aleatória")


def dados(db: Session) -> dict[str, str]:
    """A conta que recebe: o que estiver no banco, senão o que veio do .env."""
    return {
        "chave": configuracao.ler(db, configuracao.PIX_CHAVE, settings.pix_chave).strip(),
        "beneficiario": configuracao.ler(
            db, configuracao.PIX_BENEFICIARIO, settings.pix_beneficiario
        ).strip(),
        "cidade": configuracao.ler(db, configuracao.PIX_CIDADE, settings.pix_cidade).strip(),
    }


def configurado(db: Session) -> bool:
    return bool(dados(db)["chave"])


def gerar_brcode(db: Session, valor: float, identificador: str = "***") -> str:
    """Monta o BR Code para o valor informado."""
    conta_pix = dados(db)
    if not conta_pix["chave"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Chave PIX não configurada. Cadastre a chave em Configurações.",
        )
    if valor <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor deve ser maior que zero")

    conta = _campo("00", GUI_PIX) + _campo("01", conta_pix["chave"])

    payload = (
        _campo(PAYLOAD_FORMATO, "01")
        + _campo(MERCHANT_ACCOUNT, conta)
        + _campo(CATEGORIA, "0000")
        + _campo(MOEDA, "986")  # BRL
        + _campo(VALOR, f"{valor:.2f}")
        + _campo(PAIS, "BR")
        + _campo(BENEFICIARIO, _sanitizar(conta_pix["beneficiario"] or "CANTINA", 25))
        + _campo(CIDADE, _sanitizar(conta_pix["cidade"] or "CIDADE", 15))
        + _campo(ADICIONAL, _campo("05", _sanitizar(identificador, 25) or "***"))
    )

    parcial = payload + CRC + "04"
    return parcial + crc16(parcial)
