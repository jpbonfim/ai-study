#!/usr/bin/env bash
# Migra o conteúdo de archive/ para data/archives/1/ (usuário admin)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SOURCE_ARCHIVE="${ROOT_DIR}/archive"
TARGET_DIR="${ROOT_DIR}/data/archives/1"

echo "==> Migrando arquivos de ${SOURCE_ARCHIVE} para ${TARGET_DIR}..."

mkdir -p "${TARGET_DIR}"

if [ -d "${SOURCE_ARCHIVE}" ]; then
  for item in "${SOURCE_ARCHIVE}"/*; do
    if [ -d "${item}" ]; then
      base="$(basename "${item}")"
      echo "    Copiando matéria: ${base}"
      mkdir -p "${TARGET_DIR}/${base}"
      cp -r "${item}/." "${TARGET_DIR}/${base}/"
    fi
  done
  echo "==> Migração concluída com sucesso para o usuário 1 (admin)!"
else
  echo "==> Pasta ${SOURCE_ARCHIVE} não encontrada. Nada a migrar."
fi
