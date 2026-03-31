#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
DEPLOY_MODE="${ORANGEFLOW_DEPLOY_MODE:-full}"
ENV_TEMPLATE=""
EXPECT_MINIO=0
EXPECT_PREBUILT_FRONTEND=0

case "$DEPLOY_MODE" in
  full)
    COMPOSE_FILE="$ROOT_DIR/production.docker-compose.yml"
    ENV_TEMPLATE="$ROOT_DIR/.env.production.example"
    EXPECT_MINIO=1
    ;;
  full-prebuilt)
    COMPOSE_FILE="$ROOT_DIR/production-prebuilt.docker-compose.yml"
    ENV_TEMPLATE="$ROOT_DIR/.env.production.example"
    EXPECT_MINIO=1
    EXPECT_PREBUILT_FRONTEND=1
    ;;
  lite)
    COMPOSE_FILE="$ROOT_DIR/production-lite.docker-compose.yml"
    ENV_TEMPLATE="$ROOT_DIR/.env.lite.example"
    EXPECT_PREBUILT_FRONTEND=1
    ;;
  *)
    echo "Unsupported ORANGEFLOW_DEPLOY_MODE: $DEPLOY_MODE"
    echo "Use 'full', 'full-prebuilt', or 'lite'."
    exit 1
    ;;
esac

COMPOSE_ARGS=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file was not found: $COMPOSE_FILE"
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

if [[ "$EXPECT_PREBUILT_FRONTEND" == "1" ]]; then
  FRONTEND_BUILD_DIR="$ROOT_DIR/../src/frontend/build"
  if [[ ! -d "$FRONTEND_BUILD_DIR" ]]; then
    echo "Prebuilt frontend assets are required for deploy mode '$DEPLOY_MODE'."
    echo "Build them first so this directory exists: $FRONTEND_BUILD_DIR"
    exit 1
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_TEMPLATE" ]]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
  elif [[ -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  else
    echo "No env template was found for deploy mode '$DEPLOY_MODE'."
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
    local tmp_file
    tmp_file="$(mktemp)"
    awk -v key="$key" -v value="$generated" '
      BEGIN { updated = 0 }
      index($0, key "=") == 1 {
        print key "=" value
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) {
          print key "=" value
        }
      }
    ' "$ENV_FILE" > "$tmp_file"
    mv "$tmp_file" "$ENV_FILE"
  fi
}

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -n 1 | cut -d= -f2- || true
}

if command -v openssl >/dev/null 2>&1; then
  replace_placeholder "POSTGRES_PASSWORD"
  replace_placeholder "SUPERUSER_PASSWORD"
  if [[ "$EXPECT_MINIO" == "1" ]]; then
    replace_placeholder "MINIO_ROOT_PASSWORD"
  fi
  replace_placeholder "SECRET_KEY"
fi

COMPOSE_PROFILES_RAW="$(read_env_value "COMPOSE_PROFILES")"
HTTPS_PROXY_ENABLED=0

if [[ -n "${COMPOSE_PROFILES_RAW// /}" ]]; then
  IFS=',' read -r -a compose_profiles <<< "$COMPOSE_PROFILES_RAW"
  for profile in "${compose_profiles[@]}"; do
    profile="${profile// /}"
    if [[ -n "$profile" ]]; then
      COMPOSE_ARGS+=(--profile "$profile")
    fi
    if [[ "$profile" == "https-proxy" ]]; then
      HTTPS_PROXY_ENABLED=1
    fi
  done
fi

if [[ "$HTTPS_PROXY_ENABLED" == "1" ]]; then
  if [[ ! -f "$ROOT_DIR/ssl/cert.pem" || ! -f "$ROOT_DIR/ssl/key.pem" ]]; then
    echo "The https-proxy profile requires docker/ssl/cert.pem and docker/ssl/key.pem."
    echo "Either place your TLS certificate files there or remove https-proxy from COMPOSE_PROFILES."
    exit 1
  fi
fi

echo "Validating Docker Compose configuration..."
docker compose "${COMPOSE_ARGS[@]}" config >/dev/null

echo "Building Docker images..."
docker compose "${COMPOSE_ARGS[@]}" build

echo "Starting services..."
docker compose "${COMPOSE_ARGS[@]}" up -d

LANGFLOW_BIND_ADDRESS="$(read_env_value "LANGFLOW_BIND_ADDRESS")"
LANGFLOW_PORT="$(read_env_value "LANGFLOW_PORT")"
LANGFLOW_PUBLIC_BASE_URL="$(read_env_value "LANGFLOW_PUBLIC_BASE_URL")"
LANGFLOW_ACCESS_SECURE="$(read_env_value "LANGFLOW_ACCESS_SECURE")"

LANGFLOW_BIND_ADDRESS="${LANGFLOW_BIND_ADDRESS:-0.0.0.0}"
LANGFLOW_PORT="${LANGFLOW_PORT:-7860}"

echo "Waiting for OrangeFlow health check..."
healthy=0
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${LANGFLOW_PORT}/health_check" >/dev/null 2>&1; then
    echo "OrangeFlow is healthy."
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" != "1" ]]; then
  echo "Warning: OrangeFlow did not pass the health check within the expected time window."
  echo "Inspect logs with: docker compose ${COMPOSE_ARGS[*]} logs -f orangeflow"
  echo "If PostgreSQL authentication fails after you changed POSTGRES_PASSWORD, recreate the postgres volume for the selected stack."
fi

echo
echo "Deployment complete."
echo "Deploy mode  : $DEPLOY_MODE"
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
echo "  docker compose ${COMPOSE_ARGS[*]} logs -f orangeflow"
echo "  docker compose ${COMPOSE_ARGS[*]} ps"
echo "  docker compose ${COMPOSE_ARGS[*]} down"
echo

if [[ "$LANGFLOW_BIND_ADDRESS" == "127.0.0.1" || "$LANGFLOW_BIND_ADDRESS" == "localhost" ]] && [[ "$HTTPS_PROXY_ENABLED" != "1" ]]; then
  echo "Warning: LANGFLOW_BIND_ADDRESS is loopback-only. External users still need a reverse proxy."
fi

if [[ "$LANGFLOW_ACCESS_SECURE" == "true" && "$LANGFLOW_PUBLIC_BASE_URL" != https://* ]]; then
  echo "Warning: Secure cookies are enabled without an HTTPS LANGFLOW_PUBLIC_BASE_URL."
  echo "Set LANGFLOW_ACCESS_SECURE=false and LANGFLOW_REFRESH_SECURE=false for direct HTTP beta access."
fi
