from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import models
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.routers import (
    auth,
    estoque,
    financeiro,
    funcionarios,
    integracoes,
    parceiros,
    relatorios,
    vendas,
)


def criar_admin_inicial() -> None:
    """Garante um usuario administrador no primeiro boot."""
    with SessionLocal() as db:
        if db.scalar(select(models.Usuario).limit(1)):
            return
        db.add(
            models.Usuario(
                nome=settings.admin_nome,
                email=settings.admin_email.lower(),
                senha_hash=hash_password(settings.admin_password),
                perfil=models.Perfil.ADMIN,
                cargo="Administrador",
            )
        )
        db.commit()
        print(f"[setup] Usuario admin criado: {settings.admin_email}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    criar_admin_inicial()
    yield


app = FastAPI(
    title=settings.app_name,
    description="API do sistema de gestao da cantina (PDV, estoque, financeiro, relatorios).",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for modulo in (
    auth,
    funcionarios,
    parceiros,
    estoque,
    vendas,
    financeiro,
    relatorios,
    integracoes,
):
    app.include_router(modulo.router)


@app.get("/api/health", tags=["infra"])
def health():
    return {"status": "ok", "app": settings.app_name}
