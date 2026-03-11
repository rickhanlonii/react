#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building JS bundle..."
node "$PROJECT_ROOT/fixtures/example/scripts/build.js" "$@"
