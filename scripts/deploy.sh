#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck source=../.env
  . ./.env
  set +a
fi

BUILD_PATH="${BUILD_PATH:-.next/standalone}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/apps/indoor-mapping}"
PM2_APP_NAME="${PM2_APP_NAME:-indoor-mapping}"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-3001}"
RELEASES_TO_KEEP="${RELEASES_TO_KEEP:-5}"
ARTIFACT_PATH="${ARTIFACT_PATH:-}"
RELEASE_ID="${RELEASE_ID:-}"

usage() {
  echo "Usage: $0 [--artifact PATH] [--release-id ID] [--non-interactive]"
}

while (( $# > 0 )); do
  case "$1" in
    --artifact)
      ARTIFACT_PATH="$2"
      shift 2
      ;;
    --release-id)
      RELEASE_ID="$2"
      shift 2
      ;;
    --non-interactive)
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$APP_HOST" != "127.0.0.1" && "$APP_HOST" != "localhost" && "$APP_HOST" != "::1" ]]; then
  echo "Error: APP_HOST must be loopback, not $APP_HOST" >&2
  exit 1
fi
[[ "$DEPLOY_PATH" = /* ]] || { echo "Error: DEPLOY_PATH must be absolute." >&2; exit 1; }
[[ "$RELEASES_TO_KEEP" =~ ^[0-9]+$ ]] || { echo "Error: RELEASES_TO_KEEP must be numeric." >&2; exit 1; }

if [[ -z "$ARTIFACT_PATH" ]]; then
  npm run build
  if [[ "$BUILD_PATH" != /* ]]; then
    BUILD_PATH="$ROOT/$BUILD_PATH"
  fi
  ARTIFACT_PATH="$BUILD_PATH"
  mkdir -p "$ARTIFACT_PATH/.next/static"
  rsync -a --delete "$ROOT/.next/static/" "$ARTIFACT_PATH/.next/static/"
  if [[ -d "$ROOT/public" ]]; then
    mkdir -p "$ARTIFACT_PATH/public"
    rsync -a --delete "$ROOT/public/" "$ARTIFACT_PATH/public/"
  fi
elif [[ "$ARTIFACT_PATH" != /* ]]; then
  ARTIFACT_PATH="$ROOT/$ARTIFACT_PATH"
fi

[[ -f "$ARTIFACT_PATH/server.js" ]] || { echo "Error: artifact has no server.js: $ARTIFACT_PATH" >&2; exit 1; }
[[ -d "$ARTIFACT_PATH/.next/static" ]] || { echo "Error: artifact has no .next/static directory." >&2; exit 1; }

if [[ -z "$RELEASE_ID" ]]; then
  commit="$(git rev-parse HEAD 2>/dev/null || printf 'manual')"
  RELEASE_ID="${commit}-$(date -u +%Y%m%dT%H%M%SZ)"
fi
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Error: invalid release ID: $RELEASE_ID" >&2; exit 1; }

SUDO_CMD=()
if [[ "${DEPLOY_USE_SUDO:-0}" != "0" ]]; then
  SUDO_CMD=(sudo)
fi

atomic_symlink() {
  local target="$1"
  local link_path="$2"
  local temporary_link="${link_path}.new-$$"
  "${SUDO_CMD[@]}" rm -f "$temporary_link"
  "${SUDO_CMD[@]}" ln -s "$target" "$temporary_link"
  if ! "${SUDO_CMD[@]}" mv -Tf "$temporary_link" "$link_path" 2>/dev/null; then
    "${SUDO_CMD[@]}" mv -fh "$temporary_link" "$link_path"
  fi
}

releases_path="$DEPLOY_PATH/releases"
release_path="$releases_path/$RELEASE_ID"
incoming_path="$releases_path/.incoming-$RELEASE_ID-$$"
previous_target="$(readlink "$DEPLOY_PATH/current" 2>/dev/null || true)"

cleanup() {
  "${SUDO_CMD[@]}" rm -rf -- "$incoming_path" 2>/dev/null || true
}
trap cleanup EXIT

"${SUDO_CMD[@]}" mkdir -p "$releases_path" "$incoming_path"
"${SUDO_CMD[@]}" rsync -a --delete "$ARTIFACT_PATH/" "$incoming_path/"

artifact_checksum="$(find "$ARTIFACT_PATH" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
metadata_file="$(mktemp)"
trap 'rm -f "$metadata_file"; cleanup' EXIT
printf '{"release_id":"%s","artifact_sha256":"%s","profile":"nextjs_frontend","interface":"service_creator_v1"}\n' \
  "$RELEASE_ID" "$artifact_checksum" >"$metadata_file"
"${SUDO_CMD[@]}" cp "$metadata_file" "$incoming_path/release.json"

if [[ -e "$release_path" ]]; then
  echo "Error: immutable release already exists: $release_path" >&2
  exit 1
fi
"${SUDO_CMD[@]}" mv "$incoming_path" "$release_path"

atomic_symlink "releases/$RELEASE_ID" "$DEPLOY_PATH/current"

start_release() {
  pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
  HOSTNAME="$APP_HOST" PORT="$APP_PORT" pm2 start "$DEPLOY_PATH/current/server.js" \
    --name "$PM2_APP_NAME" --cwd "$DEPLOY_PATH/current"
}

start_release
if ! "$SCRIPT_DIR/readiness.sh"; then
  echo "Error: release failed readiness; restoring previous release." >&2
  if [[ -n "$previous_target" ]]; then
    atomic_symlink "$previous_target" "$DEPLOY_PATH/current"
    start_release
    "$SCRIPT_DIR/readiness.sh" || echo "Error: restored release also failed readiness." >&2
  else
    pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
    "${SUDO_CMD[@]}" rm -f "$DEPLOY_PATH/current"
  fi
  exit 1
fi

if [[ -n "$previous_target" && "$previous_target" != "releases/$RELEASE_ID" ]]; then
  atomic_symlink "$previous_target" "$DEPLOY_PATH/previous"
fi

pm2 save

if (( RELEASES_TO_KEEP > 0 )); then
  stale_list="$(mktemp)"
  release_times="$(mktemp)"
  for candidate in "$releases_path"/*; do
    [[ -d "$candidate" ]] || continue
    if modified="$(stat -c '%Y' "$candidate" 2>/dev/null)"; then
      :
    else
      modified="$(stat -f '%m' "$candidate")"
    fi
    printf '%s %s\n' "$modified" "$candidate" >>"$release_times"
  done
  sort -nr "$release_times" | tail -n "+$((RELEASES_TO_KEEP + 1))" | cut -d' ' -f2- >"$stale_list"
  while IFS= read -r stale_release; do
    [[ -n "$stale_release" ]] || continue
    if [[ "$stale_release" != "$DEPLOY_PATH/$previous_target" && "$stale_release" != "$release_path" ]]; then
      "${SUDO_CMD[@]}" rm -rf -- "$stale_release"
    fi
  done <"$stale_list"
  rm -f "$stale_list" "$release_times"
fi

trap - EXIT
rm -f "$metadata_file"
echo "Deployed $RELEASE_ID to $release_path"
