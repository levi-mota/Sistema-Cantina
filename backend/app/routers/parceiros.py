"""Cadastro único de clientes e fornecedores."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app import models, schemas
from app.core.deps import DB, CurrentUser, SomenteAdmin
from app.services import documento as servico_documento

router = APIRouter(prefix="/api/parceiros", tags=["parceiros"])


@router.get("", response_model=list[schemas.ParceiroOut])
def listar(
    db: DB,
    _: CurrentUser,
    busca: str | None = None,
    tipo: models.TipoParceiro | None = None,
    ativo: bool | None = None,
    limite: int = 200,
):
    stmt = select(models.Parceiro)
    if busca:
        alvo = f"%{busca}%"
        stmt = stmt.where(
            or_(
                models.Parceiro.nome.ilike(alvo),
                models.Parceiro.nome_fantasia.ilike(alvo),
                models.Parceiro.documento.ilike(alvo),
                models.Parceiro.telefone.ilike(alvo),
            )
        )
    if tipo:
        # "AMBOS" atende tanto a busca por cliente quanto por fornecedor.
        stmt = stmt.where(
            models.Parceiro.tipo.in_([tipo, models.TipoParceiro.AMBOS])
            if tipo != models.TipoParceiro.AMBOS
            else models.Parceiro.tipo == tipo
        )
    if ativo is not None:
        stmt = stmt.where(models.Parceiro.ativo.is_(ativo))
    return db.scalars(stmt.order_by(models.Parceiro.nome).limit(limite)).all()


@router.get("/identificar/{documento}", response_model=schemas.IdentificacaoOut)
def identificar(documento: str, db: DB, _: CurrentUser):
    """Resolve um CPF/CNPJ digitado no PDV.

    Valida os digitos verificadores e diz se o documento já tem cadastro. Uma
    venda pode ser identificada mesmo sem cadastro -- e o caso comum de "CPF na
    nota" -- entao `cadastrado: false` não e erro.
    """
    try:
        limpo = servico_documento.validar(documento)
    except ValueError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro
    if not limpo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe um documento")

    parceiro = db.scalar(select(models.Parceiro).where(models.Parceiro.documento == limpo))
    return schemas.IdentificacaoOut(
        documento=limpo,
        tipo="CPF" if len(limpo) == 11 else "CNPJ",
        cadastrado=parceiro is not None,
        parceiro_id=parceiro.id if parceiro else None,
        nome=parceiro.nome if parceiro else None,
    )


@router.post("", response_model=schemas.ParceiroOut, status_code=status.HTTP_201_CREATED)
def criar(dados: schemas.ParceiroCreate, db: DB, _: SomenteAdmin):
    payload = dados.model_dump()
    try:
        payload["documento"] = servico_documento.validar(payload.get("documento"))
    except ValueError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

    if payload["documento"]:
        existente = db.scalar(
            select(models.Parceiro).where(models.Parceiro.documento == payload["documento"])
        )
        if existente:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Documento já cadastrado para '{existente.nome}'",
            )

    parceiro = models.Parceiro(**payload)
    db.add(parceiro)
    db.commit()
    db.refresh(parceiro)
    return parceiro


@router.get("/{parceiro_id}", response_model=schemas.ParceiroOut)
def obter(parceiro_id: int, db: DB, _: CurrentUser):
    parceiro = db.get(models.Parceiro, parceiro_id)
    if not parceiro:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parceiro não encontrado")
    return parceiro


@router.put("/{parceiro_id}", response_model=schemas.ParceiroOut)
def atualizar(parceiro_id: int, dados: schemas.ParceiroUpdate, db: DB, _: SomenteAdmin):
    parceiro = db.get(models.Parceiro, parceiro_id)
    if not parceiro:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parceiro não encontrado")

    campos = dados.model_dump(exclude_unset=True)
    if "documento" in campos:
        try:
            campos["documento"] = servico_documento.validar(campos["documento"])
        except ValueError as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro
    for campo, valor in campos.items():
        setattr(parceiro, campo, valor)
    db.commit()
    db.refresh(parceiro)
    return parceiro


@router.delete("/{parceiro_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar(parceiro_id: int, db: DB, _: SomenteAdmin):
    parceiro = db.get(models.Parceiro, parceiro_id)
    if not parceiro:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parceiro não encontrado")
    parceiro.ativo = False
    db.commit()
