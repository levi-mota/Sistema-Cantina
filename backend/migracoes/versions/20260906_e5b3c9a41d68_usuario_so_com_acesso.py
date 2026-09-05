"""usuário guarda só o que o acesso precisa

O módulo de usuários passa a ter nome, login, senha, perfil e ativo. Os campos
de ficha de funcionário -- cargo, CPF, telefone, salário e as datas de admissão
e demissão -- saem: ninguém os preenchia nem os lia, e uma coluna que só existe
"por precaução" acaba virando dado desatualizado.

O downgrade devolve as colunas, mas não os valores: eles se perdem aqui.

Revision ID: e5b3c9a41d68
Revises: d4a9b6710c52
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5b3c9a41d68"
down_revision: str | Sequence[str] | None = "d4a9b6710c52"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUNAS = (
    ("cargo", sa.String(length=80)),
    ("cpf", sa.String(length=14)),
    ("telefone", sa.String(length=20)),
    ("salario", sa.Numeric(precision=12, scale=2)),
    ("data_admissao", sa.Date()),
    ("data_demissao", sa.Date()),
)


def upgrade() -> None:
    # O batch recria a tabela: é assim que o SQLite remove coluna.
    with op.batch_alter_table("usuarios") as lote:
        for nome, _ in COLUNAS:
            lote.drop_column(nome)


def downgrade() -> None:
    with op.batch_alter_table("usuarios") as lote:
        for nome, tipo in COLUNAS:
            lote.add_column(sa.Column(nome, tipo, nullable=True))
