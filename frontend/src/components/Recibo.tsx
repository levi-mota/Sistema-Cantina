import { brl, dataHora, documentoFormatado, rotulo } from "../lib/format";
import type { ReciboConfig, Venda } from "../lib/tipos";
import { cx } from "./ui";

/** A logo da marca, preta sobre branco e na largura da bobina (marca/gerar-logo-recibo.py). */
export const LOGO_RECIBO = "/logo-recibo.png";

export const RECIBO_PADRAO: ReciboConfig = {
  mostrar_logo: true,
  cabecalho: "",
  rodape: "Apresente este recibo\npara retirar a mercadoria",
  mostrar_atendente: true,
};

/**
 * Recibo para bobina térmica de 58mm.
 *
 * Este papel é entregue ao cliente e volta na mão de quem separa a mercadoria.
 * No pico do intervalo, quem está no balcão precisa saber *o que entregar* num
 * relance -- por isso a lista vem grande, em caixa alta, com a quantidade
 * destacada à esquerda e cercada por linhas duplas. Preço, troco e atendente
 * continuam no papel, em corpo menor: conferir valor é coisa do cliente, e ele
 * tem tempo; quem está com a fila esperando, não.
 *
 * O número da venda também vem grande: é por ele que se chama.
 *
 * Fica escondido na tela e só aparece na impressão (regra em `index.css`). Com
 * `previa`, aparece na tela na largura do papel: é a mesma marcação, então o
 * que se vê na configuração é o que a impressora recebe.
 */
export function Recibo({
  venda,
  config = RECIBO_PADRAO,
  previa,
}: {
  venda: Venda;
  config?: ReciboConfig;
  previa?: boolean;
}) {
  const consumidor =
    venda.cliente_nome ??
    (venda.documento_cliente ? documentoFormatado(venda.documento_cliente) : null);
  const totalItens = venda.itens.reduce((soma, i) => soma + Number(i.quantidade), 0);

  return (
    <div className={cx("recibo", previa && "recibo-previa")}>
      <div style={{ textAlign: "center" }}>
        {config.mostrar_logo && <img src={LOGO_RECIBO} alt="" className="recibo-logo" />}
        {config.cabecalho
          .split("\n")
          .filter((linha) => linha.trim())
          .map((linha, i) => (
            <div key={i}>{linha}</div>
          ))}
        <div className="recibo-numero">#{venda.id}</div>
        <div>{dataHora(venda.criado_em)}</div>
      </div>

      <div className="recibo-faixa">Retirar</div>

      <div className="recibo-itens">
        {venda.itens.map((item) => (
          <div key={item.id} className="recibo-item">
            <span className="recibo-item-qtd">{Number(item.quantidade)}</span>
            <div className="recibo-item-corpo">
              <div className="recibo-item-nome">{item.descricao}</div>
              <div className="recibo-item-valor">
                <span>
                  {Number(item.quantidade)} x {brl(item.preco_unitario)}
                </span>
                <span>{brl(item.total)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="recibo-fecho">
        <span>
          {totalItens} {totalItens === 1 ? "item" : "itens"}
        </span>
        <span className="recibo-total">{brl(venda.total)}</span>
      </div>

      {Number(venda.desconto) > 0 && (
        <>
          <Linha rotuloTexto="Subtotal" valor={brl(venda.subtotal)} />
          <Linha rotuloTexto="Desconto" valor={`- ${brl(venda.desconto)}`} />
        </>
      )}
      <Linha rotuloTexto="Pagamento" valor={rotulo(venda.forma_pagamento)} />
      {venda.forma_pagamento === "DINHEIRO" && (
        <>
          <Linha rotuloTexto="Recebido" valor={brl(venda.valor_recebido)} />
          <Linha rotuloTexto="Troco" valor={brl(venda.troco)} />
        </>
      )}
      {consumidor && <Linha rotuloTexto="Cliente" valor={consumidor} />}
      {config.mostrar_atendente && (
        <Linha rotuloTexto="Atendente" valor={venda.usuario_nome ?? "-"} />
      )}

      {config.rodape.trim() && (
        <>
          <hr />
          <div style={{ textAlign: "center" }}>
            {config.rodape.split("\n").map((linha, i) => (
              <div key={i}>{linha}</div>
            ))}
          </div>
        </>
      )}
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
