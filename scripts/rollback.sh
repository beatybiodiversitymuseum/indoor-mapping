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

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/apps/indoor-mapping}"
PM2_APP_NAME="${PM2_APP_NAME:-indoor-mapping}"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-3001}"
TARGET_RELEASE="${1:-}"

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

current_target="$(readlink "$DEPLOY_PATH/current" 2>/dev/null || true)"
if [[ -z "$TARGET_RELEASE" ]]; then
  target_link="$(readlink "$DEPLOY_PATH/previous" 2>/dev/null || true)"
else
  [[ "$TARGET_RELEASE" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Error: invalid release ID" >&2; exit 1; }
  target_link="releases/$TARGET_RELEASE"
fi

if [[ -z "$target_link" || ! -f "$DEPLOY_PATH/$target_link/server.js" ]]; then
  echo "Error: rollback target is missing or incomplete." >&2
  exit 1
fi

atomic_symlink "$target_link" "$DEPLOY_PATH/current"

if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 delete "$PM2_APP_NAME"
fi
HOSTNAME="$APP_HOST" PORT="$APP_PORT" pm2 start "$DEPLOY_PATH/current/server.js" \
  --name "$PM2_APP_NAME" --cwd "$DEPLOY_PATH/current"

if ! "$SCRIPT_DIR/readiness.sh"; then
  echo "Error: rollback target failed readiness; restoring original release." >&2
  if [[ -n "$current_target" ]]; then
    atomic_symlink "$current_target" "$DEPLOY_PATH/current"
    pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
    HOSTNAME="$APP_HOST" PORT="$APP_PORT" pm2 start "$DEPLOY_PATH/current/server.js" \
      --name "$PM2_APP_NAME" --cwd "$DEPLOY_PATH/current"
  fi
  exit 1
fi

if [[ -n "$current_target" ]]; then
  atomic_symlink "$current_target" "$DEPLOY_PATH/previous"
fi
pm2 save
echo "Rolled back $PM2_APP_NAME to $target_link"
