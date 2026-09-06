export type Perfil = "ADMIN" | "USUARIO";
export type TipoParceiro = "CLIENTE" | "FORNECEDOR" | "AMBOS";
export type TipoPessoa = "FISICA" | "JURIDICA";
export type TipoMovimento = "ENTRADA" | "SAIDA" | "AJUSTE" | "PERDA";
export type FormaPagamento = "DINHEIRO" | "DEBITO" | "CREDITO" | "PIX" | "FIADO";
export type TipoTitulo = "PAGAR" | "RECEBER";
export type StatusTitulo = "ABERTO" | "PARCIAL" | "PAGO" | "CANCELADO";
export type StatusVenda = "ABERTA" | "FINALIZADA" | "CANCELADA";

export interface Usuario {
  id: number;
  nome: string;
  /** Login interno, sem e-mail: "levi", "davi.silva". */
  usuario: string;
  perfil: Perfil;
  ativo: boolean;
  criado_em: string;
}

export interface Parceiro {
  id: number;
  tipo: TipoParceiro;
  tipo_pessoa: TipoPessoa;
  nome: string;
  nome_fantasia?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  observacoes?: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface Categoria {
  id: number;
  nome: string;
  descricao?: string | null;
}

export interface Produto {
  id: number;
  codigo?: string | null;
  nome: string;
  descricao?: string | null;
  categoria_id?: number | null;
  categoria_nome?: string | null;
  fornecedor_id?: number | null;
  fornecedor_nome?: string | null;
  unidade: string;
  preco_custo: string;
  preco_venda: string;
  estoque_atual: string;
  estoque_minimo: string;
  margem?: string | null;
  abaixo_minimo: boolean;
  ativo: boolean;
}

export interface Movimento {
  id: number;
  produto_id: number;
  produto_nome?: string | null;
  tipo: TipoMovimento;
  quantidade: string;
  saldo_apos: string;
  custo_unitario?: string | null;
  motivo?: string | null;
  venda_id?: number | null;
  criado_em: string;
}

export interface VendaItem {
  id: number;
  produto_id: number;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
  total: string;
}

export interface Venda {
  id: number;
  cliente_id?: number | null;
  cliente_nome?: string | null;
  documento_cliente?: string | null;
  usuario_nome?: string | null;
  caixa_sessao_id?: number | null;
  caixa_nome?: string | null;
  status: StatusVenda;
  forma_pagamento: FormaPagamento;
  subtotal: string;
  desconto: string;
  total: string;
  valor_recebido: string;
  troco: string;
  observacao?: string | null;
  criado_em: string;
  itens: VendaItem[];
}

export interface Titulo {
  id: number;
  tipo: TipoTitulo;
  descricao: string;
  categoria?: string | null;
  parceiro_id?: number | null;
  parceiro_nome?: string | null;
  venda_id?: number | null;
  valor: string;
  valor_pago: string;
  saldo: string;
  vencimento: string;
  quitado_em?: string | null;
  status: StatusTitulo;
  forma_pagamento?: FormaPagamento | null;
  observacao?: string | null;
  vencido: boolean;
  criado_em: string;
}

export interface Dashboard {
  vendas_hoje: number;
  vendas_mes: number;
  qtd_vendas_hoje: number;
  ticket_medio_hoje: number;
  produtos_criticos: number;
  valor_estoque: number;
}

export interface ResumoFinanceiro {
  a_pagar_total: number;
  a_pagar_vencido: number;
  a_pagar_proximos: number;
  a_receber_total: number;
  a_receber_vencido: number;
  a_receber_proximos: number;
  saldo_projetado: number;
}

export interface PixConfig {
  configurado: boolean;
  beneficiario: string;
  chave: string;
}

export interface PixCobranca {
  brcode: string;
  valor: string;
  beneficiario: string;
  chave: string;
}

export interface Endereco {
  cep: string;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  fonte: string;
}

export interface Empresa extends Endereco {
  documento: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao?: string | null;
  atividade_principal?: string | null;
  email?: string | null;
  telefone?: string | null;
  numero?: string | null;
  complemento?: string | null;
}

export type StatusCaixa = "ABERTA" | "FECHADA";
export type TipoMovimentoCaixa = "SANGRIA" | "SUPRIMENTO";

export interface MovimentoCaixa {
  id: number;
  tipo: TipoMovimentoCaixa;
  valor: string;
  motivo?: string | null;
  usuario_id?: number | null;
  usuario_nome?: string | null;
  criado_em: string;
}

export interface Conferencia {
  valor_abertura: string;
  vendas_dinheiro: string;
  qtd_vendas_dinheiro: number;
  suprimentos: string;
  sangrias: string;
  valor_esperado: string;
  vendas_outras_formas: string;
  total_vendas: string;
}

export interface CaixaTerminal {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  sessao_id?: number | null;
  sessao_operador?: string | null;
  sessao_aberta_em?: string | null;
  minha_sessao: boolean;
}

export interface Identificacao {
  documento: string;
  tipo: "CPF" | "CNPJ";
  cadastrado: boolean;
  parceiro_id?: number | null;
  nome?: string | null;
}

export interface CaixaSessao {
  id: number;
  caixa_id: number;
  caixa_nome?: string | null;
  status: StatusCaixa;
  usuario_abertura_id: number;
  usuario_abertura_nome?: string | null;
  usuario_fechamento_id?: number | null;
  usuario_fechamento_nome?: string | null;
  aberto_em: string;
  fechado_em?: string | null;
  valor_abertura: string;
  valor_informado?: string | null;
  valor_esperado?: string | null;
  diferenca?: string | null;
  observacao_abertura?: string | null;
  observacao_fechamento?: string | null;
  movimentos: MovimentoCaixa[];
  conferencia?: Conferencia | null;
}

export type StatusCompra = "RASCUNHO" | "ENVIADA" | "CONCLUIDA" | "CANCELADA";

export interface ItemCompra {
  id: number;
  produto_id: number;
  produto: string;
  codigo?: string | null;
  unidade: string;
  fornecedor?: string | null;
  quantidade: string;
  custo_estimado: string;
  estoque_no_momento: string;
  estoque_minimo: string;
  total_estimado: string;
  observacao?: string | null;
  /** Nulo enquanto ninguém conferiu a entrega. Zero é "não veio". */
  quantidade_recebida?: string | null;
  total_recebido?: string | null;
  diferenca?: string | null;
}

export interface ListaCompra {
  id: number;
  titulo: string;
  status: StatusCompra;
  comprador?: string | null;
  observacao?: string | null;
  usuario_nome?: string | null;
  criado_em: string;
  enviada_em?: string | null;
  concluida_em?: string | null;
  itens: ItemCompra[];
  total_estimado: string;
  quantidade_itens: number;
  total_recebido?: string | null;
  itens_conferidos: number;
  itens_completos: number;
  itens_faltando: number;
}

export interface SugestaoCompra {
  produto_id: number;
  produto: string;
  codigo?: string | null;
  unidade: string;
  fornecedor?: string | null;
  estoque_atual: string;
  estoque_minimo: string;
  sugestao: string;
  custo_estimado: string;
  total_estimado: string;
}

export interface RelatorioCompra {
  titulo: string;
  texto: string;
  total_estimado: string;
  quantidade_itens: number;
}
