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
      setErro(mensagemErro(err, "Não foi possível entrar"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-menu px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/logo-cantina.png"
            alt="Maanaim Cantina"
            className="mx-auto w-64 max-w-full"
          />
          <p className="mt-4 text-sm text-menu-suave">Entre para acessar o sistema</p>
        </div>

        <form onSubmit={enviar} className="cartao space-y-4 p-6">
          <Erro mensagem={erro} />
          {/* Sem rotulo acima: o nome do campo fica dentro da caixa. O
              aria-label mantem o campo anunciado para leitores de tela. */}
          <Campo
            aria-label="Usuário"
            placeholder="Usuário"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className="py-2.5"
          />
          <Campo
            aria-label="Senha"
            placeholder="Senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="py-2.5"
          />
          <Botao type="submit" carregando={enviando} className="w-full">
            Entrar
          </Botao>
        </form>

        <p className="mt-10 text-center text-[11px] leading-relaxed text-menu-suave/50">
          © 2026 Maanaim Cantina · Feito por Levi M.
        </p>
      </div>
    </div>
  );
}
