#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
SWIFT_DIR="$SCRIPT_DIR/../packages/fantom/swift"
BINARY="$SWIFT_DIR/.build/release/FantomTester"

# Also check ShadowTree sources since FantomTester links them
SHADOW_TREE_DIR="$SCRIPT_DIR/../packages/react-dom-native/ios/Sources/ShadowTree"

# Check if rebuild is needed (binary missing or Swift sources newer)
needs_rebuild() {
  if [ ! -f "$BINARY" ]; then
    return 0
  fi

  # Check fantom Swift sources
  if find "$SWIFT_DIR/Sources" -name '*.swift' -newer "$BINARY" 2>/dev/null | grep -q .; then
    return 0
  fi

  # Check ShadowTree sources (linked into FantomTester)
  if find "$SHADOW_TREE_DIR" -name '*.swift' -newer "$BINARY" 2>/dev/null | grep -q .; then
    return 0
  fi

  return 1
}

if [ "${1:-}" = "--if-needed" ]; then
  if needs_rebuild; then
    echo "Swift sources changed — rebuilding FantomTester..."
  else
    echo "FantomTester is up to date."
    exit 0
  fi
else
  echo "Building FantomTester for macOS..."
fi

cd "$SWIFT_DIR"
swift build -c release --product FantomTester --disable-sandbox

echo "FantomTester built at: packages/fantom/swift/.build/release/FantomTester"
