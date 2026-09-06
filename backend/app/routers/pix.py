"""Cobrança PIX do PDV e a conta que recebe.

O QR é estático com valor: serve para o cliente pagar o valor exato da venda.
Quem confirma o recebimento é o operador, olhando o app do banco.
"""

from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.deps import DB, CurrentUser, SomenteAdmin
from app.services import configuracao
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


class ContaIn(BaseModel):
    chave: str
    beneficiario: str = ""
    cidade: str = ""


class ContaOut(BaseModel):
    configurado: bool
    chave: str
    beneficiario: str
    cidade: str
    tipo_chave: str | None = None


def _conta(db: DB) -> ContaOut:
    dados = servico.dados(db)
    tipo = None
    if dados["chave"]:
        try:
            _, tipo = servico.validar_chave(dados["chave"])
        except ValueError:
            tipo = "Chave inválida"
    return ContaOut(configurado=bool(dados["chave"]), tipo_chave=tipo, **dados)


@router.get("/config", response_model=ContaOut)
def config(db: DB, _: CurrentUser):
    """A conta que recebe os PIX. O PDV usa para saber se pode oferecer o QR."""
    return _conta(db)


@router.put("/config", response_model=ContaOut)
def salvar_config(dados: ContaIn, db: DB, gestor: SomenteAdmin):
    """Troca a conta que recebe. Restrito à gerência: é para onde vai o dinheiro."""
    try:
        chave, _ = servico.validar_chave(dados.chave)
    except ValueError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

    configuracao.gravar(db, configuracao.PIX_CHAVE, chave, gestor.id)
    configuracao.gravar(db, configuracao.PIX_BENEFICIARIO, dados.beneficiario.strip(), gestor.id)
    configuracao.gravar(db, configuracao.PIX_CIDADE, dados.cidade.strip(), gestor.id)
    db.commit()
    return _conta(db)


@router.post("/cobranca", response_model=CobrancaOut)
def cobranca(dados: CobrancaIn, db: DB, _: CurrentUser):
    conta = servico.dados(db)
    return CobrancaOut(
        brcode=servico.gerar_brcode(db, float(dados.valor), dados.identificador),
        valor=dados.valor,
        beneficiario=conta["beneficiario"],
        chave=conta["chave"],
    )
