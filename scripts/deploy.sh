#!/usr/bin/env bash
# ============================================================
# Script de Deploy e Atualização do Site no VPS
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Iniciando deploy em ${APP_DIR}..."

cd "${APP_DIR}"

# 1. Puxa as últimas alterações do Git se estiver em um repositório
if [ -d ".git" ]; then
  echo "==> [1/5] Atualizando código do repositório Git..."
  git pull || echo "    Aviso: Não foi possível realizar git pull automático (modo manual)."
fi

# 2. Executa migração do archive legado para o usuário 1 se necessário
if [ -d "archive" ] && [ ! -d "data/archives/1" ]; then
  echo "==> [2/5] Migrando archive legado para data/archives/1..."
  bash "${SCRIPT_DIR}/migrate-archive.sh"
fi

# 3. Instala dependências do site
echo "==> [3/5] Instalando dependências npm no site..."
cd "${APP_DIR}/site"
npm install

# 4. Compila o site em modo SSR para produção
echo "==> [4/5] Compilando aplicação Astro SSR..."
npm run build

# 5. Ajusta permissões dos diretórios
echo "==> [5/5] Ajustando permissões e reiniciando o serviço..."
if id -u study &>/dev/null; then
  chown -R study:study "${APP_DIR}/data" "${APP_DIR}/site/dist" 2>/dev/null || true
fi

if systemctl is-active --quiet study-site; then
  systemctl restart study-site
  echo "    Serviço study-site reiniciado com sucesso!"
  systemctl status study-site --no-pager --lines=5
else
  echo "    Iniciando serviço study-site..."
  systemctl enable --now study-site 2>/dev/null || echo "    (systemd não ativo no ambiente atual; inicie com: npm run start dentro de site/)"
fi

echo ""
echo "============================================================"
echo "[✓] Deploy concluído com sucesso!"
echo "============================================================"
