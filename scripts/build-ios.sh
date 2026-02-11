#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building iOS app..."

# Build JS bundle first
"$SCRIPT_DIR/build-js.sh"

# Build Swift package
cd "$PROJECT_ROOT/ios"
swift build -c release

echo "iOS build complete."
