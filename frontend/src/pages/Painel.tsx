import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, Receipt, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, mensagemErro } from "../lib/api";
import { brl, dataBr, hojeIso, rotulo } from "../lib/format";
import type { Dashboard } from "../lib/tipos";
import { Cartao, Carregando, Erro, TituloPagina, Vazio, cx } from "../components/ui";

interface PontoGrafico {
  dia: string;
  total: number;
}

interface FatiaPagamento {
  forma: string;
  total: number;
  quantidade: number;
}

const CORES: Record<string, string> = {
  DINHEIRO: "#f59e0b",
  PIX: "#0ea5e9",
  DEBITO: "#10b981",
  CREDITO: "#8b5cf6",
  FIADO: "#f43f5e",
};

const PERIODOS = [
  { dias: 30, texto: "30 dias" },
  { dias: 90, texto: "90 dias" },
] as const;

function Indicador({
  titulo,
  valor,
  detalhe,
  icone: Icone,
  tom,
  para,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icone: LucideIcon;
  tom: "marca" | "verde" | "azul" | "vermelho";
  para: string;
}) {
  const tons = {
    marca: "bg-marca-100 text-marca-700",
    verde: "bg-emerald-100 text-emerald-700",
    azul: "bg-sky-100 text-sky-700",
    vermelho: "bg-red-100 text-red-700",
  };

  return (
    <Link to={para}>
      <Cartao className="h-full p-4 transition hover:shadow-md sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-carvao-500">
            {titulo}
          </p>
          <span className={cx("rounded-lg p-2", tons[tom])}>
            <Icone className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-2 truncate text-2xl font-bold text-carvao-900 sm:text-3xl">{valor}</p>
        <p className="mt-0.5 text-xs text-carvao-500">{detalhe}</p>
      </Cartao>
    </Link>
  );
}

export default function Painel() {
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [serie, setSerie] = useState<PontoGrafico[]>([]);
  const [pagamentos, setPagamentos] = useState<FatiaPagamento[]>([]);
  const [dias, setDias] = useState<number>(90);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setErro(null);
    // O período vale para os dois gráficos: eles contam a mesma história.
    const params = { inicio: hojeIso(-(dias - 1)), fim: hojeIso() };
    try {
      const [d, s, p] = await Promise.all([
        api.get<Dashboard>("/relatorios/dashboard"),
        api.get<PontoGrafico[]>("/relatorios/vendas-por-dia", { params }),
        api.get<FatiaPagamento[]>("/relatorios/vendas-por-pagamento", { params }),
      ]);
      setDados(d.data);
      setSerie(s.data.map((x) => ({ ...x, total: Number(x.total) })));
      setPagamentos(
        p.data.map((x) => ({ ...x, total: Number(x.total) })).sort((a, b) => b.total - a.total),
      );
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar o painel"));
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <Carregando texto="Montando o painel..." />;
  if (erro) return <Erro mensagem={erro} />;
  if (!dados) return null;

  const totalPeriodo = pagamentos.reduce((soma, p) => soma + p.total, 0);

  return (
    <>
      <TituloPagina titulo="Painel" descricao="Vendas e estoque num relance" />

      {/* Os quatro números que importam de manhã */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          titulo="Vendas hoje"
          valor={brl(dados.vendas_hoje)}
          detalhe={
            dados.qtd_vendas_hoje > 0
              ? `${dados.qtd_vendas_hoje} venda(s) · ticket ${brl(dados.ticket_medio_hoje)}`
              : "Nenhuma venda ainda"
          }
          icone={Receipt}
          tom="marca"
          para="/pdv"
        />
        <Indicador
          titulo="Vendas no mês"
          valor={brl(dados.vendas_mes)}
          detalhe="Acumulado do mês corrente"
          icone={TrendingUp}
          tom="verde"
          para="/relatorios"
        />
        <Indicador
          titulo="Valor em estoque"
          valor={brl(dados.valor_estoque)}
          detalhe="Ao custo médio"
          icone={Boxes}
          tom="azul"
          para="/estoque"
        />
        <Indicador
          titulo="Estoque crítico"
          valor={String(dados.produtos_criticos)}
          detalhe={
            dados.produtos_criticos > 0
              ? "Produto(s) no mínimo ou abaixo"
              : "Nenhum produto no limite"
          }
          icone={AlertTriangle}
          tom={dados.produtos_criticos > 0 ? "vermelho" : "verde"}
          para="/estoque"
        />
      </div>

      {/* Um período só, valendo para os dois gráficos */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-carvao-900">
          Últimos {dias} dias
          {totalPeriodo > 0 && (
            <span className="ml-2 text-sm font-normal text-carvao-500">
              {brl(totalPeriodo)} no período
            </span>
          )}
        </h2>
        <div className="flex gap-1 rounded-lg border border-carvao-200 bg-superficie p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                dias === p.dias
                  ? "bg-marca-600 text-white"
                  : "text-carvao-600 hover:bg-carvao-50",
              )}
            >
              {p.texto}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <Cartao className="p-4 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-carvao-700">Vendas por dia</h3>
          {serie.length === 0 ? (
            <Vazio
              titulo="Sem vendas no período"
              descricao="O gráfico aparece na primeira venda."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie} margin={{ left: -18, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="areaVendas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97e12" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f97e12" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e1" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tickFormatter={(v: string) => v.slice(8, 10) + "/" + v.slice(5, 7)}
                    tick={{ fontSize: 11, fill: "#8d8a83" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#8d8a83" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [brl(Number(v)), "Faturamento"]}
                    labelFormatter={(v) => dataBr(String(v))}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e5e4e1", fontSize: 13 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#f97e12"
                    strokeWidth={2}
                    fill="url(#areaVendas)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Cartao>

        <Cartao className="flex flex-col p-4">
          <h3 className="mb-2 text-sm font-semibold text-carvao-700">Formas de pagamento</h3>
          {pagamentos.length === 0 ? (
            <Vazio titulo="Sem vendas no período" />
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pagamentos}
                      dataKey="total"
                      nameKey="forma"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                      // A animacao de entrada do Pie trava no meio do caminho
                      // (o donut fica um risco). Num grafico de duas fatias ela
                      // nao acrescenta nada, entao desenha direto.
                      isAnimationActive={false}
                    >
                      {pagamentos.map((p) => (
                        <Cell key={p.forma} fill={CORES[p.forma] ?? "#8d8a83"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [brl(Number(v)), rotulo(String(n))]}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #e5e4e1",
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* A legenda vira tabelinha: a cor sozinha não diz o valor */}
              <ul className="mt-2 space-y-2">
                {pagamentos.map((p) => (
                  <li key={p.forma} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: CORES[p.forma] ?? "#8d8a83" }}
                    />
                    <span className="flex-1 text-carvao-600">{rotulo(p.forma)}</span>
                    <span className="text-xs text-carvao-400">
                      {totalPeriodo > 0 ? Math.round((p.total / totalPeriodo) * 100) : 0}%
                    </span>
                    <span className="w-20 text-right font-semibold text-carvao-900">
                      {brl(p.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>
      </div>
    </>
  );
}
