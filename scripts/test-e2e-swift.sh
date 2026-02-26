#!/bin/bash
# Start servers on test ports, run Swift E2E tests, then clean up.
#
# Usage: bash scripts/test-e2e-swift.sh
#
# This script:
# 1. Builds the webpack bundle (if needed)
# 2. Starts the Flight server on port 7100
# 3. Starts the SSR server on port 7101 (pointing at the Flight server)
# 4. Runs only the EndToEndSSRTests + EndToEndCSRTests Swift test suites
# 5. Kills both servers on exit (including on error/signal)
#
# If the build server (scripts/build-server.js) is running on port 6002,
# xcodebuild is delegated to it to avoid Claude sandbox restrictions.

set -euo pipefail

FLIGHT_PORT=7100
SSR_PORT=7101
BUILD_SERVER_PORT=6002
FLIGHT_PID=""
SSR_PID=""

cleanup() {
  echo "[test-e2e-swift] Cleaning up..."
  if [ -n "$SSR_PID" ]; then
    kill "$SSR_PID" 2>/dev/null || true
  fi
  if [ -n "$FLIGHT_PID" ]; then
    kill "$FLIGHT_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "$(dirname "$0")/.."

# Build webpack bundle if needed
echo "[test-e2e-swift] Building webpack bundle..."
cd example && npm run build 2>/dev/null || true
cd ..

# Start Flight server
echo "[test-e2e-swift] Starting Flight server on port $FLIGHT_PORT..."
PORT=$FLIGHT_PORT node --conditions react-server example/server/server.js &
FLIGHT_PID=$!

# Wait for Flight server health
echo "[test-e2e-swift] Waiting for Flight server..."
RETRIES=0
until curl -sf "http://localhost:$FLIGHT_PORT/bundle-version" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -gt 50 ]; then
    echo "[test-e2e-swift] ERROR: Flight server failed to start after 10s"
    exit 1
  fi
  sleep 0.2
done
echo "[test-e2e-swift] Flight server ready"

# Start SSR server
echo "[test-e2e-swift] Starting SSR server on port $SSR_PORT..."
PORT=$SSR_PORT FLIGHT_SERVER="http://localhost:$FLIGHT_PORT" node example/server/ssr-server.js &
SSR_PID=$!

# Wait for SSR server health
echo "[test-e2e-swift] Waiting for SSR server..."
RETRIES=0
until curl -sf "http://localhost:$SSR_PORT/healthz" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -gt 50 ]; then
    echo "[test-e2e-swift] ERROR: SSR server failed to start after 10s"
    exit 1
  fi
  sleep 0.2
done
echo "[test-e2e-swift] SSR server ready"

# Run Swift E2E tests
echo "[test-e2e-swift] Running EndToEndSSRTests + EndToEndCSRTests..."

# Check if the build server is running (avoids sandbox-exec issues)
if curl -sf "http://localhost:$BUILD_SERVER_PORT/healthz" > /dev/null 2>&1; then
  echo "[test-e2e-swift] Build server detected, delegating xcodebuild..."
  RESPONSE=$(curl -sf -X POST "http://localhost:$BUILD_SERVER_PORT/run" \
    -H 'Content-Type: application/json' \
    -d '{"operation":"test-e2e-swift"}')

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
    -only-testing:ReactDomNativeTests/EndToEndSSRTests \
    -only-testing:ReactDomNativeTests/EndToEndCSRTests \
    2>&1

  EXIT_CODE=$?
fi

echo "[test-e2e-swift] Tests finished with exit code $EXIT_CODE"
exit $EXIT_CODE
