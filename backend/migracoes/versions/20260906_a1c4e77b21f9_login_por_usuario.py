"""login por usuario no lugar do e-mail

A ferramenta e de uso interno, entao o login passa a ser um nome curto
("levi", "davi", "alisson") em vez de e-mail.

Os logins existentes sao derivados da parte do e-mail antes do "@". Em caso de
colisao (dois e-mails com o mesmo prefixo em dominios diferentes) o segundo
recebe um sufixo numerico, para nao violar a unicidade.

Revision ID: a1c4e77b21f9
Revises: b3d98872572f
Create Date: 2026-09-06
"""

from collections.abc import Sequence
import re

import sqlalchemy as sa
from alembic import op

revision: str = "a1c4e77b21f9"
down_revision: str | Sequence[str] | None = "b3d98872572f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _apelido(email: str) -> str:
    """Deriva um login legivel a partir do e-mail."""
    base = (email or "").split("@")[0].strip().lower()
    base = re.sub(r"[^a-z0-9._-]", "", base)
    return base or "usuario"


def upgrade() -> None:
    conexao = op.get_bind()

    op.add_column("usuarios", sa.Column("usuario", sa.String(length=40), nullable=True))

    usados: set[str] = set()
    linhas = conexao.execute(sa.text("SELECT id, email FROM usuarios ORDER BY id")).fetchall()
    for identificador, email in linhas:
        login = _apelido(email)
        if login in usados:
            sufixo = 2
            while f"{login}{sufixo}" in usados:
                sufixo += 1
            login = f"{login}{sufixo}"
        usados.add(login)
        conexao.execute(
            sa.text("UPDATE usuarios SET usuario = :login WHERE id = :id"),
            {"login": login, "id": identificador},
        )

    # O batch recria a tabela: e assim que o SQLite muda coluna e indice.
    with op.batch_alter_table("usuarios") as lote:
        lote.alter_column("usuario", existing_type=sa.String(length=40), nullable=False)
        lote.drop_index("ix_usuarios_email")
        lote.drop_column("email")
        lote.create_index("ix_usuarios_usuario", ["usuario"], unique=True)


def downgrade() -> None:
    conexao = op.get_bind()

    op.add_column("usuarios", sa.Column("email", sa.String(length=150), nullable=True))
    conexao.execute(
        sa.text("UPDATE usuarios SET email = usuario || '@cantina.local' WHERE email IS NULL")
    )

    with op.batch_alter_table("usuarios") as lote:
        lote.alter_column("email", existing_type=sa.String(length=150), nullable=False)
        lote.drop_index("ix_usuarios_usuario")
        lote.drop_column("usuario")
        lote.create_index("ix_usuarios_email", ["email"], unique=True)
