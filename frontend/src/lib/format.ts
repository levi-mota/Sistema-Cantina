const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function brl(valor: string | number | null | undefined): string {
  return moeda.format(Number(valor ?? 0));
}

export function qtd(valor: string | number | null | undefined): string {
  return numero.format(Number(valor ?? 0));
}

/**
 * Normaliza uma quantidade para caixa de formulário. Tudo é contado por
 * unidade, então "12.000" que vem da API vira "12" -- ninguém digita casas
 * decimais num campo de unidades.
 */
export function inteiro(valor: string | number | null | undefined): string {
  const numero = Math.trunc(Number(valor ?? 0));
  return Number.isFinite(numero) ? String(numero) : "0";
}

/** Só dígitos: o que se digita num campo de unidades. */
export function apenasDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/**
 * Formata o que se digita num campo de dinheiro, no padrão brasileiro: o
 * usuário digita a vírgula dos centavos, o sistema põe os pontos de milhar.
 *
 * Mantém o texto "em construção" -- "1.234," continua assim enquanto se
 * digita, senão a vírgula sumiria a cada tecla e seria impossível chegar aos
 * centavos. Só o que não é número nem vírgula é descartado.
 */
export function valorDigitado(texto: string): string {
  const limpo = texto.replace(/[^\d,]/g, "");
  const [inteiro, ...resto] = limpo.split(",");
  const centavos = resto.join("").slice(0, 2);
  // Sem zeros à esquerda, mas "0," precisa sobreviver para virar "0,50".
  const inteiroLimpo = inteiro.replace(/^0+(?=\d)/, "");
  const comPontos = inteiroLimpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (!limpo.includes(",")) return comPontos;
  return `${comPontos || "0"},${centavos}`;
}

/** "1.234,56" -> 1234.56. O caminho de volta, para mandar à API. */
export function valorNumero(texto: string | number | null | undefined): number {
  if (typeof texto === "number") return texto;
  if (!texto) return 0;
  const numero = Number(String(texto).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

/** 2.2 -> "2,20". Para abrir um formulário com o valor que veio da API. */
export function valorTexto(valor: string | number | null | undefined): string {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero)) return "";
  return numero.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, ".");
}

export function porcentagem(valor: string | number | null | undefined, casas = 1): string {
  return `${Number(valor ?? 0).toFixed(casas)}%`;
}

/** Datas ISO vem do backend em UTC, sem sufixo Z; normalizamos antes de exibir. */
function paraData(iso: string): Date {
  const temFuso = /Z|[+-]\d{2}:\d{2}$/.test(iso);
  return new Date(temFuso || !iso.includes("T") ? iso : `${iso}Z`);
}

export function dataHora(iso?: string | null): string {
  if (!iso) return "-";
  return paraData(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function hora(iso?: string | null): string {
  if (!iso) return "-";
  return paraData(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Datas puras (YYYY-MM-DD) nao devem sofrer conversao de fuso. */
export function dataBr(iso?: string | null): string {
  if (!iso) return "-";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function hojeIso(deslocamentoDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return d.toISOString().slice(0, 10);
}

export function primeiroDiaDoMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("sv-SE");
}

export function documentoFormatado(doc?: string | null): string {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "-";
}

export function telefoneFormatado(tel?: string | null): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return tel ?? "-";
}


/**
 * Rotulo de exibicao para os valores de enum da API.
 *
 * Os valores em si (SAIDA, CONCLUIDA, USUARIO) fazem parte do contrato e nao
 * podem mudar; o que muda e como eles aparecem na tela.
 */
const ROTULOS: Record<string, string> = {
  SAIDA: "Saída",
  ENTRADA: "Entrada",
  AJUSTE: "Ajuste",
  PERDA: "Perda",
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  FIADO: "Fiado",
  ABERTO: "Aberto",
  PARCIAL: "Parcial",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
  VENCIDO: "Vencido",
  FINAL: "Produto final",
  INSUMO: "Uso e consumo",
  RASCUNHO: "Rascunho",
  ENVIADA: "Enviada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  ABERTA: "Aberta",
  FECHADA: "Fechada",
  ADMIN: "Administrador",
  USUARIO: "Usuário",
  CLIENTE: "Cliente",
  FORNECEDOR: "Fornecedor",
  AMBOS: "Cliente e fornecedor",
  SANGRIA: "Sangria",
  SUPRIMENTO: "Suprimento",
};

export function rotulo(valor?: string | null): string {
  if (!valor) return "-";
  return ROTULOS[valor] ?? valor;
}
