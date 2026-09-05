import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";

import { mensagemErro } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Botao, Campo, Erro } from "../components/ui";

export default function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
    } catch (err) {
      setErro(mensagemErro(err, "Nao foi possivel entrar"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-carvao-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 inline-flex rounded-2xl bg-marca-500 p-3">
            <UtensilsCrossed className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sistema Cantina</h1>
          <p className="mt-1 text-sm text-carvao-400">Entre para acessar o painel</p>
        </div>

        <form onSubmit={enviar} className="cartao space-y-4 p-6">
          <Erro mensagem={erro} />
          <Campo
            rotulo="E-mail"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@cantina.local"
          />
          <Campo
            rotulo="Senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
          />
          <Botao type="submit" carregando={enviando} className="w-full">
            Entrar
          </Botao>
        </form>

        <p className="mt-4 text-center text-xs text-carvao-500">
          Acesso de demonstracao: admin@cantina.local / admin123
        </p>
      </div>
    </div>
  );
}
