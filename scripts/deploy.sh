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
# ============================================================
set -euo pipefail

DESTINATION="${1:?Uso: scripts/deploy.sh <destino-ssh>}"
APP_DIR="${APP_DIR:-/opt/study-site}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [1/3] Compilando o release localmente..."
RELEASE_DIR="$(cd "${ROOT_DIR}" && node scripts/build-release.mjs)"
RELEASE_ID="$(basename "${RELEASE_DIR}")"
[ -f "${RELEASE_DIR}/server.mjs" ] || { echo "[-] Build do release falhou." >&2; exit 1; }

echo "==> [2/3] Enviando ${RELEASE_ID} para ${DESTINATION}:${APP_DIR}/releases/..."
ssh "${DESTINATION}" "sudo mkdir -p '${APP_DIR}/releases'"
rsync -az --delete --rsync-path="sudo rsync" "${RELEASE_DIR}/" "${DESTINATION}:${APP_DIR}/releases/${RELEASE_ID}/"

echo "==> [3/3] Ativando no servidor..."
ssh -t "${DESTINATION}" "sudo bash '${APP_DIR}/releases/${RELEASE_ID}/activate.sh'"
