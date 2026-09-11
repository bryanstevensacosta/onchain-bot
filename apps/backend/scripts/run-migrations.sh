#!/usr/bin/env bash
# Migration runner that works in both development (TypeScript) and production (JavaScript)

set -euo pipefail

# Detect if we're in a compiled environment (Docker) or development
if [ -f "dist/backend/src/shared/common/persistence/data-source.js" ]; then
  # Production/Staging: use compiled JavaScript with absolute path
  echo "Running migrations from compiled JavaScript (dist/)..."
  npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:run
else
  # Development: use TypeScript
  echo "Running migrations from TypeScript (src/)..."
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:run
fi
