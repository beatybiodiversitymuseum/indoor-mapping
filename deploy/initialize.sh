#!/usr/bin/env bash

set -euo pipefail

case "${1:-}" in
  ""|--reinstall) ;;
  *) echo "Usage: $0 [--reinstall]" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo "Usage: $0 [--reinstall]" >&2; exit 2; }

# This frontend owns no durable state. Applications that do must replace this
# no-op with bounded, repeatable state creation. Never delete existing state
# unless --reinstall explicitly defines that repository's reviewed behavior.
echo "No stateful frontend initialization is required."
