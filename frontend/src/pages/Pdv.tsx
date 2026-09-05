import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import {
  BadgeCheck,
  Banknote,
  Check,
  Copy,
  LockKeyhole,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { brl, documentoFormatado } from "../lib/format";
import type { CaixaSessao, Identificacao, PixCobranca, Produto, Venda } from "../lib/tipos";
import { Botao, Campo, Cartao, Carregando, Erro, Modal, Selo, Vazio, cx } from "../components/ui";

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
}

type Forma = "DINHEIRO" | "PIX";

/** "3*coxinha" ou "2x agua" -> quantidade 3 e o resto da busca. */
const PREFIXO_QUANTIDADE = /^(\d{1,3})\s*[*xX]\s*(.*)$/;

/** Sugestoes de cedula: valor exato e os proximos valores redondos acima. */
function sugestoesDeCedula(total: number): number[] {
  const cedulas = [5, 10, 20, 50, 100, 200];
  const acima = cedulas.filter((c) => c > total).slice(0, 3);
  const arredondado = Math.ceil(total / 10) * 10;
  const lista = [total, ...(arredondado > total ? [arredondado] : []), ...acima];
  return [...new Set(lista.map((v) => Number(v.toFixed(2))))].slice(0, 4);
}

export default function Pdv() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [caixa, setCaixa] = useState<CaixaSessao | null>(null);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [forma, setForma] = useState<Forma>("DINHEIRO");
  const [documento, setDocumento] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [identificacao, setIdentificacao] = useState<Identificacao | null>(null);
  const [erroDocumento, setErroDocumento] = useState<string | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [desconto, setDesconto] = useState("0");
  const [recebido, setRecebido] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [comprovante, setComprovante] = useState<Venda | null>(null);

  const [pixConfigurado, setPixConfigurado] = useState(false);
  const [pixCobranca, setPixCobranca] = useState<PixCobranca | null>(null);
  const [pixImagem, setPixImagem] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);

  // Passo de quantidade: aberto ao escolher um produto (Enter ou clique).
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [quantidadeTexto, setQuantidadeTexto] = useState("1");
  const quantidade = Number(quantidadeTexto || 0);

  const campoBusca = useRef<HTMLInputElement>(null);
  const campoQuantidade = useRef<HTMLInputElement>(null);
  const campoRecebido = useRef<HTMLInputElement>(null);
  const botaoForma = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, k, x] = await Promise.all([
        api.get<Produto[]>("/estoque/produtos", { params: { ativo: true } }),
        api.get<CaixaSessao | null>("/caixa/atual"),
        api.get<{ configurado: boolean }>("/pix/config"),
      ]);
      setProdutos(p.data);
      setCaixa(k.data);
      setPixConfigurado(x.data.configurado);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // --- Busca e filtro -----------------------------------------------------
  const { quantidadeDigitada, termo } = useMemo(() => {
    const casou = busca.match(PREFIXO_QUANTIDADE);
    if (casou) return { quantidadeDigitada: Number(casou[1]), termo: casou[2].trim() };
    return { quantidadeDigitada: 1, termo: busca.trim() };
  }, [busca]);

  const filtrados = useMemo(() => {
    const alvo = termo.toLowerCase();
    if (!alvo) return produtos;
    return produtos.filter(
      (p) => p.nome.toLowerCase().includes(alvo) || (p.codigo ?? "").toLowerCase().includes(alvo),
    );
  }, [produtos, termo]);

  useEffect(() => setDestaque(0), [termo]);

  // Mantem o item destacado visivel ao navegar com as setas.
  useEffect(() => {
    listaRef.current
      ?.querySelector(`[data-indice="${destaque}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [destaque]);

  const subtotal = carrinho.reduce(
    (soma, i) => soma + Number(i.produto.preco_venda) * i.quantidade,
    0,
  );
  const total = Math.max(subtotal - Number(desconto || 0), 0);
  const troco = forma === "DINHEIRO" ? Math.max(Number(recebido || 0) - total, 0) : 0;
  const faltaReceber =
    forma === "DINHEIRO" && recebido !== "" ? Math.max(total - Number(recebido), 0) : 0;

  // --- Carrinho -----------------------------------------------------------
  function alterarQtd(produtoId: number, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((i) => (i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0),
    );
  }

  const limpar = useCallback(() => {
    setCarrinho([]);
    setDesconto("0");
    setRecebido("");
    setDocumento("");
    setClienteId("");
    setIdentificacao(null);
    setErroDocumento(null);
    setForma("DINHEIRO");
    setPixCobranca(null);
    setPixImagem(null);
    setBusca("");
    setEscolhido(null);
  }, []);

  const focarBusca = useCallback(() => {
    requestAnimationFrame(() => campoBusca.current?.focus());
  }, []);

  const abrirPagamento = useCallback(() => {
    if (carrinho.length === 0 || !caixa) return;
    setRecebido("");
    setPixCobranca(null);
    setPixImagem(null);
    setPagamentoAberto(true);
  }, [carrinho.length, caixa]);

  // --- Atalhos de teclado da tela ----------------------------------------
  useEffect(() => {
    if (pagamentoAberto || comprovante || escolhido) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        abrirPagamento();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        limpar();
        focarBusca();
        return;
      }
      if (e.key === "Backspace" && e.altKey) {
        e.preventDefault();
        setCarrinho((atual) => atual.slice(0, -1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDestaque((d) => Math.min(d + 1, Math.max(filtrados.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDestaque((d) => Math.max(d - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        setBusca("");
        focarBusca();
        return;
      }
      // Qualquer digitacao volta para a busca: o operador nunca perde o foco.
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        campoBusca.current?.focus();
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [
    pagamentoAberto,
    comprovante,
    escolhido,
    filtrados.length,
    abrirPagamento,
    limpar,
    focarBusca,
  ]);


  /** Abre o passo de quantidade. Se o item ja esta no carrinho, edita o total. */
  const escolherProduto = useCallback(
    (produto: Produto) => {
      if (Number(produto.estoque_atual) <= 0) return;
      const noCarrinho = carrinho.find((i) => i.produto.id === produto.id);
      const inicial = quantidadeDigitada > 1 ? quantidadeDigitada : (noCarrinho?.quantidade ?? 1);
      setQuantidadeTexto(String(inicial));
      setEscolhido(produto);
      // O texto ja entra selecionado: a primeira tecla substitui o valor.
      requestAnimationFrame(() => campoQuantidade.current?.select());
    },
    [carrinho, quantidadeDigitada],
  );

  /** Confirma o passo: define a quantidade total daquele produto no carrinho. */
  const confirmarQuantidade = useCallback(() => {
    if (!escolhido) return;
    const total = Math.max(Math.floor(quantidade), 0);
    setCarrinho((atual) => {
      const sem = atual.filter((i) => i.produto.id !== escolhido.id);
      return total > 0 ? [...sem, { produto: escolhido, quantidade: total }] : sem;
    });
    setEscolhido(null);
    setBusca("");
    focarBusca();
  }, [escolhido, quantidade, focarBusca]);

  function aoTeclarBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const produto = filtrados[destaque] ?? filtrados[0];
    if (produto) escolherProduto(produto);
  }

  // --- Atalhos do passo de quantidade ------------------------------------
  useEffect(() => {
    if (!escolhido) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmarQuantidade();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setEscolhido(null);
        focarBusca();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "+") {
        e.preventDefault();
        setQuantidadeTexto((q) => String(Number(q || 0) + 1));
        return;
      }
      if (e.key === "ArrowDown" || e.key === "-") {
        e.preventDefault();
        setQuantidadeTexto((q) => String(Math.max(Number(q || 0) - 1, 0)));
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [escolhido, confirmarQuantidade, focarBusca]);

  // --- Identificacao do consumidor ---------------------------------------
  async function identificarConsumidor() {
    const limpo = documento.replace(/\D/g, "");
    setIdentificacao(null);
    setErroDocumento(null);
    if (!limpo) return;

    setIdentificando(true);
    try {
      const { data } = await api.get<Identificacao>(`/parceiros/identificar/${limpo}`);
      setIdentificacao(data);
      setClienteId(data.parceiro_id ? String(data.parceiro_id) : "");
    } catch (e) {
      setErroDocumento(mensagemErro(e, "Documento invalido"));
      setClienteId("");
    } finally {
      setIdentificando(false);
    }
  }

  // --- PIX ----------------------------------------------------------------
  const gerarPix = useCallback(async () => {
    if (!pixConfigurado || total <= 0) return;
    setErro(null);
    try {
      const { data } = await api.post<PixCobranca>("/pix/cobranca", { valor: total });
      setPixCobranca(data);
      setPixImagem(
        await QRCode.toDataURL(data.brcode, { margin: 1, width: 320, errorCorrectionLevel: "M" }),
      );
    } catch (e) {
      setErro(mensagemErro(e, "Nao foi possivel gerar o QR Code"));
    }
  }, [pixConfigurado, total]);

  // Escolher PIX (ou mudar o valor) refaz o QR.
  useEffect(() => {
    if (pagamentoAberto && forma === "PIX") void gerarPix();
  }, [pagamentoAberto, forma, gerarPix]);

  async function copiarPix() {
    if (!pixCobranca) return;
    try {
      await navigator.clipboard.writeText(pixCobranca.brcode);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 2000);
    } catch {
      setErro("Nao foi possivel copiar. Selecione o codigo e copie manualmente.");
    }
  }

  // --- Finalizacao --------------------------------------------------------
  const finalizar = useCallback(async () => {
    if (forma === "DINHEIRO" && recebido !== "" && Number(recebido) < total) return;
    setErro(null);
    setFinalizando(true);
    try {
      const { data } = await api.post<Venda>("/vendas", {
        cliente_id: clienteId ? Number(clienteId) : null,
        documento_cliente: documento.replace(/\D/g, "") || null,
        forma_pagamento: forma,
        desconto: Number(desconto || 0),
        valor_recebido: forma === "DINHEIRO" ? Number(recebido || 0) : 0,
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
  }, [forma, recebido, total, clienteId, documento, desconto, carrinho, limpar, carregar]);

  // --- Atalhos do modal de pagamento -------------------------------------
  useEffect(() => {
    if (!pagamentoAberto) return;

    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo?.tagName === "INPUT" || alvo?.tagName === "TEXTAREA";

      if (e.key === "F1" || (e.key === "1" && !digitando)) {
        e.preventDefault();
        setForma("DINHEIRO");
        requestAnimationFrame(() => campoRecebido.current?.focus());
        return;
      }
      if (e.key === "F2" || (e.key === "2" && !digitando)) {
        e.preventDefault();
        setForma("PIX");
        return;
      }
      if (e.key === "Enter" && !finalizando) {
        e.preventDefault();
        // No dinheiro o primeiro Enter leva ao valor; o segundo confirma.
        if (forma === "DINHEIRO" && document.activeElement === botaoForma.current) {
          campoRecebido.current?.focus();
          return;
        }
        void finalizar();
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pagamentoAberto, finalizando, finalizar, forma]);

  // Comprovante: Enter ou Esc ja comeca a proxima venda.
  useEffect(() => {
    if (!comprovante) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        setComprovante(null);
        focarBusca();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [comprovante, focarBusca]);

  if (carregando) return <Carregando texto="Abrindo o PDV..." />;

  const tecla = "rounded border border-carvao-300 bg-white px-1.5 py-0.5 font-mono text-[11px]";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catalogo */}
      <div className="min-w-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-carvao-400" />
          <input
            ref={campoBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={aoTeclarBusca}
            placeholder="Buscar, ler codigo de barras ou 3* para quantidade..."
            className="campo py-3 pl-9 text-base"
            autoFocus
          />
          {quantidadeDigitada > 1 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Selo tom="marca">{quantidadeDigitada} un</Selo>
            </span>
          )}
        </div>

        {caixa ? (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-carvao-500">
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
              {caixa.caixa_nome} · turno #{caixa.id}
            </span>
            <span className="hidden items-center gap-2 sm:flex">
              <kbd className={tecla}>↑↓</kbd> navegar
              <kbd className={tecla}>Enter</kbd> adicionar
              <kbd className={tecla}>F2</kbd> pagar
              <kbd className={tecla}>F4</kbd> limpar
              <kbd className={tecla}>Alt+←</kbd> tirar ultimo
            </span>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <LockKeyhole className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Voce nao tem caixa aberto. Abra o seu caixa para registrar vendas.
            </span>
            <Link to="/caixa" className="font-semibold underline underline-offset-2">
              Abrir caixa
            </Link>
          </div>
        )}

        <Erro mensagem={erro} />

        {filtrados.length === 0 ? (
          <Cartao>
            <Vazio
              titulo="Nenhum produto encontrado"
              descricao="Ajuste a busca ou cadastre no estoque."
            />
          </Cartao>
        ) : (
          <div
            ref={listaRef}
            className="grid max-h-[62vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4"
          >
            {filtrados.map((p, indice) => {
              const semEstoque = Number(p.estoque_atual) <= 0;
              const ativo = indice === destaque;
              return (
                <button
                  key={p.id}
                  data-indice={indice}
                  onClick={() => escolherProduto(p)}
                  onMouseEnter={() => setDestaque(indice)}
                  disabled={semEstoque}
                  tabIndex={-1}
                  className={cx(
                    "cartao flex flex-col justify-between p-3 text-left transition",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    ativo
                      ? "border-marca-500 ring-2 ring-marca-500/30"
                      : "hover:border-marca-300 hover:shadow-md",
                  )}
                >
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold text-carvao-800">{p.nome}</p>
                    <p className="mt-0.5 text-xs text-carvao-500">{p.codigo ?? "sem codigo"}</p>
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
              onClick={() => {
                limpar();
                focarBusca();
              }}
              tabIndex={-1}
              className="ml-auto text-xs font-semibold text-red-600 hover:underline"
            >
              Limpar (F4)
            </button>
          )}
        </div>

        {carrinho.length === 0 ? (
          <Vazio titulo="Carrinho vazio" descricao="Busque o produto e tecle Enter." />
        ) : (
          <ul className="max-h-[45vh] divide-y divide-carvao-100 overflow-y-auto">
            {carrinho.map(({ produto, quantidade }) => (
              <li key={produto.id} className="flex items-center gap-2 px-4 py-2.5">
                <button
                  onClick={() => escolherProduto(produto)}
                  tabIndex={-1}
                  className="min-w-0 flex-1 text-left"
                  title="Alterar quantidade"
                >
                  <p className="truncate text-sm font-medium text-carvao-800">{produto.nome}</p>
                  <p className="text-xs text-carvao-500">
                    {quantidade} x {brl(produto.preco_venda)}
                  </p>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => alterarQtd(produto.id, -1)}
                    tabIndex={-1}
                    className="rounded-md border border-carvao-200 p-1.5 text-carvao-600 hover:bg-carvao-100"
                    aria-label="Diminuir"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{quantidade}</span>
                  <button
                    onClick={() => alterarQtd(produto.id, 1)}
                    tabIndex={-1}
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
                  tabIndex={-1}
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
            <span className="text-3xl font-bold text-carvao-900">{brl(subtotal)}</span>
          </div>
          <Botao
            className="mt-3 w-full py-3 text-base"
            disabled={carrinho.length === 0 || !caixa}
            tabIndex={-1}
            onClick={abrirPagamento}
          >
            {caixa ? "Finalizar venda (F2)" : "Abra o caixa para vender"}
          </Botao>
        </div>
      </Cartao>

      {/* Passo de quantidade */}
      <Modal
        aberto={!!escolhido}
        titulo={escolhido?.nome ?? ""}
        aoFechar={() => {
          setEscolhido(null);
          focarBusca();
        }}
        largura="max-w-sm"
      >
        {escolhido && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-carvao-600">
              <span>{brl(escolhido.preco_venda)} cada</span>
              <span>
                {Number(escolhido.estoque_atual)} {escolhido.unidade} em estoque
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantidadeTexto((q) => String(Math.max(Number(q || 0) - 1, 0)))}
                tabIndex={-1}
                className="rounded-xl border border-carvao-200 p-4 text-carvao-600 active:bg-carvao-100"
                aria-label="Diminuir"
              >
                <Minus className="h-5 w-5" />
              </button>
              <input
                ref={campoQuantidade}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantidadeTexto}
                onChange={(e) => setQuantidadeTexto(e.target.value.replace(/\D/g, ""))}
                onFocus={(e) => e.target.select()}
                autoFocus
                className="campo w-full py-4 text-center text-3xl font-bold"
              />
              <button
                onClick={() => setQuantidadeTexto((q) => String(Number(q || 0) + 1))}
                tabIndex={-1}
                className="rounded-xl border border-carvao-200 p-4 text-carvao-600 active:bg-carvao-100"
                aria-label="Aumentar"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setQuantidadeTexto(String(n))}
                  tabIndex={-1}
                  className={cx(
                    "min-w-11 rounded-lg border px-3 py-2 text-sm font-semibold transition",
                    quantidade === n
                      ? "border-marca-500 bg-marca-50 text-marca-700"
                      : "border-carvao-200 text-carvao-600 hover:bg-carvao-50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-carvao-50 px-3 py-2">
              <span className="text-sm text-carvao-600">Subtotal do item</span>
              <span className="text-xl font-bold text-carvao-900">
                {brl(Number(escolhido.preco_venda) * quantidade)}
              </span>
            </div>

            {Number(escolhido.estoque_atual) < quantidade && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Estoque menor que a quantidade pedida.
              </p>
            )}

            <p className="text-center text-xs text-carvao-400">
              <kbd className={tecla}>up/down</kbd> ou <kbd className={tecla}>+ -</kbd> ajustam,{" "}
              <kbd className={tecla}>Enter</kbd> confirma, <kbd className={tecla}>Esc</kbd> cancela
            </p>

            <div className="flex gap-2">
              <Botao
                variante="secundario"
                className="flex-1"
                tabIndex={-1}
                onClick={() => {
                  setEscolhido(null);
                  focarBusca();
                }}
              >
                Cancelar
              </Botao>
              <Botao className="flex-1 py-3" tabIndex={-1} onClick={confirmarQuantidade}>
                {quantidade === 0 ? "Remover" : "Adicionar"}
              </Botao>
            </div>
          </div>
        )}
      </Modal>

      {/* Pagamento */}
      <Modal
        aberto={pagamentoAberto}
        titulo={`Pagamento · ${brl(total)}`}
        aoFechar={() => {
          setPagamentoAberto(false);
          focarBusca();
        }}
        largura="max-w-lg"
      >
        <Erro mensagem={erro} />
        <div className="space-y-4">
          {/* Forma de pagamento: grupo de radio navegavel com as setas */}
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Forma de pagamento"
          >
            {(
              [
                { valor: "DINHEIRO", texto: "Dinheiro", atalho: "1", icone: Banknote },
                { valor: "PIX", texto: "PIX", atalho: "2", icone: QrCode },
              ] as const
            ).map((f) => (
              <button
                key={f.valor}
                ref={f.valor === forma ? botaoForma : undefined}
                autoFocus={f.valor === "DINHEIRO"}
                role="radio"
                aria-checked={forma === f.valor}
                tabIndex={forma === f.valor ? 0 : -1}
                onKeyDown={(e) => {
                  // As setas alternam a forma sem tirar a mao do teclado.
                  if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
                    e.preventDefault();
                    setForma((atual) => (atual === "DINHEIRO" ? "PIX" : "DINHEIRO"));
                  }
                }}
                onClick={() => {
                  setForma(f.valor);
                  if (f.valor === "DINHEIRO") {
                    requestAnimationFrame(() => campoRecebido.current?.focus());
                  }
                }}
                className={cx(
                  "flex items-center justify-center gap-2 rounded-lg border-2 py-3 font-semibold transition",
                  forma === f.valor
                    ? "border-marca-500 bg-marca-50 text-marca-700"
                    : "border-carvao-200 text-carvao-600 hover:border-carvao-300",
                )}
              >
                <f.icone className="h-5 w-5" />
                {f.texto}
                <kbd className={tecla}>{f.atalho}</kbd>
              </button>
            ))}
          </div>

          {forma === "DINHEIRO" ? (
            <>
              <Campo
                ref={campoRecebido}
                rotulo="Valor recebido (R$)"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={recebido}
                onChange={(e) => setRecebido(e.target.value)}
                className="py-3 text-lg font-semibold"
                dica="Vazio = valor exato. Enter confirma."
              />

              <div className="flex flex-wrap gap-2">
                {sugestoesDeCedula(total).map((valor) => (
                  <button
                    key={valor}
                    onClick={() => setRecebido(String(valor))}
                    className={cx(
                      "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                      Number(recebido) === valor
                        ? "border-marca-500 bg-marca-50 text-marca-700"
                        : "border-carvao-200 text-carvao-600 hover:bg-carvao-50",
                    )}
                  >
                    {valor === total ? "Exato" : brl(valor)}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-carvao-50 p-4">
                <div className="flex justify-between text-sm text-carvao-600">
                  <span>Total</span>
                  <span className="font-medium">{brl(total)}</span>
                </div>
                <div className="flex justify-between text-sm text-carvao-600">
                  <span>Recebido</span>
                  <span className="font-medium">{brl(recebido === "" ? total : recebido)}</span>
                </div>
                {faltaReceber > 0 ? (
                  <div className="mt-2 flex items-center justify-between border-t border-carvao-200 pt-2 text-red-600">
                    <span className="font-semibold">Falta receber</span>
                    <span className="text-2xl font-bold">{brl(faltaReceber)}</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between border-t border-carvao-200 pt-2 text-emerald-700">
                    <span className="font-semibold">Troco</span>
                    <span className="text-3xl font-bold">{brl(troco)}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-carvao-200 p-4 text-center">
              {!pixConfigurado ? (
                <p className="text-sm text-carvao-600">
                  Chave PIX nao configurada. Preencha <code>PIX_CHAVE</code> no{" "}
                  <code>backend/.env</code> para gerar o QR Code. A venda pode ser registrada
                  normalmente como PIX.
                </p>
              ) : pixImagem ? (
                <>
                  <img src={pixImagem} alt="QR Code do PIX" className="mx-auto h-52 w-52 rounded-lg" />
                  <p className="mt-2 text-2xl font-bold text-carvao-900">{brl(total)}</p>
                  <p className="text-xs text-carvao-500">
                    {pixCobranca?.beneficiario} · o valor ja vai no QR
                  </p>
                  <Botao
                    variante="secundario"
                    className="mt-3 w-full"
                    icone={pixCopiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    onClick={copiarPix}
                  >
                    {pixCopiado ? "Codigo copiado" : "Copiar codigo (copia e cola)"}
                  </Botao>
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
                    Confirme no app do banco que o valor caiu antes de teclar Enter: o sistema gera
                    o QR, mas nao recebe aviso do banco.
                  </p>
                </>
              ) : (
                <p className="py-8 text-sm text-carvao-500">Gerando QR Code...</p>
              )}
            </div>
          )}

          {/* Identificacao e desconto ficam recolhidos: o caminho rapido e sem eles */}
          <details className="rounded-lg border border-carvao-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-carvao-600">
              CPF / CNPJ na nota e desconto
              {identificacao && (
                <span className="ml-2 text-xs text-emerald-700">
                  {identificacao.nome ?? documentoFormatado(identificacao.documento)}
                </span>
              )}
            </summary>
            <div className="mt-2 flex gap-2">
              <input
                value={documento}
                onChange={(e) => {
                  setDocumento(e.target.value);
                  setIdentificacao(null);
                  setErroDocumento(null);
                  setClienteId("");
                }}
                onBlur={identificarConsumidor}
                inputMode="numeric"
                placeholder="Vazio = consumidor diverso"
                className="campo"
              />
              <Botao
                type="button"
                variante="secundario"
                carregando={identificando}
                onClick={identificarConsumidor}
                className="shrink-0"
              >
                Identificar
              </Botao>
            </div>
            {erroDocumento && (
              <p className="mt-1 text-xs font-medium text-red-600">{erroDocumento}</p>
            )}
            {identificacao && !identificacao.cadastrado && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-carvao-500">
                <UserRound className="h-3.5 w-3.5" />
                {identificacao.tipo} valido, sem cadastro.
              </p>
            )}
            <Campo
              rotulo="Desconto (R$)"
              type="number"
              step="0.01"
              min="0"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
              className="mt-3"
            />
          </details>

          <div className="flex gap-2">
            <Botao
              variante="secundario"
              className="flex-1"
              onClick={() => {
                setPagamentoAberto(false);
                focarBusca();
              }}
            >
              Voltar (Esc)
            </Botao>
            <Botao
              variante="sucesso"
              className="flex-1 py-3 text-base"
              carregando={finalizando}
              disabled={!caixa || !!erroDocumento || faltaReceber > 0}
              onClick={finalizar}
            >
              Confirmar (Enter)
            </Botao>
          </div>
        </div>
      </Modal>

      {/* Comprovante */}
      <Modal
        aberto={!!comprovante}
        titulo={`Venda #${comprovante?.id} concluida`}
        aoFechar={() => {
          setComprovante(null);
          focarBusca();
        }}
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
                <div className="flex justify-between text-lg font-bold text-emerald-700">
                  <span>Troco</span>
                  <span>{brl(comprovante.troco)}</span>
                </div>
              )}
              <div className="flex justify-between text-carvao-600">
                <span>Consumidor</span>
                <span>
                  {comprovante.cliente_nome ??
                    (comprovante.documento_cliente
                      ? documentoFormatado(comprovante.documento_cliente)
                      : "Diverso")}
                </span>
              </div>
            </div>
            <Botao
              className="w-full py-3"
              onClick={() => {
                setComprovante(null);
                focarBusca();
              }}
            >
              Nova venda (Enter)
            </Botao>
          </div>
        )}
      </Modal>
    </div>
  );
}
