#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building and running iOS app..."

# Build JS bundle first
"$SCRIPT_DIR/build-js.sh"

# Build and run
cd "$PROJECT_ROOT/ios"
swift run

echo "Done."
