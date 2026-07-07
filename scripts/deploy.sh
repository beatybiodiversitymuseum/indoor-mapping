#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck source=../.env
  . ./.env
  set +a
fi

if [ -z "${BUILD_PATH:-}" ]; then
  echo "Error: BUILD_PATH is not set." >&2
  exit 1
fi

if [ -z "${DEPLOY_PATH:-}" ]; then
  echo "Error: DEPLOY_PATH is not set." >&2
  exit 1
fi

if [ -z "${PM2_APP_NAME:-}" ]; then
  echo "Error: PM2_APP_NAME is not set." >&2
  exit 1
fi

# Resolve a relative BUILD_PATH from the project root.
if [[ "$BUILD_PATH" != /* ]]; then
  BUILD_PATH="$ROOT/$BUILD_PATH"
fi

DEPLOY_PATH="${DEPLOY_PATH%/}"

SUDO_CMD=()
if [ "${DEPLOY_USE_SUDO:-0}" != "0" ]; then
  SUDO_CMD=(sudo)
fi

echo "Building application..."
npm run build

if [ ! -f "$BUILD_PATH/server.js" ]; then
  echo "Error: standalone server not found at $BUILD_PATH/server.js" >&2
  echo "BUILD_PATH should normally be .next/standalone" >&2
  exit 1
fi

echo "Deploying $BUILD_PATH/ -> $DEPLOY_PATH/"

"${SUDO_CMD[@]}" mkdir -p "$DEPLOY_PATH"

# Copy the standalone server, traced node_modules, and package files.
"${SUDO_CMD[@]}" rsync -av --delete \
  "$BUILD_PATH/" \
  "$DEPLOY_PATH/"

# These are not automatically included in .next/standalone.
"${SUDO_CMD[@]}" mkdir -p "$DEPLOY_PATH/.next/static"
"${SUDO_CMD[@]}" rsync -av --delete \
  "$ROOT/.next/static/" \
  "$DEPLOY_PATH/.next/static/"

if [ -d "$ROOT/public" ]; then
  "${SUDO_CMD[@]}" mkdir -p "$DEPLOY_PATH/public"
  "${SUDO_CMD[@]}" rsync -av --delete \
    "$ROOT/public/" \
    "$DEPLOY_PATH/public/"
fi

echo "Deployed to $DEPLOY_PATH/"
echo "Start with: node $DEPLOY_PATH/server.js"
echo "Starting or restarting PM2 process: $PM2_APP_NAME"

APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-3000}"

if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  HOSTNAME="$APP_HOST" PORT="$APP_PORT" \
    pm2 restart "$PM2_APP_NAME" --update-env
else
  HOSTNAME="$APP_HOST" PORT="$APP_PORT" \
    pm2 start "$DEPLOY_PATH/server.js" \
      --name "$PM2_APP_NAME" \
      --cwd "$DEPLOY_PATH"
fi

pm2 save

echo "Deployed and restarted $PM2_APP_NAME"
