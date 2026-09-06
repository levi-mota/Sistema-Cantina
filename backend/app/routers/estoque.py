"""Estoque: categorias, produtos e movimentações (kardex)."""

import base64
import binascii
import re
import unicodedata
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app import models, schemas
from app.core import tempo
from app.core.deps import DB, CurrentUser, SomenteAdmin
from app.services import estoque as servico

router = APIRouter(prefix="/api/estoque", tags=["estoque"])


def _produto_out(p: models.Produto) -> schemas.ProdutoOut:
    custo = Decimal(str(p.preco_custo or 0))
    venda = Decimal(str(p.preco_venda or 0))
    margem = (venda - custo) / custo * 100 if custo > 0 else None
    return schemas.ProdutoOut(
        id=p.id,
        codigo=p.codigo,
        nome=p.nome,
        tipo=p.tipo,
        descricao=p.descricao,
        categoria_id=p.categoria_id,
        fornecedor_id=p.fornecedor_id,
        unidade=p.unidade,
        preco_custo=custo,
        preco_venda=venda,
        estoque_atual=Decimal(str(p.estoque_atual or 0)),
        estoque_minimo=Decimal(str(p.estoque_minimo or 0)),
        ativo=p.ativo,
        categoria_nome=p.categoria.nome if p.categoria else None,
        fornecedor_nome=p.fornecedor.nome if p.fornecedor else None,
        margem=round(margem, 2) if margem is not None else None,
        abaixo_minimo=Decimal(str(p.estoque_atual or 0)) <= Decimal(str(p.estoque_minimo or 0)),
        tem_foto=p.imagem_tipo is not None,
    )


# --------------------------------------------------------------------------- #
# Categorias
# --------------------------------------------------------------------------- #
@router.get("/categorias", response_model=list[schemas.CategoriaOut])
def listar_categorias(db: DB, _: CurrentUser):
    return db.scalars(select(models.Categoria).order_by(models.Categoria.nome)).all()


@router.post(
    "/categorias", response_model=schemas.CategoriaOut, status_code=status.HTTP_201_CREATED
)
def criar_categoria(dados: schemas.CategoriaIn, db: DB, _: SomenteAdmin):
    if db.scalar(select(models.Categoria).where(models.Categoria.nome == dados.nome)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Categoria já existe")
    categoria = models.Categoria(**dados.model_dump())
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return categoria


@router.delete("/categorias/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_categoria(categoria_id: int, db: DB, _: SomenteAdmin):
    categoria = db.get(models.Categoria, categoria_id)
    if not categoria:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria não encontrada")
    em_uso = db.scalar(
        select(func.count(models.Produto.id)).where(models.Produto.categoria_id == categoria_id)
    )
    if em_uso:
        # Dizer quantos poupa a busca: quem apaga quer saber o tamanho do estrago.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Categoria em uso por {em_uso} produto(s). Mova-os antes de apagar.",
        )
    db.delete(categoria)
    db.commit()


# --------------------------------------------------------------------------- #
# Produtos
# --------------------------------------------------------------------------- #
@router.get("/produtos", response_model=list[schemas.ProdutoOut])
def listar_produtos(
    db: DB,
    _: CurrentUser,
    busca: str | None = None,
    categoria_id: int | None = None,
    tipo: models.TipoProduto | None = None,
    ativo: bool | None = None,
    somente_criticos: bool = False,
    limite: int = 500,
):
    stmt = select(models.Produto)
    if busca:
        alvo = f"%{busca}%"
        stmt = stmt.where(
            or_(models.Produto.nome.ilike(alvo), models.Produto.codigo.ilike(alvo))
        )
    if categoria_id:
        stmt = stmt.where(models.Produto.categoria_id == categoria_id)
    if tipo:
        stmt = stmt.where(models.Produto.tipo == tipo)
    if ativo is not None:
        stmt = stmt.where(models.Produto.ativo.is_(ativo))
    if somente_criticos:
        stmt = stmt.where(models.Produto.estoque_atual <= models.Produto.estoque_minimo)
    produtos = db.scalars(stmt.order_by(models.Produto.nome).limit(limite)).all()
    return [_produto_out(p) for p in produtos]


def exigir_codigo_livre(db, codigo: str | None, ignorar_id: int | None = None) -> None:
    """O código de barras aponta para um produto só.

    Repetido, o PDV leria o código e traria o item errado. Produto sem código é
    normal -- muita coisa da cantina não tem etiqueta -- e pode se repetir.
    """
    if not codigo:
        return
    stmt = select(models.Produto).where(models.Produto.codigo == codigo)
    if ignorar_id is not None:
        stmt = stmt.where(models.Produto.id != ignorar_id)
    existente = db.scalar(stmt)
    if existente:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Código já cadastrado para '{existente.nome}'",
        )


def prefixo_da_categoria(nome: str) -> str:
    """"Salgados" -> "SAL". Três letras, sem acento, em maiúsculas.

    É o que os códigos já existentes usam (SAL001, BEB005), então a numeração
    nova continua a antiga em vez de começar um padrão paralelo.
    """
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    letras = re.sub(r"[^A-Za-z]", "", sem_acento).upper()
    return letras[:3] or "PRO"


def gerar_codigo(db, categoria: models.Categoria) -> str:
    """Próximo código livre da categoria: SAL001, SAL002...

    Nem todo produto tem código de barras, mas todo produto precisa de um código
    interno -- é por ele que se acha o item no PDV e na conferência. Quando o
    campo fica vazio, o sistema numera sozinho.
    """
    prefixo = prefixo_da_categoria(categoria.nome)
    usados = db.scalars(
        select(models.Produto.codigo).where(models.Produto.codigo.like(f"{prefixo}%"))
    ).all()

    maior = 0
    for codigo in usados:
        achado = re.fullmatch(rf"{prefixo}(\d+)", codigo or "")
        if achado:
            maior = max(maior, int(achado.group(1)))

    # O laço cobre o caso raro de alguém ter digitado à mão um código que
    # colidiria com o próximo da sequência.
    proximo = maior + 1
    while True:
        candidato = f"{prefixo}{proximo:03d}"
        if not db.scalar(select(models.Produto).where(models.Produto.codigo == candidato)):
            return candidato
        proximo += 1


def exigir_categoria(db, categoria_id: int | None) -> models.Categoria:
    """A categoria é obrigatória: é dela que sai o código interno do produto."""
    if not categoria_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha a categoria do produto")
    categoria = db.get(models.Categoria, categoria_id)
    if not categoria:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria não encontrada")
    return categoria


@router.post(
    "/produtos", response_model=schemas.ProdutoOut, status_code=status.HTTP_201_CREATED
)
def criar_produto(dados: schemas.ProdutoCreate, db: DB, usuario: SomenteAdmin):
    payload = dados.model_dump()
    estoque_inicial = Decimal(str(payload.pop("estoque_inicial", 0) or 0))

    categoria = exigir_categoria(db, payload.get("categoria_id"))
    payload["codigo"] = (payload.get("codigo") or "").strip() or None
    exigir_codigo_livre(db, payload["codigo"])
    if not payload["codigo"]:
        payload["codigo"] = gerar_codigo(db, categoria)

    produto = models.Produto(**payload)
    db.add(produto)
    db.flush()

    if estoque_inicial > 0:
        servico.movimentar(
            db,
            produto=produto,
            tipo=models.TipoMovimento.ENTRADA,
            quantidade=estoque_inicial,
            custo_unitario=produto.preco_custo,
            motivo="Estoque inicial",
            usuario_id=usuario.id,
        )
    db.commit()
    db.refresh(produto)
    return _produto_out(produto)


@router.get("/produtos/{produto_id}", response_model=schemas.ProdutoOut)
def obter_produto(produto_id: int, db: DB, _: CurrentUser):
    produto = db.get(models.Produto, produto_id)
    if not produto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")
    return _produto_out(produto)


@router.put("/produtos/{produto_id}", response_model=schemas.ProdutoOut)
def atualizar_produto(produto_id: int, dados: schemas.ProdutoUpdate, db: DB, _: SomenteAdmin):
    produto = db.get(models.Produto, produto_id)
    if not produto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")
    campos = dados.model_dump(exclude_unset=True)

    # Vale o estado final: a categoria pode vir do corpo ou já estar no cadastro.
    categoria = exigir_categoria(db, campos.get("categoria_id", produto.categoria_id))

    if "codigo" in campos:
        campos["codigo"] = (campos["codigo"] or "").strip() or None
        exigir_codigo_livre(db, campos["codigo"], ignorar_id=produto.id)

    for campo, valor in campos.items():
        setattr(produto, campo, valor)

    # Apagar o código não deixa o produto sem código: gera outro pela categoria.
    if not produto.codigo:
        produto.codigo = gerar_codigo(db, categoria)
    db.commit()
    db.refresh(produto)
    return _produto_out(produto)


# A tela manda a imagem ja reduzida, como data URI. Reduzir no navegador evita
# uma biblioteca de imagem no servidor -- e o teto abaixo e a garantia de que a
# reducao aconteceu mesmo.
LIMITE_FOTO = 400_000
TIPOS_FOTO = {"image/webp", "image/jpeg", "image/png"}


class FotoIn(BaseModel):
    """`data:image/webp;base64,...`"""

    imagem: str


@router.put("/produtos/{produto_id}/foto", status_code=status.HTTP_204_NO_CONTENT)
def salvar_foto(produto_id: int, dados: FotoIn, db: DB, _: SomenteAdmin):
    produto = db.get(models.Produto, produto_id)
    if not produto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")

    casou = re.fullmatch(r"data:([\w/+.-]+);base64,(.+)", dados.imagem.strip(), re.S)
    if not casou:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagem em formato inesperado")

    tipo, conteudo = casou.group(1), casou.group(2)
    if tipo not in TIPOS_FOTO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Use uma imagem WEBP, JPEG ou PNG"
        )
    try:
        bruto = base64.b64decode(conteudo, validate=True)
    except (ValueError, binascii.Error) as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagem inválida") from erro
    if len(bruto) > LIMITE_FOTO:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Imagem muito grande depois de reduzida"
        )

    produto.imagem = bruto
    produto.imagem_tipo = tipo
    db.commit()


@router.delete("/produtos/{produto_id}/foto", status_code=status.HTTP_204_NO_CONTENT)
def remover_foto(produto_id: int, db: DB, _: SomenteAdmin):
    produto = db.get(models.Produto, produto_id)
    if not produto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")
    produto.imagem = None
    produto.imagem_tipo = None
    db.commit()


@router.delete("/produtos/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_produto(produto_id: int, db: DB, _: SomenteAdmin):
    produto = db.get(models.Produto, produto_id)
    if not produto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")
    produto.ativo = False
    db.commit()


# --------------------------------------------------------------------------- #
# Movimentacoes
# --------------------------------------------------------------------------- #
@router.get("/movimentos", response_model=list[schemas.MovimentoOut])
def listar_movimentos(
    db: DB,
    _: CurrentUser,
    produto_id: int | None = None,
    tipo: models.TipoMovimento | None = None,
    limite: int = 200,
):
    stmt = select(models.MovimentoEstoque)
    if produto_id:
        stmt = stmt.where(models.MovimentoEstoque.produto_id == produto_id)
    if tipo:
        stmt = stmt.where(models.MovimentoEstoque.tipo == tipo)
    movimentos = db.scalars(
        stmt.order_by(models.MovimentoEstoque.id.desc()).limit(limite)
    ).all()
    return [
        schemas.MovimentoOut(
            id=m.id,
            produto_id=m.produto_id,
            produto_nome=m.produto.nome if m.produto else None,
            tipo=m.tipo,
            quantidade=Decimal(str(m.quantidade)),
            saldo_apos=Decimal(str(m.saldo_apos)),
            custo_unitario=Decimal(str(m.custo_unitario)) if m.custo_unitario else None,
            motivo=m.motivo,
            venda_id=m.venda_id,
            usuario_id=m.usuario_id,
            criado_em=m.criado_em,
        )
        for m in movimentos
    ]


@router.post("/movimentos", response_model=schemas.ProdutoOut, status_code=201)
def registrar_movimento(dados: schemas.MovimentoIn, db: DB, usuario: SomenteAdmin):
    """Entrada, saída, perda ou ajuste de inventário.

    Uma entrada de compra pode gerar automaticamente a conta a pagar do
    fornecedor (integração estoque -> financeiro).
    """
    produto = db.get(models.Produto, dados.produto_id)
    if not produto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado")

    servico.movimentar(
        db,
        produto=produto,
        tipo=dados.tipo,
        quantidade=dados.quantidade,
        custo_unitario=dados.custo_unitario,
        motivo=dados.motivo,
        usuario_id=usuario.id,
    )

    if dados.gerar_conta_pagar and dados.tipo == models.TipoMovimento.ENTRADA:
        if not dados.custo_unitario:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Informe o custo unitário para gerar a conta a pagar",
            )
        total = Decimal(str(dados.custo_unitario)) * Decimal(str(dados.quantidade))
        db.add(
            models.Titulo(
                tipo=models.TipoTitulo.PAGAR,
                descricao=f"Compra de {dados.quantidade} x {produto.nome}",
                categoria="Mercadorias",
                parceiro_id=dados.fornecedor_id or produto.fornecedor_id,
                valor=total,
                vencimento=dados.vencimento or (tempo.hoje() + timedelta(days=30)),
                observacao=dados.motivo,
            )
        )

    db.commit()
    db.refresh(produto)
    return _produto_out(produto)
