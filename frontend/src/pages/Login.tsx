import { useState } from "react";
import { mensagemErro } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Botao, Campo, Erro } from "../components/ui";

export default function Login() {
  const { entrar } = useAuth();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(login.trim(), senha);
    } catch (err) {
      setErro(mensagemErro(err, "Nao foi possivel entrar"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-carvao-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/logo-cantina.png"
            alt="Maanaim Cantina"
            className="mx-auto w-64 max-w-full"
          />
          <p className="mt-4 text-sm text-carvao-400">Entre para acessar o sistema</p>
        </div>

        <form onSubmit={enviar} className="cartao space-y-4 p-6">
          <Erro mensagem={erro} />
          <Campo
            rotulo="Usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="ex.: levi"
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
          Acesso de demonstracao: admin / admin123
        </p>
      </div>
    </div>
  );
}
