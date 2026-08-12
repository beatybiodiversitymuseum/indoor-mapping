#!/usr/bin/env bash
set -euo pipefail

: "${SERVICE_CREATOR_APPLICATION_NAME:?Controller must set SERVICE_CREATOR_APPLICATION_NAME}"
: "${SERVICE_CREATOR_INGRESS_PATH:?Controller must set SERVICE_CREATOR_INGRESS_PATH}"
: "${SERVICE_CREATOR_HEALTH_PATH:?Controller must set SERVICE_CREATOR_HEALTH_PATH}"
: "${SERVICE_CREATOR_ENV_FILE:?Controller must set SERVICE_CREATOR_ENV_FILE}"
[[ -f "$SERVICE_CREATOR_ENV_FILE" ]] || { echo "Missing controller environment" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$SERVICE_CREATOR_ENV_FILE"
set +a
: "${APP_HOST:?APP_HOST is required}"
: "${APP_PORT:?APP_PORT is required}"
APP_BASE_PATH="$SERVICE_CREATOR_INGRESS_PATH"
[[ "$APP_BASE_PATH" == / ]] && APP_BASE_PATH=""
[[ "$APP_HOST" == 127.0.0.1 || "$APP_HOST" == ::1 ]] || { echo "Frontend must bind to loopback" >&2; exit 1; }
pm2 describe "$SERVICE_CREATOR_APPLICATION_NAME" >/dev/null
curl --fail --silent --show-error \
  --retry 15 \
  --retry-delay 1 \
  --retry-connrefused \
  "http://$APP_HOST:$APP_PORT$APP_BASE_PATH$SERVICE_CREATOR_HEALTH_PATH" >/dev/null
