#!/usr/bin/env bash
# ============================================================
# Script para Invalidar o Cache do Servidor (Terminal)
# ============================================================
# Limpa o cache persistente de MDX compilado no SQLite (study.db)
# e reinicia o serviço de produção se estiver em execução.
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${APP_DIR}/data/study.db"

echo "==> [Cache do Servidor] Iniciando invalidação de cache..."

if [ -f "${DB_PATH}" ]; then
  python3 -c "
import sqlite3, sys

db_path = '${DB_PATH}'
try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Verifica se a tabela existe
    cur.execute(\"SELECT count(*) FROM sqlite_master WHERE type='table' AND name='compiled_mdx_cache'\")
    if cur.fetchone()[0] > 0:
        cur.execute(\"SELECT count(*) FROM compiled_mdx_cache\")
        total = cur.fetchone()[0]
        cur.execute(\"DELETE FROM compiled_mdx_cache\")
        conn.commit()
        try:
            cur.execute(\"VACUUM\")
        except Exception:
            pass
        print(f'    [✓] Tabela compiled_mdx_cache limpa com sucesso ({total} registros removidos de {db_path})')
    else:
        print(f'    [-] Tabela compiled_mdx_cache ainda não existe no banco.')
    conn.close()
except Exception as err:
    print(f'    [!] Erro ao limpar cache no banco SQLite: {err}', file=sys.stderr)
    sys.exit(1)
"
else
  echo "    [-] Banco de dados ${DB_PATH} não encontrado. Nenhum cache persistente a limpar."
fi

# Atualiza o arquivo de epoch para sinalizar qualquer processo Node ativo a descartar o cache em memória
EPOCH_FILE="${APP_DIR}/data/.cache_epoch"
mkdir -p "${APP_DIR}/data"
date +%s%N > "${EPOCH_FILE}" 2>/dev/null || date +%s > "${EPOCH_FILE}"
echo "    [✓] Epoch de cache em memória atualizado (${EPOCH_FILE})."

# Limpa cache temporário de build do Astro se existir
if [ -d "${APP_DIR}/site/.astro" ]; then
  rm -rf "${APP_DIR}/site/.astro" 2>/dev/null || true
  echo "    [✓] Cache de compilação temporário do Astro (.astro) removido."
fi

# Se o serviço systemd estiver ativo, reinicia para descartar o cache em memória RAM
if command -v systemctl &>/dev/null && systemctl is-active --quiet study-site 2>/dev/null; then
  echo "    [↺] Reiniciando serviço study-site para limpar cache em memória..."
  systemctl restart study-site || true
  echo "    [✓] Serviço study-site reiniciado."
fi

echo "==> [✓] Cache do servidor invalidado com sucesso!"
