// Prints markdown tables from a derived-selectors-spike timing run: the median
// ms per update for every variant, scenario, K and CPU throttle, and the
// ratio to Redux in the same run.
//
//   node spike-shared-derived/summarize.mjs results/smoke-spike-<time>.json
//
// Part of the shared-derived-data spike
// (docs/use-store/research/shared-derived-data.md).

import fs from 'fs';

const {env, results} = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const order = [
  'redux',
  'zustand',
  'store',
  'store-compiled',
  'store-derived',
  'store-memo',
  'store-reselect',
  'store-compiled-shared',
  'store-compiled-shared-site',
  'store-cache-gen',
  'store-cache-render',
  'store-derived-lazy',
];

const groups = new Map();
for (const r of results.filter(r => r.kind === 'update')) {
  const [base, kPart] = r.scenario.split('-k');
  const k = kPart ? Number(kPart) : 5;
  const key = [base, r.throttle, k, r.variant].join('|');
  if (!groups.has(key)) {
    groups.set(key, {durations: [], restarts: []});
  }
  const group = groups.get(key);
  group.durations.push(...r.durations);
  group.restarts.push(median(r.durations));
}

const scenarios = [...new Set([...groups.keys()].map(k => k.split('|')[0]))];
const throttles = [...new Set([...groups.keys()].map(k => k.split('|')[1]))];
const ks = [5, 20, 50];
const variants = order.filter(v =>
  [...groups.keys()].some(k => k.split('|')[3] === v),
);

console.log(
  `${env.date}, ${env.restarts} restarts x ${env.iterations} samples, ` +
    `warmup ${env.warmup}, ${env.browserPath ? 'headless shell' : 'Chrome'}` +
    `${env.singleProcess ? ', single process' : ''}\n`,
);
for (const scenario of scenarios) {
  for (const throttle of throttles) {
    console.log(`\n**${scenario}, ${throttle}x CPU**: median ms per update (ratio to redux)\n`);
    console.log(`| variant | ${ks.map(k => `K=${k}`).join(' | ')} |`);
    console.log(`|---|${ks.map(() => '---:').join('|')}|`);
    for (const variant of variants) {
      const cells = ks.map(k => {
        const group = groups.get([scenario, throttle, k, variant].join('|'));
        const redux = groups.get([scenario, throttle, k, 'redux'].join('|'));
        if (!group) {
          return '';
        }
        const m = median(group.durations);
        const ratio = redux ? m / median(redux.durations) : NaN;
        // The spread of the per-restart medians.
        const lo = Math.min(...group.restarts);
        const hi = Math.max(...group.restarts);
        return `${m.toFixed(3)} (${ratio.toFixed(2)}x) [${lo.toFixed(2)}–${hi.toFixed(2)}]`;
      });
      console.log(`| ${variant} | ${cells.join(' | ')} |`);
    }
  }
}
