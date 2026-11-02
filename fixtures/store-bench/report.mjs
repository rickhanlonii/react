// Turns results from run.mjs into results/report.html and results/report.md.
// (The docs in docs/use-store are generated from the same pinned results by
// report-data.mjs.)
//
//   node report.mjs                         The results pinned in report-sources.json
//   node report.mjs results/full-123.json   Specific timing files
//   --out=<dir>                             Write somewhere other than results/

import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import {codeExamples} from './code-examples.mjs';
import {
  suitesSection,
  derivedSummary,
  sweepSummary,
  readSources,
  pinnedFiles,
  agreedCompare as compare,
  VERDICT_RULE,
} from './report-suites.mjs';
import {median, percentile, verdict, ms} from './stats.mjs';
import {
  VARIANTS,
  SCENARIOS,
  buildMainStats,
  x,
  describe,
  slower,
  ratioRange as ratioRangeOf,
} from './report-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const resultsDir = path.join(here, 'results');

function newest(prefixes) {
  const files = fs
    .readdirSync(resultsDir)
    .filter(f => f.endsWith('.json') && prefixes.some(p => f.startsWith(p)))
    .map(f => path.join(resultsDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : resultsDir;
const fileArgs = args.filter(a => !a.startsWith('--'));
const sources = fs.existsSync(path.join(resultsDir, 'report-sources.json'))
  ? readSources()
  : null;

// Timing files to merge. The first one's environment is reported. Extra files
// (e.g. re-runs of noisy configurations) add samples. By default, the main
// suite, typing and memory files pinned in report-sources.json.
const timingFiles =
  fileArgs.length > 0
    ? fileArgs
    : sources
      ? pinnedFiles(sources, ['main', 'main-typing', 'main-memory'])
      : [newest(['full', 'smoke'])];
const timingFile = timingFiles[0];
if (!timingFile) {
  throw new Error('No timing results yet. Run: node run.mjs --full');
}
const countsFile = sources
  ? pinnedFiles(sources, ['counts'])[0] ?? null
  : newest(['counts']);
const {env} = JSON.parse(fs.readFileSync(timingFile, 'utf8'));
// Restarts can be split across files (run separately so each can be gated on
// load), so count them across every timing file.
env.restarts = timingFiles.reduce(
  (sum, file) => sum + (JSON.parse(fs.readFileSync(file, 'utf8')).env.restarts || 1),
  0,
);
// Each result remembers its file, which names its restart (restartOf).
const results = timingFiles.flatMap(file =>
  JSON.parse(fs.readFileSync(file, 'utf8')).results.map(r => ({
    ...r,
    file: path.basename(file),
  })),
);
const counts = countsFile
  ? JSON.parse(fs.readFileSync(countsFile, 'utf8')).results
  : [];

function version(name) {
  try {
    return require(require.resolve(name + '/package.json', {paths: [here]}))
      .version;
  } catch {
    return 'n/a';
  }
}
const reactVersion = JSON.parse(
  fs.readFileSync(
    path.join(here, '../../build/oss-experimental/react/package.json'),
    'utf8',
  ),
).version;
const versions = {
  react: reactVersion,
  redux: version('redux'),
  'react-redux': version('react-redux'),
  '@reduxjs/toolkit': version('@reduxjs/toolkit'),
  zustand: version('zustand'),
};

// ---------------------------------------------------------------- stats

// stats[scenario][n][throttle][variant][compiler] = {median, mean, sem, p95, ...}
const stats = buildMainStats(results.filter(r => r.kind === 'update'));
const nValues = [
  ...new Set(results.filter(r => r.kind === 'update').map(r => r.n)),
].sort((a, b) => a - b);
const throttles = [
  ...new Set(results.filter(r => r.kind === 'update').map(r => r.throttle)),
].sort((a, b) => a - b);

function get(scenario, n, throttle, variant, compiler) {
  return stats[scenario]?.[n]?.[throttle]?.[variant]?.[compiler ? 'on' : 'off'];
}

// The faster of a variant with and without the compiler, so use(store) is
// compared against each library's best configuration.
function best(scenario, n, throttle, variant) {
  const off = get(scenario, n, throttle, variant, false);
  const on = get(scenario, n, throttle, variant, true);
  if (!off) return on;
  if (!on) return off;
  return on.mean <= off.mean ? on : off;
}

// ---------------------------------------------------------------- headline

const headlineRows = [];
for (const n of nValues) {
  for (const throttle of throttles) {
    const row = {n, throttle, cells: []};
    for (const [left, right, scenario] of [
      ['store', 'redux', 'selection'],
      ['store', 'zustand', 'selection'],
      ['store-single', 'redux', 'selection'],
      ['store', 'redux', 'entity'],
      ['store', 'redux', 'details-inline'],
      ['store', 'redux', 'details-component'],
    ]) {
      row.cells.push(
        compare(
          get(scenario, n, throttle, left, true),
          best(scenario, n, throttle, right),
        ),
      );
    }
    headlineRows.push(row);
  }
}

// Same comparison without the compiler, for the selection scenario.
const noCompilerRows = [];
for (const n of nValues) {
  for (const throttle of throttles) {
    noCompilerRows.push({
      n,
      throttle,
      store: compare(
        get('selection', n, throttle, 'store', false),
        get('selection', n, throttle, 'redux', false),
      ),
      storeCompiler: compare(
        get('selection', n, throttle, 'store', true),
        get('selection', n, throttle, 'store', false),
      ),
    });
  }
}

// ---------------------------------------------------------------- scoreboard

// store + compiler against each opponent's best configuration, for every size
// and CPU setting of a scenario.
function tally(scenario, left, right) {
  const cells = [];
  for (const n of nValues) {
    for (const throttle of throttles) {
      const c = compare(
        get(scenario, n, throttle, left, true),
        best(scenario, n, throttle, right),
      );
      if (c !== null) {
        cells.push(c);
      }
    }
  }
  const speedups = cells.map(c => 1 / c.ratio);
  return {
    total: cells.length,
    wins: cells.filter(c => !c.tie && c.ratio < 1).length,
    ties: cells.filter(c => c.tie).length,
    losses: cells.filter(c => !c.tie && c.ratio >= 1).length,
    min: Math.min(...speedups),
    max: Math.max(...speedups),
  };
}

function range(t) {
  if (t.total === 0) {
    return '<span class="muted">n/a</span>';
  }
  if (t.wins === t.total) {
    return `<span class="win">${x(t.min)}–${x(t.max)}× faster</span><br><small class="muted">${t.wins}/${t.total} faster</small>`;
  }
  if (t.losses === t.total) {
    return `<span class="loss">${x(1 / t.max)}–${x(1 / t.min)}× slower</span><br><small class="muted">${t.losses}/${t.total} slower</small>`;
  }
  const parts = [];
  if (t.wins) parts.push(`${t.wins} faster`);
  if (t.ties) parts.push(`${t.ties} tie`);
  if (t.losses) parts.push(`${t.losses} slower`);
  const low =
    t.min < 1 ? `${x(1 / t.min)}× slower` : `${x(t.min)}× faster`;
  const high =
    t.max < 1 ? `${x(1 / t.max)}× slower` : `${x(t.max)}× faster`;
  return `<span class="${t.wins > t.losses ? 'win' : t.losses > t.wins ? 'loss' : 'tie'}">${low} to ${high}</span><br><small class="muted">${parts.join(' · ')}</small>`;
}

const OPPONENTS = ['redux', 'zustand', 'context'];
const scoreboard = SCENARIOS.filter(([key]) => stats[key]).map(
  ([key, title]) => ({
    key,
    title,
    tallies: Object.fromEntries(
      OPPONENTS.map(o => [o, tally(key, 'store', o)]),
    ),
  }),
);
function overall(opponent) {
  const all = scoreboard.map(r => r.tallies[opponent]);
  return {
    total: all.reduce((a, t) => a + t.total, 0),
    wins: all.reduce((a, t) => a + t.wins, 0),
    ties: all.reduce((a, t) => a + t.ties, 0),
    losses: all.reduce((a, t) => a + t.losses, 0),
  };
}
const vsRedux = overall('redux');
const vsZustand = overall('zustand');
const zustandLosses = scoreboard
  .filter(r => r.tallies.zustand.losses > 0)
  .map(r => r.title);

// store + compiler vs the faster of the given libraries (each at its best
// configuration), for every size and throttle of a scenario in the given stats.
function tallyVsBest(statsIn, scenario, opponents) {
  const speedups = [];
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (const [n, byN] of Object.entries(statsIn[scenario] ?? {})) {
    for (const byVariant of Object.values(byN)) {
      void n;
      const store = byVariant.store?.on;
      const bestLib = opponents
        .map(v => {
          const e = byVariant[v];
          if (!e) return null;
          if (!e.on) return e.off;
          if (!e.off) return e.on;
          return e.on.mean <= e.off.mean ? e.on : e.off;
        })
        .filter(Boolean)
        .sort((a, b) => a.mean - b.mean)[0];
      const c = compare(store, bestLib);
      if (c === null) continue;
      speedups.push(1 / c.ratio);
      if (c.tie) ties++;
      else if (c.ratio < 1) wins++;
      else losses++;
    }
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

// The headline: store + compiler vs the faster selector library, per config.
const vsSelectors = SCENARIOS.filter(([key]) => stats[key])
  .map(([key, title]) => ({key, title, t: tallyVsBest(stats, key, ['zustand', 'redux'])}));
const vsSelectorsTotal = vsSelectors.reduce(
  (a, {t}) => ({
    total: a.total + t.total,
    wins: a.wins + t.wins,
    ties: a.ties + t.ties,
    losses: a.losses + t.losses,
  }),
  {total: 0, wins: 0, ties: 0, losses: 0},
);
const selectorLosses = vsSelectors.filter(r => r.t.losses > 0).map(r => r.title);

// The same app built without enableSameElementBailout, for disclosure.
const noBailoutFiles = process.env.NOBAILOUT_FILES
  ? process.env.NOBAILOUT_FILES.split(',').map(f => path.resolve(f))
  : fs
      .readdirSync(resultsDir)
      .filter(f => /^full-final-nobailout.*\.json$/.test(f) && !f.includes('discarded'))
      .map(f => path.join(resultsDir, f));
const noBailoutStats = buildMainStats(
  noBailoutFiles
    .flatMap(f =>
      JSON.parse(fs.readFileSync(f, 'utf8')).results.map(r => ({...r, file: path.basename(f)})),
    )
    .filter(r => r.kind === 'update'),
);
const noBailout = Object.keys(noBailoutStats).map(key => ({
  key,
  title: SCENARIOS.find(([k]) => k === key)?.[1] ?? key,
  t: tallyVsBest(noBailoutStats, key, ['zustand', 'redux']),
}));

// Memory per row at the largest size, with the compiler.
function bytesPerRow(variant) {
  const rows = memory.filter(m => m.variant === variant && m.compiler);
  if (rows.length === 0) return null;
  const largest = rows.reduce((a, b) => (a.n >= b.n ? a : b));
  return largest.bytesPerRow;
}

const selectionVsZustand = tally('selection', 'store', 'zustand');
const singleVsZustand = tally('selection', 'store-single', 'zustand');
const inlineVsRedux = tally('details-inline', 'store', 'redux');
const filterVsContext = tally('filter', 'store', 'context');
const noCompilerSpeedups = noCompilerRows
  .filter(r => r.store !== null)
  .map(r => 1 / r.store.ratio);
const noCompilerSelection = {
  min: Math.min(...noCompilerSpeedups),
  max: Math.max(...noCompilerSpeedups),
};
const inlineVsZustand = tally('details-inline', 'store', 'zustand');

// Work counters for one update at N=1,000, keyed by "scenario bundle".
const countsBy = Object.fromEntries(
  counts.map(c => [c.scenario + ' ' + c.bundle, c]),
);
function work(scenario, bundle) {
  return countsBy[scenario + ' ' + bundle] ?? null;
}
const workRows = [
  ['selection', 'store', 'use(store)'],
  ['selection', 'redux', 'Redux'],
  ['selection', 'zustand', 'Zustand'],
  ['details-inline', 'store', 'use(store)'],
  ['details-inline', 'redux', 'Redux'],
  ['details-inline', 'zustand', 'Zustand'],
]
  .map(([scenario, variant, name]) => ({
    scenario,
    name,
    variant,
    counts: work(scenario, variant + ' +compiler'),
    time: get(scenario, 1000, 1, variant, true),
  }))
  .filter(r => r.counts !== null);
const reduxSelectionWork = work('selection', 'redux +compiler');

const code = await codeExamples();

// The other suites: run-all-quiet.sh results by default, or SUITE_FILES (a
// comma-separated list of result files).
const suiteFiles = process.env.SUITE_FILES
  ? process.env.SUITE_FILES.split(',').map(f => path.resolve(f))
  : undefined;
const suitesHtml = suitesSection(suiteFiles);
const derived = derivedSummary(suiteFiles);
const sweeps = sweepSummary(suiteFiles);
// "1.2–1.4× slower" style range of store/best ratios across throttles.
function ratioRange(entries) {
  return entries ? ratioRangeOf(entries.map(e => e.ratio)) : null;
}

// ---------------------------------------------------------------- charts

function chart(scenario, n, throttle) {
  const rows = VARIANTS.map(variant => ({
    variant,
    off: get(scenario, n, throttle, variant, false),
    on: get(scenario, n, throttle, variant, true),
  })).filter(r => r.off || r.on);
  if (rows.length === 0) {
    return '';
  }
  const max = Math.max(
    ...rows.flatMap(r => [r.off?.median ?? 0, r.on?.median ?? 0]),
  );
  const bar = (entry, cls) =>
    entry
      ? `<div class="barrow"><span class="track"><span class="fill ${cls}" style="width:${((entry.median / max) * 100).toFixed(1)}%"></span></span><span class="num">${ms(entry)}</span></div>`
      : '';
  return `<div class="chart"><div class="charttitle">N=${n.toLocaleString()} · CPU ${throttle}×</div>${rows
    .map(
      r =>
        `<div class="group"><div class="vname${r.variant.startsWith('store') ? ' storename' : ''}">${r.variant}</div><div>${bar(r.off, 'off')}${bar(r.on, 'on' + (r.variant.startsWith('store') ? ' store' : ''))}</div></div>`,
    )
    .join('')}</div>`;
}

// ---------------------------------------------------------------- tables

const countRows = counts
  .map(c => ({...c}))
  .filter(c => c.scenario && c.bundle);

// Typing and memory runs from every restart are merged per configuration.
function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    if (!groups.has(k)) {
      groups.set(k, []);
    }
    groups.get(k).push(item);
  }
  return [...groups.values()];
}

const typing = groupBy(
  results.filter(r => r.kind === 'typing'),
  r => [r.variant, r.compiler, r.throttle].join('|'),
)
  .map(runs => {
    const r = runs[0];
    const latencies = runs.flatMap(run => run.latencies);
    return {
      name: r.variant + (r.compiler ? ' +compiler' : ''),
      variant: r.variant,
      compiler: r.compiler,
      throttle: r.throttle,
      p50: median(latencies),
      p95: percentile(latencies, 0.95),
      max: Math.max(...latencies),
      settleMs: Math.round(median(runs.map(run => run.settleMs))),
    };
  })
  .sort(
    (a, b) =>
      a.throttle - b.throttle ||
      VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) ||
      Number(a.compiler) - Number(b.compiler),
  );

const memory = groupBy(
  results.filter(r => r.kind === 'memory'),
  r => [r.variant, r.compiler, r.n].join('|'),
)
  .map(runs => ({
    ...runs[0],
    mountMs: median(runs.map(run => run.mountMs)),
    bytesPerRow: median(runs.map(run => run.bytesPerRow)),
  }))
  .sort(
    (a, b) =>
      a.n - b.n ||
      VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) ||
      Number(a.compiler) - Number(b.compiler),
  );

const updateCount = results.filter(r => r.kind === 'update').length;
const sampleCount = results
  .filter(r => r.kind === 'update')
  .reduce((a, r) => a + r.durations.length, 0);

// A hand-written interpretation of the results, if there is one.
const findingsPath = path.join(resultsDir, 'findings.html');
const findings = fs.existsSync(findingsPath)
  ? `<h2>Scenario by scenario</h2>${fs.readFileSync(findingsPath, 'utf8')}`
  : '';

// ---------------------------------------------------------------- html

const headlineHeader = [
  'store vs redux<br><small>selection</small>',
  'store vs zustand<br><small>selection</small>',
  'store-single vs redux<br><small>selection</small>',
  'store vs redux<br><small>entity</small>',
  'store vs redux<br><small>inline conditional</small>',
  'store vs redux<br><small>child conditional</small>',
];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>use(store) + the compiler vs selectors</title>
<style>
:root{--bg:#0f1115;--panel:#171a21;--panel2:#1e222b;--text:#e6e8ee;--muted:#9aa3b2;--accent:#58c4dc;--accent2:#a78bfa;--good:#4ade80;--bad:#f87171;--warn:#fbbf24;--border:#2a2f3a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:48px 24px 80px}
h1{font-size:38px;margin:0 0 8px;letter-spacing:-.02em}h2{font-size:24px;margin:48px 0 8px}h3{font-size:17px;margin:28px 0 8px}
.sub{color:var(--muted);margin:0 0 20px}.muted{color:var(--muted)}
code{font:13px ui-monospace,Menlo,monospace;background:var(--panel2);padding:1px 6px;border-radius:5px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
@media(max-width:860px){.g2,.g3{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.r,th.r{text-align:right}
.win{color:var(--good);font-weight:600}.loss{color:var(--bad);font-weight:600}.tie{color:var(--warn);font-weight:600}
.legend{display:flex;gap:18px;color:var(--muted);font-size:13px;margin:4px 0 12px}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.chart{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px}
.charttitle{color:var(--muted);font-size:13px;margin-bottom:8px}
.group{display:grid;grid-template-columns:130px 1fr;gap:10px;align-items:center;margin:6px 0}
.vname{font-size:13px}.storename{color:var(--accent);font-weight:600}
.barrow{display:grid;grid-template-columns:1fr 64px;gap:8px;align-items:center;margin:2px 0}
.track{background:var(--panel2);border-radius:4px;height:10px;overflow:hidden}
.fill{display:block;height:100%}.fill.off{background:#4b5263}.fill.on{background:var(--accent2)}.fill.on.store{background:var(--accent)}
.num{font:12px ui-monospace,Menlo,monospace;color:var(--muted);text-align:right}
.callout{border-left:3px solid var(--accent);background:var(--panel);padding:14px 18px;border-radius:0 12px 12px 0;margin:0 0 16px}
.callout.warn{border-color:var(--warn)}
.code{background:#0b0d11;border:1px solid var(--border);border-radius:10px;padding:12px 0;margin:0;overflow-x:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace;color:#d4d8e1}
.g2 .code{font-size:11.5px}
.code .ln{display:block;padding:0 14px;white-space:pre;position:relative}
.code .hl{background:rgba(88,196,220,.13);box-shadow:inset 3px 0 var(--accent)}
.code .hlbad{background:rgba(248,113,113,.10);box-shadow:inset 3px 0 var(--bad)}
.code .note{display:block;font:italic 11.5px -apple-system,sans-serif;color:var(--warn);padding:1px 0 3px}
.tk{color:#c792ea}.ts{color:#c3e88d}.tc{color:#6b7385;font-style:italic}.tt{color:#82aaff}.tn{color:#f78c6c}.th{color:var(--accent);font-weight:600}
.codehead{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px}.codehead b{font-size:15px}.codehead span{color:var(--muted);font-size:13px}
details>summary{cursor:pointer;color:var(--muted);margin:8px 0}
.lead{font-size:17px;line-height:1.65;max-width:820px}
a{color:var(--accent)}
h4{font-size:14px;margin:18px 0 6px;color:var(--muted)}
.kpi{text-align:center}.kpi .v{font-size:30px;font-weight:700;color:var(--accent)}.kpi .l{color:var(--muted);font-size:13px}
</style></head><body><div class="wrap">

<h1>use(store) + the compiler vs selectors</h1>
<p class="sub">Benchmark results · ${new Date(env.date).toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})} · ${env.cpu} · ${env.platform}</p>

<p class="lead">Selector libraries decide what to re-render by running <em>every</em> mounted selector on <em>every</em> update. use(store) does the opposite: every component that reads a changed store re-renders, and the React Compiler makes the ones whose output didn't change return their cached element. The claim is that the second model is cheaper. Below, the same app is built 7 ways and timed with and without the compiler.</p>

<div class="grid g3">
  <div class="card kpi"><div class="v">${vsSelectorsTotal.wins + vsSelectorsTotal.ties}/${vsSelectorsTotal.total}</div><div class="l">configurations where use(store) + compiler matched or beat the <strong>faster</strong> of Redux and Zustand (${vsSelectorsTotal.wins} faster, ${vsSelectorsTotal.ties} tie, ${vsSelectorsTotal.losses} slower)</div></div>
  <div class="card kpi"><div class="v">${vsRedux.wins}/${vsRedux.total}</div><div class="l">faster than <strong>Redux</strong>; ${vsZustand.wins}/${vsZustand.total} faster than <strong>Zustand</strong> (${vsZustand.ties} tie, ${vsZustand.losses} slower)</div></div>
  <div class="card kpi"><div class="v">${reduxSelectionWork ? reduxSelectionWork.selectors.toLocaleString() + ' → 0' : '–'}</div><div class="l">selector calls to change the selected row of 1,000: Redux vs use(store), which re-runs the 1,000 Rows instead</div></div>
</div>

<div class="callout">
<strong>Short version.</strong> In the main benchmark, with the compiler, use(store) ${selectorLosses.length === 0 ? `matched or beat the faster of Redux and Zustand in every scenario, at every size and CPU speed` : `beat the faster of Redux and Zustand everywhere except <em>${selectorLosses.join(', ').toLowerCase()}</em>`}: ${vsSelectorsTotal.wins} of ${vsSelectorsTotal.total} configurations faster, ${vsSelectorsTotal.ties} tied, ${vsSelectorsTotal.losses} slower. That includes <em>selection</em>, the case selectors are built for (one value read by every row, two rows change): ${describe(vsSelectors.find(r => r.key === 'selection')?.t ?? {total: 0})} vs the faster library. Getting there took a general reconciler optimization, behind a flag, that lets a compiled component that returns its cached element skip reconciling it${noBailout.length > 0 ? ` (without it, selection is ${describe(noBailout.find(r => r.key === 'selection')?.t ?? {total: 0})})` : ''}. It doesn't win everywhere, and the <a href="#where-selectors-win">caveats</a> list where: ${[sweeps?.selection?.['c100-w8'] && sweeps.selection['c100-w8'].some(e => e.ratio > 1) ? `rows that select only 2 values (selection ${ratioRange(sweeps.selection['c100-w8'])} vs Zustand)` : null, sweeps?.selection?.['c90-w8'] ? 'partially compiled apps' : null, derived.store && derived.store.losses > 0 ? `expensive derived data shared by many components (${describe(derived.store)} vs Redux, fixable with a shared cache)` : null].filter(Boolean).join('; ')}. The compiler is required: without it, use(store) loses fan-out reads badly.
</div>

<h2>The code</h2>
<p class="sub">This is the measured source, with the counting instrumentation removed. Every variant renders the same <code>RowView</code>, and the DOM was checked to be byte-identical across all 14 bundles.</p>

<div class="grid g2">
<div>
<div class="codehead"><b>use(store)</b><span>src/apps/store.jsx</span></div>
${code.storeRow}
</div>
<div>
<div class="codehead"><b>Redux</b><span>src/apps/redux.jsx</span></div>
${code.reduxRow}
</div>
</div>
<details><summary>Zustand Row (the same shape, with <code>useBench</code>)</summary>${code.zustandRow}</details>
<details><summary>How the use(store) state is set up and updated</summary>${code.storeSetup}</details>

<div class="grid g2" style="margin-top:16px">
<div class="card"><h3 style="margin-top:0">Selectors: cost scales with what's mounted</h3>
<ul>
<li>Every <code>useSelector</code> runs on every dispatch, so react-redux can decide whether its component re-renders. With 1,000 rows that's about 5,000 calls per update, whatever changed.</li>
<li>Hooks can't be conditional, so a row that isn't expanded still subscribes to <code>details</code> and selects <code>null</code> on every update.</li>
<li>Derived values need a selector, often a memoized one, to avoid re-rendering.</li>
</ul></div>
<div class="card"><h3 style="margin-top:0">use(store): cost scales with what changed</h3>
<ul>
<li>Only components that read the changed store re-render. A store per entity means an entity edit re-renders one row.</li>
<li><code>use()</code> can be called conditionally, so rows that aren't expanded never subscribe to <code>details</code>.</li>
<li>Derived values are plain code. The compiler memoizes them, and it caches the JSX on the values it depends on.</li>
</ul></div>
</div>

<h3>What the compiler does with that Row</h3>
<p class="sub">The real compiler output for the store <code>Row</code> (the same build the timed bundles use). When the selection changes, every Row re-runs. The reads are cheap, because each store's value is computed once per render for the whole root, not once per component. Then 8 comparisons run, and 998 of 1,000 Rows return <code>$[14]</code> without rendering <code>RowView</code>. That bailout is the entire trick.</p>
${code.compiledRow}

${
  workRows.length > 0
    ? `<h3>Work for one update at N=1,000</h3>
<p class="sub">From the counting build, everything compiled. Same DOM result in each row.</p>
<div class="card"><table>
<tr><th>scenario</th><th>variant</th><th class="r">component renders</th><th class="r">of which Row</th><th class="r">selector calls</th><th class="r">median ms (1× CPU)</th></tr>
${workRows.map(r => `<tr><td>${r.scenario}</td><td>${r.variant === 'store' ? '<span class="storename">' + r.name + '</span>' : r.name}</td><td class="r">${r.counts.renders.toLocaleString()}</td><td class="r">${r.counts.rows.toLocaleString()}</td><td class="r">${r.counts.selectors.toLocaleString()}</td><td class="r">${ms(r.time)}</td></tr>`).join('')}
</table></div>
<div class="callout"><strong>The cleanest comparison is <em>details-inline</em>.</strong> All three variants render exactly the same components: the 10 expanded rows. The only difference is that Redux and Zustand also run every row's selectors to find those 10. That alone makes them ${x(inlineVsRedux.min)}–${x(inlineVsRedux.max)}× (Redux) and ${x(inlineVsZustand.min)}–${x(inlineVsZustand.max)}× (Zustand) slower across every size and CPU setting. That's the cost of selectors, isolated.</div>`
    : ''
}

<h2>Scoreboard</h2>
<p class="sub">use(store) + compiler vs each library's <em>best</em> configuration (with or without the compiler, whichever was faster), across ${nValues.map(n => n.toLocaleString()).join(' / ')} rows at ${throttles.map(t => t + '×').join(' and ')} CPU. ${VERDICT_RULE}</p>
<div class="card"><table>
<tr><th>scenario</th>${OPPONENTS.map(o => `<th>vs ${o}</th>`).join('')}</tr>
${scoreboard.map(r => `<tr><td>${r.title}</td>${OPPONENTS.map(o => `<td>${range(r.tallies[o])}</td>`).join('')}</tr>`).join('')}
</table></div>

<h2 id="where-selectors-win">Caveats, and where it doesn't win</h2>
<div class="callout warn">
<ul>
${derived.store ? `<li><strong>Shared expensive derived data.</strong> In the Redux team's <em>derived-selectors</em> benchmark, plain use(store) is ${describe(derived.store)} vs Redux. Five components share each expensive result: <code>createSelector</code> computes it once, while the compiler memoizes per component, so use(store) computes it five times. ${derived.sharing ? `A cache keyed on store snapshots (correct under concurrency, since snapshots are immutable) fixes it: the fastest correct sharing option is ${describe(derived.sharing)} vs Redux.` : ''} That cache is an API decision, not an implementation detail.</li>` : ''}
${sweeps?.selection?.['c100-w8'] ? `<li><strong>Selection depends on how many values each row selects.</strong> The main suite's rows read ${code.perRow.storeReads} stores (${code.perRow.reduxSelectors === code.perRow.zustandSelectors ? `${code.perRow.reduxSelectors} selectors in Redux and Zustand` : `${code.perRow.reduxSelectors} selectors in Redux, ${code.perRow.zustandSelectors} in Zustand`}; the details-inline rows run ${code.perRow.reduxInlineSelectors} Redux selectors, one of them the details selector that can't be conditional). In the sweeps, rows read only 2 (entity and selection), so the selector libraries run just 2 cheap selectors per row, and selection is ${ratioRange(sweeps.selection['c100-w8'])} for use(store) vs the faster library (4 props: ${ratioRange(sweeps.selection['c100-w4'])}; 16 props: ${ratioRange(sweeps.selection['c100-w16'])}). When every row reads a changed value that almost never changes its output, a few cheap selectors are cheaper than re-running each row and bailing out. Entity edits stay ${ratioRange(sweeps.entity?.['c100-w8'])}.</li>` : ''}
${sweeps?.selection?.['c90-w8'] ? `<li><strong>Partial compiler coverage hurts fan-out reads a lot.</strong> With 90/75/50% of rows compiled, selection is ${['c90-w8', 'c75-w8', 'c50-w8'].map(c => ratioRange(sweeps.selection[c])).join(' / ')} for use(store) vs the faster library, because each uncompiled row re-renders its whole subtree. Entity edits don't care (${ratioRange(sweeps.entity?.['c50-w8'])} at 50%).</li>` : ''}
<li><strong>The compiler isn't optional for fan-out reads.</strong> Without it, use(store) is ${slower(noCompilerSelection)} slower than Redux on <em>selection</em> (both without the compiler), because every Row re-renders <code>RowView</code> too. Without the compiler, treat use(store) as a granular-store API.</li>
<li><strong>The selection result depends on <code>enableSameElementBailout</code>,</strong> a general reconciler change (behind its own flag, full test suite green, in review). ${noBailout.length > 0 ? `Without it: ${noBailout.map(r => `${r.title.toLowerCase()} ${describe(r.t)}`).join('; ')}, vs the faster of Redux and Zustand.` : 'Numbers without it are pending.'} It speeds up every compiled re-render, context included, so it isn't store-specific.</li>
${scoreboard.find(r => r.key === 'filter')?.tallies.context.losses > 0 ? `<li><strong>Compiled context is faster on <em>filter</em> in some configurations</strong> (${describe(filterVsContext)}): context re-renders the same rows with one <code>useContext</code> each, while the store Row makes four <code>use()</code> calls. Context can't do the granular cases (entity, conditional reads, list changes), where use(store) is far ahead.</li>` : ''}
${bytesPerRow('store') !== null ? `<li><strong>Memory.</strong> At the largest size, use(store) uses ${Math.round(bytesPerRow('store')).toLocaleString()} bytes per row, vs ${['context', 'zustand', 'redux'].map(v => bytesPerRow(v) === null ? null : `${v} ${Math.round(bytesPerRow(v)).toLocaleString()}`).filter(Boolean).join(', ')}.</li>` : ''}
<li><strong>Single-process headless Chromium</strong> on a laptop with background load; every timing was gated on load and taken in interleaved restarts. Ratios between variants are what matter, not absolute numbers.</li>
</ul>
</div>

${suitesHtml}

<h2>By size and CPU</h2>
<p class="sub">The individual comparisons behind the scoreboard: use(store) with the React Compiler, against each library's <em>best</em> configuration (with or without the compiler, whichever is faster). "Faster" means use(store) takes less time per update. ${VERDICT_RULE}</p>
<div class="card"><table>
<tr><th>N</th><th>CPU</th>${headlineHeader.map(h => `<th>${h}</th>`).join('')}</tr>
${headlineRows.map(r => `<tr><td>${r.n.toLocaleString()}</td><td>${r.throttle}×</td>${r.cells.map(c => `<td>${verdict(c)}</td>`).join('')}</tr>`).join('')}
</table></div>

<h3>Selection without the compiler</h3>
<p class="sub">How much of the selection result comes from the compiler's bailouts.</p>
<div class="card"><table>
<tr><th>N</th><th>CPU</th><th>store vs redux, no compiler</th><th>store + compiler vs store without</th></tr>
${noCompilerRows.map(r => `<tr><td>${r.n.toLocaleString()}</td><td>${r.throttle}×</td><td>${verdict(r.store)}</td><td>${verdict(r.storeCompiler)}</td></tr>`).join('')}
</table></div>

${findings}

<h2>Update cost by scenario</h2>
<p class="sub">Median milliseconds per update inside <code>flushSync</code>, so every library renders synchronously and selector work during dispatch is included. Lower is better.</p>
<div class="legend"><span><span class="sw" style="background:#4b5263"></span>compiler off</span><span><span class="sw" style="background:var(--accent2)"></span>compiler on</span><span><span class="sw" style="background:var(--accent)"></span>use(store), compiler on</span></div>
${SCENARIOS.filter(([key]) => stats[key])
  .map(
    ([key, title, description]) => `
<h3>${title} <span class="muted" style="font-weight:400">· ${description}</span></h3>
${throttles
  .map(
    throttle =>
      `<div class="grid ${nValues.length >= 3 ? 'g3' : 'g2'}">${nValues.map(n => chart(key, n, throttle)).join('')}</div>`,
  )
  .join('<div style="height:12px"></div>')}`,
  )
  .join('')}

${
  countRows.length > 0
    ? `<h2>Work per update</h2>
<p class="sub">From the counting build at N=1,000: component renders, <code>Row</code> renders, and selector calls for one update. This is why the timings look the way they do.</p>
<div class="card"><table>
<tr><th>scenario</th><th>variant</th><th class="r">renders</th><th class="r">rows</th><th class="r">selectors</th></tr>
${countRows.map(c => `<tr><td>${c.scenario}</td><td>${c.bundle}</td><td class="r">${c.renders.toLocaleString()}</td><td class="r">${c.rows.toLocaleString()}</td><td class="r">${c.selectors.toLocaleString()}</td></tr>`).join('')}
</table></div>`
    : ''
}

${
  typing.length > 0
    ? `<h2>Typing during an expensive re-filter</h2>
<p class="sub">Typing 19 characters into the filter while ${(results.find(r => r.kind === 'typing')?.n ?? 0).toLocaleString()} expensive rows re-filter. Latency is keydown → next frame. "List caught up" is the time from the start of typing until the list shows the rows for the full typed text, so it includes the typing itself. use(store) and context render the list in a transition; Redux and Zustand also call <code>startTransition</code>, but useSyncExternalStore renders synchronously anyway.</p>
<div class="card"><table>
<tr><th>variant</th><th>CPU</th><th class="r">p50 ms</th><th class="r">p95 ms</th><th class="r">max ms</th><th class="r">list caught up after ms</th></tr>
${typing.map(t => `<tr><td>${t.name}</td><td>${t.throttle}×</td><td class="r">${t.p50.toFixed(1)}</td><td class="r">${t.p95.toFixed(1)}</td><td class="r">${t.max.toFixed(1)}</td><td class="r">${t.settleMs}</td></tr>`).join('')}
</table></div>`
    : ''
}

${
  memory.length > 0
    ? `<h2>Mount time and memory</h2>
<p class="sub">Heap growth after mounting N rows (after GC), divided by N, and the time to mount.</p>
<div class="card"><table>
<tr><th>variant</th><th class="r">N</th><th class="r">mount ms</th><th class="r">bytes per row</th></tr>
${memory.map(m => `<tr><td>${m.variant}${m.compiler ? ' +compiler' : ''}</td><td class="r">${m.n.toLocaleString()}</td><td class="r">${m.mountMs.toFixed(1)}</td><td class="r">${Math.round(m.bytesPerRow).toLocaleString()}</td></tr>`).join('')}
</table></div>`
    : ''
}

<h2>Methodology</h2>
<div class="card">
<ul>
<li><strong>Variants.</strong>
  <ul>
  <li><code>store</code>: a store per entity, plus small stores for shared state.</li>
  <li><code>store-single</code>: one store, no selectors (the worst case for stores).</li>
  <li><code>context</code>: useReducer at the root, one context.</li>
  <li><code>context-split</code>: one context per slice, memo rows.</li>
  <li><code>redux</code>: RTK createSlice, react-redux useSelector, createSelector.</li>
  <li><code>zustand</code>: one store, a selector per component.</li>
  <li><code>zustand-granular</code>: a store per entity (a control for granularity).</li>
  </ul>
  Every variant renders the same shared <code>RowView</code>, and the DOM was verified byte-identical across all 14 bundles in every scenario.</li>
<li><strong>Compiler.</strong> <code>babel-plugin-react-compiler</code> from this repo with <code>panicThreshold: 'all_errors'</code>, so every component in every variant was compiled.</li>
<li><strong>Timing.</strong> Each update runs in <code>flushSync</code>. Updates are timed in batches of at least 5 ms, and each batch is divided by the number of updates in it. That's ${env.iterations} samples after ${env.warmup} warm-up updates, in a fresh browser per configuration, in randomized order, ${env.restarts} times. Chromium's CPU throttling is used for the 4× runs.</li>
<li><strong>Typing.</strong> Playwright types with a 50 ms delay. Latency is measured from keydown to the first frame after it.</li>
<li><strong>Memory.</strong> CDP <code>HeapProfiler.collectGarbage</code> and <code>Runtime.getHeapUsage</code>, before and after mount.</li>
<li><strong>Versions.</strong> ${Object.entries(versions).map(([k, v]) => `${k} ${v}`).join(' · ')} · node ${env.node}</li>
</ul>
</div>

<div class="callout warn"><strong>Caveats.</strong>
<ul>
<li>This ran in headless Chromium in single-process mode (the renderer runs on a thread of the browser process), because the environment doesn't allow launching renderer processes. V8 and React do the same work, so the comparisons between variants hold, but absolute numbers may differ from regular Chrome.</li>
<li>Without cross-origin isolation the timer resolution is 100 µs. Batching keeps that to a couple of percent per sample.</li>
<li>RTK's Immer auto-freeze is on, which is its documented default.</li>
<li>Rows aren't wrapped in <code>memo</code> except in <code>context-split</code>, so list changes re-render rows in every variant.</li>
<li>The workload is synthetic: an entity list with fixed render work per row. Real apps will vary. The work counters show how the costs scale.</li>
</ul></div>

<p class="muted">Raw data: ${timingFiles.map(f => '<code>' + path.relative(here, f) + '</code>').join(', ')}${countsFile ? `, <code>${path.relative(here, countsFile)}</code>` : ''}. Harness: <code>fixtures/store-bench</code>.</p>
</div></body></html>`;

fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'report.html'), html);

// A short markdown version for quick reading.
let md = `# use(store) benchmark results\n\n${env.date} · ${env.cpu}\n\n## Headline (store + compiler vs each library's best configuration)\n\n| N | CPU | ${headlineHeader.map(h => h.replace(/<br><small>/, ' · ').replace(/<\/small>/, '')).join(' | ')} |\n|---|---|${headlineHeader.map(() => '---').join('|')}|\n`;
for (const r of headlineRows) {
  md += `| ${r.n} | ${r.throttle}× | ${r.cells
    .map(c => (c === null ? 'n/a' : c.tie ? 'tie' : c.ratio < 1 ? `${(1 / c.ratio).toFixed(1)}× faster` : `${c.ratio.toFixed(1)}× slower`))
    .join(' | ')} |\n`;
}
fs.writeFileSync(path.join(outDir, 'report.md'), md);

// Also export the computed numbers so a written summary can quote them.
fs.writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify({env, versions, stats, typing, memory}, null, 1),
);

console.log(
  `wrote ${path.relative(here, outDir) || '.'}/report.html, report.md and summary.json from ${path.relative(here, timingFile)}`,
);
