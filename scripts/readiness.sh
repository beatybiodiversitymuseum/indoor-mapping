#!/usr/bin/env bash

set -euo pipefail

APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-3001}"
APP_BASE_PATH="${APP_BASE_PATH:-/map}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-30}"

if [[ "$APP_HOST" != "127.0.0.1" && "$APP_HOST" != "localhost" && "$APP_HOST" != "::1" ]]; then
  echo "Error: readiness refuses a non-loopback APP_HOST: $APP_HOST" >&2
  exit 1
fi

health_url="http://${APP_HOST}:${APP_PORT}${APP_BASE_PATH}/api/health"
deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

until curl --fail --silent --show-error --max-time 3 "$health_url" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "Error: health check failed: $health_url" >&2
    exit 1
  fi
  sleep 1
done

echo "Healthy: $health_url"
