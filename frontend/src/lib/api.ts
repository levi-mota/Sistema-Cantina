import axios, { AxiosError } from "axios";

export const CHAVE_TOKEN = "cantina.token";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(CHAVE_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (resposta) => resposta,
  (erro: AxiosError) => {
    if (erro.response?.status === 401 && !erro.config?.url?.includes("/auth/login")) {
      localStorage.removeItem(CHAVE_TOKEN);
      if (location.pathname !== "/login") location.assign("/login");
    }
    return Promise.reject(erro);
  },
);

/** Extrai a mensagem de erro da API em um formato legivel para o usuario. */
export function mensagemErro(erro: unknown, padrao = "Nao foi possivel concluir a operacao"): string {
  if (axios.isAxiosError(erro)) {
    const detalhe = (erro.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detalhe === "string") return detalhe;
    if (Array.isArray(detalhe)) {
      const primeiro = detalhe[0] as { msg?: string; loc?: string[] } | undefined;
      if (primeiro?.msg) {
        const campo = primeiro.loc?.slice(1).join(".");
        return campo ? `${campo}: ${primeiro.msg}` : primeiro.msg;
      }
    }
    if (erro.code === "ERR_NETWORK") return "Servidor indisponivel. O backend esta rodando?";
  }
  return padrao;
}
