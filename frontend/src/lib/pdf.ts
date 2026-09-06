import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { dataHora } from "./format";

/**
 * Uma coluna do relatório. O `valor` recebe a linha crua da API e devolve o
 * texto já formatado -- é ali que o R$ e a data brasileira entram, para o PDF
 * sair legível para quem recebe, e não com o decimal cru do banco.
 */
export interface ColunaPdf<T> {
  titulo: string;
  valor: (linha: T) => string;
  /** Números ficam à direita: assim as casas decimais alinham na coluna. */
  direita?: boolean;
}

interface OpcoesPdf<T> {
  /** Nome do arquivo, sem a extensão. */
  arquivo: string;
  titulo: string;
  /** Linhas de contexto sob o título: período, destinatário, observação. */
  subtitulo?: string | (string | null | undefined)[];
  colunas: ColunaPdf<T>[];
  linhas: T[];
  /** Linha de totais, fixada no rodapé da tabela. */
  total?: (string | number)[];
  /**
   * Abre o PDF numa aba em vez de baixar. Vale para o que se lê antes de
   * decidir: dali a pessoa imprime ou salva, sem ter de achar o arquivo na
   * pasta de downloads para só então descobrir se era o que queria.
   */
  abrirEmAba?: boolean;
}

const LARANJA: [number, number, number] = [234, 88, 12];
const CARVAO: [number, number, number] = [38, 38, 38];
const CINZA: [number, number, number] = [115, 115, 115];

/** Monta o PDF de uma listagem e dispara o download no navegador. */
export function baixarPdf<T>({
  arquivo,
  titulo,
  subtitulo,
  colunas,
  linhas,
  total,
  abrirEmAba,
}: OpcoesPdf<T>) {
  if (linhas.length === 0) return;

  const contexto = (Array.isArray(subtitulo) ? subtitulo : [subtitulo]).filter(
    (linha): linha is string => !!linha && linha.trim().length > 0,
  );

  // Muitas colunas não cabem em pé: o retrato viraria uma tabela espremida.
  const deitado = colunas.length > 6;
  const doc = new jsPDF({ orientation: deitado ? "landscape" : "portrait", unit: "pt" });
  const margem = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...CARVAO);
  doc.text("Maanaim Cantina", margem, 48);

  doc.setFontSize(12);
  doc.setTextColor(...LARANJA);
  doc.text(titulo, margem, 68);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  let linhaY = 84;
  for (const linha of contexto) {
    doc.text(linha, margem, linhaY);
    linhaY += 12;
  }
  doc.text(`Emitido em ${dataHora(new Date().toISOString())}`, margem, linhaY);

  // O cabeçalho e o rodapé ignoram o columnStyles -- headStyles e footStyles
  // vêm depois na cascata --, então o alinhamento vai célula a célula neles,
  // senão o total aparece à esquerda embaixo de uma coluna de números.
  const alinhada = (texto: string, coluna: ColunaPdf<T> | undefined) => ({
    content: texto,
    styles: { halign: (coluna?.direita ? "right" : "left") as "right" | "left" },
  });

  autoTable(doc, {
    startY: linhaY + 16,
    margin: { left: margem, right: margem, bottom: 40 },
    head: [colunas.map((c) => alinhada(c.titulo, c))],
    body: linhas.map((l) => colunas.map((c) => c.valor(l))),
    foot: total ? [total.map((v, i) => alinhada(String(v), colunas[i]))] : undefined,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: CARVAO },
    headStyles: { fillColor: LARANJA, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: [245, 245, 245], textColor: CARVAO, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: Object.fromEntries(
      colunas.map((c, i) => [i, { halign: c.direita ? "right" : "left" }]),
    ),
    // O número da página só faz sentido depois que todas existem.
    didDrawPage: (dados) => {
      const pagina = doc.getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text(
        `Página ${pagina}`,
        dados.settings.margin.left,
        doc.internal.pageSize.getHeight() - 20,
      );
    },
  });

  if (abrirEmAba) {
    // A aba fica com o nome do arquivo em vez de um id de blob.
    const janela = window.open(doc.output("bloburl"), "_blank");
    if (janela) {
      janela.document.title = arquivo;
      return;
    }
    // Bloqueador de pop-up: baixar é melhor do que não entregar nada.
  }
  doc.save(`${arquivo}.pdf`);
}

/** Texto de período usado como subtítulo dos relatórios com filtro de datas. */
export function periodo(inicio: string, fim: string): string {
  const br = (d: string) => d.split("-").reverse().join("/");
  return `Período de ${br(inicio)} a ${br(fim)}`;
}
