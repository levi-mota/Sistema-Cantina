#!/usr/bin/env bash
# Cópia do banco da cantina.
#
# Usa o ".backup" do sqlite3, e não um cp: o banco roda em modo WAL e copiar o
# arquivo com o sistema aberto pode levar metade de uma venda. O ".backup" faz
# a cópia consistente com o servidor no ar.
set -euo pipefail

BANCO=/opt/cantina/backend/cantina.db
DESTINO=/var/backups/cantina
DIAS=30

mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/cantina-$(date +%Y%m%d-%H%M).db"

sqlite3 "$BANCO" ".backup '$ARQUIVO'"
gzip -f "$ARQUIVO"

# Guarda um mês. Cantina não tem volume para justificar mais.
find "$DESTINO" -name 'cantina-*.db.gz' -mtime +$DIAS -delete

echo "backup: ${ARQUIVO}.gz ($(du -h "${ARQUIVO}.gz" | cut -f1))"

# ATENÇÃO: isto guarda a cópia na MESMA máquina. Se a instância for perdida, o
# backup vai junto. Leve uma cópia para fora de vez em quando -- do seu PC:
#
#   scp ubuntu@SEU_IP:/var/backups/cantina/cantina-*.db.gz .
