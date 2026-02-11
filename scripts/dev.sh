#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Start JS bundle watcher in background
echo "Starting JS bundle watcher..."
node "$SCRIPT_DIR/build-js.js" --watch &
JS_PID=$!

# Start Next.js dev server
echo "Starting Next.js dev server..."
cd "$PROJECT_ROOT/server"
npm run dev &
NEXT_PID=$!

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  kill $JS_PID 2>/dev/null || true
  kill $NEXT_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Development servers running:"
echo "  JS watcher: PID $JS_PID"
echo "  Next.js:    PID $NEXT_PID (http://localhost:3000)"
echo ""
echo "Press Ctrl+C to stop."

wait
