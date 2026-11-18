#!/bin/bash
# Builds, verifies and times every suite in src/redux-suite/suites.mjs except
# derived-selectors-spike: the ported react-redux-benchmarks scenarios, the
# fairness controls, the typing controls and the sweeps. Run it on a quiet
# machine (plugged in, other apps closed).
#
#   ./run-all-quiet.sh                     build, verify, count, time
#   RESTARTS=5 ./run-all-quiet.sh          more restarts
#   LOAD_LIMIT=4 ./run-all-quiet.sh        wait for a 1-minute load average
#                                          <= 4 before each job, and re-run a
#                                          job if it went higher while it ran
#   DISCARD_LIMIT=28                       re-run only above this load instead
#                                          (default: LOAD_LIMIT)
#   REACT=react-builds/baseline (default)  React build to bundle against
#
# Each timing job is one restart of one suite. Restarts are interleaved across
# suites (restart 1 of every suite, then restart 2, ...) so a noisy period
# doesn't land on a single suite. Results go to results/smoke-q-<suite>-r<N>-*.json;
# combine them with: node summarize-runs.mjs q-<suite>
#
# Chrome: set BENCH_BROWSER=/path/to/chrome, and BENCH_SINGLE_PROCESS=1 where
# renderer processes can't be launched.

set -euo pipefail
cd "$(dirname "$0")"

REACT=${REACT:-react-builds/baseline}
RESTARTS=${RESTARTS:-3}
LOAD_LIMIT=${LOAD_LIMIT:-}
DISCARD_LIMIT=${DISCARD_LIMIT:-$LOAD_LIMIT}
TIMING="--throttle=1,4 --iterations=200 --warmup=50"

# suite | dist prefix | extra run.mjs flags for timing
SUITES=(
  "derived-selectors|dist-q-derived|$TIMING"
  "rapid-dispatch|dist-q-rapid|$TIMING"
  "many-components-same-slice|dist-q-mcss|--throttle=1,4 --iterations=100 --warmup=20"
  "deeptree-nested-hooks|dist-q-deeptree|$TIMING"
  "fairness|dist-q-fair|--n=1000 $TIMING"
  "typing|dist-q-typing|--typing --throttle=1,4"
  "sweeps|dist-q-sweeps|--n=1000 $TIMING"
)

load() { sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}' || cut -d' ' -f1 /proc/loadavg; }
over() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>b)}'; }

echo "== build"
for entry in "${SUITES[@]}"; do
  IFS='|' read -r suite dist _ <<<"$entry"
  node build.mjs --suite="$suite" --react="$REACT" --count --out="$dist-count"
  node build.mjs --suite="$suite" --react="$REACT" --out="$dist"
done

echo "== verify and count (jsdom)"
for entry in "${SUITES[@]}"; do
  IFS='|' read -r suite dist _ <<<"$entry"
  case "$suite" in
    typing) node run-jsdom.mjs --suite=typing --dist="$dist-count" --scenarios=entity,selection,structure ;;
    sweeps)
      # Rows with different widths render different DOM, so compare within a width.
      for w in 4 16; do
        node run-jsdom.mjs --suite=sweeps --dist="$dist-count" --n=1000 --variants=store-c100-w$w,redux-c100-w$w,zustand-c100-w$w
      done
      node run-jsdom.mjs --suite=sweeps --dist="$dist-count" --n=1000 \
        --variants="$(for l in store redux zustand; do for c in 100 90 75 50; do printf "%s-c%s-w8," $l $c; done; done | sed 's/,$//')"
      ;;
    *) node run-jsdom.mjs --suite="$suite" --dist="$dist-count" ;;
  esac
done

echo "== verify (Chrome)"
for entry in "${SUITES[@]}"; do
  IFS='|' read -r suite dist _ <<<"$entry"
  case "$suite" in
    # typing has no update scenarios, and sweeps differ by width (checked above).
    typing | sweeps) ;;
    *) node run.mjs --verify --suite="$suite" --dist="$dist-count" ;;
  esac
done

echo "== timing"
for r in $(seq 1 "$RESTARTS"); do
  for entry in "${SUITES[@]}"; do
    IFS='|' read -r suite dist flags <<<"$entry"
    label="q-$suite-r$r"
    for attempt in 1 2 3 4 5; do
      if [ -n "$LOAD_LIMIT" ]; then
        while over "$(load)" "$LOAD_LIMIT"; do echo "waiting: load $(load)"; sleep 60; done
      fi
      start_load=$(load)
      # shellcheck disable=SC2086
      node run.mjs --smoke --suite="$suite" --dist="$dist" --restarts=1 --label="$label" $flags
      end_load=$(load)
      if [ -n "$LOAD_LIMIT" ] && over "$end_load" "$DISCARD_LIMIT"; then
        echo "load $end_load after $label (was $start_load), re-running"
        latest=$(ls -t results/smoke-$label-*.json | head -1)
        mv "$latest" "${latest%.json}.discarded.json"
        continue
      fi
      break
    done
  done
done

echo "== summary"
for entry in "${SUITES[@]}"; do
  IFS='|' read -r suite _ _ <<<"$entry"
  node summarize-runs.mjs "q-$suite"
done
