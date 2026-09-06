import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { brl, dataHora, qtd, rotulo } from "../lib/format";
import { baixarPdf } from "../lib/pdf";
import type { ListaCompra, Produto, StatusCompra, SugestaoCompra } from "../lib/tipos";
import {
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  Modal,
  Selo,
  Seletor,
  TituloPagina,
  Vazio,
  cx,
} from "../components/ui";

/** Um item enquanto a lista esta sendo montada na tela. */
interface ItemRascunho {
  produto_id: number;
  produto: string;
  unidade: string;
  fornecedor: string | null;
  custo: number;
  estoque: number;
  quantidade: string;
  observacao: string;
}

const TONS: Record<StatusCompra, "neutro" | "info" | "sucesso" | "perigo"> = {
  RASCUNHO: "neutro",
  ENVIADA: "info",
  CONCLUIDA: "sucesso",
  CANCELADA: "perigo",
};

export default function Compras() {
  const [listas, setListas] = useState<ListaCompra[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editor, setEditor] = useState<ListaCompra | "nova" | null>(null);
  const [titulo, setTitulo] = useState("");
  const [comprador, setComprador] = useState("");
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");

  const [relatorio, setRelatorio] = useState<{ titulo: string; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([
        api.get<ListaCompra[]>("/compras/listas"),
        api.get<Produto[]>("/estoque/produtos", { params: { ativo: true } }),
      ]);
      setListas(l.data);
      setProdutos(p.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalRascunho = useMemo(
    () => itens.reduce((soma, i) => soma + Number(i.quantidade || 0) * i.custo, 0),
    [itens],
  );

  function abrirEditor(lista: ListaCompra | "nova") {
    setErro(null);
    setEditor(lista);
    setProdutoParaAdicionar("");
    if (lista === "nova") {
      const hoje = new Date().toLocaleDateString("pt-BR");
      setTitulo(`Compras ${hoje}`);
      setComprador("");
      setObservacao("");
      setItens([]);
    } else {
      setTitulo(lista.titulo);
      setComprador(lista.comprador ?? "");
      setObservacao(lista.observacao ?? "");
      setItens(
        lista.itens.map((i) => ({
          produto_id: i.produto_id,
          produto: i.produto,
          unidade: i.unidade,
          fornecedor: i.fornecedor ?? null,
          custo: Number(i.custo_estimado),
          estoque: Number(i.estoque_no_momento),
          quantidade: String(Number(i.quantidade)),
          observacao: i.observacao ?? "",
        })),
      );
    }
  }

  /** Traz os produtos no mínimo ou abaixo, sem duplicar o que ja esta na lista. */
  async function puxarSugestao() {
    setErro(null);
    try {
      const { data } = await api.get<SugestaoCompra[]>("/compras/sugestao");
      setItens((atual) => {
        const jaTem = new Set(atual.map((i) => i.produto_id));
        const novos = data
          .filter((s) => !jaTem.has(s.produto_id))
          .map((s) => ({
            produto_id: s.produto_id,
            produto: s.produto,
            unidade: s.unidade,
            fornecedor: s.fornecedor ?? null,
            custo: Number(s.custo_estimado),
            estoque: Number(s.estoque_atual),
            quantidade: String(Number(s.sugestao)),
            observacao: "",
          }));
        if (novos.length === 0) setErro("Nenhum produto novo abaixo do mínimo.");
        return [...atual, ...novos];
      });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  function adicionarProduto(id: string) {
    const produto = produtos.find((p) => String(p.id) === id);
    if (!produto) return;
    setItens((atual) => {
      if (atual.some((i) => i.produto_id === produto.id)) return atual;
      return [
        ...atual,
        {
          produto_id: produto.id,
          produto: produto.nome,
          unidade: produto.unidade,
          fornecedor: produto.fornecedor_nome ?? null,
          custo: Number(produto.preco_custo),
          estoque: Number(produto.estoque_atual),
          quantidade: "1",
          observacao: "",
        },
      ];
    });
    setProdutoParaAdicionar("");
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const corpo = {
      titulo,
      comprador: comprador || null,
      observacao: observacao || null,
      itens: itens
        .filter((i) => Number(i.quantidade) > 0)
        .map((i) => ({
          produto_id: i.produto_id,
          quantidade: Number(i.quantidade),
          observacao: i.observacao || null,
        })),
    };
    try {
      if (editor === "nova") await api.post("/compras/listas", corpo);
      else if (editor) await api.put(`/compras/listas/${editor.id}`, corpo);
      setEditor(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível salvar a lista"));
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(lista: ListaCompra, novo: StatusCompra) {
    setErro(null);
    try {
      await api.post(`/compras/listas/${lista.id}/status`, null, { params: { novo } });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function excluir(lista: ListaCompra) {
    if (!confirm(`Excluir a lista "${lista.titulo}"?`)) return;
    try {
      await api.delete(`/compras/listas/${lista.id}`);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function abrirRelatorio(lista: ListaCompra) {
    setErro(null);
    try {
      const { data } = await api.get<{ titulo: string; texto: string }>(
        `/compras/listas/${lista.id}/relatorio`,
      );
      setRelatorio(data);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function copiarRelatorio() {
    if (!relatorio) return;
    try {
      await navigator.clipboard.writeText(relatorio.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  if (carregando) return <Carregando texto="Carregando as listas..." />;

  return (
    <>
      <TituloPagina
        titulo="Compras"
        descricao="Monte o que precisa ser comprado e mande a lista para o comprador"
        acoes={
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => abrirEditor("nova")}>
            Nova lista
          </Botao>
        }
      />

      <Erro mensagem={erro} />

      {listas.length === 0 ? (
        <Cartao className="p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-carvao-300" />
          <p className="font-semibold text-carvao-800">Nenhuma lista de compras</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-carvao-500">
            Crie uma lista e use a sugestão automática: ela traz tudo o que está no estoque
            mínimo ou abaixo, com a quantidade que recompõe o saldo.
          </p>
          <Botao className="mt-4" onClick={() => abrirEditor("nova")}>
            Criar a primeira lista
          </Botao>
        </Cartao>
      ) : (
        <div className="space-y-3">
          {listas.map((l) => (
            <Cartao key={l.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-carvao-900">{l.titulo}</h2>
                    <Selo tom={TONS[l.status]}>{rotulo(l.status)}</Selo>
                  </div>
                  <p className="mt-0.5 text-sm text-carvao-500">
                    {l.quantidade_itens} item(ns) · {brl(l.total_estimado)} estimados
                    {l.comprador && ` · para ${l.comprador}`}
                  </p>
                  <p className="text-xs text-carvao-400">
                    Criada em {dataHora(l.criado_em)}
                    {l.enviada_em && ` · enviada em ${dataHora(l.enviada_em)}`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Botao variante="secundario" onClick={() => abrirRelatorio(l)}>
                    Relatório
                  </Botao>
                  {l.status === "RASCUNHO" && (
                    <>
                      <Botao variante="secundario" onClick={() => abrirEditor(l)}>
                        Editar
                      </Botao>
                      <Botao
                        icone={<Send className="h-4 w-4" />}
                        onClick={() => mudarStatus(l, "ENVIADA")}
                      >
                        Marcar enviada
                      </Botao>
                    </>
                  )}
                  {l.status === "ENVIADA" && (
                    <Botao variante="sucesso" onClick={() => mudarStatus(l, "CONCLUIDA")}>
                      Marcar recebida
                    </Botao>
                  )}
                  {l.status === "RASCUNHO" && (
                    <Botao
                      variante="secundario"
                      onClick={() => excluir(l)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Botao>
                  )}
                </div>
              </div>

              {l.itens.length > 0 && (
                <ul className="mt-3 grid gap-x-6 gap-y-1 border-t border-carvao-100 pt-3 text-sm sm:grid-cols-2">
                  {l.itens.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span className="truncate text-carvao-700">
                        {qtd(i.quantidade)} {i.unidade} · {i.produto}
                      </span>
                      <span className="shrink-0 text-carvao-500">{brl(i.total_estimado)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          ))}
        </div>
      )}

      {/* Editor da lista */}
      <Modal
        aberto={!!editor}
        titulo={editor === "nova" ? "Nova lista de compras" : "Editar lista"}
        aoFechar={() => setEditor(null)}
        largura="max-w-3xl"
      >
        <div className="space-y-4">
          <Erro mensagem={erro} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Titulo"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
            <Campo
              rotulo="Comprador"
              value={comprador}
              onChange={(e) => setComprador(e.target.value)}
              placeholder="Quem vai comprar"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Seletor
              value={produtoParaAdicionar}
              onChange={(e) => adicionarProduto(e.target.value)}
              vazio="Adicionar produto..."
              opcoes={produtos
                .filter((p) => !itens.some((i) => i.produto_id === p.id))
                .map((p) => ({
                  valor: p.id,
                  texto: `${p.nome} (estoque ${Number(p.estoque_atual)} ${p.unidade})`,
                }))}
            />
            <Botao
              variante="secundario"
              icone={<Sparkles className="h-4 w-4" />}
              onClick={puxarSugestao}
            >
              Sugerir em falta
            </Botao>
          </div>

          {itens.length === 0 ? (
            <Vazio
              titulo="Lista vazia"
              descricao="Use a sugestão automática ou escolha os produtos acima."
            />
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-carvao-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-carvao-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-carvao-600">
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Estoque</th>
                    <th className="w-28 px-3 py-2">Comprar</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carvao-100">
                  {itens.map((item, indice) => (
                    <tr key={item.produto_id}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-carvao-800">{item.produto}</p>
                        <p className="text-xs text-carvao-400">
                          {item.fornecedor ?? "Sem fornecedor"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-carvao-600">
                        {item.estoque} {item.unidade}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.quantidade}
                          onChange={(e) => {
                            const valor = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                            setItens((atual) =>
                              atual.map((i, n) =>
                                n === indice ? { ...i, quantidade: valor } : i,
                              ),
                            );
                          }}
                          className="campo py-1.5 text-center"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-carvao-800">
                        {brl(Number(item.quantidade || 0) * item.custo)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() =>
                            setItens((atual) => atual.filter((_, n) => n !== indice))
                          }
                          className="rounded-md p-1.5 text-carvao-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <label className="block">
            <span className="rotulo">Observação para o comprador</span>
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="campo"
              placeholder="Ex.: dar preferência ao fornecedor da rua 7"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-carvao-50 px-3 py-2">
            <span className="text-sm text-carvao-600">
              {itens.length} item(ns) na lista
            </span>
            <span className="text-lg font-bold text-carvao-900">
              {brl(totalRascunho)} estimados
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setEditor(null)}>
              Cancelar
            </Botao>
            <Botao carregando={salvando} disabled={!titulo || itens.length === 0} onClick={salvar}>
              Salvar lista
            </Botao>
          </div>
        </div>
      </Modal>

      {/* Relatorio para o comprador */}
      <Modal
        aberto={!!relatorio}
        titulo="Relatório para o comprador"
        aoFechar={() => setRelatorio(null)}
        largura="max-w-lg"
      >
        {relatorio && (
          <div className="space-y-3">
            <p className="text-sm text-carvao-500">
              Itens agrupados por fornecedor. Copie e mande no WhatsApp, ou baixe o PDF.
            </p>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-carvao-50 p-4 text-sm text-carvao-800">
              {relatorio.texto}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Botao
                className={cx("flex-1", copiado && "bg-emerald-600 hover:bg-emerald-700")}
                icone={copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={copiarRelatorio}
              >
                {copiado ? "Copiado" : "Copiar texto"}
              </Botao>
              <Botao
                variante="secundario"
                icone={<Download className="h-4 w-4" />}
                onClick={() => {
                  const lista = listas.find((l) => l.titulo === relatorio.titulo);
                  if (!lista) return;
                  baixarPdf({
                    arquivo: `compras_${lista.id}`,
                    titulo: `Lista de compras: ${lista.titulo}`,
                    subtitulo: lista.observacao ?? undefined,
                    // Agrupado por fornecedor, na mesma ordem do texto: quem
                    // compra percorre uma loja de cada vez.
                    linhas: [...lista.itens].sort((a, b) =>
                      (a.fornecedor ?? "").localeCompare(b.fornecedor ?? ""),
                    ),
                    colunas: [
                      { titulo: "Fornecedor", valor: (i) => i.fornecedor ?? "Sem fornecedor" },
                      { titulo: "Produto", valor: (i) => i.produto },
                      { titulo: "Código", valor: (i) => i.codigo ?? "" },
                      { titulo: "Qtd", valor: (i) => `${qtd(i.quantidade)} ${i.unidade}`, direita: true },
                      { titulo: "Custo est.", valor: (i) => brl(i.custo_estimado), direita: true },
                      { titulo: "Total est.", valor: (i) => brl(i.total_estimado), direita: true },
                      { titulo: "Observação", valor: (i) => i.observacao ?? "" },
                    ],
                    total: [
                      "Total",
                      "",
                      "",
                      "",
                      "",
                      brl(lista.itens.reduce((a, i) => a + Number(i.total_estimado), 0)),
                      "",
                    ],
                  });
                }}
              >
                PDF
              </Botao>
              <Botao variante="secundario" onClick={() => window.print()}>
                Imprimir
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
