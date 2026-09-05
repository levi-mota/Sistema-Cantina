import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, LockKeyhole, Unlock } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { useAuth } from "../lib/auth";
import { brl, dataHora, hora } from "../lib/format";
import type { CaixaSessao, TipoMovimentoCaixa } from "../lib/tipos";
import {
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  Modal,
  Selo,
  Tabela,
  TituloPagina,
  Vazio,
} from "../components/ui";

/** Uma linha da composicao do saldo esperado. */
function Linha({
  rotulo,
  valor,
  detalhe,
  sinal,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  sinal?: "+" | "-";
  destaque?: boolean;
}) {
  return (
    <div
      className={
        destaque
          ? "flex items-center justify-between border-t border-carvao-200 pt-2 text-base font-bold text-carvao-900"
          : "flex items-center justify-between py-1 text-sm"
      }
    >
      <span className={destaque ? "" : "text-carvao-600"}>
        {sinal && <span className="mr-1 text-carvao-400">{sinal}</span>}
        {rotulo}
        {detalhe && <span className="ml-1 text-xs text-carvao-400">{detalhe}</span>}
      </span>
      <span className={destaque ? "" : "font-medium text-carvao-800"}>{valor}</span>
    </div>
  );
}

export default function Caixa() {
  const { pode } = useAuth();
  const [sessao, setSessao] = useState<CaixaSessao | null>(null);
  const [historico, setHistorico] = useState<CaixaSessao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [abrindo, setAbrindo] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [movimento, setMovimento] = useState<TipoMovimentoCaixa | null>(null);
  const [detalhe, setDetalhe] = useState<CaixaSessao | null>(null);

  const [formAbertura, setFormAbertura] = useState({ valor: "100", observacao: "" });
  const [formMovimento, setFormMovimento] = useState({ valor: "", motivo: "" });
  const [formFechamento, setFormFechamento] = useState({ valor: "", observacao: "" });

  const carregar = useCallback(async () => {
    try {
      const [atual, lista] = await Promise.all([
        api.get<CaixaSessao | null>("/caixa/atual"),
        api.get<CaixaSessao[]>("/caixa/sessoes", { params: { limite: 30 } }),
      ]);
      setSessao(atual.data);
      setHistorico(lista.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(acao: () => Promise<unknown>, aoTerminar: () => void) {
    setSalvando(true);
    setErro(null);
    try {
      await acao();
      aoTerminar();
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Carregando texto="Conferindo o caixa..." />;

  const c = sessao?.conferencia;

  return (
    <>
      <TituloPagina
        titulo="Caixa"
        descricao="Controle do dinheiro da gaveta por turno"
        acoes={
          sessao ? (
            <>
              <Botao
                variante="secundario"
                icone={<ArrowDownToLine className="h-4 w-4" />}
                onClick={() => {
                  setFormMovimento({ valor: "", motivo: "" });
                  setMovimento("SUPRIMENTO");
                }}
              >
                Suprimento
              </Botao>
              <Botao
                variante="secundario"
                icone={<ArrowUpFromLine className="h-4 w-4" />}
                onClick={() => {
                  setFormMovimento({ valor: "", motivo: "" });
                  setMovimento("SANGRIA");
                }}
              >
                Sangria
              </Botao>
              <Botao
                variante="perigo"
                icone={<LockKeyhole className="h-4 w-4" />}
                onClick={() => {
                  setFormFechamento({ valor: "", observacao: "" });
                  setFechando(true);
                }}
              >
                Fechar caixa
              </Botao>
            </>
          ) : (
            <Botao icone={<Unlock className="h-4 w-4" />} onClick={() => setAbrindo(true)}>
              Abrir caixa
            </Botao>
          )
        }
      />

      <Erro mensagem={erro} />

      {!sessao ? (
        <Cartao className="p-8 text-center">
          <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-carvao-300" />
          <p className="font-semibold text-carvao-800">Caixa fechado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-carvao-500">
            Abra o caixa informando o troco inicial da gaveta. Enquanto ele estiver fechado, o
            PDV nao aceita vendas em dinheiro — PIX e cartao continuam liberados.
          </p>
          <Botao className="mt-4" onClick={() => setAbrindo(true)}>
            Abrir caixa
          </Botao>
        </Cartao>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Cartao className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-carvao-900">Turno #{sessao.id}</h2>
                    <Selo tom="sucesso">ABERTO</Selo>
                  </div>
                  <p className="mt-0.5 text-sm text-carvao-500">
                    Aberto por {sessao.usuario_abertura_nome} em {dataHora(sessao.aberto_em)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-carvao-500">
                    Deveria ter na gaveta
                  </p>
                  <p className="text-3xl font-bold text-carvao-900">
                    {brl(c?.valor_esperado)}
                  </p>
                </div>
              </div>
              {sessao.observacao_abertura && (
                <p className="mt-3 rounded-lg bg-carvao-50 px-3 py-2 text-sm text-carvao-600">
                  {sessao.observacao_abertura}
                </p>
              )}
            </Cartao>

            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-carvao-900">Composicao do saldo</h2>
              <Linha rotulo="Troco de abertura" valor={brl(c?.valor_abertura)} />
              <Linha
                rotulo="Vendas em dinheiro"
                detalhe={`(${c?.qtd_vendas_dinheiro ?? 0} venda(s))`}
                valor={brl(c?.vendas_dinheiro)}
                sinal="+"
              />
              <Linha rotulo="Suprimentos" valor={brl(c?.suprimentos)} sinal="+" />
              <Linha rotulo="Sangrias" valor={brl(c?.sangrias)} sinal="-" />
              <Linha rotulo="Saldo esperado" valor={brl(c?.valor_esperado)} destaque />
              <p className="mt-3 border-t border-carvao-100 pt-3 text-xs text-carvao-500">
                PIX, cartao e fiado somam {brl(c?.vendas_outras_formas)} no turno, mas nao entram
                na conta porque nao passam pela gaveta. Recebimento de fiado em dinheiro deve ser
                lancado aqui como suprimento.
              </p>
            </Cartao>

            <Cartao className="overflow-hidden">
              <h2 className="border-b border-carvao-100 px-4 py-3 font-bold text-carvao-900">
                Movimentos do turno
              </h2>
              {sessao.movimentos.length === 0 ? (
                <Vazio
                  titulo="Nenhuma sangria ou suprimento"
                  descricao="A gaveta so recebeu as vendas em dinheiro ate agora."
                />
              ) : (
                <ul className="divide-y divide-carvao-100">
                  {sessao.movimentos.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={`rounded-lg p-1.5 ${
                          m.tipo === "SANGRIA"
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {m.tipo === "SANGRIA" ? (
                          <ArrowUpFromLine className="h-4 w-4" />
                        ) : (
                          <ArrowDownToLine className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-carvao-800">
                          {m.tipo === "SANGRIA" ? "Sangria" : "Suprimento"}
                          {m.motivo && (
                            <span className="font-normal text-carvao-500"> · {m.motivo}</span>
                          )}
                        </p>
                        <p className="text-xs text-carvao-500">
                          {hora(m.criado_em)} · {m.usuario_nome ?? "-"}
                        </p>
                      </div>
                      <span
                        className={`font-semibold ${
                          m.tipo === "SANGRIA" ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {m.tipo === "SANGRIA" ? "-" : "+"} {brl(m.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>

          <Cartao className="h-fit p-4">
            <h2 className="mb-1 font-bold text-carvao-900">Fechamento</h2>
            <p className="text-sm text-carvao-500">
              Ao final do turno, conte o dinheiro da gaveta e informe o valor. O sistema compara
              com os {brl(c?.valor_esperado)} esperados e registra a diferenca.
            </p>
            <Botao
              variante="perigo"
              className="mt-4 w-full"
              icone={<LockKeyhole className="h-4 w-4" />}
              onClick={() => {
                setFormFechamento({ valor: "", observacao: "" });
                setFechando(true);
              }}
            >
              Conferir e fechar
            </Botao>
          </Cartao>
        </div>
      )}

      {/* Historico */}
      <Cartao className="mt-4 overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-carvao-100 px-4 py-3 font-bold text-carvao-900">
          <History className="h-4 w-4 text-carvao-400" /> Turnos anteriores
        </h2>
        {historico.length === 0 ? (
          <Vazio titulo="Nenhum turno registrado" />
        ) : (
          <Tabela
            cabecalho={[
              "Turno",
              "Abertura",
              "Fechamento",
              "Responsavel",
              "Esperado",
              "Contado",
              "Quebra",
              "",
            ]}
          >
            {historico.map((s) => {
              const dif = Number(s.diferenca ?? 0);
              return (
                <tr key={s.id} className="hover:bg-carvao-50/60">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-carvao-800">#{s.id}</span>
                    {s.status === "ABERTA" && (
                      <Selo tom="sucesso">
                        <span className="ml-1">ABERTO</span>
                      </Selo>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-carvao-600">
                    {dataHora(s.aberto_em)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-carvao-600">
                    {s.fechado_em ? dataHora(s.fechado_em) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">
                    {s.usuario_fechamento_nome ?? s.usuario_abertura_nome}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">
                    {brl(s.valor_esperado ?? s.conferencia?.valor_esperado)}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">
                    {s.valor_informado ? brl(s.valor_informado) : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.diferenca === null || s.diferenca === undefined ? (
                      "-"
                    ) : (
                      <Selo tom={dif === 0 ? "sucesso" : dif > 0 ? "info" : "perigo"}>
                        {dif > 0 ? "+" : ""}
                        {brl(s.diferenca)}
                      </Selo>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      <Botao variante="secundario" onClick={() => setDetalhe(s)}>
                        Detalhes
                      </Botao>
                      {s.status === "FECHADA" && !sessao && pode("ADMIN", "GERENTE") && (
                        <Botao
                          variante="secundario"
                          onClick={() =>
                            executar(
                              () => api.post(`/caixa/sessoes/${s.id}/reabrir`),
                              () => undefined,
                            )
                          }
                        >
                          Reabrir
                        </Botao>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Cartao>

      {/* Abrir */}
      <Modal
        aberto={abrindo}
        titulo="Abrir caixa"
        aoFechar={() => setAbrindo(false)}
        largura="max-w-md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(
              () =>
                api.post("/caixa/abrir", {
                  valor_abertura: Number(formAbertura.valor || 0),
                  observacao: formAbertura.observacao || null,
                }),
              () => setAbrindo(false),
            );
          }}
        >
          <Erro mensagem={erro} />
          <Campo
            rotulo="Troco inicial na gaveta (R$)"
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            value={formAbertura.valor}
            onChange={(e) => setFormAbertura({ ...formAbertura, valor: e.target.value })}
            dica="Quanto de dinheiro esta na gaveta agora"
          />
          <Campo
            rotulo="Observacao"
            value={formAbertura.observacao}
            onChange={(e) => setFormAbertura({ ...formAbertura, observacao: e.target.value })}
            placeholder="Ex.: turno da manha"
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setAbrindo(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Abrir
            </Botao>
          </div>
        </form>
      </Modal>

      {/* Sangria / suprimento */}
      <Modal
        aberto={!!movimento}
        titulo={movimento === "SANGRIA" ? "Registrar sangria" : "Registrar suprimento"}
        aoFechar={() => setMovimento(null)}
        largura="max-w-md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(
              () =>
                api.post("/caixa/movimentos", {
                  tipo: movimento,
                  valor: Number(formMovimento.valor),
                  motivo: formMovimento.motivo || null,
                }),
              () => setMovimento(null),
            );
          }}
        >
          <Erro mensagem={erro} />
          <p className="rounded-lg bg-carvao-50 px-3 py-2 text-sm text-carvao-600">
            {movimento === "SANGRIA"
              ? "Retirada de dinheiro da gaveta (cofre, pagamento na hora)."
              : "Entrada de dinheiro na gaveta (reforco de troco, recebimento de fiado)."}{" "}
            Na gaveta agora: <strong className="text-carvao-900">{brl(c?.valor_esperado)}</strong>
          </p>
          <Campo
            rotulo="Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            required
            autoFocus
            value={formMovimento.valor}
            onChange={(e) => setFormMovimento({ ...formMovimento, valor: e.target.value })}
          />
          <Campo
            rotulo="Motivo"
            value={formMovimento.motivo}
            onChange={(e) => setFormMovimento({ ...formMovimento, motivo: e.target.value })}
            placeholder={
              movimento === "SANGRIA" ? "Ex.: retirada para o cofre" : "Ex.: reforco de moedas"
            }
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setMovimento(null)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Confirmar
            </Botao>
          </div>
        </form>
      </Modal>

      {/* Fechar */}
      <Modal
        aberto={fechando}
        titulo="Fechar caixa"
        aoFechar={() => setFechando(false)}
        largura="max-w-md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(
              () =>
                api.post("/caixa/fechar", {
                  valor_informado: Number(formFechamento.valor || 0),
                  observacao: formFechamento.observacao || null,
                }),
              () => setFechando(false),
            );
          }}
        >
          <Erro mensagem={erro} />
          <Campo
            rotulo="Valor contado na gaveta (R$)"
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            value={formFechamento.valor}
            onChange={(e) => setFormFechamento({ ...formFechamento, valor: e.target.value })}
            dica="Conte o dinheiro antes de digitar"
          />

          <div className="rounded-lg bg-carvao-50 p-3 text-sm">
            <div className="flex justify-between text-carvao-600">
              <span>Esperado</span>
              <span className="font-medium">{brl(c?.valor_esperado)}</span>
            </div>
            <div className="flex justify-between text-carvao-600">
              <span>Contado</span>
              <span className="font-medium">{brl(formFechamento.valor || 0)}</span>
            </div>
            {formFechamento.valor !== "" && (
              <div
                className={`mt-1 flex justify-between border-t border-carvao-200 pt-1 font-bold ${
                  Number(formFechamento.valor) - Number(c?.valor_esperado ?? 0) === 0
                    ? "text-emerald-700"
                    : "text-red-600"
                }`}
              >
                <span>Quebra de caixa</span>
                <span>
                  {brl(Number(formFechamento.valor) - Number(c?.valor_esperado ?? 0))}
                </span>
              </div>
            )}
          </div>

          <Campo
            rotulo="Observacao"
            value={formFechamento.observacao}
            onChange={(e) =>
              setFormFechamento({ ...formFechamento, observacao: e.target.value })
            }
            placeholder="Ex.: conferido com o gerente"
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setFechando(false)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" type="submit" carregando={salvando}>
              Fechar caixa
            </Botao>
          </div>
        </form>
      </Modal>

      {/* Detalhe de turno */}
      <Modal
        aberto={!!detalhe}
        titulo={`Turno #${detalhe?.id}`}
        aoFechar={() => setDetalhe(null)}
        largura="max-w-md"
      >
        {detalhe && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-carvao-50 p-3">
              <Linha rotulo="Abertura" valor={dataHora(detalhe.aberto_em)} />
              <Linha rotulo="Fechamento" valor={dataHora(detalhe.fechado_em)} />
              <Linha rotulo="Abriu" valor={detalhe.usuario_abertura_nome ?? "-"} />
              <Linha rotulo="Fechou" valor={detalhe.usuario_fechamento_nome ?? "-"} />
            </div>
            <div className="rounded-lg bg-carvao-50 p-3">
              <Linha rotulo="Troco de abertura" valor={brl(detalhe.valor_abertura)} />
              <Linha
                rotulo="Esperado"
                valor={brl(detalhe.valor_esperado ?? detalhe.conferencia?.valor_esperado)}
              />
              <Linha rotulo="Contado" valor={detalhe.valor_informado ? brl(detalhe.valor_informado) : "-"} />
              <Linha
                rotulo="Quebra"
                valor={detalhe.diferenca != null ? brl(detalhe.diferenca) : "-"}
                destaque
              />
            </div>
            {detalhe.movimentos.length > 0 && (
              <ul className="divide-y divide-carvao-100 rounded-lg border border-carvao-100">
                {detalhe.movimentos.map((m) => (
                  <li key={m.id} className="flex justify-between px-3 py-2">
                    <span className="text-carvao-600">
                      {m.tipo === "SANGRIA" ? "Sangria" : "Suprimento"}
                      {m.motivo && ` · ${m.motivo}`}
                    </span>
                    <span className="font-medium">{brl(m.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
            {detalhe.observacao_fechamento && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                {detalhe.observacao_fechamento}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
