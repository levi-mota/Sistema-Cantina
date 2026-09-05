import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, CHAVE_TOKEN } from "./api";
import type { Perfil, Usuario } from "./tipos";

interface ContextoAuth {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => void;
  pode: (...perfis: Perfil[]) => boolean;
}

const Auth = createContext<ContextoAuth | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem(CHAVE_TOKEN)) {
      setCarregando(false);
      return;
    }
    api
      .get<Usuario>("/auth/me")
      .then(({ data }) => setUsuario(data))
      .catch(() => localStorage.removeItem(CHAVE_TOKEN))
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(async (login: string, senha: string) => {
    const { data } = await api.post("/auth/login", { usuario: login, senha });
    localStorage.setItem(CHAVE_TOKEN, data.access_token);
    setUsuario(data.usuario);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_TOKEN);
    setUsuario(null);
  }, []);

  const pode = useCallback(
    (...perfis: Perfil[]) => !!usuario && perfis.includes(usuario.perfil),
    [usuario],
  );

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, pode }),
    [usuario, carregando, entrar, sair, pode],
  );

  return <Auth.Provider value={valor}>{children}</Auth.Provider>;
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(Auth);
  if (!contexto) throw new Error("useAuth precisa estar dentro de <ProvedorAuth>");
  return contexto;
}
