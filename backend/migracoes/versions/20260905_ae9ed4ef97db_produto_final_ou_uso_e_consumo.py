"""produto final ou uso e consumo

O estoque passa a distinguir o que o cliente compra do que a cantina usa para
produzir. `tipo` = FINAL é o que vai ao PDV; INSUMO é farinha, ketchup,
embalagem: controlado e comprado como qualquer item, mas fora da tela de venda.

Todo produto que já existe vira FINAL: até aqui tudo o que estava cadastrado
era vendido no balcão. Quem for insumo se marca depois, no cadastro.

Revision ID: ae9ed4ef97db
Revises: ce7437ca0e8a
Create Date: 2026-09-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ae9ed4ef97db"
down_revision: str | Sequence[str] | None = "ce7437ca0e8a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TIPO = sa.Enum("FINAL", "INSUMO", name="tipoproduto")


def upgrade() -> None:
    with op.batch_alter_table("produtos") as lote:
        # server_default preenche as linhas que já existem; ele sai em seguida
        # para o padrão ficar valendo pelo modelo, e não pelo banco.
        lote.add_column(sa.Column("tipo", TIPO, nullable=False, server_default="FINAL"))
        lote.create_index("ix_produtos_tipo", ["tipo"])

    with op.batch_alter_table("produtos") as lote:
        lote.alter_column("tipo", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("produtos") as lote:
        lote.drop_index("ix_produtos_tipo")
        lote.drop_column("tipo")
