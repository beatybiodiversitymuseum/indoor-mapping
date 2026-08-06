#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "Error: $ROOT is not a Git repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: refusing to update a dirty Git checkout." >&2
  git status --short >&2
  exit 1
fi

git pull --ff-only
npm ci
exec "$SCRIPT_DIR/deploy.sh" --non-interactive
