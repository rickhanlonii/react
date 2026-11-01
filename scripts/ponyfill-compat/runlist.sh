#!/bin/sh
# Usage: runlist.sh <impl> <outdir> <listfile> [jest args...]
# run.sh with the test files read from <listfile>.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
impl=$1; out=$2; list=$3; shift 3
files=$(grep -v '^#' "$list" | grep -v '^$')
exec "$here/run.sh" "$impl" "$out" "$@" $files
