from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.core.deps import DB, CurrentUser
from app.core.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenOut)
def login(dados: schemas.LoginIn, db: DB):
    usuario = db.scalar(
        select(models.Usuario).where(models.Usuario.email == dados.email.lower().strip())
    )
    if not usuario or not verify_password(dados.senha, usuario.senha_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha invalidos")
    if not usuario.ativo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario inativo")

    token = create_access_token(str(usuario.id), {"perfil": usuario.perfil.value})
    return schemas.TokenOut(
        access_token=token, usuario=schemas.UsuarioOut.model_validate(usuario)
    )


@router.get("/me", response_model=schemas.UsuarioOut)
def me(usuario: CurrentUser):
    return usuario
