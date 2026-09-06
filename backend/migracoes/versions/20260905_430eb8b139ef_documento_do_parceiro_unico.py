"""documento do parceiro é único

O mesmo CPF/CNPJ em duas fichas parte o histórico do cliente ao meio: metade
das compras em cada uma, e nenhuma mostrando o total certo. O índice passa a
ser único, como última barreira atrás da checagem no formulário e na API.

Documento em branco continua podendo se repetir -- no SQLite, valores NULL não
colidem em índice único --, porque nem todo cadastro pede o papel na hora.

Revision ID: 430eb8b139ef
Revises: e5b3c9a41d68
Create Date: 2026-09-05
"""

from collections.abc import Sequence

from alembic import op

revision: str = "430eb8b139ef"
down_revision: str | Sequence[str] | None = "e5b3c9a41d68"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# O autogenerate também acusou uma troca de tipo em usuarios.perfil, de VARCHAR
# para Enum. É falso positivo: o SQLite guarda Enum como VARCHAR, e o schema já
# está certo. Ficou de fora de propósito -- recriar a tabela sem necessidade só
# arriscaria os dados.


def upgrade() -> None:
    with op.batch_alter_table("parceiros") as lote:
        lote.drop_index("ix_parceiros_documento")
        lote.create_index("ix_parceiros_documento", ["documento"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("parceiros") as lote:
        lote.drop_index("ix_parceiros_documento")
        lote.create_index("ix_parceiros_documento", ["documento"], unique=False)
