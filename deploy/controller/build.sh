#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT"

DEFAULTS_FILE="$SCRIPT_DIR/../defaults.env"
[[ -f "$DEFAULTS_FILE" ]] || { echo "Missing repository defaults" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$DEFAULTS_FILE"
set +a
export APP_BASE_PATH="${APP_BASE_PATH-}"
npm ci
npm run build

ARTIFACT="$ROOT/.deploy-artifact"
TEMP_ARTIFACT="$ROOT/.deploy-artifact.new.$$"
cleanup() { rm -rf -- "$TEMP_ARTIFACT"; }
trap cleanup EXIT
mkdir -p "$TEMP_ARTIFACT/.next/static"
rsync -a --delete "$ROOT/.next/standalone/" "$TEMP_ARTIFACT/"
rsync -a --delete "$ROOT/.next/static/" "$TEMP_ARTIFACT/.next/static/"
if [[ -d "$ROOT/public" ]]; then
  mkdir -p "$TEMP_ARTIFACT/public"
  rsync -a --delete "$ROOT/public/" "$TEMP_ARTIFACT/public/"
fi
find "$TEMP_ARTIFACT" -type f -name '.env*' -delete
rm -rf -- "$ARTIFACT"
mv "$TEMP_ARTIFACT" "$ARTIFACT"
trap - EXIT
