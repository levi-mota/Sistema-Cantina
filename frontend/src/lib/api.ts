import axios, { AxiosError } from "axios";

export const CHAVE_TOKEN = "cantina.token";

/**
 * O token vive no `sessionStorage`, e não no `localStorage`: fechar o navegador
 * encerra a sessão. No balcão o computador é compartilhado, e uma sessão que
 * sobrevive ao fim do expediente é a porta aberta do caixa.
 *
 * O preço é conhecido: cada aba tem a sua sessão, e abrir uma nova pede login.
 */
const guarda = () => sessionStorage;

/** Avisa o app que a sessao caiu, sem recarregar a pagina no meio de uma acao. */
export const EVENTO_SESSAO_EXPIRADA = "cantina:sessao-expirada";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = guarda().getItem(CHAVE_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (resposta) => resposta,
  (erro: AxiosError) => {
    const ehLogin = erro.config?.url?.includes("/auth/login");
    if (erro.response?.status === 401 && !ehLogin) {
      guarda().removeItem(CHAVE_TOKEN);
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
    }
    return Promise.reject(erro);
  },
);

/** Extrai a mensagem de erro da API em um formato legivel para o usuario. */
export function mensagemErro(erro: unknown, padrao = "Não foi possível concluir a operação"): string {
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
    if (erro.code === "ERR_NETWORK") return "Servidor indisponível. O backend está rodando?";
  }
  return padrao;
}
