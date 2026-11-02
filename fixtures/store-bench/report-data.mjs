// Computes every number the use(store) reports cite, from the result files
// pinned in results/report-sources.json, and writes them to
// docs/use-store/data/bench-data.json for docs/use-store/tools/build-docs.mjs.
//
//   node report-data.mjs               Writes bench-data.json and KEYS.md
//   node report-data.mjs --check       Exits 1 if regenerating would change them
//   node report-data.mjs --status      Prints each pinned set and its status
//   node report-data.mjs --pin-head [set ...]
//                                      Pins the head re-run's files (every set
//                                      by default) and marks the sets 'head'
//                                      (--partial: pins what exists so far as
//                                      'partial-head', for previews)
//   node report-data.mjs --pin-history
//                                      Re-pins each history set (status
//                                      'history': an older run kept for
//                                      comparison, outside the head check)
//                                      from its historyPattern
//   node report-data.mjs --sources=<pins.json> --out=<data.json>
//                                      Computes from another pin list (the G5
//                                      fixture), writing only the data
//
// bench-data.json is {build, sources, values, series}:
// - values[key] = {value, display, unit, source}, cited in the docs as
//   <span data-n="key">. KEYS.md lists every key.
// - series holds the structured numbers the charts and tables are drawn from
//   (charts.mjs).
// Nothing in it depends on the time it was generated, so regenerating from
// the same pinned files gives the same bytes.

import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath, pathToFileURL} from 'url';
import {median, percentile, verdict, ms} from './stats.mjs';
import {
  SUITES,
  SHARING,
  SWEEP_CONFIGS,
  SWEEP_LIBRARIES,
  SWEEP_STORES,
  EXTRA_VERDICTS,
  resultsDir,
  sourcesPath,
  readSources,
  pinnedFiles,
  load,
  name,
  updateStats,
  bestOf,
  sortGroups,
  sweepEntries,
  agreedCompare,
  VERDICT_RULE,
} from './report-suites.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
export const dataDir = path.join(repo, 'docs/use-store/data');
export const dataPath = path.join(dataDir, 'bench-data.json');
export const keysPath = path.join(dataDir, 'KEYS.md');
const chartsPath = path.join(repo, 'docs/use-store/tools/charts.mjs');

// ---------------------------------------------------------------- the main suite

export const VARIANTS = [
  'store',
  'store-single',
  'context',
  'context-split',
  'redux',
  'zustand',
  'zustand-granular',
];
export const SCENARIOS = [
  ['selection', 'Selection', 'Every row reads the selected id; 2 rows change'],
  ['entity', 'Entity edit', 'One entity changes'],
  ['filter', 'Filter', 'Every row derives whether it matches; half change'],
  [
    'details-inline',
    'Conditional read (inline)',
    '1% of rows read a hot value in the row itself',
  ],
  [
    'details-component',
    'Conditional read (child component)',
    '1% of rows read a hot value in a child that only mounts when expanded',
  ],
  [
    'details-churn',
    'Subscribe churn',
    "Every 10th row's details mount, then unmount, so readers subscribe and unsubscribe",
  ],
  ['structure', 'Add / remove', 'Add and remove one row'],
];

// Scenario names for running text, lowercase mid-sentence
// (docs/use-store/src/style-sheet.md "Scenarios"). Titles stay for tables.
export const SCENARIO_PROSE = {
  selection: 'selection',
  entity: 'entity edit',
  filter: 'filter',
  'details-inline': 'the inline conditional read',
  'details-component': 'the conditional read in a child component',
  'details-churn': 'subscribe churn',
  structure: 'add / remove',
};
const prose = sc => SCENARIO_PROSE[sc] ?? sc;

// The components the main app's counting build counts: top-level functions
// that call countRender (src/shared/views.jsx). Every Row-like component
// counts as kind 'row', so they're listed once, as Row. App, the list and
// Details aren't counted.
function countedComponents() {
  const appsDir = path.join(here, 'src/apps');
  const files = [
    ...fs.readdirSync(appsDir).filter(f => f.endsWith('.jsx') && !f.startsWith('sweep-')).map(f => path.join(appsDir, f)),
    path.join(here, 'src/shared/views.jsx'),
  ];
  const names = [];
  for (const f of files) {
    const blocks = fs.readFileSync(f, 'utf8').split(/\n(?=(?:export )?(?:function |const \w+ = ))/);
    for (const block of blocks) {
      const fn = block.match(/^(?:export )?function (\w+)\(/)?.[1];
      const kind = block.match(/\bcountRender\('(\w+)'\)/)?.[1];
      if (!fn || !kind) continue;
      const shown = kind === 'row' ? 'Row' : fn;
      if (!names.includes(shown)) names.push(shown);
    }
  }
  return names;
}
const COUNTED = countedComponents();
const COUNTED_TEXT = `counted renders (${listText(COUNTED)})`;

// Builds stats[scenario][n][throttle][variant][on|off] = summary from update
// results (the shape report.mjs uses).
export function buildMainStats(updateResults) {
  const out = {};
  for (const [group, byVariant] of updateStats(updateResults)) {
    const [scenario, n, throttle] = group.split('|');
    for (const [key, summary] of byVariant) {
      const [variant, c] = key.split(' ');
      ((((out[scenario] ??= {})[n] ??= {})[throttle] ??= {})[variant] ??= {})[
        c === '+c' ? 'on' : 'off'
      ] = summary;
    }
  }
  return out;
}

// ---------------------------------------------------------------- formatting

// Two decimals when one would read "1.0", so a near-parity ratio still says
// which way it goes.
export function x(value) {
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1) === '1.0' ? value.toFixed(2) : value.toFixed(1);
}

// "1.2–1.4× faster", "up to 1.3× faster (5 faster, 1 tie)", "1.2–1.4× slower"
// for a tally of comparisons (speedups are the other time / store time).
export function describe(t) {
  if (!t || t.total === 0) return t?.noWork ? (t.unread === t.noWork ? 'unread updates (no work)' : 'no work') : 'n/a';
  if (t.noWork) {
    const what = t.unread === t.noWork ? `unread update${t.noWork === 1 ? '' : 's'} (no work)` : 'with no work';
    return `${describe({...t, noWork: 0, unread: 0})}, and ${t.noWork} ${what}`;
  }
  const counts = [
    t.wins && `${t.wins} faster`,
    t.ties && `${t.ties} tie`,
    t.losses && `${t.losses} slower`,
  ]
    .filter(Boolean)
    .join(', ');
  if (t.wins === 0 && t.losses === 0) return counts;
  const span = (a, b) => (x(a) === x(b) ? `${x(a)}×` : `${x(a)}–${x(b)}×`);
  if (t.losses === 0 && t.ties === 0) return `${span(t.min, t.max)} faster`;
  if (t.wins === 0 && t.ties === 0) return `${span(1 / t.max, 1 / t.min)} slower`;
  if (t.losses === 0) return `up to ${x(t.max)}× faster (${counts})`;
  if (t.wins === 0) return `up to ${x(1 / t.min)}× slower (${counts})`;
  return `${x(1 / t.min)}× slower to ${x(t.max)}× faster (${counts})`;
}

// Slowdown ranges for "N× slower" sentences, as percentages when small.
export function slower(t) {
  const lo = Math.max(1, 1 / t.max);
  const hi = 1 / t.min;
  if (hi < 1.5) {
    return `${Math.round((lo - 1) * 100)}–${Math.round((hi - 1) * 100)}%`;
  }
  return `${x(lo)}–${x(hi)}×`;
}

// "1.2–1.4× slower" style range of store/best ratios.
export function ratioRange(ratios) {
  if (!ratios || ratios.length === 0) return null;
  const lo = Math.min(...ratios);
  const hi = Math.max(...ratios);
  const span = (a, b) => (x(a) === x(b) ? `${x(a)}×` : `${x(a)}–${x(b)}×`);
  if (lo >= 1) return `${span(lo, hi)} slower`;
  if (hi <= 1) return `${span(1 / hi, 1 / lo)} faster`;
  return `${x(1 / lo)}× faster to ${x(hi)}× slower`;
}

// stats.mjs compare with the restart-agreement rule (agreedCompare in
// report-suites.mjs), except that a left side did no measurable work when its
// median is 0 (below the timer resolution) or the update is unread (the
// counting build shows no variant rendering anything: the DOM never changes).
// That's "no work", and tallies count it apart instead of as a huge speedup
// (as storeVerdict in report-suites.mjs does).
export function judge(left, opponent, {unread = false} = {}) {
  if (!left || !opponent) return null;
  if (unread || left.median === 0) {
    return {ratio: left.mean / opponent.mean, tie: false, noWork: true, unread};
  }
  return agreedCompare(left, opponent);
}

// The verdict from stats.mjs as plain text: "1.4× faster", "tie", "n/a".
// A tie from the restart-agreement rule says so.
export function verdictText(c) {
  if (c?.noWork) return c.unread ? 'unread update' : 'no work';
  if (c?.split) return 'tie (restarts disagree)';
  // As x(): two decimals where one would read "1.0".
  if (c && !c.tie) {
    const r = c.ratio < 1 ? 1 / c.ratio : c.ratio;
    if (r.toFixed(1) === '1.0') return `${r.toFixed(2)}× ${c.ratio < 1 ? 'faster' : 'slower'}`;
  }
  return verdict(c).replace(/<[^>]+>/g, '');
}

export function tallyOf(comparisons) {
  const all = comparisons.filter(c => c !== null);
  const cs = all.filter(c => !c.noWork);
  const speedups = cs.map(c => 1 / c.ratio);
  return {
    total: cs.length,
    wins: cs.filter(c => !c.tie && c.ratio < 1).length,
    ties: cs.filter(c => c.tie).length,
    losses: cs.filter(c => !c.tie && c.ratio >= 1).length,
    // Ties only because the restarts disagreed on the direction.
    split: cs.filter(c => c.split).length,
    noWork: all.length - cs.length,
    unread: all.filter(c => c.unread).length,
    min: cs.length ? Math.min(...speedups) : null,
    max: cs.length ? Math.max(...speedups) : null,
  };
}

const r4 = v => (v === null || v === undefined ? null : Number(v.toPrecision(4)));
const int = v => v.toLocaleString('en-US');
const countDisplay = v =>
  Number.isInteger(v) ? int(v) : v.toLocaleString('en-US', {maximumFractionDigits: 1});
const msDisplay = v => ms({median: v});

// The parts of a summary the charts need, rounded.
function slim(s) {
  if (!s) return null;
  return {
    median: r4(s.median),
    p25: r4(s.p25),
    p75: r4(s.p75),
    p95: r4(s.p95),
    mean: r4(s.mean),
    sem: r4(s.sem),
    count: s.count,
  };
}

// The opponent a verdict compared with, from fastest(): which library, at
// which compiler setting, and its median and mean (ms).
function oppOf(best) {
  return best ? {variant: best.variant, compiler: best.compiler, median: r4(best.entry.median), mean: r4(best.entry.mean)} : null;
}

function slimVerdict(c) {
  return c === null
    ? null
    : {
        ratio: r4(c.ratio),
        tie: c.tie,
        split: Boolean(c.split),
        noWork: Boolean(c.noWork),
        unread: Boolean(c.unread),
        text: verdictText(c),
      };
}

// ---------------------------------------------------------------- keys

// Every key pattern, with a one-line meaning (KEYS.md). <scenario>, <variant>
// and so on are filled in; <compiler> is on or off; x<throttle> is the CPU
// throttle; n<n> the number of rows.
export const PATTERNS = {
  'build.label': 'The build provenance line: React version and sha, compiler hash, when the results were pinned. Placeholder text while any set is not from the frozen build.',
  'build.sha': 'Short git sha of the frozen React build the results were measured on.',
  'build.version': 'React version string of the frozen build.',
  'build.compiler': 'First 16 hex chars of the sha256 of the compiler dist used for the compiled bundles.',
  'build.pinnedAt': 'The date the result files were pinned in report-sources.json.',
  'build.status': '"head" when every set is from the frozen build, else "placeholder".',
  'method.cpu': 'CPU of the benchmark machine.',
  'method.browser': 'Chromium version (headless shell).',
  'method.node': 'Node version that ran the harness.',
  'method.iterations': 'Timed samples per configuration and restart in the main suite.',
  'method.warmup': 'Warm-up updates before timing, main suite.',
  'method.restarts': 'Browser restarts (interleaved runs) per configuration, main suite.',
  'method.samples': 'Timed samples per configuration in the main suite, across restarts (median over configurations).',
  'method.configs': 'Main-suite configurations: scenarios × sizes × CPU throttles.',
  'method.sizes': 'Row counts in the main suite, e.g. "100 / 1,000 / 10,000".',
  'method.throttles': 'CPU throttles in the main suite, e.g. "1× and 4×".',
  'method.verdictRule': 'How every store-vs-opponent verdict and tally is decided (VERDICT_RULE in report-suites.mjs): two standard errors, then the restart-agreement rule.',
  'method.gate.ambientStart': 'Ambient-CPU gate: a timed unit starts only when the cores in use outside the benchmark (ambient-cpu.mjs, three samples averaged) are at or below this.',
  'method.gate.ambientDiscard': 'Ambient-CPU gate: a timed unit is discarded and re-run when the mean ambient cores during it were above this.',
  'method.gate.<build>.timedFiles': 'Every pinned timed file (counts excluded), one gated unit each: ambientGated + loadGated. build is head or nobailout.',
  'method.gate.<build>.ambientGated': 'Pinned timed files with an ambient-CPU record, i.e. run under the ambient gate.',
  'method.restartsDefault': 'Main suite: the usual number of restarts per configuration.',
  'method.restartsExtra': 'Main suite: the scenario × throttle units with more restarts than usual, as text, or "none".',
  'method.restartsExtraCount': 'Main suite: the restarts the extra units got (when they all got the same number).',
  'method.restartsExtraAdded': 'Main suite: restarts added to each extra unit (restartsExtraCount − restartsDefault).',
  'method.verifySteps': 'The DOM check (run.mjs --verify): updates replayed per scenario before comparing every bundle\'s DOM.',
  'nobailout.main.flips': 'Which headline verdicts the same-element bailout changes, as text: configuration, verdict without it, verdict with it.',
  'nobailout.main.flipCount': 'How many headline verdicts the bailout changes.',
  'nobailout.main.flipScenarios': 'Where the bailout changes headline verdicts, in lowercase prose names, e.g. "two in selection and two in subscribe churn".',
  'method.restartsExtraUnits': 'Main suite: how many scenario × throttle units had more restarts than usual.',
  'main.<scenario>.n<n>.x<throttle>.bestMedian': 'Main suite: median ms of the exact opponent the verdict compares with (library and compiler setting in .best / .bestVariant / .bestCompiler).',
  'main.<scenario>.n<n>.x<throttle>.bestVariant': 'Main suite: the verdict\'s opponent library (redux or zustand).',
  'main.<scenario>.n<n>.x<throttle>.bestCompiler': 'Main suite: the verdict\'s opponent compiler setting, on or off.',
  'method.gate.<build>.loadGated': 'Pinned timed files run before the ambient gate existed, under the load-average gate only (no ambient record).',
  'method.gate.<build>.ambientMean.min': 'Lowest per-unit mean ambient CPU (cores) over the pinned units with an ambient record.',
  'method.gate.<build>.ambientMean.median': 'Median per-unit mean ambient CPU (cores) over the pinned units with an ambient record.',
  'method.gate.<build>.ambientMean.max': 'Highest per-unit mean ambient CPU (cores) over the pinned units with an ambient record.',
  'method.gate.<build>.ambientPeak': 'Highest single ambient-CPU sample (cores) during any pinned unit.',
  'method.gate.discards.total': 'Timed attempts discarded and re-run by the gate (head and nobailout logs).',
  'method.gate.discards.loadGate': 'Discards that happened under the load-average gate, before the ambient gate.',
  'method.gate.discards.ambientGate': 'Discards under the ambient-CPU gate.',
  'method.gate.history': 'One line: how the gate changed during the pinned runs, from the gate lines of the units logs.',
  'method.timedUpdates': 'Total timed update samples in the main suite.',
  'method.countsRows': 'Rows the counting build mounts for the main suite and fairness counts (run.mjs MODES.counts).',
  'sweep.rows': 'Rows in the sweeps, e.g. "1,000".',
  'nobailout.sizes': 'Row counts in the build without the same-element bailout, e.g. "1,000 and 10,000".',
  'nobailout.throttles': 'CPU throttles in the build without the same-element bailout.',
  'spike.ks': 'Readers per category (K) in the pinned spike, e.g. "20 and 50".',
  'spike.defaultK': 'Readers per category in the derived-selectors suite (the K the spike does not re-run).',
  'spike.tally.<left>.rangeWork': 'Spike: the range of speedups vs Redux over the comparisons with work, without the unread-update tail.',
  'spike.tally.<left>.noWork': 'Spike: comparisons with no work (unread updates).',
  'spike.tally.<left>.k<k>.rangeWork': 'Spike at one K: range over the comparisons with work.',
  'spike.tally.<left>.k<k>.noWork': 'Spike at one K: comparisons with no work.',
  'suite.<suite>.tally.<left>.rangeWork': 'Suite: range of speedups over the comparisons with work, without the unread-update tail.',
  'suite.<suite>.tally.<left>.noWork': 'Suite: comparisons with no work (unread updates).',
  'suite.<suite>.control.<variant>.wins': 'Fairness controls: configurations where the control (redux-plain, redux-nofreeze) is faster than redux, each at its faster compiler setting.',
  'suite.<suite>.control.<variant>.ties': 'Fairness controls: ties with redux.',
  'suite.<suite>.control.<variant>.losses': 'Fairness controls: configurations where the control is slower than redux.',
  'suite.<suite>.control.<variant>.total': 'Fairness controls: configurations compared.',
  'suite.<suite>.control.<variant>.range': 'Fairness controls: how much the control moves Redux\'s time, as text ("faster" means the control is faster than redux).',
  'nobailout.main.bailoutGain.<scope>.wins': 'What the bailout buys store + compiler (head build vs the build without it), per scenario or "all": configurations faster with the bailout.',
  'nobailout.main.bailoutGain.<scope>.ties': 'What the bailout buys: ties.',
  'nobailout.main.bailoutGain.<scope>.losses': 'What the bailout buys: configurations slower with the bailout.',
  'nobailout.main.bailoutGain.<scope>.total': 'What the bailout buys: configurations compared.',
  'nobailout.main.bailoutGain.<scope>.range': 'What the bailout buys: range of speedups with the bailout, as text.',
  'lib.<package>': 'Installed version of a compared library (redux, react-redux, @reduxjs/toolkit, zustand, reselect).',
  'main.<scenario>.n<n>.x<throttle>.<variant>.<compiler>.median': 'Main suite: median ms per update.',
  'main.<scenario>.n<n>.x<throttle>.verdict': 'Main suite: store + compiler vs the headline opponents (HEADLINE_OPPONENTS in report-data.mjs: the faster of Redux and Zustand, each at its faster compiler setting); value is the ratio of means (store / best), display is "1.4× faster", "tie" or "1.2× slower".',
  'main.<scenario>.n<n>.x<throttle>.best': 'Main suite: which library and compiler setting was the fastest headline opponent (HEADLINE_OPPONENTS) in that configuration.',
  'main.<scenario>.n<n>.x<throttle>.vsGranular': 'Main suite: store + compiler vs the granular control (zustand-granular, a Zustand store per entity) at its faster compiler setting. Not part of the headline.',
  'main.tally.<comparison>.<scenario>.wins': 'Main suite: configurations of the scenario the left side won (outside two standard errors, and faster in every restart: method.verdictRule). Comparisons: see KEYS.md "Comparisons".',
  'main.tally.<comparison>.<scenario>.ties': 'Main suite: configurations within two standard errors, or outside them with restarts that disagree on the direction (method.verdictRule).',
  'main.tally.<comparison>.<scenario>.losses': 'Main suite: configurations the left side lost.',
  'main.tally.<comparison>.<scenario>.total': 'Main suite: configurations compared.',
  'main.tally.<comparison>.<scenario>.matchOrBeat': 'Main suite: wins + ties.',
  'main.tally.<comparison>.<scenario>.range': 'Main suite: the range of speedups as text, e.g. "1.2–1.4× faster" or "up to 1.3× faster (5 faster, 1 tie)".',
  'main.tally.<comparison>.<scenario>.split': 'Main suite: ties only because the restarts disagreed on the direction (outside two standard errors in the pooled means).',
  'main.tally.<comparison>.all.wins': 'Main suite, every scenario: wins.',
  'main.tally.<comparison>.all.ties': 'Main suite, every scenario: ties.',
  'main.tally.<comparison>.all.losses': 'Main suite, every scenario: losses.',
  'main.tally.<comparison>.all.total': 'Main suite, every scenario: configurations compared.',
  'main.tally.<comparison>.all.matchOrBeat': 'Main suite, every scenario: wins + ties. main.tally.selectors.all.matchOrBeat is the headline.',
  'main.tally.<comparison>.all.range': 'Main suite, every scenario: range of speedups as text.',
  'main.tally.<comparison>.all.split': 'Main suite, every scenario: ties only because the restarts disagreed on the direction.',
  'counts.<suite>.<scenario>.<variant>.<compiler>.<metric>': 'Counting build, one update (averaged where the suite averages): renders (counted renders: only components that call countRender; for main and fairness, method.countedComponents, so App and the list aren\'t counted), rows (Row renders), selectors (selector calls) or derivations. Suite "main" is the main suite at method.countsRows rows.',
  'method.countedComponents': 'The components the main app\'s counting build counts in renders, e.g. "Row, RowView, DetailsView and CountView".',
  'suite.<suite>.<scenario>.x<throttle>.<variant>.<compiler>.median': 'Ported Redux suites and fairness: median ms per update.',
  'suite.<suite>.<scenario>.x<throttle>.<left>.verdict': 'Ported Redux suites and fairness: store (or store-memo) + compiler vs the fastest other library at its faster compiler setting.',
  'suite.<suite>.tally.<left>.wins': 'Suite: configurations store (or store-memo) won.',
  'suite.<suite>.tally.<left>.ties': 'Suite: ties.',
  'suite.<suite>.tally.<left>.losses': 'Suite: losses.',
  'suite.<suite>.tally.<left>.total': 'Suite: configurations compared.',
  'suite.<suite>.tally.<left>.range': 'Suite: range of speedups as text.',
  'spike.<family>.k<k>.x<throttle>.<variant>.median': 'Shared derived data spike: median ms per update with K readers per category (compiler on).',
  'spike.<family>.k<k>.x<throttle>.<variant>.vsRedux': 'Spike: ratio of mean time to Redux in the same configuration (below 1 is faster).',
  'spike.<family>.k<k>.x<throttle>.<left>.verdict': 'Spike: store, store-memo, or the fastest correct sharing variant ("sharing") vs Redux.',
  'spike.<family>.k<k>.x<throttle>.sharing.variant': 'Spike: which sharing variant was fastest.',
  'spike.tally.<left>.wins': 'Spike, every family, K and throttle: wins vs Redux.',
  'spike.tally.<left>.ties': 'Spike: ties vs Redux.',
  'spike.tally.<left>.losses': 'Spike: losses vs Redux.',
  'spike.tally.<left>.total': 'Spike: configurations compared.',
  'spike.tally.<left>.matchOrBeat': 'Spike: wins + ties vs Redux (unread updates excluded).',
  'spike.tally.<left>.range': 'Spike: range of speedups vs Redux as text.',
  'spike.tally.<left>.k<k>.range': 'Spike at one K: range of speedups vs Redux as text.',
  'sweep.<scenario>.x<throttle>.<config>.<library>.median': 'Sweeps (N=1,000): median ms per update. Configs: c100/c90/c75/c50-w8 (% of rows compiled, 8 props), c0-w8 (no compiler), c100-w4, c100-w16 (props per row).',
  'sweep.<scenario>.x<throttle>.<config>.<library>.verdict': 'Sweeps: store or store-keyed vs the faster of Redux and Zustand at the same config.',
  'sweep.<scenario>.<config>.<library>.range': 'Sweeps: store or store-keyed vs the faster of Redux and Zustand, range of ratios across CPU throttles as text.',
  'sweep.tally.<library>.<scenario>.wins': 'Sweeps: configs (all, × throttles) won.',
  'sweep.tally.<library>.<scenario>.ties': 'Sweeps: ties.',
  'sweep.tally.<library>.<scenario>.losses': 'Sweeps: losses.',
  'sweep.tally.<library>.<scenario>.total': 'Sweeps: configs compared.',
  'sweep.tally.<library>.<scenario>.matchOrBeat': 'Sweeps: wins + ties.',
  'sweep.tally.<library>.<scenario>.range': 'Sweeps: range of speedups as text.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.p50': 'Typing (which = main or suite): median keydown-to-frame latency, ms.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.p95': 'Typing: 95th percentile latency, ms.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.max': 'Typing: worst latency, ms.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.settle': 'Typing: ms from the start of typing (the click into the input) until the list caught up with the input, i.e. showed the rows for the full typed text, with every keydown latency recorded (median of runs). Includes the typing itself.',
  'typing.<which>.rows': 'Typing: rows re-filtered on every key.',
  'typing.<which>.keys': 'Typing: keys typed per run.',
  'memory.<variant>.<compiler>.n<n>.bytesPerRow': 'Heap growth after mounting N rows (after GC) / N, bytes (median of runs).',
  'memory.<variant>.<compiler>.n<n>.mountMs': 'Time to mount N rows, ms (median of runs).',
  'memory.rank.<compiler>.n<n>': 'Every variant by bytes per row, lowest first, e.g. "context (2,167), …".',
  'memory.order.<compiler>.n<n>': 'Every variant by bytes per row, fewest first, names only.',
  'memory.storeRank.<compiler>.n<n>': 'store\'s place by bytes per row, fewest first, e.g. "4th of 7".',
  'memory.storeVs.<library>.<compiler>.n<n>': 'Bytes per row of store (a store per entity) / the library\'s (context, redux, zustand).',
  'memory.storePlace.<compiler>.n<n>': 'Where store (a store per entity) sits in bytes per row, as a phrase generated from the data, e.g. "more than one context, and less than either Redux or Zustand".',
  'memory.shownN': 'The size the memory chart shows first (the largest).',
  'main.tally.<comparison>.lostScenarios': 'Main suite: the scenarios with at least one loss under method.verdictRule, as lowercase prose names for running text ("filter and subscribe churn"), or "none".',
  'main.tally.<comparison>.maxLoss': 'Main suite: the largest loss, as a ratio of means (left / opponent), every scenario, size and throttle.',
  'main.tally.<comparison>.maxLossPct': 'Main suite: the largest loss as a percentage slower.',
  'losses.<area>.count': 'Where it doesn\'t win: configurations the store side lost (under method.verdictRule: outside two standard errors and slower in every restart) in an area: main (vs the headline opponents), granular (main suite vs the granular control), suites, fairness (fairness5: store vs the fastest Redux setup), sweeps, spike.',
  'losses.<area>.of': 'Where it doesn\'t win: configurations compared in the area.',
  'losses.all.count': 'Where it doesn\'t win: losses over every area.',
  'ctx.<scenario>.n<n>.x<throttle>.<compiler>.<vs>': 'Store vs Context at the SAME compiler setting (compiler off or on for both): vs is vsContext (one context) or vsContextSplit (a context per slice). Medians: main.<scenario>.n<n>.x<throttle>.<variant>.<compiler>.median.',
  'ctx.<scenario>.n<n>.x<throttle>.compilerGain.<variant>': 'What the compiler buys one variant (store, context, context-split): with the compiler vs without it, same configuration ("faster" means faster with the compiler).',
  'ctx.tally.<compiler>.<vs>.<scope>.wins': 'Store vs Context at the same compiler setting, per scenario or "all": configurations store won.',
  'ctx.tally.<compiler>.<vs>.<scope>.ties': 'Store vs Context at the same setting: ties.',
  'ctx.tally.<compiler>.<vs>.<scope>.losses': 'Store vs Context at the same setting: losses.',
  'ctx.tally.<compiler>.<vs>.<scope>.total': 'Store vs Context at the same setting: configurations compared.',
  'ctx.tally.<compiler>.<vs>.<scope>.split': 'Store vs Context at the same setting: ties only because the restarts disagreed.',
  'ctx.tally.<compiler>.<vs>.<scope>.matchOrBeat': 'Store vs Context at the same setting: wins + ties.',
  'ctx.tally.<compiler>.<vs>.<scope>.range': 'Store vs Context at the same setting: range of speedups as text.',
  'ctx.tally.<compiler>.<vs>.lostScenarios': 'Store vs Context at the same setting: scenarios with a loss, lowercase prose names, or "none".',
  'ctx.tally.<compiler>.<vs>.maxLoss': 'Store vs Context at the same setting: the largest loss, ratio of means.',
  'ctx.tally.<compiler>.<vs>.maxLossPct': 'Store vs Context at the same setting: the largest loss as a percentage slower.',
  'ctx.tally.compilerGain.<variant>.<scope>.wins': 'What the compiler buys a variant, per scenario or "all": configurations faster with it.',
  'ctx.tally.compilerGain.<variant>.<scope>.ties': 'What the compiler buys: ties.',
  'ctx.tally.compilerGain.<variant>.<scope>.losses': 'What the compiler buys: configurations slower with it.',
  'ctx.tally.compilerGain.<variant>.<scope>.total': 'What the compiler buys: configurations compared.',
  'ctx.tally.compilerGain.<variant>.<scope>.split': 'What the compiler buys: ties only because the restarts disagreed.',
  'ctx.tally.compilerGain.<variant>.<scope>.matchOrBeat': 'What the compiler buys: faster or tied.',
  'ctx.tally.compilerGain.<variant>.<scope>.range': 'What the compiler buys: range of speedups as text.',
  'ctx.compilerGain.storeMore.<variant>.<scope>.count': 'Configurations where the compiler speeds store up more than it speeds up context or context-split (ratio of the two speedups, no noise test), per scenario or "all".',
  'ctx.compilerGain.storeMore.<variant>.<scope>.of': 'Configurations compared for storeMore.',
  'ctx.compilerGain.storeMore.<variant>.everyConfig': 'Scenarios (lowercase prose names) where the compiler speeds store up more than the Context variant in every configuration, or "none".',
  'ctx.memory.storeVs.<variant>.<compiler>.n<n>': 'Bytes per row of store / context or context-split, same compiler setting.',
  'ctx.tally.compilerGain.<variant>.lostScenarios': 'Scenarios where the compiler makes the variant slower, lowercase prose names, or "none".',
  'ctx.tally.compilerGain.<variant>.maxLoss': 'The largest slowdown from the compiler, ratio of means.',
  'ctx.tally.compilerGain.<variant>.maxLossPct': 'The largest slowdown from the compiler as a percentage.',
  'losses.all.of': 'Where it doesn\'t win: comparisons over every area.',
  'losses.control.<control>.count': 'Losses in a control comparison left out of the losses table (context, contextSplit, singleStore, noCompiler, noBailout, fairness5Zustand).',
  'losses.control.<control>.of': 'Comparisons in that control.',
  'losses.scope': 'One line: what the losses table counts and which control comparisons it leaves out.',
  'method.headlineRedux': 'Which Redux the headline is defined against (idiomatic RTK), and where the leaner setups are compared, for the Method sentence.',
  'suite.fairness5.<scenario>.x<throttle>.vs<opponent>': 'Fairness with every variant (fairness5): store + compiler vs the fastest Redux setup (opponent Redux: redux, redux-plain, redux-nofreeze) or vs Zustand, each at its faster compiler setting.',
  'suite.fairness5.<scenario>.x<throttle>.bestRedux': 'fairness5: which Redux setup and compiler setting was fastest.',
  'suite.fairness5.tally.<opponent>.wins': 'fairness5: configurations store + compiler won, vs fastestRedux (the fastest of redux, redux-plain, redux-nofreeze) or zustand.',
  'suite.fairness5.tally.<opponent>.ties': 'fairness5: ties.',
  'suite.fairness5.tally.<opponent>.losses': 'fairness5: losses.',
  'suite.fairness5.tally.<opponent>.total': 'fairness5: configurations compared.',
  'suite.fairness5.tally.<opponent>.split': 'fairness5: ties only because the restarts disagreed on the direction.',
  'suite.fairness5.tally.<opponent>.matchOrBeat': 'fairness5: wins + ties.',
  'suite.fairness5.tally.<opponent>.range': 'fairness5: range of speedups as text.',
};

// The build without enableSameElementBailout: its own keys, never mixed into
// the headline.
Object.assign(PATTERNS, {
  'nobailout.main.<scenario>.n<n>.x<throttle>.<variant>.median': 'Without the same-element bailout (react-builds/head-nobailout): main suite median ms per update, compiler on.',
  'nobailout.main.<scenario>.n<n>.x<throttle>.verdict': 'Without the same-element bailout: store + compiler vs the headline opponents.',
  'nobailout.main.<scenario>.n<n>.x<throttle>.vsGranular': 'Without the same-element bailout: store + compiler vs the granular control.',
  'nobailout.main.<scenario>.n<n>.x<throttle>.bailoutGain': 'What the bailout buys store + compiler: the head build vs the build without it, same configuration ("1.4× faster" means faster with the bailout).',
  'nobailout.main.tally.<scenario>.wins': 'Without the same-element bailout: configurations store + compiler won vs the headline opponents.',
  'nobailout.main.tally.<scenario>.ties': 'Without the same-element bailout: ties.',
  'nobailout.main.tally.<scenario>.losses': 'Without the same-element bailout: losses.',
  'nobailout.main.tally.<scenario>.total': 'Without the same-element bailout: configurations compared.',
  'nobailout.main.tally.<scenario>.range': 'Without the same-element bailout: range of speedups as text.',
  'nobailout.main.tally.all.wins': 'Without the same-element bailout, every scenario: wins.',
  'nobailout.main.tally.all.ties': 'Without the same-element bailout, every scenario: ties.',
  'nobailout.main.tally.all.losses': 'Without the same-element bailout, every scenario: losses.',
  'nobailout.main.tally.all.total': 'Without the same-element bailout, every scenario: configurations compared.',
  'nobailout.main.tally.all.range': 'Without the same-element bailout, every scenario: range of speedups as text.',
  'nobailout.main.tally.all.matchOrBeat': 'Without the same-element bailout, every scenario: wins + ties.',
  'nobailout.main.tally.all.split': 'Without the same-element bailout, every scenario: ties only because the restarts disagreed on the direction.',
  'nobailout.main.tally.withBailout.wins': 'The head build (with the bailout), over the same configurations as nobailout.main.tally.all: wins vs the headline opponents.',
  'nobailout.main.tally.withBailout.ties': 'The head build over the nobailout configurations: ties.',
  'nobailout.main.tally.withBailout.losses': 'The head build over the nobailout configurations: losses.',
  'nobailout.main.tally.withBailout.total': 'The head build over the nobailout configurations: configurations compared.',
  'nobailout.main.tally.withBailout.matchOrBeat': 'The head build over the nobailout configurations: wins + ties.',
  'nobailout.main.tally.withBailout.range': 'The head build over the nobailout configurations: range of speedups as text.',
});

// An older run, kept so the report can say how the headline moved. Never
// part of the head check (status 'history' in report-sources.json).
Object.assign(PATTERNS, {
  'history.final.tally.selectors.all.wins': 'History (the old final-build main run, sources.history-final): store + compiler vs the headline opponents, wins over every scenario.',
  'history.final.tally.selectors.all.ties': 'History: ties.',
  'history.final.tally.selectors.all.losses': 'History: losses.',
  'history.final.tally.selectors.all.total': 'History: configurations compared.',
  'history.final.tally.selectors.all.matchOrBeat': 'History: wins + ties (the headline as it was).',
  'history.final.tally.selectors.all.split': 'History: ties only because the restarts disagreed on the direction.',
  'history.final.tally.selectors.all.range': 'History: range of speedups as text.',
  'history.final.scenarios': 'History: scenarios in the old run.',
  'history.final.configs': 'History: configurations in the old run (scenarios × sizes × throttles).',
});
for (const [pattern, doc] of Object.entries(PATTERNS)) {
  if (pattern.startsWith('sweep.')) {
    PATTERNS['nobailout.' + pattern] = 'Without the same-element bailout: ' + doc;
  }
}

// Comparisons tallied for the main suite. left is [variant, compiler]; the
// opponent is the faster of the listed libraries, each at its faster compiler
// setting unless offOnly.
// The headline bar: store + compiler against the faster of these libraries,
// each at its faster compiler setting. 'zustand-granular' (a Zustand store per
// entity) is a control, not idiomatic Zustand, so it's reported in its own
// column and in the losses, not here. Add it for the stricter bar.
export const HEADLINE_OPPONENTS = ['redux', 'zustand'];
const LIBRARY_NAMES = {
  redux: 'Redux',
  zustand: 'Zustand',
  'zustand-granular': 'the granular control',
  context: 'one context',
  'context-split': 'a context per slice',
};
export const HEADLINE_LABEL = `the faster of ${HEADLINE_OPPONENTS.map(l => LIBRARY_NAMES[l] ?? l).join(' and ')}`.replace(
  /^the faster of (\S+)$/,
  '$1',
);

export const COMPARISONS = {
  selectors: {
    label: `store + compiler vs ${HEADLINE_LABEL}`,
    left: ['store', true],
    opponents: HEADLINE_OPPONENTS,
  },
  redux: {label: 'store + compiler vs Redux', left: ['store', true], opponents: ['redux']},
  zustand: {label: 'store + compiler vs Zustand', left: ['store', true], opponents: ['zustand']},
  'zustand-granular': {
    label: 'store + compiler vs the granular control (a Zustand store per entity)',
    left: ['store', true],
    opponents: ['zustand-granular'],
  },
  context: {label: 'store + compiler vs one context', left: ['store', true], opponents: ['context']},
  'context-split': {
    label: 'store + compiler vs a context per slice',
    left: ['store', true],
    opponents: ['context-split'],
  },
  'single-selectors': {
    label: `store-single (one store, no selectors) + compiler vs ${HEADLINE_LABEL}`,
    left: ['store-single', true],
    opponents: HEADLINE_OPPONENTS,
  },
  'nocompiler-selectors': {
    label: `store without the compiler vs ${HEADLINE_LABEL} without the compiler`,
    left: ['store', false],
    opponents: HEADLINE_OPPONENTS,
    offOnly: true,
  },
  'compiler-gain': {
    label: 'store + compiler vs store without the compiler',
    left: ['store', true],
    opponents: ['store'],
    offOnly: true,
  },
};

// ---------------------------------------------------------------- loading

function readResultFile(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of json.results) {
    r.file = path.basename(file);
  }
  return json;
}

function loadSet(sources, set) {
  const files = pinnedFiles(sources, [set]);
  const jsons = files.map(readResultFile);
  return {
    files: files.map(f => path.basename(f)),
    envs: jsons.map(j => j.env),
    results: jsons.flatMap(j => j.results),
  };
}

function libraryVersion(pkg) {
  try {
    return require(require.resolve(pkg + '/package.json', {paths: [here]})).version;
  } catch {
    return null;
  }
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  return groups;
}

// ---------------------------------------------------------------- builds

// The build a set must come from: the top-level expectBuild, or the set's
// own (the build without the same-element bailout). A file matches when its
// env.react has the same sha and the same frozen build directory, so a
// head-nobailout file can never stand in for a head file or the reverse.
export function expectedBuild(sources, set) {
  return sources.sets[set]?.expectBuild ?? sources.expectBuild;
}

export function matchesBuild(env, expected) {
  return Boolean(
    env?.react?.sha &&
      env.react.sha === expected.sha &&
      (!expected.dir || env.react.dir === expected.dir),
  );
}

// ---------------------------------------------------------------- compute

export function computeReportData(sources = readSources()) {
  const values = {};
  const patternOf = new Map();
  const series = {};

  function key(pattern, params) {
    let i = 0;
    const k = pattern.replace(/<[^>]+>/g, () => {
      if (i >= params.length) throw new Error(`Missing params for ${pattern}`);
      return String(params[i++]);
    });
    if (i !== params.length) throw new Error(`Too many params for ${pattern}`);
    return k;
  }

  // Adds a value. Missing values (no data for that configuration) are skipped,
  // so a doc that cites them fails G5 instead of showing a wrong number.
  function put(pattern, params, value, {unit, display, source}) {
    if (!PATTERNS[pattern]) throw new Error(`Unknown key pattern ${pattern}`);
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) return;
    const k = key(pattern, params);
    if (values[k]) throw new Error(`Duplicate key ${k}`);
    const shown =
      display ??
      (unit === 'ms'
        ? msDisplay(value)
        : unit === 'count' || unit === 'bytes'
          ? countDisplay(value)
          : unit === 'ratio'
            ? `${value.toFixed(2)}×`
            : String(value));
    values[k] = {
      value: typeof value === 'number' ? r4(value) : value,
      // Plain text: build-docs.mjs escapes it into the page.
      display: String(shown),
      unit,
      source,
    };
    patternOf.set(k, pattern);
  }

  function src(set, files, computation) {
    const list =
      files.length <= 6
        ? files.join(', ')
        : `${files.length} files (sources.${set})`;
    return `${set}: ${list} · ${computation}`;
  }

  // -------------------------------------------------------------- build

  const expect = sources.expectBuild;
  const buildJsonPath = path.join(here, expect.dir, 'BUILD.json');
  const frozen = fs.existsSync(buildJsonPath)
    ? JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'))
    : null;
  const setNames = Object.keys(sources.sets);
  const loaded = Object.fromEntries(setNames.map(s => [s, loadSet(sources, s)]));
  // A set that isn't pinned at all counts as empty (e.g. a test fixture that
  // pins only the counts).
  const empty = {files: [], envs: [], results: []};
  for (const s of ['main', 'main-typing', 'main-memory', 'counts', 'suite-counts', 'typing-suite', 'nobailout-main']) {
    loaded[s] ??= empty;
  }
  // History sets are older runs kept for comparison: they're from other
  // builds by design, so they're outside the build checks and the label.
  const historySets = setNames.filter(s => sources.sets[s].status === 'history');
  const currentSets = setNames.filter(s => !historySets.includes(s));
  const placeholderSets = currentSets.filter(s => sources.sets[s].status !== 'head');
  const mismatched = [];
  const compilers = new Set();
  for (const s of currentSets) {
    loaded[s].envs.forEach((env, i) => {
      if (!matchesBuild(env, expectedBuild(sources, s))) {
        mismatched.push(loaded[s].files[i]);
      }
      if (env.compiler?.sha256) compilers.add(env.compiler.sha256);
    });
  }
  if (compilers.size > 1) {
    throw new Error(`Pinned results use different compilers: ${[...compilers]}`);
  }
  const status = placeholderSets.length === 0 && mismatched.length === 0 ? 'head' : 'placeholder';
  const shortSha = expect.sha.slice(0, 8);
  const compilerSha = [...compilers][0] ?? null;
  const build = {
    status,
    sha: expect.sha,
    shortSha,
    dir: expect.dir,
    version: frozen?.version ?? null,
    dirty: frozen?.dirty ?? null,
    dirtyAffectsBuild: frozen?.dirtyAffectsBuild ?? null,
    builtAt: frozen?.builtAt ?? null,
    hashes: frozen?.hashes ?? null,
    compilerSha256: compilerSha,
    resultsPinnedAt: sources.pinnedAt,
    placeholderSets,
    filesWithoutBuild: mismatched,
  };
  const clean = frozen && (frozen.dirty?.length === 0 || frozen.dirtyAffectsBuild === false);
  build.label =
    status === 'head'
      ? `Measured on React ${build.version} (${shortSha}${clean ? '' : ', dirty'}), compiler ${compilerSha}, results pinned ${sources.pinnedAt}.`
      : `PLACEHOLDER: ${placeholderSets.length} of ${currentSets.length} result sets (${placeholderSets.join(', ')}) aren't from the frozen builds yet (older builds or not run). Do not cite these numbers.`;
  const buildSource = `report-sources.json expectBuild + ${expect.dir}/BUILD.json + env.react/env.compiler of every pinned file`;
  put('build.label', [], build.label, {unit: 'text', source: buildSource});
  put('build.sha', [], shortSha, {unit: 'text', source: buildSource});
  put('build.version', [], build.version, {unit: 'text', source: buildSource});
  put('build.compiler', [], compilerSha, {unit: 'text', source: buildSource});
  put('build.pinnedAt', [], sources.pinnedAt, {unit: 'text', source: 'report-sources.json pinnedAt'});
  put('build.status', [], status, {unit: 'text', source: buildSource});
  for (const pkg of ['redux', 'react-redux', '@reduxjs/toolkit', 'zustand', 'reselect']) {
    put('lib.<package>', [pkg], libraryVersion(pkg), {
      unit: 'text',
      source: `fixtures/store-bench/node_modules/${pkg}/package.json`,
    });
  }

  // -------------------------------------------------------------- main suite

  const main = loaded.main;
  const mainUpdates = main.results.filter(r => r.kind === 'update');
  const mainStats = updateStats(mainUpdates);
  const scenarios = SCENARIOS.filter(([s]) => mainUpdates.some(r => r.scenario === s));
  const ns = [...new Set(mainUpdates.map(r => r.n))].sort((a, b) => a - b);
  const throttles = [...new Set(mainUpdates.map(r => r.throttle))].sort((a, b) => a - b);
  const variants = VARIANTS.filter(v => mainUpdates.some(r => r.variant === v));
  const cellOf = (s, n, t) => mainStats.get(`${s}|${n}|${t}`);
  const fileList = entries => [...new Set(entries.filter(Boolean).flatMap(e => e.files))].sort();

  // Low-signal scenarios: the counting build shows every variant doing the
  // same render work (the same component and Row renders, at each compiler
  // setting), so the timing mostly measures list reconciliation rather than
  // how a library finds what changed. Their keys say so in the source.
  const lowSignal = {};
  for (const [scenario, rs] of groupBy(
    loaded.counts.results.filter(r => r.kind === 'counts'),
    r => r.scenario,
  )) {
    const byCompiler = groupBy(rs, r => r.bundle.endsWith('+compiler'));
    const same = [...byCompiler.values()].every(
      g => new Set(g.map(r => `${r.renders}|${r.rows}`)).size === 1,
    );
    if (rs.length > 1 && same) {
      const work = [...byCompiler.values()]
        .map(g => `${g[0].bundle.endsWith('+compiler') ? 'compiled' : 'uncompiled'}: ${countDisplay(g[0].renders)} counted renders, ${countDisplay(g[0].rows)} of them Row`)
        .join(' / ');
      lowSignal[scenario] = {
        short: 'every variant does the same render work in the counting build, so it mostly measures list reconciliation, not store or selector work',
        long: `Low signal: in the counting build every variant does the same render work for one ${scenario} update (${work}; ${COUNTED_TEXT}), so it mostly measures list reconciliation, not store or selector work (${loaded.counts.files.join(', ')}).`,
      };
    }
  }

  // The faster of several libraries, each at its faster compiler setting (or
  // without the compiler only), with a label naming it.
  function fastest(byVariant, libraries, offOnly) {
    return libraries
      .map(lib => {
        const entry = offOnly ? byVariant.get(name(lib, false)) : bestOf(byVariant, lib);
        if (!entry) return null;
        const on = entry === byVariant.get(name(lib, true));
        return {
          entry,
          variant: lib,
          compiler: on ? 'on' : 'off',
          label: `${lib}${on ? ' + compiler' : ' without the compiler'}`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.entry.mean - b.entry.mean)[0] ?? null;
  }

  const mainEnv = main.envs[0] ?? {};
  put('method.cpu', [], mainEnv.cpu, {unit: 'text', source: src('main', main.files.slice(0, 1), 'env.cpu')});
  put('method.browser', [], main.envs.find(e => e.browserVersion)?.browserVersion ?? loaded.counts.envs[0]?.browserVersion, {
    unit: 'text',
    source: src('main', main.files.slice(0, 1), 'env.browserVersion'),
  });
  put('method.node', [], mainEnv.node, {unit: 'text', source: src('main', main.files.slice(0, 1), 'env.node')});
  put('method.iterations', [], mainEnv.iterations, {unit: 'count', source: src('main', main.files.slice(0, 1), 'env.iterations')});
  put('method.warmup', [], mainEnv.warmup, {unit: 'count', source: src('main', main.files.slice(0, 1), 'env.warmup')});
  // Each update result is one configuration in one browser restart.
  const runsPerConfig = [
    ...groupBy(mainUpdates, r => [r.scenario, r.n, r.throttle, r.variant, r.compiler].join('|')).values(),
  ].map(g => g.length);
  put('method.restarts', [], runsPerConfig.length ? median(runsPerConfig) : null, {
    unit: 'count',
    source: src('main', main.files, 'median over configurations of the number of runs (restarts)'),
  });
  // Restarts per scenario × throttle (every variant and size of a unit share
  // them): the usual count, and the units that had more.
  const restartsByUnit = new Map();
  for (const r of mainUpdates) {
    const unit = `${r.scenario}|${r.throttle}`;
    if (!restartsByUnit.has(unit)) restartsByUnit.set(unit, new Map());
    const byConfig = restartsByUnit.get(unit);
    const config = [r.n, r.variant, r.compiler].join('|');
    byConfig.set(config, (byConfig.get(config) ?? 0) + 1);
  }
  const unitRestarts = [...restartsByUnit].map(([unit, byConfig]) => {
    const counts = new Set(byConfig.values());
    if (counts.size !== 1) throw new Error(`main ${unit}: configurations have different restart counts`);
    return {unit, restarts: [...counts][0]};
  });
  if (unitRestarts.length) {
    const tally = groupBy(unitRestarts, u => u.restarts);
    const usual = [...tally].sort((a, b) => b[1].length - a[1].length)[0][0];
    const restartSource = src('main', main.files, 'runs per configuration, grouped by scenario and CPU throttle (every size and variant of a unit has the same count)');
    put('method.restartsDefault', [], usual, {unit: 'count', source: restartSource});
    const order = u => SCENARIOS.findIndex(([k]) => k === u.unit.split('|')[0]);
    const extra = unitRestarts.filter(u => u.restarts !== usual).sort((a, b) => order(a) - order(b) || a.unit.localeCompare(b.unit));
    put('method.restartsExtra', [], extra.length
      ? listText([...groupBy(extra, u => u.restarts)].map(([count, us]) => `${listText(us.map(u => { const [sc, t] = u.unit.split('|'); return `${prose(sc)} at ${t}× CPU`; }))} (${count} restarts, every size)`))
      : 'none', {unit: 'text', source: restartSource});
    put('method.restartsExtraUnits', [], extra.length, {unit: 'count', source: restartSource});
    const extraCounts = [...new Set(extra.map(u => u.restarts))];
    if (extraCounts.length === 1) {
      put('method.restartsExtraCount', [], extraCounts[0], {unit: 'count', source: restartSource});
      put('method.restartsExtraAdded', [], extraCounts[0] - usual, {unit: 'count', source: restartSource + '; minus method.restartsDefault'});
    }
  }
  const sampleCounts = [...mainStats.values()].flatMap(m => [...m.values()].map(e => e.count));
  put('method.samples', [], sampleCounts.length ? median(sampleCounts) : null, {
    unit: 'count',
    source: src('main', main.files, 'median over configurations of timed samples'),
  });
  put('method.timedUpdates', [], mainUpdates.reduce((a, r) => a + r.durations.length, 0), {
    unit: 'count',
    source: src('main', main.files, 'sum of durations.length'),
  });
  put('method.configs', [], scenarios.length * ns.length * throttles.length, {
    unit: 'count',
    source: src('main', main.files, 'scenarios × sizes × throttles'),
  });
  put('method.sizes', [], ns.map(int).join(' / '), {unit: 'text', source: src('main', main.files, 'distinct n')});
  put('method.throttles', [], throttles.map(t => `${t}×`).join(' and '), {
    unit: 'text',
    source: src('main', main.files, 'distinct throttle'),
  });
  // The DOM check: updates replayed per scenario (run.mjs verify's --steps
  // default; run-report-matrix.sh passes no --steps).
  const runSource = fs.readFileSync(path.join(here, 'run.mjs'), 'utf8');
  const matrixPassesSteps = /--verify[^\n]*--steps/.test(fs.readFileSync(path.join(here, 'run-report-matrix.sh'), 'utf8'));
  const verifySteps = runSource.match(/option\('steps', (\d+)\)/)?.[1];
  put('method.verifySteps', [], verifySteps && !matrixPassesSteps ? Number(verifySteps) : null, {
    unit: 'count',
    source: "run.mjs verify(): option('steps') default; run-report-matrix.sh runs --verify without --steps",
  });
  // The counting build's rows: run.mjs MODES.counts (counts results don't
  // record n).
  const countsN = fs.readFileSync(path.join(here, 'run.mjs'), 'utf8').match(/^\s*counts: \{[^}]*\bn: \[(\d+)\]/m)?.[1];
  put('method.countsRows', [], countsN ? Number(countsN) : null, {unit: 'count', source: 'run.mjs MODES.counts n (the counting build mounts this many rows)'});
  put('method.verdictRule', [], VERDICT_RULE, {
    unit: 'text',
    source: 'report-suites.mjs VERDICT_RULE (agreedCompare, restartsAgree), applied by judge() in report-data.mjs to every verdict and tally: main, granular, nobailout, suites, spike, sweeps, history',
  });

  const cells = {};
  for (const [s] of scenarios) {
    for (const n of ns) {
      for (const t of throttles) {
        const byVariant = cellOf(s, n, t);
        if (!byVariant) continue;
        const cell = {variants: {}};
        for (const v of variants) {
          const on = byVariant.get(name(v, true));
          const off = byVariant.get(name(v, false));
          cell.variants[v] = {on: slim(on), off: slim(off)};
          for (const [c, e] of [['on', on], ['off', off]]) {
            if (!e) continue;
            const what = `${v}${c === 'on' ? ' + compiler' : ' without the compiler'}, ${s}, N=${n}, ${t}× CPU`;
            put('main.<scenario>.n<n>.x<throttle>.<variant>.<compiler>.median', [s, n, t, v, c], e.median, {
              unit: 'ms',
              source: src('main', e.files, `median of ${e.count} samples, ${what}`),
            });
          }
        }
        const store = byVariant.get(name('store', true));
        const best = fastest(byVariant, HEADLINE_OPPONENTS, false);
        const c = judge(store, best?.entry ?? null);
        cell.verdict = slimVerdict(c);
        cell.best = best?.label ?? null;
        cell.opp = oppOf(best);
        const granular = fastest(byVariant, ['zustand-granular'], false);
        const cg = judge(store, granular?.entry ?? null);
        cell.granular = slimVerdict(cg);
        cell.granularOpp = oppOf(granular);
        if (cg) {
          put('main.<scenario>.n<n>.x<throttle>.vsGranular', [s, n, t], cg.ratio, {
            unit: 'verdict',
            display: verdictText(cg),
            source: src('main', fileList([store, granular.entry]), `stats.mjs compare(store + compiler, ${granular.label}), ${s}, N=${n}, ${t}× CPU`),
          });
        }
        const cmp = `stats.mjs compare(store + compiler, ${HEADLINE_LABEL}), ${s}, N=${n}, ${t}× CPU`;
        if (c) {
          put('main.<scenario>.n<n>.x<throttle>.verdict', [s, n, t], c.ratio, {
            unit: 'verdict',
            display: verdictText(c),
            source: src('main', fileList([store, best.entry]), cmp),
          });
          put('main.<scenario>.n<n>.x<throttle>.best', [s, n, t], best.label, {
            unit: 'text',
            source: src('main', fileList([best.entry]), `lowest mean of ${HEADLINE_OPPONENTS.join('/')}, ${s}, N=${n}, ${t}× CPU`),
          });
          // The exact entry the verdict compares with (its compiler setting).
          put('main.<scenario>.n<n>.x<throttle>.bestMedian', [s, n, t], best.entry.median, {
            unit: 'ms',
            source: src('main', best.entry.files, `median of ${best.entry.count} samples, ${best.label} (the verdict's opponent), ${s}, N=${n}, ${t}× CPU`),
          });
          put('main.<scenario>.n<n>.x<throttle>.bestVariant', [s, n, t], best.variant, {
            unit: 'text',
            source: src('main', fileList([best.entry]), `the verdict's opponent library, ${s}, N=${n}, ${t}× CPU`),
          });
          put('main.<scenario>.n<n>.x<throttle>.bestCompiler', [s, n, t], best.compiler, {
            unit: 'text',
            source: src('main', fileList([best.entry]), `the verdict's opponent compiler setting (on or off; cite counts.main.<scenario>.<variant>.<compiler>.* with it), ${s}, N=${n}, ${t}× CPU`),
          });
        }
        cells[`${s}|${n}|${t}`] = cell;
      }
    }
  }

  const tallies = {};
  for (const [id, comparison] of Object.entries(COMPARISONS)) {
    const [leftVariant, leftCompiler] = comparison.left;
    const perScenario = {};
    const all = [];
    for (const [s] of scenarios) {
      const cs = [];
      for (const n of ns) {
        for (const t of throttles) {
          const byVariant = cellOf(s, n, t);
          if (!byVariant) continue;
          const left = byVariant.get(name(leftVariant, leftCompiler));
          const opp = fastest(byVariant, comparison.opponents, comparison.offOnly);
          cs.push(judge(left, opp?.entry ?? null));
        }
      }
      perScenario[s] = tallyOf(cs);
      perScenario[s].lossRatios = cs.filter(c => c && !c.noWork && !c.tie && c.ratio >= 1).map(c => c.ratio);
      all.push(...cs);
    }
    perScenario.all = tallyOf(all);
    tallies[id] = perScenario;
    // Where the left side loses, and by how much at most.
    {
      const lost = scenarios.filter(([sc]) => perScenario[sc].losses > 0);
      const ratios = lost.flatMap(([sc]) => perScenario[sc].lossRatios);
      const source = src('main', main.files, `scenarios with a loss under method.verdictRule: ${comparison.label}, every size and throttle`);
      put('main.tally.<comparison>.lostScenarios', [id], lost.length ? listText(lost.map(([sc]) => prose(sc))) : 'none', {unit: 'text', source});
      if (ratios.length) {
        const worst = Math.max(...ratios);
        const lossSource = src('main', main.files, `max ratio of means (left / opponent) over the losses: ${comparison.label}, every scenario, size and throttle`);
        put('main.tally.<comparison>.maxLoss', [id], worst, {unit: 'ratio', display: `${x(worst)}× slower`, source: lossSource});
        put('main.tally.<comparison>.maxLossPct', [id], (worst - 1) * 100, {unit: 'count', display: `${Math.round((worst - 1) * 100)}%`, source: lossSource});
      }
    }
    for (const [scope, t] of Object.entries(perScenario)) {
      const where = scope === 'all' ? 'every scenario' : scope;
      const source = src('main', main.files, `tally of stats.mjs compare: ${comparison.label}, ${where}, every size and throttle`);
      const base = scope === 'all' ? 'main.tally.<comparison>.all' : 'main.tally.<comparison>.<scenario>';
      const params = scope === 'all' ? [id] : [id, scope];
      if (t.total === 0) continue;
      for (const field of ['wins', 'ties', 'losses', 'total']) {
        put(`${base}.${field}`, params, t[field], {unit: 'count', source});
      }
      put(`${base}.matchOrBeat`, params, t.wins + t.ties, {unit: 'count', source});
      put(`${base}.split`, params, t.split, {unit: 'count', source});
      put(`${base}.range`, params, describe(t), {unit: 'text', source});
    }
  }

  series.main = {
    headline: HEADLINE_LABEL,
    verdictRule: VERDICT_RULE,
    scenarios: scenarios.map(([key, title, description]) => ({
      key,
      title,
      description,
      lowSignal: lowSignal[key]?.short ?? null,
    })),
    ns,
    throttles,
    variants,
    cells,
  };
  series.scoreboard = {
    comparisons: Object.fromEntries(Object.entries(COMPARISONS).map(([id, c]) => [id, c.label])),
    rows: scenarios.map(([s, title]) => ({
      key: s,
      title,
      tallies: Object.fromEntries(
        Object.keys(COMPARISONS).map(id => [id, roundTally(tallies[id][s])]),
      ),
    })),
    all: Object.fromEntries(Object.keys(COMPARISONS).map(id => [id, roundTally(tallies[id].all)])),
  };

  // -------------------------------------------------------------- store vs context

  // use(store) against Context at the SAME compiler setting (store-vs-context
  // report), and what the compiler buys each approach. Unlike
  // main.tally.context, nobody gets their faster setting here.
  const CTX_VARIANTS = ['store', 'context', 'context-split'];
  const CTX_VS = {vsContext: 'context', vsContextSplit: 'context-split'};
  const CTX_NAMES = {store: 'use(store)', context: 'one context', 'context-split': 'a context per slice'};
  if (CTX_VARIANTS.every(v => variants.includes(v))) {
    const ctxCells = {};
    const byTally = {};
    const storeMore = {};
    const push = (key, sc, c) => ((byTally[key] ??= {})[sc] ??= []).push(c);
    for (const [sc] of scenarios) {
      for (const n of ns) {
        for (const t of throttles) {
          const byVariant = cellOf(sc, n, t);
          if (!byVariant) continue;
          const cell = {verdicts: {off: {}, on: {}}, gains: {}};
          for (const c of ['off', 'on']) {
            const store = byVariant.get(name('store', c === 'on')) ?? null;
            for (const [vs, opp] of Object.entries(CTX_VS)) {
              const other = byVariant.get(name(opp, c === 'on')) ?? null;
              const v = judge(store, other);
              cell.verdicts[c][vs] = slimVerdict(v);
              push(`${c}|${vs}`, sc, v);
              if (!v) continue;
              put('ctx.<scenario>.n<n>.x<throttle>.<compiler>.<vs>', [sc, n, t, c, vs], v.ratio, {
                unit: 'verdict',
                display: verdictText(v),
                source: src('main', fileList([store, other]), `stats.mjs compare(store ${c === 'on' ? '+ compiler' : 'without the compiler'}, ${opp} at the same setting; medians: main.${sc}.n${n}.x${t}.store.${c}.median and main.${sc}.n${n}.x${t}.${opp}.${c}.median), ${sc}, N=${n}, ${t}× CPU`),
              });
            }
          }
          for (const v of CTX_VARIANTS) {
            const on = byVariant.get(name(v, true)) ?? null;
            const off = byVariant.get(name(v, false)) ?? null;
            const g = judge(on, off);
            cell.gains[v] = slimVerdict(g);
            push(`gain|${v}`, sc, g);
            if (!g) continue;
            put('ctx.<scenario>.n<n>.x<throttle>.compilerGain.<variant>', [sc, n, t, v], g.ratio, {
              unit: 'verdict',
              display: verdictText(g),
              source: src('main', fileList([on, off]), `stats.mjs compare(${v} + compiler, ${v} without it) ("faster" means faster with the compiler), ${sc}, N=${n}, ${t}× CPU`),
            });
          }
          // Does the compiler help store more than each Context variant?
          // Speedup = mean without / mean with the compiler (no noise test:
          // it compares two speedups).
          const speedup = v => {
            const on = byVariant.get(name(v, true));
            const off = byVariant.get(name(v, false));
            return on && off ? off.mean / on.mean : null;
          };
          for (const opp of ['context', 'context-split']) {
            const a = speedup('store');
            const b = speedup(opp);
            if (a === null || b === null) continue;
            ((storeMore[opp] ??= {})[sc] ??= []).push(a > b);
          }
          ctxCells[`${sc}|${n}|${t}`] = cell;
        }
      }
    }
    const ctxTallies = {};
    for (const [key, byScenario] of Object.entries(byTally)) {
      const [first, second] = key.split('|');
      const isGain = first === 'gain';
      const base = isGain ? `ctx.tally.compilerGain.${second}` : `ctx.tally.${first}.${second}`;
      const label = isGain
        ? `${second} + compiler vs ${second} without it`
        : `store vs ${CTX_VS[second]}, both ${first === 'on' ? 'with' : 'without'} the compiler`;
      const scopes = {...byScenario, all: Object.values(byScenario).flat()};
      ctxTallies[key] = {};
      for (const [scope, cs] of Object.entries(scopes)) {
        const t = tallyOf(cs);
        ctxTallies[key][scope] = roundTally(t);
        if (t.total === 0) continue;
        const source = src('main', main.files, `tally of stats.mjs compare under method.verdictRule: ${label}, ${scope === 'all' ? 'every scenario' : scope}, every size and throttle`);
        const pattern = isGain ? 'ctx.tally.compilerGain.<variant>.<scope>' : 'ctx.tally.<compiler>.<vs>.<scope>';
        const params = isGain ? [second, scope] : [first, second, scope];
        for (const field of ['wins', 'ties', 'losses', 'total', 'split']) {
          put(`${pattern}.${field}`, params, t[field], {unit: 'count', source});
        }
        put(`${pattern}.matchOrBeat`, params, t.wins + t.ties, {unit: 'count', source});
        put(`${pattern}.range`, params, describe(t), {unit: 'text', source});
      }
      // Where the left side loses, and by how much at most.
      const lost = scenarios.filter(([sc]) => tallyOf(byScenario[sc] ?? []).losses > 0);
      const ratios = Object.values(byScenario).flat().filter(c => c && !c.noWork && !c.tie && c.ratio >= 1).map(c => c.ratio);
      const lossPattern = isGain ? 'ctx.tally.compilerGain.<variant>' : 'ctx.tally.<compiler>.<vs>';
      const lossParams = isGain ? [second] : [first, second];
      const lossSource = src('main', main.files, `losses under method.verdictRule: ${label}, every scenario, size and throttle`);
      put(`${lossPattern}.lostScenarios`, lossParams, lost.length ? listText(lost.map(([sc]) => prose(sc))) : 'none', {unit: 'text', source: lossSource});
      if (ratios.length) {
        const worst = Math.max(...ratios);
        put(`${lossPattern}.maxLoss`, lossParams, worst, {unit: 'ratio', display: `${x(worst)}× slower`, source: lossSource + ' · max ratio of means'});
        put(`${lossPattern}.maxLossPct`, lossParams, (worst - 1) * 100, {unit: 'count', display: `${Math.round((worst - 1) * 100)}%`, source: lossSource + ' · max ratio of means'});
      }
    }
    for (const [opp, byScenario] of Object.entries(storeMore)) {
      const source = src('main', main.files, `configurations where store's compiler speedup (mean without / mean with) is larger than ${opp}'s, same configuration; a comparison of two speedups, without a noise test`);
      const scopes = {...byScenario, all: Object.values(byScenario).flat()};
      for (const [scope, flags] of Object.entries(scopes)) {
        put('ctx.compilerGain.storeMore.<variant>.<scope>.count', [opp, scope], flags.filter(Boolean).length, {unit: 'count', source});
        put('ctx.compilerGain.storeMore.<variant>.<scope>.of', [opp, scope], flags.length, {unit: 'count', source});
      }
      const every = scenarios.filter(([sc]) => byScenario[sc]?.length && byScenario[sc].every(Boolean)).map(([sc]) => prose(sc));
      put('ctx.compilerGain.storeMore.<variant>.everyConfig', [opp], every.length ? listText(every) : 'none', {unit: 'text', source: source + ', scenarios where it holds in every configuration'});
    }
    series.ctx = {
      variants: CTX_VARIANTS,
      names: CTX_NAMES,
      vs: CTX_VS,
      cells: ctxCells,
      tallies: ctxTallies,
    };
  }

  // -------------------------------------------------------------- counts

  // What each counter counts. renders counts only the components that call
  // countRender, not every component (App and the list aren't counted).
  const MAIN_APP_SUITES = new Set(['main', 'fairness']);
  function metricText(suite, metric) {
    if (metric === 'renders') {
      return MAIN_APP_SUITES.has(suite)
        ? COUNTED_TEXT
        : suite === 'sweeps'
          ? 'counted renders (the sweep rows and row views that call countRender)'
          : `counted renders (the ${suite} components that call countRender)`;
    }
    return {rows: 'Row renders', selectors: 'selector calls', derivations: 'derivations'}[metric];
  }
  put('method.countedComponents', [], listText(COUNTED), {
    unit: 'text',
    source: 'src/apps/*.jsx (not sweep-*) and src/shared/views.jsx: top-level functions that call countRender; Row-like components (kind row) listed as Row',
  });
  const countRows = [];
  // Every counting result, for the reasons in the losses table.
  const allCounts = new Map();
  for (const set of ['counts', 'suite-counts']) {
    const {files, envs} = loaded[set];
    files.forEach((file, i) => {
      const suite = envs[i].suite ?? 'main';
      const results = readResultFile(path.join(resultsDir, file)).results.filter(r => r.kind === 'counts');
      for (const r of results) {
        const [variant, c] = r.bundle.split(' ');
        const compiler = c === '+compiler' ? 'on' : 'off';
        // The spike is only timed with the compiler.
        if (suite === 'derived-selectors-spike' && compiler === 'off') continue;
        for (const metric of ['renders', 'rows', 'selectors', 'derivations']) {
          if (typeof r[metric] !== 'number') continue;
          put('counts.<suite>.<scenario>.<variant>.<compiler>.<metric>', [suite, r.scenario, variant, compiler, metric], r[metric], {
            unit: 'count',
            source: src(set, [file], `counting build, ${metricText(suite, metric)} for one ${r.scenario} update, ${r.bundle}`),
          });
        }
        allCounts.set(`${suite}|${r.scenario}|${variant}|${compiler}`, r);
        if (suite !== 'main' && suite !== 'derived-selectors-spike') continue;
        countRows.push({
          suite,
          scenario: r.scenario,
          variant,
          compiler,
          renders: r.renders,
          rows: r.rows ?? null,
          selectors: r.selectors,
          derivations: r.derivations ?? null,
        });
      }
    });
  }
  series.counts = countRows;

  // An unread update: the counting build shows no variant of the suite
  // rendering anything for the scenario (derived-selectors' role changes a
  // field no component displays), so the DOM never changes. Its verdicts are
  // "unread update", counted as no work, never as a win.
  function isUnread(suite, scenario) {
    const rs = [...allCounts.entries()]
      .filter(([k]) => k.startsWith(`${suite}|${scenario}|`))
      .map(([, r]) => r);
    return rs.length > 0 && rs.every(r => r.renders === 0);
  }
  const unreadNote = (suite, scenario) =>
    isUnread(suite, scenario)
      ? ` · unread update: the counting build (${suite}) shows no variant rendering anything for ${scenario}, so the DOM never changes; counted as no work`
      : '';

  // -------------------------------------------------------------- suites

  series.suites = [];
  const lossRows = [];
  const lossTotals = {};
  // What the counting build says each side did for one update of the
  // scenario: the data behind a loss, without interpretation.
  function reasonFor(suite, scenario, left, opponent) {
    const a = allCounts.get(`${suite}|${scenario}|${left.variant}|${left.compiler}`);
    const b = allCounts.get(`${suite}|${scenario}|${opponent.variant}|${opponent.compiler}`);
    if (!a || !b) return null;
    const fields = [
      ['renders', 'counted renders'],
      ['rows', 'Row renders'],
      ['selectors', 'selector calls'],
      ['derivations', 'derivations'],
    ].filter(([f]) => typeof a[f] === 'number' && typeof b[f] === 'number' && (a[f] !== 0 || b[f] !== 0));
    const describeCounts = r => fields.map(([f, label]) => `${countDisplay(r[f])} ${label}`).join(', ');
    const counted = MAIN_APP_SUITES.has(suite) ? ` (counted: ${listText(COUNTED)})` : '';
    const size = (MAIN_APP_SUITES.has(suite) || suite === 'sweeps') && countsN ? ` at N=${int(Number(countsN))}` : '';
    return `Counting build, one update${size}${counted}. ${left.variant}: ${describeCounts(a)}. ${opponent.variant}: ${describeCounts(b)}.`;
  }

  function noteLoss(area, c, row) {
    lossTotals[area] ??= {count: 0, of: 0};
    if (c === null) return;
    lossTotals[area].of++;
    if (!c.tie && !c.noWork && c.ratio > 1) {
      lossTotals[area].count++;
      lossRows.push({area, ...row, ratio: r4(c.ratio), text: verdictText(c), reason: row.reason ?? null});
    }
  }

  for (const suite of ['derived-selectors', 'rapid-dispatch', 'many-components-same-slice', 'deeptree-nested-hooks', 'fairness']) {
    const data = load(pinnedFiles(sources, [suite])).get(suite);
    if (!data) continue;
    const stats = updateStats(data.results);
    const suiteVariants = [...new Set(data.results.filter(r => r.kind === 'update').map(r => r.variant))].sort(
      (a, b) => (a === 'redux' ? -1 : b === 'redux' ? 1 : a.localeCompare(b)),
    );
    const opponents = suiteVariants.filter(v => !v.startsWith('store'));
    // Only the store variants the suite ran (the fairness control runs only
    // Redux variants, so it has none).
    const lefts = ['store', ...EXTRA_VERDICTS].filter(v => suiteVariants.includes(v));
    // Controls: the other Redux setups (redux-plain, redux-nofreeze) vs
    // redux, each at its faster compiler setting, to show how much they move
    // Redux's time.
    const controls = suiteVariants.includes('redux') ? suiteVariants.filter(v => v.startsWith('redux-')) : [];
    const comparisonsByControl = Object.fromEntries(controls.map(v => [v, []]));
    const groupNs = new Set([...stats.keys()].map(g => g.split('|')[1]));
    if (groupNs.size > 1) throw new Error(`${suite} has more than one size`);
    const rows = [];
    const comparisonsByLeft = Object.fromEntries(lefts.map(l => [l, []]));
    for (const group of sortGroups(stats.keys())) {
      const [scenario, , t] = group.split('|');
      const byVariant = stats.get(group);
      const row = {scenario, throttle: Number(t), cells: {}, verdicts: {}};
      for (const v of suiteVariants) {
        const on = byVariant.get(name(v, true));
        const off = byVariant.get(name(v, false));
        row.cells[v] = {on: slim(on), off: slim(off)};
        for (const [c, e] of [['on', on], ['off', off]]) {
          if (!e) continue;
          put('suite.<suite>.<scenario>.x<throttle>.<variant>.<compiler>.median', [suite, scenario, t, v, c], e.median, {
            unit: 'ms',
            source: src(suite, e.files, `median of ${e.count} samples, ${v}${c === 'on' ? ' + compiler' : ''}, ${scenario}, ${t}× CPU`),
          });
        }
      }
      const best = fastest(byVariant, opponents, false);
      row.best = best?.label ?? null;
      row.controls = {};
      for (const v of controls) {
        const c = judge(bestOf(byVariant, v) ?? null, bestOf(byVariant, 'redux') ?? null);
        row.controls[v] = slimVerdict(c);
        comparisonsByControl[v].push(c);
      }
      for (const left of lefts) {
        const l = byVariant.get(name(left, true));
        const c = judge(l, best?.entry ?? null, {unread: isUnread(suite, scenario)});
        row.verdicts[left] = slimVerdict(c);
        comparisonsByLeft[left].push(c);
        if (!c) continue;
        put('suite.<suite>.<scenario>.x<throttle>.<left>.verdict', [suite, scenario, t, left], c.ratio, {
          unit: 'verdict',
          display: verdictText(c),
          source: src(suite, fileList([l, best.entry]), `stats.mjs compare(${left} + compiler, fastest of ${opponents.join('/')}), ${scenario}, ${t}× CPU`) + unreadNote(suite, scenario),
        });
        noteLoss('suites', c, {
          reason: reasonFor(suite, scenario, {variant: left, compiler: 'on'}, best),
          where: `${suite} · ${scenario} · ${t}× CPU`,
          left,
          leftMedian: r4(l.median),
          leftMean: r4(l.mean),
          opponent: best.label,
          opponentMedian: r4(best.entry.median),
          opponentMean: r4(best.entry.mean),
        });
      }
      rows.push(row);
    }
    const lefTallies = {};
    for (const left of lefts) {
      const t = tallyOf(comparisonsByLeft[left]);
      lefTallies[left] = roundTally(t);
      if (t.total === 0) continue;
      const source = src(suite, data.files.map(f => path.basename(f)), `tally of stats.mjs compare(${left} + compiler, fastest of ${opponents.join('/')})`);
      for (const field of ['wins', 'ties', 'losses', 'total']) {
        put(`suite.<suite>.tally.<left>.${field}`, [suite, left], t[field], {unit: 'count', source});
      }
      put('suite.<suite>.tally.<left>.range', [suite, left], describe(t), {unit: 'text', source});
      put('suite.<suite>.tally.<left>.rangeWork', [suite, left], describe({...t, noWork: 0, unread: 0}), {unit: 'text', source});
      put('suite.<suite>.tally.<left>.noWork', [suite, left], t.noWork, {unit: 'count', source});
    }
    const controlTallies = {};
    for (const v of controls) {
      const t = tallyOf(comparisonsByControl[v]);
      controlTallies[v] = roundTally(t);
      if (t.total === 0) continue;
      const source = src(suite, data.files.map(f => path.basename(f)), `tally of stats.mjs compare(${v}, redux), each at its faster compiler setting, every scenario and throttle ("faster" means ${v} is faster than redux)`);
      for (const field of ['wins', 'ties', 'losses', 'total']) {
        put(`suite.<suite>.control.<variant>.${field}`, [suite, v], t[field], {unit: 'count', source});
      }
      put('suite.<suite>.control.<variant>.range', [suite, v], describe(t), {unit: 'text', source});
    }
    series.suites.push({
      suite,
      title: SUITES[suite].title,
      variants: suiteVariants,
      opponents,
      lefts,
      controls,
      controlTallies,
      rows,
      tallies: lefTallies,
    });
  }

  // -------------------------------------------------------------- fairness5

  // The fairness suite with every variant (set fairness5): store + compiler
  // against the fastest Redux setup (RTK, plain Redux, RTK without
  // auto-freeze) and against Zustand. The headline stays defined against
  // idiomatic RTK Redux (method.headlineRedux); this closes the leaner-Redux
  // gap next to it.
  const FAIRNESS_REDUX = ['redux', 'redux-plain', 'redux-nofreeze'];
  const f5Files = pinnedFiles(sources, ['fairness5']);
  const f5 = f5Files.length ? [...load(f5Files).values()][0] : null;
  if (f5) {
    const set = 'fairness5';
    const f5Suite = f5.results.length ? f5Files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')).env.suite)[0] : set;
    const stats = updateStats(f5.results);
    const f5Variants = [...new Set(f5.results.filter(r => r.kind === 'update').map(r => r.variant))].sort();
    const opponents = {redux: FAIRNESS_REDUX, zustand: ['zustand']};
    const byOpponent = {redux: [], zustand: []};
    const rows = [];
    for (const group of sortGroups(stats.keys())) {
      const [scenario, , t] = group.split('|');
      const byVariant = stats.get(group);
      const row = {scenario, throttle: Number(t), cells: {}, verdicts: {}, best: {}};
      for (const v of f5Variants) {
        const on = byVariant.get(name(v, true));
        const off = byVariant.get(name(v, false));
        row.cells[v] = {on: slim(on), off: slim(off)};
        for (const [c, e] of [['on', on], ['off', off]]) {
          if (!e) continue;
          put('suite.<suite>.<scenario>.x<throttle>.<variant>.<compiler>.median', [set, scenario, t, v, c], e.median, {
            unit: 'ms',
            source: src(set, e.files, `median of ${e.count} samples, ${v}${c === 'on' ? ' + compiler' : ''}, ${scenario}, ${t}× CPU`),
          });
        }
      }
      const store = byVariant.get(name('store', true)) ?? null;
      for (const [opp, libs] of Object.entries(opponents)) {
        const best = fastest(byVariant, libs, false);
        const c = judge(store, best?.entry ?? null);
        row.verdicts[opp] = slimVerdict(c);
        row.best[opp] = best?.label ?? null;
        byOpponent[opp].push(c);
        if (!c) continue;
        const what = opp === 'redux' ? `the fastest of ${FAIRNESS_REDUX.join('/')}` : 'zustand';
        put('suite.fairness5.<scenario>.x<throttle>.vs<opponent>', [scenario, t, opp === 'redux' ? 'Redux' : 'Zustand'], c.ratio, {
          unit: 'verdict',
          display: verdictText(c),
          source: src(set, fileList([store, best.entry]), `stats.mjs compare(store + compiler, ${what}, each at its faster compiler setting), ${scenario}, ${t}× CPU`),
        });
        if (opp === 'redux') {
          put('suite.fairness5.<scenario>.x<throttle>.bestRedux', [scenario, t], best.label, {
            unit: 'text',
            source: src(set, fileList([best.entry]), `lowest mean of ${FAIRNESS_REDUX.join('/')}, ${scenario}, ${t}× CPU`),
          });
          noteLoss('fairness', c, {
            reason: reasonFor(f5Suite, scenario, {variant: 'store', compiler: 'on'}, best),
            where: `fairness (every Redux setup) · ${scenario} · ${t}× CPU`,
            left: 'store',
            leftMedian: r4(store.median),
            leftMean: r4(store.mean),
            opponent: best.label,
            opponentMedian: r4(best.entry.median),
            opponentMean: r4(best.entry.mean),
          });
        }
      }
      rows.push(row);
    }
    const tallies = {};
    for (const [opp, cs] of Object.entries(byOpponent)) {
      const t = tallyOf(cs);
      tallies[opp] = roundTally(t);
      if (t.total === 0) continue;
      const what = opp === 'redux' ? `the fastest of ${FAIRNESS_REDUX.join('/')}` : 'zustand';
      const source = src(set, f5.files.map(f => path.basename(f)), `tally of stats.mjs compare(store + compiler, ${what}, each at its faster compiler setting), every scenario and throttle`);
      const key = opp === 'redux' ? 'fastestRedux' : 'zustand';
      for (const field of ['wins', 'ties', 'losses', 'total', 'split']) {
        put(`suite.fairness5.tally.<opponent>.${field}`, [key], t[field], {unit: 'count', source});
      }
      put('suite.fairness5.tally.<opponent>.matchOrBeat', [key], t.wins + t.ties, {unit: 'count', source});
      put('suite.fairness5.tally.<opponent>.range', [key], describe(t), {unit: 'text', source});
    }
    series.fairness5 = {variants: f5Variants, redux: FAIRNESS_REDUX, rows, tallies};
  }
  put('method.headlineRedux', [], `The headline compares against idiomatic Redux: Redux Toolkit (configureStore, createSlice, Immer with auto-freeze) and react-redux, as in src/apps/redux.jsx. The leaner setups, plain Redux without RTK or Immer (redux-plain) and RTK without auto-freeze (redux-nofreeze), are compared separately${f5 ? ', in the fairness run with every variant, against the fastest of the three' : ''}.`, {
    unit: 'text',
    source: 'report-data.mjs HEADLINE_OPPONENTS and src/apps/redux.jsx, redux-plain.jsx, redux-nofreeze.jsx imports',
  });

  // -------------------------------------------------------------- spike

  const spikeData = load(pinnedFiles(sources, ['spike'])).get('derived-selectors-spike');
  if (spikeData) {
    const stats = updateStats(spikeData.results);
    const spikeVariants = [...new Set(spikeData.results.map(r => r.variant))];
    const lefts = ['store', 'store-memo', 'sharing'];
    const spikeCells = {};
    const byLeft = Object.fromEntries(lefts.map(l => [l, []]));
    const byLeftK = {};
    const families = [];
    const ks = new Set();
    const spikeThrottles = new Set();
    for (const [group, byVariant] of stats) {
      const [scenario, , t] = group.split('|');
      const [family, kPart] = scenario.split('-k');
      const k = kPart ? Number(kPart) : 5;
      if (!families.includes(family)) families.push(family);
      ks.add(k);
      spikeThrottles.add(Number(t));
      const redux = bestOf(byVariant, 'redux');
      const cell = {variants: {}, verdicts: {}};
      for (const v of spikeVariants) {
        const e = byVariant.get(name(v, true));
        if (!e) continue;
        const rel = redux ? e.mean / redux.mean : null;
        cell.variants[v] = {...slim(e), vsRedux: r4(rel)};
        put('spike.<family>.k<k>.x<throttle>.<variant>.median', [family, k, t, v], e.median, {
          unit: 'ms',
          source: src('spike', e.files, `median of ${e.count} samples, ${v} + compiler, ${scenario}, ${t}× CPU`),
        });
        if (rel !== null) {
          put('spike.<family>.k<k>.x<throttle>.<variant>.vsRedux', [family, k, t, v], rel, {
            unit: 'ratio',
            source: src('spike', fileList([e, redux]), `mean(${v}) / mean(redux), ${scenario}, ${t}× CPU`),
          });
        }
      }
      const sharing = [...SHARING]
        .map(v => ({v, e: byVariant.get(name(v, true))}))
        .filter(s => s.e)
        .sort((a, b) => a.e.mean - b.e.mean)[0];
      cell.sharing = sharing?.v ?? null;
      for (const left of lefts) {
        const l = left === 'sharing' ? sharing?.e : byVariant.get(name(left, true));
        const c = judge(l ?? null, redux ?? null, {unread: isUnread('derived-selectors-spike', scenario)});
        cell.verdicts[left] = slimVerdict(c);
        byLeft[left].push(c);
        ((byLeftK[left] ??= {})[k] ??= []).push(c);
        if (!c) continue;
        put('spike.<family>.k<k>.x<throttle>.<left>.verdict', [family, k, t, left], c.ratio, {
          unit: 'verdict',
          display: verdictText(c),
          source: src('spike', fileList([l, redux]), `stats.mjs compare(${left === 'sharing' ? 'fastest correct sharing variant' : left}, redux), ${scenario}, ${t}× CPU`) + unreadNote('derived-selectors-spike', scenario),
        });
        if (left !== 'sharing') {
          noteLoss('spike', c, {
            reason: reasonFor('derived-selectors-spike', scenario, {variant: left, compiler: 'on'}, {variant: 'redux', compiler: 'on'}),
            where: `shared derived data · ${family}, K=${k} · ${t}× CPU`,
            left,
            leftMedian: r4(l.median),
            leftMean: r4(l.mean),
            opponent: 'redux',
            opponentMedian: r4(redux.median),
            opponentMean: r4(redux.mean),
          });
        }
      }
      if (sharing) {
        put('spike.<family>.k<k>.x<throttle>.sharing.variant', [family, k, t], sharing.v, {
          unit: 'text',
          source: src('spike', sharing.e.files, `lowest mean of ${[...SHARING].join('/')}, ${scenario}, ${t}× CPU`),
        });
      }
      spikeCells[`${family}|${k}|${t}`] = cell;
    }
    const spikeFiles = spikeData.files.map(f => path.basename(f));
    const spikeTallies = {};
    for (const left of lefts) {
      const t = tallyOf(byLeft[left]);
      spikeTallies[left] = roundTally(t);
      if (t.total === 0) continue;
      const source = src('spike', spikeFiles, `tally of stats.mjs compare(${left}, redux) over every family, K and throttle`);
      for (const field of ['wins', 'ties', 'losses', 'total']) {
        put(`spike.tally.<left>.${field}`, [left], t[field], {unit: 'count', source});
      }
      put('spike.tally.<left>.range', [left], describe(t), {unit: 'text', source});
      put('spike.tally.<left>.matchOrBeat', [left], t.wins + t.ties, {unit: 'count', source});
      put('spike.tally.<left>.rangeWork', [left], describe({...t, noWork: 0, unread: 0}), {unit: 'text', source});
      put('spike.tally.<left>.noWork', [left], t.noWork, {unit: 'count', source});
      for (const [k, cs] of Object.entries(byLeftK[left])) {
        const tk = tallyOf(cs);
        const sourceK = src('spike', spikeFiles, `tally of stats.mjs compare(${left}, redux) at K=${k}`);
        put('spike.tally.<left>.k<k>.range', [left, k], describe(tk), {unit: 'text', source: sourceK});
        put('spike.tally.<left>.k<k>.rangeWork', [left, k], describe({...tk, noWork: 0, unread: 0}), {unit: 'text', source: sourceK});
        put('spike.tally.<left>.k<k>.noWork', [left, k], tk.noWork, {unit: 'count', source: sourceK});
      }
    }
    const spikeKs = [...ks].sort((a, b) => a - b);
    put('spike.ks', [], spikeKs.map(String).join(' and '), {unit: 'text', source: src('spike', spikeFiles, 'distinct K (readers per category) in the pinned spike scenarios')});
    // K=5 is the derived-selectors suite itself (its default readers per
    // category), so the spike doesn't run it again.
    const constantsFile = path.join(here, 'src/redux-suite/derived-selectors/constants.js');
    const constants = new Function(
      fs.readFileSync(constantsFile, 'utf8').replace(/^export /gm, '') + '\nreturn {DEFAULT_READERS_PER_CATEGORY};',
    )();
    put('spike.defaultK', [], constants.DEFAULT_READERS_PER_CATEGORY, {
      unit: 'count',
      source: 'src/redux-suite/derived-selectors/constants.js DEFAULT_READERS_PER_CATEGORY: readers per category in the derived-selectors suite (K without a -k suffix), which the spike does not re-run',
    });
    series.spike = {
      families,
      // Families whose every scenario is an unread update (isUnread).
      unread: families.filter(f =>
        [...stats.keys()].filter(g => g.split('|')[0].split('-k')[0] === f).every(g => isUnread('derived-selectors-spike', g.split('|')[0])),
      ),
      ks: [...ks].sort((a, b) => a - b),
      throttles: [...spikeThrottles].sort((a, b) => a - b),
      variants: spikeVariants,
      sharing: [...SHARING],
      cells: spikeCells,
      tallies: spikeTallies,
    };
  }

  // -------------------------------------------------------------- sweeps

  // The sweeps, for a set: 'sweeps' (keys sweep.*, losses noted) or
  // 'nobailout-sweeps' (keys nobailout.sweep.*, never in the losses).
  function sweepSection(set, prefix, seriesKey) {
    const sweepData = load(pinnedFiles(sources, [set])).get('sweeps');
    if (!sweepData) return;
    const stats = updateStats(sweepData.results);
    const sweepCells = {};
    const sweepScenarios = [];
    const sweepThrottles = new Set();
    const ratiosAcross = {};
    const byLib = {};
    for (const group of sortGroups(stats.keys())) {
      const [scenario, , t] = group.split('|');
      if (!sweepScenarios.includes(scenario)) sweepScenarios.push(scenario);
      sweepThrottles.add(Number(t));
      const byVariant = stats.get(group);
      for (const [config] of SWEEP_CONFIGS) {
        const configKey = config === 'c100-w8-off' ? 'c0-w8' : config;
        const {entry, best} = sweepEntries(byVariant, config);
        const cell = {libraries: {}, verdicts: {}};
        for (const lib of SWEEP_LIBRARIES) {
          const e = entry(lib);
          cell.libraries[lib] = slim(e);
          if (!e) continue;
          put(prefix + 'sweep.<scenario>.x<throttle>.<config>.<library>.median', [scenario, t, configKey, lib], e.median, {
            unit: 'ms',
            source: src(set, e.files, `median of ${e.count} samples, ${lib}-${config}, ${scenario}, ${t}× CPU`),
          });
        }
        for (const lib of SWEEP_STORES) {
          const e = entry(lib);
          const c = judge(e ?? null, best);
          cell.verdicts[lib] = slimVerdict(c);
          ((byLib[lib] ??= {})[scenario] ??= []).push(c);
          if (!c) continue;
          ((ratiosAcross[scenario] ??= {})[configKey] ??= {})[lib] ??= [];
          ratiosAcross[scenario][configKey][lib].push({ratio: c.ratio, files: fileList([e, best])});
          put(prefix + 'sweep.<scenario>.x<throttle>.<config>.<library>.verdict', [scenario, t, configKey, lib], c.ratio, {
            unit: 'verdict',
            display: verdictText(c),
            source: src(set, fileList([e, best]), `stats.mjs compare(${lib}-${config}, faster of redux/zustand), ${scenario}, ${t}× CPU`),
          });
          if (prefix) continue;
          const bestLib = ['redux', 'zustand'].find(l => entry(l) === best);
          const sweepVariant = (lib, cfg) => `${lib}-${cfg.replace(/-off$/, '')}`;
          const sweepCompiler = config.endsWith('-off') ? 'off' : 'on';
          noteLoss('sweeps', c, {
            reason: reasonFor('sweeps', scenario, {variant: sweepVariant(lib, config), compiler: sweepCompiler}, {variant: sweepVariant(bestLib, config), compiler: sweepCompiler}),
            where: `sweeps · ${scenario} · ${configKey} · ${t}× CPU`,
            left: lib,
            leftMedian: r4(e.median),
            leftMean: r4(e.mean),
            opponent: 'faster of redux/zustand',
            opponentMedian: r4(best.median),
            opponentMean: r4(best.mean),
          });
        }
        sweepCells[`${scenario}|${t}|${configKey}`] = cell;
      }
    }
    for (const [scenario, byConfig] of Object.entries(ratiosAcross)) {
      for (const [config, byLibrary] of Object.entries(byConfig)) {
        for (const [lib, list] of Object.entries(byLibrary)) {
          put(prefix + 'sweep.<scenario>.<config>.<library>.range', [scenario, config, lib], ratioRange(list.map(l => l.ratio)), {
            unit: 'text',
            source: src(set, [...new Set(list.flatMap(l => l.files))].sort(), `range over CPU throttles of mean(${lib}) / mean(faster of redux/zustand), ${scenario}, ${config}`),
          });
        }
      }
    }
    const sweepFiles = sweepData.files.map(f => path.basename(f));
    put(prefix + 'sweep.rows', [], [...new Set(sweepData.results.filter(r => r.kind === 'update').map(r => r.n))].map(int).join(' and '), {
      unit: 'text',
      source: src(set, sweepFiles, 'distinct n'),
    });
    const sweepTallies = {};
    for (const [lib, byScenario] of Object.entries(byLib)) {
      for (const [scenario, cs] of Object.entries(byScenario)) {
        const t = tallyOf(cs);
        (sweepTallies[lib] ??= {})[scenario] = roundTally(t);
        const source = src(set, sweepFiles, `tally of stats.mjs compare(${lib}, faster of redux/zustand), ${scenario}, every config and throttle`);
        for (const field of ['wins', 'ties', 'losses', 'total']) {
          put(`${prefix}sweep.tally.<library>.<scenario>.${field}`, [lib, scenario], t[field], {unit: 'count', source});
        }
        put(`${prefix}sweep.tally.<library>.<scenario>.matchOrBeat`, [lib, scenario], t.wins + t.ties, {unit: 'count', source});
        put(`${prefix}sweep.tally.<library>.<scenario>.range`, [lib, scenario], describe(t), {unit: 'text', source});
      }
    }
    series[seriesKey] = {
      scenarios: sweepScenarios,
      throttles: [...sweepThrottles].sort((a, b) => a - b),
      libraries: SWEEP_LIBRARIES,
      stores: SWEEP_STORES,
      configs: SWEEP_CONFIGS.map(([c, label]) => ({key: c === 'c100-w8-off' ? 'c0-w8' : c, label})),
      cells: sweepCells,
      tallies: sweepTallies,
    };
  }
  sweepSection('sweeps', '', 'sweeps');
  sweepSection('nobailout-sweeps', 'nobailout.', 'nobailoutSweeps');

  // -------------------------------------------------------------- without the bailout

  const nb = loadSet(sources, 'nobailout-main');
  const nbUpdates = nb.results.filter(r => r.kind === 'update');
  if (nbUpdates.length > 0) {
    const nbStats = updateStats(nbUpdates);
    const nbVariants = ['store', ...HEADLINE_OPPONENTS, 'zustand-granular'].filter(v =>
      nbUpdates.some(r => r.variant === v && r.compiler),
    );
    const nbScenarios = SCENARIOS.filter(([sc]) => nbUpdates.some(r => r.scenario === sc));
    const nbNs = [...new Set(nbUpdates.map(r => r.n))].sort((a, b) => a - b);
    const nbThrottles = [...new Set(nbUpdates.map(r => r.throttle))].sort((a, b) => a - b);
    const nbCells = {};
    const nbTallies = {};
    const gains = {};
    const nbAll = [];
    for (const [sc] of nbScenarios) {
      const cs = [];
      for (const n of nbNs) {
        for (const t of nbThrottles) {
          const byVariant = nbStats.get(`${sc}|${n}|${t}`);
          if (!byVariant) continue;
          const cell = {variants: {}};
          for (const v of nbVariants) {
            const e = byVariant.get(name(v, true));
            cell.variants[v] = slim(e);
            if (!e) continue;
            put('nobailout.main.<scenario>.n<n>.x<throttle>.<variant>.median', [sc, n, t, v], e.median, {
              unit: 'ms',
              source: src('nobailout-main', e.files, `median of ${e.count} samples, ${v} + compiler without the bailout, ${sc}, N=${n}, ${t}× CPU`),
            });
          }
          // Compiler on only: that's what this build is run with.
          const onOnly = new Map([...byVariant].filter(([k]) => k.endsWith(' +c')));
          const store = onOnly.get(name('store', true));
          const best = fastest(onOnly, HEADLINE_OPPONENTS, false);
          const c = judge(store ?? null, best?.entry ?? null);
          cell.verdict = slimVerdict(c);
          cell.best = best?.label ?? null;
          cell.opp = oppOf(best);
          cs.push(c);
          if (c) {
            put('nobailout.main.<scenario>.n<n>.x<throttle>.verdict', [sc, n, t], c.ratio, {
              unit: 'verdict',
              display: verdictText(c),
              source: src('nobailout-main', fileList([store, best.entry]), `stats.mjs compare(store + compiler, ${HEADLINE_LABEL}) without the bailout, ${sc}, N=${n}, ${t}× CPU`),
            });
          }
          const granular = onOnly.get(name('zustand-granular', true));
          const cg = judge(store ?? null, granular ?? null);
          cell.granular = slimVerdict(cg);
          cell.granularOpp = granular ? {variant: 'zustand-granular', compiler: 'on', median: r4(granular.median), mean: r4(granular.mean)} : null;
          if (cg) {
            put('nobailout.main.<scenario>.n<n>.x<throttle>.vsGranular', [sc, n, t], cg.ratio, {
              unit: 'verdict',
              display: verdictText(cg),
              source: src('nobailout-main', fileList([store, granular]), `stats.mjs compare(store + compiler, zustand-granular + compiler) without the bailout, ${sc}, N=${n}, ${t}× CPU`),
            });
          }
          // The same configuration on the head build, with the bailout.
          const withBailout = cellOf(sc, n, t)?.get(name('store', true)) ?? null;
          const gain = judge(withBailout, store ?? null);
          cell.withBailout = slim(withBailout);
          cell.gain = slimVerdict(gain);
          (gains[sc] ??= []).push(gain);
          if (gain) {
            put('nobailout.main.<scenario>.n<n>.x<throttle>.bailoutGain', [sc, n, t], gain.ratio, {
              unit: 'verdict',
              display: verdictText(gain),
              source: `main + nobailout-main: ${fileList([withBailout, store]).join(', ')} · stats.mjs compare(store + compiler with the bailout, without it), ${sc}, N=${n}, ${t}× CPU`,
            });
          }
          nbCells[`${sc}|${n}|${t}`] = cell;
        }
      }
      nbTallies[sc] = tallyOf(cs);
      nbAll.push(...cs);
    }
    nbTallies.all = tallyOf(nbAll);
    for (const [scope, t] of Object.entries(nbTallies)) {
      if (t.total === 0) continue;
      const source = src('nobailout-main', nb.files, `tally of stats.mjs compare(store + compiler, ${HEADLINE_LABEL}) without the bailout, ${scope === 'all' ? 'every scenario' : scope}`);
      const base = scope === 'all' ? 'nobailout.main.tally.all' : 'nobailout.main.tally.<scenario>';
      const params = scope === 'all' ? [] : [scope];
      for (const field of ['wins', 'ties', 'losses', 'total']) {
        put(`${base}.${field}`, params, t[field], {unit: 'count', source});
      }
      put(`${base}.range`, params, describe(t), {unit: 'text', source});
      if (scope === 'all') {
        put('nobailout.main.tally.all.matchOrBeat', [], t.wins + t.ties, {unit: 'count', source});
        put('nobailout.main.tally.all.split', [], t.split, {unit: 'count', source});
      }
    }
    // Which headline verdicts the bailout changes: the head build's verdict
    // vs this build's, same configuration (win / tie / loss).
    const kind = c => (!c ? null : c.noWork ? 'no work' : c.tie ? 'tie' : c.ratio < 1 ? 'win' : 'loss');
    const flips = [];
    for (const [k, cell] of Object.entries(nbCells)) {
      const [sc, n, t] = k.split('|');
      const byVariant = mainStats.get(k);
      if (!byVariant || !cell.verdict) continue;
      const head = judge(byVariant.get(name('store', true)) ?? null, fastest(byVariant, HEADLINE_OPPONENTS, false)?.entry ?? null);
      const without = kind({...cell.verdict, ratio: cell.verdict.ratio});
      if (head && kind(head) !== without) flips.push({sc, n: Number(n), t: Number(t), from: without, to: kind(head)});
    }
    const flipTitle = prose;
    const flipSource = src('main', main.files, `store + compiler vs ${HEADLINE_LABEL}: the verdict on the head build vs on the build without the bailout (nobailout-main, ${nb.files.length} files), same configuration, under method.verdictRule`);
    put('nobailout.main.flips', [], flips.length
      ? listText(flips.map(f => `${flipTitle(f.sc)} at N=${int(f.n)}, ${f.t}× CPU (${f.from} without the bailout, ${f.to} with it)`))
      : 'none', {unit: 'text', source: flipSource});
    put('nobailout.main.flipCount', [], flips.length, {unit: 'count', source: flipSource});
    put('nobailout.main.flipScenarios', [], flips.length
      ? listText([...groupBy(flips, f => f.sc)].map(([sc, fs]) => `${['one', 'two', 'three', 'four', 'five', 'six'][fs.length - 1] ?? fs.length} in ${flipTitle(sc)}`))
      : 'none', {unit: 'text', source: flipSource});

    // What the bailout buys store + compiler, per scenario and overall.
    gains.all = Object.values(gains).flat();
    for (const [scope, cs] of Object.entries(gains)) {
      const t = tallyOf(cs);
      const source = `main + nobailout-main: ${nb.files.length} nobailout files and the head main files for the same configurations · tally of stats.mjs compare(store + compiler with the bailout, without it), ${scope === 'all' ? 'every scenario' : scope}, every size and throttle ("faster" means faster with the bailout)`;
      for (const field of ['wins', 'ties', 'losses', 'total']) {
        put(`nobailout.main.bailoutGain.<scope>.${field}`, [scope], t[field], {unit: 'count', source});
      }
      put('nobailout.main.bailoutGain.<scope>.range', [scope], describe(t), {unit: 'text', source});
    }

    // The head build's headline tally over the same configurations, so the
    // two tallies compare like with like.
    const sameConfigs = Object.keys(nbCells).map(k => {
      const byVariant = mainStats.get(k);
      if (!byVariant) return null;
      return judge(byVariant.get(name('store', true)) ?? null, fastest(byVariant, HEADLINE_OPPONENTS, false)?.entry ?? null);
    });
    const withBailout = tallyOf(sameConfigs);
    nbTallies.withBailout = withBailout;
    const withSource = src('main', main.files, `tally of stats.mjs compare(store + compiler, ${HEADLINE_LABEL}) on the head build, over the configurations nobailout-main measured (${nbNs.map(int).join(' / ')} rows, ${nbThrottles.map(t => `${t}×`).join(' and ')} CPU)`);
    for (const field of ['wins', 'ties', 'losses', 'total']) {
      put(`nobailout.main.tally.withBailout.${field}`, [], withBailout[field], {unit: 'count', source: withSource});
    }
    put('nobailout.main.tally.withBailout.matchOrBeat', [], withBailout.wins + withBailout.ties, {unit: 'count', source: withSource});
    put('nobailout.main.tally.withBailout.range', [], describe(withBailout), {unit: 'text', source: withSource});
    put('nobailout.sizes', [], nbNs.map(int).join(' and '), {unit: 'text', source: src('nobailout-main', nb.files, 'distinct n')});
    put('nobailout.throttles', [], nbThrottles.map(t => `${t}×`).join(' and '), {unit: 'text', source: src('nobailout-main', nb.files, 'distinct throttle')});
    series.nobailout = {
      scenarios: nbScenarios.map(([key, title]) => ({key, title})),
      ns: nbNs,
      throttles: nbThrottles,
      variants: nbVariants,
      cells: nbCells,
      tallies: Object.fromEntries(Object.entries(nbTallies).map(([k, t]) => [k, roundTally(t)])),
    };
  }

  // -------------------------------------------------------------- history

  // The old final-build main run (status 'history'): the same headline
  // tally, by the same rule, so the report can say how the headline moved.
  if (sources.sets['history-final']?.status === 'history') {
    const set = 'history-final';
    const hUpdates = loaded[set].results.filter(r => r.kind === 'update');
    const hStats = updateStats(hUpdates);
    const hScenarios = SCENARIOS.filter(([sc]) => hUpdates.some(r => r.scenario === sc)).map(([sc]) => sc);
    const hConfigs = hStats.size;
    const cs = [...hStats.values()].map(byVariant =>
      judge(byVariant.get(name('store', true)) ?? null, fastest(byVariant, HEADLINE_OPPONENTS, false)?.entry ?? null),
    );
    const t = tallyOf(cs);
    const missing = SCENARIOS.map(([sc]) => sc).filter(sc => !hScenarios.includes(sc));
    const about = `${sources.sets[set].note ?? ''} ${hScenarios.length} scenarios (${hScenarios.join(', ')}${missing.length ? `, without ${missing.join(', ')}` : ''}).`.trim();
    const source = src(set, loaded[set].files, `tally of stats.mjs compare: ${COMPARISONS.selectors.label}, every scenario, size and throttle, by the same rule as main.tally.selectors.all. ${about}`);
    for (const field of ['wins', 'ties', 'losses', 'total', 'split']) {
      put(`history.final.tally.selectors.all.${field}`, [], t[field], {unit: 'count', source});
    }
    put('history.final.tally.selectors.all.matchOrBeat', [], t.wins + t.ties, {unit: 'count', source});
    put('history.final.tally.selectors.all.range', [], describe(t), {unit: 'text', source});
    put('history.final.scenarios', [], hScenarios.length, {unit: 'count', source: src(set, loaded[set].files, `distinct scenarios. ${about}`)});
    put('history.final.configs', [], hConfigs, {unit: 'count', source: src(set, loaded[set].files, `scenario × size × throttle groups. ${about}`)});
    series.history = {final: {scenarios: hScenarios, configs: hConfigs, tally: roundTally(t)}};
  }

  // -------------------------------------------------------------- the gate

  // How the timed runs were gated, from the units logs and the per-attempt
  // ambient records (report-sources.json gate). The pinned files of the sets
  // built from gate.<build>.dir are matched to their records by file name.
  if (sources.gate) {
    const readLog = f => fs.readFileSync(path.join(resultsDir, f), 'utf8').split('\n').filter(Boolean);
    const logs = Object.values(sources.gate).map(g => g.log);
    const logLines = logs.flatMap(f => readLog(f).map(line => ({file: f, line, at: line.slice(0, 19)})));
    const find = re => logLines.filter(l => re.test(l.line));
    const lineSource = ls => ls.map(l => `${l.file} ${l.at}`).join('; ');
    const ambientOn = find(/gate changed: ambient CPU/)[0];
    const thresholds = find(/ambient thresholds set to AMBIENT_START=([\d.]+) AMBIENT_DISCARD=([\d.]+)/).at(-1);
    const [, start, discard] = thresholds.line.match(/AMBIENT_START=([\d.]+) AMBIENT_DISCARD=([\d.]+)/);
    const gateBuilds = [];
    for (const [build, g] of Object.entries(sources.gate)) {
      const records = readLog(g.ambient).map(l => JSON.parse(l));
      const kept = new Map(records.filter(r => r.kept).map(r => [r.file, r]));
      const timedSets = currentSets.filter(
        s => expectedBuild(sources, s).dir === g.dir && loaded[s].results.some(r => r.kind !== 'counts'),
      );
      const timed = timedSets.flatMap(s => loaded[s].files.map(file => ({set: s, file})));
      const units = timed.filter(u => kept.has(u.file)).map(u => kept.get(u.file));
      const loadGated = timed.filter(u => !kept.has(u.file));
      gateBuilds.push({build, g, units, loadGated, timedSets});
      const sourceOf = what => `${g.ambient} (kept records of the ${units.length} pinned timed files of ${timedSets.join(', ')}) · ${what}`;
      put('method.gate.<build>.timedFiles', [build], timed.length, {
        unit: 'count',
        source: `every pinned timed file (counts excluded) of ${timedSets.join(', ')}; each is one gated unit (one scenario × throttle, or one suite, per restart) = ambientGated + loadGated`,
      });
      put('method.gate.<build>.ambientGated', [build], units.length, {unit: 'count', source: sourceOf('count of pinned timed files with a kept ambient record')});
      put('method.gate.<build>.loadGated', [build], loadGated.length, {
        unit: 'count',
        source: `pinned timed files of ${timedSets.join(', ')} with no record in ${g.ambient}${loadGated.length ? `: ${[...groupBy(loadGated, u => `${u.set} ${u.file.match(/-r(\d+)-/)?.[0].slice(1, -1) ?? ''}`).entries()].map(([k, us]) => `${k} (${us.length})`).join(', ')}` : ''}`,
      });
      if (units.length === 0) continue;
      const means = units.map(u => u.ambientMean).sort((a, b) => a - b);
      // The records keep two decimals.
      const cores = v => ({unit: 'count', display: v.toFixed(2)});
      put('method.gate.<build>.ambientMean.min', [build], means[0], {...cores(means[0]), source: sourceOf('min of ambientMean, cores')});
      put('method.gate.<build>.ambientMean.median', [build], median(means), {...cores(median(means)), source: sourceOf('median of ambientMean, cores')});
      put('method.gate.<build>.ambientMean.max', [build], means.at(-1), {...cores(means.at(-1)), source: sourceOf('max of ambientMean, cores')});
      const peak = Math.max(...units.map(u => u.ambientMax));
      put('method.gate.<build>.ambientPeak', [build], peak, {...cores(peak), source: sourceOf('max of ambientMax (the highest sample during a unit), cores')});
    }
    // A run whose log never set the thresholds kept units only at or below
    // them, if its highest kept mean is at or below the discard threshold.
    const keptMax = Math.max(...gateBuilds.flatMap(b => b.units.map(u => u.ambientMean)));
    const thresholdSource = `${lineSource([thresholds])} ("${thresholds.line.slice(20)}"); the highest kept per-unit mean over ${gateBuilds.map(b => b.g.ambient).join(' and ')} is ${keptMax.toFixed(2)}${keptMax <= Number(discard) ? ', at or below the discard threshold' : ', ABOVE the discard threshold'}`;
    put('method.gate.ambientStart', [], Number(start), {unit: 'count', display: start, source: thresholdSource});
    put('method.gate.ambientDiscard', [], Number(discard), {unit: 'count', display: discard, source: thresholdSource});

    const discards = find(/^\S+ \S+ discard \S+ attempt \d+:/);
    const beforeAmbient = discards.filter(l => l.at < ambientOn.at);
    const discardSource = what => `${logs.join(' and ')}: "discard <unit> attempt" lines${what}; the ambient gate started ${ambientOn.file} ${ambientOn.at}`;
    put('method.gate.discards.total', [], discards.length, {unit: 'count', source: discardSource('')});
    put('method.gate.discards.loadGate', [], beforeAmbient.length, {unit: 'count', source: discardSource(` before the ambient gate (${lineSource(beforeAmbient)})`)});
    put('method.gate.discards.ambientGate', [], discards.length - beforeAmbient.length, {
      unit: 'count',
      source: discardSource(' from the ambient gate on') + `; kept:false records in ${gateBuilds.map(b => b.g.ambient).join(' and ')}: ${gateBuilds.reduce((a, b) => a + readLog(b.g.ambient).filter(l => JSON.parse(l).kept === false).length, 0)}`,
    });

    // The gate history, from the gate lines.
    const loadChanges = find(/gate changed: LOAD_LIMIT=/).map(l => l.line.match(/LOAD_LIMIT=([\d.]+) DISCARD_LIMIT=([\d.]+)(?: \(was ([\d.]+)\/([\d.]+)\))?/));
    const structure = find(/STRUCTURE_DISCARD_LIMIT=/).map(l => l.line.match(/STRUCTURE_DISCARD_LIMIT=([\d.]+)/)[1]);
    const ambientFirst = ambientOn.line.match(/start <= ([\d.]+), discard if mean > ([\d.]+)/);
    const first = loadChanges.find(m => m[3]);
    const loadSteps = [first && `${first[3]}/${first[4]}`, ...loadChanges.map(m => `${m[1]}/${m[2]}`)].filter(Boolean);
    const loadGatedText = gateBuilds
      .filter(b => b.loadGated.length)
      .map(b => [...groupBy(b.loadGated, u => `${u.set} restart ${u.file.match(/-r(\d+)-/)?.[1] ?? '?'}`).entries()].map(([k, us]) => `${k} (${us.length} files)`).join(', '))
      .join(', ');
    const history = `Load-average gate first (start at or below a 1-minute load, re-run if the load after the unit was above: ${loadSteps.join(', then ')}${structure.length ? `, with structure units re-run above ${structure.at(-1)}` : ''}), used by ${loadGatedText || 'no pinned file'}. Then from ${ambientOn.at.slice(11, 16)} an ambient-CPU gate on cores used outside the benchmark (start at or below ${ambientFirst[1]}, re-run if the mean was above ${ambientFirst[2]}, set to ${start}/${discard} at ${thresholds.at.slice(11, 16)}), used by every other pinned timed file.`;
    put('method.gate.history', [], history, {
      unit: 'text',
      source: `${logs.join(' and ')}: lines with "gate changed", "discard rule" or "ambient thresholds" (${lineSource(find(/gate changed|discard rule|ambient thresholds/))}); load-gated files: pinned timed files with no ambient record`,
    });
  }

  // -------------------------------------------------------------- main losses

  for (const [s] of scenarios) {
    for (const n of ns) {
      for (const t of throttles) {
        const cell = cells[`${s}|${n}|${t}`];
        const byVariant = cellOf(s, n, t);
        if (!cell?.verdict) continue;
        const store = byVariant.get(name('store', true));
        for (const [area, opponents] of [['main', HEADLINE_OPPONENTS], ['granular', ['zustand-granular']]]) {
          const best = fastest(byVariant, opponents, false);
          if (!best) continue;
          noteLoss(area, judge(store, best.entry), {
            reason: reasonFor('main', s, {variant: 'store', compiler: 'on'}, best),
            where: `main · ${s} · N=${int(n)} · ${t}× CPU`,
            left: 'store',
            leftMedian: r4(store.median),
            leftMean: r4(store.mean),
            opponent: best.label,
            opponentMedian: r4(best.entry.median),
            opponentMean: r4(best.entry.mean),
          });
        }
      }
    }
  }
  const areaOrder = ['main', 'granular', 'suites', 'fairness', 'sweeps', 'spike'];
  lossRows.sort((a, b) => areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area) || b.ratio - a.ratio);
  let lossCount = 0;
  for (const area of areaOrder) {
    const t = lossTotals[area];
    if (!t) continue;
    lossCount += t.count;
    const set = {
      main: `main (vs ${HEADLINE_LABEL})`,
      granular: 'main (vs the granular control, zustand-granular)',
      suites: 'the suite sets',
      fairness: 'fairness5 (store vs the fastest Redux setup)',
      sweeps: 'sweeps',
      spike: 'spike',
    }[area];
    put('losses.<area>.count', [area], t.count, {unit: 'count', source: `${set}: comparisons the store side loses under method.verdictRule (outside two standard errors, slower in every restart)`});
    put('losses.<area>.of', [area], t.of, {unit: 'count', source: `${set}: comparisons made`});
  }
  put('losses.all.count', [], lossCount, {unit: 'count', source: 'sum of losses.<area>.count'});
  put('losses.all.of', [], areaOrder.reduce((a, area) => a + (lossTotals[area]?.of ?? 0), 0), {unit: 'count', source: 'sum of losses.<area>.of'});

  // The control comparisons, outside the losses table: counted here so a page
  // can include them or say they're excluded.
  const controls = [
    ['context', 'store + compiler vs one context (main)', tallies.context?.all, 'main.tally.context.all'],
    ['contextSplit', 'store + compiler vs a context per slice (main)', tallies['context-split']?.all, 'main.tally.context-split.all'],
    ['singleStore', `one store without selectors (store-single) + compiler vs ${HEADLINE_LABEL} (main)`, tallies['single-selectors']?.all, 'main.tally.single-selectors.all'],
    ['noCompiler', `store vs ${HEADLINE_LABEL}, everything without the compiler (main)`, tallies['nocompiler-selectors']?.all, 'main.tally.nocompiler-selectors.all'],
    ['noBailout', `store + compiler vs ${HEADLINE_LABEL} on the build without the same-element bailout`, series.nobailout?.tallies.all, 'nobailout.main.tally.all'],
    ['fairness5Zustand', 'store + compiler vs zustand in the fairness run with every variant', series.fairness5?.tallies.zustand, 'suite.fairness5.tally.zustand'],
  ].filter(([, , t]) => t && t.total > 0);
  for (const [id, label, t, from] of controls) {
    const source = `${from}.losses / .total · ${label}, under method.verdictRule`;
    put('losses.control.<control>.count', [id], t.losses, {unit: 'count', source});
    put('losses.control.<control>.of', [id], t.total, {unit: 'count', source});
  }
  const areaLabels = {
    main: `the headline (store + compiler vs ${HEADLINE_LABEL})`,
    granular: 'the granular control',
    suites: 'the ported Redux suites',
    fairness: 'the fastest Redux setup in the fairness run',
    sweeps: 'the sweeps',
    spike: 'the shared derived data spike',
  };
  put('losses.scope', [], `The losses table counts ${listText(areaOrder.filter(a => lossTotals[a]).map(a => areaLabels[a]))}. It leaves out the controls: ${listText(controls.map(([, label]) => label))}.`, {
    unit: 'text',
    source: 'report-data.mjs areaOrder (noteLoss areas) and the control tallies',
  });
  series.losses = lossRows;

  // -------------------------------------------------------------- typing

  series.typing = {};
  for (const [which, set] of [['main', 'main-typing'], ['suite', 'typing-suite']]) {
    const runs = loaded[set].results.filter(r => r.kind === 'typing');
    if (runs.length === 0) continue;
    const rows = [];
    for (const group of groupBy(runs, r => [r.variant, r.compiler, r.throttle].join('|')).values()) {
      const r = group[0];
      const latencies = group.flatMap(g => g.latencies);
      const files = [...new Set(group.map(g => g.file))].sort();
      const compiler = r.compiler ? 'on' : 'off';
      const row = {
        variant: r.variant,
        compiler,
        throttle: r.throttle,
        p50: r4(median(latencies)),
        p95: r4(percentile(latencies, 0.95)),
        max: r4(Math.max(...latencies)),
        settle: Math.round(median(group.map(g => g.settleMs))),
        runs: group.length,
        keys: latencies.length,
      };
      rows.push(row);
      const what = `${r.variant}${r.compiler ? ' + compiler' : ''}, ${r.throttle}× CPU, ${group.length} runs`;
      for (const [field, computation] of [
        ['p50', 'median latency'],
        ['p95', '95th percentile latency'],
        ['max', 'max latency'],
        ['settle', 'median settleMs (run.mjs: from the click into the input, before the first key, until the list caught up with the full typed text and every keydown latency was recorded)'],
      ]) {
        put(`typing.<which>.<variant>.<compiler>.x<throttle>.${field}`, [which, r.variant, compiler, r.throttle], row[field], {
          unit: 'ms',
          display: field === 'settle' ? int(row[field]) : row[field].toFixed(1),
          source: src(set, files, `${computation}, ${what}`),
        });
      }
    }
    rows.sort(
      (a, b) =>
        a.throttle - b.throttle ||
        a.variant.localeCompare(b.variant) ||
        a.compiler.localeCompare(b.compiler),
    );
    put('typing.<which>.rows', [which], runs[0].n, {unit: 'count', source: src(set, loaded[set].files, 'n of the typing runs')});
    put('typing.<which>.keys', [which], runs[0].latencies.length, {unit: 'count', source: src(set, loaded[set].files, 'latencies per run')});
    series.typing[which] = rows;
  }

  // -------------------------------------------------------------- memory

  const memoryRuns = loaded['main-memory'].results.filter(r => r.kind === 'memory');
  series.memory = [];
  for (const group of groupBy(memoryRuns, r => [r.variant, r.compiler, r.n].join('|')).values()) {
    const r = group[0];
    const compiler = r.compiler ? 'on' : 'off';
    const files = [...new Set(group.map(g => g.file))].sort();
    const row = {
      variant: r.variant,
      compiler,
      n: r.n,
      bytesPerRow: Math.round(median(group.map(g => g.bytesPerRow))),
      mountMs: r4(median(group.map(g => g.mountMs))),
      runs: group.length,
    };
    series.memory.push(row);
    const what = `${r.variant}${r.compiler ? ' + compiler' : ''}, N=${r.n}, ${group.length} runs`;
    put('memory.<variant>.<compiler>.n<n>.bytesPerRow', [r.variant, compiler, r.n], row.bytesPerRow, {
      unit: 'bytes',
      source: src('main-memory', files, `median bytesPerRow, ${what}`),
    });
    put('memory.<variant>.<compiler>.n<n>.mountMs', [r.variant, compiler, r.n], row.mountMs, {
      unit: 'ms',
      display: row.mountMs.toFixed(1),
      source: src('main-memory', files, `median mountMs, ${what}`),
    });
  }
  // Where a store per entity (store) sits: bytes per row against one context
  // and the selector libraries, at each size and compiler setting, and the
  // full ranking.
  for (const [key, rows] of groupBy(series.memory, r => `${r.compiler}|${r.n}`)) {
    const [compiler, n] = key.split('|');
    const files = loaded['main-memory'].files;
    const ranked = [...rows].sort((a, b) => a.bytesPerRow - b.bytesPerRow);
    const what = `median bytesPerRow, compiler ${compiler}, N=${int(Number(n))}`;
    put('memory.rank.<compiler>.n<n>', [compiler, n], ranked.map(r => `${r.variant} (${int(r.bytesPerRow)})`).join(', '), {
      unit: 'text',
      source: src('main-memory', files, `every variant sorted by ${what}, lowest first`),
    });
    put('memory.order.<compiler>.n<n>', [compiler, n], ranked.map(r => r.variant).join(', '), {
      unit: 'text',
      source: src('main-memory', files, `every variant sorted by ${what}, lowest first`),
    });
    const store = rows.find(r => r.variant === 'store');
    if (!store) continue;
    const place = ranked.indexOf(store) + 1;
    const ordinal = place % 10 === 1 && place !== 11 ? 'st' : place % 10 === 2 && place !== 12 ? 'nd' : place % 10 === 3 && place !== 13 ? 'rd' : 'th';
    put('memory.storeRank.<compiler>.n<n>', [compiler, n], `${place}${ordinal} of ${ranked.length}`, {
      unit: 'text',
      source: src('main-memory', files, `store's place among every variant sorted by ${what}, fewest bytes first`),
    });
    // store vs both Context variants, for the store-vs-context report.
    for (const lib of ['context', 'context-split']) {
      const other = rows.find(r => r.variant === lib);
      if (!other) continue;
      put('ctx.memory.storeVs.<variant>.<compiler>.n<n>', [lib, compiler, n], store.bytesPerRow / other.bytesPerRow, {
        unit: 'ratio',
        source: src('main-memory', files, `store / ${lib}, ${what}`),
      });
    }
    const names = {context: 'one context', redux: 'Redux', zustand: 'Zustand'};
    const more = [];
    const less = [];
    for (const lib of Object.keys(names)) {
      const other = rows.find(r => r.variant === lib);
      if (!other) continue;
      const ratio = store.bytesPerRow / other.bytesPerRow;
      put('memory.storeVs.<library>.<compiler>.n<n>', [lib, compiler, n], ratio, {
        unit: 'ratio',
        source: src('main-memory', files, `store / ${lib}, ${what}`),
      });
      (ratio > 1 ? more : less).push(names[lib]);
    }
    const either = xs => (xs.length === 2 ? `either ${xs[0]} or ${xs[1]}` : listText(xs));
    put('memory.storePlace.<compiler>.n<n>', [compiler, n], [more.length && `more than ${either(more)}`, less.length && `less than ${either(less)}`].filter(Boolean).join(', and '), {
      unit: 'text',
      source: src('main-memory', files, `store (a store per entity) vs ${Object.keys(names).join(', ')}, ${what}`),
    });
  }
  const memoryNs = [...new Set(series.memory.map(r => r.n))].sort((a, b) => a - b);
  put('memory.shownN', [], memoryNs.at(-1), {
    unit: 'count',
    source: src('main-memory', loaded['main-memory'].files, 'largest n, the size the memory chart shows first (charts.mjs memoryChart)'),
  });
  series.memory.sort(
    (a, b) =>
      a.n - b.n ||
      VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) ||
      a.compiler.localeCompare(b.compiler),
  );

  // Low-signal scenarios say so in the source of every key that cites them.
  for (const [scenario, {long: note}] of Object.entries(lowSignal)) {
    // The fairness suite runs the same app (its counts show the same).
    const cites = new RegExp(`^(main|nobailout\\.main|counts\\.main|counts\\.fairness|suite\\.fairness)\\.(tally\\.([^.]+\\.)?)?${scenario}\\.`);
    for (const [k, v] of Object.entries(values)) {
      if (cites.test(k)) v.source += ` · ${note}`;
    }
  }

  const data = {
    build,
    sources: Object.fromEntries(
      setNames.map(s => [s, {status: sources.sets[s].status, files: loaded[s].files}]),
    ),
    values: Object.fromEntries(Object.keys(values).sort().map(k => [k, values[k]])),
    series,
  };
  Object.defineProperty(data, 'patterns', {value: patternOf, enumerable: false});
  return data;
}

function roundTally(t) {
  if (!t) return null;
  const {lossRatios, ...rest} = t;
  return {...rest, min: r4(t.min), max: r4(t.max), range: describe(t)};
}

// "a", "a and b", "a, b, and c" (serial comma, style-sheet.md).
function listText(items) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

// ---------------------------------------------------------------- KEYS.md

export async function keysMarkdown(data) {
  const byPattern = new Map(Object.keys(PATTERNS).map(p => [p, []]));
  for (const [k, p] of data.patterns) byPattern.get(p).push(k);
  let generators = [];
  try {
    const charts = await import(pathToFileURL(chartsPath).href);
    generators = Object.entries(charts.generatorDocs ?? {}).map(([n, doc]) => [n, doc]);
  } catch (error) {
    generators = [['(charts.mjs failed to load)', String(error.message)]];
  }
  const lines = [
    '# bench-data.json keys',
    '',
    'Generated by `fixtures/store-bench/report-data.mjs` from the result files pinned in `fixtures/store-bench/results/report-sources.json`. Do not edit by hand.',
    '',
    'Cite a number as `<span data-n="KEY"></span>`, and a generated block as `<!-- gen:NAME -->`. `build-docs.mjs` fills both from `bench-data.json`, and G5 (`tools/check-numbers.mjs`) fails on any other number in the prose.',
    '',
    '**Every src page must include, by hand (build-docs.mjs does not insert them):**',
    '',
    '- `<!-- gen:charts-assets -->` once, in the `<head>`: the chart CSS and runtime. Without it the charts render statically, with no filters or tooltips.',
    '- `<!-- gen:build-label -->` near the top: the build provenance line. G5 fails on any page that has gen blocks or `data-n` spans and no build label.',
    '',
    `Build: ${data.build.label}`,
    '',
    `Headline bar: store + compiler vs ${HEADLINE_LABEL} (\`HEADLINE_OPPONENTS\` in report-data.mjs). The granular control (zustand-granular, a Zustand store per entity) has its own scoreboard column (\`main.tally.zustand-granular.*\`), per-cell verdicts (\`main.*.vsGranular\`) and losses area (\`losses.granular.*\`). The build without the same-element bailout has its own keys (\`nobailout.*\`) and generator (\`nobailout-table\`), never mixed into the headline.`,
    '',
    '## Generators (`<!-- gen:NAME -->`)',
    '',
    '| name | what it draws |',
    '|---|---|',
    ...generators.map(([n, doc]) => `| \`${n}\` | ${doc} |`),
    '',
    '## Comparisons (`main.tally.<comparison>`)',
    '',
    '| comparison | meaning |',
    '|---|---|',
    ...Object.entries(COMPARISONS).map(([id, c]) => `| \`${id}\` | ${c.label} |`),
    '',
    `Verdict rule (\`method.verdictRule\`, applied to every verdict and tally): ${VERDICT_RULE} Each library is compared at its faster compiler setting unless the comparison says otherwise. An update no variant renders anything for (the counting build) is an "unread update", counted as no work, never as a win.`,
    '',
    'History (`history.*`) comes from sets with status `history` in report-sources.json: older runs from other builds, kept to say how the headline moved, outside the head check. The gate keys (`method.gate.*`) come from report-sources.json `gate`: the per-attempt ambient-CPU records and the units logs.',
    '',
    '## Keys by pattern',
    '',
  ];
  for (const [pattern, keys] of byPattern) {
    lines.push(`### \`${pattern}\``, '', PATTERNS[pattern], '');
    if (keys.length === 0) {
      lines.push('_No values in the pinned data yet._', '');
      continue;
    }
    if (keys.length <= 12) {
      for (const k of keys) lines.push(`- \`${k}\`: ${data.values[k].display}`);
    } else {
      lines.push(`<details><summary>${keys.length} keys</summary>`, '');
      for (const k of keys) lines.push(`- \`${k}\`: ${data.values[k].display}`);
      lines.push('', '</details>');
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- pinning

// Replaces every set's files with the head re-run's files (headPattern), and
// marks the set 'head'. Fails if a file doesn't record the expected build, or
// if a set has fewer files than expected. With partial, a set with fewer
// files is pinned as 'partial-head' instead (to preview while the matrix
// runs; G5 fails on it), and a set with none is left alone.
export function pinHead(sets, {partial = false} = {}) {
  const sources = readSources();
  const all = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();
  const problems = [];
  const current = Object.keys(sources.sets).filter(s => sources.sets[s].status !== 'history');
  for (const set of sets.length ? sets : current) {
    const entry = sources.sets[set];
    if (!entry) throw new Error(`Unknown set ${set}`);
    if (entry.status === 'history') throw new Error(`${set} is a history set (use --pin-history)`);
    const pattern = new RegExp(entry.headPattern);
    let files = all.filter(f => pattern.test(f) && !f.includes('discarded'));
    if (entry.newestPerLabel) {
      const byLabel = new Map();
      for (const f of files) byLabel.set(f.replace(/-\d+\.json$/, ''), f);
      files = [...byLabel.values()].sort();
    }
    for (const f of files) {
      const env = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')).env;
      if (!matchesBuild(env, expectedBuild(sources, set))) {
        problems.push(`${set}: ${f} records ${env.react?.dir ?? 'no build'} at ${env.react?.sha ?? 'no sha'}`);
      }
    }
    let status = 'head';
    if (files.length < (entry.expectFiles ?? 1)) {
      if (!partial) {
        problems.push(`${set}: ${files.length} of ${entry.expectFiles ?? 1} expected files`);
      } else if (files.length === 0) {
        continue;
      }
      status = 'partial-head';
    }
    sources.sets[set] = {...entry, status, files};
    delete sources.sets[set].note;
  }
  if (problems.length) {
    throw new Error('Not pinned:\n  ' + problems.join('\n  '));
  }
  sources.pinnedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n');
  return sources;
}

// Re-pins every history set (status 'history') from its historyPattern,
// leaving out discarded attempts. History sets are older runs from other
// builds, kept for comparison and never part of the head check.
export function pinHistory() {
  const sources = readSources();
  const all = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();
  for (const entry of Object.values(sources.sets)) {
    if (entry.status !== 'history') continue;
    const pattern = new RegExp(entry.historyPattern);
    entry.files = all.filter(f => pattern.test(f) && !f.includes('discarded'));
  }
  fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n');
  return sources;
}

// ---------------------------------------------------------------- cli

// JSON with one line per value and per series, so diffs stay readable.
export function serialize(data) {
  const lines = (obj, inner) =>
    Object.entries(obj)
      .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(',\n');
  return `{
 "build": ${JSON.stringify(data.build)},
 "sources": {
${lines(data.sources, '  ')}
 },
 "values": {
${lines(data.values, '  ')}
 },
 "series": {
${lines(data.series, '  ')}
 }
}
`;
}

export async function renderOutputs(sources = readSources()) {
  const data = computeReportData(sources);
  return {
    data,
    json: serialize(data),
    keys: (await keysMarkdown(data)) + '\n',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    const sources = readSources();
    for (const [set, entry] of Object.entries(sources.sets)) {
      console.log(`${entry.status.padEnd(18)} ${set.padEnd(28)} ${entry.files.length} files`);
    }
  } else if (args.includes('--pin-history')) {
    const sources = pinHistory();
    for (const [set, entry] of Object.entries(sources.sets)) {
      if (entry.status === 'history') console.log(`pinned ${set}: ${entry.files.length} files`);
    }
  } else if (args.includes('--pin-head')) {
    const sets = args.filter(a => !a.startsWith('--'));
    try {
      pinHead(sets, {partial: args.includes('--partial')});
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    console.log(`pinned ${sets.length ? sets.join(', ') : 'every set'} to the head re-run; now run node report-data.mjs`);
  } else if (args.some(a => a.startsWith('--sources='))) {
    // Another pin list (e.g. the G5 test fixture): writes only the data.
    const opt = n => args.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const data = computeReportData(readSources(path.resolve(opt('sources'))));
    const out = path.resolve(opt('out') ?? 'bench-data.json');
    fs.writeFileSync(out, serialize(data));
    console.log(`wrote ${out} (${Object.keys(data.values).length} values); build ${data.build.status}`);
  } else {
    const {data, json, keys} = await renderOutputs();
    if (args.includes('--check')) {
      const same =
        fs.existsSync(dataPath) &&
        fs.readFileSync(dataPath, 'utf8') === json &&
        fs.existsSync(keysPath) &&
        fs.readFileSync(keysPath, 'utf8') === keys;
      console.log(same ? 'bench-data.json and KEYS.md are up to date' : 'bench-data.json or KEYS.md is stale: run node report-data.mjs');
      process.exit(same ? 0 : 1);
    }
    fs.mkdirSync(dataDir, {recursive: true});
    fs.writeFileSync(dataPath, json);
    fs.writeFileSync(keysPath, keys);
    console.log(
      `wrote ${path.relative(repo, dataPath)} (${Object.keys(data.values).length} values, ${(json.length / 1024).toFixed(0)} KB) and ${path.relative(repo, keysPath)}; build ${data.build.status}`,
    );
  }
}
