# Scripts

Atalhos para preparar, abrir e manter o sistema. Cada `.ps1` tem um `.bat` de
mesmo nome — clique duas vezes no `.bat` se preferir não usar o terminal.

| Script | Para quê |
| --- | --- |
| `preparar` | Primeira vez: instala dependências, cria o `.env` e prepara o banco |
| `iniciar` | Sobe o sistema e abre no navegador |
| `parar` | Encerra o que ficou rodando (quando a janela foi fechada sem Ctrl+C) |
| `migrar` | Migrações de banco: aplicar, criar, ver status, reverter |
| `dados-teste` | Enche o banco com vendas, turnos e contas para testar (não apaga nada) |
| `recriar-banco` | Apaga tudo e cria um banco novo (faz backup antes) |

## Começando

```powershell
cd scripts
.\preparar.ps1 -ComDemo
.\iniciar.ps1
```

`-ComDemo` popula o banco com produtos, vendas dos últimos 30 dias, contas e
caixas — bom para conhecer o sistema. Sem ele, o banco nasce vazio e só com o
usuário administrador.

O `iniciar` mostra os três endereços úteis:

```
Neste computador   http://localhost:5173
No celular         http://192.168.0.15:5173
Documentacao API   http://localhost:8000/docs
```

Deixe a janela aberta enquanto usar o sistema; **Ctrl+C** encerra os dois
serviços. Se a janela for fechada de qualquer jeito e as portas ficarem presas,
rode `.\parar.ps1`.

## Opções

```powershell
.\iniciar.ps1 -PortaApi 8001 -PortaWeb 5174   # se as portas padrão estiverem ocupadas
.\iniciar.ps1 -SemNavegador                   # não abre o navegador
.\preparar.ps1                                # sem dados de demonstração
.\recriar-banco.ps1 -ComDemo                  # zera e repopula
```

## Dados de teste

Para experimentar as telas com movimento de verdade — gráficos com curva,
relatórios com números, estoque com itens no limite:

```powershell
.\dados-teste.ps1            # últimos 90 dias
.\dados-teste.ps1 -Dias 30   # só o último mês
```

Ele **soma** ao banco atual: mantém usuários, caixas e produtos que já existem e
acrescenta cadastros, estoque, vendas, turnos fechados com quebra, contas a
pagar/receber e listas de compra. Nada é apagado, e rodar de novo acrescenta
mais um período.

Para começar do zero em vez de somar, use `recriar-banco`.

## Migrações

No uso normal você não precisa mexer: **o sistema aplica as migrações pendentes
sozinho ao iniciar**. O script serve para quando o schema muda.

```powershell
.\migrar.ps1 status                                   # em que versão o banco está
.\migrar.ps1 criar -Mensagem "adiciona campo tal"     # gera a migração
.\migrar.ps1 aplicar                                  # aplica as pendentes
.\migrar.ps1 sql                                      # mostra o SQL sem executar
.\migrar.ps1 reverter                                 # desfaz a última
```

Depois de `criar`, **abra o arquivo gerado** em `backend/migracoes/versions/` e
confira. O autogenerate acerta colunas e tabelas novas, mas não distingue uma
renomeação de "apagou uma coluna e criou outra" — e essa diferença é perda de
dados.

## Se der errado

**"execução de scripts foi desabilitada"** — os `.bat` já contornam isso. Para
rodar o `.ps1` direto:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

**"Python 3 não encontrado"** — instale de python.org marcando *Add Python to
PATH*. O atalho `python` da Microsoft Store não serve.

**Porta em uso** — o `iniciar` avisa qual é. Use `.\parar.ps1` ou escolha outras
portas com `-PortaApi` / `-PortaWeb`.

**Serviço caiu sozinho** — os logs ficam em `scripts/.run/`: `backend.log`,
`backend.log.err`, `frontend.log`, `frontend.log.err`.
