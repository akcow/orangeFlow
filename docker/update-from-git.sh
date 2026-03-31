#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_DIR="$ROOT_DIR/docker"
REMOTE="${ORANGEFLOW_GIT_REMOTE:-origin}"
BRANCH="${ORANGEFLOW_GIT_BRANCH:-main}"
DEPLOY_MODE="${ORANGEFLOW_DEPLOY_MODE:-image}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is not installed."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

cd "$ROOT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "The repository has uncommitted changes. Commit, stash, or discard them before updating."
  exit 1
fi

echo "Fetching latest code from $REMOTE/$BRANCH ..."
git fetch "$REMOTE" "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"

cd "$DOCKER_DIR"

case "$DEPLOY_MODE" in
  image)
    if [[ ! -f ".env" ]]; then
      echo "Missing docker/.env. Create it before running image-based updates."
      exit 1
    fi
    if ! grep -q '^ORANGEFLOW_IMAGE=' .env; then
      echo "docker/.env must define ORANGEFLOW_IMAGE for image-based updates."
      exit 1
    fi
    echo "Pulling the latest published OrangeFlow image ..."
    docker compose --env-file .env -f production-image.docker-compose.yml pull orangeflow
    echo "Updating the running stack ..."
    docker compose --env-file .env -f production-image.docker-compose.yml up -d
    ;;
  full|full-prebuilt|lite)
    echo "Running source-based deploy mode: $DEPLOY_MODE"
    ORANGEFLOW_DEPLOY_MODE="$DEPLOY_MODE" ./deploy.sh
    ;;
  *)
    echo "Unsupported ORANGEFLOW_DEPLOY_MODE: $DEPLOY_MODE"
    echo "Use 'image', 'full', 'full-prebuilt', or 'lite'."
    exit 1
    ;;
esac

echo "Update completed."
