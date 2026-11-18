#!/bin/sh
# Usage: snapshot.sh <commit> <dir>
# Exports <commit> to <dir> (git archive, read-only) and wires node_modules so
# the harness can run there without touching the main working tree. Workspace
# links point into <dir>/packages. Legacy React copies (react-dom-17, ...) are
# copied rather than linked, because they require('react') and would otherwise
# resolve it to the main tree.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
commit=$1; dir=$2
mkdir -p "$dir/node_modules"
git -C "$repo" archive "$commit" | tar -x -C "$dir"
cd "$repo/node_modules"
for e in $(ls -A); do
  t=$(readlink "$e" 2>/dev/null || true)
  case "$t" in
    ../packages/*|../scripts/*) ln -s "$t" "$dir/node_modules/$e" ;;
    *) ln -s "$PWD/$e" "$dir/node_modules/$e" ;;
  esac
done
for e in create-react-class react-15 react-16-8 react-17 react-dom-15 \
  react-dom-16-8 react-dom-17 react-is-18 react-is-19 react-lifecycles-compat \
  scheduler-0-13; do
  rm "$dir/node_modules/$e"
  cp -R "$repo/node_modules/$e" "$dir/node_modules/$e"
done
cd "$repo"
for d in $(find packages -maxdepth 3 -name node_modules -type d -prune); do
  if [ -d "$dir/$(dirname "$d")" ] && [ ! -e "$dir/$d" ]; then
    ln -s "$repo/$d" "$dir/$d"
  fi
done
mkdir -p "$dir/scripts/ponyfill-compat"
(cd "$here" && tar -c --exclude results --exclude stripped . | tar -x -C "$dir/scripts/ponyfill-compat")
echo "Run: $dir/scripts/ponyfill-compat/all.sh"
