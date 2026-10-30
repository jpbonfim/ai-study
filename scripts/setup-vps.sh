#!/usr/bin/env bash
# ============================================================
# Setup de um VPS novo, a partir desta máquina
# ============================================================
# Uso:
#   scripts/setup-vps.sh <destino-ssh>          # ex.: scripts/setup-vps.sh root@meu-vps
#   SETUP_VPS_CONFIG=/caminho/setup-vps.conf scripts/setup-vps.sh usuario@meu-vps
#
# Valida scripts/setup-vps.conf aqui, envia provision-vps.sh, a configuração e o Caddyfile.example
# para um diretório temporário no servidor, executa o provisionamento com sudo e apaga os arquivos
# enviados (veja scripts/provision-vps.sh e docs/deploy.md). O usuário SSH precisa de sudo no
# servidor (ou ser root).
#
# Senhas: a senha SSH é pedida uma vez (todas as etapas reaproveitam a mesma conexão) e, se o
# usuário não for root, a do sudo também uma vez. Nenhuma senha é gravada.
# ============================================================
set -euo pipefail

DESTINATION="${1:?Uso: scripts/setup-vps.sh <destino-ssh>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SETUP_VPS_CONFIG:-${SCRIPT_DIR}/setup-vps.conf}"
PROVISION_SCRIPT="${SCRIPT_DIR}/provision-vps.sh"

echo "==> [1/4] Validando a configuração..."
SETUP_VPS_CONFIG="${CONFIG_FILE}" bash "${PROVISION_SCRIPT}" --check-config

# One authenticated SSH connection shared by every step (OpenSSH multiplexing).
CONTROL_DIR="$(mktemp -d)"
SSH_OPTIONS=(-o "ControlPath=${CONTROL_DIR}/connection")
REMOTE_DIR=""
cleanup() {
  if [ -n "${REMOTE_DIR}" ]; then
    # shellcheck disable=SC2029 # REMOTE_DIR is expanded here on purpose
    ssh "${SSH_OPTIONS[@]}" "${DESTINATION}" "rm -rf '${REMOTE_DIR}'" 2>/dev/null || true
  fi
  ssh "${SSH_OPTIONS[@]}" -O exit "${DESTINATION}" 2>/dev/null || true
  rm -rf "${CONTROL_DIR}"
}
trap cleanup EXIT

echo "==> [2/4] Conectando a ${DESTINATION}..."
ssh "${SSH_OPTIONS[@]}" -o ControlMaster=yes -o ServerAliveInterval=30 -fN "${DESTINATION}"

echo "==> [3/4] Enviando os arquivos do setup..."
# Private to the SSH user (mktemp creates it with mode 700); removed by cleanup.
REMOTE_DIR="$(ssh "${SSH_OPTIONS[@]}" "${DESTINATION}" 'mktemp -d')"
scp -q "${SSH_OPTIONS[@]}" "${PROVISION_SCRIPT}" "${SCRIPT_DIR}/Caddyfile.example" "${DESTINATION}:${REMOTE_DIR}/"
scp -q "${SSH_OPTIONS[@]}" "${CONFIG_FILE}" "${DESTINATION}:${REMOTE_DIR}/setup-vps.conf"

echo "==> [4/4] Provisionando o servidor (sudo)..."
ssh "${SSH_OPTIONS[@]}" -t "${DESTINATION}" "sudo bash '${REMOTE_DIR}/provision-vps.sh'"
