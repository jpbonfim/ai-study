#!/usr/bin/env bash
# ============================================================
# Ativa um release no servidor (copiado para releases/<id>/activate.sh pelo build-release.mjs)
# ============================================================
# Uso (como root, no servidor):
#   sudo bash /opt/study-site/releases/<id>/activate.sh
#
# 1. Confere o .env (DATA_DIR precisa apontar para o banco existente).
# 2. Instala as dependências de runtime do release (npm ci, só 6 pacotes).
# 3. Faz backup consistente do banco (data/study.db -> backups/).
# 4. Instala/atualiza a unit systemd (guardando a anterior em backups/).
# 5. Troca o link "app" para este release e reinicia o serviço.
# 6. Verifica a saúde; se falhar, volta ao release (e à unit) anterior.
#
# Rollback manual: rode o activate.sh de um release anterior.
# ============================================================
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_ID="$(basename "${RELEASE_DIR}")"
APP_DIR="${APP_DIR:-$(cd "${RELEASE_DIR}/../.." && pwd)}"
APP_USER="${APP_USER:-study}"
SERVICE="study-site"
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
CURRENT_LINK="${APP_DIR}/app"
BACKUP_DIR="${APP_DIR}/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

fail() {
  echo "[-] $*" >&2
  exit 1
}

# Last value of KEY in .env (without surrounding quotes), or the given default.
env_value() {
  local key="$1" fallback="$2" value
  value="$(grep -E "^[[:space:]]*${key}=" "${APP_DIR}/.env" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "${value:-${fallback}}"
}

[ "${EUID}" -eq 0 ] || fail "Execute como root: sudo bash ${RELEASE_DIR}/activate.sh"
[ -f "${RELEASE_DIR}/server.mjs" ] || fail "${RELEASE_DIR} não parece um release (server.mjs ausente)."

echo "==> Ativando release ${RELEASE_ID} em ${APP_DIR}"

# ------------------------------------------------------------
echo "==> [1/6] Conferindo configuração..."
[ -f "${APP_DIR}/.env" ] || fail "Arquivo ${APP_DIR}/.env não encontrado (veja .env.example)."
DATA_DIR_SETTING="$(env_value DATA_DIR ./data)"
case "${DATA_DIR_SETTING}" in
  /*) DATA_DIR="${DATA_DIR_SETTING}" ;;
  *) DATA_DIR="$(realpath -m "${APP_DIR}/${DATA_DIR_SETTING}")" ;;
esac
PORT="$(env_value PORT 3000)"
# Retention: releases kept on disk (the active one included) and database backups.
KEEP_RELEASES="$(env_value DEPLOY_KEEP_RELEASES 5)"
KEEP_BACKUPS="$(env_value DEPLOY_KEEP_BACKUPS 10)"
for setting in KEEP_RELEASES KEEP_BACKUPS; do
  [[ "${!setting}" =~ ^[1-9][0-9]*$ ]] || fail "DEPLOY_${setting} precisa ser um inteiro >= 1 (valor: ${!setting})."
done
if [ ! -f "${DATA_DIR}/study.db" ]; then
  if [ -f "${APP_DIR}/data/study.db" ]; then
    # The Astro server resolved DATA_DIR from site/ (DATA_DIR=../data); this one resolves it from
    # APP_DIR. Starting anyway would create an empty database with only the initial admin.
    fail "DATA_DIR=${DATA_DIR_SETTING} aponta para ${DATA_DIR}, onde não há study.db, mas existe ${APP_DIR}/data/study.db.
    Caminhos relativos agora partem de ${APP_DIR} (antes partiam de site/). Ajuste o .env para DATA_DIR=./data e rode de novo."
  fi
  echo "    Aviso: ${DATA_DIR}/study.db não existe; um banco novo será criado (primeira instalação)."
fi
echo "    Dados: ${DATA_DIR} | porta: ${PORT}"

# ------------------------------------------------------------
echo "==> [2/6] Instalando dependências de runtime..."
chown -R "${APP_USER}:${APP_USER}" "${RELEASE_DIR}"
(cd "${RELEASE_DIR}" && runuser -u "${APP_USER}" -- npm ci --omit=dev --no-audit --no-fund)
(cd "${RELEASE_DIR}" && runuser -u "${APP_USER}" -- node -e "require('better-sqlite3')") \
  || fail "better-sqlite3 não carregou (binário nativo ausente para esta plataforma)."

# ------------------------------------------------------------
echo "==> [3/6] Backup do banco..."
mkdir -p "${BACKUP_DIR}"
if [ -f "${DATA_DIR}/study.db" ]; then
  DB_BACKUP="${BACKUP_DIR}/study-${STAMP}.db"
  # Online backup through SQLite itself: consistent even with the service running (WAL mode).
  (cd "${RELEASE_DIR}" && node -e "
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
    db.backup(process.argv[2]).then(() => db.close());
  " "${DATA_DIR}/study.db" "${DB_BACKUP}")
  echo "    ${DB_BACKUP}"
  ls -1t "${BACKUP_DIR}"/study-*.db | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
else
  echo "    (sem banco para copiar)"
fi

# ------------------------------------------------------------
echo "==> [4/6] Unit systemd..."
PREVIOUS_UNIT=""
if ! cmp -s "${RELEASE_DIR}/study-site.service" "${UNIT_PATH}"; then
  if [ -f "${UNIT_PATH}" ]; then
    PREVIOUS_UNIT="${BACKUP_DIR}/${SERVICE}.service.${STAMP}"
    cp "${UNIT_PATH}" "${PREVIOUS_UNIT}"
    echo "    Unit anterior guardada em ${PREVIOUS_UNIT}"
  fi
  cp "${RELEASE_DIR}/study-site.service" "${UNIT_PATH}"
  systemctl daemon-reload
  systemctl enable "${SERVICE}" >/dev/null 2>&1 || true
  echo "    Unit atualizada."
else
  echo "    Sem mudanças."
fi

# ------------------------------------------------------------
echo "==> [5/6] Trocando para o release e reiniciando..."
PREVIOUS_RELEASE=""
[ -L "${CURRENT_LINK}" ] && PREVIOUS_RELEASE="$(readlink -f "${CURRENT_LINK}")"
switch_to() {
  ln -sfn "$1" "${CURRENT_LINK}.next"
  mv -T "${CURRENT_LINK}.next" "${CURRENT_LINK}"
}
switch_to "${RELEASE_DIR}"
systemctl restart "${SERVICE}"

# ------------------------------------------------------------
echo "==> [6/6] Verificando saúde..."
healthy() {
  local code
  for _ in $(seq 1 30); do
    code="$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/session" || true)"
    # 401 = server up, no session (the expected answer to an anonymous request).
    if [ "${code}" = "401" ] || [ "${code}" = "200" ]; then return 0; fi
    sleep 1
  done
  return 1
}
if ! healthy; then
  echo "[-] O serviço não respondeu. Últimas linhas do log:" >&2
  journalctl -u "${SERVICE}" -n 30 --no-pager >&2 || true
  if [ -n "${PREVIOUS_RELEASE}" ] && [ "${PREVIOUS_RELEASE}" != "${RELEASE_DIR}" ]; then
    echo "==> Voltando para ${PREVIOUS_RELEASE}..." >&2
    switch_to "${PREVIOUS_RELEASE}"
  fi
  if [ -n "${PREVIOUS_UNIT}" ]; then
    cp "${PREVIOUS_UNIT}" "${UNIT_PATH}"
    systemctl daemon-reload
  fi
  systemctl restart "${SERVICE}" || true
  fail "Ativação de ${RELEASE_ID} falhou; estado anterior restaurado (banco: veja ${BACKUP_DIR})."
fi

# Keep the newest releases (the active one is never removed).
ls -1dt "${APP_DIR}"/releases/*/ | sed 's:/$::' | { grep -vxF "${RELEASE_DIR}" || true; } \
  | tail -n +"${KEEP_RELEASES}" | xargs -r rm -rf

echo ""
echo "============================================================"
echo "[✓] Release ${RELEASE_ID} ativo."
if [ -n "${PREVIOUS_RELEASE}" ] && [ "${PREVIOUS_RELEASE}" != "${RELEASE_DIR}" ]; then
  echo "    Anterior: ${PREVIOUS_RELEASE} (rollback: sudo bash ${PREVIOUS_RELEASE}/activate.sh)"
fi
echo "============================================================"
