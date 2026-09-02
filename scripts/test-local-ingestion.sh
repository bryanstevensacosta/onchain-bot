#!/bin/bash
# 🧪 Script de Testing Local para Servicio de Ingesta Centralizado
# Uso: ./scripts/test-local-ingestion.sh [test_number]

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_port() {
    local port=$1
    if lsof -ti :"$port" > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

kill_port() {
    local port=$1
    log_warning "Killing process on port $port..."
    lsof -ti :"$port" | xargs kill -9 2>/dev/null || true
    sleep 1
}

check_service() {
    local service=$1
    local command=$2
    
    if eval "$command" > /dev/null 2>&1; then
        log_success "$service is running"
        return 0
    else
        log_error "$service is NOT running"
        return 1
    fi
}

# Test 1: Prerequisites
test_prerequisites() {
    log_info "Test 1: Checking prerequisites..."
    
    local all_ok=true
    
    # Check Node.js version
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        log_success "Node.js installed: $NODE_VERSION"
    else
        log_error "Node.js not installed"
        all_ok=false
    fi
    
    # Check PostgreSQL
    if check_service "PostgreSQL" "psql -h localhost -p 5432 -U postgres -d onchain_bot -c 'SELECT 1' 2>&1"; then
        true
    else
        log_warning "PostgreSQL connection failed. Database tests may fail."
        log_info "To start PostgreSQL: brew services start postgresql@14"
    fi
    
    # Check Redis
    if check_service "Redis" "redis-cli ping"; then
        true
    else
        log_warning "Redis connection failed. Cursor tracking will not work."
        log_info "To start Redis: brew install redis && redis-server &"
    fi
    
    # Check if ports are available
    if check_port 3031; then
        log_warning "Port 3031 is in use (ingestion-service)"
        read -p "Kill process on port 3031? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill_port 3031
        fi
    else
        log_success "Port 3031 is available"
    fi
    
    if check_port 3030; then
        log_warning "Port 3030 is in use (backend)"
    else
        log_success "Port 3030 is available"
    fi
    
    if $all_ok; then
        log_success "All prerequisites met"
        return 0
    else
        log_error "Some prerequisites are missing"
        return 1
    fi
}

# Test 2: Build ingestion-service
test_build() {
    log_info "Test 2: Building ingestion-service..."
    
    cd "$PROJECT_ROOT/apps/ingestion-service"
    
    if npm run build; then
        log_success "Ingestion-service build successful"
        return 0
    else
        log_error "Ingestion-service build failed"
        return 1
    fi
}

# Test 3: Check environment variables
test_env() {
    log_info "Test 3: Checking environment variables..."
    
    cd "$PROJECT_ROOT/apps/ingestion-service"
    
    if [ ! -f ".env" ]; then
        log_error ".env file not found in apps/ingestion-service/"
        log_info "Copy .env.example to .env and configure"
        return 1
    fi
    
    # Check critical variables
    local missing=false
    
    if ! grep -q "INGESTION_TELEGRAM_MTPROTO_API_ID=" .env; then
        log_error "INGESTION_TELEGRAM_MTPROTO_API_ID not set"
        missing=true
    fi
    
    if ! grep -q "INGESTION_TELEGRAM_MTPROTO_SESSION=" .env; then
        log_error "INGESTION_TELEGRAM_MTPROTO_SESSION not set"
        missing=true
    fi
    
    if ! grep -q "INGESTION_PORT=" .env; then
        log_warning "INGESTION_PORT not set (will default to 3031)"
    fi
    
    if $missing; then
        log_error "Critical environment variables missing"
        log_info "Generate session: npm run telegram:gen-session"
        return 1
    else
        log_success "Environment variables configured"
        return 0
    fi
}

# Test 4: Health endpoint
test_health() {
    log_info "Test 4: Testing health endpoint..."
    
    local max_retries=10
    local retry=0
    
    while [ $retry -lt $max_retries ]; do
        if curl -s http://localhost:3031/api/health > /dev/null; then
            log_success "Health endpoint responding"
            
            # Show health status
            echo ""
            log_info "Health status:"
            curl -s http://localhost:3031/api/health | jq '.'
            echo ""
            
            return 0
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $max_retries ]; then
            log_warning "Waiting for ingestion-service to start... ($retry/$max_retries)"
            sleep 2
        fi
    done
    
    log_error "Health endpoint not responding after $max_retries attempts"
    return 1
}

# Test 5: SSE stream
test_sse() {
    log_info "Test 5: Testing SSE stream connection..."
    
    # Try to connect to SSE stream (timeout after 5 seconds)
    if timeout 5 curl -N http://localhost:3031/api/ingestion/stream 2>/dev/null | head -n 5; then
        log_success "SSE stream accepting connections"
        return 0
    else
        log_error "SSE stream connection failed"
        return 1
    fi
}

# Test 6: Backend configuration
test_backend_config() {
    log_info "Test 6: Checking backend configuration..."
    
    cd "$PROJECT_ROOT/apps/backend"
    
    # Check if USE_SSE_INGESTION is set
    if [ -f ".env.dev" ]; then
        if grep -q "USE_SSE_INGESTION=true" .env.dev; then
            log_success "Backend configured for SSE mode (.env.dev)"
        else
            log_warning "Backend not configured for SSE mode"
            log_info "Add to .env.dev: USE_SSE_INGESTION=true"
        fi
    elif [ -f ".env" ]; then
        if grep -q "USE_SSE_INGESTION=true" .env; then
            log_success "Backend configured for SSE mode (.env)"
        else
            log_warning "Backend not configured for SSE mode"
            log_info "Add to .env: USE_SSE_INGESTION=true"
        fi
    else
        log_warning "No .env or .env.dev file found in backend"
    fi
    
    return 0
}

# Test 7: Quick integration test
test_integration() {
    log_info "Test 7: Running quick integration test..."
    
    log_warning "This test requires:"
    log_info "  1. Ingestion-service running (Terminal 1)"
    log_info "  2. Backend running in SSE mode (Terminal 2)"
    log_info ""
    
    read -p "Are both services running? (y/n) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Integration test skipped"
        return 0
    fi
    
    # Check SSE clients count
    log_info "Checking connected SSE clients..."
    CLIENTS=$(curl -s http://localhost:3031/api/ingestion/stream/status 2>/dev/null | jq '.connectedClients' 2>/dev/null || echo "0")
    
    if [ "$CLIENTS" -gt "0" ]; then
        log_success "Backend connected to ingestion-service ($CLIENTS clients)"
        return 0
    else
        log_error "Backend not connected to ingestion-service"
        log_info "Check backend logs for connection errors"
        return 1
    fi
}

# Main menu
show_menu() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  🧪 Local Ingestion Service Testing"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "  1. Run all tests"
    echo "  2. Test prerequisites only"
    echo "  3. Build ingestion-service"
    echo "  4. Check environment variables"
    echo "  5. Test health endpoint"
    echo "  6. Test SSE stream"
    echo "  7. Check backend configuration"
    echo "  8. Quick integration test"
    echo "  9. Kill ports (3030, 3031)"
    echo "  0. Exit"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

# Run specific test
run_test() {
    case $1 in
        1)
            test_prerequisites
            test_build
            test_env
            test_health
            test_sse
            test_backend_config
            test_integration
            ;;
        2) test_prerequisites ;;
        3) test_build ;;
        4) test_env ;;
        5) test_health ;;
        6) test_sse ;;
        7) test_backend_config ;;
        8) test_integration ;;
        9) 
            kill_port 3030
            kill_port 3031
            log_success "Ports killed"
            ;;
        0) exit 0 ;;
        *)
            log_error "Invalid option"
            return 1
            ;;
    esac
}

# Main script
if [ $# -eq 0 ]; then
    # Interactive mode
    while true; do
        show_menu
        read -p "Select option: " option
        run_test "$option"
        echo ""
        read -p "Press Enter to continue..."
    done
else
    # CLI mode
    run_test "$1"
fi
