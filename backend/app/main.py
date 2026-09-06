import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import models
from app.core.config import settings
from app.core.limite import LimitadorDeRequisicoes
from app.core import migracoes
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.routers import (
    auth,
    caixa,
    compras,
    configuracoes,
    estoque,
    financeiro,
    funcionarios,
    integracoes,
    parceiros,
    pix,
    publico,
    relatorios,
    vendas,
)


def criar_admin_inicial() -> None:
    """Garante um usuário administrador no primeiro boot.

    Sem `ADMIN_PASSWORD` definido, a senha é sorteada e aparece uma única vez
    no log. É melhor procurá-la no `journalctl` do que ter todo mundo que já
    leu o repositório sabendo a senha do administrador.
    """
    with SessionLocal() as db:
        if db.scalar(select(models.Usuario).limit(1)):
            return

        senha = settings.admin_password.strip() or secrets.token_urlsafe(12)
        db.add(
            models.Usuario(
                nome=settings.admin_nome,
                usuario=settings.admin_usuario.lower(),
                senha_hash=hash_password(senha),
                perfil=models.Perfil.ADMIN,
            )
        )
        db.commit()
        print(f"[setup] Usuário admin criado: {settings.admin_usuario}")
        if not settings.admin_password.strip():
            print(f"[setup] Senha sorteada desta instalação: {senha}")
            print("[setup] Anote agora e troque no primeiro acesso (Funcionários).")


def criar_caixa_inicial() -> None:
    """Sem nenhum caixa cadastrado não existe venda; garantimos o primeiro."""
    with SessionLocal() as db:
        if db.scalar(select(models.Caixa).limit(1)):
            return
        db.add(models.Caixa(nome="Caixa 1", descricao="Caixa principal"))
        db.commit()
        print("[setup] Caixa 1 criado")


@asynccontextmanager
async def lifespan(_: FastAPI):
    migracoes.aplicar()
    criar_admin_inicial()
    criar_caixa_inicial()
    yield


app = FastAPI(
    title=settings.app_name,
    description="API do sistema de gestão da cantina (PDV, estoque, financeiro, relatórios).",
    version="1.0.0",
    lifespan=lifespan,
    # A documentação interativa lista cada rota e cada campo -- é mapa para
    # quem estuda o alvo. Fica só onde se desenvolve.
    docs_url="/docs" if settings.docs_abertas else None,
    redoc_url="/redoc" if settings.docs_abertas else None,
    openapi_url="/openapi.json" if settings.docs_abertas else None,
)

# Antes do CORS, para que a recusa por excesso não gaste nada além do contador.
app.add_middleware(LimitadorDeRequisicoes)

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
    caixa,
    financeiro,
    compras,
    configuracoes,
    relatorios,
    pix,
    publico,
    integracoes,
):
    app.include_router(modulo.router)


@app.get("/api/health", tags=["infra"])
def health():
    return {"status": "ok", "app": settings.app_name}
