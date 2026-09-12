#!/usr/bin/env bash
# Migration show script that works in both development (TypeScript) and production (JavaScript)

set -euo pipefail

# Debug: Surface environment variable state at decision point
echo "[MIGRATION-DEBUG] NODE_ENV='${NODE_ENV:-<unset>}'"
echo "[MIGRATION-DEBUG] Compiled artifacts check: ./dist/backend/src/shared/common/persistence/data-source.js"
if [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
  echo "[MIGRATION-DEBUG] ✓ Compiled artifacts found"
else
  echo "[MIGRATION-DEBUG] ✗ Compiled artifacts not found"
fi

# Primary detection: NODE_ENV value (production or staging = JavaScript mode)
if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]; then
  echo "Showing migrations from compiled JavaScript (dist/)..."
  echo "[MIGRATION-DEBUG] Mode: JavaScript (NODE_ENV='${NODE_ENV:-<unset>}')"
  npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show
else
  echo "Showing migrations from TypeScript (src/)..."
  echo "[MIGRATION-DEBUG] Mode: TypeScript (NODE_ENV='${NODE_ENV:-<unset>}', using development mode)"
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:show
fi
