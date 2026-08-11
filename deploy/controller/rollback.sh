#!/usr/bin/env bash
set -euo pipefail

: "${SERVICE_CREATOR_ENV_FILE:?Controller must set SERVICE_CREATOR_ENV_FILE}"
: "${SERVICE_CREATOR_DEPLOY_ROOT:?Controller must set SERVICE_CREATOR_DEPLOY_ROOT}"
[[ -f "$SERVICE_CREATOR_ENV_FILE" ]] || { echo "Missing controller environment" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$SERVICE_CREATOR_ENV_FILE"
set +a
DEPLOY_ROOT="$SERVICE_CREATOR_DEPLOY_ROOT"
DEPLOY_ROOT="${DEPLOY_ROOT%/}"
: "${PM2_APP_NAME:?PM2_APP_NAME is required}"
: "${APP_HOST:?APP_HOST is required}"
: "${APP_PORT:?APP_PORT is required}"
TARGET_ID="${1:?Usage: rollback RELEASE_ID}"
TARGET="$DEPLOY_ROOT/releases/$TARGET_ID"
CURRENT="$DEPLOY_ROOT/current"
[[ "$TARGET_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Invalid release ID" >&2; exit 2; }
[[ -x "$TARGET/.service-creator/readiness" && -f "$TARGET/release.env" ]] || { echo "Incomplete rollback target" >&2; exit 1; }
ORIGINAL="$(readlink -f "$CURRENT")"
start_current() { HOSTNAME="$APP_HOST" PORT="$APP_PORT" pm2 restart "$PM2_APP_NAME" --update-env; }
restore() {
  set +e
  ln -sfn "$ORIGINAL" "$DEPLOY_ROOT/current.rollback"
  mv -Tf "$DEPLOY_ROOT/current.rollback" "$CURRENT"
  start_current
  "$ORIGINAL/.service-creator/readiness"
}
trap restore ERR
ln -sfn "$TARGET" "$DEPLOY_ROOT/current.rollback"
mv -Tf "$DEPLOY_ROOT/current.rollback" "$CURRENT"
start_current
"$TARGET/.service-creator/readiness"
pm2 save
trap - ERR
