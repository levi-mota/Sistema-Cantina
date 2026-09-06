"""Cardápio virtual: a única parte do sistema que responde sem login.

É uma vitrine. Mostra o que a cantina tem hoje, por quanto, e quanto ainda há
em estoque -- nada além disso. Não existe rota aqui que escreva, e nenhuma que
alcance venda, caixa, cliente ou funcionário: quem chega por este caminho vê o
balcão, e o balcão é público de qualquer forma.

Por ser aberto ao mundo, tudo que sai daqui é escolhido campo a campo, em vez
de devolver o cadastro inteiro do produto -- custo, fornecedor e margem ficam
do lado de dentro.
"""

from decimal import Decimal

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import undefer
from pydantic import BaseModel

from app import models
from app.core.deps import DB

router = APIRouter(prefix="/api/publico", tags=["cardapio"])

# A foto muda pouco e pesa; deixar o navegador guardar por uma hora poupa a
# banda da instância gratuita num intervalo cheio de gente olhando o cardápio.
CACHE_FOTO = "public, max-age=3600"
CACHE_CARDAPIO = "public, max-age=60"


class ItemCardapio(BaseModel):
    id: int
    nome: str
    descricao: str | None
    categoria: str | None
    unidade: str
    preco: Decimal
    disponivel: int
    esgotado: bool
    tem_foto: bool


class Cardapio(BaseModel):
    cantina: str
    itens: list[ItemCardapio]


@router.get("/cardapio", response_model=Cardapio)
def cardapio(db: DB, resposta: Response):
    """O que está à venda no balcão agora."""
    resposta.headers["Cache-Control"] = CACHE_CARDAPIO

    produtos = db.scalars(
        select(models.Produto)
        .where(
            models.Produto.ativo.is_(True),
            models.Produto.tipo == models.TipoProduto.FINAL,
        )
        .order_by(models.Produto.nome)
    ).all()

    return Cardapio(
        cantina="Maanaim Cantina",
        itens=[
            ItemCardapio(
                id=p.id,
                nome=p.nome,
                descricao=p.descricao,
                categoria=p.categoria.nome if p.categoria else None,
                unidade=p.unidade,
                preco=Decimal(str(p.preco_venda or 0)),
                # Fração de unidade não se vende no balcão: 2.5 pães viram 2.
                disponivel=max(int(float(p.estoque_atual or 0)), 0),
                esgotado=float(p.estoque_atual or 0) <= 0,
                tem_foto=p.imagem_tipo is not None,
            )
            for p in produtos
        ],
    )


@router.get("/produtos/{produto_id}/foto")
def foto(produto_id: int, db: DB):
    """A imagem em si. Só de produto ativo e à venda -- como o cardápio."""
    produto = db.scalar(
        select(models.Produto)
        .options(undefer(models.Produto.imagem))
        .where(
            models.Produto.id == produto_id,
            models.Produto.ativo.is_(True),
            models.Produto.tipo == models.TipoProduto.FINAL,
        )
    )
    if not produto or not produto.imagem:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem foto")

    return Response(
        content=produto.imagem,
        media_type=produto.imagem_tipo or "image/webp",
        headers={"Cache-Control": CACHE_FOTO},
    )
