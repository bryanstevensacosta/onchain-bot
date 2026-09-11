#!/usr/bin/env bash
# Migration show script that works in both development (TypeScript) and production (JavaScript)

set -euo pipefail

# In Docker/production, always use compiled JavaScript
# In development, use TypeScript
if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]; then
  echo "Showing migrations from compiled JavaScript (dist/)..."
  npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show
else
  echo "Showing migrations from TypeScript (src/)..."
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:show
fi
