#!/bin/bash
# Re-runs every benchmark the use(store) reports cite, on one frozen React
# build, as small gated units that can be resumed. Results carry the build
# (env.react, env.compiler) and the load before and after (env.loadStart/End).
#
#   ./run-report-matrix.sh                 build, verify, count, time
#   REACT=react-builds/head (default)      frozen build (needs BUILD.json)
#   TAG=head (default)                     prefix for dists and result labels
#   RESTARTS=3                             restarts per unit
#   LOAD_LIMIT=4                           wait for a 1-minute load <= this
#                                          before each unit
#   DISCARD_LIMIT=6                        re-run a unit if the load ended
#                                          above this (up to MAX_ATTEMPTS)
#   SKIP_BUILD=1 SKIP_VERIFY=1             resume straight into timing
#   MATRIX=nobailout                       the same-element-bailout-off subset:
#                                          REACT=react-builds/head-nobailout and
#                                          TAG=headnb by default; main scenarios
#                                          for store/redux/zustand/zustand-granular
#                                          (compiler on, N=1k,10k) plus the sweeps
#
# Units, per restart (the order is reversed on even restarts, because typing
# latency is sensitive to what ran before it):
#   main      6 scenarios x 1x/4x CPU (all variants, compiler on and off),
#             then typing and memory   results/full-$TAG-r<R>-<what>-*.json
#   suites    the four ported Redux suites, fairness, typing and the sweeps
#             (with store-keyed)       results/smoke-$TAG-q-<suite>-r<R>-*.json
#   spike     4 scenario families (K=5/20/50) x 1x/4x CPU, compiler on
#                                      results/smoke-$TAG-spike-r<R>-<family>-x<T>-*.json
# A unit is done when its result file exists, so re-running the script resumes.
# Over-limit attempts are renamed *.discarded.json. Log: results/$TAG-units.log.

set -euo pipefail
cd "$(dirname "$0")"

MATRIX=${MATRIX:-full}
if [ "$MATRIX" = nobailout ]; then
  REACT=${REACT:-react-builds/head-nobailout}
  TAG=${TAG:-headnb}
else
  REACT=${REACT:-react-builds/head}
  TAG=${TAG:-head}
fi
RESTARTS=${RESTARTS:-3}
LOAD_LIMIT=${LOAD_LIMIT:-4}
DISCARD_LIMIT=${DISCARD_LIMIT:-6}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-5}
export BENCH_BROWSER=${BENCH_BROWSER:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell}
export BENCH_SINGLE_PROCESS=${BENCH_SINGLE_PROCESS:-1}
LOG=results/$TAG-units.log
TIMING="--throttle=1,4 --iterations=200 --warmup=50"

[ -f "$REACT/BUILD.json" ] || { echo "$REACT has no BUILD.json; freeze it first"; exit 1; }
mkdir -p results

# suite | extra run.mjs flags for timing (as in run-all-quiet.sh)
SUITES=(
  "derived-selectors|$TIMING"
  "rapid-dispatch|$TIMING"
  "many-components-same-slice|--throttle=1,4 --iterations=100 --warmup=20"
  "deeptree-nested-hooks|$TIMING"
  "fairness|--n=1000 $TIMING"
  "typing|--typing --throttle=1,4"
  "sweeps|--n=1000 $TIMING"
)
if [ "$MATRIX" = nobailout ]; then
  SUITES=("sweeps|--n=1000 $TIMING")
  MAIN_FILTER="--variants=store,redux,zustand,zustand-granular --compiler=on --n=1000,10000"
else
  MAIN_FILTER=""
fi
SCENARIOS=(entity selection filter details-inline details-component structure)
SPIKE_FAMILIES=(mixed score comment role)

load() { sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}' || cut -d' ' -f1 /proc/loadavg; }
over() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>b)}'; }
# Other heavy work: jest, React builds, and any Playwright or headless Chrome
# (e.g. doc gates). Checked between units, when this script has no children.
HEAVY='jest-worker|jest-cli|scripts/rollup/build|yarn build|ms-playwright/chromium|chrome-headless-shell|playwright/lib|@playwright/test'
busy() { pgrep -f "$HEAVY" >/dev/null; }
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# unit <mode> <label> <run.mjs args...>
unit() {
  local mode=$1 label=$2
  shift 2
  if compgen -G "results/$mode-$label-[0-9]*[0-9].json" >/dev/null; then
    return
  fi
  local attempt start_load end_load latest
  for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    while busy || over "$(load)" "$LOAD_LIMIT"; do
      echo "waiting before $label: load $(load)$(busy && echo ', heavy work running')"
      sleep 60
    done
    start_load=$(load)
    node run.mjs "--$mode" --restarts=1 --label="$label" "$@"
    end_load=$(load)
    latest=$(ls -t results/$mode-$label-[0-9]*[0-9].json | head -1)
    if over "$end_load" "$DISCARD_LIMIT" && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      log "discard $label attempt $attempt: load $start_load -> $end_load"
      mv "$latest" "${latest%.json}.discarded.json"
      continue
    fi
    log "done $label attempt $attempt: load $start_load -> $end_load$(over "$end_load" "$DISCARD_LIMIT" && echo ' (kept over limit)')"
    return
  done
}

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "== build against $REACT"
  node build.mjs --react="$REACT" --count --out="dist-$TAG-count"
  node build.mjs --react="$REACT" --out="dist-$TAG"
  BUILD_SUITES=("${SUITES[@]}")
  [ "$MATRIX" = nobailout ] || BUILD_SUITES+=("derived-selectors-spike|")
  for entry in "${BUILD_SUITES[@]}"; do
    IFS='|' read -r suite _ <<<"$entry"
    node build.mjs --suite="$suite" --react="$REACT" --count --out="dist-$TAG-$suite-count"
    node build.mjs --suite="$suite" --react="$REACT" --out="dist-$TAG-$suite"
  done
fi

if [ -z "${SKIP_VERIFY:-}" ]; then
  echo "== verify (jsdom, then Chrome)"
  node run-jsdom.mjs --dist="dist-$TAG-count"
  node run.mjs --verify --dist="dist-$TAG-count"
  VERIFY_SUITES=("${SUITES[@]}")
  [ "$MATRIX" = nobailout ] || VERIFY_SUITES+=("derived-selectors-spike|")
  for entry in "${VERIFY_SUITES[@]}"; do
    IFS='|' read -r suite _ <<<"$entry"
    case "$suite" in
      typing) node run-jsdom.mjs --suite=typing --dist="dist-$TAG-typing-count" --scenarios=entity,selection,structure ;;
      sweeps)
        # Rows with different widths render different DOM, so compare within a width.
        for w in 4 16; do
          node run-jsdom.mjs --suite=sweeps --dist="dist-$TAG-sweeps-count" --n=1000 \
            --variants=store-c100-w$w,store-keyed-c100-w$w,redux-c100-w$w,zustand-c100-w$w
        done
        node run-jsdom.mjs --suite=sweeps --dist="dist-$TAG-sweeps-count" --n=1000 \
          --variants="$(for l in store store-keyed redux zustand; do for c in 100 90 75 50; do printf "%s-c%s-w8," $l $c; done; done | sed 's/,$//')"
        ;;
      *)
        node run-jsdom.mjs --suite="$suite" --dist="dist-$TAG-$suite-count"
        node run.mjs --verify --suite="$suite" --dist="dist-$TAG-$suite-count"
        ;;
    esac
  done
fi

echo "== counts (deterministic, so not load-gated)"
LOAD_LIMIT=1000 DISCARD_LIMIT=1000 unit counts "$TAG" --dist="dist-$TAG-count"
COUNT_SUITES=(derived-selectors rapid-dispatch many-components-same-slice deeptree-nested-hooks fairness sweeps derived-selectors-spike)
[ "$MATRIX" = nobailout ] && COUNT_SUITES=(sweeps)
for suite in "${COUNT_SUITES[@]}"; do
  extra=--n=0
  case "$suite" in fairness | sweeps) extra=--n=1000 ;; esac
  LOAD_LIMIT=1000 DISCARD_LIMIT=1000 unit counts "$TAG-q-$suite" --suite="$suite" --dist="dist-$TAG-$suite-count" "$extra"
done

echo "== timing"
for r in $(seq 1 "$RESTARTS"); do
  units=()
  for s in "${SCENARIOS[@]}"; do
    for t in 1 4; do
      units+=("full|$TAG-r$r-$s-x$t|--dist=dist-$TAG --scenarios=$s --throttle=$t --no-typing --no-memory $MAIN_FILTER")
    done
  done
  if [ "$MATRIX" != nobailout ]; then
    units+=("full|$TAG-r$r-typing|--dist=dist-$TAG --no-updates --no-memory")
    units+=("full|$TAG-r$r-memory|--dist=dist-$TAG --no-updates --no-typing")
  fi
  for entry in "${SUITES[@]}"; do
    IFS='|' read -r suite flags <<<"$entry"
    units+=("smoke|$TAG-q-$suite-r$r|--suite=$suite --dist=dist-$TAG-$suite $flags")
  done
  [ "$MATRIX" = nobailout ] && SPIKE_FAMILIES=()
  for f in ${SPIKE_FAMILIES[@]+"${SPIKE_FAMILIES[@]}"}; do
    for t in 1 4; do
      units+=("smoke|$TAG-spike-r$r-$f-x$t|--suite=derived-selectors-spike --dist=dist-$TAG-derived-selectors-spike --compiler=on --throttle=$t --iterations=100 --warmup=30 --scenarios=$f,$f-k20,$f-k50")
    done
  done
  if [ $((r % 2)) -eq 0 ]; then
    reversed=()
    for ((i = ${#units[@]} - 1; i >= 0; i--)); do reversed+=("${units[$i]}"); done
    units=("${reversed[@]}")
  fi
  for entry in "${units[@]}"; do
    IFS='|' read -r mode label flags <<<"$entry"
    # shellcheck disable=SC2086
    unit "$mode" "$label" $flags
  done
done

echo "== done: $(grep -c '^.* done ' "$LOG") units, $(grep -c ' discard ' "$LOG" || true) discarded attempts"
