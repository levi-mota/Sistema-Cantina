#!/usr/bin/env bash
# Avisa o DuckDNS do IP atual da maquina.
#
# A Oracle mantem o IP publico enquanto a instancia existe, mas ele muda se ela
# for recriada -- e ai o dominio apontaria para o nada ate alguem perceber.
set -euo pipefail

# shellcheck disable=SC1091
set -a; . /etc/cantina.env; set +a

: "${DUCKDNS_SUBDOMINIO:?defina DUCKDNS_SUBDOMINIO em /etc/cantina.env}"
: "${DUCKDNS_TOKEN:?defina DUCKDNS_TOKEN em /etc/cantina.env}"

resposta=$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMINIO}&token=${DUCKDNS_TOKEN}&ip=")
echo "duckdns: $resposta"
[ "$resposta" = "OK" ]
