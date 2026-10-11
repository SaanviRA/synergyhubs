#!/usr/bin/env bash
# Make sure the local PostgreSQL container is running and accepting connections.
# Starts (or creates) it when it is not. Used by scripts/setup.sh and the test suite.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER=group_app_postgres

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not available. Start the Docker daemon (sudo systemctl start docker) and retry." >&2
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Starting existing container $CONTAINER..."
    docker start "$CONTAINER" >/dev/null
  elif docker compose version >/dev/null 2>&1; then
    echo "Creating $CONTAINER with docker compose..."
    (cd "$ROOT" && docker compose up -d postgres)
  else
    # Same settings as docker-compose.yml, for hosts without the compose plugin
    echo "Creating $CONTAINER with docker run..."
    docker run -d --name "$CONTAINER" --restart always \
      -e POSTGRES_DB=group_app_db -e POSTGRES_USER=pguser -e POSTGRES_PASSWORD=pgpassword \
      -p 127.0.0.1:5432:5432 \
      -v group_app_postgres_data:/var/lib/postgresql/data \
      -v "$ROOT/schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro" \
      postgres:15-alpine >/dev/null
  fi
fi

# Check over TCP: during first-boot initialisation the server only listens on its unix socket
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -q -h 127.0.0.1 -U pguser -d group_app_db; then
    echo "PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL did not become ready in 60s. Check: docker logs $CONTAINER" >&2
exit 1
