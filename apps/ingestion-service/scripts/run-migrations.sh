#!/usr/bin/env bash
# Migration runner that works in both development (TypeScript) and production (JavaScript)
# Dual-mode structure mirrors apps/backend/scripts/run-migrations.sh. One deliberate
# deviation: the TypeORM CLI is resolved via `npm root` (workspace root node_modules)
# instead of a relative `node_modules/` path, because npm workspaces hoist
# dependencies to the repo root — apps/ingestion-service/node_modules does not exist,
# so the backend's relative-path form fails here with MODULE_NOT_FOUND.

set -euo pipefail

TYPEORM_ROOT="$(npm root)"

# Detect if we're in a compiled environment (Docker) or development
if [ -f "dist/src/shared/common/persistence/data-source.js" ]; then
  # Production/Staging: use compiled JavaScript with absolute path
  echo "Running migrations from compiled JavaScript (dist/)..."
  node "${TYPEORM_ROOT}/typeorm/cli.js" -d ./dist/src/shared/common/persistence/data-source.js migration:run
else
  # Development: use TypeScript (ts-node wrapper registers ts-node for the .ts data-source)
  echo "Running migrations from TypeScript (src/)..."
  "${TYPEORM_ROOT}/../.bin/typeorm-ts-node-commonjs" --dataSource src/shared/common/persistence/data-source.ts migration:run
fi
