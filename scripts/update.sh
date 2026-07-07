#!/usr/bin/env bash
# Pull the latest code, then build and deploy.
# Run: npm run update

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$PROJECT_DIR"

cd "$REPO_ROOT"

if [[ ! -d .git ]]; then
  echo "Error: $REPO_ROOT is not a Git repository." >&2
  exit 1
fi

echo "Pulling latest code..."
git pull --ff-only

echo "Deploying..."
exec "$SCRIPT_DIR/deploy.sh"
