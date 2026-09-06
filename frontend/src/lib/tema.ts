import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

const CHAVE = "cantina:tema";

/** O que o sistema operacional está pedindo agora. */
function temaDoSistema(): Tema {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** O tema salvo pelo operador; sem escolha, o do sistema. */
export function temaInicial(): Tema {
  const salvo = localStorage.getItem(CHAVE);
  return salvo === "claro" || salvo === "escuro" ? salvo : temaDoSistema();
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", tema === "escuro" ? "#16150f" : "#f7f7f6");
}

/**
 * Tema da interface. A escolha fica no navegador do balcão: o mesmo login em
 * dois terminais pode querer telas diferentes, uma no salão e outra na copa.
 */
export function useTema() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((atual) => {
      const proximo = atual === "escuro" ? "claro" : "escuro";
      localStorage.setItem(CHAVE, proximo);
      return proximo;
    });
  }, []);

  return { tema, alternar };
}
