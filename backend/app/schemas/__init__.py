"""Schemas Pydantic (entrada/saida da API)."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app import models


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Auth / usuarios
# --------------------------------------------------------------------------- #
class LoginIn(BaseModel):
    email: str
    senha: str


class UsuarioBase(BaseModel):
    nome: str
    email: str
    perfil: models.Perfil = models.Perfil.OPERADOR
    cargo: str | None = None
    cpf: str | None = None
    telefone: str | None = None
    salario: Decimal | None = None
    data_admissao: date | None = None
    data_demissao: date | None = None
    ativo: bool = True


class UsuarioCreate(UsuarioBase):
    senha: str = Field(min_length=4)


class UsuarioUpdate(BaseModel):
    nome: str | None = None
    email: str | None = None
    senha: str | None = Field(default=None, min_length=4)
    perfil: models.Perfil | None = None
    cargo: str | None = None
    cpf: str | None = None
    telefone: str | None = None
    salario: Decimal | None = None
    data_admissao: date | None = None
    data_demissao: date | None = None
    ativo: bool | None = None


class UsuarioOut(ORMModel, UsuarioBase):
    id: int
    criado_em: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


class PontoIn(BaseModel):
    usuario_id: int
    data: date
    entrada: datetime | None = None
    saida: datetime | None = None
    observacao: str | None = None


class PontoOut(ORMModel, PontoIn):
    id: int
    usuario_nome: str | None = None


# --------------------------------------------------------------------------- #
# Parceiros
# --------------------------------------------------------------------------- #
class ParceiroBase(BaseModel):
    tipo: models.TipoParceiro = models.TipoParceiro.CLIENTE
    tipo_pessoa: models.TipoPessoa = models.TipoPessoa.FISICA
    nome: str
    nome_fantasia: str | None = None
    documento: str | None = None
    email: str | None = None
    telefone: str | None = None
    cep: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    limite_credito: Decimal = Decimal("0")
    observacoes: str | None = None
    ativo: bool = True


class ParceiroCreate(ParceiroBase):
    pass


class ParceiroUpdate(BaseModel):
    tipo: models.TipoParceiro | None = None
    tipo_pessoa: models.TipoPessoa | None = None
    nome: str | None = None
    nome_fantasia: str | None = None
    documento: str | None = None
    email: str | None = None
    telefone: str | None = None
    cep: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    limite_credito: Decimal | None = None
    observacoes: str | None = None
    ativo: bool | None = None


class ParceiroOut(ORMModel, ParceiroBase):
    id: int
    criado_em: datetime


# --------------------------------------------------------------------------- #
# Estoque
# --------------------------------------------------------------------------- #
class CategoriaIn(BaseModel):
    nome: str
    descricao: str | None = None


class CategoriaOut(ORMModel, CategoriaIn):
    id: int


class ProdutoBase(BaseModel):
    codigo: str | None = None
    nome: str
    descricao: str | None = None
    categoria_id: int | None = None
    fornecedor_id: int | None = None
    unidade: str = "UN"
    preco_custo: Decimal = Decimal("0")
    preco_venda: Decimal = Decimal("0")
    estoque_minimo: Decimal = Decimal("0")
    ativo: bool = True


class ProdutoCreate(ProdutoBase):
    estoque_inicial: Decimal = Decimal("0")


class ProdutoUpdate(BaseModel):
    codigo: str | None = None
    nome: str | None = None
    descricao: str | None = None
    categoria_id: int | None = None
    fornecedor_id: int | None = None
    unidade: str | None = None
    preco_custo: Decimal | None = None
    preco_venda: Decimal | None = None
    estoque_minimo: Decimal | None = None
    ativo: bool | None = None


class ProdutoOut(ORMModel, ProdutoBase):
    id: int
    estoque_atual: Decimal
    categoria_nome: str | None = None
    fornecedor_nome: str | None = None
    margem: Decimal | None = None
    abaixo_minimo: bool = False


class MovimentoIn(BaseModel):
    produto_id: int
    tipo: models.TipoMovimento
    quantidade: Decimal = Field(gt=0)
    custo_unitario: Decimal | None = None
    motivo: str | None = None
    gerar_conta_pagar: bool = False
    fornecedor_id: int | None = None
    vencimento: date | None = None


class MovimentoOut(ORMModel):
    id: int
    produto_id: int
    produto_nome: str | None = None
    tipo: models.TipoMovimento
    quantidade: Decimal
    saldo_apos: Decimal
    custo_unitario: Decimal | None = None
    motivo: str | None = None
    venda_id: int | None = None
    usuario_id: int | None = None
    criado_em: datetime


# --------------------------------------------------------------------------- #
# PDV
# --------------------------------------------------------------------------- #
class VendaItemIn(BaseModel):
    produto_id: int
    quantidade: Decimal = Field(gt=0)
    preco_unitario: Decimal | None = None
    desconto: Decimal = Decimal("0")


class VendaIn(BaseModel):
    cliente_id: int | None = None
    # Padrao da venda e consumidor diverso; informar o documento identifica.
    documento_cliente: str | None = None
    forma_pagamento: models.FormaPagamento = models.FormaPagamento.DINHEIRO
    desconto: Decimal = Decimal("0")
    valor_recebido: Decimal = Decimal("0")
    observacao: str | None = None
    vencimento_fiado: date | None = None
    itens: list[VendaItemIn] = Field(min_length=1)


class VendaItemOut(ORMModel):
    id: int
    produto_id: int
    descricao: str
    quantidade: Decimal
    preco_unitario: Decimal
    desconto: Decimal
    total: Decimal


class VendaOut(ORMModel):
    id: int
    cliente_id: int | None = None
    cliente_nome: str | None = None
    documento_cliente: str | None = None
    usuario_id: int | None = None
    usuario_nome: str | None = None
    caixa_sessao_id: int | None = None
    caixa_nome: str | None = None
    status: models.StatusVenda
    forma_pagamento: models.FormaPagamento
    subtotal: Decimal
    desconto: Decimal
    total: Decimal
    valor_recebido: Decimal
    troco: Decimal
    observacao: str | None = None
    criado_em: datetime
    itens: list[VendaItemOut] = []


# --------------------------------------------------------------------------- #
# Financeiro
# --------------------------------------------------------------------------- #
class TituloBase(BaseModel):
    tipo: models.TipoTitulo
    descricao: str
    categoria: str | None = None
    parceiro_id: int | None = None
    valor: Decimal = Field(gt=0)
    vencimento: date
    observacao: str | None = None


class TituloCreate(TituloBase):
    parcelas: int = Field(default=1, ge=1, le=48)
    intervalo_dias: int = Field(default=30, ge=1, le=365)


class TituloUpdate(BaseModel):
    descricao: str | None = None
    categoria: str | None = None
    parceiro_id: int | None = None
    valor: Decimal | None = None
    vencimento: date | None = None
    observacao: str | None = None
    status: models.StatusTitulo | None = None


class BaixaIn(BaseModel):
    valor: Decimal = Field(gt=0)
    data: date | None = None
    forma_pagamento: models.FormaPagamento = models.FormaPagamento.DINHEIRO
    observacao: str | None = None


class TituloOut(ORMModel, TituloBase):
    id: int
    parceiro_nome: str | None = None
    venda_id: int | None = None
    valor_pago: Decimal
    saldo: Decimal
    quitado_em: date | None = None
    status: models.StatusTitulo
    forma_pagamento: models.FormaPagamento | None = None
    vencido: bool = False
    criado_em: datetime


class IdentificacaoOut(BaseModel):
    """Resultado da busca por CPF/CNPJ no momento da venda."""

    documento: str
    tipo: str  # "CPF" ou "CNPJ"
    cadastrado: bool
    parceiro_id: int | None = None
    nome: str | None = None
    limite_credito: Decimal | None = None


# --------------------------------------------------------------------------- #
# Integracoes
# --------------------------------------------------------------------------- #
class EnderecoOut(BaseModel):
    cep: str
    logradouro: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    fonte: str


class EmpresaOut(BaseModel):
    documento: str
    razao_social: str | None = None
    nome_fantasia: str | None = None
    situacao: str | None = None
    atividade_principal: str | None = None
    email: str | None = None
    telefone: str | None = None
    cep: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    fonte: str


# --------------------------------------------------------------------------- #
# Caixa
# --------------------------------------------------------------------------- #
class CaixaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    descricao: str | None = None
    ativo: bool = True


class CaixaTerminalOut(ORMModel):
    id: int
    nome: str
    descricao: str | None = None
    ativo: bool
    # Preenchidos quando existe um turno aberto neste caixa.
    sessao_id: int | None = None
    sessao_operador: str | None = None
    sessao_aberta_em: datetime | None = None
    minha_sessao: bool = False


class AberturaIn(BaseModel):
    caixa_id: int
    valor_abertura: Decimal = Field(default=Decimal("0"), ge=0)
    observacao: str | None = None


class MovimentoCaixaIn(BaseModel):
    tipo: models.TipoMovimentoCaixa
    valor: Decimal = Field(gt=0)
    motivo: str | None = None


class FechamentoIn(BaseModel):
    valor_informado: Decimal = Field(ge=0)
    observacao: str | None = None


class MovimentoCaixaOut(ORMModel):
    id: int
    tipo: models.TipoMovimentoCaixa
    valor: Decimal
    motivo: str | None = None
    usuario_id: int | None = None
    usuario_nome: str | None = None
    criado_em: datetime


class ConferenciaOut(BaseModel):
    """Composicao do valor que deveria estar na gaveta agora."""

    valor_abertura: Decimal
    vendas_dinheiro: Decimal
    qtd_vendas_dinheiro: int
    suprimentos: Decimal
    sangrias: Decimal
    valor_esperado: Decimal
    # Informativo: nao passa pela gaveta, mas ajuda a conferir o turno.
    vendas_outras_formas: Decimal
    total_vendas: Decimal


class CaixaOut(ORMModel):
    id: int
    caixa_id: int
    caixa_nome: str | None = None
    status: models.StatusCaixa
    usuario_abertura_id: int
    usuario_abertura_nome: str | None = None
    usuario_fechamento_id: int | None = None
    usuario_fechamento_nome: str | None = None
    aberto_em: datetime
    fechado_em: datetime | None = None
    valor_abertura: Decimal
    valor_informado: Decimal | None = None
    valor_esperado: Decimal | None = None
    diferenca: Decimal | None = None
    observacao_abertura: str | None = None
    observacao_fechamento: str | None = None
    movimentos: list[MovimentoCaixaOut] = []
    conferencia: ConferenciaOut | None = None
