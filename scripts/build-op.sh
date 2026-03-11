#!/bin/bash
# Run a build server operation with fallback to direct xcode commands.
#
# Usage: bash scripts/build-op.sh <operation> [target] [args...]
#
# If the build server (port 6002) is running, delegates to it.
# Otherwise, runs the equivalent xcode command directly.
#
# Operations: run, clean, test, screenshot, terminate, list, open,
#              resolve-packages, test-swift, test-e2e-swift,
#              tap, swipe, gesture, type-text, long-press, touch, button,
#              key-press, key-sequence, snapshot-ui,
#              debug-attach, debug-detach, debug-lldb, debug-stack, debug-variables
# Targets: demo (default), e2e, standalone

set -euo pipefail

OPERATION="${1:-}"
# If $2 is a flag, default to demo
if [ -n "${2:-}" ] && [ "${2:0:2}" != "--" ]; then
  TARGET="$2"
else
  TARGET="demo"
fi
BUILD_SERVER_PORT=6002
FILTER=""

# Extract --filter flag from any position in args
NEXT_IS_FILTER=""
for arg in "$@"; do
  if [ -n "$NEXT_IS_FILTER" ]; then
    FILTER="$arg"
    NEXT_IS_FILTER=""
  elif [ "$arg" = "--filter" ]; then
    NEXT_IS_FILTER=1
  fi
done

if [ -z "$OPERATION" ]; then
  echo "Usage: bash scripts/build-op.sh <operation> [target] [args...]"
  echo "Operations: run, clean, test, screenshot, terminate, list, open, resolve-packages,"
  echo "            test-swift, test-e2e-swift, tap, swipe, gesture, type-text, long-press,"
  echo "            touch, button, key-press, key-sequence, snapshot-ui,"
  echo "            debug-attach, debug-detach, debug-lldb, debug-stack, debug-variables"
  echo "Targets: demo, e2e, standalone"
  exit 1
fi

cd "$(dirname "$0")/.."

AXE_PATH="$(cd "$(dirname "$0")/.."; pwd)/node_modules/xcodebuildmcp/bundled/axe"

# Target configs (must match build-server.js)
case "$TARGET" in
  demo)
    PROJECT_PATH="fixtures/example/Falcon/Falcon.xcodeproj"
    SCHEME="Falcon"
    SIMULATOR_ID="61F83D8B-36DF-474F-9AAD-61DC6D60FFED"
    BUNDLE_ID="com.react.Falcon"
    SCREENSHOT_PATH="/tmp/falcon-screenshot.png"
    ;;
  e2e)
    PROJECT_PATH="fixtures/layout/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj"
    SCHEME="LayoutCompare"
    SIMULATOR_ID="50E9E48E-D7F7-4338-9873-3EB801137EE7"
    BUNDLE_ID="com.react.LayoutCompare"
    SCREENSHOT_PATH="/tmp/e2e-screenshot.png"
    ;;
  standalone)
    PROJECT_PATH="fixtures/Demo/Demo.xcodeproj"
    SCHEME="Demo"
    SIMULATOR_ID="079D4CB9-AD9A-4F2A-B8D9-86315BDDEAA4"
    BUNDLE_ID="com.react.Demo"
    SCREENSHOT_PATH="/tmp/standalone-screenshot.png"
    ;;
  *)
    echo "[build-op] Unknown target: $TARGET (use 'demo', 'e2e', or 'standalone')"
    exit 1
    ;;
esac

# --- test-e2e-swift: start Flight + SSR servers, run tests, clean up ---
if [ "$OPERATION" = "test-e2e-swift" ]; then
  FLIGHT_PORT=7100
  SSR_PORT=7101
  FLIGHT_PID=""
  SSR_PID=""

  cleanup() {
    echo "[test-e2e-swift] Cleaning up..."
    [ -n "$SSR_PID" ] && kill "$SSR_PID" 2>/dev/null || true
    [ -n "$FLIGHT_PID" ] && kill "$FLIGHT_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  # Build webpack bundle if needed
  echo "[test-e2e-swift] Building webpack bundle..."
  cd fixtures/example && npm run build 2>/dev/null || true
  cd ..

  # Start Flight server
  echo "[test-e2e-swift] Starting Flight server on port $FLIGHT_PORT..."
  PORT=$FLIGHT_PORT node --conditions react-server fixtures/example/server/server.js &
  FLIGHT_PID=$!

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
  PORT=$SSR_PORT FLIGHT_SERVER="http://localhost:$FLIGHT_PORT" node fixtures/example/server/ssr-server.js &
  SSR_PID=$!

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

  echo "[test-e2e-swift] Running EndToEndSSRTests + EndToEndCSRTests..."
  # Fall through to the build server / fallback logic below
fi

# --- Build server delegation ---
# UI automation and debug ops need JSON body; build with args from $3+
build_json_body() {
  case "$OPERATION" in
    tap)
      if [ -n "${3:-}" ] && [[ "$3" == id:* ]]; then
        echo "{\"id\":\"${3#id:}\"}"
      elif [ -n "${3:-}" ]; then
        echo "{\"label\":\"$3\"}"
      fi
      ;;
    swipe) echo "{\"x1\":$3,\"y1\":$4,\"x2\":$5,\"y2\":$6}" ;;
    gesture) echo "{\"preset\":\"$3\"}" ;;
    type-text) echo "{\"text\":\"$3\"}" ;;
    long-press) echo "{\"x\":$3,\"y\":$4,\"duration\":$5}" ;;
    touch) echo "{\"x\":$3,\"y\":$4,\"down\":${5:-true},\"up\":${6:-true}}" ;;
    button) echo "{\"type\":\"$3\"}" ;;
    key-press) echo "{\"keyCode\":$3}" ;;
    key-sequence) echo "{\"keyCodes\":[$3]}" ;;
    debug-lldb) echo "{\"command\":\"$3\"}" ;;
    debug-breakpoint-add)
      if [ -n "${4:-}" ]; then
        echo "{\"file\":\"$3\",\"line\":$4}"
      else
        echo "{\"function\":\"$3\"}"
      fi
      ;;
    debug-breakpoint-remove) echo "{\"breakpointId\":$3}" ;;
    *) echo "" ;;
  esac
}

JSON_BODY=$(build_json_body "$@")

# Build URL with optional filter
BS_URL="http://localhost:$BUILD_SERVER_PORT/$OPERATION/$TARGET"
if [ -n "$FILTER" ]; then
  BS_URL="${BS_URL}?=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILTER'))")"
fi

if curl -sf "http://localhost:$BUILD_SERVER_PORT/healthz" > /dev/null 2>&1; then
  echo "[$OPERATION/$TARGET] Build server detected, delegating..."

  if [ -n "$JSON_BODY" ]; then
    RESPONSE=$(curl -sf -X POST "$BS_URL" \
      -H 'Content-Type: application/json' -d "$JSON_BODY")
  else
    RESPONSE=$(curl -sf -X POST "$BS_URL")
  fi

  EXIT_CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; c=json.load(sys.stdin).get('code',1); print(0 if c is None else int(c))" 2>/dev/null || echo 1)
  STDOUT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stdout', ''))" 2>/dev/null || echo "")
  STDERR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stderr', ''))" 2>/dev/null || echo "")

  # Apply filter to stdout if provided
  if [ -n "$FILTER" ]; then
    STDOUT=$(echo "$STDOUT" | grep -i "$FILTER" || true)
  fi

  echo "$STDOUT"
  if [ -n "$STDERR" ]; then
    echo "$STDERR" >&2
  fi

  echo "[$OPERATION/$TARGET] Finished with exit code $EXIT_CODE"
  exit "$EXIT_CODE"
fi

# --- Fallback: run commands directly ---
echo "[$OPERATION/$TARGET] No build server, running directly..."

case "$OPERATION" in
  run)
    xcodebuild -project "$PROJECT_PATH" -scheme "$SCHEME" \
      -destination "id=$SIMULATOR_ID" build 2>&1
    xcrun simctl install "$SIMULATOR_ID" \
      "$(xcodebuild -project "$PROJECT_PATH" -scheme "$SCHEME" \
        -destination "id=$SIMULATOR_ID" -showBuildSettings 2>/dev/null \
        | grep -m1 'BUILT_PRODUCTS_DIR' | sed 's/.*= //')/$(xcodebuild \
        -project "$PROJECT_PATH" -scheme "$SCHEME" \
        -destination "id=$SIMULATOR_ID" -showBuildSettings 2>/dev/null \
        | grep -m1 'FULL_PRODUCT_NAME' | sed 's/.*= //')"
    xcrun simctl launch "$SIMULATOR_ID" "$BUNDLE_ID"
    ;;
  clean)
    xcodebuild -project "$PROJECT_PATH" -scheme "$SCHEME" \
      -destination "id=$SIMULATOR_ID" clean 2>&1
    ;;
  test)
    xcodebuild -project "$PROJECT_PATH" -scheme "$SCHEME" \
      -destination "id=$SIMULATOR_ID" test 2>&1
    ;;
  screenshot)
    xcrun simctl io "$SIMULATOR_ID" screenshot "$SCREENSHOT_PATH" 2>&1
    echo "Screenshot saved to $SCREENSHOT_PATH"
    ;;
  terminate)
    xcrun simctl terminate "$SIMULATOR_ID" "$BUNDLE_ID" 2>&1
    ;;
  list)
    xcrun simctl list devices -j 2>&1
    ;;
  open)
    open -a Simulator
    ;;
  resolve-packages)
    xcodebuild -resolvePackageDependencies -project "$PROJECT_PATH" \
      -scheme "$SCHEME" 2>&1
    ;;
  test-swift)
    cd packages/react-dom-native/ios
    xcodebuild test \
      -scheme ReactDomNativeKit-Package \
      -destination "id=$SIMULATOR_ID" \
      -skipPackagePluginValidation \
      -skip-testing:ReactDomNativeTests/EndToEndSSRTests \
      -skip-testing:ReactDomNativeTests/EndToEndCSRTests \
      2>&1
    ;;
  test-e2e-swift)
    cd packages/react-dom-native/ios
    xcodebuild test \
      -scheme ReactDomNativeKit-Package \
      -destination "id=$SIMULATOR_ID" \
      -skipPackagePluginValidation \
      -only-testing:ReactDomNativeTests/EndToEndSSRTests \
      -only-testing:ReactDomNativeTests/EndToEndCSRTests \
      2>&1
    ;;
  # UI automation — direct axe fallback
  tap)
    if [ -n "${3:-}" ] && [[ "$3" == id:* ]]; then
      "$AXE_PATH" tap --id "${3#id:}" --udid "$SIMULATOR_ID"
    elif [ -n "${3:-}" ]; then
      "$AXE_PATH" tap --label "$3" --udid "$SIMULATOR_ID"
    else
      echo "Usage: build-op.sh tap [target] <id:elementId>  or  build-op.sh tap [target] <label>"
      exit 1
    fi
    ;;
  swipe)
    "$AXE_PATH" swipe --start-x "$3" --start-y "$4" --end-x "$5" --end-y "$6" --udid "$SIMULATOR_ID"
    ;;
  gesture)
    "$AXE_PATH" gesture "$3" --udid "$SIMULATOR_ID"
    ;;
  type-text)
    "$AXE_PATH" type "$3" --udid "$SIMULATOR_ID"
    ;;
  long-press)
    DELAY=$(python3 -c "print(${5:-1000}/1000)")
    "$AXE_PATH" touch -x "$3" -y "$4" --down --up --delay "$DELAY" --udid "$SIMULATOR_ID"
    ;;
  touch)
    TOUCH_ARGS=(-x "$3" -y "$4")
    [ "${5:-}" = "true" ] && TOUCH_ARGS+=(--down)
    [ "${6:-}" = "true" ] && TOUCH_ARGS+=(--up)
    "$AXE_PATH" touch "${TOUCH_ARGS[@]}" --udid "$SIMULATOR_ID"
    ;;
  button)
    "$AXE_PATH" button "$3" --udid "$SIMULATOR_ID"
    ;;
  key-press)
    "$AXE_PATH" key "$3" --udid "$SIMULATOR_ID"
    ;;
  key-sequence)
    "$AXE_PATH" key-sequence --keycodes "$3" --udid "$SIMULATOR_ID"
    ;;
  snapshot-ui)
    "$AXE_PATH" describe-ui --udid "$SIMULATOR_ID"
    ;;
  # Debug operations — require build server
  debug-attach|debug-detach|debug-lldb|debug-stack|debug-variables|debug-breakpoint-add|debug-breakpoint-remove|debug-continue)
    echo "[$OPERATION] Error: Debug operations require the build server (LLDB needs persistent process state)."
    echo "Start it with: npm run build-server"
    exit 1
    ;;
  *)
    echo "[$OPERATION/$TARGET] Unknown operation: $OPERATION"
    echo "Available: run, clean, test, screenshot, terminate, list, open, resolve-packages,"
    echo "           test-swift, test-e2e-swift, tap, swipe, gesture, type-text, long-press,"
    echo "           touch, button, key-press, key-sequence, snapshot-ui,"
    echo "           debug-attach, debug-detach, debug-lldb, debug-stack, debug-variables"
    exit 1
    ;;
esac

echo "[$OPERATION/$TARGET] Done"
