"""Modelos ORM do sistema da cantina."""

from datetime import date, datetime, timezone
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def agora() -> datetime:
    return datetime.now(timezone.utc)


Dinheiro = Numeric(12, 2)
Quantidade = Numeric(12, 3)


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class Perfil(StrEnum):
    ADMIN = "ADMIN"
    GERENTE = "GERENTE"
    OPERADOR = "OPERADOR"


class TipoParceiro(StrEnum):
    CLIENTE = "CLIENTE"
    FORNECEDOR = "FORNECEDOR"
    AMBOS = "AMBOS"


class TipoPessoa(StrEnum):
    FISICA = "FISICA"
    JURIDICA = "JURIDICA"


class TipoMovimento(StrEnum):
    ENTRADA = "ENTRADA"
    SAIDA = "SAIDA"
    AJUSTE = "AJUSTE"
    PERDA = "PERDA"


class StatusVenda(StrEnum):
    ABERTA = "ABERTA"
    FINALIZADA = "FINALIZADA"
    CANCELADA = "CANCELADA"


class FormaPagamento(StrEnum):
    DINHEIRO = "DINHEIRO"
    DEBITO = "DEBITO"
    CREDITO = "CREDITO"
    PIX = "PIX"
    FIADO = "FIADO"


class TipoTitulo(StrEnum):
    PAGAR = "PAGAR"
    RECEBER = "RECEBER"


class StatusTitulo(StrEnum):
    ABERTO = "ABERTO"
    PARCIAL = "PARCIAL"
    PAGO = "PAGO"
    CANCELADO = "CANCELADO"


# --------------------------------------------------------------------------- #
# Funcionarios / usuarios
# --------------------------------------------------------------------------- #
class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    senha_hash: Mapped[str] = mapped_column(String(255))
    perfil: Mapped[Perfil] = mapped_column(Enum(Perfil), default=Perfil.OPERADOR)
    cargo: Mapped[str | None] = mapped_column(String(80))
    cpf: Mapped[str | None] = mapped_column(String(14))
    telefone: Mapped[str | None] = mapped_column(String(20))
    salario: Mapped[float | None] = mapped_column(Dinheiro)
    data_admissao: Mapped[date | None] = mapped_column(Date)
    data_demissao: Mapped[date | None] = mapped_column(Date)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    pontos: Mapped[list["RegistroPonto"]] = relationship(
        back_populates="usuario", cascade="all, delete-orphan"
    )


class RegistroPonto(Base):
    __tablename__ = "registros_ponto"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    data: Mapped[date] = mapped_column(Date, index=True)
    entrada: Mapped[datetime | None] = mapped_column(DateTime)
    saida: Mapped[datetime | None] = mapped_column(DateTime)
    observacao: Mapped[str | None] = mapped_column(Text)

    usuario: Mapped[Usuario] = relationship(back_populates="pontos", lazy="joined")

    __table_args__ = (UniqueConstraint("usuario_id", "data", name="uq_ponto_dia"),)


# --------------------------------------------------------------------------- #
# Clientes / fornecedores
# --------------------------------------------------------------------------- #
class Parceiro(Base):
    __tablename__ = "parceiros"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[TipoParceiro] = mapped_column(
        Enum(TipoParceiro), default=TipoParceiro.CLIENTE, index=True
    )
    tipo_pessoa: Mapped[TipoPessoa] = mapped_column(
        Enum(TipoPessoa), default=TipoPessoa.FISICA
    )
    nome: Mapped[str] = mapped_column(String(150), index=True)
    nome_fantasia: Mapped[str | None] = mapped_column(String(150))
    documento: Mapped[str | None] = mapped_column(String(18), index=True)
    email: Mapped[str | None] = mapped_column(String(150))
    telefone: Mapped[str | None] = mapped_column(String(20))
    cep: Mapped[str | None] = mapped_column(String(9))
    logradouro: Mapped[str | None] = mapped_column(String(150))
    numero: Mapped[str | None] = mapped_column(String(20))
    complemento: Mapped[str | None] = mapped_column(String(80))
    bairro: Mapped[str | None] = mapped_column(String(80))
    cidade: Mapped[str | None] = mapped_column(String(80))
    uf: Mapped[str | None] = mapped_column(String(2))
    limite_credito: Mapped[float] = mapped_column(Dinheiro, default=0)
    observacoes: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)


# --------------------------------------------------------------------------- #
# Estoque
# --------------------------------------------------------------------------- #
class Categoria(Base):
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), unique=True)
    descricao: Mapped[str | None] = mapped_column(String(200))


class Produto(Base):
    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str | None] = mapped_column(String(40), unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), index=True)
    descricao: Mapped[str | None] = mapped_column(Text)
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias.id"))
    fornecedor_id: Mapped[int | None] = mapped_column(ForeignKey("parceiros.id"))
    unidade: Mapped[str] = mapped_column(String(6), default="UN")
    preco_custo: Mapped[float] = mapped_column(Dinheiro, default=0)
    preco_venda: Mapped[float] = mapped_column(Dinheiro, default=0)
    estoque_atual: Mapped[float] = mapped_column(Quantidade, default=0)
    estoque_minimo: Mapped[float] = mapped_column(Quantidade, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    categoria: Mapped[Categoria | None] = relationship(lazy="joined")
    fornecedor: Mapped[Parceiro | None] = relationship(lazy="joined")


class MovimentoEstoque(Base):
    __tablename__ = "movimentos_estoque"

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"), index=True)
    tipo: Mapped[TipoMovimento] = mapped_column(Enum(TipoMovimento))
    quantidade: Mapped[float] = mapped_column(Quantidade)
    saldo_apos: Mapped[float] = mapped_column(Quantidade, default=0)
    custo_unitario: Mapped[float | None] = mapped_column(Dinheiro)
    motivo: Mapped[str | None] = mapped_column(String(200))
    venda_id: Mapped[int | None] = mapped_column(ForeignKey("vendas.id"))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora, index=True)

    produto: Mapped[Produto] = relationship(lazy="joined")


# --------------------------------------------------------------------------- #
# PDV
# --------------------------------------------------------------------------- #
class Venda(Base):
    __tablename__ = "vendas"

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("parceiros.id"))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    status: Mapped[StatusVenda] = mapped_column(
        Enum(StatusVenda), default=StatusVenda.FINALIZADA, index=True
    )
    forma_pagamento: Mapped[FormaPagamento] = mapped_column(
        Enum(FormaPagamento), default=FormaPagamento.DINHEIRO
    )
    subtotal: Mapped[float] = mapped_column(Dinheiro, default=0)
    desconto: Mapped[float] = mapped_column(Dinheiro, default=0)
    total: Mapped[float] = mapped_column(Dinheiro, default=0)
    valor_recebido: Mapped[float] = mapped_column(Dinheiro, default=0)
    troco: Mapped[float] = mapped_column(Dinheiro, default=0)
    observacao: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora, index=True)

    cliente: Mapped[Parceiro | None] = relationship(lazy="joined")
    usuario: Mapped[Usuario | None] = relationship(lazy="joined")
    itens: Mapped[list["VendaItem"]] = relationship(
        back_populates="venda", cascade="all, delete-orphan", lazy="selectin"
    )


class VendaItem(Base):
    __tablename__ = "venda_itens"

    id: Mapped[int] = mapped_column(primary_key=True)
    venda_id: Mapped[int] = mapped_column(ForeignKey("vendas.id", ondelete="CASCADE"))
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"))
    descricao: Mapped[str] = mapped_column(String(150))
    quantidade: Mapped[float] = mapped_column(Quantidade)
    preco_unitario: Mapped[float] = mapped_column(Dinheiro)
    custo_unitario: Mapped[float] = mapped_column(Dinheiro, default=0)
    desconto: Mapped[float] = mapped_column(Dinheiro, default=0)
    total: Mapped[float] = mapped_column(Dinheiro, default=0)

    venda: Mapped[Venda] = relationship(back_populates="itens")
    produto: Mapped[Produto] = relationship(lazy="joined")


# --------------------------------------------------------------------------- #
# Financeiro (contas a pagar / receber)
# --------------------------------------------------------------------------- #
class Titulo(Base):
    __tablename__ = "titulos"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[TipoTitulo] = mapped_column(Enum(TipoTitulo), index=True)
    descricao: Mapped[str] = mapped_column(String(200))
    categoria: Mapped[str | None] = mapped_column(String(80))
    parceiro_id: Mapped[int | None] = mapped_column(ForeignKey("parceiros.id"))
    venda_id: Mapped[int | None] = mapped_column(ForeignKey("vendas.id"))
    valor: Mapped[float] = mapped_column(Dinheiro)
    valor_pago: Mapped[float] = mapped_column(Dinheiro, default=0)
    vencimento: Mapped[date] = mapped_column(Date, index=True)
    quitado_em: Mapped[date | None] = mapped_column(Date)
    status: Mapped[StatusTitulo] = mapped_column(
        Enum(StatusTitulo), default=StatusTitulo.ABERTO, index=True
    )
    forma_pagamento: Mapped[FormaPagamento | None] = mapped_column(Enum(FormaPagamento))
    observacao: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    parceiro: Mapped[Parceiro | None] = relationship(lazy="joined")
