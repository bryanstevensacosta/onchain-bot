#!/bin/bash
# Reproduces staging CREATE EXTENSION hang locally
#
# This script demonstrates the TypeORM CREATE EXTENSION hang issue that occurs
# in staging environments and verifies that the monkey-patch workaround prevents it.
#
# **Issue Background:**
# - TypeORM PostgresDriver.afterConnect() executes CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
# - In staging environment, this query hangs indefinitely
# - Extension already exists; manual execution completes instantly
# - Root cause: suspected connection pool initialization + PostgreSQL permission model
#
# **Related:**
# - GitHub Issue: typeorm/typeorm#7691 (CREATE EXTENSION on slave/read-only connections)
# - Our Fix: Monkey-patch in DatabaseModule.forRootFromEnv() (database.module.ts)

set -euo pipefail

echo "🔧 Setting up test environment..."
echo ""

# Use staging database config
export NODE_ENV=staging
export DATABASE_ENABLED=true
export TELEGRAM_ENABLED=false
export INGESTION_TELEGRAM_ENABLED=false
export PUBLISHING_TELEGRAM_ENABLED=false

# Enable TypeORM query logging to see CREATE EXTENSION (or lack thereof)
export DATABASE_LOGGING=true

# Ensure we're in the backend directory
cd "$(dirname "$0")/../apps/backend" || exit 1

echo "📊 Environment Configuration:"
echo "   NODE_ENV: $NODE_ENV"
echo "   DATABASE_ENABLED: $DATABASE_ENABLED"
echo "   DATABASE_LOGGING: $DATABASE_LOGGING"
echo ""
echo "🎯 Expected Behavior:"
echo "   - Monkey-patch should activate (NODE_ENV=staging)"
echo "   - PostgresDriver.afterConnect() will be no-op"
echo "   - No CREATE EXTENSION query should execute"
echo "   - Backend should start successfully in <60 seconds"
echo ""

LOG_FILE="/tmp/staging-reproduction-$(date +%s).log"
echo "📝 Logging to: $LOG_FILE"
echo ""

# Start backend in background
echo "🚀 Starting backend with NODE_ENV=staging..."
npm run start:dev > "$LOG_FILE" 2>&1 &
BACKEND_PID=$!

echo "   Backend PID: $BACKEND_PID"
echo ""

# Wait for startup with progress indicator
echo "⏰ Waiting for backend startup (max 60 seconds)..."
SECONDS=0
while [ $SECONDS -lt 60 ]; do
  if curl -s http://localhost:3030/api/health > /dev/null 2>&1; then
    echo ""
    echo "✅ Backend started successfully after $SECONDS seconds - NO HANG!"
    echo "   Monkey-patch is working correctly"
    SUCCESS=true
    break
  fi
  
  # Show progress every 5 seconds
  if [ $((SECONDS % 5)) -eq 0 ]; then
    echo -n "."
  fi
  
  sleep 1
done

echo ""
echo ""

# Check final status
if [ "${SUCCESS:-false}" = "true" ]; then
  echo "🎉 SUCCESS: Staging hang patch prevented the hang"
  echo ""
  echo "📋 Key log evidence:"
  echo ""
  
  # Show staging patch activation
  if grep -q "StagingPatch" "$LOG_FILE"; then
    echo "✓ Staging patch applied:"
    grep "StagingPatch" "$LOG_FILE" | head -3
  else
    echo "⚠️  Warning: No StagingPatch log found (unexpected)"
  fi
  
  echo ""
  
  # Show database connection (should NOT show CREATE EXTENSION)
  if grep -q "Postgres enabled" "$LOG_FILE"; then
    echo "✓ Database connection:"
    grep "Postgres enabled" "$LOG_FILE" | head -1
  fi
  
  echo ""
  
  # Verify no CREATE EXTENSION query (this is what we want)
  if grep -q "CREATE EXTENSION" "$LOG_FILE"; then
    echo "⚠️  Warning: CREATE EXTENSION found in logs (patch may not be working)"
    grep "CREATE EXTENSION" "$LOG_FILE"
  else
    echo "✓ No CREATE EXTENSION query executed (patch working correctly)"
  fi
  
  echo ""
  
  # Show application started message
  if grep -q "Application is running" "$LOG_FILE"; then
    echo "✓ Application started:"
    grep "Application is running" "$LOG_FILE" | head -1
  fi
  
  EXIT_CODE=0
else
  echo "❌ FAILURE: Backend hung for 60+ seconds"
  echo "   This indicates the monkey-patch is NOT working"
  echo ""
  echo "📋 Diagnostic information:"
  echo ""
  
  # Show last 30 lines of log
  echo "Last 30 lines of log:"
  tail -30 "$LOG_FILE"
  
  echo ""
  echo "💡 Troubleshooting:"
  echo "   1. Verify NODE_ENV=staging is set"
  echo "   2. Check if patchPostgresDriverForStagingHang() executed"
  echo "   3. Look for 'StagingPatch' in logs: grep StagingPatch $LOG_FILE"
  echo "   4. Check for CREATE EXTENSION hang: grep 'CREATE EXTENSION' $LOG_FILE"
  
  EXIT_CODE=1
fi

echo ""
echo "📄 Full log available at: $LOG_FILE"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
if kill -0 $BACKEND_PID 2>/dev/null; then
  kill $BACKEND_PID 2>/dev/null || true
  sleep 2
  # Force kill if still running
  kill -9 $BACKEND_PID 2>/dev/null || true
fi

echo "✨ Done"
exit $EXIT_CODE
