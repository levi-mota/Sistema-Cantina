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
    caixa,
    estoque,
    financeiro,
    funcionarios,
    integracoes,
    parceiros,
    relatorios,
    vendas,
)


def migrar_colunas_novas() -> None:
    """Adiciona colunas novas a bancos criados por versoes anteriores.

    `create_all` cria tabelas que faltam, mas nao altera as existentes; para um
    projeto com SQLite este empurrao simples evita ter que apagar o banco.
    """
    with engine.begin() as conexao:

        def colunas(tabela: str) -> set[str]:
            linhas = conexao.exec_driver_sql(f"PRAGMA table_info({tabela})").fetchall()
            return {linha[1] for linha in linhas}

        vendas = colunas("vendas")
        if vendas and "caixa_sessao_id" not in vendas:
            conexao.exec_driver_sql("ALTER TABLE vendas ADD COLUMN caixa_sessao_id INTEGER")
            print("[setup] Coluna vendas.caixa_sessao_id adicionada")
        if vendas and "documento_cliente" not in vendas:
            conexao.exec_driver_sql("ALTER TABLE vendas ADD COLUMN documento_cliente VARCHAR(14)")
            print("[setup] Coluna vendas.documento_cliente adicionada")

        # Sessoes passaram a pertencer a um caixa. Turnos antigos vao para o
        # primeiro caixa cadastrado, criado aqui se ainda nao existir.
        sessoes = colunas("caixa_sessoes")
        if sessoes and "caixa_id" not in sessoes:
            existe = conexao.exec_driver_sql("SELECT id FROM caixas ORDER BY id LIMIT 1").fetchone()
            if existe:
                padrao = existe[0]
            else:
                conexao.exec_driver_sql(
                    "INSERT INTO caixas (nome, descricao, ativo, criado_em)"
                    " VALUES ('Caixa 1', 'Caixa principal', 1, CURRENT_TIMESTAMP)"
                )
                padrao = conexao.exec_driver_sql("SELECT last_insert_rowid()").fetchone()[0]
            conexao.exec_driver_sql(
                f"ALTER TABLE caixa_sessoes ADD COLUMN caixa_id INTEGER NOT NULL DEFAULT {padrao}"
            )
            print(f"[setup] Coluna caixa_sessoes.caixa_id adicionada (caixa padrao {padrao})")


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


def criar_caixa_inicial() -> None:
    """Sem nenhum caixa cadastrado nao existe venda; garantimos o primeiro."""
    with SessionLocal() as db:
        if db.scalar(select(models.Caixa).limit(1)):
            return
        db.add(models.Caixa(nome="Caixa 1", descricao="Caixa principal"))
        db.commit()
        print("[setup] Caixa 1 criado")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrar_colunas_novas()
    criar_admin_inicial()
    criar_caixa_inicial()
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
    caixa,
    financeiro,
    relatorios,
    integracoes,
):
    app.include_router(modulo.router)


@app.get("/api/health", tags=["infra"])
def health():
    return {"status": "ok", "app": settings.app_name}
