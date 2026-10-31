// The report section for the suites other than the default one: the scenarios
// ported from reduxjs/react-redux-benchmarks, the shared derived data spike,
// the fairness controls, typing with useDeferredValue, and the sweeps.
//
// Results are grouped by env.suite, so any mix of files works. By default
// it reads the quiet runs from run-all-quiet.sh (results/smoke-q-*.json) and
// the spike's final matrix (results/smoke-spike-final-*.json).

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {median, percentile, summarize, compare, verdict, ms} from './stats.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, 'results');

const SUITES = {
  'derived-selectors': {
    title: 'derived-selectors (Redux benchmark)',
    description:
      "200 memo components derive data from 100 users, 500 posts and 1,000 comments with createSelector. 5 components share each category's stats.",
  },
  'derived-selectors-spike': {
    title: 'Shared derived data (spike)',
    description:
      'Ways to share a derivation between use(store) readers, at 5, 20 and 50 readers per category (-k20, -k50). store-derived tears under transitions and is shown only for reference. Timed with 30 warm-up updates, so store-compiled-shared includes JIT warm-up of its cache path; at steady state it is about 7% slower than store-memo here, from routing unshared calls through the cache (see §8 of research/shared-derived-data.md).',
  },
  'rapid-dispatch': {
    title: 'rapid-dispatch (Redux benchmark)',
    description:
      '500 memo components, bursts of dispatches: synchronous bursts, thunks and listener cascades.',
  },
  'many-components-same-slice': {
    title: 'many-components-same-slice (Redux benchmark)',
    description: '5,000 components read one counter, and every update changes it.',
  },
  'deeptree-nested-hooks': {
    title: 'deeptree-nested-hooks (Redux benchmark)',
    description:
      '200 trees, 15 levels deep: 3,000 slices, 600 text displays and 200 counters, updated by 5 buttons.',
  },
  fairness: {
    title: 'Fairness controls (N=1,000)',
    description:
      'Redux without RTK and Immer (redux-plain) and RTK without auto-freeze (redux-nofreeze), next to use(store) and Zustand.',
  },
  typing: {
    title: 'Typing with useDeferredValue',
    description:
      'Keydown-to-frame latency while 10k expensive rows re-filter. redux-deferred and zustand-deferred render the list with useDeferredValue.',
  },
  sweeps: {
    title: 'Sweeps: compiler coverage and component width (N=1,000)',
    description:
      'Rows compiled at 100/90/75/50% coverage (8 props), and fully compiled rows with 4/8/16 props.',
  },
};

export function defaultSuiteFiles() {
  if (!fs.existsSync(resultsDir)) {
    return [];
  }
  return fs
    .readdirSync(resultsDir)
    .filter(
      f =>
        /^smoke-(q-.*-r\d+|spike-final-r\d+-.*)-\d+\.json$/.test(f) &&
        !f.includes('discarded'),
    )
    .map(f => path.join(resultsDir, f));
}

function load(files) {
  const bySuite = new Map();
  for (const file of files) {
    const {env, results} = JSON.parse(fs.readFileSync(file, 'utf8'));
    const suite = env.suite;
    if (!suite || !SUITES[suite]) {
      continue;
    }
    if (!bySuite.has(suite)) {
      bySuite.set(suite, {files: [], results: []});
    }
    bySuite.get(suite).files.push(file);
    bySuite.get(suite).results.push(...results);
  }
  return bySuite;
}

function name(variant, compiler) {
  return variant + (compiler ? ' +c' : '');
}

// stats[group][variant+compiler] = summary, where a group is a scenario at a
// size and CPU throttle.
function updateStats(results) {
  const durations = new Map();
  for (const r of results.filter(r => r.kind === 'update')) {
    const group = [r.scenario, r.n, r.throttle].join('|');
    const key = group + '|' + name(r.variant, r.compiler);
    if (!durations.has(key)) {
      durations.set(key, []);
    }
    durations.get(key).push(...r.durations);
  }
  const stats = new Map();
  for (const [key, values] of durations) {
    const parts = key.split('|');
    const group = parts.slice(0, 3).join('|');
    if (!stats.has(group)) {
      stats.set(group, new Map());
    }
    stats.get(group).set(parts[3], summarize(values));
  }
  return stats;
}

function groupLabel(group, showN = true) {
  const [scenario, n, throttle] = group.split('|');
  return `${scenario}${showN && n !== '0' ? ` · N=${Number(n).toLocaleString()}` : ''} · ${throttle}×`;
}

// The spike's variants that share a derivation correctly. store-derived is
// fast but tears under transitions, so it doesn't count.
const SHARING = new Set([
  'store-memo',
  'store-reselect',
  'store-cache-gen',
  'store-cache-render',
  'store-derived-lazy',
  'store-compiled-shared',
  'store-compiled-shared-site',
]);

function storeVerdict(store, opponent) {
  if (store && opponent && store.median === 0) {
    // Below the timer resolution: the update didn't render anything.
    return '<span class="win">no work</span>';
  }
  return verdict(compare(store, opponent ?? null));
}

// The faster of a variant with and without the compiler.
function bestOf(byVariant, variant) {
  const on = byVariant.get(name(variant, true));
  const off = byVariant.get(name(variant, false));
  if (!on) return off;
  if (!off) return on;
  return on.mean <= off.mean ? on : off;
}

function sortGroups(groups) {
  return [...groups].sort((a, b) => {
    const [sa, na, ta] = a.split('|');
    const [sb, nb, tb] = b.split('|');
    return (
      Number(ta) - Number(tb) || Number(na) - Number(nb) || sa.localeCompare(sb)
    );
  });
}

// One row per scenario/size/throttle, one column per variant with the
// compiler, each cell relative to redux. The last column compares store with
// the compiler against the best configuration of every other library. For
// the spike, it compares the fastest correct way to share a derivation with
// redux instead.
function updateTable(stats, variants, {showN, spike}) {
  const groups = sortGroups(stats.keys());
  const header = variants.map(v => `<th class="r">${v}</th>`).join('');
  const opponents = variants.filter(v => !v.startsWith('store'));
  const rows = groups.map(group => {
    const byVariant = stats.get(group);
    const redux = byVariant.get('redux +c');
    const cells = variants
      .map(v => {
        const entry = byVariant.get(name(v, true));
        if (!entry) {
          return '<td class="r">–</td>';
        }
        const rel =
          redux && v !== 'redux'
            ? ` <small class="muted">${(entry.mean / redux.mean).toFixed(2)}×</small>`
            : '';
        const cls = v.startsWith('store') ? ' storename' : '';
        return `<td class="r${cls}">${ms(entry)}${rel}</td>`;
      })
      .join('');
    let result;
    if (spike) {
      const sharing = [...SHARING]
        .map(v => byVariant.get(name(v, true)))
        .filter(Boolean)
        .sort((a, b) => a.mean - b.mean)[0];
      result = storeVerdict(sharing, bestOf(byVariant, 'redux'));
    } else {
      const best = opponents
        .map(v => bestOf(byVariant, v))
        .filter(Boolean)
        .sort((a, b) => a.mean - b.mean)[0];
      result = storeVerdict(byVariant.get('store +c'), best);
    }
    return `<tr><td>${groupLabel(group, showN)}</td>${cells}<td>${result}</td></tr>`;
  });
  const last = spike
    ? 'fastest correct sharing vs redux'
    : `store vs best of ${opponents.join('/')}`;
  return `<div class="card"><table>
<tr><th>scenario</th>${header}<th>${last}</th></tr>
${rows.join('\n')}
</table></div>
<p class="muted">Median ms per update, with the compiler. Small numbers are the ratio of means to redux +compiler. Verdicts compare against each library's faster configuration (with or without the compiler); "tie" is within two standard errors.</p>`;
}

function typingTable(results) {
  const rows = new Map();
  for (const r of results.filter(r => r.kind === 'typing')) {
    const key = r.throttle + '|' + name(r.variant, r.compiler);
    if (!rows.has(key)) {
      rows.set(key, []);
    }
    rows.get(key).push(...r.latencies);
  }
  const sorted = [...rows.keys()].sort();
  return `<div class="card"><table>
<tr><th>variant</th><th>CPU</th><th class="r">p50 ms</th><th class="r">p95 ms</th><th class="r">max ms</th></tr>
${sorted
  .map(key => {
    const [throttle, variant] = key.split('|');
    const latencies = rows.get(key);
    return `<tr><td class="${variant.startsWith('store') ? 'storename' : ''}">${variant}</td><td>${throttle}×</td><td class="r">${median(latencies).toFixed(1)}</td><td class="r">${percentile(latencies, 0.95).toFixed(1)}</td><td class="r">${Math.max(...latencies).toFixed(1)}</td></tr>`;
  })
  .join('\n')}
</table></div>`;
}

// Sweep variants are named <library>-c<coverage>-w<width>. Builds without the
// compiler are the 0% coverage point.
function sweepTable(stats) {
  const libraries = ['store', 'redux', 'zustand'];
  const configs = [
    ['c100-w8', '100% compiled, 8 props'],
    ['c90-w8', '90% compiled, 8 props'],
    ['c75-w8', '75% compiled, 8 props'],
    ['c50-w8', '50% compiled, 8 props'],
    ['c100-w8-off', 'no compiler, 8 props'],
    ['c100-w4', '100% compiled, 4 props'],
    ['c100-w16', '100% compiled, 16 props'],
  ];
  const groups = sortGroups(stats.keys());
  return groups
    .map(group => {
      const byVariant = stats.get(group);
      const rows = configs.map(([config, label]) => {
        const off = config.endsWith('-off');
        const base = off ? config.slice(0, -4) : config;
        const entries = libraries.map(lib =>
          byVariant.get(name(`${lib}-${base}`, !off)),
        );
        const [store, ...libs] = entries;
        const bestLib = libs.filter(Boolean).sort((a, b) => a.mean - b.mean)[0];
        return `<tr><td>${label}</td>${entries.map((e, i) => `<td class="r${i === 0 ? ' storename' : ''}">${ms(e)}</td>`).join('')}<td>${verdict(compare(store, bestLib ?? null))}</td></tr>`;
      });
      return `<h4>${groupLabel(group)}</h4><div class="card"><table>
<tr><th>configuration</th>${libraries.map(l => `<th class="r">${l}</th>`).join('')}<th>store vs best</th></tr>
${rows.join('\n')}
</table></div>`;
    })
    .join('');
}

export function suitesSection(files = defaultSuiteFiles()) {
  const bySuite = load(files);
  if (bySuite.size === 0) {
    return '';
  }
  const sections = [];
  for (const suite of Object.keys(SUITES)) {
    const data = bySuite.get(suite);
    if (!data) {
      continue;
    }
    const {title, description} = SUITES[suite];
    let body;
    if (suite === 'typing') {
      body = typingTable(data.results);
    } else if (suite === 'sweeps') {
      body = sweepTable(updateStats(data.results));
    } else {
      const variants = [
        ...new Set(data.results.filter(r => r.kind === 'update').map(r => r.variant)),
      ].sort((a, b) =>
        a === 'redux' ? -1 : b === 'redux' ? 1 : a.localeCompare(b),
      );
      body = updateTable(updateStats(data.results), variants, {
        showN: suite === 'fairness',
        spike: suite === 'derived-selectors-spike',
      });
    }
    sections.push(`<h3>${title}</h3>
<p class="sub">${description} <span class="muted">${data.files.length} result file${data.files.length === 1 ? '' : 's'}${data.files.length <= 6 ? ` (${data.files.map(f => '<code>' + path.basename(f) + '</code>').join(', ')})` : ''}.</span></p>
${body}`);
  }
  return `<h2 id="suites">More scenarios</h2>
<p class="sub">The four scenarios ported from <code>reduxjs/react-redux-benchmarks</code> (the Redux team's own benchmarks, their Redux code kept verbatim), the shared derived data spike, the fairness controls, typing with useDeferredValue, and the sweeps. Same harness, same rules: identical DOM across variants, every component compiled, each update timed inside <code>flushSync</code>.</p>
${sections.join('\n')}`;
}

// Standalone: node report-suites.mjs [files...] prints a summary to stdout.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files =
    process.argv.length > 2
      ? process.argv.slice(2).map(f => path.resolve(f))
      : defaultSuiteFiles();
  const html = suitesSection(files);
  console.log(
    html
      .replace(/<br>/g, ' ')
      .replace(/<\/(tr|p|h\d)>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n'),
  );
}

// For the narrative: store vs redux in derived-selectors, and the fastest
// correct sharing variant vs redux in the spike. Ranges are speedups
// (redux time / store time) over every scenario and throttle.
export function derivedSummary(files = defaultSuiteFiles()) {
  const bySuite = load(files);
  function tallyFrom(suite, pick) {
    const data = bySuite.get(suite);
    if (!data) return null;
    const stats = updateStats(data.results);
    const speedups = [];
    let wins = 0;
    let ties = 0;
    let losses = 0;
    for (const byVariant of stats.values()) {
      const left = pick(byVariant);
      const redux = bestOf(byVariant, 'redux');
      if (!left || !redux || left.median === 0) continue;
      const c = compare(left, redux);
      speedups.push(1 / c.ratio);
      if (c.tie) ties++;
      else if (c.ratio < 1) wins++;
      else losses++;
    }
    return {
      total: wins + ties + losses,
      wins,
      ties,
      losses,
      min: Math.min(...speedups),
      max: Math.max(...speedups),
    };
  }
  return {
    store: tallyFrom('derived-selectors', byVariant =>
      byVariant.get('store +c'),
    ),
    sharing: tallyFrom('derived-selectors-spike', byVariant =>
      [...SHARING]
        .map(v => byVariant.get(name(v, true)))
        .filter(Boolean)
        .sort((a, b) => a.mean - b.mean)[0],
    ),
  };
}

// For the narrative: store vs the best of redux/zustand in the sweeps, per
// configuration, for the selection and entity scenarios.
export function sweepSummary(files = defaultSuiteFiles()) {
  const data = load(files).get('sweeps');
  if (!data) return null;
  const stats = updateStats(data.results);
  const out = {};
  for (const [group, byVariant] of stats) {
    const [scenario, , throttle] = group.split('|');
    for (const config of ['c100-w4', 'c100-w8', 'c100-w16', 'c90-w8', 'c75-w8', 'c50-w8']) {
      const store = byVariant.get(name(`store-${config}`, true));
      const best = ['redux', 'zustand']
        .map(lib => byVariant.get(name(`${lib}-${config}`, true)))
        .filter(Boolean)
        .sort((a, b) => a.mean - b.mean)[0];
      if (!store || !best) continue;
      ((out[scenario] ??= {})[config] ??= []).push({
        throttle: Number(throttle),
        ratio: store.mean / best.mean,
        ...compare(store, best),
      });
    }
  }
  return out;
}
