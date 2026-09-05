import { useCallback, useEffect, useState } from "react";
import { Clock, Plus } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { brl, dataBr, hora, hojeIso } from "../lib/format";
import { useAuth } from "../lib/auth";
import type { Perfil, RegistroPonto, Usuario } from "../lib/tipos";
import {
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  Modal,
  Selo,
  Seletor,
  Tabela,
  TituloPagina,
  Vazio,
} from "../components/ui";

const PERFIS: { valor: Perfil; texto: string }[] = [
  { valor: "ADMIN", texto: "Administrador (acesso total)" },
  { valor: "GERENTE", texto: "Gerente (gestao e cancelamentos)" },
  { valor: "OPERADOR", texto: "Operador (PDV e cadastros)" },
];

const FORM_VAZIO = {
  nome: "",
  email: "",
  senha: "",
  perfil: "OPERADOR" as Perfil,
  cargo: "",
  cpf: "",
  telefone: "",
  salario: "",
  data_admissao: "",
  ativo: true,
};

export default function Funcionarios() {
  const { usuario: eu } = useAuth();
  const [equipe, setEquipe] = useState<Usuario[]>([]);
  const [pontos, setPontos] = useState<RegistroPonto[]>([]);
  const [aba, setAba] = useState<"equipe" | "ponto">("equipe");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modal, setModal] = useState<Usuario | "novo" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([
        api.get<Usuario[]>("/funcionarios"),
        api.get<RegistroPonto[]>("/funcionarios/ponto/registros", {
          params: { inicio: hojeIso(-30) },
        }),
      ]);
      setEquipe(u.data);
      setPontos(p.data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(u: Usuario | "novo") {
    setErro(null);
    setModal(u);
    setForm(
      u === "novo"
        ? FORM_VAZIO
        : {
            nome: u.nome,
            email: u.email,
            senha: "",
            perfil: u.perfil,
            cargo: u.cargo ?? "",
            cpf: u.cpf ?? "",
            telefone: u.telefone ?? "",
            salario: u.salario ?? "",
            data_admissao: u.data_admissao ?? "",
            ativo: u.ativo,
          },
    );
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const corpo: Record<string, unknown> = {
      nome: form.nome,
      email: form.email,
      perfil: form.perfil,
      cargo: form.cargo || null,
      cpf: form.cpf || null,
      telefone: form.telefone || null,
      salario: form.salario ? Number(form.salario) : null,
      data_admissao: form.data_admissao || null,
      ativo: form.ativo,
    };
    if (form.senha) corpo.senha = form.senha;

    try {
      if (modal === "novo") {
        await api.post("/funcionarios", { ...corpo, senha: form.senha });
      } else if (modal) {
        await api.put(`/funcionarios/${modal.id}`, corpo);
      }
      setModal(null);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Nao foi possivel salvar o funcionario"));
    } finally {
      setSalvando(false);
    }
  }

  async function baterPonto(usuarioId: number) {
    setErro(null);
    try {
      await api.post("/funcionarios/ponto/bater", null, { params: { usuario_id: usuarioId } });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  if (carregando) return <Carregando texto="Carregando a equipe..." />;

  return (
    <>
      <TituloPagina
        titulo="Funcionarios"
        descricao="Equipe, perfis de acesso e registro de ponto"
        acoes={
          <>
            <Botao
              variante="secundario"
              icone={<Clock className="h-4 w-4" />}
              onClick={() => eu && baterPonto(eu.id)}
            >
              Bater meu ponto
            </Botao>
            <Botao icone={<Plus className="h-4 w-4" />} onClick={() => abrir("novo")}>
              Novo funcionario
            </Botao>
          </>
        }
      />

      <Erro mensagem={erro} />

      <div className="mb-4 flex gap-1 rounded-lg border border-carvao-100 bg-white p-1">
        {(["equipe", "ponto"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              aba === v ? "bg-marca-600 text-white" : "text-carvao-600 hover:bg-carvao-50"
            }`}
          >
            {v === "equipe" ? "Equipe" : "Ponto (30 dias)"}
          </button>
        ))}
      </div>

      {aba === "equipe" ? (
        equipe.length === 0 ? (
          <Cartao>
            <Vazio titulo="Nenhum funcionario" />
          </Cartao>
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
              {equipe.map((u) => (
                <Cartao key={u.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-carvao-900">{u.nome}</p>
                      <p className="truncate text-xs text-carvao-500">{u.email}</p>
                    </div>
                    <Selo tom={u.ativo ? "sucesso" : "neutro"}>{u.perfil}</Selo>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Botao variante="secundario" className="flex-1" onClick={() => abrir(u)}>
                      Editar
                    </Botao>
                    <Botao className="flex-1" onClick={() => baterPonto(u.id)}>
                      Bater ponto
                    </Botao>
                  </div>
                </Cartao>
              ))}
            </div>

            <Cartao className="hidden overflow-hidden lg:block">
              <Tabela
                cabecalho={["Nome", "Perfil", "Cargo", "Contato", "Admissao", "Salario", "Acoes"]}
              >
                {equipe.map((u) => (
                  <tr key={u.id} className={u.ativo ? "hover:bg-carvao-50/60" : "opacity-60"}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-carvao-800">{u.nome}</p>
                      <p className="text-xs text-carvao-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Selo tom={u.perfil === "ADMIN" ? "marca" : u.perfil === "GERENTE" ? "info" : "neutro"}>
                        {u.perfil}
                      </Selo>
                    </td>
                    <td className="px-4 py-2.5 text-carvao-600">{u.cargo ?? "-"}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{u.telefone ?? "-"}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{dataBr(u.data_admissao)}</td>
                    <td className="px-4 py-2.5 text-carvao-600">
                      {u.salario ? brl(u.salario) : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <Botao variante="secundario" onClick={() => abrir(u)}>
                          Editar
                        </Botao>
                        <Botao onClick={() => baterPonto(u.id)}>Ponto</Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </Tabela>
            </Cartao>
          </>
        )
      ) : (
        <Cartao className="overflow-hidden">
          {pontos.length === 0 ? (
            <Vazio titulo="Nenhum registro" descricao="Use 'Bater ponto' para comecar." />
          ) : (
            <Tabela cabecalho={["Data", "Funcionario", "Entrada", "Saida", "Horas"]}>
              {pontos.map((p) => {
                const horas =
                  p.entrada && p.saida
                    ? (
                        (new Date(`${p.saida}Z`).getTime() -
                          new Date(`${p.entrada}Z`).getTime()) /
                        3_600_000
                      ).toFixed(1)
                    : null;
                return (
                  <tr key={p.id} className="hover:bg-carvao-50/60">
                    <td className="px-4 py-2.5 text-carvao-600">{dataBr(p.data)}</td>
                    <td className="px-4 py-2.5 font-medium text-carvao-800">{p.usuario_nome}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{hora(p.entrada)}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{hora(p.saida)}</td>
                    <td className="px-4 py-2.5">
                      {horas ? <Selo tom="info">{horas} h</Selo> : <Selo tom="alerta">Aberto</Selo>}
                    </td>
                  </tr>
                );
              })}
            </Tabela>
          )}
        </Cartao>
      )}

      <Modal
        aberto={!!modal}
        titulo={modal === "novo" ? "Novo funcionario" : "Editar funcionario"}
        aoFechar={() => setModal(null)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Erro mensagem={erro} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Nome"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
            <Campo
              rotulo="E-mail (login)"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Campo
              rotulo={modal === "novo" ? "Senha" : "Nova senha (opcional)"}
              type="password"
              required={modal === "novo"}
              minLength={4}
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
            <Seletor
              rotulo="Perfil de acesso"
              value={form.perfil}
              onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}
              opcoes={PERFIS.map((p) => ({ valor: p.valor, texto: p.texto }))}
            />
            <Campo
              rotulo="Cargo"
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            />
            <Campo
              rotulo="CPF"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            />
            <Campo
              rotulo="Telefone"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
            <Campo
              rotulo="Salario (R$)"
              type="number"
              step="0.01"
              min="0"
              value={form.salario}
              onChange={(e) => setForm({ ...form, salario: e.target.value })}
            />
            <Campo
              rotulo="Data de admissao"
              type="date"
              value={form.data_admissao}
              onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-carvao-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 accent-marca-600"
              />
              Funcionario ativo
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" type="button" onClick={() => setModal(null)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Salvar
            </Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}
