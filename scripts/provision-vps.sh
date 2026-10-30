#!/usr/bin/env bash
# ============================================================
# Provisionamento de um VPS novo (Ubuntu 24/26 LTS), executado no servidor
# ============================================================
# Normalmente enviado e executado por scripts/setup-vps.sh, a partir da sua máquina. Para rodar
# direto no servidor, com provision-vps.sh, setup-vps.conf e Caddyfile.example lado a lado:
#   sudo bash provision-vps.sh
#   bash provision-vps.sh --check-config   # só valida e mostra a configuração (sem root)
#
# 1. Pacotes do sistema, atualizações automáticas de segurança e limite do journald.
# 2. Swap (SWAP_SIZE_MB) e ajustes de memória para um servidor pequeno.
# 3. Node.js 24 LTS.
# 4. Caddy com o Caddyfile gerado a partir de SITE_ADDRESS.
# 5. Firewall UFW: SSH, 80, 443 e as portas de PORTS; nada mais.
#    Não apaga regras existentes nem mexe nos containers/regras do Docker.
# 6. Usuário 'study' e diretórios em /opt/study-site (o release e a unit systemd vêm do deploy.sh).
#
# Pode ser executado de novo: cada etapa confere o estado atual antes de mudar algo.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SETUP_VPS_CONFIG:-${SCRIPT_DIR}/setup-vps.conf}"
CADDYFILE_TEMPLATE="${SCRIPT_DIR}/Caddyfile.example"
# Placeholder address of Caddyfile.example, replaced by SITE_ADDRESS.
CADDYFILE_PLACEHOLDER="203.0.113.10"
APP_DIR="/opt/study-site"
APP_USER="study"
SWAP_FILE="/swapfile"
NODE_MAJOR=24
STAMP="$(date +%Y%m%d-%H%M%S)"

export DEBIAN_FRONTEND=noninteractive
# Ubuntu's needrestart would otherwise stop apt with an interactive prompt.
export NEEDRESTART_MODE=a
APT_OPTIONS=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

fail() {
  echo "[-] $*" >&2
  exit 1
}

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------
load_config() {
  [ -f "${CONFIG_FILE}" ] || fail "Configuração não encontrada: ${CONFIG_FILE}
    Copie ${SCRIPT_DIR}/setup-vps.conf.example para ${CONFIG_FILE} e preencha SITE_ADDRESS."

  SITE_ADDRESS=""
  SWAP_SIZE_MB=2048
  SSH_EXTRA_PORTS=()
  PORTS=()
  ALLOW_FORWARDING=true
  # shellcheck source=scripts/setup-vps.conf.example
  source "${CONFIG_FILE}"

  [ -n "${SITE_ADDRESS}" ] || fail "SITE_ADDRESS vazio em ${CONFIG_FILE}."
  [[ "${SITE_ADDRESS}" =~ ^[A-Za-z0-9.-]+$ ]] \
    || fail "SITE_ADDRESS inválido: '${SITE_ADDRESS}' (use um IPv4 ou um domínio, sem porta nem esquema)."
  [[ "${SWAP_SIZE_MB}" =~ ^[0-9]+$ ]] || fail "SWAP_SIZE_MB precisa ser um inteiro >= 0 (valor: ${SWAP_SIZE_MB})."
  [[ "${ALLOW_FORWARDING}" =~ ^(true|false)$ ]] \
    || fail "ALLOW_FORWARDING precisa ser true ou false (valor: ${ALLOW_FORWARDING})."

  local port rule
  for port in "${SSH_EXTRA_PORTS[@]}"; do
    is_port_number "${port}" || fail "Porta inválida em SSH_EXTRA_PORTS: '${port}'."
  done
  for rule in "${PORTS[@]}"; do
    is_port_rule "${rule}" || fail "Entrada inválida em PORTS: '${rule}' (formato: 51820/udp ou 60000:60100/udp)."
    case "${rule}" in
      80/tcp | 443/tcp | 443/udp)
        fail "PORTS contém ${rule}, usada pelo Caddy (HTTP, HTTPS e HTTP/3). Configure o serviço em outra porta." ;;
    esac
  done
}

print_config_summary() {
  echo "    Configuração: ${CONFIG_FILE}"
  echo "    Site: ${SITE_ADDRESS} | swap: ${SWAP_SIZE_MB} MiB | encaminhamento: ${ALLOW_FORWARDING}"
  echo "    Portas extras: ${PORTS[*]:-(nenhuma)}"
}

is_port_number() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

# "port/proto" or "first:last/proto", the forms accepted by "ufw allow".
is_port_rule() {
  local ports="${1%/*}" protocol="${1##*/}"
  [[ "$1" == */* ]] && [[ "${protocol}" =~ ^(tcp|udp)$ ]] || return 1
  if [[ "${ports}" == *:* ]]; then
    is_port_number "${ports%:*}" && is_port_number "${ports#*:}" && [ "${ports%:*}" -lt "${ports#*:}" ]
  else
    is_port_number "${ports}"
  fi
}

# ------------------------------------------------------------
# 1. System packages
# ------------------------------------------------------------
install_system_packages() {
  echo "==> [1/6] Atualizando o sistema e instalando pacotes base..."
  apt-get update
  apt-get upgrade "${APT_OPTIONS[@]}"
  apt-get install "${APT_OPTIONS[@]}" curl ca-certificates gnupg rsync git build-essential ufw \
    unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https

  # Daily package lists and unattended security updates.
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

  # Keep logs from filling a small disk.
  mkdir -p /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/study-site.conf <<'EOF'
[Journal]
SystemMaxUse=200M
EOF
  systemctl restart systemd-journald
}

# ------------------------------------------------------------
# 2. Swap and memory tuning
# ------------------------------------------------------------
# Swap in MiB provided by devices/files other than SWAP_FILE (e.g. a partition from the provider).
other_swap_mb() {
  swapon --show=NAME,SIZE --bytes --noheadings \
    | awk -v own="${SWAP_FILE}" '$1 != own { total += $2 } END { print int(total / 1048576) }'
}

active_swap_file_mb() {
  swapon --show=NAME,SIZE --bytes --noheadings \
    | awk -v own="${SWAP_FILE}" '$1 == own { print int($2 / 1048576) }'
}

configure_swap() {
  echo "==> [2/6] Configurando swap (${SWAP_SIZE_MB} MiB no total) e memória..."
  if [ "${SWAP_SIZE_MB}" -gt 0 ]; then
    local wanted_mb current_mb
    wanted_mb=$((SWAP_SIZE_MB - $(other_swap_mb)))
    current_mb="$(active_swap_file_mb)"
    if [ "${wanted_mb}" -le 0 ]; then
      echo "    Swap existente já cobre ${SWAP_SIZE_MB} MiB; ${SWAP_FILE} não é necessário."
    # swapon reports the size minus the header page, so allow 1 MiB of slack.
    elif [ -n "${current_mb}" ] && [ "${current_mb}" -ge $((wanted_mb - 1)) ]; then
      echo "    ${SWAP_FILE} já ativo (${current_mb} MiB)."
    else
      create_swap_file "${wanted_mb}"
    fi
  else
    echo "    SWAP_SIZE_MB=0: swap não configurado."
  fi

  # Prefer keeping the Node process and Caddy in RAM; swap is the safety net, not working memory.
  cat > /etc/sysctl.d/90-study-site-memory.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
  sysctl -q -p /etc/sysctl.d/90-study-site-memory.conf
}

create_swap_file() {
  local size_mb="$1"
  if swapon --show=NAME --noheadings | grep -qxF "${SWAP_FILE}"; then
    echo "    Redimensionando ${SWAP_FILE}..."
    swapoff "${SWAP_FILE}" || fail "swapoff ${SWAP_FILE} falhou (memória livre insuficiente para esvaziar o swap?)."
  fi
  rm -f "${SWAP_FILE}"
  fallocate -l "${size_mb}M" "${SWAP_FILE}" 2>/dev/null \
    || dd if=/dev/zero of="${SWAP_FILE}" bs=1M count="${size_mb}" status=none
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}" >/dev/null
  swapon "${SWAP_FILE}" || fail "swapon ${SWAP_FILE} falhou (a virtualização do VPS permite swap?)."
  grep -qE "^[[:space:]]*${SWAP_FILE}[[:space:]]" /etc/fstab \
    || echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  echo "    ${SWAP_FILE} criado e ativo (${size_mb} MiB)."
}

# ------------------------------------------------------------
# 3. Node.js
# ------------------------------------------------------------
install_node() {
  echo "==> [3/6] Instalando Node.js ${NODE_MAJOR} LTS..."
  local installed_major=0
  if command -v node &>/dev/null; then
    installed_major="$(node -p 'process.versions.node.split(".")[0]')"
  fi
  if [ "${installed_major}" -lt "${NODE_MAJOR}" ]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install "${APT_OPTIONS[@]}" nodejs
  fi
  echo "    Node.js $(node -v) / npm $(npm -v)"
}

# ------------------------------------------------------------
# 4. Caddy
# ------------------------------------------------------------
# Fails if a process other than Caddy holds a port Caddy needs (e.g. a Docker container on 443).
check_web_ports_free() {
  local listeners
  listeners="$( { ss -Hltnp 'sport = :80 or sport = :443'; ss -Hlunp 'sport = :443'; } | grep -v '"caddy"' || true)"
  [ -z "${listeners}" ] || fail "Portas do Caddy (80/tcp, 443/tcp, 443/udp) já em uso por outro processo:
${listeners}
    Mova esse serviço para outra porta antes de continuar."
}

render_caddyfile() {
  local placeholder_pattern="${CADDYFILE_PLACEHOLDER//./\\.}"
  if [[ "${SITE_ADDRESS}" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
    sed "s/^${placeholder_pattern} {/${SITE_ADDRESS} {/" "${CADDYFILE_TEMPLATE}"
  else
    # A domain gets a Let's Encrypt certificate: drop "tls internal" and its comment.
    sed -e "s/^${placeholder_pattern} {/${SITE_ADDRESS} {/" \
      -e '/^[[:space:]]*# .*TLS interno/d' -e '/^[[:space:]]*tls internal[[:space:]]*$/d' \
      "${CADDYFILE_TEMPLATE}"
  fi
}

install_caddy() {
  echo "==> [4/6] Instalando e configurando o Caddy..."
  [ -f "${CADDYFILE_TEMPLATE}" ] || fail "Modelo não encontrado: ${CADDYFILE_TEMPLATE}"
  check_web_ports_free

  if ! command -v caddy &>/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install "${APT_OPTIONS[@]}" caddy
  fi

  local rendered
  rendered="$(mktemp)"
  render_caddyfile > "${rendered}"
  grep -q "^${SITE_ADDRESS} {" "${rendered}" \
    || fail "Endereço ${CADDYFILE_PLACEHOLDER} não encontrado em ${CADDYFILE_TEMPLATE}."
  caddy validate --adapter caddyfile --config "${rendered}" >/dev/null 2>&1 \
    || { caddy validate --adapter caddyfile --config "${rendered}"; fail "Caddyfile gerado é inválido."; }

  if ! cmp -s "${rendered}" /etc/caddy/Caddyfile; then
    if [ -f /etc/caddy/Caddyfile ]; then
      cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.${STAMP}.bak"
      echo "    Caddyfile anterior guardado em /etc/caddy/Caddyfile.${STAMP}.bak"
    fi
    install -m 644 "${rendered}" /etc/caddy/Caddyfile
  fi
  rm -f "${rendered}"
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload-or-restart caddy
  echo "    Caddy servindo ${SITE_ADDRESS} (SPA de ${APP_DIR}/app/web e proxy da API)."
}

# ------------------------------------------------------------
# 5. Firewall
# ------------------------------------------------------------
# Ports sshd listens on, from its effective configuration (follows Port/Include and ssh.socket's
# generated listeners on Ubuntu), or 22 if that can't be read; plus SSH_EXTRA_PORTS.
ssh_ports() {
  local detected
  detected="$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }' || true)"
  # shellcheck disable=SC2086 # sshd may report several ports, one per line
  printf '%s\n' ${detected:-22} "${SSH_EXTRA_PORTS[@]}" | sort -un
}

configure_firewall() {
  echo "==> [5/6] Configurando o firewall (UFW)..."
  local port rule
  # SSH first, so enabling the firewall never drops the session running this script.
  for port in $(ssh_ports); do
    ufw allow "${port}/tcp" comment 'SSH' >/dev/null
    echo "    SSH: ${port}/tcp"
  done
  ufw allow 80/tcp comment 'HTTP (Caddy)' >/dev/null
  ufw allow 443/tcp comment 'HTTPS (Caddy)' >/dev/null
  ufw allow 443/udp comment 'HTTP/3 (Caddy)' >/dev/null
  echo "    Caddy: 80/tcp, 443/tcp, 443/udp"
  for rule in "${PORTS[@]}"; do
    ufw allow "${rule}" >/dev/null
    echo "    Extra: ${rule}"
  done

  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  if [ "${ALLOW_FORWARDING}" = true ]; then
    ufw default allow routed >/dev/null
    echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/90-study-site-forwarding.conf
    sysctl -q -p /etc/sysctl.d/90-study-site-forwarding.conf
    echo "    Encaminhamento de pacotes liberado (ALLOW_FORWARDING=true)."
  else
    # ip_forward itself is left alone: Docker turns it on for its own networks.
    ufw default deny routed >/dev/null
    rm -f /etc/sysctl.d/90-study-site-forwarding.conf
    echo "    Encaminhamento de pacotes bloqueado fora das regras do Docker (ALLOW_FORWARDING=false)."
  fi
  ufw --force enable >/dev/null
  echo "    UFW ativo; regras pré-existentes foram mantidas (veja: ufw status verbose)."

  report_docker_published_ports
}

# Ports published by Docker containers are opened by Docker's own iptables rules and are reachable
# regardless of UFW, so list them for review.
report_docker_published_ports() {
  command -v docker &>/dev/null || return 0
  local published
  published="$(docker ps --format '      {{.Names}}: {{.Ports}}' 2>/dev/null | grep -E '0\.0\.0\.0|:::|\[::\]' || true)"
  [ -n "${published}" ] || return 0
  echo "    Atenção: portas publicadas pelo Docker não passam pelo UFW e ficam abertas:"
  echo "${published}"
}

# ------------------------------------------------------------
# 6. Application user and directories
# ------------------------------------------------------------
create_app_layout() {
  echo "==> [6/6] Criando usuário '${APP_USER}' e diretórios em ${APP_DIR}..."
  if ! id -u "${APP_USER}" &>/dev/null; then
    useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
  local dir
  for dir in "${APP_DIR}" "${APP_DIR}/data" "${APP_DIR}/data/archives" "${APP_DIR}/releases" "${APP_DIR}/backups"; do
    mkdir -p "${dir}"
    chown "${APP_USER}:${APP_USER}" "${dir}"
  done
}

print_next_steps() {
  local scheme_note=""
  [[ "${SITE_ADDRESS}" =~ ^[0-9]+(\.[0-9]+){3}$ ]] && scheme_note=" (aceite o certificado autoassinado)"
  cat <<EOF

============================================================
[✓] VPS configurado.
============================================================
Próximos passos (detalhes em docs/deploy.md):

1. Crie ${APP_DIR}/.env a partir do .env.example (ADMIN_PASSWORD e SESSION_SECRET fortes,
   DATA_DIR=./data, HOST=127.0.0.1) — ou traga o .env e o data/ do servidor antigo.
2. Na sua máquina: scripts/deploy.sh <usuario>@<ip-do-vps>
3. Acesse https://${SITE_ADDRESS}${scheme_note}
============================================================
EOF
  if [ -f /var/run/reboot-required ]; then
    echo "As atualizações pedem reinicialização: sudo reboot (antes do deploy)."
  fi
}

main() {
  if [ "${1:-}" = "--check-config" ]; then
    load_config
    print_config_summary
    return
  fi
  [ "${EUID}" -eq 0 ] || fail "Execute como root: sudo bash ${BASH_SOURCE[0]}"
  load_config
  print_config_summary
  install_system_packages
  configure_swap
  install_node
  install_caddy
  configure_firewall
  create_app_layout
  print_next_steps
}

# Run only when executed, so the functions can be sourced and tested in isolation.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
