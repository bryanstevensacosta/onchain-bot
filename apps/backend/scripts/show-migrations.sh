#!/usr/bin/env bash
# Migration show script that works in both development (TypeScript) and production (JavaScript)

set -euo pipefail

# Detect if we're in a compiled environment (Docker) or development
if [ -f "dist/src/shared/common/persistence/data-source.js" ]; then
  # Production/Staging: use compiled JavaScript with relative path
  echo "Showing migrations from compiled JavaScript (dist/)..."
  npx typeorm -d ./dist/src/shared/common/persistence/data-source.js migration:show
else
  # Development: use TypeScript
  echo "Showing migrations from TypeScript (src/)..."
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:show
fi
