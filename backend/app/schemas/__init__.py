"""Schemas Pydantic (entrada/saída da API)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from app import models


def _inteiro(valor: Decimal) -> Decimal:
    """Tudo na cantina é contado por unidade: meia coxinha não existe.

    A regra mora aqui, e não só nos campos da tela, para valer também para quem
    chamar a API direto -- e para o estoque nunca terminar com 2,5 de um item
    que só existe inteiro.
    """
    if valor != valor.to_integral_value():
        raise ValueError("A quantidade é em unidades inteiras")
    return valor


Unidades = Annotated[Decimal, AfterValidator(_inteiro)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Auth / usuarios
# --------------------------------------------------------------------------- #
class LoginIn(BaseModel):
    usuario: str
    senha: str


class UsuarioBase(BaseModel):
    nome: str
    usuario: str = Field(min_length=2, max_length=40)
    perfil: models.Perfil = models.Perfil.USUARIO
    ativo: bool = True


class UsuarioCreate(UsuarioBase):
    senha: str = Field(min_length=4)


class UsuarioUpdate(BaseModel):
    nome: str | None = None
    usuario: str | None = Field(default=None, min_length=2, max_length=40)
    senha: str | None = Field(default=None, min_length=4)
    perfil: models.Perfil | None = None
    ativo: bool | None = None


class UsuarioOut(ORMModel, UsuarioBase):
    id: int
    criado_em: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


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
    tipo: models.TipoProduto = models.TipoProduto.FINAL
    descricao: str | None = None
    categoria_id: int | None = None
    fornecedor_id: int | None = None
    unidade: str = "UN"
    preco_custo: Decimal = Decimal("0")
    preco_venda: Decimal = Decimal("0")
    estoque_minimo: Unidades = Decimal("0")
    ativo: bool = True


class ProdutoCreate(ProdutoBase):
    estoque_inicial: Unidades = Decimal("0")


class ProdutoUpdate(BaseModel):
    codigo: str | None = None
    nome: str | None = None
    tipo: models.TipoProduto | None = None
    descricao: str | None = None
    categoria_id: int | None = None
    fornecedor_id: int | None = None
    unidade: str | None = None
    preco_custo: Decimal | None = None
    preco_venda: Decimal | None = None
    estoque_minimo: Unidades | None = None
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
    quantidade: Unidades = Field(gt=0)
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
    quantidade: Unidades = Field(gt=0)
    preco_unitario: Decimal | None = None
    desconto: Decimal = Decimal("0")


# O PDV da cantina recebe apenas em dinheiro e PIX. As demais formas seguem
# validas no financeiro (baixa de titulos), so nao entram pela venda.
FORMAS_PDV = {models.FormaPagamento.DINHEIRO, models.FormaPagamento.PIX}


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

    @field_validator("forma_pagamento")
    @classmethod
    def _forma_aceita(cls, valor: models.FormaPagamento) -> models.FormaPagamento:
        if valor not in FORMAS_PDV:
            aceitas = ", ".join(sorted(f.value for f in FORMAS_PDV))
            raise ValueError(f"O PDV aceita apenas: {aceitas}")
        return valor


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
    """Composição do valor que deveria estar na gaveta agora."""

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


# --------------------------------------------------------------------------- #
# Compras
# --------------------------------------------------------------------------- #
class ItemCompraIn(BaseModel):
    produto_id: int
    quantidade: Unidades = Field(gt=0)
    observacao: str | None = None


class ItemCompraOut(ORMModel):
    id: int
    produto_id: int
    produto: str
    codigo: str | None = None
    unidade: str
    fornecedor: str | None = None
    quantidade: Decimal
    custo_estimado: Decimal
    estoque_no_momento: Decimal
    estoque_minimo: Decimal
    total_estimado: Decimal
    observacao: str | None = None
    quantidade_recebida: Decimal | None = None
    total_recebido: Decimal | None = None
    # quantidade_recebida - quantidade. Negativo é falta; positivo, sobra.
    diferenca: Decimal | None = None


class ItemRecebimentoIn(BaseModel):
    item_id: int
    quantidade_recebida: Unidades = Field(ge=0)
    observacao: str | None = None


class RecebimentoIn(BaseModel):
    itens: list[ItemRecebimentoIn] = []


class ListaCompraIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=120)
    comprador: str | None = None
    observacao: str | None = None
    itens: list[ItemCompraIn] = []


class ListaCompraUpdate(BaseModel):
    titulo: str | None = None
    comprador: str | None = None
    observacao: str | None = None
    itens: list[ItemCompraIn] | None = None


class ListaCompraOut(ORMModel):
    id: int
    titulo: str
    status: models.StatusCompra
    comprador: str | None = None
    observacao: str | None = None
    usuario_nome: str | None = None
    criado_em: datetime
    enviada_em: datetime | None = None
    concluida_em: datetime | None = None
    itens: list[ItemCompraOut] = []
    total_estimado: Decimal = Decimal("0")
    quantidade_itens: int = 0
    # Só faz sentido depois da conferência.
    total_recebido: Decimal | None = None
    itens_conferidos: int = 0
    itens_completos: int = 0
    itens_faltando: int = 0


class SugestaoCompra(BaseModel):
    """Produto abaixo do mínimo, com a quantidade que recompoe o estoque."""

    produto_id: int
    produto: str
    codigo: str | None = None
    unidade: str
    fornecedor: str | None = None
    estoque_atual: Decimal
    estoque_minimo: Decimal
    sugestao: Decimal
    custo_estimado: Decimal
    total_estimado: Decimal
