import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, Plus, Search, Sparkles, User } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { documentoFormatado, rotulo, telefoneFormatado } from "../lib/format";
import type {
  Empresa,
  Endereco,
  Identificacao,
  Parceiro,
  TipoParceiro,
  TipoPessoa,
} from "../lib/tipos";
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

const FORM_VAZIO = {
  tipo: "CLIENTE" as TipoParceiro,
  tipo_pessoa: "FISICA" as TipoPessoa,
  nome: "",
  nome_fantasia: "",
  documento: "",
  email: "",
  telefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  observacoes: "",
};

type Form = typeof FORM_VAZIO;

export default function Parceiros() {
  const [lista, setLista] = useState<Parceiro[]>([]);
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modal, setModal] = useState<Parceiro | "novo" | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [consultando, setConsultando] = useState<"cnpj" | "cep" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** O que o documento digitado revelou: cadastro repetido ou dígito errado. */
  const [conflito, setConflito] = useState<{ parceiro?: Parceiro; erro?: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get<Parceiro[]>("/parceiros", {
        params: { busca: busca || undefined, tipo: tipoFiltro || undefined },
      });
      setLista(data);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [busca, tipoFiltro]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  function abrir(p: Parceiro | "novo") {
    setErro(null);
    setAviso(null);
    setConflito(null);
    setModal(p);
    setForm(
      p === "novo"
        ? FORM_VAZIO
        : {
            tipo: p.tipo,
            tipo_pessoa: p.tipo_pessoa,
            nome: p.nome,
            nome_fantasia: p.nome_fantasia ?? "",
            documento: p.documento ?? "",
            email: p.email ?? "",
            telefone: p.telefone ?? "",
            cep: p.cep ?? "",
            logradouro: p.logradouro ?? "",
            numero: p.numero ?? "",
            complemento: p.complemento ?? "",
            bairro: p.bairro ?? "",
            cidade: p.cidade ?? "",
            uf: p.uf ?? "",
            observacoes: p.observacoes ?? "",
          },
    );
  }

  // Confere o documento digitado contra os cadastros que já existem. O mesmo
  // CPF em duas fichas separa o histórico do cliente em duas, e ninguém percebe
  // até o relatório não bater -- melhor avisar enquanto se digita do que
  // recusar o formulário inteiro na hora de salvar.
  useEffect(() => {
    if (!modal) return;
    const limpo = form.documento.replace(/\D/g, "");
    // 11 e 14 dígitos: antes disso a pessoa ainda está digitando.
    if (limpo.length !== 11 && limpo.length !== 14) {
      setConflito(null);
      return;
    }

    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<Identificacao>(`/parceiros/identificar/${limpo}`);
        if (cancelado) return;
        // Editar a própria ficha não é duplicata.
        const outro =
          data.cadastrado && data.parceiro_id && !(modal !== "novo" && modal.id === data.parceiro_id);
        if (!outro) {
          setConflito(null);
          return;
        }
        const { data: achados } = await api.get<Parceiro[]>("/parceiros", {
          params: { busca: limpo },
        });
        if (cancelado) return;
        const parceiro = achados.find((p) => p.id === data.parceiro_id);
        setConflito(parceiro ? { parceiro } : { erro: `Documento já cadastrado para ${data.nome}` });
      } catch (e) {
        // 422 aqui é dígito verificador errado: é erro de digitação, e o
        // cadastro seria recusado do mesmo jeito ao salvar.
        if (!cancelado) setConflito({ erro: mensagemErro(e, "Documento inválido") });
      }
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [form.documento, modal]);

  /** Preenche o cadastro a partir da Receita (ApiBrasil/BrasilAPI). */
  async function buscarCnpj() {
    const doc = form.documento.replace(/\D/g, "");
    if (doc.length !== 14) {
      setAviso("Informe um CNPJ com 14 digitos");
      return;
    }
    setConsultando("cnpj");
    setAviso(null);
    try {
      const { data } = await api.get<Empresa>(`/integracoes/cnpj/${doc}`);
      setForm((f) => ({
        ...f,
        tipo_pessoa: "JURIDICA",
        nome: data.razao_social ?? f.nome,
        nome_fantasia: data.nome_fantasia ?? f.nome_fantasia,
        email: data.email ?? f.email,
        telefone: data.telefone ?? f.telefone,
        cep: data.cep ?? f.cep,
        logradouro: data.logradouro ?? f.logradouro,
        numero: data.numero ?? f.numero,
        complemento: data.complemento ?? f.complemento,
        bairro: data.bairro ?? f.bairro,
        cidade: data.cidade ?? f.cidade,
        uf: data.uf ?? f.uf,
      }));
    } catch (e) {
      setAviso(mensagemErro(e, "CNPJ não encontrado"));
    } finally {
      setConsultando(null);
    }
  }

  async function buscarCep() {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      setAviso("Informe um CEP com 8 digitos");
      return;
    }
    setConsultando("cep");
    setAviso(null);
    try {
      const { data } = await api.get<Endereco>(`/integracoes/cep/${cep}`);
      setForm((f) => ({
        ...f,
        logradouro: data.logradouro ?? f.logradouro,
        bairro: data.bairro ?? f.bairro,
        cidade: data.cidade ?? f.cidade,
        uf: data.uf ?? f.uf,
      }));
    } catch (e) {
      setAviso(mensagemErro(e, "CEP não encontrado"));
    } finally {
      setConsultando(null);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const corpo = { ...form };
    try {
      if (modal === "novo") await api.post("/parceiros", corpo);
      else if (modal) await api.put(`/parceiros/${modal.id}`, corpo);
      setModal(null);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível salvar o cadastro"));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Carregando texto="Carregando cadastros..." />;

  return (
    <>
      <TituloPagina
        titulo="Clientes e fornecedores"
        acoes={
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => abrir("novo")}>
            Novo cadastro
          </Botao>
        }
      />

      <Erro mensagem={erro} />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-carvao-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, documento ou telefone..."
            className="campo pl-9"
          />
        </div>
        <Seletor
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          vazio="Todos"
          opcoes={[
            { valor: "CLIENTE", texto: "Clientes" },
            { valor: "FORNECEDOR", texto: "Fornecedores" },
            { valor: "AMBOS", texto: "Cliente e fornecedor" },
          ]}
        />
      </div>

      {lista.length === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhum cadastro encontrado" />
        </Cartao>
      ) : (
        <>
          <div className="space-y-2 computador:hidden">
            {lista.map((p) => (
              <Cartao key={p.id} className="p-3" >
                <button className="w-full text-left" onClick={() => abrir(p)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-carvao-900">{p.nome}</p>
                      <p className="text-xs text-carvao-500">
                        {documentoFormatado(p.documento)} · {telefoneFormatado(p.telefone)}
                      </p>
                    </div>
                    <Selo tom={p.tipo === "FORNECEDOR" ? "info" : "marca"}>{rotulo(p.tipo)}</Selo>
                  </div>
                  {p.cidade && (
                    <p className="mt-1 text-xs text-carvao-500">
                      {p.cidade}/{p.uf}
                    </p>
                  )}
                </button>
              </Cartao>
            ))}
          </div>

          <Cartao className="hidden overflow-hidden computador:block">
            <Tabela cabecalho={["Nome", "Tipo", "Documento", "Contato", "Cidade", ""]}>
              {lista.map((p) => (
                <tr key={p.id} className="hover:bg-carvao-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {p.tipo_pessoa === "JURIDICA" ? (
                        <Building2 className="h-4 w-4 shrink-0 text-carvao-400" />
                      ) : (
                        <User className="h-4 w-4 shrink-0 text-carvao-400" />
                      )}
                      <div>
                        <p className="font-medium text-carvao-800">{p.nome}</p>
                        {p.nome_fantasia && (
                          <p className="text-xs text-carvao-500">{p.nome_fantasia}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Selo tom={p.tipo === "FORNECEDOR" ? "info" : "marca"}>{rotulo(p.tipo)}</Selo>
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">
                    {documentoFormatado(p.documento)}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">
                    {telefoneFormatado(p.telefone)}
                    {p.email && <p className="text-xs text-carvao-400">{p.email}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-carvao-600">
                    {p.cidade ? `${p.cidade}/${p.uf}` : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Botao variante="secundario" onClick={() => abrir(p)}>
                      Editar
                    </Botao>
                  </td>
                </tr>
              ))}
            </Tabela>
          </Cartao>
        </>
      )}

      <Modal
        aberto={!!modal}
        titulo={modal === "novo" ? "Novo cadastro" : "Editar cadastro"}
        aoFechar={() => setModal(null)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Erro mensagem={erro} />
          {aviso && (
            <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <Sparkles className="h-4 w-4 shrink-0" />
              {aviso}
            </div>
          )}

          {conflito && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {conflito.parceiro ? (
                <>
                  <span className="flex-1">
                    Este {form.tipo_pessoa === "JURIDICA" ? "CNPJ" : "CPF"} já é de{" "}
                    <strong>{conflito.parceiro.nome}</strong>
                  </span>
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() => conflito.parceiro && abrir(conflito.parceiro)}
                  >
                    Abrir o cadastro
                  </Botao>
                </>
              ) : (
                <span>{conflito.erro}</span>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Seletor
              rotulo="Tipo de cadastro"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoParceiro })}
              opcoes={[
                { valor: "CLIENTE", texto: "Cliente" },
                { valor: "FORNECEDOR", texto: "Fornecedor" },
                { valor: "AMBOS", texto: "Cliente e fornecedor" },
              ]}
            />
            <Seletor
              rotulo="Pessoa"
              value={form.tipo_pessoa}
              onChange={(e) => {
                const tipo_pessoa = e.target.value as TipoPessoa;
                setForm((f) => ({
                  ...f,
                  tipo_pessoa,
                  nome_fantasia: tipo_pessoa === "JURIDICA" ? f.nome_fantasia : "",
                }));
              }}
              opcoes={[
                { valor: "FISICA", texto: "Física (CPF)" },
                { valor: "JURIDICA", texto: "Jurídica (CNPJ)" },
              ]}
            />

            <div className="sm:col-span-2">
              <span className="rotulo">
                {form.tipo_pessoa === "JURIDICA" ? "CNPJ" : "CPF"}
              </span>
              <div className="flex gap-2">
                <input
                  value={form.documento}
                  onChange={(e) => setForm({ ...form, documento: e.target.value })}
                  className="campo"
                  placeholder={form.tipo_pessoa === "JURIDICA" ? "00.000.000/0000-00" : "000.000.000-00"}
                />
                {form.tipo_pessoa === "JURIDICA" && (
                  <Botao
                    type="button"
                    variante="secundario"
                    carregando={consultando === "cnpj"}
                    onClick={buscarCnpj}
                    className="shrink-0"
                  >
                    Consultar
                  </Botao>
                )}
              </div>
            </div>

            <Campo
              rotulo={form.tipo_pessoa === "JURIDICA" ? "Razão social" : "Nome completo"}
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
            {form.tipo_pessoa === "JURIDICA" && (
              <Campo
                rotulo="Nome fantasia"
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
              />
            )}
            <Campo
              rotulo="Telefone"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
            <Campo
              rotulo="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <div>
              <span className="rotulo">CEP</span>
              <div className="flex gap-2">
                <input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  onBlur={() => form.cep.replace(/\D/g, "").length === 8 && buscarCep()}
                  className="campo"
                  placeholder="00000-000"
                />
                <Botao
                  type="button"
                  variante="secundario"
                  carregando={consultando === "cep"}
                  onClick={buscarCep}
                  className="shrink-0"
                >
                  Buscar
                </Botao>
              </div>
            </div>
            <Campo
              rotulo="Logradouro"
              value={form.logradouro}
              onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
            />
            <Campo
              rotulo="Número"
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
            />
            <Campo
              rotulo="Complemento"
              value={form.complemento}
              onChange={(e) => setForm({ ...form, complemento: e.target.value })}
            />
            <Campo
              rotulo="Bairro"
              value={form.bairro}
              onChange={(e) => setForm({ ...form, bairro: e.target.value })}
            />
            <Campo
              rotulo="Cidade"
              value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })}
            />
            <Campo
              rotulo="UF"
              maxLength={2}
              value={form.uf}
              onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
            />
          </div>

          <label className="block">
            <span className="rotulo">Observações</span>
            <textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className="campo"
            />
          </label>

          <div className="acoes">
            <Botao variante="secundario" type="button" onClick={() => setModal(null)}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              carregando={salvando}
              disabled={!!conflito?.parceiro}
              title={conflito?.parceiro ? "Este documento já tem cadastro" : undefined}
            >
              Salvar
            </Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}
