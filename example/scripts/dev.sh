#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

# Start RSC server
echo "Starting RSC server..."
cd "$EXAMPLE_ROOT/server"
node --conditions react-server server.js &
RSC_PID=$!
cd "$EXAMPLE_ROOT"

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  kill $RSC_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Development server running:"
echo "  RSC server: PID $RSC_PID (http://localhost:6000)"
echo "  Bundle URL: http://localhost:6000/bundle.js (built on-the-fly)"
echo ""
echo "Press Ctrl+C to stop."

wait
