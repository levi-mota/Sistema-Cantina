import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownUp, History, Package, Plus, Search } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import {
  apenasDigitos,
  brl,
  dataHora,
  hojeIso,
  inteiro,
  qtd,
  rotulo,
  valorNumero,
  valorTexto,
} from "../lib/format";
import type {
  Categoria,
  Movimento,
  Parceiro,
  Produto,
  TipoMovimento,
  TipoProduto,
} from "../lib/tipos";
import {
  Botao,
  Campo,
  CampoValor,
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

// Tudo é comprado e vendido por unidade: a unidade não é escolha de cadastro.
const FORM_VAZIO = {
  codigo: "",
  nome: "",
  tipo: "FINAL" as TipoProduto,
  categoria_id: "",
  fornecedor_id: "",
  preco_custo: "0,00",
  preco_venda: "0,00",
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
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [somenteCriticos, setSomenteCriticos] = useState(false);
  const [aba, setAba] = useState<"produtos" | "movimentos">("produtos");

  const [produtoModal, setProdutoModal] = useState<Produto | "novo" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  /** Produto já cadastrado com o mesmo código (trava) ou o mesmo nome (avisa). */
  const [repetido, setRepetido] = useState<{ codigo?: Produto; nome?: Produto }>({});
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
            tipo: tipoFiltro || undefined,
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
  }, [busca, categoriaFiltro, tipoFiltro, somenteCriticos]);

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
    setRepetido({});
    setProdutoModal(p);
    setForm(
      p === "novo"
        ? FORM_VAZIO
        : {
            codigo: p.codigo ?? "",
            nome: p.nome,
            tipo: p.tipo,
            categoria_id: String(p.categoria_id ?? ""),
            fornecedor_id: String(p.fornecedor_id ?? ""),
            preco_custo: valorTexto(p.preco_custo),
            preco_venda: valorTexto(p.preco_venda),
            estoque_minimo: inteiro(p.estoque_minimo),
            estoque_inicial: "0",
          },
    );
  }

  // Procura o produto já cadastrado enquanto se digita. Código repetido é erro
  // certo -- o PDV leria a etiqueta e traria o item errado --, então trava.
  // Nome repetido é só suspeita: dá para ter dois itens de nome parecido, mas
  // quase sempre é a mesma coisa cadastrada duas vezes, e aí o estoque de um
  // fica parado enquanto o outro vende.
  useEffect(() => {
    if (!produtoModal) return;
    const codigo = form.codigo.trim();
    const nome = form.nome.trim();
    if (!codigo && nome.length < 3) {
      setRepetido({});
      return;
    }

    const meuId = produtoModal === "novo" ? null : produtoModal.id;
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const buscar = async (termo: string) => {
          const { data } = await api.get<Produto[]>("/estoque/produtos", {
            params: { busca: termo },
          });
          return data.filter((p) => p.id !== meuId);
        };
        const achado: { codigo?: Produto; nome?: Produto } = {};
        if (codigo) {
          const iguais = await buscar(codigo);
          achado.codigo = iguais.find((p) => (p.codigo ?? "").trim() === codigo);
        }
        if (nome.length >= 3) {
          const iguais = await buscar(nome);
          achado.nome = iguais.find(
            (p) => p.nome.trim().toLocaleLowerCase() === nome.toLocaleLowerCase(),
          );
        }
        if (!cancelado) setRepetido(achado);
      } catch {
        // A busca é um apoio: se falhar, o cadastro segue e a API ainda barra
        // o código repetido ao salvar.
        if (!cancelado) setRepetido({});
      }
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [form.codigo, form.nome, produtoModal]);

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const corpo = {
      codigo: form.codigo || null,
      nome: form.nome,
      tipo: form.tipo,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
      preco_custo: valorNumero(form.preco_custo),
      preco_venda: valorNumero(form.preco_venda),
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
        custo_unitario: movForm.custo_unitario ? valorNumero(movForm.custo_unitario) : null,
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
      custo_unitario: valorTexto(p.preco_custo),
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
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]">
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
            <Seletor
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              vazio="Todos os tipos"
              opcoes={[
                { valor: "FINAL", texto: "Produto final" },
                { valor: "INSUMO", texto: "Uso e consumo" },
              ]}
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
                        {p.tipo === "INSUMO" && (
                          <div className="mt-1">
                            <Selo tom="neutro">Uso e consumo</Selo>
                          </div>
                        )}
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
                        {qtd(p.estoque_atual)}
                      </Selo>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-carvao-600">
                        Custo {brl(p.preco_custo)}
                        {p.tipo === "FINAL" && (
                          <>
                            {" · Venda "}
                            <strong className="text-carvao-900">{brl(p.preco_venda)}</strong>
                          </>
                        )}
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-carvao-800">{p.nome}</p>
                          {p.tipo === "INSUMO" && <Selo tom="neutro">Uso e consumo</Selo>}
                        </div>
                        <p className="text-xs text-carvao-500">{p.codigo ?? "-"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-carvao-600">{p.categoria_nome ?? "-"}</td>
                      <td className="px-4 py-2.5 text-carvao-600">{brl(p.preco_custo)}</td>
                      <td className="px-4 py-2.5 font-semibold text-carvao-900">
                        {p.tipo === "FINAL" ? brl(p.preco_venda) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-carvao-600">
                        {p.tipo === "FINAL" && p.margem
                          ? `${Number(p.margem).toFixed(0)}%`
                          : "-"}
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
                          {qtd(p.estoque_atual)}
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

          {(repetido.codigo || repetido.nome) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                {repetido.codigo ? (
                  <>
                    Este código já é de <strong>{repetido.codigo.nome}</strong>
                  </>
                ) : (
                  <>
                    Já existe um produto chamado <strong>{repetido.nome?.nome}</strong>
                  </>
                )}
              </span>
              <Botao
                type="button"
                variante="secundario"
                onClick={() => {
                  const alvo = repetido.codigo ?? repetido.nome;
                  if (alvo) abrirProduto(alvo);
                }}
              >
                Abrir o cadastro
              </Botao>
            </div>
          )}

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
              rotulo="Tipo"
              value={form.tipo}
              onChange={(e) => {
                // O preço de venda só some da tela: apagá-lo faria a troca de
                // tipo destruir um dado que ninguém pediu para apagar, e voltar
                // atrás não traria o preço de volta.
                setForm((f) => ({ ...f, tipo: e.target.value as TipoProduto }));
              }}
              opcoes={[
                { valor: "FINAL", texto: "Produto final (vai para o PDV)" },
                { valor: "INSUMO", texto: "Uso e consumo (não é vendido)" },
              ]}
              className="sm:col-span-2"
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
              rotulo="Estoque mínimo"
              inputMode="numeric"
              step="1"
              min="0"
              value={form.estoque_minimo}
              onChange={(e) =>
                setForm({ ...form, estoque_minimo: apenasDigitos(e.target.value) })
              }
            />
            <CampoValor
              rotulo="Preço de custo (R$)"
              value={form.preco_custo}
              aoMudar={(preco_custo) => setForm({ ...form, preco_custo })}
            />
            {form.tipo === "FINAL" && (
              <CampoValor
                rotulo="Preço de venda (R$)"
                value={form.preco_venda}
                aoMudar={(preco_venda) => setForm({ ...form, preco_venda })}
              />
            )}
            {produtoModal === "novo" && (
              <Campo
                rotulo="Estoque inicial"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.estoque_inicial}
                onChange={(e) =>
                  setForm({ ...form, estoque_inicial: apenasDigitos(e.target.value) })
                }
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setProdutoModal(null)}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              carregando={salvando}
              disabled={!!repetido.codigo}
              title={repetido.codigo ? "Este código já está em outro produto" : undefined}
            >
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
              {qtd(movProduto?.estoque_atual)}
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
            inputMode="numeric"
            required
            value={movForm.quantidade}
            onChange={(e) =>
              setMovForm({ ...movForm, quantidade: apenasDigitos(e.target.value) })
            }
          />
          {movForm.tipo === "ENTRADA" && (
            <>
              <CampoValor
                rotulo="Custo unitário (R$)"
                value={movForm.custo_unitario}
                aoMudar={(custo_unitario) => setMovForm({ ...movForm, custo_unitario })}
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
