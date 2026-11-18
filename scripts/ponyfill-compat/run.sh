#!/bin/sh
# Usage: run.sh <impl: none|experimental|stable> <outdir> [jest args / test paths...]
# Runs the given test files with the OSS experimental source config, through
# the ponyfill adapter unless impl is "none".
set -e
impl=$1; out=$2; shift 2
cd "$(dirname "$0")/../.."
case "$out" in /*) ;; *) echo "outdir must be absolute"; exit 1;; esac
mkdir -p "$out"
rm -f "$out/na.jsonl"
if [ "$impl" = "none" ]; then unset PONYFILL_IMPL; else export PONYFILL_IMPL=$impl; fi
rm -f "$out/results.json"
PONYFILL_RESULTS="$out/results.json" PONYFILL_NA_LOG="$out/na.jsonl" NODE_ENV=development RELEASE_CHANNEL=experimental \
  node ./scripts/jest/jest.js --config ./scripts/ponyfill-compat/jest.config.js \
  --ci "$@" > "$out/log.txt" 2>&1 || true
