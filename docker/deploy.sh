#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/production.docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "production.docker-compose.yml was not found in $ROOT_DIR"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is not available."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/.env.production.example" ]]; then
    cp "$ROOT_DIR/.env.production.example" "$ENV_FILE"
  elif [[ -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  else
    echo "Neither .env.production.example nor .env.example was found."
    exit 1
  fi
  echo "Created $ENV_FILE from the example template. Review it before exposing the service publicly."
fi

replace_placeholder() {
  local key="$1"
  local current
  current="$(grep -E "^${key}=" "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
  if [[ -z "$current" || "$current" == replace-with-* || "$current" == change-this-* ]]; then
    local generated
    generated="$(openssl rand -hex 24)"
    python - <<PY
from pathlib import Path
path = Path(r"$ENV_FILE")
key = "$key"
generated = "$generated"
lines = path.read_text(encoding="utf-8").splitlines()
updated = []
for line in lines:
    if line.startswith(f"{key}="):
        updated.append(f"{key}={generated}")
    else:
        updated.append(line)
path.write_text("\n".join(updated) + "\n", encoding="utf-8")
PY
  fi
}

if command -v openssl >/dev/null 2>&1; then
  replace_placeholder "POSTGRES_PASSWORD"
  replace_placeholder "SUPERUSER_PASSWORD"
  replace_placeholder "MINIO_ROOT_PASSWORD"
  replace_placeholder "SECRET_KEY"
fi

echo "Building Docker images..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build

echo "Starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

echo "Waiting for Langflow health check..."
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:7860/health_check" >/dev/null 2>&1; then
    echo "Langflow is healthy."
    break
  fi
  sleep 2
done

LANGFLOW_BIND_ADDRESS="$(grep -E '^LANGFLOW_BIND_ADDRESS=' "$ENV_FILE" | cut -d= -f2- || true)"
LANGFLOW_PORT="$(grep -E '^LANGFLOW_PORT=' "$ENV_FILE" | cut -d= -f2- || true)"
LANGFLOW_PUBLIC_BASE_URL="$(grep -E '^LANGFLOW_PUBLIC_BASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
LANGFLOW_ACCESS_SECURE="$(grep -E '^LANGFLOW_ACCESS_SECURE=' "$ENV_FILE" | cut -d= -f2- || true)"

LANGFLOW_BIND_ADDRESS="${LANGFLOW_BIND_ADDRESS:-0.0.0.0}"
LANGFLOW_PORT="${LANGFLOW_PORT:-7860}"

echo
echo "Deployment complete."
echo "Compose file : $COMPOSE_FILE"
echo "Env file     : $ENV_FILE"
echo "Local URL    : http://127.0.0.1:${LANGFLOW_PORT}"
if [[ -n "$LANGFLOW_PUBLIC_BASE_URL" ]]; then
  echo "Public URL   : $LANGFLOW_PUBLIC_BASE_URL"
fi
echo
echo "Default admin username: admin"
echo "Admin password source : SUPERUSER_PASSWORD in $ENV_FILE"
echo
echo "Useful commands:"
echo "  docker compose --env-file \"$ENV_FILE\" -f \"$COMPOSE_FILE\" logs -f langflow"
echo "  docker compose --env-file \"$ENV_FILE\" -f \"$COMPOSE_FILE\" ps"
echo "  docker compose --env-file \"$ENV_FILE\" -f \"$COMPOSE_FILE\" down"
echo

if [[ "$LANGFLOW_BIND_ADDRESS" == "127.0.0.1" || "$LANGFLOW_BIND_ADDRESS" == "localhost" ]]; then
  echo "Warning: LANGFLOW_BIND_ADDRESS is loopback-only. External users still need a reverse proxy."
fi

if [[ "$LANGFLOW_ACCESS_SECURE" == "true" && "$LANGFLOW_PUBLIC_BASE_URL" != https://* ]]; then
  echo "Warning: Secure cookies are enabled without an HTTPS LANGFLOW_PUBLIC_BASE_URL."
  echo "Set LANGFLOW_ACCESS_SECURE=false and LANGFLOW_REFRESH_SECURE=false for direct HTTP beta access."
fi
