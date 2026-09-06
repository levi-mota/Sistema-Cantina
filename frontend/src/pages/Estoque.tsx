import { useCallback, useEffect, useState } from "react";
import { ArrowDownUp, History, Package, Plus, Search } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { brl, dataHora, hojeIso, qtd, rotulo } from "../lib/format";
import type { Categoria, Movimento, Parceiro, Produto, TipoMovimento } from "../lib/tipos";
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

const TIPOS_MOVIMENTO: { valor: TipoMovimento; texto: string }[] = [
  { valor: "ENTRADA", texto: "Entrada (compra/reposição)" },
  { valor: "SAIDA", texto: "Saída (consumo/uso interno)" },
  { valor: "PERDA", texto: "Perda (quebra/vencimento)" },
  { valor: "AJUSTE", texto: "Ajuste de inventário (define o saldo)" },
];

const FORM_VAZIO = {
  codigo: "",
  nome: "",
  categoria_id: "",
  fornecedor_id: "",
  unidade: "UN",
  preco_custo: "0",
  preco_venda: "0",
  estoque_minimo: "0",
  estoque_inicial: "0",
};

export default function Estoque() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Parceiro[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [somenteCriticos, setSomenteCriticos] = useState(false);
  const [aba, setAba] = useState<"produtos" | "movimentos">("produtos");

  const [produtoModal, setProdutoModal] = useState<Produto | "novo" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [movProduto, setMovProduto] = useState<Produto | null>(null);
  const [movForm, setMovForm] = useState({
    tipo: "ENTRADA" as TipoMovimento,
    quantidade: "1",
    custo_unitario: "",
    motivo: "",
    gerar_conta_pagar: false,
    vencimento: hojeIso(30),
  });

  const carregar = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        api.get<Produto[]>("/estoque/produtos", {
          params: {
            busca: busca || undefined,
            categoria_id: categoriaFiltro || undefined,
            somente_criticos: somenteCriticos || undefined,
          },
        }),
        api.get<Movimento[]>("/estoque/movimentos", { params: { limite: 80 } }),
      ]);
      setProdutos(p.data);
      setMovimentos(m.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [busca, categoriaFiltro, somenteCriticos]);

  useEffect(() => {
    Promise.all([
      api.get<Categoria[]>("/estoque/categorias"),
      api.get<Parceiro[]>("/parceiros", { params: { tipo: "FORNECEDOR", ativo: true } }),
    ]).then(([c, f]) => {
      setCategorias(c.data);
      setFornecedores(f.data);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  function abrirProduto(p: Produto | "novo") {
    setErro(null);
    setProdutoModal(p);
    setForm(
      p === "novo"
        ? FORM_VAZIO
        : {
            codigo: p.codigo ?? "",
            nome: p.nome,
            categoria_id: String(p.categoria_id ?? ""),
            fornecedor_id: String(p.fornecedor_id ?? ""),
            unidade: p.unidade,
            preco_custo: p.preco_custo,
            preco_venda: p.preco_venda,
            estoque_minimo: p.estoque_minimo,
            estoque_inicial: "0",
          },
    );
  }

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const corpo = {
      codigo: form.codigo || null,
      nome: form.nome,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
      unidade: form.unidade,
      preco_custo: Number(form.preco_custo || 0),
      preco_venda: Number(form.preco_venda || 0),
      estoque_minimo: Number(form.estoque_minimo || 0),
    };
    try {
      if (produtoModal === "novo") {
        await api.post("/estoque/produtos", {
          ...corpo,
          estoque_inicial: Number(form.estoque_inicial || 0),
        });
      } else if (produtoModal) {
        await api.put(`/estoque/produtos/${produtoModal.id}`, corpo);
      }
      setProdutoModal(null);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível salvar o produto"));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarMovimento(e: React.FormEvent) {
    e.preventDefault();
    if (!movProduto) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.post("/estoque/movimentos", {
        produto_id: movProduto.id,
        tipo: movForm.tipo,
        quantidade: Number(movForm.quantidade),
        custo_unitario: movForm.custo_unitario ? Number(movForm.custo_unitario) : null,
        motivo: movForm.motivo || null,
        gerar_conta_pagar: movForm.gerar_conta_pagar,
        fornecedor_id: movProduto.fornecedor_id ?? null,
        vencimento: movForm.gerar_conta_pagar ? movForm.vencimento : null,
      });
      setMovProduto(null);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível registrar o movimento"));
    } finally {
      setSalvando(false);
    }
  }

  function abrirMovimento(p: Produto) {
    setErro(null);
    setMovProduto(p);
    setMovForm({
      tipo: "ENTRADA",
      quantidade: "1",
      custo_unitario: p.preco_custo,
      motivo: "",
      gerar_conta_pagar: false,
      vencimento: hojeIso(30),
    });
  }

  if (carregando) return <Carregando texto="Carregando o estoque..." />;

  return (
    <>
      <TituloPagina
        titulo="Estoque"
        descricao="Produtos, saldos e movimentações"
        acoes={
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => abrirProduto("novo")}>
            Novo produto
          </Botao>
        }
      />

      <Erro mensagem={erro} />

      <div className="mb-4 flex gap-1 rounded-lg border border-carvao-100 bg-white p-1">
        {(["produtos", "movimentos"] as const).map((valor) => (
          <button
            key={valor}
            onClick={() => setAba(valor)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition ${
              aba === valor ? "bg-marca-600 text-white" : "text-carvao-600 hover:bg-carvao-50"
            }`}
          >
            {valor === "produtos" ? <Package className="h-4 w-4" /> : <History className="h-4 w-4" />}
            {valor === "produtos" ? "Produtos" : "Movimentações"}
          </button>
        ))}
      </div>

      {aba === "produtos" ? (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-carvao-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou código..."
                className="campo pl-9"
              />
            </div>
            <Seletor
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              vazio="Todas as categorias"
              opcoes={categorias.map((c) => ({ valor: c.id, texto: c.nome }))}
            />
            <label className="flex items-center gap-2 rounded-lg border border-carvao-200 bg-white px-3 py-2 text-sm text-carvao-700">
              <input
                type="checkbox"
                checked={somenteCriticos}
                onChange={(e) => setSomenteCriticos(e.target.checked)}
                className="h-4 w-4 accent-marca-600"
              />
              Só críticos
            </label>
          </div>

          {produtos.length === 0 ? (
            <Cartao>
              <Vazio titulo="Nenhum produto" descricao="Cadastre o primeiro item do estoque." />
            </Cartao>
          ) : (
            <>
              {/* Celular: cartoes tocaveis */}
              <div className="space-y-2 lg:hidden">
                {produtos.map((p) => (
                  <Cartao key={p.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-carvao-900">{p.nome}</p>
                        <p className="text-xs text-carvao-500">
                          {p.codigo ?? "sem código"} · {p.categoria_nome ?? "sem categoria"}
                        </p>
                      </div>
                      <Selo
                        tom={
                          Number(p.estoque_atual) <= 0
                            ? "perigo"
                            : p.abaixo_minimo
                              ? "alerta"
                              : "sucesso"
                        }
                      >
                        {qtd(p.estoque_atual)} {p.unidade}
                      </Selo>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-carvao-600">
                        Custo {brl(p.preco_custo)} · Venda{" "}
                        <strong className="text-carvao-900">{brl(p.preco_venda)}</strong>
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Botao
                        variante="secundario"
                        className="flex-1"
                        onClick={() => abrirProduto(p)}
                      >
                        Editar
                      </Botao>
                      <Botao
                        className="flex-1"
                        icone={<ArrowDownUp className="h-4 w-4" />}
                        onClick={() => abrirMovimento(p)}
                      >
                        Movimentar
                      </Botao>
                    </div>
                  </Cartao>
                ))}
              </div>

              {/* Desktop: tabela */}
              <Cartao className="hidden overflow-hidden lg:block">
                <Tabela
                  cabecalho={[
                    "Produto",
                    "Categoria",
                    "Custo",
                    "Venda",
                    "Margem",
                    "Estoque",
                    "Ações",
                  ]}
                >
                  {produtos.map((p) => (
                    <tr key={p.id} className="hover:bg-carvao-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-carvao-800">{p.nome}</p>
                        <p className="text-xs text-carvao-500">{p.codigo ?? "-"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-carvao-600">{p.categoria_nome ?? "-"}</td>
                      <td className="px-4 py-2.5 text-carvao-600">{brl(p.preco_custo)}</td>
                      <td className="px-4 py-2.5 font-semibold text-carvao-900">
                        {brl(p.preco_venda)}
                      </td>
                      <td className="px-4 py-2.5 text-carvao-600">
                        {p.margem ? `${Number(p.margem).toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Selo
                          tom={
                            Number(p.estoque_atual) <= 0
                              ? "perigo"
                              : p.abaixo_minimo
                                ? "alerta"
                                : "sucesso"
                          }
                        >
                          {qtd(p.estoque_atual)} {p.unidade}
                        </Selo>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5">
                          <Botao variante="secundario" onClick={() => abrirProduto(p)}>
                            Editar
                          </Botao>
                          <Botao onClick={() => abrirMovimento(p)}>Movimentar</Botao>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Tabela>
              </Cartao>
            </>
          )}
        </>
      ) : (
        <Cartao className="overflow-hidden">
          {movimentos.length === 0 ? (
            <Vazio titulo="Sem movimentações" />
          ) : (
            <Tabela cabecalho={["Data", "Produto", "Tipo", "Quantidade", "Saldo", "Motivo"]}>
              {movimentos.map((m) => (
                <tr key={m.id} className="hover:bg-carvao-50/60">
                  <td className="px-4 py-2.5 whitespace-nowrap text-carvao-600">
                    {dataHora(m.criado_em)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-carvao-800">{m.produto_nome}</td>
                  <td className="px-4 py-2.5">
                    <Selo
                      tom={
                        m.tipo === "ENTRADA"
                          ? "sucesso"
                          : m.tipo === "PERDA"
                            ? "perigo"
                            : m.tipo === "AJUSTE"
                              ? "info"
                              : "neutro"
                      }
                    >
                      {rotulo(m.tipo)}
                    </Selo>
                  </td>
                  <td className="px-4 py-2.5 text-carvao-700">{qtd(m.quantidade)}</td>
                  <td className="px-4 py-2.5 font-semibold text-carvao-900">{qtd(m.saldo_apos)}</td>
                  <td className="px-4 py-2.5 text-carvao-600">{m.motivo ?? "-"}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </Cartao>
      )}

      {/* Produto */}
      <Modal
        aberto={!!produtoModal}
        titulo={produtoModal === "novo" ? "Novo produto" : "Editar produto"}
        aoFechar={() => setProdutoModal(null)}
      >
        <form onSubmit={salvarProduto} className="space-y-4">
          <Erro mensagem={erro} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Nome"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="sm:col-span-1"
            />
            <Campo
              rotulo="Código / código de barras"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
            <Seletor
              rotulo="Categoria"
              value={form.categoria_id}
              onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              vazio="Sem categoria"
              opcoes={categorias.map((c) => ({ valor: c.id, texto: c.nome }))}
            />
            <Seletor
              rotulo="Fornecedor"
              value={form.fornecedor_id}
              onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}
              vazio="Sem fornecedor"
              opcoes={fornecedores.map((f) => ({ valor: f.id, texto: f.nome }))}
            />
            <Campo
              rotulo="Unidade"
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
              dica="UN, KG, L, CX..."
            />
            <Campo
              rotulo="Estoque mínimo"
              type="number"
              step="0.001"
              min="0"
              value={form.estoque_minimo}
              onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
            />
            <Campo
              rotulo="Preço de custo (R$)"
              type="number"
              step="0.01"
              min="0"
              value={form.preco_custo}
              onChange={(e) => setForm({ ...form, preco_custo: e.target.value })}
            />
            <Campo
              rotulo="Preço de venda (R$)"
              type="number"
              step="0.01"
              min="0"
              value={form.preco_venda}
              onChange={(e) => setForm({ ...form, preco_venda: e.target.value })}
            />
            {produtoModal === "novo" && (
              <Campo
                rotulo="Estoque inicial"
                type="number"
                step="0.001"
                min="0"
                value={form.estoque_inicial}
                onChange={(e) => setForm({ ...form, estoque_inicial: e.target.value })}
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setProdutoModal(null)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Salvar
            </Botao>
          </div>
        </form>
      </Modal>

      {/* Movimento */}
      <Modal
        aberto={!!movProduto}
        titulo={`Movimentar: ${movProduto?.nome ?? ""}`}
        aoFechar={() => setMovProduto(null)}
        largura="max-w-md"
      >
        <form onSubmit={salvarMovimento} className="space-y-4">
          <Erro mensagem={erro} />
          <p className="rounded-lg bg-carvao-50 px-3 py-2 text-sm text-carvao-600">
            Saldo atual:{" "}
            <strong className="text-carvao-900">
              {qtd(movProduto?.estoque_atual)} {movProduto?.unidade}
            </strong>
          </p>
          <Seletor
            rotulo="Tipo"
            value={movForm.tipo}
            onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value as TipoMovimento })}
            opcoes={TIPOS_MOVIMENTO.map((t) => ({ valor: t.valor, texto: t.texto }))}
          />
          <Campo
            rotulo={movForm.tipo === "AJUSTE" ? "Saldo contado" : "Quantidade"}
            type="number"
            step="0.001"
            min="0.001"
            required
            value={movForm.quantidade}
            onChange={(e) => setMovForm({ ...movForm, quantidade: e.target.value })}
          />
          {movForm.tipo === "ENTRADA" && (
            <>
              <Campo
                rotulo="Custo unitário (R$)"
                type="number"
                step="0.01"
                min="0"
                value={movForm.custo_unitario}
                onChange={(e) => setMovForm({ ...movForm, custo_unitario: e.target.value })}
                dica="Recalcula o custo médio do produto"
              />
              <label className="flex items-center gap-2 text-sm text-carvao-700">
                <input
                  type="checkbox"
                  checked={movForm.gerar_conta_pagar}
                  onChange={(e) =>
                    setMovForm({ ...movForm, gerar_conta_pagar: e.target.checked })
                  }
                  className="h-4 w-4 accent-marca-600"
                />
                Gerar conta a pagar para o fornecedor
              </label>
              {movForm.gerar_conta_pagar && (
                <Campo
                  rotulo="Vencimento da conta"
                  type="date"
                  value={movForm.vencimento}
                  onChange={(e) => setMovForm({ ...movForm, vencimento: e.target.value })}
                />
              )}
            </>
          )}
          <Campo
            rotulo="Motivo / observação"
            value={movForm.motivo}
            onChange={(e) => setMovForm({ ...movForm, motivo: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setMovProduto(null)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Confirmar
            </Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}
