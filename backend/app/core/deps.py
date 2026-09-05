from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.core.database import get_db
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB, token: Annotated[str | None, Depends(oauth2_scheme)]
) -> models.Usuario:
    credenciais_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nao autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credenciais_invalidas
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        raise credenciais_invalidas
    usuario = db.get(models.Usuario, int(payload["sub"]))
    if not usuario or not usuario.ativo:
        raise credenciais_invalidas
    return usuario


CurrentUser = Annotated[models.Usuario, Depends(get_current_user)]


def require_perfis(*perfis: models.Perfil):
    """Dependencia de autorizacao por perfil."""

    def _checker(usuario: CurrentUser) -> models.Usuario:
        if usuario.perfil not in perfis:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Voce nao tem permissao para esta operacao",
            )
        return usuario

    return _checker


AdminOnly = Annotated[models.Usuario, Depends(require_perfis(models.Perfil.ADMIN))]
Gestao = Annotated[
    models.Usuario,
    Depends(require_perfis(models.Perfil.ADMIN, models.Perfil.GERENTE)),
]
