import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
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
import { brl, dataBr } from "../lib/format";
import type { Dashboard, Produto, Titulo } from "../lib/tipos";
import { Cartao, Carregando, Erro, Selo, TituloPagina, Vazio } from "../components/ui";

interface PontoGrafico {
  dia: string;
  total: number;
  quantidade: number;
}

interface FatiaPagamento {
  forma: string;
  total: number;
}

const CORES = ["#f97e12", "#0ea5e9", "#10b981", "#8b5cf6", "#f43f5e"];

function Indicador({
  titulo,
  valor,
  detalhe,
  icone: Icone,
  tom = "marca",
  para,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  icone: LucideIcon;
  tom?: "marca" | "verde" | "vermelho" | "azul";
  para?: string;
}) {
  const tons = {
    marca: "bg-marca-100 text-marca-700",
    verde: "bg-emerald-100 text-emerald-700",
    vermelho: "bg-red-100 text-red-700",
    azul: "bg-sky-100 text-sky-700",
  };

  const conteudo = (
    <Cartao className="h-full p-4 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-carvao-500">{titulo}</p>
          <p className="mt-1.5 truncate text-2xl font-bold text-carvao-900">{valor}</p>
          {detalhe && <p className="mt-0.5 text-xs text-carvao-500">{detalhe}</p>}
        </div>
        <span className={`rounded-lg p-2 ${tons[tom]}`}>
          <Icone className="h-5 w-5" />
        </span>
      </div>
    </Cartao>
  );

  return para ? <Link to={para}>{conteudo}</Link> : conteudo;
}

export default function Painel() {
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [serie, setSerie] = useState<PontoGrafico[]>([]);
  const [pagamentos, setPagamentos] = useState<FatiaPagamento[]>([]);
  const [criticos, setCriticos] = useState<Produto[]>([]);
  const [vencendo, setVencendo] = useState<Titulo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Dashboard>("/relatorios/dashboard"),
      api.get<PontoGrafico[]>("/relatorios/vendas-por-dia"),
      api.get<FatiaPagamento[]>("/relatorios/vendas-por-pagamento"),
      api.get<Produto[]>("/estoque/produtos", { params: { somente_criticos: true, limite: 6 } }),
      api.get<Titulo[]>("/financeiro/titulos", { params: { status_titulo: "ABERTO", limite: 6 } }),
    ])
      .then(([d, s, p, c, t]) => {
        setDados(d.data);
        setSerie(s.data.map((x) => ({ ...x, total: Number(x.total) })));
        setPagamentos(p.data.map((x) => ({ ...x, total: Number(x.total) })));
        setCriticos(c.data);
        setVencendo(t.data);
      })
      .catch((e) => setErro(mensagemErro(e, "Falha ao carregar o painel")))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <Carregando texto="Montando o painel..." />;
  if (erro) return <Erro mensagem={erro} />;
  if (!dados) return null;

  return (
    <>
      <TituloPagina
        titulo="Painel"
        descricao="Visão geral da cantina: vendas, estoque e financeiro"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          titulo="Vendas hoje"
          valor={brl(dados.vendas_hoje)}
          detalhe={`${dados.qtd_vendas_hoje} venda(s) · ticket ${brl(dados.ticket_medio_hoje)}`}
          icone={Receipt}
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
          titulo="A receber"
          valor={brl(dados.a_receber)}
          detalhe={dados.a_receber_vencido > 0 ? `${brl(dados.a_receber_vencido)} vencido` : "Em dia"}
          icone={ArrowDownCircle}
          tom={dados.a_receber_vencido > 0 ? "vermelho" : "azul"}
          para="/contas-a-receber"
        />
        <Indicador
          titulo="A pagar"
          valor={brl(dados.a_pagar)}
          detalhe={dados.a_pagar_vencido > 0 ? `${brl(dados.a_pagar_vencido)} vencido` : "Em dia"}
          icone={ArrowUpCircle}
          tom={dados.a_pagar_vencido > 0 ? "vermelho" : "azul"}
          para="/contas-a-pagar"
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
          titulo="Itens críticos"
          valor={String(dados.produtos_criticos)}
          detalhe="No mínimo ou abaixo"
          icone={AlertTriangle}
          tom={dados.produtos_criticos > 0 ? "vermelho" : "verde"}
          para="/estoque"
        />
        <Indicador
          titulo="Saldo projetado"
          valor={brl(dados.a_receber - dados.a_pagar)}
          detalhe="A receber menos a pagar"
          icone={Wallet}
          tom={dados.a_receber - dados.a_pagar >= 0 ? "verde" : "vermelho"}
        />
        <Indicador
          titulo="Equipe ativa"
          valor={String(dados.funcionarios_ativos)}
          detalhe="Funcionários cadastrados"
          icone={TrendingUp}
          para="/funcionarios"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Cartao className="p-4 lg:col-span-2">
          <h2 className="mb-4 font-bold text-carvao-900">Vendas dos últimos 30 dias</h2>
          <div className="h-64">
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
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#8d8a83" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}`}
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
        </Cartao>

        <Cartao className="p-4">
          <h2 className="mb-4 font-bold text-carvao-900">Formas de pagamento</h2>
          {pagamentos.length === 0 ? (
            <Vazio titulo="Sem vendas no período" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pagamentos}
                    dataKey="total"
                    nameKey="forma"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={2}
                  >
                    {pagamentos.map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [brl(Number(v)), String(n)]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e5e4e1", fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {pagamentos.map((p, i) => (
              <span key={p.forma} className="flex items-center gap-1.5 text-carvao-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CORES[i % CORES.length] }}
                />
                {p.forma}
              </span>
            ))}
          </div>
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-carvao-900">Estoque crítico</h2>
            <Link to="/estoque" className="text-sm font-semibold text-marca-600 hover:underline">
              Ver estoque
            </Link>
          </div>
          {criticos.length === 0 ? (
            <Vazio titulo="Tudo em ordem" descricao="Nenhum produto abaixo do mínimo." />
          ) : (
            <ul className="divide-y divide-carvao-100">
              {criticos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-carvao-800">{p.nome}</p>
                    <p className="text-xs text-carvao-500">
                      Mínimo {Number(p.estoque_minimo)} {p.unidade}
                    </p>
                  </div>
                  <Selo tom={Number(p.estoque_atual) <= 0 ? "perigo" : "alerta"}>
                    {Number(p.estoque_atual)} {p.unidade}
                  </Selo>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-carvao-900">Titulos em aberto</h2>
            <Link
              to="/contas-a-pagar"
              className="text-sm font-semibold text-marca-600 hover:underline"
            >
              Ver financeiro
            </Link>
          </div>
          {vencendo.length === 0 ? (
            <Vazio titulo="Nada em aberto" />
          ) : (
            <ul className="divide-y divide-carvao-100">
              {vencendo.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-carvao-800">{t.descricao}</p>
                    <p className="text-xs text-carvao-500">
                      {t.tipo === "PAGAR" ? "Pagar" : "Receber"} · vence {dataBr(t.vencimento)}
                    </p>
                  </div>
                  <Selo tom={t.vencido ? "perigo" : t.tipo === "PAGAR" ? "alerta" : "sucesso"}>
                    {brl(t.saldo)}
                  </Selo>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
