// Runs the counting bundles in jsdom, without a browser, to check the harness:
// every variant must render the same DOM, and the work counters must make sense.
// Timings from jsdom are not meaningful; use run.mjs in Chrome for those.
//
//   node build.mjs --count && node run-jsdom.mjs [--n=1000] [--variants=...]
//
// --suite=<name> runs a suite from src/redux-suite/suites.mjs and reports the
// average work per update over --steps updates. --dist=<dir> reads bundles from
// somewhere other than dist-count.

import {JSDOM} from 'jsdom';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {suites} from './src/redux-suite/suites.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}

const suite = option('suite', null);
const distDir = path.resolve(here, option('dist', 'dist-count'));
const manifest = JSON.parse(
  fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'),
);
const variantFilter = option('variants', null);
const bundles = manifest
  .map(file => {
    const match = file.match(/^(.*)-(compiler|nocompiler)-count\.js$/);
    return {file, variant: match[1], compiler: match[2] === 'compiler'};
  })
  .filter(
    b => variantFilter === null || variantFilter.split(',').includes(b.variant),
  );

const scenarios = (
  option('scenarios', null) ||
  (suite && suites[suite].scenarios && suites[suite].scenarios.join(',')) ||
  'entity,selection,filter,details-inline,details-component,details-churn,structure'
).split(',');
const n = Number(option('n', 1000));
const steps = Number(option('steps', 200));

function load(bundle) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  dom.window.eval(fs.readFileSync(path.join(distDir, bundle.file), 'utf8'));
  return dom.window;
}

function label(bundle) {
  return bundle.variant + (bundle.compiler ? ' +compiler' : '');
}

let failed = false;
const rows = [];
for (const scenario of scenarios) {
  let expected = null;
  let expectedFrom = null;
  for (const bundle of bundles) {
    const window = load(bundle);
    const bench = window.__bench;
    bench.mount(200, scenario);
    const hashes = bench.trace(scenario, 8).join(',');
    if (expected === null) {
      expected = hashes;
      expectedFrom = label(bundle);
    } else if (hashes !== expected) {
      failed = true;
      console.log(`✗ ${scenario}: ${label(bundle)} renders different DOM than ${expectedFrom}`);
    }
    bench.mount(n, scenario);
    bench.countStep(scenario, 0);
    rows.push({
      scenario,
      bundle: label(bundle),
      ...(bench.countSteps
        ? bench.countSteps(scenario, 1, steps)
        : bench.countStep(scenario, 1)),
    });
    bench.unmount();
    window.close();
  }
  if (!failed) {
    console.log(`✓ ${scenario}: ${bundles.length} bundles render the same DOM`);
  }
}

if (rows.length > 0 && rows[0].derivations !== undefined) {
  console.log(`\nWork per update, averaged over ${steps} updates\n`);
  console.log('scenario'.padEnd(20), 'variant'.padEnd(28), 'renders'.padStart(8), 'selectors'.padStart(10), 'derivations'.padStart(12));
  for (const r of rows) {
    console.log(
      r.scenario.padEnd(20),
      r.bundle.padEnd(28),
      r.renders.toFixed(1).padStart(8),
      r.selectors.toFixed(1).padStart(10),
      r.derivations.toFixed(1).padStart(12),
    );
  }
} else {
  console.log(`\nWork per update, N=${n}\n`);
  console.log('scenario'.padEnd(20), 'variant'.padEnd(28), 'renders'.padStart(8), 'rows'.padStart(8), 'selectors'.padStart(10));
  for (const r of rows) {
    console.log(
      r.scenario.padEnd(20),
      r.bundle.padEnd(28),
      String(r.renders).padStart(8),
      String(r.rows).padStart(8),
      String(r.selectors).padStart(10),
    );
  }
}
process.exitCode = failed ? 1 : 0;
