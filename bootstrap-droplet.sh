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
