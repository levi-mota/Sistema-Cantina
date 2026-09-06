#!/usr/bin/env bash
# Publica a versão nova: puxa o código, refaz a tela e reinicia a API.
#
#   sudo bash /opt/cantina/deploy/atualizar.sh
#
# O backup vem antes de tudo: se a versão nova trouxer uma migração de banco
# que dê errado, a cópia de agora é o caminho de volta.
set -euo pipefail

RAIZ=/opt/cantina
USUARIO=cantina

passo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }

passo "Backup antes de mexer"
bash "$RAIZ/deploy/backup.sh"

passo "Código"
cd "$RAIZ"
# O repositorio pertence ao usuario do servico, e quem publica e o root: sem
# isto o git recusa a pasta por "dubious ownership" e nada e atualizado.
git config --global --add safe.directory "$RAIZ" 2>/dev/null || true
git fetch --quiet origin
ANTES=$(git rev-parse --short HEAD)
git reset --hard --quiet origin/master
DEPOIS=$(git rev-parse --short HEAD)
echo "  $ANTES -> $DEPOIS"

passo "Dependências e tela"
"$RAIZ/backend/.venv/bin/pip" install -q --upgrade -r "$RAIZ/backend/requirements.txt"
cd "$RAIZ/frontend"
npm ci --silent
npm run build --silent
chown -R "$USUARIO":"$USUARIO" "$RAIZ"

passo "Reiniciando"
# As migrações do banco são aplicadas pela própria aplicação ao subir.
systemctl restart cantina-api
sleep 3

if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
  printf '\033[32m  no ar\033[0m\n'
else
  printf '\033[31m  a API não respondeu -- journalctl -u cantina-api -n 50\033[0m\n'
  exit 1
fi
