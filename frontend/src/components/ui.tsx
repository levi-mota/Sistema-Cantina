import { useEffect } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
} from "react";
import { Loader2, X } from "lucide-react";

import { valorDigitado } from "../lib/format";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Botao                                                                      */
/* -------------------------------------------------------------------------- */
type Variante = "primario" | "secundario" | "perigo" | "fantasma" | "sucesso";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 focus-visible:ring-marca-500",
  secundario:
    "bg-superficie text-carvao-700 border border-carvao-200 hover:bg-carvao-50 focus-visible:ring-carvao-400",
  perigo: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  sucesso: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500",
  fantasma: "text-carvao-600 hover:bg-carvao-100 focus-visible:ring-carvao-400",
};

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  carregando?: boolean;
  icone?: ReactNode;
}

export function Botao({
  variante = "primario",
  carregando,
  icone,
  className,
  children,
  disabled,
  ...props
}: BotaoProps) {
  return (
    <button
      {...props}
      disabled={disabled || carregando}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
        "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTES[variante],
        className,
      )}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : icone}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Campos de formulario                                                       */
/* -------------------------------------------------------------------------- */
interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo?: string;
  dica?: string;
  /** No React 19 a ref e uma prop comum de componente de funcao. */
  ref?: Ref<HTMLInputElement>;
}

export function Campo({ rotulo, dica, className, ref, ...props }: CampoProps) {
  return (
    <label className="block">
      {rotulo && <span className="rotulo">{rotulo}</span>}
      <input {...props} ref={ref} className={cx("campo", className)} />
      {dica && <span className="mt-1 block text-xs text-carvao-400">{dica}</span>}
    </label>
  );
}

interface CampoValorProps extends Omit<CampoProps, "onChange" | "value" | "type"> {
  /** O texto como está na tela: "1.234,56". */
  value: string;
  /** Recebe o texto já formatado, pronto para voltar ao estado. */
  aoMudar: (valor: string) => void;
}

/**
 * Campo de dinheiro no padrão brasileiro. Quem digita põe a vírgula dos
 * centavos; os pontos de milhar aparecem sozinhos.
 *
 * É `text`, e não `number`: campo numérico do navegador não aceita vírgula em
 * boa parte dos teclados e ainda oferece setinhas de centavo que ninguém usa.
 */
export function CampoValor({ value, aoMudar, ...props }: CampoValorProps) {
  return (
    <Campo
      {...props}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => aoMudar(valorDigitado(e.target.value))}
    />
  );
}

interface SeletorProps extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo?: string;
  opcoes: { valor: string | number; texto: string }[];
  vazio?: string;
}

export function Seletor({ rotulo, opcoes, vazio, className, ...props }: SeletorProps) {
  return (
    <label className="block">
      {rotulo && <span className="rotulo">{rotulo}</span>}
      <select {...props} className={cx("campo", className)}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Estruturais                                                                */
/* -------------------------------------------------------------------------- */
export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("cartao", className)}>{children}</div>;
}

export function TituloPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-carvao-900 sm:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-carvao-600">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

const TONS = {
  neutro: "bg-carvao-100 text-carvao-700",
  sucesso: "bg-emerald-100 text-emerald-800",
  alerta: "bg-amber-100 text-amber-800",
  perigo: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-800",
  marca: "bg-marca-100 text-marca-800",
} as const;

export function Selo({
  tom = "neutro",
  children,
}: {
  tom?: keyof typeof TONS;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONS[tom],
      )}
    >
      {children}
    </span>
  );
}

export function Carregando({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-carvao-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {texto}
    </div>
  );
}

export function Vazio({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-semibold text-carvao-700">{titulo}</p>
      {descricao && <p className="mt-1 text-sm text-carvao-500">{descricao}</p>}
    </div>
  );
}

export function Erro({ mensagem }: { mensagem?: string | null }) {
  if (!mensagem) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {mensagem}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */
export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
  largura = "max-w-2xl",
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", fechar);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", fechar);
      document.body.style.overflow = "";
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-menu/60 p-0 sm:items-center sm:p-4">
      <div
        className={cx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-xl",
          largura,
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-carvao-100 bg-superficie px-5 py-3">
          <h2 className="font-bold text-carvao-900">{titulo}</h2>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-carvao-400 hover:bg-carvao-100 hover:text-carvao-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabela responsiva                                                          */
/* -------------------------------------------------------------------------- */
export function Tabela({ cabecalho, children }: { cabecalho: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-carvao-100 bg-carvao-50/60 text-left">
            {cabecalho.map((c, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-carvao-600"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-carvao-100">{children}</tbody>
      </table>
    </div>
  );
}
