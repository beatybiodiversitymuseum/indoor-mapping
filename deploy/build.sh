#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

: "${SERVICE_CREATOR_INGRESS_PATH:?Controller must set SERVICE_CREATOR_INGRESS_PATH}"
APP_BASE_PATH="$SERVICE_CREATOR_INGRESS_PATH"
[[ "$APP_BASE_PATH" == / ]] && APP_BASE_PATH=""
export APP_BASE_PATH
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
