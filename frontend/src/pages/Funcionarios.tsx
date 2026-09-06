import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { rotulo } from "../lib/format";
import { useAuth } from "../lib/auth";
import type { Perfil, Usuario } from "../lib/tipos";
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
  { valor: "USUARIO", texto: "Usuário (PDV e caixa)" },
];

const FORM_VAZIO = {
  nome: "",
  usuario: "",
  senha: "",
  perfil: "USUARIO" as Perfil,
  ativo: true,
};

export default function Funcionarios() {
  const { usuario: eu } = useAuth();
  const [equipe, setEquipe] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modal, setModal] = useState<Usuario | "novo" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get<Usuario[]>("/funcionarios");
      setEquipe(data);
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
            usuario: u.usuario,
            senha: "",
            perfil: u.perfil,
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
      usuario: form.usuario,
      perfil: form.perfil,
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
      setErro(mensagemErro(err, "Não foi possível salvar o funcionário"));
    } finally {
      setSalvando(false);
    }
  }

  /** Liga e desliga o acesso. O cadastro fica: o histórico dele aponta para cá. */
  async function alternarAcesso(u: Usuario) {
    const desativando = u.ativo;
    if (desativando && !confirm(`Desativar ${u.nome}? Ele perde o acesso ao sistema.`)) return;

    setErro(null);
    try {
      if (desativando) await api.delete(`/funcionarios/${u.id}`);
      else await api.put(`/funcionarios/${u.id}`, { ativo: true });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  if (carregando) return <Carregando texto="Carregando a equipe..." />;

  return (
    <>
      <TituloPagina
        titulo="Funcionários"
        descricao="Equipe e perfis de acesso"
        acoes={
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => abrir("novo")}>
            Novo funcionário
          </Botao>
        }
      />

      <Erro mensagem={erro} />

      {equipe.length === 0 ? (
          <Cartao>
            <Vazio titulo="Nenhum funcionário" />
          </Cartao>
        ) : (
          <>
            <div className="space-y-2 computador:hidden">
              {equipe.map((u) => (
                <Cartao key={u.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-carvao-900">{u.nome}</p>
                      <p className="truncate text-xs text-carvao-500">{u.usuario}</p>
                    </div>
                    <Selo tom={u.ativo ? "sucesso" : "neutro"}>{u.perfil}</Selo>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Botao variante="secundario" className="flex-1" onClick={() => abrir(u)}>
                      Editar
                    </Botao>
                    <Botao
                      variante={u.ativo ? "perigo" : "sucesso"}
                      className="flex-1"
                      onClick={() => alternarAcesso(u)}
                      disabled={u.ativo && u.id === eu?.id}
                    >
                      {u.ativo ? "Desativar" : "Reativar"}
                    </Botao>
                  </div>
                </Cartao>
              ))}
            </div>

            <Cartao className="hidden overflow-hidden computador:block">
              <Tabela cabecalho={["Nome", "Usuário", "Perfil", "Situação", "Ações"]}>
                {equipe.map((u) => (
                  <tr key={u.id} className={u.ativo ? "hover:bg-carvao-50/60" : "opacity-60"}>
                    <td className="px-4 py-2.5 font-medium text-carvao-800">{u.nome}</td>
                    <td className="px-4 py-2.5 text-carvao-600">{u.usuario}</td>
                    <td className="px-4 py-2.5">
                      <Selo tom={u.perfil === "ADMIN" ? "marca" : "neutro"}>
                        {rotulo(u.perfil)}
                      </Selo>
                    </td>
                    <td className="px-4 py-2.5">
                      <Selo tom={u.ativo ? "sucesso" : "neutro"}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </Selo>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <Botao variante="secundario" onClick={() => abrir(u)}>
                          Editar
                        </Botao>
                        <Botao
                          variante={u.ativo ? "perigo" : "sucesso"}
                          onClick={() => alternarAcesso(u)}
                          disabled={u.ativo && u.id === eu?.id}
                          title={
                            u.ativo && u.id === eu?.id
                              ? "Você não pode desativar a si mesmo"
                              : undefined
                          }
                        >
                          {u.ativo ? "Desativar" : "Reativar"}
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </Tabela>
            </Cartao>
          </>
      )}

      <Modal
        aberto={!!modal}
        titulo={modal === "novo" ? "Novo funcionário" : "Editar funcionário"}
        aoFechar={() => setModal(null)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Erro mensagem={erro} />
          <div className="space-y-4">
            <Campo
              rotulo="Nome"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
            <Campo
              rotulo="Usuário (login)"
              required
              autoCapitalize="none"
              spellCheck={false}
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
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
            <label className="flex items-center gap-2 pt-1 text-sm text-carvao-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 accent-marca-600"
              />
              Funcionário ativo
            </label>
          </div>
          <div className="acoes">
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
