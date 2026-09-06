import { brl, dataHora, documentoFormatado, rotulo } from "../lib/format";
import type { Venda } from "../lib/tipos";

/**
 * Recibo para bobina térmica de 58mm.
 *
 * Fica escondido na tela e só aparece na impressão (regra em `index.css`). São
 * ~32 caracteres por linha, então o nome do produto ocupa uma linha inteira e a
 * quantidade e o valor vão na linha de baixo -- espremer os dois lado a lado
 * cortaria o nome dos itens de nome comprido.
 */
export function Recibo({ venda }: { venda: Venda }) {
  const consumidor =
    venda.cliente_nome ??
    (venda.documento_cliente ? documentoFormatado(venda.documento_cliente) : null);

  return (
    <div className="recibo">
      <div style={{ textAlign: "center" }}>
        <strong>MAANAIM CANTINA</strong>
        <br />
        Venda #{venda.id}
        <br />
        {dataHora(venda.criado_em)}
      </div>

      <hr />

      {venda.itens.map((item) => (
        <div key={item.id}>
          {item.descricao}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {Number(item.quantidade)}x {brl(item.preco_unitario)}
            </span>
            <span>{brl(item.total)}</span>
          </div>
        </div>
      ))}

      <hr />

      {Number(venda.desconto) > 0 && (
        <Linha rotuloTexto="Subtotal" valor={brl(venda.subtotal)} />
      )}
      {Number(venda.desconto) > 0 && (
        <Linha rotuloTexto="Desconto" valor={`- ${brl(venda.desconto)}`} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
        <span>TOTAL</span>
        <span>{brl(venda.total)}</span>
      </div>

      <hr />

      <Linha rotuloTexto="Pagamento" valor={rotulo(venda.forma_pagamento)} />
      {venda.forma_pagamento === "DINHEIRO" && (
        <>
          <Linha rotuloTexto="Recebido" valor={brl(venda.valor_recebido)} />
          <Linha rotuloTexto="Troco" valor={brl(venda.troco)} />
        </>
      )}
      {consumidor && <Linha rotuloTexto="Cliente" valor={consumidor} />}
      <Linha rotuloTexto="Atendente" valor={venda.usuario_nome ?? "-"} />

      <hr />

      <div style={{ textAlign: "center" }}>
        Apresente este recibo
        <br />
        para retirar a mercadoria
      </div>
    </div>
  );
}

function Linha({ rotuloTexto, valor }: { rotuloTexto: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{rotuloTexto}</span>
      <span>{valor}</span>
    </div>
  );
}
