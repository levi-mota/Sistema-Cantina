"""quantidade recebida no item da lista de compras

A conferência da entrega passa a ficar guardada: quanto foi pedido já estava em
`quantidade`, e agora `quantidade_recebida` diz quanto chegou de fato. Nulo
significa "ninguém conferiu ainda", que é diferente de zero -- zero é "não
veio".

O downgrade devolve a coluna ao que era, perdendo as conferências.

Revision ID: ce7437ca0e8a
Revises: 430eb8b139ef
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ce7437ca0e8a"
down_revision: str | Sequence[str] | None = "430eb8b139ef"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# O autogenerate acusou de novo uma troca de tipo em usuarios.perfil, de
# VARCHAR para Enum. É falso positivo: o SQLite guarda Enum como VARCHAR e o
# schema já está certo. Recriar a tabela sem necessidade só arriscaria os dados.


def upgrade() -> None:
    with op.batch_alter_table("itens_lista_compra") as lote:
        lote.add_column(
            sa.Column("quantidade_recebida", sa.Numeric(precision=12, scale=3), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("itens_lista_compra") as lote:
        lote.drop_column("quantidade_recebida")
