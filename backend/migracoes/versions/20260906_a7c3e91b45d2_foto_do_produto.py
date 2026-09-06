"""foto do produto para o cardápio

A imagem fica na própria tabela, e não numa pasta do servidor: o backup diário
copia o banco, então a foto viaja junto com o produto. Uma pasta separada seria
mais um lugar para lembrar de copiar -- e para esquecer.

Revision ID: a7c3e91b45d2
Revises: f1a2b3c4d5e6
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e91b45d2"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("produtos") as lote:
        lote.add_column(sa.Column("imagem", sa.LargeBinary(), nullable=True))
        lote.add_column(sa.Column("imagem_tipo", sa.String(length=30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("produtos") as lote:
        lote.drop_column("imagem_tipo")
        lote.drop_column("imagem")
