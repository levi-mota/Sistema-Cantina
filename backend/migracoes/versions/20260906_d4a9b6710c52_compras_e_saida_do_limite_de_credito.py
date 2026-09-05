"""modulo de compras e saida do limite de credito

Cria a lista de compras (reposicao enviada ao comprador) e remove
`parceiros.limite_credito`, que existia para o fiado -- forma de pagamento que
saiu do PDV quando a cantina passou a receber so em dinheiro e PIX.

Revision ID: d4a9b6710c52
Revises: c8f21d3b4e07
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4a9b6710c52"
down_revision: str | Sequence[str] | None = "c8f21d3b4e07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "listas_compra",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=120), nullable=False),
        sa.Column(
            "status",
            sa.Enum("RASCUNHO", "ENVIADA", "CONCLUIDA", "CANCELADA", name="statuscompra"),
            nullable=False,
        ),
        sa.Column("comprador", sa.String(length=120), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("criado_em", sa.DateTime(), nullable=False),
        sa.Column("enviada_em", sa.DateTime(), nullable=True),
        sa.Column("concluida_em", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_listas_compra_criado_em", "listas_compra", ["criado_em"])
    op.create_index("ix_listas_compra_status", "listas_compra", ["status"])

    op.create_table(
        "itens_lista_compra",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lista_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("custo_estimado", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("estoque_no_momento", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("observacao", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["lista_id"], ["listas_compra.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["produto_id"], ["produtos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_itens_lista_compra_lista_id", "itens_lista_compra", ["lista_id"])

    with op.batch_alter_table("parceiros") as lote:
        lote.drop_column("limite_credito")


def downgrade() -> None:
    op.add_column(
        "parceiros",
        sa.Column(
            "limite_credito",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0",
        ),
    )

    op.drop_index("ix_itens_lista_compra_lista_id", table_name="itens_lista_compra")
    op.drop_table("itens_lista_compra")
    op.drop_index("ix_listas_compra_status", table_name="listas_compra")
    op.drop_index("ix_listas_compra_criado_em", table_name="listas_compra")
    op.drop_table("listas_compra")
