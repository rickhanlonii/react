#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

# Kill any existing dev servers on our ports
for port in 6000 6001; do
  pid=$(lsof -ti tcp:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing existing process on port $port (PID $pid)..."
    kill $pid 2>/dev/null || true
    # Wait briefly for the port to free up
    sleep 0.5
  fi
done

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

# Start SSR server (Fizz + dev WS + CDP inspector)
echo "Starting SSR server (Fizz + dev tools)..."
cd "$EXAMPLE_ROOT/server"
node ssr-server.js &
SSR_PID=$!
cd "$EXAMPLE_ROOT"

# Cleanup on exit — only kill PIDs that are still alive and belong to us
cleanup() {
  echo "Shutting down..."
  kill $WEBPACK_PID 2>/dev/null || true
  kill $RSC_PID 2>/dev/null || true
  kill $SSR_PID 2>/dev/null || true
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

# DevTools URL is dynamic now (shown when an app connects and identifies itself)
echo ""
echo "Development servers running:"
echo "  Flight server (RSC):              PID $RSC_PID (http://localhost:6000)"
echo "  SSR server (Fizz + dev + CDP):    PID $SSR_PID (http://localhost:6001)"
echo "  Bundle URL: http://localhost:6000/bundle.js (webpack, watching for changes)"
echo ""
echo "Chrome DevTools:"
echo "  curl -s http://localhost:6001/json  (shows connected targets)"
echo ""
echo "Press Ctrl+C to stop."

wait
