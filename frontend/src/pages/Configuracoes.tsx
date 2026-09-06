import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, QrCode, TriangleAlert } from "lucide-react";
import QRCode from "qrcode";

import { api, mensagemErro } from "../lib/api";
import { Botao, Campo, Cartao, Carregando, Erro } from "../components/ui";

interface ContaPix {
  configurado: boolean;
  chave: string;
  beneficiario: string;
  cidade: string;
  tipo_chave?: string | null;
}

const VAZIA: ContaPix = { configurado: false, chave: "", beneficiario: "", cidade: "" };

export default function Configuracoes() {
  const [conta, setConta] = useState<ContaPix>(VAZIA);
  const [form, setForm] = useState(VAZIA);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [amostra, setAmostra] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get<ContaPix>("/pix/config");
      setConta(data);
      setForm(data);
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

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    setSalvando(true);
    try {
      const { data } = await api.put<ContaPix>("/pix/config", {
        chave: form.chave,
        beneficiario: form.beneficiario,
        cidade: form.cidade,
      });
      setConta(data);
      setForm(data);
      setSalvo(true);
    } catch (erroSalvar) {
      setErro(mensagemErro(erroSalvar, "Não foi possível salvar a chave PIX"));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Carregando texto="Carregando configurações..." />;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-carvao-900">Configurações</h1>
        <p className="text-sm text-carvao-500">Ajustes do sistema, sem mexer no servidor.</p>
      </div>

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

        <form className="space-y-4 p-5" onSubmit={salvar}>
          <Erro mensagem={erro} />

          <p className="text-sm text-carvao-600">
            É esta a conta que recebe os PIX do balcão. O QR Code do PDV é gerado com ela, já
            com o valor da venda.
          </p>

          <Campo
            rotulo="Chave PIX"
            required
            autoFocus
            value={form.chave}
            onChange={(e) => setForm({ ...form, chave: e.target.value })}
            placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
            dica="Digite como está no seu banco. O sistema confere o formato antes de salvar."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Nome do beneficiário"
              value={form.beneficiario}
              onChange={(e) => setForm({ ...form, beneficiario: e.target.value })}
              placeholder="Cantina Maanaim"
              dica="Aparece no app de quem paga."
            />
            <Campo
              rotulo="Cidade"
              value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              placeholder="Maceió"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Botao type="submit" carregando={salvando}>
              Salvar chave PIX
            </Botao>
            {salvo && (
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
    </div>
  );
}
