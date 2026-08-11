#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/config.env"
: "${SERVICE_CREATOR_ENV_FILE:?Controller must set SERVICE_CREATOR_ENV_FILE}"
[[ -f "$SERVICE_CREATOR_ENV_FILE" ]] || { echo "Missing controller environment" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$SERVICE_CREATOR_ENV_FILE"
set +a
: "${PM2_APP_NAME:?PM2_APP_NAME is required}"
: "${APP_HOST:?APP_HOST is required}"
: "${APP_PORT:?APP_PORT is required}"
APP_BASE_PATH="${APP_BASE_PATH-}"
[[ "$APP_HOST" == 127.0.0.1 || "$APP_HOST" == ::1 ]] || { echo "Frontend must bind to loopback" >&2; exit 1; }
pm2 describe "$PM2_APP_NAME" >/dev/null
curl --fail --silent --show-error "http://$APP_HOST:$APP_PORT$APP_BASE_PATH$HEALTH_SUFFIX" >/dev/null
