#!/bin/sh
set -e
mkdir -p /app/public/uploads /app/data/equipment-files /app/data/task-files
chown -R app:app /app/public/uploads /app/data
exec su -s /bin/sh app -c "node scripts/migrate.mjs && exec npx next start -p ${PORT:-3000}"
