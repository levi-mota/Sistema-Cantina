"""Aplicacao das migracoes de banco (Alembic) no boot da aplicacao.

Sao tres cenarios, e o codigo escolhe sozinho:

1. Banco novo (nenhuma tabela)      -> aplica todas as migracoes;
2. Banco ja versionado              -> aplica so o que falta;
3. Banco antigo, criado por         -> completa o schema, marca como atual
   `create_all` antes do Alembic       (adocao unica) e segue versionado.

O cenario 3 existe porque as primeiras versoes do projeto criavam as tabelas
direto pelo `create_all`, sem controle de versao. Ele roda uma unica vez.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect, text

from app.core.database import Base, engine

# Import com efeito colateral: sem ele o metadata fica vazio e a adocao de um
# banco legado nao criaria as tabelas que faltam.
import app.models  # noqa: F401  (precisa vir depois de Base)

RAIZ_BACKEND = Path(__file__).resolve().parents[2]
ARQUIVO_INI = RAIZ_BACKEND / "alembic.ini"


def _config() -> Config:
    config = Config(str(ARQUIVO_INI))
    config.set_main_option("script_location", str(RAIZ_BACKEND / "migracoes"))
    return config


def _versionado(conexao) -> bool:
    return MigrationContext.configure(conexao).get_current_revision() is not None


# Colunas que as versoes pre-Alembic nao tinham. `create_all` cria tabelas que
# faltam, mas nunca altera uma tabela existente -- entao estas ficam por conta
# desta ponte, usada uma unica vez na adocao.
COLUNAS_LEGADAS: list[tuple[str, str, str]] = [
    ("vendas", "caixa_sessao_id", "INTEGER"),
    ("vendas", "documento_cliente", "VARCHAR(14)"),
    ("caixa_sessoes", "caixa_id", "INTEGER NOT NULL DEFAULT 1"),
]


def _completar_colunas_legadas(conexao) -> None:
    inspetor = inspect(conexao)
    tabelas = set(inspetor.get_table_names())

    for tabela, coluna, tipo in COLUNAS_LEGADAS:
        if tabela not in tabelas:
            continue
        existentes = {c["name"] for c in inspetor.get_columns(tabela)}
        if coluna in existentes:
            continue
        conexao.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo}"))
        print(f"[banco] Coluna {tabela}.{coluna} adicionada")

    # Turnos antigos precisam de um caixa para apontar (o DEFAULT 1 acima).
    if "caixas" in tabelas:
        tem_caixa = conexao.execute(text("SELECT 1 FROM caixas LIMIT 1")).first()
        if not tem_caixa:
            conexao.execute(
                text(
                    "INSERT INTO caixas (nome, descricao, ativo, criado_em)"
                    " VALUES ('Caixa 1', 'Caixa principal', 1, CURRENT_TIMESTAMP)"
                )
            )


def aplicar() -> None:
    inspetor = inspect(engine)
    tabelas = set(inspetor.get_table_names())
    config = _config()

    if not tabelas:
        command.upgrade(config, "head")
        print("[banco] Banco criado e migracoes aplicadas")
        return

    with engine.connect() as conexao:
        ja_versionado = _versionado(conexao)

    if ja_versionado:
        command.upgrade(config, "head")
        return

    # Banco anterior ao Alembic: completa o que falta e assume como atual.
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conexao:
        _completar_colunas_legadas(conexao)
    command.stamp(config, "head")
    print("[banco] Banco existente adotado pelo controle de versao (Alembic)")
