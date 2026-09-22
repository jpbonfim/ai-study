#!/usr/bin/env bash
# ============================================================
# Script de Configuração Automatizada do VPS (Ubuntu 24/26 LTS)
# ============================================================
# Este script prepara um servidor Ubuntu limpo instalando:
# - Node.js 24 LTS e ferramentas de compilação
# - Caddy Web Server com proxy reverso e TLS interno
# - Firewall UFW (portas 22, 80, 443 liberadas)
# - Usuário de sistema dedicado 'study'
# - Serviço systemd para a aplicação Astro SSR
# ============================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "[-] Este script deve ser executado como root. Use: sudo bash scripts/setup-vps.sh"
  exit 1
fi

echo "==> [1/7] Atualizando lista de pacotes do sistema..."
apt-get update && apt-get upgrade -y

echo "==> [2/7] Instalando dependências essenciais..."
apt-get install -y curl wget git build-essential ufw debian-keyring debian-archive-keyring apt-transport-https

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
  echo "    Caddyfile configurado com proxy reverso e TLS interno na porta 443."
fi

echo "==> [5/7] Configurando o Firewall UFW e Preservando Serviços Existentes (VPN/Docker)..."
# 1. Garante que o UFW permita encaminhamento de tráfego para Docker e VPN (AmneziaWG)
if [ -f "/etc/default/ufw" ]; then
  sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
fi

# 2. Habilita/preserva IP Forwarding no kernel para a VPN
sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Redirect'
ufw allow 443/tcp comment 'HTTPS'

# 3. Libera explicitamente a porta UDP da VPN Amnezia (AmneziaWG)
ufw allow 30388/udp comment 'Amnezia VPN WireGuard'

# Preserva portas e roteamento do Docker
if command -v docker &>/dev/null; then
  echo "    Docker detectado. Encaminhamento de pacotes configurado para Amnezia VPN."
fi

ufw --force enable
echo "    Firewall ativo e protegido (portas 22, 80, 443 TCP e 30388 UDP liberadas com forwarding ativo)."

echo "==> [6/7] Criando usuário de sistema dedicado 'study'..."
if ! id -u study &>/dev/null; then
  useradd -r -m -d /home/study -s /bin/bash study
fi

# Cria diretório da aplicação caso não exista
mkdir -p /opt/study-site /opt/study-site/data/archives
chown -R study:study /opt/study-site /home/study

echo "==> [7/7] Configurando serviço systemd..."
if [ -f "${SCRIPT_DIR}/study-site.service.example" ]; then
  cp "${SCRIPT_DIR}/study-site.service.example" /etc/systemd/system/study-site.service
  systemctl daemon-reload
  echo "    Unidade systemd study-site.service registrada."
fi

echo ""
echo "============================================================"
echo "[✓] Configuração do VPS concluída com sucesso!"
echo "============================================================"
echo "Próximos passos para colocar o site no ar:"
echo ""
echo "1. Clone o repositório em /opt/study-site:"
echo "   sudo -u study git clone <URL_DO_REPOSITORIO> /opt/study-site"
echo ""
echo "2. Configure o arquivo de ambiente /opt/study-site/.env:"
echo "   cp /opt/study-site/.env.example /opt/study-site/.env"
echo "   nano /opt/study-site/.env  # Defina ADMIN_PASSWORD e SESSION_SECRET seguros"
echo ""
echo "3. Execute o script de deploy inicial:"
echo "   sudo bash /opt/study-site/scripts/deploy.sh"
echo ""
echo "4. Acesse seu servidor pelo navegador:"
echo "   https://<IP_DO_SEU_VPS>"
echo "   (Aceite o certificado autoassinado pelo Caddy)"
echo "============================================================"
