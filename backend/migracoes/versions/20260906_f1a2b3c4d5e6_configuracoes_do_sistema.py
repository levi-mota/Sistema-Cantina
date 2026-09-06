"""configurações que o gerente muda pela tela

A chave PIX morava no .env do servidor: trocar de conta exigia editar arquivo e
reiniciar o backend, coisa que quem administra a cantina não faz. A tabela
guarda esses ajustes e o .env continua valendo como valor inicial.

Revision ID: f1a2b3c4d5e6
Revises: ae9ed4ef97db
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "ae9ed4ef97db"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "configuracoes",
        sa.Column("chave", sa.String(length=60), primary_key=True),
        sa.Column("valor", sa.Text(), nullable=False, server_default=""),
        sa.Column("atualizado_em", sa.DateTime(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("configuracoes")
