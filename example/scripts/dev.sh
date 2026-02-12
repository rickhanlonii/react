#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

# Start JS bundle watcher in background
echo "Starting JS bundle watcher..."
node "$SCRIPT_DIR/build.js" --watch &
JS_PID=$!

# Start RSC server
echo "Starting RSC server..."
cd "$EXAMPLE_ROOT/server"
node --conditions react-server server.js &
RSC_PID=$!
cd "$EXAMPLE_ROOT"

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  kill $JS_PID 2>/dev/null || true
  kill $RSC_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Development servers running:"
echo "  JS watcher: PID $JS_PID (rebuilds on file changes)"
echo "  RSC server: PID $RSC_PID (http://localhost:3001)"
echo "  Bundle URL: http://localhost:3001/bundle.js"
echo ""
echo "Press Ctrl+C to stop."

wait
