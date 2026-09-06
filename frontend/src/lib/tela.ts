import { useCallback, useEffect, useState } from "react";

/**
 * Tela cheia. No balcão o monitor é do sistema e mais nada: sem barra de
 * endereço e sem abas, o operador não sai da tela por engano e cabem mais
 * linhas de produto.
 *
 * O navegador só entra em tela cheia a partir de um gesto do usuário, então
 * isto vive num botão -- e o estado vem do próprio navegador, porque o F11 e o
 * Esc mudam a tela sem passar por aqui.
 */
export function useTelaCheia() {
  const [cheia, setCheia] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const sincronizar = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sincronizar);
    return () => document.removeEventListener("fullscreenchange", sincronizar);
  }, []);

  const alternarTela = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Alguns navegadores recusam (iPhone, janela incorporada). Sem tela
      // cheia o sistema continua inteiro; não há o que avisar.
    }
  }, []);

  return { cheia, alternarTela };
}
