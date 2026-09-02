#!/bin/bash
# 🔍 Quick Prerequisites Check for Local Testing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🔍 Prerequisites Check - Ingestion Service Local Testing"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check Node.js
log_info "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_success "Node.js installed: $NODE_VERSION"
else
    log_error "Node.js not installed"
    exit 1
fi

# Check Docker
log_info "Checking Docker..."
if command -v docker &> /dev/null; then
    log_success "Docker installed"
else
    log_error "Docker not installed"
    exit 1
fi

# Check PostgreSQL container
log_info "Checking PostgreSQL container..."
if docker ps | grep -q postgres; then
    POSTGRES_STATUS=$(docker ps --filter "name=postgres" --format "{{.Names}}: {{.Status}}" | head -1)
    log_success "PostgreSQL running: $POSTGRES_STATUS"
    
    # Test connection
    log_info "Testing PostgreSQL connection..."
    if docker exec -it $(docker ps -qf "name=postgres") psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
        log_success "PostgreSQL connection OK"
    else
        log_warning "PostgreSQL connection test failed (might be OK if permissions differ)"
    fi
else
    log_error "PostgreSQL container not running"
    log_info "Start with: npm run docker:up"
    exit 1
fi

# Check Redis
log_info "Checking Redis..."
if docker ps | grep -q redis; then
    log_success "Redis running in Docker"
elif command -v redis-cli &> /dev/null && redis-cli ping > /dev/null 2>&1; then
    log_success "Redis running locally"
elif redis-cli ping > /dev/null 2>&1; then
    log_success "Redis responding"
else
    log_warning "Redis not found. Cursor tracking will not work."
    log_info "Install: brew install redis && redis-server &"
fi

# Check ports
log_info "Checking port availability..."

if lsof -ti :3031 > /dev/null 2>&1; then
    log_warning "Port 3031 in use (ingestion-service)"
    PID=$(lsof -ti :3031)
    log_info "    PID: $PID - Use 'kill $PID' to free it"
else
    log_success "Port 3031 available"
fi

if lsof -ti :3030 > /dev/null 2>&1; then
    log_warning "Port 3030 in use (backend)"
    PID=$(lsof -ti :3030)
    log_info "    PID: $PID - Use 'kill $PID' to free it"
else
    log_success "Port 3030 available"
fi

# Check ingestion-service .env
log_info "Checking ingestion-service configuration..."
if [ -f "apps/ingestion-service/.env" ]; then
    log_success ".env file exists"
    
    # Check critical variables
    if grep -q "INGESTION_TELEGRAM_MTPROTO_SESSION=" apps/ingestion-service/.env; then
        SESSION=$(grep "INGESTION_TELEGRAM_MTPROTO_SESSION=" apps/ingestion-service/.env | cut -d'=' -f2)
        if [ -z "$SESSION" ] || [ "$SESSION" == "your_session_string_here" ]; then
            log_error "INGESTION_TELEGRAM_MTPROTO_SESSION not configured"
            log_info "    Generate: cd apps/ingestion-service && npm run telegram:gen-session"
        else
            log_success "MTProto session configured"
        fi
    else
        log_error "INGESTION_TELEGRAM_MTPROTO_SESSION not set"
    fi
    
    if grep -q "INGESTION_TELEGRAM_MTPROTO_API_ID=" apps/ingestion-service/.env; then
        log_success "MTProto API ID configured"
    else
        log_warning "INGESTION_TELEGRAM_MTPROTO_API_ID not set"
    fi
else
    log_error ".env file not found in apps/ingestion-service/"
    log_info "    Copy: cp apps/ingestion-service/.env.example apps/ingestion-service/.env"
    exit 1
fi

# Check backend .env
log_info "Checking backend configuration..."
BACKEND_ENV=""
if [ -f "apps/backend/.env.dev" ]; then
    BACKEND_ENV="apps/backend/.env.dev"
elif [ -f "apps/backend/.env" ]; then
    BACKEND_ENV="apps/backend/.env"
fi

if [ -n "$BACKEND_ENV" ]; then
    if grep -q "USE_SSE_INGESTION=true" "$BACKEND_ENV"; then
        log_success "Backend configured for SSE mode"
    else
        log_warning "Backend NOT configured for SSE mode"
        log_info "    Add to $BACKEND_ENV: USE_SSE_INGESTION=true"
    fi
else
    log_warning "No .env or .env.dev found in backend"
    log_info "    For testing, export: export USE_SSE_INGESTION=true"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📊 Summary"
echo "═══════════════════════════════════════════════════════════"
echo ""
log_info "Ready to start testing? Follow these steps:"
echo ""
echo "  Terminal 1: cd apps/ingestion-service && npm run start:dev"
echo "  Terminal 2: cd apps/backend && export USE_SSE_INGESTION=true && npm run start:dev"
echo "  Terminal 3: curl http://localhost:3031/api/health | jq"
echo ""
log_info "Full guide: ./LOCAL_TESTING_GUIDE.md"
echo ""
