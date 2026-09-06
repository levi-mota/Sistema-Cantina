"""Ajustes que a gerência muda pela tela.

O PIX tem rota própria (`/api/pix/config`), por causa da validação da chave.
Aqui fica o recibo: o que sai impresso na bobina de 58 mm.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.deps import DB, CurrentUser, SomenteAdmin
from app.services import configuracao

router = APIRouter(prefix="/api/configuracoes", tags=["configuracoes"])

# Vazio de proposito: com a logo ligada, o nome ja esta no papel. O campo serve
# para o que a logo nao diz -- CNPJ, endereco, telefone.
CABECALHO_PADRAO = ""
RODAPE_PADRAO = "Apresente este recibo\npara retirar a mercadoria"


class ReciboIn(BaseModel):
    """A logo é a da marca, já preparada para a térmica; aqui só se liga ou não."""

    mostrar_logo: bool = True
    cabecalho: str = Field(default=CABECALHO_PADRAO, max_length=400)
    rodape: str = Field(default=RODAPE_PADRAO, max_length=400)
    mostrar_atendente: bool = True


class ReciboOut(ReciboIn):
    pass


def _recibo(db: DB) -> ReciboOut:
    return ReciboOut(
        # Ausente no banco é o padrão ligado; só "0" desliga.
        mostrar_logo=configuracao.ler(db, configuracao.RECIBO_LOGO, "1") != "0",
        cabecalho=configuracao.ler(db, configuracao.RECIBO_CABECALHO, CABECALHO_PADRAO),
        rodape=configuracao.ler(db, configuracao.RECIBO_RODAPE, RODAPE_PADRAO),
        mostrar_atendente=configuracao.ler(db, configuracao.RECIBO_ATENDENTE, "1") != "0",
    )


@router.get("/recibo", response_model=ReciboOut)
def obter_recibo(db: DB, _: CurrentUser):
    """Qualquer operador lê: é o PDV que monta o papel na hora de imprimir."""
    return _recibo(db)


@router.put("/recibo", response_model=ReciboOut)
def salvar_recibo(dados: ReciboIn, db: DB, gestor: SomenteAdmin):
    # Sem logo e sem cabeçalho não é erro: o recibo imprime o nome da casa.
    configuracao.gravar(
        db, configuracao.RECIBO_LOGO, "1" if dados.mostrar_logo else "0", gestor.id
    )
    configuracao.gravar(db, configuracao.RECIBO_CABECALHO, dados.cabecalho.strip(), gestor.id)
    configuracao.gravar(db, configuracao.RECIBO_RODAPE, dados.rodape.strip(), gestor.id)
    configuracao.gravar(
        db, configuracao.RECIBO_ATENDENTE, "1" if dados.mostrar_atendente else "0", gestor.id
    )
    db.commit()
    return _recibo(db)
