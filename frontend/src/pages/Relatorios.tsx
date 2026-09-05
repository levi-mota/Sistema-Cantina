import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, mensagemErro } from "../lib/api";
import { brl, dataBr, hojeIso, porcentagem, primeiroDiaDoMes, qtd } from "../lib/format";
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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const params = { inicio, fim };
    try {
      const [d, m, a, v] = await Promise.all([
        api.get<Dre>("/relatorios/dre-simplificado", { params }),
        api.get<MaisVendido[]>("/relatorios/produtos-mais-vendidos", {
          params: { ...params, limite: 10 },
        }),
        api.get<LinhaAbc[]>("/relatorios/curva-abc", { params }),
        api.get<VendaDia[]>("/relatorios/vendas-por-dia", { params }),
      ]);
      setDre(d.data);
      setMaisVendidos(m.data);
      setAbc(a.data);
      setPorDia(v.data);
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
        descricao="Resultado do periodo, produtos campeoes e curva ABC"
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
        </>
      )}
    </>
  );
}
