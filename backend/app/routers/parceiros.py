"""Cadastro unico de clientes e fornecedores."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app import models, schemas
from app.core.deps import DB, CurrentUser
from app.services.integracoes import so_digitos

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


@router.post("", response_model=schemas.ParceiroOut, status_code=status.HTTP_201_CREATED)
def criar(dados: schemas.ParceiroCreate, db: DB, _: CurrentUser):
    payload = dados.model_dump()
    payload["documento"] = so_digitos(payload.get("documento") or "") or None

    if payload["documento"]:
        existente = db.scalar(
            select(models.Parceiro).where(models.Parceiro.documento == payload["documento"])
        )
        if existente:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Documento ja cadastrado para '{existente.nome}'",
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parceiro nao encontrado")
    return parceiro


@router.put("/{parceiro_id}", response_model=schemas.ParceiroOut)
def atualizar(parceiro_id: int, dados: schemas.ParceiroUpdate, db: DB, _: CurrentUser):
    parceiro = db.get(models.Parceiro, parceiro_id)
    if not parceiro:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parceiro nao encontrado")

    campos = dados.model_dump(exclude_unset=True)
    if "documento" in campos:
        campos["documento"] = so_digitos(campos["documento"] or "") or None
    for campo, valor in campos.items():
        setattr(parceiro, campo, valor)
    db.commit()
    db.refresh(parceiro)
    return parceiro


@router.delete("/{parceiro_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar(parceiro_id: int, db: DB, _: CurrentUser):
    parceiro = db.get(models.Parceiro, parceiro_id)
    if not parceiro:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parceiro nao encontrado")
    parceiro.ativo = False
    db.commit()
