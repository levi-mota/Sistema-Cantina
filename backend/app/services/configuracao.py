"""Ajustes guardados no banco, com o .env como valor inicial.

O gerente troca a conta que recebe os PIX pela tela; o arquivo do servidor
continua servindo de padrão para a primeira instalação.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models

PIX_CHAVE = "pix_chave"
PIX_BENEFICIARIO = "pix_beneficiario"
PIX_CIDADE = "pix_cidade"

RECIBO_LOGO = "recibo_logo"
RECIBO_CABECALHO = "recibo_cabecalho"
RECIBO_RODAPE = "recibo_rodape"
RECIBO_ATENDENTE = "recibo_atendente"


def ler(db: Session, chave: str, padrao: str = "") -> str:
    registro = db.get(models.Configuracao, chave)
    return (registro.valor if registro else "") or padrao


def gravar(db: Session, chave: str, valor: str, usuario_id: int | None = None) -> None:
    registro = db.get(models.Configuracao, chave)
    if registro:
        registro.valor = valor
        registro.usuario_id = usuario_id
    else:
        db.add(models.Configuracao(chave=chave, valor=valor, usuario_id=usuario_id))


def todas(db: Session) -> dict[str, str]:
    return {c.chave: c.valor for c in db.scalars(select(models.Configuracao)).all()}
