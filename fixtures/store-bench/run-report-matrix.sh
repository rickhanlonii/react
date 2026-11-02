#!/bin/bash
# Re-runs every benchmark the use(store) reports cite, on one frozen React
# build, as small gated units that can be resumed. Results carry the build
# (env.react, env.compiler) and the load before and after (env.loadStart/End).
#
#   ./run-report-matrix.sh                 build, verify, count, time
#   REACT=react-builds/head (default)      frozen build (needs BUILD.json)
#   TAG=head (default)                     prefix for dists and result labels
#   RESTARTS=3                             restarts per unit
#   AMBIENT_START=3 AMBIENT_DISCARD=4      gate on ambient CPU (cores used by
#                                          processes outside this script): start
#                                          at <= 3, re-run if the mean during
#                                          the unit was > 4 (up to MAX_ATTEMPTS).
#                                          Per-unit numbers: results/$TAG-ambient.jsonl
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
#   spike     4 scenario families (K=20/50; K=5 duplicates derived-selectors)
#             x 1x/4x CPU, compiler on
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
# The gate and the discard rule use AMBIENT CPU: the cores used by every
# process outside this script's tree (ambient-cpu.mjs), so the benchmark's own
# Chrome doesn't count against itself. The 1-minute load average on macOS
# counts waiting threads and lags the previous unit, so it's only recorded.
AMBIENT_START=${AMBIENT_START:-3}      # start a unit at <= this many cores
AMBIENT_DISCARD=${AMBIENT_DISCARD:-4}  # re-run if the mean during it was above
AMBIENT_LOG=results/$TAG-ambient.jsonl
MAX_ATTEMPTS=${MAX_ATTEMPTS:-5}
export BENCH_BROWSER=${BENCH_BROWSER:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell}
export BENCH_SINGLE_PROCESS=${BENCH_SINGLE_PROCESS:-1}
LOG=results/$TAG-units.log
TIMING="--throttle=1,4 --iterations=200 --warmup=50"
# A frozen copy of the compiler dist (see its COMPILER.json), recorded in build-info.json.
COMPILER=${COMPILER:-react-builds/compiler-a3d8e745/index.js}
[ -f "$COMPILER" ] || { echo "missing compiler $COMPILER"; exit 1; }

[ -f "$REACT/BUILD.json" ] || { echo "$REACT has no BUILD.json; freeze it first"; exit 1; }
mkdir -p results

# suite | extra run.mjs flags for timing (as in run-all-quiet.sh)
SUITES=(
  "derived-selectors|$TIMING"
  "rapid-dispatch|$TIMING"
  "many-components-same-slice|--throttle=1,4 --iterations=100 --warmup=20"
  "deeptree-nested-hooks|$TIMING"
  "fairness|--n=1000 --variants=redux,redux-plain,redux-nofreeze $TIMING"
  "typing|--typing --throttle=1,4 --variants=store,redux-deferred,zustand-deferred"
  "sweeps|--n=1000 $TIMING"
)
if [ "$MATRIX" = nobailout ]; then
  SUITES=("sweeps|--n=1000 $TIMING")
  MAIN_FILTER="--variants=store,redux,zustand,zustand-granular --compiler=on --n=1000,10000"
else
  MAIN_FILTER=""
fi
SCENARIOS=(entity selection filter details-inline details-component details-churn structure)
SPIKE_FAMILIES=(mixed score comment role)

load() { sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}' || cut -d' ' -f1 /proc/loadavg; }
over() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>b)}'; }
# Other heavy work: jest, React builds, and any Playwright or headless Chrome
# (e.g. doc gates). Checked between units, when this script has no children.
HEAVY='jest-worker|jest-cli|scripts/rollup/build|yarn build|ms-playwright/chromium|chrome-headless-shell|playwright/lib|@playwright/test'
busy() { pgrep -f "$HEAVY" >/dev/null; }
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
ambient() { node ambient-cpu.mjs $$ | sed -E 's/.*"ambient":([0-9.]+).*/\1/'; }
# Three samples two seconds apart, averaged.
ambient_now() {
  local a b c
  a=$(ambient); sleep 2; b=$(ambient); sleep 2; c=$(ambient)
  echo "$a $b $c" | awk '{printf "%.2f", ($1 + $2 + $3) / 3}'
}

# unit <mode> <label> <run.mjs args...>
unit() {
  local mode=$1 label=$2
  shift 2
  if compgen -G "results/$mode-$label-[0-9]*[0-9].json" >/dev/null; then
    return
  fi
  local attempt start_load end_load latest amb_file amb_start amb_mean amb_max sampler kept ungated=
  # Counts are deterministic: the counts calls pass LOAD_LIMIT=1000 to skip the gate.
  [ "$LOAD_LIMIT" = 1000 ] && ungated=1
  for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    if [ -z "$ungated" ]; then
      while busy || over "$(ambient_now)" "$AMBIENT_START"; do
        echo "waiting before $label: ambient $(ambient) cores, load $(load)$(busy && echo ', heavy work running')"
        sleep 30
      done
    fi
    start_load=$(load)
    amb_start=$(ambient)
    amb_file=$(mktemp)
    (while :; do ambient >> "$amb_file"; sleep 5; done) &
    sampler=$!
    node run.mjs "--$mode" --restarts=1 --label="$label" "$@" || { kill "$sampler" 2>/dev/null; exit 1; }
    kill "$sampler" 2>/dev/null
    wait "$sampler" 2>/dev/null || true
    end_load=$(load)
    amb_mean=$(awk '{ s += $1; n++ } END { printf "%.2f", n ? s / n : 0 }' "$amb_file")
    amb_max=$(sort -n "$amb_file" | tail -1)
    rm -f "$amb_file"
    latest=$(ls -t results/$mode-$label-[0-9]*[0-9].json | head -1)
    kept=true
    if [ -z "$ungated" ] && over "$amb_mean" "$AMBIENT_DISCARD" && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      kept=false
    fi
    echo "{\"label\":\"$label\",\"attempt\":$attempt,\"file\":\"$(basename "$latest")\",\"kept\":$kept,\"loadStart\":$start_load,\"loadEnd\":$end_load,\"ambientStart\":$amb_start,\"ambientMean\":$amb_mean,\"ambientMax\":${amb_max:-0}}" >> "$AMBIENT_LOG"
    if [ "$kept" = false ]; then
      log "discard $label attempt $attempt: ambient mean $amb_mean (max ${amb_max:-0}) cores, load $start_load -> $end_load"
      mv "$latest" "${latest%.json}.discarded.json"
      continue
    fi
    log "done $label attempt $attempt: ambient mean $amb_mean (max ${amb_max:-0}) cores, load $start_load -> $end_load$([ -z "$ungated" ] && over "$amb_mean" "$AMBIENT_DISCARD" && echo ' (kept over limit)')"
    return
  done
}

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "== build against $REACT"
  node build.mjs --react="$REACT" --compiler="$COMPILER" --count --out="dist-$TAG-count"
  node build.mjs --react="$REACT" --compiler="$COMPILER" --out="dist-$TAG"
  BUILD_SUITES=("${SUITES[@]}")
  [ "$MATRIX" = nobailout ] || BUILD_SUITES+=("derived-selectors-spike|")
  for entry in "${BUILD_SUITES[@]}"; do
    IFS='|' read -r suite _ <<<"$entry"
    node build.mjs --suite="$suite" --react="$REACT" --compiler="$COMPILER" --count --out="dist-$TAG-$suite-count"
    node build.mjs --suite="$suite" --react="$REACT" --compiler="$COMPILER" --out="dist-$TAG-$suite"
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
      typing)
        node run-jsdom.mjs --suite=typing --dist="dist-$TAG-typing-count" --scenarios=entity,selection,structure
        node run.mjs --verify --suite=typing --dist="dist-$TAG-typing-count"
        ;;
      sweeps)
        # run.mjs --verify compares sweep bundles within a row width.
        node run.mjs --verify --suite=sweeps --dist="dist-$TAG-sweeps-count" --n=1000
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
      units+=("smoke|$TAG-spike-r$r-$f-x$t|--suite=derived-selectors-spike --dist=dist-$TAG-derived-selectors-spike --compiler=on --throttle=$t --iterations=100 --warmup=30 --scenarios=$f-k20,$f-k50")
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
