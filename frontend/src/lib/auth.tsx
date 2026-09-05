import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, CHAVE_TOKEN, EVENTO_SESSAO_EXPIRADA } from "./api";
import type { Perfil, Usuario } from "./tipos";

interface ContextoAuth {
  usuario: Usuario | null;
  carregando: boolean;
  /** Muda a cada login: serve de `key` para remontar as telas do app. */
  sessaoId: number;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => void;
  pode: (...perfis: Perfil[]) => boolean;
}

const Auth = createContext<ContextoAuth | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sessaoId, setSessaoId] = useState(0);

  // Restaura a sessao ao abrir o app. So descartamos o token quando o servidor
  // diz que ele nao vale (401): falha de rede ou backend reiniciando nao pode
  // deslogar ninguem -- era isso que fazia a sessao cair sozinha.
  useEffect(() => {
    if (!localStorage.getItem(CHAVE_TOKEN)) {
      setCarregando(false);
      return;
    }

    let cancelado = false;

    async function restaurar(tentativa = 1): Promise<void> {
      try {
        const { data } = await api.get<Usuario>("/auth/me");
        if (!cancelado) setUsuario(data);
      } catch (erro) {
        if (cancelado) return;
        const status = (erro as { response?: { status?: number } })?.response?.status;

        if (status === 401) {
          localStorage.removeItem(CHAVE_TOKEN);
        } else if (tentativa < 3) {
          // Servidor fora do ar ou reiniciando: espera e tenta de novo.
          await new Promise((r) => setTimeout(r, 800 * tentativa));
          return restaurar(tentativa + 1);
        }
        // Esgotadas as tentativas, o token fica guardado: um F5 depois que o
        // servidor voltar recupera a sessao sem novo login.
      } finally {
        if (!cancelado && tentativa >= 1) setCarregando(false);
      }
    }

    void restaurar();
    return () => {
      cancelado = true;
    };
  }, []);

  const entrar = useCallback(async (login: string, senha: string) => {
    // Limpa a sessao anterior antes de gravar a nova: trocar de usuario nao
    // pode deixar sobrando dado carregado com o token antigo.
    localStorage.removeItem(CHAVE_TOKEN);
    const { data } = await api.post("/auth/login", { usuario: login, senha });
    localStorage.setItem(CHAVE_TOKEN, data.access_token);
    setUsuario(data.usuario);
    setSessaoId((n) => n + 1);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_TOKEN);
    setUsuario(null);
    setSessaoId((n) => n + 1);
  }, []);

  // Token expirado ou revogado (401) derruba a sessao sem recarregar a pagina.
  useEffect(() => {
    const aoExpirar = () => {
      setUsuario(null);
      setSessaoId((n) => n + 1);
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, []);

  // Sair (ou entrar) em outra aba reflete aqui.
  useEffect(() => {
    const aoMudarArmazenamento = (e: StorageEvent) => {
      if (e.key !== CHAVE_TOKEN) return;
      if (!e.newValue) {
        setUsuario(null);
        setSessaoId((n) => n + 1);
      } else {
        api
          .get<Usuario>("/auth/me")
          .then(({ data }) => {
            setUsuario(data);
            setSessaoId((n) => n + 1);
          })
          .catch(() => setUsuario(null));
      }
    };
    window.addEventListener("storage", aoMudarArmazenamento);
    return () => window.removeEventListener("storage", aoMudarArmazenamento);
  }, []);

  const pode = useCallback(
    (...perfis: Perfil[]) => !!usuario && perfis.includes(usuario.perfil),
    [usuario],
  );

  const valor = useMemo(
    () => ({ usuario, carregando, sessaoId, entrar, sair, pode }),
    [usuario, carregando, sessaoId, entrar, sair, pode],
  );

  return <Auth.Provider value={valor}>{children}</Auth.Provider>;
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(Auth);
  if (!contexto) throw new Error("useAuth precisa estar dentro de <ProvedorAuth>");
  return contexto;
}
