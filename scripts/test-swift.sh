#!/bin/bash
# Run Swift unit tests (excludes E2E tests that need servers).
#
# Usage: bash scripts/test-swift.sh
#
# If the build server (scripts/build-server.js) is running on port 6002,
# xcodebuild is delegated to it to avoid Claude sandbox restrictions.

set -euo pipefail

BUILD_SERVER_PORT=6002

cd "$(dirname "$0")/.."

echo "[test-swift] Running Swift unit tests..."

# Check if the build server is running (avoids sandbox-exec issues)
if curl -sf "http://localhost:$BUILD_SERVER_PORT/healthz" > /dev/null 2>&1; then
  echo "[test-swift] Build server detected, delegating xcodebuild..."
  RESPONSE=$(curl -sf -X POST "http://localhost:$BUILD_SERVER_PORT/run" \
    -H 'Content-Type: application/json' \
    -d '{"operation":"test-swift"}')

  EXIT_CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code', 1))" 2>/dev/null || echo 1)
  STDOUT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stdout', ''))" 2>/dev/null || echo "")
  STDERR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stderr', ''))" 2>/dev/null || echo "")

  echo "$STDOUT"
  if [ -n "$STDERR" ]; then
    echo "$STDERR" >&2
  fi
else
  # Run xcodebuild directly (works outside Claude sandbox)
  cd packages/react-dom-native/ios

  xcodebuild test \
    -scheme ReactDomNativeKit-Package \
    -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
    -skipPackagePluginValidation \
    -skip-testing:ReactDomNativeTests/EndToEndSSRTests \
    -skip-testing:ReactDomNativeTests/EndToEndCSRTests \
    2>&1

  EXIT_CODE=$?
fi

echo "[test-swift] Tests finished with exit code $EXIT_CODE"
exit $EXIT_CODE
