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
  Printer,
  QrCode,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import {
  brl,
  dataHora,
  documentoFormatado,
  rotulo,
  valorNumero,
  valorTexto,
} from "../lib/format";
import type { CaixaSessao, Identificacao, PixCobranca, Produto, Venda } from "../lib/tipos";
import { Recibo } from "../components/Recibo";
import {
  Botao,
  Campo,
  CampoValor,
  Cartao,
  Carregando,
  Erro,
  Modal,
  Selo,
  Vazio,
  cx,
} from "../components/ui";

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
  // O PDV comeca em repouso: so existe venda depois de o operador abrir uma.
  // Sem isso, o caixa digita em um carrinho que ele nao sabe se e novo.
  const [vendaAberta, setVendaAberta] = useState(false);

  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [forma, setForma] = useState<Forma>("DINHEIRO");
  const [documento, setDocumento] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [identificacao, setIdentificacao] = useState<Identificacao | null>(null);
  const [erroDocumento, setErroDocumento] = useState<string | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [desconto, setDesconto] = useState("0,00");
  const [recebido, setRecebido] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [comprovante, setComprovante] = useState<Venda | null>(null);
  /** A venda que está no papel neste momento (impressão ou reimpressão). */
  const [paraImprimir, setParaImprimir] = useState<Venda | null>(null);

  // Localizar venda: o cliente troca de ideia depois de fechar, e refazer a
  // venda inteira criaria dois registros para a mesma compra.
  const [localizarAberto, setLocalizarAberto] = useState(false);
  const [buscaVenda, setBuscaVenda] = useState("");
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [buscandoVendas, setBuscandoVendas] = useState(false);
  const [detalhe, setDetalhe] = useState<Venda | null>(null);
  /** Quando preenchido, finalizar altera esta venda em vez de criar outra. */
  const [editando, setEditando] = useState<Venda | null>(null);

  const [pixConfigurado, setPixConfigurado] = useState(false);
  const [pixCobranca, setPixCobranca] = useState<PixCobranca | null>(null);
  const [pixImagem, setPixImagem] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);

  /** Ultimo produto lancado: fica marcado no carrinho ate entrar outro. */
  const [ultimoLancado, setUltimoLancado] = useState<number | null>(null);

  // Passo de quantidade: aberto ao escolher um produto (Enter ou clique).
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [quantidadeTexto, setQuantidadeTexto] = useState("1");
  const quantidade = Number(quantidadeTexto || 0);

  const campoBusca = useRef<HTMLInputElement>(null);
  const campoQuantidade = useRef<HTMLInputElement>(null);
  const campoRecebido = useRef<HTMLInputElement>(null);
  const botaoForma = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  /**
   * Instante em que o ultimo passo foi aberto. O Enter que abre um modal
   * continua subindo ate a janela, e o atalho do modal recem-montado o
   * receberia de volta -- confirmando sozinho o que acabou de aparecer.
   * Comparar o timeStamp descarta exatamente essa tecla, e so ela.
   */
  const abertoEm = useRef(0);

  const carregar = useCallback(async () => {
    try {
      const [p, k, x] = await Promise.all([
        // Só produto final: insumo não tem preço de balcão.
        api.get<Produto[]>("/estoque/produtos", { params: { ativo: true, tipo: "FINAL" } }),
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
    // Lista vazia sem busca: o catalogo inteiro na tela so atrapalha quem
    // digita, e a venda comum comeca por uma tecla, nao por um passeio.
    if (!alvo) return [];
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
  const total = Math.max(subtotal - valorNumero(desconto), 0);
  const troco = forma === "DINHEIRO" ? Math.max(valorNumero(recebido) - total, 0) : 0;
  const faltaReceber =
    forma === "DINHEIRO" && recebido !== "" ? Math.max(total - valorNumero(recebido), 0) : 0;

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
    setDesconto("0,00");
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
    setEditando(null);
    setUltimoLancado(null);
  }, []);

  const focarBusca = useCallback(() => {
    requestAnimationFrame(() => campoBusca.current?.focus());
  }, []);

  const abrirLocalizar = useCallback(() => {
    setErro(null);
    setLocalizarAberto(true);
  }, []);

  const novaVenda = useCallback(() => {
    limpar();
    setVendaAberta(true);
    focarBusca();
  }, [limpar, focarBusca]);

  /** Fecha a venda em andamento e volta para a tela inicial. */
  const fecharVenda = useCallback(() => {
    limpar();
    setVendaAberta(false);
  }, [limpar]);

  /** Soma (ou tira) uma unidade do produto destacado, sem abrir o passo. */
  const ajustarDestacado = useCallback(
    (delta: number) => {
      const produto = filtrados[destaque] ?? filtrados[0];
      if (!produto) return;
      if (delta > 0 && Number(produto.estoque_atual) <= 0) return;
      setUltimoLancado(produto.id);
      setCarrinho((atual) => {
        const item = atual.find((i) => i.produto.id === produto.id);
        if (!item) return delta > 0 ? [...atual, { produto, quantidade: delta }] : atual;
        return atual
          .map((i) => (i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + delta } : i))
          .filter((i) => i.quantidade > 0);
      });
    },
    [filtrados, destaque],
  );

  const abrirPagamento = useCallback(() => {
    if (carrinho.length === 0 || !caixa) return;
    abertoEm.current = performance.now();
    setRecebido("");
    setPixCobranca(null);
    setPixImagem(null);
    setPagamentoAberto(true);
  }, [carrinho.length, caixa]);

  /** Abre o passo de quantidade. Se o item ja esta no carrinho, edita o total. */
  const escolherProduto = useCallback(
    (produto: Produto) => {
      if (Number(produto.estoque_atual) <= 0) return;
      abertoEm.current = performance.now();
      const noCarrinho = carrinho.find((i) => i.produto.id === produto.id);
      const inicial = quantidadeDigitada > 1 ? quantidadeDigitada : (noCarrinho?.quantidade ?? 1);
      setQuantidadeTexto(String(inicial));
      setEscolhido(produto);
      // O texto ja entra selecionado: a primeira tecla substitui o valor.
      requestAnimationFrame(() => campoQuantidade.current?.select());
    },
    [carrinho, quantidadeDigitada],
  );

  // --- Atalhos de teclado da tela ----------------------------------------
  useEffect(() => {
    if (pagamentoAberto || comprovante || escolhido || !vendaAberta) return;

    function aoTeclar(e: KeyboardEvent) {
      // Com a busca vazia as teclas sobram para o carrinho: nada do que o
      // operador digita ali corre o risco de virar comando por engano.
      const buscaVazia = busca.trim() === "";

      if (e.key === "Enter") {
        e.preventDefault();
        // Sem nada digitado nao ha produto para adicionar: Enter fecha a venda.
        if (buscaVazia) {
          abrirPagamento();
          return;
        }
        const produto = filtrados[destaque] ?? filtrados[0];
        if (produto) escolherProduto(produto);
        return;
      }
      if (e.key === "Backspace" && buscaVazia) {
        e.preventDefault();
        setCarrinho((atual) => atual.slice(0, -1));
        return;
      }
      if (e.key === " " && buscaVazia) {
        e.preventDefault();
        abrirPagamento();
        return;
      }
      // Bloco numerico: + e - somam uma unidade do item destacado, / procura
      // uma venda antiga. Tudo ao alcance da mao que ja digita a quantidade.
      if ((e.key === "+" || e.key === "-") && buscaVazia) {
        e.preventDefault();
        ajustarDestacado(e.key === "+" ? 1 : -1);
        return;
      }
      if (e.key === "/" && buscaVazia) {
        e.preventDefault();
        abrirLocalizar();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setDestaque((d) => Math.min(d + 1, Math.max(filtrados.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setDestaque((d) => Math.max(d - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        // Busca vazia e carrinho vazio: nao ha o que limpar, entao sai da venda.
        if (buscaVazia && carrinho.length === 0) {
          e.preventDefault();
          fecharVenda();
          return;
        }
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
    vendaAberta,
    busca,
    carrinho.length,
    filtrados,
    destaque,
    escolherProduto,
    abrirPagamento,
    abrirLocalizar,
    ajustarDestacado,
    novaVenda,
    fecharVenda,
    focarBusca,
  ]);

  // --- Atalhos da tela inicial -------------------------------------------
  useEffect(() => {
    if (vendaAberta || localizarAberto || comprovante) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " " || e.key === "+" || e.key.toLowerCase() === "n") {
        e.preventDefault();
        novaVenda();
        return;
      }
      if (e.key === "/" || e.key.toLowerCase() === "l") {
        e.preventDefault();
        abrirLocalizar();
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [vendaAberta, localizarAberto, comprovante, novaVenda, abrirLocalizar]);


  /** Confirma o passo: define a quantidade total daquele produto no carrinho. */
  const confirmarQuantidade = useCallback(() => {
    if (!escolhido) return;
    const total = Math.max(Math.floor(quantidade), 0);
    setCarrinho((atual) => {
      const sem = atual.filter((i) => i.produto.id !== escolhido.id);
      return total > 0 ? [...sem, { produto: escolhido, quantidade: total }] : sem;
    });
    setUltimoLancado(total > 0 ? escolhido.id : null);
    setEscolhido(null);
    setBusca("");
    focarBusca();
  }, [escolhido, quantidade, focarBusca]);

  // --- Atalhos do passo de quantidade ------------------------------------
  useEffect(() => {
    if (!escolhido) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.timeStamp <= abertoEm.current) return;
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
      setErroDocumento(mensagemErro(e, "Documento inválido"));
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
      setErro(mensagemErro(e, "Não foi possível gerar o QR Code"));
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
      setErro("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  // --- Localizar, alterar e imprimir --------------------------------------
  const carregarVendas = useCallback(async () => {
    setBuscandoVendas(true);
    try {
      const { data } = await api.get<Venda[]>("/vendas", {
        params: { busca: buscaVenda || undefined, limite: 20 },
      });
      setVendas(data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setBuscandoVendas(false);
    }
  }, [buscaVenda]);

  useEffect(() => {
    if (!localizarAberto) return;
    const t = setTimeout(() => void carregarVendas(), 250);
    return () => clearTimeout(t);
  }, [localizarAberto, carregarVendas]);

  /** Manda a venda para o papel: monta o recibo e chama a impressão. */
  function imprimir(venda: Venda) {
    setParaImprimir(venda);
    // Um instante para o recibo entrar no DOM antes de a janela de impressão
    // abrir. É temporizador, e não requestAnimationFrame: com a aba em segundo
    // plano o navegador não desenha quadro nenhum, e a impressão nunca sairia.
    setTimeout(() => window.print(), 50);
  }

  /** Traz a venda para o carrinho para ajustar itens sem refazê-la. */
  function editarVenda(venda: Venda) {
    const itens: ItemCarrinho[] = [];
    for (const item of venda.itens) {
      const produto = produtos.find((p) => p.id === item.produto_id);
      if (!produto) {
        setErro(`O produto "${item.descricao}" saiu do cadastro. Cancele a venda e refaça.`);
        return;
      }
      itens.push({ produto, quantidade: Number(item.quantidade) });
    }
    setCarrinho(itens);
    setEditando(venda);
    setVendaAberta(true);
    setDocumento(venda.documento_cliente ?? "");
    setClienteId(venda.cliente_id ? String(venda.cliente_id) : "");
    setDesconto(valorTexto(venda.desconto));
    setForma(venda.forma_pagamento === "PIX" ? "PIX" : "DINHEIRO");
    setLocalizarAberto(false);
    setDetalhe(null);
    focarBusca();
  }

  async function cancelarVenda(venda: Venda) {
    if (!confirm(`Cancelar a venda #${venda.id}? Os itens voltam para o estoque.`)) return;
    setErro(null);
    try {
      await api.post(`/vendas/${venda.id}/cancelar`);
      await carregarVendas();
      await carregar();
      setDetalhe(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // --- Finalizacao --------------------------------------------------------
  const finalizar = useCallback(async () => {
    if (forma === "DINHEIRO" && recebido !== "" && valorNumero(recebido) < total) return;
    setErro(null);
    setFinalizando(true);
    try {
      const corpo = {
        forma_pagamento: forma,
        desconto: valorNumero(desconto),
        valor_recebido: forma === "DINHEIRO" ? valorNumero(recebido) : 0,
        itens: carrinho.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
      };
      // Editando, a venda continua sendo a mesma: só os itens mudam.
      const { data } = editando
        ? await api.put<Venda>(`/vendas/${editando.id}`, corpo)
        : await api.post<Venda>("/vendas", {
            ...corpo,
            cliente_id: clienteId ? Number(clienteId) : null,
            documento_cliente: documento.replace(/\D/g, "") || null,
          });
      setEditando(null);
      setComprovante(data);
      setPagamentoAberto(false);
      limpar();
      setVendaAberta(false);
      void carregar();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível finalizar a venda"));
    } finally {
      setFinalizando(false);
    }
  }, [forma, recebido, total, clienteId, documento, desconto, carrinho, limpar, carregar, editando]);

  // --- Atalhos do modal de pagamento -------------------------------------
  useEffect(() => {
    if (!pagamentoAberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.timeStamp <= abertoEm.current) return;
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo?.tagName === "INPUT" || alvo?.tagName === "TEXTAREA";

      if (e.key === "/") {
        // Alterna a forma sem tirar a mao do bloco numerico.
        e.preventDefault();
        setForma((atual) => (atual === "DINHEIRO" ? "PIX" : "DINHEIRO"));
        return;
      }
      if (e.key === "*") {
        // Valor exato: sem troco, sem digitar.
        e.preventDefault();
        setRecebido("");
        return;
      }
      if (e.key.toLowerCase() === "d" && !digitando) {
        e.preventDefault();
        setForma("DINHEIRO");
        requestAnimationFrame(() => campoRecebido.current?.focus());
        return;
      }
      if (e.key.toLowerCase() === "p" && !digitando) {
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
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setComprovante(null);
        novaVenda();
        return;
      }
      if (e.key === "*" || e.key.toLowerCase() === "i") {
        e.preventDefault();
        imprimir(comprovante!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setComprovante(null);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [comprovante, novaVenda]);

  if (carregando) return <Carregando texto="Abrindo o PDV..." />;

  const tecla = "rounded border border-carvao-300 bg-white px-1.5 py-0.5 font-mono text-[11px]";

  const modais = (
    <>

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
                {Number(escolhido.estoque_atual)} em estoque
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
              <kbd className={tecla}>↑↓</kbd> ou <kbd className={tecla}>+ −</kbd> ajustam,{" "}
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
                { valor: "DINHEIRO", texto: "Dinheiro", atalho: "/", icone: Banknote },
                { valor: "PIX", texto: "PIX", atalho: "/", icone: QrCode },
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
              <CampoValor
                ref={campoRecebido}
                rotulo="Valor recebido (R$)"
                value={recebido}
                aoMudar={setRecebido}
                className="py-3 text-lg font-semibold"
                dica="Vazio = valor exato (*). Enter confirma. / troca a forma."
              />

              <div className="flex flex-wrap gap-2">
                {sugestoesDeCedula(total).map((valor) => (
                  <button
                    key={valor}
                    onClick={() => setRecebido(valorTexto(valor))}
                    className={cx(
                      "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                      valorNumero(recebido) === valor
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
                  Chave PIX não configurada. Preencha <code>PIX_CHAVE</code> no{" "}
                  <code>backend/.env</code> para gerar o QR Code. A venda pode ser registrada
                  normalmente como PIX.
                </p>
              ) : pixImagem ? (
                <>
                  <img src={pixImagem} alt="QR Code do PIX" className="mx-auto h-52 w-52 rounded-lg" />
                  <p className="mt-2 text-2xl font-bold text-carvao-900">{brl(total)}</p>
                  <p className="text-xs text-carvao-500">
                    {pixCobranca?.beneficiario} · o valor já vai no QR
                  </p>
                  <Botao
                    variante="secundario"
                    className="mt-3 w-full"
                    icone={pixCopiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    onClick={copiarPix}
                  >
                    {pixCopiado ? "Código copiado" : "Copiar código (copia e cola)"}
                  </Botao>
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
                    Confirme no app do banco que o valor caiu antes de teclar Enter: o sistema gera
                    o QR, mas não recebe aviso do banco.
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
                {identificacao.tipo} válido, sem cadastro.
              </p>
            )}
            <CampoValor
              rotulo="Desconto (R$)"
              value={desconto}
              aoMudar={setDesconto}
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

      {/* Localizar venda */}
      <Modal
        aberto={localizarAberto}
        titulo="Localizar venda"
        aoFechar={() => {
          setLocalizarAberto(false);
          if (vendaAberta) focarBusca();
        }}
        largura="max-w-2xl"
      >
        <div className="space-y-3">
          <Erro mensagem={erro} />
          <Campo
            autoFocus
            value={buscaVenda}
            onChange={(e) => setBuscaVenda(e.target.value)}
            placeholder="Número da venda, CPF ou nome do cliente"
          />

          {buscandoVendas ? (
            <p className="py-6 text-center text-sm text-carvao-400">Procurando...</p>
          ) : vendas.length === 0 ? (
            <Vazio titulo="Nenhuma venda encontrada" />
          ) : (
            <ul className="max-h-96 divide-y divide-carvao-100 overflow-y-auto rounded-lg border border-carvao-100">
              {vendas.map((v) => (
                <li key={v.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-carvao-900">
                        Venda #{v.id}
                        {v.status === "CANCELADA" && (
                          <span className="ml-2 text-xs font-normal text-red-600">CANCELADA</span>
                        )}
                      </p>
                      <p className="text-xs text-carvao-500">
                        {dataHora(v.criado_em)} · {rotulo(v.forma_pagamento)} ·{" "}
                        {v.cliente_nome ??
                          (v.documento_cliente
                            ? documentoFormatado(v.documento_cliente)
                            : "Consumidor diverso")}
                      </p>
                    </div>
                    <span className="font-bold text-carvao-900">{brl(v.total)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Botao variante="secundario" onClick={() => setDetalhe(v)}>
                      Detalhes
                    </Botao>
                    <Botao
                      variante="secundario"
                      icone={<Printer className="h-4 w-4" />}
                      onClick={() => imprimir(v)}
                    >
                      Imprimir
                    </Botao>
                    {v.status !== "CANCELADA" && (
                      <>
                        <Botao variante="secundario" onClick={() => editarVenda(v)}>
                          Alterar itens
                        </Botao>
                        <Botao variante="perigo" onClick={() => cancelarVenda(v)}>
                          Cancelar
                        </Botao>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Detalhe da venda localizada */}
      <Modal
        aberto={!!detalhe}
        titulo={`Venda #${detalhe?.id}`}
        aoFechar={() => setDetalhe(null)}
        largura="max-w-sm"
      >
        {detalhe && (
          <div className="space-y-3 text-sm">
            <ul className="divide-y divide-carvao-100">
              {detalhe.itens.map((i) => (
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
                <span>{brl(detalhe.total)}</span>
              </div>
              <div className="flex justify-between text-carvao-600">
                <span>Pagamento</span>
                <span>{rotulo(detalhe.forma_pagamento)}</span>
              </div>
              <div className="flex justify-between text-carvao-600">
                <span>Atendente</span>
                <span>{detalhe.usuario_nome ?? "-"}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Só existe no papel: a regra de impressão está em index.css. */}
      {paraImprimir && <Recibo venda={paraImprimir} />}

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
                <span>{rotulo(comprovante.forma_pagamento)}</span>
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
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                className="flex-1 py-3"
                icone={<Printer className="h-4 w-4" />}
                onClick={() => imprimir(comprovante)}
              >
                Imprimir (*)
              </Botao>
              <Botao
                className="flex-1 py-3"
                onClick={() => {
                  setComprovante(null);
                  novaVenda();
                }}
              >
                Nova venda (Enter)
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </>
  );

  const avisoCaixa = !caixa && (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <LockKeyhole className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Você não tem caixa aberto. Abra o seu caixa para registrar vendas.
      </span>
      <Link to="/caixa" className="font-semibold underline underline-offset-2">
        Abrir caixa
      </Link>
    </div>
  );

  // --- Tela inicial: nada acontece antes de o operador abrir uma venda ----
  if (!vendaAberta && !comprovante) {
    return (
      <>
        <div className="mx-auto max-w-2xl">
          {avisoCaixa}
          <Erro mensagem={erro} />

          {caixa && (
            <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-carvao-500">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
              {caixa.caixa_nome} · turno #{caixa.id}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={novaVenda}
              disabled={!caixa}
              className="cartao flex flex-col items-center gap-2 px-6 py-10 text-center transition hover:border-marca-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="h-8 w-8 text-marca-600" />
              <span className="text-lg font-bold text-carvao-900">Nova venda</span>
              <span className="text-sm text-carvao-500">Carrinho zerado, pronto para vender</span>
              <span className="mt-1 flex gap-1.5">
                <kbd className={tecla}>Enter</kbd>
                <kbd className={tecla}>+</kbd>
                <kbd className={tecla}>N</kbd>
              </span>
            </button>

            <button
              onClick={abrirLocalizar}
              className="cartao flex flex-col items-center gap-2 px-6 py-10 text-center transition hover:border-marca-400 hover:shadow-md"
            >
              <Search className="h-8 w-8 text-carvao-500" />
              <span className="text-lg font-bold text-carvao-900">Localizar venda</span>
              <span className="text-sm text-carvao-500">
                Reimprimir, alterar itens ou cancelar uma venda já fechada
              </span>
              <span className="mt-1 flex gap-1.5">
                <kbd className={tecla}>/</kbd>
                <kbd className={tecla}>L</kbd>
              </span>
            </button>
          </div>
        </div>

        {modais}
      </>
    );
  }

  return (
    <>
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catalogo */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-carvao-400" />
          <input
            ref={campoBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar, ler código de barras ou 3* para quantidade..."
            className="campo py-3 pl-9 text-base"
            autoFocus
          />
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {quantidadeDigitada > 1 && <Selo tom="marca">{quantidadeDigitada} un</Selo>}
            <span className="text-xs tabular-nums text-carvao-400">
              {termo ? `${filtrados.length} de ${produtos.length}` : `${produtos.length} produtos`}
            </span>
          </span>
        </div>

        {caixa ? (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-carvao-500">
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
              {caixa.caixa_nome} · turno #{caixa.id}
            </span>
            <span className="hidden items-center gap-2 sm:flex">
              <kbd className={tecla}>↑↓←→</kbd> navegar
              <kbd className={tecla}>Enter</kbd> adicionar
              <kbd className={tecla}>3*</kbd> quantidade
              <span className="text-carvao-400">|</span>
              <span>
                com a busca vazia: <kbd className={tecla}>+</kbd> <kbd className={tecla}>−</kbd> uma
                unidade, <kbd className={tecla}>Enter</kbd> finaliza,{" "}
                <kbd className={tecla}>Backspace</kbd> tira o último,{" "}
                <kbd className={tecla}>/</kbd> localiza, <kbd className={tecla}>Esc</kbd> sai
              </span>
            </span>
          </div>
        ) : (
          avisoCaixa
        )}

        <Erro mensagem={erro} />

        {filtrados.length === 0 ? (
          <Cartao className="flex min-h-0 flex-1 items-center justify-center">
            {termo ? (
              <Vazio
                titulo="Nenhum produto encontrado"
                descricao="Ajuste a busca ou cadastre no estoque."
              />
            ) : (
              <Vazio
                titulo="Comece a digitar"
                descricao="Uma letra do nome, o código de barras ou 3* para a quantidade."
              />
            )}
          </Cartao>
        ) : (
          <div
            ref={listaRef}
            className="min-h-0 flex-1 divide-y divide-carvao-100 overflow-y-auto rounded-xl border border-carvao-100 bg-white shadow-sm"
          >
            {filtrados.map((p, indice) => {
              const semEstoque = Number(p.estoque_atual) <= 0;
              const ativo = indice === destaque;
              const noCarrinho = carrinho.find((i) => i.produto.id === p.id)?.quantidade ?? 0;
              return (
                <button
                  key={p.id}
                  data-indice={indice}
                  onClick={() => escolherProduto(p)}
                  onMouseEnter={() => setDestaque(indice)}
                  disabled={semEstoque}
                  tabIndex={-1}
                  className={cx(
                    "grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 px-3 py-2.5 text-left transition",
                    "sm:grid-cols-[1fr_7rem_5rem_4.5rem]",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    ativo
                      ? "border-l-[3px] border-marca-500 bg-marca-50 pl-[9px]"
                      : "border-l-[3px] border-transparent pl-[9px] hover:bg-carvao-50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-carvao-800">
                      {p.nome}
                      {noCarrinho > 0 && (
                        <span className="ml-2 text-xs font-bold text-emerald-700">
                          {noCarrinho} no carrinho
                        </span>
                      )}
                    </p>
                    <p className="truncate font-mono text-[11px] text-carvao-400">
                      {p.codigo ?? "sem código"}
                    </p>
                  </div>
                  <span className="text-right text-base font-bold tabular-nums text-marca-600">
                    {brl(p.preco_venda)}
                  </span>
                  <span
                    className={cx(
                      "text-right text-xs tabular-nums",
                      semEstoque
                        ? "font-semibold text-red-600"
                        : p.abaixo_minimo
                          ? "font-semibold text-amber-700"
                          : "text-carvao-400",
                    )}
                  >
                    {semEstoque ? "esgotado" : `${Number(p.estoque_atual)} un`}
                  </span>
                  <span className="hidden text-right sm:block">
                    {ativo && !semEstoque && <kbd className={tecla}>Enter</kbd>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Carrinho */}
      <Cartao className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-carvao-100 px-4 py-3">
          <ShoppingCart className="h-4.5 w-4.5 text-marca-600" />
          <h2 className="font-bold text-carvao-900">Venda atual</h2>
          <button
            onClick={fecharVenda}
            tabIndex={-1}
            className="ml-auto text-xs font-semibold text-carvao-500 hover:underline"
            title="Voltar para a tela inicial"
          >
            Sair (Esc)
          </button>
          {carrinho.length > 0 && (
            <button
              onClick={novaVenda}
              tabIndex={-1}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Nova venda
            </button>
          )}
        </div>

        {editando && (
          <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Alterando a <strong>venda #{editando.id}</strong>. Ao finalizar, ela é atualizada e o
            estoque recebe só a diferença.
          </div>
        )}

        {carrinho.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Vazio titulo="Carrinho vazio" descricao="Busque o produto e tecle Enter." />
          </div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-carvao-100 overflow-y-auto">
            {carrinho.map(({ produto, quantidade }) => (
              <li
                key={produto.id}
                className={cx(
                  "flex items-center gap-2 px-4 py-2.5 transition-colors",
                  produto.id === ultimoLancado && "bg-emerald-50",
                )}
              >
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

        <div className="mt-auto border-t border-carvao-100 p-4">
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
            {!caixa
              ? "Abra o caixa para vender"
              : editando
                ? `Salvar a venda #${editando.id} (Enter)`
                : "Finalizar venda (Enter)"}
          </Botao>
        </div>
      </Cartao>

    </div>

      {modais}
    </>
  );
}
