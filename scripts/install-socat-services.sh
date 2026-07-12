#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
TAILSCALE_IP="${TAILSCALE_IP:-100.84.4.28}"
ENV="${1:-}"

show_usage() {
  echo "Usage: $0 <prod|staging> [--dry-run]"
  echo ""
  echo "Arguments:"
  echo "  prod      - Install socat services for production"
  echo "  staging   - Install socat services for staging"
  echo "  --dry-run - Show what would be done without executing"
  echo ""
  echo "Environment variables:"
  echo "  TAILSCALE_IP - Tailscale IP (default: 100.84.4.28)"
  exit 1
}

# Parse arguments
DRY_RUN=false
if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

if [[ -z "$ENV" ]] || [[ "$ENV" != "prod" && "$ENV" != "staging" ]]; then
  echo -e "${RED}Error: Argument must be 'prod' or 'staging'${NC}"
  show_usage
fi

# Configuration per environment
case "$ENV" in
  prod)
    LOCAL_PORT_BACKEND=3030
    LOCAL_PORT_FRONTEND=5173
    TAILSCALE_PORT_BACKEND=3030
    TAILSCALE_PORT_FRONTEND=5173
    COMPOSE_DIR="/opt/onchain-bot/apps/backend"
    SERVICE_PREFIX="onchain-bot"
    ;;
  staging)
    LOCAL_PORT_BACKEND=3031
    LOCAL_PORT_FRONTEND=80
    TAILSCALE_PORT_BACKEND=3031
    TAILSCALE_PORT_FRONTEND=4173
    COMPOSE_DIR="/opt/onchain-bot-staging/apps/backend"
    SERVICE_PREFIX="onchain-bot-staging"
    ;;
esac

TEMPLATE_DIR="$(dirname "$0")/../infra/systemd"

echo -e "${GREEN}=== Socat services installation for $ENV ===${NC}"
echo "Tailscale IP: $TAILSCALE_IP"
echo "Service prefix: $SERVICE_PREFIX"
echo ""

# Check if socat is installed
if ! command -v socat &> /dev/null; then
  echo -e "${RED}Error: socat is not installed${NC}"
  echo "Install with: apt-get install socat"
  exit 1
fi

install_service() {
  local template="$1"
  local service_name="$2"
  local tailscale_ip="$3"
  local tailscale_port="$4"
  local local_port="$5"
  
  local service_content
  service_content=$(cat "$template")
  service_content="${service_content//\{TAILSCALE_IP\}/$tailscale_ip}"
  service_content="${service_content//\{TAILSCALE_PORT\}/$tailscale_port}"
  service_content="${service_content//\{LOCAL_PORT\}/$local_port}"
  
  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}=== Would create $service_name ===${NC}"
    echo "$service_content"
    echo ""
    return
  fi
  
  echo "Creating $service_name..."
  echo "$service_content" | sudo tee "/etc/systemd/system/$service_name" > /dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable "$service_name"
  sudo systemctl start "$service_name"
  echo -e "${GREEN}✓ $service_name created and started${NC}"
}

echo "Installing backend socat service..."
install_service \
  "$TEMPLATE_DIR/socat-backend.service.template" \
  "${SERVICE_PREFIX}-socat-backend.service" \
  "$TAILSCALE_IP" \
  "$TAILSCALE_PORT_BACKEND" \
  "$LOCAL_PORT_BACKEND"

echo ""
echo "Installing frontend socat service..."
install_service \
  "$TEMPLATE_DIR/socat-frontend.service.template" \
  "${SERVICE_PREFIX}-socat-frontend.service" \
  "$TAILSCALE_IP" \
  "$TAILSCALE_PORT_FRONTEND" \
  "$LOCAL_PORT_FRONTEND"

echo ""
echo -e "${GREEN}=== Installation complete ===${NC}"
echo ""
echo "Services installed:"
systemctl list-unit-files | grep "$SERVICE_PREFIX-socat" | awk '{print "  - " $1}'
echo ""
echo "Status:"
systemctl status "${SERVICE_PREFIX}-socat-backend.service" --no-pager || true
systemctl status "${SERVICE_PREFIX}-socat-frontend.service" --no-pager || true