"""ficha técnica dos produtos finais

A receita de cada produto final: quais itens de uso e consumo ele gasta e
quanto de cada um. A quantidade é por unidade produzida e aceita fração -- um
lanche gasta 0,05 do vidro de ketchup que se compra inteiro.

A tabela não movimenta estoque. Ela existe para calcular o custo real de
produzir e, no fechamento do expediente, dizer quanto de insumo *deveria* ter
saído diante do que foi vendido.

Revision ID: b71821a37eb1
Revises: ae9ed4ef97db
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b71821a37eb1"
down_revision: str | Sequence[str] | None = "ae9ed4ef97db"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Como nas migrações anteriores, o autogenerate acusou uma troca de tipo em
# usuarios.perfil (VARCHAR -> Enum). É falso positivo do SQLite e ficou de fora.


def upgrade() -> None:
    op.create_table(
        "ficha_tecnica",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("insumo_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("observacao", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["insumo_id"], ["produtos.id"]),
        sa.ForeignKeyConstraint(["produto_id"], ["produtos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # O mesmo insumo não repete na receita: seria a mesma linha duas vezes,
        # com o custo contado em dobro.
        sa.UniqueConstraint("produto_id", "insumo_id", name="uq_ficha_produto_insumo"),
    )
    with op.batch_alter_table("ficha_tecnica") as lote:
        lote.create_index("ix_ficha_tecnica_produto_id", ["produto_id"])
        lote.create_index("ix_ficha_tecnica_insumo_id", ["insumo_id"])


def downgrade() -> None:
    with op.batch_alter_table("ficha_tecnica") as lote:
        lote.drop_index("ix_ficha_tecnica_insumo_id")
        lote.drop_index("ix_ficha_tecnica_produto_id")
    op.drop_table("ficha_tecnica")
