export type Dispositivo = "movel" | "computador";

/**
 * Que aparelho está pedindo a tela -- não que tamanho tem a janela.
 *
 * São coisas diferentes, e o projeto tratava as duas como uma só: uma janela
 * estreita no computador virava a interface de celular, e um celular pedindo
 * "site para computador" continuava recebendo a de celular. Quem escolhe é o
 * navegador, e a resposta dele muda quando o usuário pede a versão de
 * computador -- que é exatamente o pedido que queremos respeitar.
 *
 * Largura continua valendo para o que é reflow de conteúdo: coluna que vira
 * duas, espaçamento que aperta. O que passa a depender do aparelho é a
 * *interface*: menu lateral ou barra inferior, tabela ou lista de cartões.
 */
export function detectar(): Dispositivo {
  const navegador = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };

  // Chromium responde direto, e a resposta acompanha o "solicitar site para
  // computador" -- vira false assim que o usuário pede.
  if (typeof navegador.userAgentData?.mobile === "boolean") {
    return navegador.userAgentData.mobile ? "movel" : "computador";
  }

  // Safari e Firefox: sobra a assinatura do navegador, que também muda quando
  // se pede a versão de computador (o iPad, nesse caso, se diz um Mac).
  return /Mobi|Android|iPhone|iPod|Windows Phone/i.test(navigator.userAgent)
    ? "movel"
    : "computador";
}

/** Marca a raiz do documento, que é de onde o CSS lê. */
export function aplicar(dispositivo: Dispositivo = detectar()): Dispositivo {
  document.documentElement.dataset.dispositivo = dispositivo;
  return dispositivo;
}
