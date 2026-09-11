#!/usr/bin/env bash
# Migration show script that works in both development (TypeScript) and production (JavaScript)

set -euo pipefail

# Detect if we're in a compiled environment (Docker) or development
if [ -f "dist/backend/src/shared/common/persistence/data-source.js" ]; then
  # Production/Staging: use compiled JavaScript with absolute path
  echo "Showing migrations from compiled JavaScript (dist/)..."
  # In Docker, typeorm CLI is in /app/node_modules
  # Use npx to handle the path resolution
  npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show
else
  # Development: use TypeScript
  echo "Showing migrations from TypeScript (src/)..."
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:show
fi
