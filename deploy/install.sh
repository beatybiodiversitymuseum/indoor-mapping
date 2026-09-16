#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${SERVICE_CREATOR_DEPLOY_ROOT:?Controller must set SERVICE_CREATOR_DEPLOY_ROOT}"

reinstall=0
case "${1:-}" in
  "") ;;
  --reinstall) reinstall=1 ;;
  *) echo "Usage: $0 [--reinstall]" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo "Usage: $0 [--reinstall]" >&2; exit 2; }

LIFECYCLE_DIR="${SERVICE_CREATOR_DEPLOY_ROOT%/}/.service-creator"
INITIALIZED_MARKER="$LIFECYCLE_DIR/initialized"
if [[ -f "$INITIALIZED_MARKER" && "$reinstall" == 0 ]]; then
  exec "$SCRIPT_DIR/update.sh"
fi

mkdir -p "$LIFECYCLE_DIR"
SERVICE_CREATOR_DEFER_READINESS=1 "$SCRIPT_DIR/update.sh"
if [[ "$reinstall" == 1 ]]; then
  "$SCRIPT_DIR/initialize.sh" --reinstall
else
  "$SCRIPT_DIR/initialize.sh"
fi
touch "$INITIALIZED_MARKER"
"${SERVICE_CREATOR_DEPLOY_ROOT%/}/current/.service-creator/readiness"
echo "Initialization complete."
