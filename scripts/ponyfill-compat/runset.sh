#!/bin/sh
# Usage: runset.sh <name> <listfile> [workers]
# Runs the test files listed in <listfile> (one per line, relative to the repo
# root) against use(store), the experimental ponyfill and the stable ponyfill,
# then writes results/<name>/report.json.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
name=$1; list=$2; workers=${3:-3}
for impl in none experimental stable; do
  "$here/runlist.sh" $impl "$here/results/$name/$impl" "$list" -w "$workers" &
done
wait
node "$here/report.js" "$here/results/$name" --json "$here/results/$name/report.json"
