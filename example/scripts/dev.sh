#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

# Run initial webpack build (must complete before servers start —
# the Flight server reads react-client-manifest.json from build/)
echo "Running webpack build..."
cd "$EXAMPLE_ROOT"
node scripts/build.js
echo "Webpack build complete."

# Start webpack in watch mode for rebuilds on file changes
echo "Starting webpack watcher..."
node scripts/build.js --watch &
WEBPACK_PID=$!
cd "$EXAMPLE_ROOT"

# Start Flight server (RSC) — runs with react-server condition
echo "Starting Flight server (RSC)..."
cd "$EXAMPLE_ROOT/server"
node --conditions react-server server.js &
RSC_PID=$!
cd "$EXAMPLE_ROOT"

# Start SSR server (Fizz) — runs WITHOUT react-server condition
echo "Starting SSR server (Fizz)..."
cd "$EXAMPLE_ROOT/server"
node ssr-server.js &
SSR_PID=$!
cd "$EXAMPLE_ROOT"

# Start CDP inspector proxy for Chrome DevTools Performance profiling
echo "Starting CDP inspector proxy..."
node "$SCRIPT_DIR/start-inspector.js" &
INSPECTOR_PID=$!

# Cleanup on exit — only kill PIDs that are still alive and belong to us
cleanup() {
  echo "Shutting down..."
  kill $WEBPACK_PID 2>/dev/null || true
  kill $RSC_PID 2>/dev/null || true
  kill $SSR_PID 2>/dev/null || true
  kill $INSPECTOR_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for servers to be ready (or detect they were already running)
wait_for_server() {
  local port=$1
  local name=$2
  local endpoint=$3
  for i in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:${port}${endpoint}" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  echo "ERROR: ${name} on port ${port} failed to start"
  return 1
}

wait_for_server 6000 "Flight server" "/bundle-version" || exit 1
wait_for_server 6001 "SSR server" "/healthz" || exit 1
wait_for_server 8976 "CDP inspector proxy" "/json/version" || exit 1

# Grab the DevTools URL from the inspector proxy
DEVTOOLS_URL=$(curl -s http://localhost:8976/json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)[0].devtoolsFrontendUrl))" 2>/dev/null)

echo ""
echo "Development servers running:"
echo "  Flight server (RSC): PID $RSC_PID (http://localhost:6000)"
echo "  SSR server (Fizz):   PID $SSR_PID (http://localhost:6001)"
echo "  CDP inspector proxy: PID $INSPECTOR_PID (http://localhost:8976)"
echo "  Bundle URL: http://localhost:6000/bundle.js (webpack, watching for changes)"
echo ""
echo "Chrome DevTools:"
echo "  $DEVTOOLS_URL"
echo ""
echo "Press Ctrl+C to stop."

wait
