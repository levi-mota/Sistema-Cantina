import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, mensagemErro } from "../lib/api";
import { brl, dataBr, dataHora, hojeIso, porcentagem, primeiroDiaDoMes, qtd } from "../lib/format";
import { Botao, Campo, Cartao, Carregando, Erro, Selo, Tabela, TituloPagina, Vazio } from "../components/ui";

interface MaisVendido {
  produto_id: number;
  produto: string;
  quantidade: string;
  faturamento: string;
  lucro_bruto: string;
}

interface Dre {
  receita_bruta: number;
  cmv: number;
  lucro_bruto: number;
  margem_bruta: number;
  despesas_pagas: number;
  resultado: number;
}

interface LinhaAbc {
  produto: string;
  faturamento: string;
  participacao: number;
  acumulado: number;
  classe: "A" | "B" | "C";
}

interface VendaDia {
  dia: string;
  total: string;
  quantidade: number;
}

interface FormaPagamento {
  forma: string;
  total: string;
  quantidade: number;
  desconto: string;
  ticket_medio: string;
  participacao: number;
}

interface ResumoPagamentos {
  formas: FormaPagamento[];
  total_geral: string;
  quantidade_geral: number;
  ticket_medio_geral: string;
}

interface PagamentoDia {
  dia: string;
  total: string;
  DINHEIRO?: string;
  PIX?: string;
}

interface QuebraOperador {
  usuario_id: number;
  operador: string;
  turnos: number;
  turnos_exatos: number;
  turnos_com_sobra: number;
  turnos_com_falta: number;
  sobras: string;
  faltas: string;
  saldo: string;
  maior_falta: string;
  movimentado: string;
  falta_percentual: number;
  precisao: number;
}

interface TurnoComQuebra {
  sessao_id: number;
  caixa: string | null;
  operador: string | null;
  fechado_por: string | null;
  fechado_em: string | null;
  esperado: string;
  contado: string;
  diferenca: string;
  observacao: string | null;
}

/** Gera um CSV a partir de qualquer lista e dispara o download no navegador. */
function baixarCsv(nome: string, linhas: object[]) {
  if (linhas.length === 0) return;
  const registros = linhas as Record<string, unknown>[];
  const colunas = Object.keys(registros[0]);
  const conteudo = [
    colunas.join(";"),
    ...registros.map((l) =>
      colunas.map((c) => String(l[c] ?? "").replace(/;/g, ",")).join(";"),
    ),
  ].join("\n");

  const url = URL.createObjectURL(new Blob([`﻿${conteudo}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nome}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Relatorios() {
  const [inicio, setInicio] = useState(primeiroDiaDoMes());
  const [fim, setFim] = useState(hojeIso());
  const [dre, setDre] = useState<Dre | null>(null);
  const [maisVendidos, setMaisVendidos] = useState<MaisVendido[]>([]);
  const [abc, setAbc] = useState<LinhaAbc[]>([]);
  const [porDia, setPorDia] = useState<VendaDia[]>([]);
  const [pagamentos, setPagamentos] = useState<ResumoPagamentos | null>(null);
  const [pagamentosDia, setPagamentosDia] = useState<PagamentoDia[]>([]);
  const [quebras, setQuebras] = useState<QuebraOperador[]>([]);
  const [turnosRuins, setTurnosRuins] = useState<TurnoComQuebra[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const params = { inicio, fim };
    try {
      const [d, m, a, v, q, t, pg, pd] = await Promise.all([
        api.get<Dre>("/relatorios/dre-simplificado", { params }),
        api.get<MaisVendido[]>("/relatorios/produtos-mais-vendidos", {
          params: { ...params, limite: 10 },
        }),
        api.get<LinhaAbc[]>("/relatorios/curva-abc", { params }),
        api.get<VendaDia[]>("/relatorios/vendas-por-dia", { params }),
        api.get<QuebraOperador[]>("/relatorios/quebras-por-operador", { params }),
        api.get<TurnoComQuebra[]>("/relatorios/quebras-detalhe", {
          params: { ...params, limite: 10 },
        }),
        api.get<ResumoPagamentos>("/relatorios/pagamentos", { params }),
        api.get<PagamentoDia[]>("/relatorios/pagamentos-por-dia", { params }),
      ]);
      setDre(d.data);
      setMaisVendidos(m.data);
      setAbc(a.data);
      setPorDia(v.data);
      setQuebras(q.data);
      setTurnosRuins(t.data);
      setPagamentos(pg.data);
      setPagamentosDia(pd.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <TituloPagina
        titulo="Relatorios"
        descricao="Resultado, formas de pagamento, produtos campeoes, curva ABC e quebras de caixa"
      />

      <Cartao className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo
            rotulo="Inicio"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
          <Campo rotulo="Fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          <Botao onClick={carregar} carregando={carregando}>
            Atualizar
          </Botao>
        </div>
      </Cartao>

      <Erro mensagem={erro} />

      {carregando ? (
        <Carregando texto="Calculando..." />
      ) : (
        <>
          {dre && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[
                { r: "Receita bruta", v: brl(dre.receita_bruta), t: "text-carvao-900" },
                { r: "Custo das mercadorias", v: brl(dre.cmv), t: "text-carvao-700" },
                {
                  r: "Lucro bruto",
                  v: brl(dre.lucro_bruto),
                  t: "text-emerald-600",
                  d: `Margem ${porcentagem(dre.margem_bruta)}`,
                },
                { r: "Despesas pagas", v: brl(dre.despesas_pagas), t: "text-red-600" },
                {
                  r: "Resultado do periodo",
                  v: brl(dre.resultado),
                  t: dre.resultado >= 0 ? "text-emerald-600" : "text-red-600",
                },
                {
                  r: "Vendas registradas",
                  v: String(porDia.reduce((s, d) => s + d.quantidade, 0)),
                  t: "text-carvao-900",
                },
              ].map((c) => (
                <Cartao key={c.r} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-carvao-500">
                    {c.r}
                  </p>
                  <p className={`mt-1 text-xl font-bold sm:text-2xl ${c.t}`}>{c.v}</p>
                  {c.d && <p className="mt-0.5 text-xs text-carvao-500">{c.d}</p>}
                </Cartao>
              ))}
            </div>
          )}

          <Cartao className="mb-4 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-carvao-900">Faturamento por dia</h2>
              <Botao
                variante="secundario"
                icone={<Download className="h-4 w-4" />}
                onClick={() => baixarCsv(`vendas_${inicio}_a_${fim}`, porDia)}
              >
                CSV
              </Botao>
            </div>
            {porDia.length === 0 ? (
              <Vazio titulo="Sem vendas no periodo" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={porDia.map((d) => ({ ...d, total: Number(d.total) }))}
                    margin={{ left: -18, right: 8, top: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e1" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tickFormatter={(v: string) => v.slice(8, 10) + "/" + v.slice(5, 7)}
                      tick={{ fontSize: 11, fill: "#8d8a83" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={14}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#8d8a83" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => [brl(Number(v)), "Faturamento"]}
                      labelFormatter={(v) => dataBr(String(v))}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e5e4e1", fontSize: 13 }}
                      cursor={{ fill: "#f7f7f6" }}
                    />
                    <Bar dataKey="total" fill="#f97e12" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-carvao-100 px-4 py-3">
                <h2 className="font-bold text-carvao-900">Mais vendidos</h2>
                <Botao
                  variante="secundario"
                  icone={<Download className="h-4 w-4" />}
                  onClick={() => baixarCsv(`mais_vendidos_${inicio}_a_${fim}`, maisVendidos)}
                >
                  CSV
                </Botao>
              </div>
              {maisVendidos.length === 0 ? (
                <Vazio titulo="Sem dados no periodo" />
              ) : (
                <Tabela cabecalho={["Produto", "Qtd", "Faturamento", "Lucro bruto"]}>
                  {maisVendidos.map((p) => (
                    <tr key={p.produto_id} className="hover:bg-carvao-50/60">
                      <td className="px-4 py-2.5 font-medium text-carvao-800">{p.produto}</td>
                      <td className="px-4 py-2.5 text-carvao-600">{qtd(p.quantidade)}</td>
                      <td className="px-4 py-2.5 font-semibold text-carvao-900">
                        {brl(p.faturamento)}
                      </td>
                      <td className="px-4 py-2.5 text-emerald-700">{brl(p.lucro_bruto)}</td>
                    </tr>
                  ))}
                </Tabela>
              )}
            </Cartao>

            <Cartao className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-carvao-100 px-4 py-3">
                <div>
                  <h2 className="font-bold text-carvao-900">Curva ABC</h2>
                  <p className="text-xs text-carvao-500">
                    A = 80% do faturamento · B = ate 95% · C = cauda
                  </p>
                </div>
                <Botao
                  variante="secundario"
                  icone={<Download className="h-4 w-4" />}
                  onClick={() => baixarCsv(`curva_abc_${inicio}_a_${fim}`, abc)}
                >
                  CSV
                </Botao>
              </div>
              {abc.length === 0 ? (
                <Vazio titulo="Sem dados no periodo" />
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Tabela cabecalho={["Produto", "Faturamento", "Part.", "Classe"]}>
                    {abc.map((l) => (
                      <tr key={l.produto} className="hover:bg-carvao-50/60">
                        <td className="px-4 py-2.5 font-medium text-carvao-800">{l.produto}</td>
                        <td className="px-4 py-2.5 text-carvao-600">{brl(l.faturamento)}</td>
                        <td className="px-4 py-2.5 text-carvao-600">
                          {porcentagem(l.participacao)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Selo
                            tom={l.classe === "A" ? "sucesso" : l.classe === "B" ? "info" : "neutro"}
                          >
                            {l.classe}
                          </Selo>
                        </td>
                      </tr>
                    ))}
                  </Tabela>
                </div>
              )}
            </Cartao>
          </div>

          {/* Recebimento por forma de pagamento */}
          {pagamentos && pagamentos.formas.length > 0 && (
            <Cartao className="mt-4 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carvao-100 px-4 py-3">
                <div>
                  <h2 className="font-bold text-carvao-900">Recebimento por forma de pagamento</h2>
                  <p className="text-xs text-carvao-500">
                    Quanto entrou em cada forma. O dinheiro e o que deve bater com a gaveta; o
                    PIX, com o extrato do banco.
                  </p>
                </div>
                <Botao
                  variante="secundario"
                  icone={<Download className="h-4 w-4" />}
                  onClick={() => baixarCsv(`pagamentos_${inicio}_a_${fim}`, pagamentos.formas)}
                >
                  CSV
                </Botao>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {pagamentos.formas.map((f) => (
                  <div key={f.forma} className="rounded-xl border border-carvao-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-carvao-500">
                        {f.forma}
                      </span>
                      <Selo tom={f.forma === "DINHEIRO" ? "alerta" : "info"}>
                        {porcentagem(f.participacao, 1)}
                      </Selo>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-carvao-900">{brl(f.total)}</p>
                    <p className="text-xs text-carvao-500">
                      {f.quantidade} venda(s) · ticket {brl(f.ticket_medio)}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-carvao-100">
                      <div
                        className={f.forma === "DINHEIRO" ? "h-full bg-amber-500" : "h-full bg-sky-500"}
                        style={{ width: `${Math.min(f.participacao, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}

                <div className="rounded-xl border border-carvao-200 bg-carvao-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-carvao-500">
                    Total recebido
                  </span>
                  <p className="mt-1 text-2xl font-bold text-carvao-900">
                    {brl(pagamentos.total_geral)}
                  </p>
                  <p className="text-xs text-carvao-500">
                    {pagamentos.quantidade_geral} venda(s) · ticket{" "}
                    {brl(pagamentos.ticket_medio_geral)}
                  </p>
                </div>
              </div>

              {pagamentosDia.length > 0 && (
                <div className="border-t border-carvao-100 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-carvao-700">
                    Dia a dia, por forma
                  </h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pagamentosDia.map((d) => ({
                          dia: d.dia,
                          DINHEIRO: Number(d.DINHEIRO ?? 0),
                          PIX: Number(d.PIX ?? 0),
                        }))}
                        margin={{ left: -18, right: 8, top: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e1" vertical={false} />
                        <XAxis
                          dataKey="dia"
                          tickFormatter={(v: string) => v.slice(8, 10) + "/" + v.slice(5, 7)}
                          tick={{ fontSize: 11, fill: "#8d8a83" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={14}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#8d8a83" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(v, n) => [brl(Number(v)), String(n)]}
                          labelFormatter={(v) => dataBr(String(v))}
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #e5e4e1",
                            fontSize: 13,
                          }}
                          cursor={{ fill: "#f7f7f6" }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="DINHEIRO" stackId="p" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="PIX" stackId="p" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Botao
                      variante="secundario"
                      icone={<Download className="h-4 w-4" />}
                      onClick={() =>
                        baixarCsv(`pagamentos_por_dia_${inicio}_a_${fim}`, pagamentosDia)
                      }
                    >
                      CSV dia a dia
                    </Botao>
                  </div>
                </div>
              )}
            </Cartao>
          )}

          {/* Quebras de caixa por operador */}
          <Cartao className="mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carvao-100 px-4 py-3">
              <div>
                <h2 className="font-bold text-carvao-900">Quebras de caixa por operador</h2>
                <p className="text-xs text-carvao-500">
                  Diferenca entre o dinheiro contado e o esperado nos turnos fechados. A quebra e
                  de quem operou a gaveta, mesmo que outra pessoa tenha fechado o turno.
                </p>
              </div>
              <Botao
                variante="secundario"
                icone={<Download className="h-4 w-4" />}
                onClick={() => baixarCsv(`quebras_operador_${inicio}_a_${fim}`, quebras)}
              >
                CSV
              </Botao>
            </div>

            {quebras.length === 0 ? (
              <Vazio
                titulo="Nenhum turno fechado no periodo"
                descricao="As quebras aparecem aqui conforme os caixas forem fechados."
              />
            ) : (
              <>
                <div className="hidden lg:block">
                  <Tabela
                    cabecalho={[
                      "Operador",
                      "Turnos",
                      "Fechou certo",
                      "Faltou",
                      "Sobrou",
                      "Saldo",
                      "Maior falta",
                      "Falta / gaveta",
                    ]}
                  >
                    {quebras.map((q) => {
                      const saldo = Number(q.saldo);
                      return (
                        <tr key={q.usuario_id} className="hover:bg-carvao-50/60">
                          <td className="px-4 py-2.5 font-medium text-carvao-800">{q.operador}</td>
                          <td className="px-4 py-2.5 text-carvao-600">{q.turnos}</td>
                          <td className="px-4 py-2.5">
                            <Selo
                              tom={
                                q.precisao >= 80
                                  ? "sucesso"
                                  : q.precisao >= 60
                                    ? "alerta"
                                    : "perigo"
                              }
                            >
                              {q.turnos_exatos} de {q.turnos} ({porcentagem(q.precisao, 0)})
                            </Selo>
                          </td>
                          <td className="px-4 py-2.5 text-red-600">
                            {brl(q.faltas)}
                            <span className="ml-1 text-xs text-carvao-400">
                              ({q.turnos_com_falta}x)
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-carvao-600">
                            {brl(q.sobras)}
                            <span className="ml-1 text-xs text-carvao-400">
                              ({q.turnos_com_sobra}x)
                            </span>
                          </td>
                          <td
                            className={`px-4 py-2.5 font-bold ${
                              saldo < 0
                                ? "text-red-600"
                                : saldo > 0
                                  ? "text-sky-700"
                                  : "text-emerald-600"
                            }`}
                          >
                            {brl(q.saldo)}
                          </td>
                          <td className="px-4 py-2.5 text-carvao-600">{brl(q.maior_falta)}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={
                                q.falta_percentual >= 1
                                  ? "font-semibold text-red-600"
                                  : "text-carvao-600"
                              }
                            >
                              {porcentagem(q.falta_percentual, 2)}
                            </span>
                            <p className="text-xs text-carvao-400">de {brl(q.movimentado)}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </Tabela>
                </div>

                {/* Celular: um cartao por operador */}
                <ul className="divide-y divide-carvao-100 lg:hidden">
                  {quebras.map((q) => (
                    <li key={q.usuario_id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-carvao-900">{q.operador}</p>
                          <p className="text-xs text-carvao-500">
                            {q.turnos} turno(s) · fechou certo em {q.turnos_exatos}
                          </p>
                        </div>
                        <Selo
                          tom={
                            q.precisao >= 80 ? "sucesso" : q.precisao >= 60 ? "alerta" : "perigo"
                          }
                        >
                          {porcentagem(q.precisao, 0)}
                        </Selo>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-carvao-500">Faltou</p>
                          <p className="font-semibold text-red-600">{brl(q.faltas)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-carvao-500">Sobrou</p>
                          <p className="font-semibold text-carvao-700">{brl(q.sobras)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-carvao-500">Saldo</p>
                          <p
                            className={`font-semibold ${
                              Number(q.saldo) < 0 ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {brl(q.saldo)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Cartao>

          {/* Turnos que puxaram o resultado para baixo */}
          {turnosRuins.length > 0 && (
            <Cartao className="mt-4 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carvao-100 px-4 py-3">
                <h2 className="flex items-center gap-2 font-bold text-carvao-900">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Turnos com maior diferenca
                </h2>
                <Botao
                  variante="secundario"
                  icone={<Download className="h-4 w-4" />}
                  onClick={() => baixarCsv(`turnos_com_quebra_${inicio}_a_${fim}`, turnosRuins)}
                >
                  CSV
                </Botao>
              </div>
              <Tabela
                cabecalho={[
                  "Turno",
                  "Caixa",
                  "Operador",
                  "Fechado em",
                  "Esperado",
                  "Contado",
                  "Diferenca",
                  "Observacao",
                ]}
              >
                {turnosRuins.map((t) => (
                  <tr key={t.sessao_id} className="hover:bg-carvao-50/60">
                    <td className="px-4 py-2.5 font-medium text-carvao-800">#{t.sessao_id}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{t.caixa}</td>
                    <td className="px-4 py-2.5 text-carvao-600">
                      {t.operador}
                      {t.fechado_por && t.fechado_por !== t.operador && (
                        <p className="text-xs text-carvao-400">fechado por {t.fechado_por}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-carvao-600">
                      {dataHora(t.fechado_em)}
                    </td>
                    <td className="px-4 py-2.5 text-carvao-600">{brl(t.esperado)}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{brl(t.contado)}</td>
                    <td className="px-4 py-2.5">
                      <Selo tom={Number(t.diferenca) < 0 ? "perigo" : "info"}>
                        {brl(t.diferenca)}
                      </Selo>
                    </td>
                    <td className="px-4 py-2.5 text-carvao-500">{t.observacao ?? "-"}</td>
                  </tr>
                ))}
              </Tabela>
            </Cartao>
          )}
        </>
      )}
    </>
  );
}
