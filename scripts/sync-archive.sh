#!/usr/bin/env bash
# ============================================================
# Wrapper para o script de sincronização do Archive (ai-study)
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="${SCRIPT_DIR}/sync_archive.py"

if ! command -v python3 &>/dev/null; then
  echo "[-] Python 3 não foi encontrado. Por favor, instale python3 para executar a sincronização."
  exit 1
fi

python3 "${PYTHON_SCRIPT}" "$@"
