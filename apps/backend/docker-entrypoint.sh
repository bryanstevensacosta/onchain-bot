#!/bin/sh
set -e

# Ensure mounted volumes are writable by the node user
chown -R node:node /app/uploads

# Drop privileges from root to node and run the CMD
exec gosu node "$@"
