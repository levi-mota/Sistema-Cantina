import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { brl, dataBr, hojeIso } from "../lib/format";
import type { FormaPagamento, Parceiro, ResumoFinanceiro, StatusTitulo, Titulo, TipoTitulo } from "../lib/tipos";
import {
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  Modal,
  Selo,
  Seletor,
  Tabela,
  TituloPagina,
  Vazio,
} from "../components/ui";

const FORMAS: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"];

const CATEGORIAS_PAGAR = [
  "Mercadorias",
  "Pessoal",
  "Ocupacao",
  "Utilidades",
  "Insumos",
  "Impostos",
  "Outros",
];
const CATEGORIAS_RECEBER = ["Vendas", "Servicos", "Eventos", "Outros"];

function tomStatus(t: Titulo): "sucesso" | "perigo" | "alerta" | "neutro" | "info" {
  if (t.status === "PAGO") return "sucesso";
  if (t.status === "CANCELADO") return "neutro";
  if (t.vencido) return "perigo";
  if (t.status === "PARCIAL") return "info";
  return "alerta";
}

export default function Financeiro({ tipo }: { tipo: TipoTitulo }) {
  const pagar = tipo === "PAGAR";
  const rotulo = pagar ? "Contas a pagar" : "Contas a receber";

  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<StatusTitulo | "">("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novoAberto, setNovoAberto] = useState(false);
  const [baixando, setBaixando] = useState<Titulo | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    descricao: "",
    categoria: "",
    parceiro_id: "",
    valor: "",
    vencimento: hojeIso(),
    parcelas: "1",
    intervalo_dias: "30",
    observacao: "",
  });
  const [baixa, setBaixa] = useState({
    valor: "",
    data: hojeIso(),
    forma_pagamento: "DINHEIRO" as FormaPagamento,
  });

  const carregar = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        api.get<Titulo[]>("/financeiro/titulos", {
          params: { tipo, status_titulo: filtroStatus || undefined },
        }),
        api.get<ResumoFinanceiro>("/financeiro/resumo"),
      ]);
      setTitulos(t.data);
      setResumo(r.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [tipo, filtroStatus]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
  }, [carregar]);

  useEffect(() => {
    api
      .get<Parceiro[]>("/parceiros", {
        params: { tipo: pagar ? "FORNECEDOR" : "CLIENTE", ativo: true },
      })
      .then(({ data }) => setParceiros(data));
  }, [pagar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await api.post("/financeiro/titulos", {
        tipo,
        descricao: form.descricao,
        categoria: form.categoria || null,
        parceiro_id: form.parceiro_id ? Number(form.parceiro_id) : null,
        valor: Number(form.valor),
        vencimento: form.vencimento,
        observacao: form.observacao || null,
        parcelas: Number(form.parcelas || 1),
        intervalo_dias: Number(form.intervalo_dias || 30),
      });
      setNovoAberto(false);
      setForm({ ...form, descricao: "", valor: "", observacao: "", parcelas: "1" });
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Nao foi possivel criar o titulo"));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarBaixa(e: React.FormEvent) {
    e.preventDefault();
    if (!baixando) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.post(`/financeiro/titulos/${baixando.id}/baixar`, {
        valor: Number(baixa.valor),
        data: baixa.data,
        forma_pagamento: baixa.forma_pagamento,
      });
      setBaixando(null);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Nao foi possivel registrar a baixa"));
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(t: Titulo) {
    if (!confirm(`Cancelar o titulo "${t.descricao}"?`)) return;
    try {
      await api.post(`/financeiro/titulos/${t.id}/cancelar`);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (carregando) return <Carregando texto={`Carregando ${rotulo.toLowerCase()}...`} />;

  const total = pagar ? resumo?.a_pagar_total : resumo?.a_receber_total;
  const vencido = pagar ? resumo?.a_pagar_vencido : resumo?.a_receber_vencido;
  const proximos = pagar ? resumo?.a_pagar_proximos : resumo?.a_receber_proximos;

  return (
    <>
      <TituloPagina
        titulo={rotulo}
        descricao={
          pagar
            ? "Despesas, fornecedores e compras a prazo"
            : "Fiado, mensalidades e recebimentos previstos"
        }
        acoes={
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setNovoAberto(true)}>
            {pagar ? "Nova conta" : "Novo recebimento"}
          </Botao>
        }
      />

      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { rotulo: "Em aberto", valor: total, tom: "text-carvao-900" },
          { rotulo: "Vencido", valor: vencido, tom: "text-red-600" },
          { rotulo: "Proximos 7 dias", valor: proximos, tom: "text-amber-600" },
        ].map((c) => (
          <Cartao key={c.rotulo} className="p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-carvao-500">
              {c.rotulo}
            </p>
            <p className={`mt-1 text-lg font-bold sm:text-2xl ${c.tom}`}>{brl(c.valor ?? 0)}</p>
          </Cartao>
        ))}
      </div>

      <div className="mb-4">
        <Seletor
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as StatusTitulo | "")}
          vazio="Todos os status"
          className="sm:max-w-56"
          opcoes={[
            { valor: "ABERTO", texto: "Em aberto" },
            { valor: "PARCIAL", texto: "Parcialmente pago" },
            { valor: "PAGO", texto: "Quitado" },
            { valor: "CANCELADO", texto: "Cancelado" },
          ]}
        />
      </div>

      {titulos.length === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhum titulo" descricao="Nada lancado com esses filtros." />
        </Cartao>
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {titulos.map((t) => (
              <Cartao key={t.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-carvao-900">{t.descricao}</p>
                    <p className="text-xs text-carvao-500">
                      {t.parceiro_nome ?? t.categoria ?? "-"} · vence {dataBr(t.vencimento)}
                    </p>
                  </div>
                  <Selo tom={tomStatus(t)}>{t.vencido && t.status !== "PAGO" ? "VENCIDO" : t.status}</Selo>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-carvao-600">
                    Saldo <strong className="text-carvao-900">{brl(t.saldo)}</strong> de{" "}
                    {brl(t.valor)}
                  </span>
                </div>
                {(t.status === "ABERTO" || t.status === "PARCIAL") && (
                  <div className="mt-3 flex gap-2">
                    <Botao
                      variante="sucesso"
                      className="flex-1"
                      icone={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => {
                        setBaixa({ valor: t.saldo, data: hojeIso(), forma_pagamento: "DINHEIRO" });
                        setBaixando(t);
                      }}
                    >
                      Baixar
                    </Botao>
                    <Botao variante="secundario" onClick={() => cancelar(t)}>
                      Cancelar
                    </Botao>
                  </div>
                )}
              </Cartao>
            ))}
          </div>

          <Cartao className="hidden overflow-hidden lg:block">
            <Tabela
              cabecalho={[
                "Descricao",
                pagar ? "Fornecedor" : "Cliente",
                "Categoria",
                "Vencimento",
                "Valor",
                "Saldo",
                "Status",
                "Acoes",
              ]}
            >
              {titulos.map((t) => (
                <tr key={t.id} className="hover:bg-carvao-50/60">
                  <td className="px-4 py-2.5 font-medium text-carvao-800">
                    {t.descricao}
                    {t.venda_id && (
                      <span className="ml-1 text-xs text-carvao-400">(venda #{t.venda_id})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">{t.parceiro_nome ?? "-"}</td>
                  <td className="px-4 py-2.5 text-carvao-600">{t.categoria ?? "-"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-carvao-600">
                    {dataBr(t.vencimento)}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">{brl(t.valor)}</td>
                  <td className="px-4 py-2.5 font-semibold text-carvao-900">{brl(t.saldo)}</td>
                  <td className="px-4 py-2.5">
                    <Selo tom={tomStatus(t)}>
                      {t.vencido && t.status !== "PAGO" ? "VENCIDO" : t.status}
                    </Selo>
                  </td>
                  <td className="px-4 py-2.5">
                    {(t.status === "ABERTO" || t.status === "PARCIAL") && (
                      <div className="flex gap-1.5">
                        <Botao
                          variante="sucesso"
                          onClick={() => {
                            setBaixa({
                              valor: t.saldo,
                              data: hojeIso(),
                              forma_pagamento: "DINHEIRO",
                            });
                            setBaixando(t);
                          }}
                        >
                          Baixar
                        </Botao>
                        <Botao variante="secundario" onClick={() => cancelar(t)}>
                          Cancelar
                        </Botao>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Tabela>
          </Cartao>
        </>
      )}

      {/* Novo titulo */}
      <Modal
        aberto={novoAberto}
        titulo={pagar ? "Nova conta a pagar" : "Novo recebimento"}
        aoFechar={() => setNovoAberto(false)}
      >
        <form onSubmit={criar} className="space-y-4">
          <Erro mensagem={erro} />
          <Campo
            rotulo="Descricao"
            required
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder={pagar ? "Ex.: Aluguel de outubro" : "Ex.: Evento formatura"}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Seletor
              rotulo="Categoria"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              vazio="Sem categoria"
              opcoes={(pagar ? CATEGORIAS_PAGAR : CATEGORIAS_RECEBER).map((c) => ({
                valor: c,
                texto: c,
              }))}
            />
            <Seletor
              rotulo={pagar ? "Fornecedor" : "Cliente"}
              value={form.parceiro_id}
              onChange={(e) => setForm({ ...form, parceiro_id: e.target.value })}
              vazio="Nao informar"
              opcoes={parceiros.map((p) => ({ valor: p.id, texto: p.nome }))}
            />
            <Campo
              rotulo="Valor total (R$)"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
            <Campo
              rotulo="Primeiro vencimento"
              type="date"
              required
              value={form.vencimento}
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
            />
            <Campo
              rotulo="Parcelas"
              type="number"
              min="1"
              max="48"
              value={form.parcelas}
              onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
              dica="O valor total sera dividido"
            />
            <Campo
              rotulo="Intervalo entre parcelas (dias)"
              type="number"
              min="1"
              value={form.intervalo_dias}
              onChange={(e) => setForm({ ...form, intervalo_dias: e.target.value })}
            />
          </div>
          <Campo
            rotulo="Observacao"
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Lancar
            </Botao>
          </div>
        </form>
      </Modal>

      {/* Baixa */}
      <Modal
        aberto={!!baixando}
        titulo={pagar ? "Registrar pagamento" : "Registrar recebimento"}
        aoFechar={() => setBaixando(null)}
        largura="max-w-md"
      >
        <form onSubmit={confirmarBaixa} className="space-y-4">
          <Erro mensagem={erro} />
          <p className="rounded-lg bg-carvao-50 px-3 py-2 text-sm text-carvao-600">
            {baixando?.descricao} · saldo devedor{" "}
            <strong className="text-carvao-900">{brl(baixando?.saldo)}</strong>
          </p>
          <Campo
            rotulo="Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            max={Number(baixando?.saldo ?? 0)}
            required
            value={baixa.valor}
            onChange={(e) => setBaixa({ ...baixa, valor: e.target.value })}
            dica="Valor menor que o saldo gera baixa parcial"
          />
          <Campo
            rotulo="Data"
            type="date"
            value={baixa.data}
            onChange={(e) => setBaixa({ ...baixa, data: e.target.value })}
          />
          <Seletor
            rotulo="Forma"
            value={baixa.forma_pagamento}
            onChange={(e) =>
              setBaixa({ ...baixa, forma_pagamento: e.target.value as FormaPagamento })
            }
            opcoes={FORMAS.map((f) => ({ valor: f, texto: f }))}
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setBaixando(null)}>
              Cancelar
            </Botao>
            <Botao variante="sucesso" type="submit" carregando={salvando}>
              Confirmar
            </Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}
