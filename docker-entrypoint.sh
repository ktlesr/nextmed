#!/bin/sh
# Applies pending migrations, then the idempotent v3 seed import (never overwrites portal edits,
# actuals, files or baselines), then starts the server. Set RUN_SEED=false to skip the import.
set -e
echo "→ applying database migrations"
node dist-scripts/migrate.mjs
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "→ importing seed data (idempotent)"
  node dist-scripts/seed.mjs
fi
echo "→ starting portal on :${PORT:-3000}"
exec node server.js
