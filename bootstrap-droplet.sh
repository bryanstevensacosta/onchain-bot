#!/usr/bin/env bash
# bootstrap-droplet.sh — Configura runner robusto + GHCR público + cron limpieza
# Ejecutar como root en el droplet: bash bootstrap-droplet.sh

set -euo pipefail

echo "=== bootstrap-droplet.sh ==="
echo "Configurando runner robusto + cron limpieza..."

# 1. Runner systemd robusto (evita queued 5min)
echo "--- 1/3: Runner systemd robusto ---"
SERVICE_FILE="/etc/systemd/system/actions.runner.runner.service"
if grep -q "Restart=on-failure" "$SERVICE_FILE"; then
  echo "  Restart=on-failure ya configurado"
else
  sed -i '/^\[Service\]/a Restart=on-failure\nRestartSec=10\nRuntimeMaxSec=6h' "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl restart actions.runner.runner.service
  echo "  Restart=on-failure + RuntimeMaxSec=6h añadido y servicio reiniciado"
fi

# Cron watchdog (solo revive si está inactive, no mata deploy)
WATCHDOG_FILE="/etc/cron.d/runner-watchdog"
if [ ! -f "$WATCHDOG_FILE" ]; then
  echo '*/5 * * * * root systemctl is-active --quiet actions.runner.runner.service || systemctl restart actions.runner.runner.service' > "$WATCHDOG_FILE"
  chmod 644 "$WATCHDOG_FILE"
  echo "  Cron watchdog creado en /etc/cron.d/runner-watchdog"
else
  echo "  Cron watchdog ya existe"
fi

# 2. Cron limpieza diaria 03:00 (mantiene disco <80%)
echo "--- 2/3: Cron limpieza diaria 03:00 ---"
CRON_PRUNE="/etc/cron.d/docker-prune"
if [ ! -f "$CRON_PRUNE" ]; then
  cat > "$CRON_PRUNE" << 'CRON'
0 3 * * * root docker system prune -af --filter "until=24h" --volumes=false 2>&1 | logger -t docker-prune
0 3 * * * root journalctl --vacuum-time=3d 2>&1 | logger -t journal-vacuum
CRON
  chmod 644 "$CRON_PRUNE"
  echo "  Cron docker-prune + journal-vacuum creado"
else
  echo "  Cron limpieza ya existe"
fi

# 3. Verificación estado
echo "--- 3/3: Verificación ---"
echo "Runner status:"
systemctl is-active actions.runner.runner.service && echo "  Runner: ACTIVE" || echo "  Runner: INACTIVE"
echo "Disk:"
df -h / | awk 'NR==2 {print "  Use%: " $5 "  Avail: " $4}'
docker system df 2>/dev/null | head -5

echo ""
echo "=== FALTAN MANUALES (requieren GitHub UI) ==="
echo "1. GHCR Público (no scriptable via API sin PAT):"
echo "   Settings → Packages → onchain-bot-backend → Package settings → Change visibility → Public"
echo "   Settings → Packages → onchain-bot-frontend → Package settings → Change visibility → Public"
echo ""
echo "Con GHCR público + pull :sha || :latest + cache registry:"
echo "  - pull sin GITHUB_TOKEN en droplet"
echo "  - cache registry no expira (vs GHA 7d)"
echo "  - Build en ubuntu-latest (14GB) → pull <500MB en droplet"

# 4. Firewall permanente crypto-news + socat persistente (idempotente, re-ejecutable)
echo "--- 4/4: Firewall crypto-news permanente (DOCKER-USER + socat) ---"
# NOTA: Docker bypasses ufw (el trafico a contenedores entra por las cadenas
# DOCKER-USER/FORWARD), y un REJECT manual en INPUT ensombrece (shadows) los allows
# de ufw — por eso los ACCEPTs van en DOCKER-USER con alcance a subred.
# NOTA: NUNCA filtrar por nombre de bridge (br-XXXX es efimero, cambia en cada
# recreate de la red); las subredes backend se derivan en runtime via
# `docker network inspect <net> --format ...` (nunca hardcodear subredes).
ensure_docker_user_accept() {
  local subnet="$1"
  local port="$2"
  if iptables -C DOCKER-USER -s "$subnet" -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    echo "  DOCKER-USER ACCEPT $subnet:$port ya existe"
    return 0
  fi
  # Insertar ANTES de un REJECT manual si existe (un -A ciego quedaria sombreado
  # tras el REJECT); si no hay REJECT, anexar al final. El guard iptables -C de
  # arriba hace idempotente la re-ejecucion.
  local reject_line
  reject_line="$(iptables -nL DOCKER-USER --line-numbers 2>/dev/null | awk '/REJECT/ {print $1; exit}' || true)"
  if [ -n "${reject_line:-}" ]; then
    iptables -I DOCKER-USER "$reject_line" -s "$subnet" -p tcp --dport "$port" -j ACCEPT
  else
    iptables -A DOCKER-USER -s "$subnet" -p tcp --dport "$port" -j ACCEPT
  fi
  echo "  DOCKER-USER ACCEPT $subnet:$port anadido"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "  docker no instalado — omitiendo ACCEPTs DOCKER-USER"
elif ! command -v iptables >/dev/null 2>&1; then
  echo "  iptables no instalado — omitiendo ACCEPTs DOCKER-USER"
elif ! iptables -nL DOCKER-USER >/dev/null 2>&1; then
  echo "  cadena DOCKER-USER ausente (docker sin redes?) — omitiendo ACCEPTs"
else
  FW_PORTS="3031 3032"
  FW_NETS="onchain-bot-net onchain-bot-staging-net"
  for FW_NET in $FW_NETS; do
    if ! docker network inspect "$FW_NET" >/dev/null 2>&1; then
      echo "  red $FW_NET ausente — omitiendo"
      continue
    fi
    FW_SUBNETS="$(docker network inspect "$FW_NET" --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null || true)"
    if [ -z "${FW_SUBNETS:-}" ]; then
      echo "  red $FW_NET sin subredes IPAM — omitiendo"
      continue
    fi
    for FW_SUBNET in $FW_SUBNETS; do
      for FW_PORT in $FW_PORTS; do
        ensure_docker_user_accept "$FW_SUBNET" "$FW_PORT"
      done
    done
  done
fi

# Listeners socat 3030/3031/3032 persistentes via systemd (idempotente).
if ! command -v socat >/dev/null 2>&1; then
  echo "  socat no instalado — omitiendo listeners persistentes (apt-get install socat)"
else
  SOCAT_UNIT="/etc/systemd/system/crypto-news-socat.service"
  SOCAT_UNIT_NAME="crypto-news-socat.service"
  TAILSCALE_IP="${TAILSCALE_IP:-100.110.169.120}"
  SOCAT_WANT="[Unit]
Description=Crypto-news socat listeners 3030/3031/3032 on $TAILSCALE_IP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/bin/bash -c 'for P in 3030 3031 3032; do socat TCP-LISTEN:\$P,fork,reuseaddr,bind=$TAILSCALE_IP TCP:127.0.0.1:\$P & done; wait -n'
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
"
  if [ -f "$SOCAT_UNIT" ] && [ "$(cat "$SOCAT_UNIT")" = "$SOCAT_WANT" ]; then
    echo "  $SOCAT_UNIT_NAME ya existe con el contenido esperado"
  else
    printf '%s' "$SOCAT_WANT" > "$SOCAT_UNIT"
    systemctl daemon-reload
    echo "  $SOCAT_UNIT_NAME (re)generado"
  fi
  systemctl enable --now "$SOCAT_UNIT_NAME"
  echo "  $SOCAT_UNIT_NAME enable --now aplicado"
fi
