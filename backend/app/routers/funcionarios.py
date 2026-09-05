"""Cadastro de funcionarios e perfis de acesso. Restrito a administradores."""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select

from app import models, schemas
from app.core.deps import DB, SomenteAdmin, exigir_admin
from app.core.security import hash_password

router = APIRouter(
    prefix="/api/funcionarios",
    tags=["funcionarios"],
    dependencies=[Depends(exigir_admin)],
)


def normalizar_login(bruto: str) -> str:
    """Login e sempre minusculo e sem espacos: "Levi Mota" -> "levi.mota"."""
    login = re.sub(r"\s+", ".", (bruto or "").strip().lower())
    login = re.sub(r"[^a-z0-9._-]", "", login)
    if len(login) < 2:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Login invalido: use letras, numeros, ponto, hifen ou sublinhado",
        )
    return login


@router.get("", response_model=list[schemas.UsuarioOut])
def listar(
    db: DB,
    _: SomenteAdmin,
    busca: str | None = None,
    ativo: bool | None = None,
):
    stmt = select(models.Usuario)
    if busca:
        alvo = f"%{busca}%"
        stmt = stmt.where(
            or_(models.Usuario.nome.ilike(alvo), models.Usuario.usuario.ilike(alvo))
        )
    if ativo is not None:
        stmt = stmt.where(models.Usuario.ativo.is_(ativo))
    return db.scalars(stmt.order_by(models.Usuario.nome)).all()


@router.post("", response_model=schemas.UsuarioOut, status_code=status.HTTP_201_CREATED)
def criar(dados: schemas.UsuarioCreate, db: DB, _: SomenteAdmin):
    login = normalizar_login(dados.usuario)
    if db.scalar(select(models.Usuario).where(models.Usuario.usuario == login)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"O login '{login}' ja esta em uso")

    payload = dados.model_dump(exclude={"senha", "usuario"})
    usuario = models.Usuario(**payload, usuario=login, senha_hash=hash_password(dados.senha))
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.get("/{usuario_id}", response_model=schemas.UsuarioOut)
def obter(usuario_id: int, db: DB, _: SomenteAdmin):
    usuario = db.get(models.Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionario nao encontrado")
    return usuario


@router.put("/{usuario_id}", response_model=schemas.UsuarioOut)
def atualizar(usuario_id: int, dados: schemas.UsuarioUpdate, db: DB, _: SomenteAdmin):
    usuario = db.get(models.Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionario nao encontrado")

    campos = dados.model_dump(exclude_unset=True)
    if senha := campos.pop("senha", None):
        usuario.senha_hash = hash_password(senha)
    if login := campos.pop("usuario", None):
        login = normalizar_login(login)
        existente = db.scalar(select(models.Usuario).where(models.Usuario.usuario == login))
        if existente and existente.id != usuario.id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"O login '{login}' ja esta em uso")
        usuario.usuario = login

    for campo, valor in campos.items():
        setattr(usuario, campo, valor)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar(usuario_id: int, db: DB, gestor: SomenteAdmin):
    usuario = db.get(models.Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionario nao encontrado")
    if usuario.id == gestor.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Voce nao pode desativar a si mesmo")
    usuario.ativo = False
    db.commit()
