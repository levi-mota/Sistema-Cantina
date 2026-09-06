import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Printer, QrCode, TriangleAlert } from "lucide-react";
import QRCode from "qrcode";

import { api, mensagemErro } from "../lib/api";
import type { ReciboConfig, Venda } from "../lib/tipos";
import { Recibo, RECIBO_PADRAO } from "../components/Recibo";
import { Botao, Campo, Cartao, Carregando, Erro } from "../components/ui";

interface ContaPix {
  configurado: boolean;
  chave: string;
  beneficiario: string;
  cidade: string;
  tipo_chave?: string | null;
}

const PIX_VAZIO: ContaPix = { configurado: false, chave: "", beneficiario: "", cidade: "" };

/** Uma venda de mentira, só para a prévia ter o que mostrar. */
const VENDA_EXEMPLO: Venda = {
  id: 1234,
  cliente_nome: null,
  documento_cliente: null,
  usuario_nome: "Marina",
  status: "FINALIZADA",
  forma_pagamento: "DINHEIRO",
  subtotal: "27.50",
  desconto: "0",
  total: "27.50",
  valor_recebido: "50.00",
  troco: "22.50",
  criado_em: new Date().toISOString(),
  itens: [
    {
      id: 1,
      produto_id: 1,
      descricao: "Pão de queijo",
      quantidade: "3",
      preco_unitario: "3.50",
      desconto: "0",
      total: "10.50",
    },
    {
      id: 2,
      produto_id: 2,
      descricao: "Coxinha de frango",
      quantidade: "2",
      preco_unitario: "5.50",
      desconto: "0",
      total: "11.00",
    },
    {
      id: 3,
      produto_id: 3,
      descricao: "Suco de laranja 300ml",
      quantidade: "1",
      preco_unitario: "6.00",
      desconto: "0",
      total: "6.00",
    },
  ],
};

export default function Configuracoes() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [conta, setConta] = useState<ContaPix>(PIX_VAZIO);
  const [formPix, setFormPix] = useState<ContaPix>(PIX_VAZIO);
  const [salvandoPix, setSalvandoPix] = useState(false);
  const [pixSalvo, setPixSalvo] = useState(false);
  const [amostra, setAmostra] = useState<string | null>(null);

  const [recibo, setRecibo] = useState<ReciboConfig>(RECIBO_PADRAO);
  const [salvandoRecibo, setSalvandoRecibo] = useState(false);
  const [reciboSalvo, setReciboSalvo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [pix, papel] = await Promise.all([
        api.get<ContaPix>("/pix/config"),
        api.get<ReciboConfig>("/configuracoes/recibo"),
      ]);
      setConta(pix.data);
      setFormPix(pix.data);
      setRecibo(papel.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Um QR de R$ 1,00 com a chave salva: é a prova de que ela funciona, e o
  // gerente confere no próprio celular antes de o primeiro cliente pagar.
  useEffect(() => {
    if (!conta.configurado) {
      setAmostra(null);
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const { data } = await api.post<{ brcode: string }>("/pix/cobranca", { valor: 1 });
        const imagem = await QRCode.toDataURL(data.brcode, { margin: 1, width: 220 });
        if (vivo) setAmostra(imagem);
      } catch {
        if (vivo) setAmostra(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [conta]);

  async function salvarPix(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setPixSalvo(false);
    setSalvandoPix(true);
    try {
      const { data } = await api.put<ContaPix>("/pix/config", {
        chave: formPix.chave,
        beneficiario: formPix.beneficiario,
        cidade: formPix.cidade,
      });
      setConta(data);
      setFormPix(data);
      setPixSalvo(true);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar a chave PIX"));
    } finally {
      setSalvandoPix(false);
    }
  }

  async function salvarRecibo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setReciboSalvo(false);
    setSalvandoRecibo(true);
    try {
      const { data } = await api.put<ReciboConfig>("/configuracoes/recibo", recibo);
      setRecibo(data);
      setReciboSalvo(true);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar o recibo"));
    } finally {
      setSalvandoRecibo(false);
    }
  }

  if (carregando) return <Carregando texto="Carregando configurações..." />;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-carvao-900">Configurações</h1>
        <p className="text-sm text-carvao-500">Ajustes do sistema, sem mexer no servidor.</p>
      </div>

      <Erro mensagem={erro} />

      {/* ---- PIX ---- */}
      <Cartao>
        <div className="flex items-center gap-2 border-b border-carvao-100 px-5 py-3">
          <QrCode className="h-4.5 w-4.5 text-marca-600" />
          <h2 className="font-bold text-carvao-900">Recebimento por PIX</h2>
          {conta.configurado ? (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <BadgeCheck className="h-4 w-4" />
              {conta.tipo_chave}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <TriangleAlert className="h-4 w-4" />
              Sem chave
            </span>
          )}
        </div>

        <form className="space-y-4 p-5" onSubmit={salvarPix}>
          <p className="text-sm text-carvao-600">
            É esta a conta que recebe os PIX do balcão. O QR Code do PDV é gerado com ela, já
            com o valor da venda.
          </p>

          <Campo
            rotulo="Chave PIX"
            required
            value={formPix.chave}
            onChange={(e) => setFormPix({ ...formPix, chave: e.target.value })}
            placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
            dica="Digite como está no seu banco. O sistema confere o formato antes de salvar."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Nome do beneficiário"
              value={formPix.beneficiario}
              onChange={(e) => setFormPix({ ...formPix, beneficiario: e.target.value })}
              placeholder="Cantina Maanaim"
              dica="Aparece no app de quem paga."
            />
            <Campo
              rotulo="Cidade"
              value={formPix.cidade}
              onChange={(e) => setFormPix({ ...formPix, cidade: e.target.value })}
              placeholder="Maceió"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Botao type="submit" carregando={salvandoPix}>
              Salvar chave PIX
            </Botao>
            {pixSalvo && (
              <span className="text-sm font-medium text-emerald-700">
                Salvo. O PDV já passa a cobrar nesta chave.
              </span>
            )}
          </div>
        </form>

        {amostra && (
          <div className="flex flex-wrap items-center gap-4 border-t border-carvao-100 p-5">
            <img
              src={amostra}
              alt="QR Code de teste no valor de um real"
              className="h-36 w-36 rounded-lg bg-white p-1"
            />
            <div className="min-w-48 flex-1 text-sm text-carvao-600">
              <p className="font-semibold text-carvao-800">Confira antes do primeiro cliente</p>
              <p className="mt-1">
                Este QR é um teste de <strong>R$ 1,00</strong> com a chave salva. Abra o app do
                seu banco e leia: o nome que aparecer é o que o cliente vai ver.
              </p>
              <p className="mt-1 break-all text-xs text-carvao-400">{conta.chave}</p>
            </div>
          </div>
        )}
      </Cartao>

      {/* ---- Recibo ---- */}
      <Cartao>
        <div className="flex items-center gap-2 border-b border-carvao-100 px-5 py-3">
          <Printer className="h-4.5 w-4.5 text-marca-600" />
          <h2 className="font-bold text-carvao-900">Recibo impresso</h2>
          <span className="ml-auto text-xs text-carvao-400">bobina de 58 mm</span>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
          <form className="space-y-4" onSubmit={salvarRecibo}>
            <label className="flex items-start gap-2 text-sm text-carvao-700">
              <input
                type="checkbox"
                checked={recibo.mostrar_logo}
                onChange={(e) => setRecibo({ ...recibo, mostrar_logo: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-marca-600"
              />
              <span>
                Imprimir a logo da cantina
                <span className="block text-xs text-carvao-400">
                  A marca do sistema, já convertida para preto e branco na largura do papel.
                </span>
              </span>
            </label>

            <label className="block">
              <span className="rotulo">Cabeçalho</span>
              <textarea
                value={recibo.cabecalho}
                onChange={(e) => setRecibo({ ...recibo, cabecalho: e.target.value })}
                rows={3}
                maxLength={400}
                className="campo font-mono text-sm"
              />
              <span className="mt-1 block text-xs text-carvao-400">
                Uma linha por linha do papel, abaixo da logo: CNPJ, endereço, telefone. Sem a
                logo ligada, escreva aqui o nome da cantina.
              </span>
            </label>

            <label className="block">
              <span className="rotulo">Rodapé</span>
              <textarea
                value={recibo.rodape}
                onChange={(e) => setRecibo({ ...recibo, rodape: e.target.value })}
                rows={3}
                maxLength={400}
                className="campo font-mono text-sm"
              />
              <span className="mt-1 block text-xs text-carvao-400">
                Deixe em branco para não imprimir o rodapé.
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm text-carvao-700">
              <input
                type="checkbox"
                checked={recibo.mostrar_atendente}
                onChange={(e) => setRecibo({ ...recibo, mostrar_atendente: e.target.checked })}
                className="h-4 w-4 accent-marca-600"
              />
              Imprimir o nome do atendente
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Botao type="submit" carregando={salvandoRecibo}>
                Salvar recibo
              </Botao>
              <Botao type="button" variante="secundario" onClick={() => window.print()}>
                Imprimir teste
              </Botao>
              {reciboSalvo && (
                <span className="text-sm font-medium text-emerald-700">
                  Salvo. A próxima venda já sai assim.
                </span>
              )}
            </div>
          </form>

          <div className="lg:justify-self-end">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carvao-500">
              Como vai sair
            </p>
            <div className="inline-block rounded-lg bg-carvao-100 p-3 shadow-inner">
              <div className="shadow-sm">
                <Recibo venda={VENDA_EXEMPLO} config={recibo} previa />
              </div>
            </div>
            <p className="mt-2 max-w-56 text-xs text-carvao-400">
              Tamanho real do papel, com uma venda de exemplo. O que vai grande é o que o
              balcão precisa ler de longe para separar a mercadoria. "Imprimir teste" manda
              esta prévia para a impressora.
            </p>
          </div>
        </div>
      </Cartao>
    </div>
  );
}
