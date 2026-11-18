#!/bin/sh
# Runs every test set. See README.md.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
./build.sh
./runset.sh core lists/core.txt 2
./runset.sh setb lists/setb.txt 2
./runset.sh ported lists/ported.txt 2
node strip.js \
  ../../packages/react-reconciler/src/__tests__/ReactUseStore-test.js \
  ../../packages/react-dom/src/__tests__/ReactDOMStore-test.js \
  ../../packages/react-reconciler/src/__tests__/TODOCorrectnessUseStore-test.js \
  ../../packages/react-dom/src/__tests__/ReactUseStorePonyfill-test.js \
  ../../packages/react-test-renderer/src/__tests__/ReactTestRendererUseStoreContext-test.internal.js
for impl in none experimental stable; do
  ./run.sh $impl "$here/results/stripped/$impl" -w 2 \
    --testRegex 'ponyfill-compat/stripped/.*-test.*\.js$' scripts/ponyfill-compat/stripped &
done
wait
node report.js "$here/results/stripped" --json "$here/results/stripped/report.json"
./runset.sh copies lists/copies.txt 5
