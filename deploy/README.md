# Subir o sistema numa VM (Oracle Cloud)

O desenho é simples: uma máquina Ubuntu rodando dois processos.

```
   internet
      |
   [ Caddy ]  :80/:443   HTTPS automático (Let's Encrypt)
      |
      +-- app.<dominio>  -> arquivos da tela + /api para o backend
      |
      +-- <dominio>      -> cardápio virtual (por enquanto, um aviso)
      |
   [ uvicorn ] 127.0.0.1:8000   FastAPI, um processo só
      |
   cantina.db (SQLite, no disco da máquina)
```

A tela chama `/api` no mesmo endereço, então navegador nenhum reclama de origem
cruzada. O banco é um arquivo: o backup é copiar esse arquivo, e mudar de
servidor é levá-lo junto.

---

## 1. A máquina

Na Oracle Cloud, uma instância **Ampere A1** (ARM, sempre gratuita) com
**Ubuntu 24.04**. 1 OCPU e 6 GB já sobram para três operadores.

Guarde a chave SSH que ela gera — é o único jeito de entrar.

## 2. As portas (o tropeço clássico)

A Oracle bloqueia em **dois lugares**, e é preciso abrir nos dois:

1. **No painel**: *Networking → Virtual Cloud Networks → sua VCN → Security
   Lists → Default → Add Ingress Rules*. Duas regras, origem `0.0.0.0/0`,
   TCP, portas **80** e **443**.
2. **Dentro da máquina**: a imagem Ubuntu da Oracle vem com `iptables`
   fechado. Disso o `instalar.sh` cuida.

Sem os dois, o Let's Encrypt não consegue validar o domínio e o site não abre.

## 3. O nome (DuckDNS)

Ainda sem domínio próprio, use o [DuckDNS](https://www.duckdns.org): entre com
uma conta Google/GitHub, crie `suacantina` e copie o **token**.

O DuckDNS responde por qualquer subdomínio abaixo do seu nome, então já valem:

- `suacantina.duckdns.org` → cardápio
- `app.suacantina.duckdns.org` → sistema

Aponte o domínio para o **IP público** da instância (campo *current ip* no
painel do DuckDNS). O `duckdns.timer` depois mantém isso atualizado sozinho.

## 4. Acesso ao repositório (se ele for privado)

O servidor precisa poder ler o código. Com repositório privado, crie uma
**deploy key** — uma chave que existe só nessa máquina e só lê esse repositório:

```bash
sudo mkdir -p /root/.ssh
sudo ssh-keygen -t ed25519 -f /root/.ssh/deploy_cantina -N "" -C "servidor-cantina"
printf 'Host github.com
  IdentityFile /root/.ssh/deploy_cantina
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
' | sudo tee /root/.ssh/config >/dev/null
sudo chmod 600 /root/.ssh/config
sudo cat /root/.ssh/deploy_cantina.pub
```

Cole a última linha em *GitHub → o repositório → Settings → Deploy keys → Add
deploy key*, **sem** marcar "Allow write access". Depois clone por SSH:
`git@github.com:usuario/repositorio.git`.

## 5. Instalar

```bash
sudo apt update && sudo apt install -y git
sudo git clone https://github.com/levi-mota/Sistema-Cantina.git /opt/cantina

sudo cp /opt/cantina/deploy/cantina.env.exemplo /etc/cantina.env
sudo nano /etc/cantina.env        # domínios, token do DuckDNS, SECRET_KEY

sudo bash /opt/cantina/deploy/instalar.sh
```

A `SECRET_KEY` é o que assina os logins — gere a sua e não reaproveite a do
exemplo:

```bash
openssl rand -hex 32
```

O script instala Python, Node e Caddy, cria o usuário `cantina`, monta a tela,
sobe a API como serviço e liga os horários de backup e de DuckDNS. Roda de novo
sem estragar nada, se precisar repetir.

## 6. Primeiro acesso

Abra `https://app.<dominio>` (o certificado leva menos de um minuto para sair),
entre com o usuário do `/etc/cantina.env` e **troque a senha** em Funcionários.
Depois cadastre a chave PIX em Configurações.

---

## Dia a dia

| O quê | Comando |
| --- | --- |
| Publicar versão nova | `sudo bash /opt/cantina/deploy/atualizar.sh` |
| Ver o log da API | `journalctl -u cantina-api -f` |
| Ver o log do Caddy | `journalctl -u caddy -f` |
| Reiniciar a API | `sudo systemctl restart cantina-api` |
| Backup agora | `sudo bash /opt/cantina/deploy/backup.sh` |
| Trocar de domínio | editar `/etc/cantina.env` e `sudo systemctl restart caddy` |

### Backup

Roda todo dia às 23:30 e guarda 30 dias em `/var/backups/cantina`. **Mas fica na
mesma máquina** — se a instância se perder, o backup vai junto. Traga uma cópia
para o seu PC de vez em quando:

```bash
scp ubuntu@SEU_IP:/var/backups/cantina/cantina-*.db.gz .
```

Para restaurar: pare a API, descompacte por cima de
`/opt/cantina/backend/cantina.db` e suba de novo.

### Quando o domínio próprio chegar

1. Aponte os registros `A` de `seudominio.com.br` e `app.seudominio.com.br`
   para o IP da instância.
2. Troque `DOMINIO_APP`, `DOMINIO_SITE` e `CORS_ORIGINS` em `/etc/cantina.env`.
3. `sudo systemctl restart caddy` — o certificado novo sai sozinho.

O DuckDNS pode continuar apontando junto; não atrapalha.

### O cardápio virtual

Hoje `<dominio>` serve `deploy/cardapio/index.html`, uma página de aviso. Quando
o cardápio for construído, é só trocar o conteúdo dessa pasta (ou apontar o
`root` do Caddy para outra) — o sistema no `app.` não é afetado.

---

## Um aviso honesto

Com o sistema na nuvem, **internet caída é venda parada**. Se isso for
inaceitável no seu balcão, o mesmo conjunto (Caddy + uvicorn) roda no próprio PC
da cantina, com o celular acessando pelo Wi-Fi local — e a VM da Oracle fica só
para backup e acesso de fora.
