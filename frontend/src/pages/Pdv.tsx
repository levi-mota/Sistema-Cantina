import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { brl, hojeIso } from "../lib/format";
import type { FormaPagamento, Parceiro, Produto, Venda } from "../lib/tipos";
import { Botao, Campo, Cartao, Carregando, Erro, Modal, Selo, Seletor, Vazio } from "../components/ui";

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
}

const FORMAS: { valor: FormaPagamento; texto: string }[] = [
  { valor: "DINHEIRO", texto: "Dinheiro" },
  { valor: "PIX", texto: "PIX" },
  { valor: "DEBITO", texto: "Cartao de debito" },
  { valor: "CREDITO", texto: "Cartao de credito" },
  { valor: "FIADO", texto: "Fiado (a prazo)" },
];

export default function Pdv() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Parceiro[]>([]);
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [forma, setForma] = useState<FormaPagamento>("DINHEIRO");
  const [clienteId, setClienteId] = useState("");
  const [desconto, setDesconto] = useState("0");
  const [recebido, setRecebido] = useState("");
  const [vencimento, setVencimento] = useState(hojeIso(30));
  const [finalizando, setFinalizando] = useState(false);
  const [comprovante, setComprovante] = useState<Venda | null>(null);

  const campoBusca = useRef<HTMLInputElement>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [p, c] = await Promise.all([
        api.get<Produto[]>("/estoque/produtos", { params: { ativo: true } }),
        api.get<Parceiro[]>("/parceiros", { params: { tipo: "CLIENTE", ativo: true } }),
      ]);
      setProdutos(p.data);
      setClientes(c.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const filtrados = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(alvo) || (p.codigo ?? "").toLowerCase().includes(alvo),
    );
  }, [produtos, busca]);

  const subtotal = carrinho.reduce(
    (soma, i) => soma + Number(i.produto.preco_venda) * i.quantidade,
    0,
  );
  const total = Math.max(subtotal - Number(desconto || 0), 0);
  const troco = forma === "DINHEIRO" ? Math.max(Number(recebido || 0) - total, 0) : 0;

  function adicionar(produto: Produto) {
    setCarrinho((atual) => {
      const existente = atual.find((i) => i.produto.id === produto.id);
      if (existente) {
        return atual.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i,
        );
      }
      return [...atual, { produto, quantidade: 1 }];
    });
  }

  function alterarQtd(produtoId: number, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((i) =>
          i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i,
        )
        .filter((i) => i.quantidade > 0),
    );
  }

  function limpar() {
    setCarrinho([]);
    setDesconto("0");
    setRecebido("");
    setClienteId("");
    setForma("DINHEIRO");
  }

  /** Enter no campo de busca adiciona o unico produto correspondente (leitor de codigo). */
  function aoTeclarBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || filtrados.length === 0) return;
    const exato = filtrados.find((p) => p.codigo?.toLowerCase() === busca.trim().toLowerCase());
    adicionar(exato ?? filtrados[0]);
    setBusca("");
  }

  async function finalizar() {
    setErro(null);
    setFinalizando(true);
    try {
      const { data } = await api.post<Venda>("/vendas", {
        cliente_id: clienteId ? Number(clienteId) : null,
        forma_pagamento: forma,
        desconto: Number(desconto || 0),
        valor_recebido: forma === "DINHEIRO" ? Number(recebido || 0) : 0,
        vencimento_fiado: forma === "FIADO" ? vencimento : null,
        itens: carrinho.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
      });
      setComprovante(data);
      setPagamentoAberto(false);
      limpar();
      void carregar();
    } catch (e) {
      setErro(mensagemErro(e, "Nao foi possivel finalizar a venda"));
    } finally {
      setFinalizando(false);
    }
  }

  if (carregando) return <Carregando texto="Abrindo o caixa..." />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catalogo */}
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-carvao-400" />
            <input
              ref={campoBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={aoTeclarBusca}
              placeholder="Buscar produto ou ler codigo de barras..."
              className="campo pl-9"
              autoFocus
            />
          </div>
        </div>

        <Erro mensagem={erro} />

        {filtrados.length === 0 ? (
          <Cartao>
            <Vazio titulo="Nenhum produto encontrado" descricao="Ajuste a busca ou cadastre no estoque." />
          </Cartao>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((p) => {
              const semEstoque = Number(p.estoque_atual) <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => adicionar(p)}
                  disabled={semEstoque}
                  className="cartao flex flex-col justify-between p-3 text-left transition hover:border-marca-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold text-carvao-800">{p.nome}</p>
                    <p className="mt-0.5 text-xs text-carvao-500">{p.categoria_nome ?? "Sem categoria"}</p>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="text-base font-bold text-marca-600">{brl(p.preco_venda)}</span>
                    <Selo tom={semEstoque ? "perigo" : p.abaixo_minimo ? "alerta" : "neutro"}>
                      {Number(p.estoque_atual)}
                    </Selo>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Carrinho */}
      <Cartao className="flex h-fit flex-col lg:sticky lg:top-4">
        <div className="flex items-center gap-2 border-b border-carvao-100 px-4 py-3">
          <ShoppingCart className="h-4.5 w-4.5 text-marca-600" />
          <h2 className="font-bold text-carvao-900">Venda atual</h2>
          {carrinho.length > 0 && (
            <button
              onClick={limpar}
              className="ml-auto text-xs font-semibold text-red-600 hover:underline"
            >
              Limpar
            </button>
          )}
        </div>

        {carrinho.length === 0 ? (
          <Vazio titulo="Carrinho vazio" descricao="Toque em um produto para adicionar." />
        ) : (
          <ul className="max-h-[45vh] divide-y divide-carvao-100 overflow-y-auto">
            {carrinho.map(({ produto, quantidade }) => (
              <li key={produto.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-carvao-800">{produto.nome}</p>
                  <p className="text-xs text-carvao-500">
                    {quantidade} x {brl(produto.preco_venda)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => alterarQtd(produto.id, -1)}
                    className="rounded-md border border-carvao-200 p-1.5 text-carvao-600 hover:bg-carvao-100"
                    aria-label="Diminuir"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{quantidade}</span>
                  <button
                    onClick={() => alterarQtd(produto.id, 1)}
                    className="rounded-md border border-carvao-200 p-1.5 text-carvao-600 hover:bg-carvao-100"
                    aria-label="Aumentar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="w-20 text-right text-sm font-bold text-carvao-900">
                  {brl(Number(produto.preco_venda) * quantidade)}
                </span>
                <button
                  onClick={() => alterarQtd(produto.id, -quantidade)}
                  className="rounded-md p-1.5 text-carvao-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-carvao-100 p-4">
          <div className="flex items-center justify-between text-sm text-carvao-600">
            <span>Itens</span>
            <span>{carrinho.reduce((s, i) => s + i.quantidade, 0)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-semibold text-carvao-700">Total</span>
            <span className="text-2xl font-bold text-carvao-900">{brl(subtotal)}</span>
          </div>
          <Botao
            className="mt-3 w-full py-3 text-base"
            disabled={carrinho.length === 0}
            onClick={() => {
              setRecebido("");
              setPagamentoAberto(true);
            }}
          >
            Finalizar venda
          </Botao>
        </div>
      </Cartao>

      {/* Pagamento */}
      <Modal
        aberto={pagamentoAberto}
        titulo="Pagamento"
        aoFechar={() => setPagamentoAberto(false)}
        largura="max-w-md"
      >
        <Erro mensagem={erro} />
        <div className="space-y-4">
          <Seletor
            rotulo="Forma de pagamento"
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaPagamento)}
            opcoes={FORMAS.map((f) => ({ valor: f.valor, texto: f.texto }))}
          />

          {(forma === "FIADO" || clienteId) && (
            <Seletor
              rotulo={forma === "FIADO" ? "Cliente (obrigatorio)" : "Cliente"}
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              vazio="Consumidor nao identificado"
              opcoes={clientes.map((c) => ({
                valor: c.id,
                texto: `${c.nome}${Number(c.limite_credito) > 0 ? ` · limite ${brl(c.limite_credito)}` : ""}`,
              }))}
            />
          )}

          {forma !== "FIADO" && !clienteId && (
            <Seletor
              rotulo="Cliente (opcional)"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              vazio="Consumidor nao identificado"
              opcoes={clientes.map((c) => ({ valor: c.id, texto: c.nome }))}
            />
          )}

          {forma === "FIADO" && (
            <Campo
              rotulo="Vencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          )}

          <Campo
            rotulo="Desconto (R$)"
            type="number"
            min="0"
            step="0.01"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
          />

          {forma === "DINHEIRO" && (
            <Campo
              rotulo="Valor recebido (R$)"
              type="number"
              min="0"
              step="0.01"
              value={recebido}
              onChange={(e) => setRecebido(e.target.value)}
              dica="Deixe em branco para valor exato"
            />
          )}

          <div className="rounded-lg bg-carvao-50 p-3 text-sm">
            <div className="flex justify-between text-carvao-600">
              <span>Subtotal</span>
              <span>{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between text-carvao-600">
              <span>Desconto</span>
              <span>- {brl(desconto || 0)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-carvao-200 pt-1 text-base font-bold text-carvao-900">
              <span>Total</span>
              <span>{brl(total)}</span>
            </div>
            {forma === "DINHEIRO" && Number(recebido) > 0 && (
              <div className="mt-1 flex justify-between font-semibold text-emerald-700">
                <span>Troco</span>
                <span>{brl(troco)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Botao
              variante="secundario"
              className="flex-1"
              onClick={() => setPagamentoAberto(false)}
            >
              Voltar
            </Botao>
            <Botao
              variante="sucesso"
              className="flex-1"
              carregando={finalizando}
              disabled={forma === "FIADO" && !clienteId}
              onClick={finalizar}
            >
              Confirmar
            </Botao>
          </div>
        </div>
      </Modal>

      {/* Comprovante */}
      <Modal
        aberto={!!comprovante}
        titulo={`Venda #${comprovante?.id} concluida`}
        aoFechar={() => setComprovante(null)}
        largura="max-w-sm"
      >
        {comprovante && (
          <div className="space-y-3 text-sm">
            <ul className="divide-y divide-carvao-100">
              {comprovante.itens.map((i) => (
                <li key={i.id} className="flex justify-between py-1.5">
                  <span className="text-carvao-700">
                    {Number(i.quantidade)}x {i.descricao}
                  </span>
                  <span className="font-medium">{brl(i.total)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1 border-t border-carvao-200 pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{brl(comprovante.total)}</span>
              </div>
              <div className="flex justify-between text-carvao-600">
                <span>Pagamento</span>
                <span>{comprovante.forma_pagamento}</span>
              </div>
              {Number(comprovante.troco) > 0 && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Troco</span>
                  <span>{brl(comprovante.troco)}</span>
                </div>
              )}
            </div>
            <Botao className="w-full" onClick={() => setComprovante(null)}>
              Nova venda
            </Botao>
          </div>
        )}
      </Modal>
    </div>
  );
}
