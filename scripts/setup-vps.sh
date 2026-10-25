#!/usr/bin/env bash
# ============================================================
# Script de Configuração Automatizada do VPS (Ubuntu 24/26 LTS)
# ============================================================
# Este script prepara um servidor Ubuntu limpo instalando:
# - Node.js 24 LTS e ferramentas de compilação
# - Caddy Web Server com proxy reverso e TLS interno
# - Firewall UFW (portas 22, 80, 443 liberadas)
# - Usuário de sistema dedicado 'study'
# - Diretórios de releases/backups e serviço systemd (releases enviados por scripts/deploy.sh)
# ============================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "[-] Este script deve ser executado como root. Use: sudo bash scripts/setup-vps.sh"
  exit 1
fi

echo "==> [1/7] Atualizando lista de pacotes do sistema..."
apt-get update && apt-get upgrade -y

echo "==> [2/7] Instalando dependências essenciais..."
apt-get install -y curl wget git rsync build-essential ufw debian-keyring debian-archive-keyring apt-transport-https

echo "==> [3/7] Instalando Node.js 24 LTS..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "    Node.js instalado: $(node -v) / npm: $(npm -v)"

echo "==> [4/7] Instalando e configurando o Caddy Web Server..."
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# Copia Caddyfile padrão se existir no repositório
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/Caddyfile.example" ]; then
  cp "${SCRIPT_DIR}/Caddyfile.example" /etc/caddy/Caddyfile
  systemctl restart caddy
  echo "    Caddyfile configurado (SPA estático + proxy da API, TLS interno na porta 443)."
fi

echo "==> [5/7] Configurando o Firewall UFW e Preservando Serviços Existentes (VPN/Docker)..."
# 1. Garante que o UFW permita encaminhamento de tráfego para Docker e VPNs existentes
if [ -f "/etc/default/ufw" ]; then
  sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
fi

# 2. Habilita/preserva IP Forwarding no kernel para VPNs existentes
sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Redirect'
ufw allow 443/tcp comment 'HTTPS'

# 3. Libera porta UDP customizada para VPN se configurada via variável de ambiente (ex: VPN_PORT=51820)
if [ -n "${VPN_PORT}" ]; then
  ufw allow "${VPN_PORT}/udp" comment "VPN UDP (${VPN_PORT})"
  echo "    Porta UDP ${VPN_PORT} liberada para VPN."
fi

# Preserva portas e roteamento do Docker
if command -v docker &>/dev/null; then
  echo "    Docker detectado. Encaminhamento de pacotes ativo."
fi

ufw --force enable
echo "    Firewall ativo e protegido (portas 22, 80 e 443 TCP liberadas com forwarding ativo)."

echo "==> [6/7] Criando usuário de sistema dedicado 'study'..."
if ! id -u study &>/dev/null; then
  useradd -r -m -d /home/study -s /bin/bash study
fi

# Cria diretório da aplicação caso não exista
mkdir -p /opt/study-site/data/archives /opt/study-site/releases /opt/study-site/backups
chown -R study:study /opt/study-site /home/study

echo "==> [7/7] Configurando serviço systemd..."
if [ -f "${SCRIPT_DIR}/study-site.service" ]; then
  cp "${SCRIPT_DIR}/study-site.service" /etc/systemd/system/study-site.service
  systemctl daemon-reload
  echo "    Unidade systemd study-site.service registrada (cada release a mantém atualizada)."
fi

echo ""
echo "============================================================"
echo "[✓] Configuração do VPS concluída com sucesso!"
echo "============================================================"
echo "Próximos passos para colocar o site no ar:"
echo ""
echo "1. Na sua máquina, envie o .env.example e configure /opt/study-site/.env no servidor:"
echo "   scp .env.example <usuario>@<IP_DO_SEU_VPS>:/tmp/"
echo "   sudo cp /tmp/.env.example /opt/study-site/.env"
echo "   sudo nano /opt/study-site/.env  # Defina ADMIN_PASSWORD seguro; mantenha DATA_DIR=./data"
echo ""
echo "2. Na sua máquina (o build roda nela, não no VPS), faça o deploy:"
echo "   scripts/deploy.sh <usuario>@<IP_DO_SEU_VPS>"
echo ""
echo "3. Acesse seu servidor pelo navegador:"
echo "   https://<IP_DO_SEU_VPS>"
echo "   (Aceite o certificado autoassinado pelo Caddy)"
echo "============================================================"
