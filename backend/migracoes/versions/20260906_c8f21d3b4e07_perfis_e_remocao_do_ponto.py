"""dois perfis de acesso e remocao do registro de ponto

Os perfis passam de tres para dois:

    ADMIN, GERENTE -> ADMIN     (ambos administravam o sistema)
    OPERADOR       -> USUARIO   (frente de caixa)

Gerente vira ADMIN de proposito: quem ja administrava nao pode perder acesso
numa migracao silenciosa. Rebaixar alguem e uma decisao de gestao, feita na
tela de Funcionarios.

O registro de ponto sai do sistema, junto com a tabela.

Revision ID: c8f21d3b4e07
Revises: a1c4e77b21f9
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8f21d3b4e07"
down_revision: str | Sequence[str] | None = "a1c4e77b21f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conexao = op.get_bind()

    conexao.execute(sa.text("UPDATE usuarios SET perfil = 'ADMIN' WHERE perfil = 'GERENTE'"))
    conexao.execute(sa.text("UPDATE usuarios SET perfil = 'USUARIO' WHERE perfil = 'OPERADOR'"))

    op.drop_index("ix_registros_ponto_data", table_name="registros_ponto")
    op.drop_index("ix_registros_ponto_usuario_id", table_name="registros_ponto")
    op.drop_table("registros_ponto")


def downgrade() -> None:
    conexao = op.get_bind()

    # Nao da para saber quem era GERENTE antes; todo ADMIN volta como ADMIN.
    conexao.execute(sa.text("UPDATE usuarios SET perfil = 'OPERADOR' WHERE perfil = 'USUARIO'"))

    op.create_table(
        "registros_ponto",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("entrada", sa.DateTime(), nullable=True),
        sa.Column("saida", sa.DateTime(), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usuario_id", "data", name="uq_ponto_dia"),
    )
    op.create_index("ix_registros_ponto_data", "registros_ponto", ["data"])
    op.create_index("ix_registros_ponto_usuario_id", "registros_ponto", ["usuario_id"])
