"""Validacao de CPF e CNPJ pelos digitos verificadores.

Usado na venda (CPF/CNPJ na nota) e no cadastro de parceiros, para nao aceitar
documento digitado errado.
"""

import re

REPETIDOS = {d * 11 for d in "0123456789"} | {d * 14 for d in "0123456789"}


def so_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def _digito(base: str, pesos: list[int]) -> str:
    soma = sum(int(d) * p for d, p in zip(base, pesos))
    resto = soma % 11
    return "0" if resto < 2 else str(11 - resto)


def cpf_valido(documento: str) -> bool:
    cpf = so_digitos(documento)
    if len(cpf) != 11 or cpf in REPETIDOS:
        return False
    primeiro = _digito(cpf[:9], list(range(10, 1, -1)))
    segundo = _digito(cpf[:9] + primeiro, list(range(11, 1, -1)))
    return cpf[9:] == primeiro + segundo


def cnpj_valido(documento: str) -> bool:
    cnpj = so_digitos(documento)
    if len(cnpj) != 14 or cnpj in REPETIDOS:
        return False
    pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    primeiro = _digito(cnpj[:12], pesos)
    segundo = _digito(cnpj[:12] + primeiro, [6] + pesos)
    return cnpj[12:] == primeiro + segundo


def validar(documento: str | None) -> str | None:
    """Normaliza para digitos e valida. Devolve `None` para entrada vazia.

    Levanta `ValueError` com uma mensagem pronta para o usuario final.
    """
    limpo = so_digitos(documento)
    if not limpo:
        return None
    if len(limpo) == 11:
        if not cpf_valido(limpo):
            raise ValueError("CPF invalido")
    elif len(limpo) == 14:
        if not cnpj_valido(limpo):
            raise ValueError("CNPJ invalido")
    else:
        raise ValueError("Documento deve ter 11 digitos (CPF) ou 14 (CNPJ)")
    return limpo
