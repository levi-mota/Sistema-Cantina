#!/usr/bin/env bash
# Instalação do sistema da cantina numa VM Ubuntu (Oracle Cloud).
#
#   sudo bash deploy/instalar.sh
#
# Roda do zero e roda de novo sem estragar nada: cada passo confere antes de
# agir. Antes de começar, preencha /etc/cantina.env (veja deploy/cantina.env.exemplo).
set -euo pipefail

RAIZ=/opt/cantina
ENV_ARQUIVO=/etc/cantina.env
USUARIO=cantina

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
passo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { vermelho "Rode com sudo."; exit 1; }

if [ ! -f "$ENV_ARQUIVO" ]; then
  vermelho "Falta $ENV_ARQUIVO."
  echo "Copie deploy/cantina.env.exemplo para $ENV_ARQUIVO e preencha antes de continuar."
  exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENV_ARQUIVO"; set +a

: "${DOMINIO_APP:?defina DOMINIO_APP em $ENV_ARQUIVO}"
: "${DOMINIO_SITE:?defina DOMINIO_SITE em $ENV_ARQUIVO}"
: "${SECRET_KEY:?defina SECRET_KEY em $ENV_ARQUIVO}"
if [ "$SECRET_KEY" = "troque-esta-chave-em-producao" ] || [ "$SECRET_KEY" = "dev-secret" ]; then
  vermelho "SECRET_KEY ainda é a de exemplo. Gere uma: openssl rand -hex 32"
  exit 1
fi

passo "Pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip git sqlite3 curl ca-certificates gnupg \
  debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent

if ! command -v caddy >/dev/null; then
  passo "Caddy (servidor web com HTTPS automático)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

VERSAO_NODE=$(node -v 2>/dev/null | tr -d 'v' | cut -d. -f1)
if [ -z "$VERSAO_NODE" ] || [ "$VERSAO_NODE" -lt 20 ]; then
  passo "Node 22 (só para montar a tela; não fica rodando)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi

passo "Usuário e pastas"
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --home "$RAIZ" --shell /usr/sbin/nologin "$USUARIO"
mkdir -p /var/backups/cantina /var/log/caddy
chown -R "$USUARIO":"$USUARIO" "$RAIZ" /var/backups/cantina

passo "Firewall"
# A Oracle bloqueia em dois lugares: nas regras da instância (painel: VCN ->
# Security List -> Ingress, liberar 80 e 443) e no iptables da própria imagem
# Ubuntu, que é o que esta parte resolve. Sem os dois, o Let's Encrypt não
# consegue validar o domínio e o site não abre.
for porta in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$porta" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$porta" -j ACCEPT
    echo "  porta $porta liberada no iptables"
  fi
done
netfilter-persistent save >/dev/null
verde "  lembre-se de liberar 80 e 443 também na Security List da Oracle"

passo "Backend"
cd "$RAIZ/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
# O backend lê o .env da própria pasta; apontamos para o de produção.
ln -sfn "$ENV_ARQUIVO" "$RAIZ/backend/.env"

passo "Frontend"
cd "$RAIZ/frontend"
npm ci --silent
npm run build --silent

chown -R "$USUARIO":"$USUARIO" "$RAIZ"

passo "Serviços"
install -m 644 "$RAIZ/deploy/cantina-api.service" /etc/systemd/system/cantina-api.service
install -m 644 "$RAIZ/deploy/cantina-backup.service" /etc/systemd/system/cantina-backup.service
install -m 644 "$RAIZ/deploy/cantina-backup.timer" /etc/systemd/system/cantina-backup.timer
install -m 644 "$RAIZ/deploy/duckdns.service" /etc/systemd/system/duckdns.service
install -m 644 "$RAIZ/deploy/duckdns.timer" /etc/systemd/system/duckdns.timer
install -m 644 "$RAIZ/deploy/Caddyfile" /etc/caddy/Caddyfile

# O Caddy precisa enxergar os nomes de domínio do /etc/cantina.env.
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/dominios.conf <<EOF
[Service]
EnvironmentFile=$ENV_ARQUIVO
EOF

systemctl daemon-reload
systemctl enable --now cantina-api
systemctl enable --now cantina-backup.timer
if [ -n "${DUCKDNS_TOKEN:-}" ]; then
  systemctl enable --now duckdns.timer
fi
systemctl restart caddy

passo "Conferência"
sleep 3
if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
  verde "  backend respondendo"
else
  vermelho "  backend não respondeu -- veja: journalctl -u cantina-api -n 50"
fi
systemctl is-active --quiet caddy && verde "  caddy no ar" || vermelho "  caddy parado -- veja: journalctl -u caddy -n 50"

verde "
Pronto.

  Sistema:  https://$DOMINIO_APP
  Cardápio: https://$DOMINIO_SITE

O certificado leva um minuto para sair no primeiro acesso. Entre no sistema e
troque a senha do administrador antes de usar no balcão."
