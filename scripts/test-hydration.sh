#!/bin/bash
# Check for hydration errors by relaunching the app with log capture.
# The app auto-navigates to the last viewed fixture on launch.
#
# Prerequisites: build server running, app installed, dev server running
#
# Usage:
#   bash scripts/test-hydration.sh          # relaunch app + check logs
#   bash scripts/test-hydration.sh --quick  # just read existing logs (no relaunch)

set -e

check_logs() {
  LOGS=$(npm run app:log-read 2>&1)
  echo "$LOGS" | grep -iE "hydration|mismatch|Recoverable|reveal|commit|debug" || true
  echo ""
  if echo "$LOGS" | grep -qiE "Hydration failed|hydration mismatch"; then
    echo "❌ HYDRATION MISMATCH DETECTED"
    exit 1
  else
    echo "✅ No hydration errors found"
    exit 0
  fi
}

if [ "$1" = "--quick" ]; then
  check_logs
fi

npm run app:log-start
sleep 3
check_logs
