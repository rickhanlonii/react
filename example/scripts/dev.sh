#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

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

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  kill $RSC_PID 2>/dev/null || true
  kill $SSR_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Development servers running:"
echo "  Flight server (RSC): PID $RSC_PID (http://localhost:6000)"
echo "  SSR server (Fizz):   PID $SSR_PID (http://localhost:6001)"
echo "  Bundle URL: http://localhost:6000/bundle.js (built on-the-fly)"
echo ""
echo "Press Ctrl+C to stop."

wait
