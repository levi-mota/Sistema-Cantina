"""Ambiente do Alembic.

A URL do banco e os modelos vem da propria aplicacao, entao `alembic.ini` nao
guarda configuracao duplicada e `--autogenerate` enxerga o schema real.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.core.database import Base

# Import com efeito colateral: registra todas as tabelas no metadata.
import app.models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Gera o SQL sem conectar (alembic upgrade head --sql)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    conexao_existente = config.attributes.get("connection", None)

    if conexao_existente is not None:
        # Chamada de dentro da aplicacao, reaproveitando a conexao aberta.
        _executar(conexao_existente)
        return

    engine = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with engine.connect() as conexao:
        _executar(conexao)


def _executar(conexao) -> None:
    context.configure(
        connection=conexao,
        target_metadata=target_metadata,
        # O SQLite nao sabe ALTER COLUMN/DROP COLUMN; o modo batch recria a
        # tabela por baixo dos panos para essas operacoes.
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
