# Sistema Cantina

Sistema de gestão para cantina: PDV, caixa, estoque, contas a pagar/receber,
relatórios, controle de funcionários e cadastro de clientes/fornecedores.

Roda no navegador do PC (sistema completo) e no navegador do celular, onde todos os
módulos continuam **editáveis** — inclusive fazer estoque pelo celular.

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Recharts, Axios |
| Backend | Python 3, FastAPI, SQLAlchemy 2, Pydantic v2, JWT (bcrypt) |
| Banco | SQLite (arquivo `backend/cantina.db`) |
| Integrações | ApiBrasil (CNPJ/CEP) com fallback automático para BrasilAPI e ViaCEP |

---

## Estrutura de pastas

```
Sistema cantina/
├── backend/
│   ├── app/
│   │   ├── core/           config, banco, segurança (JWT/bcrypt), dependências
│   │   ├── models/         modelos ORM (tabelas e enums)
│   │   ├── schemas/        contratos de entrada/saída da API (Pydantic)
│   │   ├── routers/        endpoints por módulo
│   │   │   ├── auth.py          login e sessão
│   │   │   ├── funcionarios.py  equipe, perfis de acesso, ponto
│   │   │   ├── parceiros.py     clientes e fornecedores
│   │   │   ├── estoque.py       categorias, produtos, movimentações
│   │   │   ├── vendas.py        PDV
│   │   │   ├── caixa.py         caixas, turnos, sangria e fechamento
│   │   │   ├── financeiro.py    contas a pagar e a receber
│   │   │   ├── relatorios.py    dashboard, DRE, curva ABC
│   │   │   └── integracoes.py   consulta de CNPJ e CEP
│   │   ├── services/       regras de negócio (estoque, caixa, documentos, APIs)
│   │   └── main.py         aplicação FastAPI
│   ├── migracoes/          migrações do banco (Alembic)
│   │   └── versions/       uma migração por mudança de schema
│   ├── seed.py             dados de demonstração
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── components/     Layout (sidebar + barra inferior) e biblioteca de UI
│       ├── lib/            cliente HTTP, autenticação, formatação, tipos
│       └── pages/          uma página por módulo
└── scripts/                preparar, iniciar, parar, migrar, recriar-banco
```

---

## Como rodar

Os scripts em `scripts/` cuidam de tudo (cada `.ps1` tem um `.bat` para dois cliques):

```powershell
cd scripts
.\preparar.ps1 -ComDemo   # uma vez: dependencias, .env e banco de exemplo
.\iniciar.ps1             # sobe backend + frontend e abre o navegador
```

O `iniciar` imprime os endereços — incluindo o do celular na mesma rede — e
encerra os dois serviços com Ctrl+C. Detalhes e solução de problemas em
[scripts/README.md](scripts/README.md).

<details>
<summary>Rodando na mão, sem os scripts</summary>

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env
.venv/Scripts/python seed.py          # opcional: dados de demonstração
.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# frontend (outro terminal)
cd frontend
npm install
npm run dev
```

</details>

API em <http://localhost:8000> · documentação interativa em <http://localhost:8000/docs>.
Sistema em <http://localhost:5173>. O Vite já faz proxy de `/api` para o backend.

### Acessos de demonstração

| E-mail | Senha | Perfil |
| --- | --- | --- |
| admin@cantina.local | admin123 | ADMIN |
| marina@cantina.local | 123456 | GERENTE |
| diego@cantina.local | 123456 | OPERADOR |

### Acesso pelo celular

Backend e frontend sobem escutando na rede local, e o `iniciar.ps1` já mostra o
endereço pronto. Basta abri-lo no celular, com ele no mesmo Wi-Fi.

---

## Módulos e como eles se conectam

* **Ponto de venda** — busca por nome ou código de barras, carrinho, desconto,
  troco, comprovante. **Exige um caixa aberto pelo operador logado**: sem turno, não há
  venda. Ao finalizar: **dá baixa no estoque** (um movimento por item) e, se a venda for
  no fiado, **gera a conta a receber** do cliente respeitando o limite de crédito. O
  cancelamento devolve os itens e cancela o título.
* **Caixa** — a cantina pode ter **vários caixas** (Caixa 1, Caixa 2, …), cada um com a
  sua gaveta, o seu turno e o seu fechamento. Um caixa comporta um turno aberto por vez,
  e um operador opera um caixa por vez. Abertura com troco inicial, **sangria**
  (retirada), **suprimento** (reforço) e fechamento, onde o valor contado é comparado ao
  esperado e a **quebra de caixa** fica registrada com data e responsável. A conta é
  sempre `abertura + vendas em dinheiro + suprimentos − sangrias`, por gaveta; PIX,
  cartão e fiado ficam de fora porque não passam por ela. A gerência acompanha os turnos
  abertos, pode fechar o turno de quem esqueceu (fica registrado quem fechou) e reabrir
  turnos fechados por engano.
* **Estoque** — produtos, categorias, saldo, estoque mínimo, custo médio ponderado e
  kardex completo. Entradas, saídas, perdas e ajuste de inventário. Uma entrada de
  compra pode **gerar a conta a pagar** do fornecedor automaticamente.
* **Contas a pagar / a receber** — títulos com parcelamento, baixa total ou parcial,
  cancelamento e destaque de vencidos.
* **Relatórios** — painel, faturamento por dia, mais vendidos, formas de pagamento,
  DRE simplificado (receita − CMV − despesas pagas), curva ABC e **quebras de caixa
  por operador**. Exportação em CSV.
* **Funcionários** — cadastro, perfis de acesso e registro de ponto.
* **Clientes e fornecedores** — cadastro único com preenchimento automático por
  CNPJ e CEP, e limite de crédito usado pelo fiado no PDV. CPF e CNPJ são validados
  pelos dígitos verificadores, no cadastro e na venda.

### Identificação do consumidor na venda

O padrão é **consumidor diverso** — a venda sai sem identificação, que é o caso comum
numa cantina. Digitar um CPF/CNPJ muda isso:

| Situação | O que acontece |
| --- | --- |
| Campo vazio | Consumidor diverso |
| Documento válido, **sem** cadastro | Venda identificada pelo documento, sem criar cadastro |
| Documento válido, **com** cadastro | Vincula o cliente automaticamente e mostra o limite de crédito |
| Documento inválido | Bloqueia a venda com a mensagem do erro |

O fiado é a exceção: exige cliente cadastrado, porque é o cadastro que carrega o limite
de crédito e recebe a conta a receber.

### Perfis de acesso

| Perfil | Pode |
| --- | --- |
| `ADMIN` | tudo |
| `GERENTE` | tudo, exceto restrições futuras de administração |
| `OPERADOR` | PDV, caixa (o próprio turno), estoque, cadastros e relatórios |

Cadastrar caixas, cancelar vendas, fechar o turno de outra pessoa e reabrir turnos são
ações de gerência.

---

## Integração ApiBrasil

Sem nenhuma configuração o sistema já consulta CNPJ e CEP usando BrasilAPI e ViaCEP.
Para usar a ApiBrasil, preencha no `backend/.env`:

```
APIBRASIL_TOKEN="seu-token"
APIBRASIL_DEVICE_TOKEN="seu-device-token"
```

Com o token preenchido a ApiBrasil vira o provedor principal; se ela falhar ou ficar
indisponível, a consulta cai automaticamente para os provedores públicos.

### Quebras de caixa por operador

Consolida as diferenças dos turnos fechados no período, uma linha por operador:
turnos, quantos fecharam certo, quanto faltou, quanto sobrou, saldo, maior falta e
quanto a falta representa do dinheiro que passou pela gaveta. Abaixo, os turnos de
maior diferença, com a justificativa registrada no fechamento.

Duas escolhas que mudam a leitura:

* **A quebra é de quem operou a gaveta**, não de quem fechou o turno — um gerente
  pode fechar o turno de quem esqueceu, e isso não transfere a diferença para ele.
* **Falta e sobra aparecem separadas.** Quem tem +50 num turno e −50 em outro fecha
  com saldo zero, mas não é o mesmo caso de quem acerta todos os dias; só a coluna
  "fechou certo" distingue os dois.

---

## Migrações de banco

O schema é versionado com Alembic e **as migrações pendentes são aplicadas
sozinhas ao iniciar** — em uso normal não há nada a fazer. Um banco criado por
versões anteriores (antes do Alembic) é adotado automaticamente na primeira
subida, sem perder dados.

Quando o schema mudar:

```powershell
cd scripts
.\migrar.ps1 criar -Mensagem "descreve a mudanca"   # gera a partir dos modelos
.\migrar.ps1 status                                 # confere a versão
.\migrar.ps1 aplicar                                # aplica
```

Revise o arquivo gerado em `backend/migracoes/versions/` antes de aplicar: o
autogenerate acerta colunas e tabelas novas, mas lê uma renomeação como "apagou
uma coluna e criou outra" — e isso é perda de dados.

---

## Notas de produção

Antes de publicar, troque `SECRET_KEY` no `.env`, defina uma senha de administrador
própria e ajuste `CORS_ORIGINS` para o domínio real. O SQLite atende bem uma cantina;
se um dia o volume crescer, basta apontar `DATABASE_URL` para PostgreSQL — o
SQLAlchemy cobre a troca.
