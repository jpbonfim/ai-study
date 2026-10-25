#!/usr/bin/env bash
# ============================================================
# Deploy: compila um release nesta máquina e o ativa no VPS
# ============================================================
# Uso:
#   scripts/deploy.sh <destino-ssh>          # ex.: scripts/deploy.sh root@meu-vps
#   APP_DIR=/opt/study-site scripts/deploy.sh usuario@meu-vps
#
# O build (TypeScript, Vite, esbuild) roda aqui; o VPS só recebe os arquivos prontos, instala
# 6 pacotes de runtime e reinicia o serviço (veja scripts/activate-release.sh e docs/deploy.md).
# O usuário SSH precisa de sudo no servidor (ou ser root).
#
# Senhas: a senha SSH é pedida uma vez (todas as etapas reaproveitam a mesma conexão) e, se o
# usuário não for root, a do sudo também uma vez, na ativação. Nenhuma senha é gravada.
# ============================================================
set -euo pipefail

DESTINATION="${1:?Uso: scripts/deploy.sh <destino-ssh>}"
APP_DIR="${APP_DIR:-/opt/study-site}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# One authenticated SSH connection shared by every step (OpenSSH multiplexing).
CONTROL_DIR="$(mktemp -d)"
SSH_OPTIONS=(-o "ControlPath=${CONTROL_DIR}/connection")
close_connection() {
  ssh "${SSH_OPTIONS[@]}" -O exit "${DESTINATION}" 2>/dev/null || true
  rm -rf "${CONTROL_DIR}"
}
trap close_connection EXIT

echo "==> [1/4] Conectando a ${DESTINATION}..."
ssh "${SSH_OPTIONS[@]}" -o ControlMaster=yes -o ServerAliveInterval=30 -fN "${DESTINATION}"

echo "==> [2/4] Compilando o release localmente..."
RELEASE_DIR="$(cd "${ROOT_DIR}" && node scripts/build-release.mjs)"
RELEASE_ID="$(basename "${RELEASE_DIR}")"
[ -f "${RELEASE_DIR}/server.mjs" ] || { echo "[-] Build do release falhou." >&2; exit 1; }

# Uploaded without sudo to the SSH user's home, then moved into place by the activation step,
# so sudo runs only once, in an interactive terminal.
UPLOAD_DIR=".study-site-upload-${RELEASE_ID}"
echo "==> [3/4] Enviando ${RELEASE_ID} para ${DESTINATION}..."
rsync -az --delete -e "ssh ${SSH_OPTIONS[*]}" "${RELEASE_DIR}/" "${DESTINATION}:${UPLOAD_DIR}/"

echo "==> [4/4] Ativando em ${APP_DIR}/releases/${RELEASE_ID}..."
# $HOME is expanded by the SSH user's shell; $1-$3 by the root shell started by sudo.
ssh "${SSH_OPTIONS[@]}" -t "${DESTINATION}" "sudo sh -c '
  set -e
  mkdir -p \"\$1/releases\"
  rm -rf \"\$1/releases/\$2\"
  mv \"\$3\" \"\$1/releases/\$2\"
  exec bash \"\$1/releases/\$2/activate.sh\"
' sh '${APP_DIR}' '${RELEASE_ID}' \"\$HOME/${UPLOAD_DIR}\""
