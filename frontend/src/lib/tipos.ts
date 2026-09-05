export type Perfil = "ADMIN" | "GERENTE" | "OPERADOR";
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
  email: string;
  perfil: Perfil;
  cargo?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  salario?: string | null;
  data_admissao?: string | null;
  data_demissao?: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface RegistroPonto {
  id: number;
  usuario_id: number;
  usuario_nome?: string | null;
  data: string;
  entrada?: string | null;
  saida?: string | null;
  observacao?: string | null;
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
  limite_credito: string;
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
  usuario_nome?: string | null;
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
  a_receber: number;
  a_receber_vencido: number;
  a_pagar: number;
  a_pagar_vencido: number;
  funcionarios_ativos: number;
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
