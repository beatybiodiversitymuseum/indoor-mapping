#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${SERVICE_CREATOR_RELEASE_ID:?Controller must set SERVICE_CREATOR_RELEASE_ID}"
: "${SERVICE_CREATOR_ARTIFACT_SHA256:?Controller must set SERVICE_CREATOR_ARTIFACT_SHA256}"
: "${SERVICE_CREATOR_ARTIFACT_DIR:?Controller must set SERVICE_CREATOR_ARTIFACT_DIR}"
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
RELEASE_ID="$SERVICE_CREATOR_RELEASE_ID"
RELEASES_DIR="$DEPLOY_ROOT/releases"
RELEASE_PATH="$RELEASES_DIR/$RELEASE_ID"
CURRENT_LINK="$DEPLOY_ROOT/current"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Invalid release ID" >&2; exit 2; }
[[ -f "$SERVICE_CREATOR_ARTIFACT_DIR/server.js" ]] || { echo "Missing standalone server" >&2; exit 1; }
[[ -d "$SERVICE_CREATOR_ARTIFACT_DIR/.next/static" ]] || { echo "Missing standalone static assets" >&2; exit 1; }
mkdir -p "$RELEASES_DIR"

if [[ -e "$RELEASE_PATH" ]]; then
  if [[ ! -f "$RELEASE_PATH/release.env" ]] \
    || ! grep -Fqx "ARTIFACT_SHA256=$SERVICE_CREATOR_ARTIFACT_SHA256" "$RELEASE_PATH/release.env"; then
    echo "Immutable release collision: $RELEASE_PATH" >&2
    exit 1
  fi
else
  TEMP_RELEASE="$RELEASES_DIR/.new.$RELEASE_ID.$$"
  cleanup() { rm -rf -- "$TEMP_RELEASE"; }
  trap cleanup EXIT
  mkdir -p "$TEMP_RELEASE/.service-creator"
  rsync -a --delete "$SERVICE_CREATOR_ARTIFACT_DIR/" "$TEMP_RELEASE/"
  install -m 0755 "$SCRIPT_DIR/rollback.sh" "$TEMP_RELEASE/.service-creator/rollback"
  install -m 0755 "$SCRIPT_DIR/readiness.sh" "$TEMP_RELEASE/.service-creator/readiness"
  install -m 0644 "$SCRIPT_DIR/config.env" "$TEMP_RELEASE/.service-creator/config.env"
  METADATA="$(mktemp)"
  printf 'RELEASE_ID=%s\nARTIFACT_SHA256=%s\nREPOSITORY=%s\n' \
    "$RELEASE_ID" "$SERVICE_CREATOR_ARTIFACT_SHA256" "${SERVICE_CREATOR_REPOSITORY:-unknown}" >"$METADATA"
  install -m 0444 "$METADATA" "$TEMP_RELEASE/release.env"
  rm -f "$METADATA"
  mv "$TEMP_RELEASE" "$RELEASE_PATH"
  TEMP_RELEASE="$RELEASES_DIR/.installed"
  trap - EXIT
fi

PREVIOUS="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
start_current() {
  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    HOSTNAME="$APP_HOST" PORT="$APP_PORT" pm2 restart "$PM2_APP_NAME" --update-env
  else
    HOSTNAME="$APP_HOST" PORT="$APP_PORT" pm2 start "$CURRENT_LINK/server.js" \
      --name "$PM2_APP_NAME" --cwd "$CURRENT_LINK"
  fi
}
restore() {
  set +e
  if [[ -n "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$DEPLOY_ROOT/current.rollback"
    mv -Tf "$DEPLOY_ROOT/current.rollback" "$CURRENT_LINK"
    start_current
    "$CURRENT_LINK/.service-creator/readiness"
  else
    rm -f -- "$CURRENT_LINK"
    pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
  fi
}
trap restore ERR
ln -sfn "$RELEASE_PATH" "$DEPLOY_ROOT/current.new"
mv -Tf "$DEPLOY_ROOT/current.new" "$CURRENT_LINK"
start_current
"$CURRENT_LINK/.service-creator/readiness"
pm2 save
trap - ERR
