// Combines the per-restart results of run-all-quiet.sh and prints the median
// and mean ms per update, the mean of each restart, and the ratio of means to
// redux +compiler. For the typing suite it prints keydown-to-frame latency.
//
//   node summarize-runs.mjs q-derived-selectors

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const prefix = process.argv[2];
const dir = path.join(here, 'results');
const pattern = new RegExp(`^smoke-${prefix}-r\\d+-\\d+\\.json$`);
const files = fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
if (files.length === 0) {
  console.error(`No results for ${prefix}`);
  process.exit(1);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const updates = new Map();
const typing = new Map();
for (const file of files) {
  const {results} = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const r of results) {
    const variant = r.variant + (r.compiler ? ' +compiler' : '');
    if (r.kind === 'update') {
      const key = [r.scenario, r.n, r.throttle, variant].join('|');
      if (!updates.has(key)) {
        updates.set(key, {all: [], restarts: []});
      }
      updates.get(key).all.push(...r.durations);
      updates.get(key).restarts.push(mean(r.durations));
    } else if (r.kind === 'typing') {
      const key = [r.throttle, variant].join('|');
      if (!typing.has(key)) {
        typing.set(key, []);
      }
      typing.get(key).push(...r.latencies);
    }
  }
}

console.log(`${prefix}: ${files.length} restarts`);
const groups = [...new Set([...updates.keys()].map(k => k.split('|').slice(0, 3).join('|')))];
for (const group of groups.sort()) {
  const [scenario, n, throttle] = group.split('|');
  const base = updates.get(group + '|redux +compiler');
  console.log(`\n${scenario} n=${n} x${throttle}`);
  console.log('  ' + 'variant'.padEnd(28) + 'median'.padStart(8) + 'mean'.padStart(8) + '  vs redux+c  restart means');
  for (const [key, e] of [...updates].filter(([k]) => k.startsWith(group + '|')).sort()) {
    const ratio = base ? (mean(e.all) / mean(base.all)).toFixed(2) + 'x' : '';
    console.log(
      '  ' +
        key.split('|')[3].padEnd(28) +
        median(e.all).toFixed(3).padStart(8) +
        mean(e.all).toFixed(3).padStart(8) +
        ratio.padStart(12) +
        '  ' +
        e.restarts.map(x => x.toFixed(3)).join(', '),
    );
  }
}
for (const [key, latencies] of [...typing].sort()) {
  const [throttle, variant] = key.split('|');
  console.log(
    `typing x${throttle} ${variant.padEnd(28)} p50 ${percentile(latencies, 0.5).toFixed(1)}ms  p95 ${percentile(latencies, 0.95).toFixed(1)}ms  (${latencies.length} keys)`,
  );
}
