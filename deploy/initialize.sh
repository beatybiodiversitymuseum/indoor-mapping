#!/usr/bin/env bash

set -euo pipefail

case "${1:-}" in
  ""|--reinstall) ;;
  *) echo "Usage: $0 [--reinstall]" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo "Usage: $0 [--reinstall]" >&2; exit 2; }

: "${SERVICE_CREATOR_DEPLOY_ROOT:?Controller must set SERVICE_CREATOR_DEPLOY_ROOT}"
: "${SERVICE_CREATOR_ENV_FILE:?Controller must set SERVICE_CREATOR_ENV_FILE}"
[[ -f "$SERVICE_CREATOR_ENV_FILE" ]] || { echo "Missing controller environment" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$SERVICE_CREATOR_ENV_FILE"
set +a
USAGE_DB_PATH="${USAGE_DB_PATH:-${SERVICE_CREATOR_DEPLOY_ROOT%/}/data/usage.sqlite3}"
mkdir -p "$(dirname "$USAGE_DB_PATH")"
echo "Persistent usage storage is ready at $USAGE_DB_PATH."
