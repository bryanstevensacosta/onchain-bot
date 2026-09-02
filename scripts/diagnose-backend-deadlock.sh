#!/bin/bash
# Diagnostic script for backend deadlock investigation
# Usage: bash scripts/diagnose-backend-deadlock.sh

set -e

echo "=== Backend Deadlock Diagnostic ==="
echo "Generated: $(date)"
echo ""

echo "1. Check for zombie Node processes:"
ps aux | grep -E "(node|nest)" | grep -v grep || echo "No Node/Nest processes found"
echo ""

echo "2. Check port 3030 usage:"
lsof -i:3030 || echo "Port 3030 is free"
echo ""

echo "3. Check PostgreSQL connectivity:"
docker exec alpha-meta-token-scanner-postgres pg_isready 2>&1 || echo "PostgreSQL not accessible"
echo ""

echo "4. Check Redis connectivity:"
docker exec alpha-meta-token-scanner-redis redis-cli ping 2>&1 || echo "Redis not accessible"
echo ""

echo "5. Test backend startup with sync I/O tracing:"
echo "   Starting backend with NODE_OPTIONS='--trace-sync-io --trace-warnings'..."
cd apps/backend
NODE_OPTIONS="--trace-sync-io --trace-warnings" timeout 30 npx nest start 2>&1 | tee backend-trace.log || echo "Backend timed out or failed (expected)"
echo ""
echo "   Last 50 lines of trace log:"
tail -50 backend-trace.log
echo ""

echo "6. Memory/CPU snapshot during startup:"
npx nest start &
BACKEND_PID=$!
echo "   Backend started with PID $BACKEND_PID"
for i in {1..10}; do
  echo "   Sample $i ($(date +%H:%M:%S)):"
  ps -p $BACKEND_PID -o %cpu,%mem,vsz,rss,time 2>/dev/null || { echo "   Process died"; break; }
  sleep 3
done
kill -9 $BACKEND_PID 2>/dev/null || true
echo ""

echo "7. Check for circular dependencies (madge):"
cd ../..
npx madge --circular apps/backend/src 2>&1 || echo "Madge check failed"
echo ""

echo "=== Diagnostic Complete ==="
echo ""
echo "Next steps:"
echo "  1. Review backend-trace.log for synchronous I/O warnings"
echo "  2. If no obvious culprit, use Node Inspector:"
echo "     cd apps/backend && npx nest build && node --inspect-brk dist/src/main.js"
echo "  3. Open chrome://inspect and click 'inspect' on the process"
echo "  4. Press F8 to resume, wait for hang, press F8 again to see call stack"
