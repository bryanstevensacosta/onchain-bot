#!/usr/bin/env bash
# TypeORM wrapper script that works in both development (TypeScript) and production (JavaScript)

set -euo pipefail

# Debug: Surface environment variable state at decision point
echo "[TYPEORM-DEBUG] NODE_ENV='${NODE_ENV:-<unset>}'"
echo "[TYPEORM-DEBUG] Compiled artifacts check: ./dist/backend/src/shared/common/persistence/data-source.js"
if [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
  echo "[TYPEORM-DEBUG] ✓ Compiled artifacts found"
else
  echo "[TYPEORM-DEBUG] ✗ Compiled artifacts not found"
fi

# Primary detection: NODE_ENV value (production or staging = JavaScript mode)
if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]; then
  echo "Running TypeORM command from compiled JavaScript (dist/)..."
  echo "[TYPEORM-DEBUG] Mode: JavaScript (NODE_ENV='${NODE_ENV:-<unset>}')"
  npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js "$@"
else
  echo "Running TypeORM command from TypeScript (src/)..."
  echo "[TYPEORM-DEBUG] Mode: TypeScript (NODE_ENV='${NODE_ENV:-<unset>}', using development mode)"
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts "$@"
fi
