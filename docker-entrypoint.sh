#!/bin/sh
# Runs inside the production image before the app starts.
#
# When TURSO_DATABASE_URL is configured, remote Turso/libSQL is used so local
# SQLite migrations are skipped. Set RUN_MIGRATIONS=0 for one-off maintenance
# commands that must not touch the database before they run.
set -eu

if [ -z "${TURSO_DATABASE_URL:-}" ] && [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "[entrypoint] applying local SQLite migrations"
  pnpm db:migrate
fi

exec "$@"
