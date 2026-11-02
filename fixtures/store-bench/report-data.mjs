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
import {median, percentile, compare, verdict, ms} from './stats.mjs';
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

export function x(value) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

// "1.2–1.4× faster", "up to 1.3× faster (5 faster, 1 tie)", "1.2–1.4× slower"
// for a tally of comparisons (speedups are the other time / store time).
export function describe(t) {
  if (!t || t.total === 0) return t?.noWork ? 'no work' : 'n/a';
  if (t.noWork) {
    return `${describe({...t, noWork: 0})}, and ${t.noWork} with no work`;
  }
  const counts = [
    t.wins && `${t.wins} faster`,
    t.ties && `${t.ties} tie`,
    t.losses && `${t.losses} slower`,
  ]
    .filter(Boolean)
    .join(', ');
  if (t.losses === 0 && t.ties === 0) return `${x(t.min)}–${x(t.max)}× faster`;
  if (t.wins === 0 && t.ties === 0) return `${x(1 / t.max)}–${x(1 / t.min)}× slower`;
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

// stats.mjs compare, except that a left side whose median is 0 did no
// measurable work (below the timer resolution, e.g. a store update nobody
// reads): that's "no work", and tallies count it apart instead of as a huge
// speedup (as storeVerdict in report-suites.mjs does).
export function judge(left, opponent) {
  if (!left || !opponent) return null;
  if (left.median === 0) {
    return {ratio: left.mean / opponent.mean, tie: false, noWork: true};
  }
  return compare(left, opponent);
}

// The verdict from stats.mjs as plain text: "1.4× faster", "tie", "n/a".
export function verdictText(c) {
  return c?.noWork ? 'no work' : verdict(c).replace(/<[^>]+>/g, '');
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
    noWork: all.length - cs.length,
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

function slimVerdict(c) {
  return c === null
    ? null
    : {ratio: r4(c.ratio), tie: c.tie, noWork: Boolean(c.noWork), text: verdictText(c)};
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
  'method.loadMax': 'Highest 1-minute load average recorded before or after any pinned run.',
  'method.timedUpdates': 'Total timed update samples in the main suite.',
  'lib.<package>': 'Installed version of a compared library (redux, react-redux, @reduxjs/toolkit, zustand, reselect).',
  'main.<scenario>.n<n>.x<throttle>.<variant>.<compiler>.median': 'Main suite: median ms per update.',
  'main.<scenario>.n<n>.x<throttle>.verdict': 'Main suite: store + compiler vs the headline opponents (HEADLINE_OPPONENTS in report-data.mjs: the faster of Redux and Zustand, each at its faster compiler setting); value is the ratio of means (store / best), display is "1.4× faster", "tie" or "1.2× slower".',
  'main.<scenario>.n<n>.x<throttle>.best': 'Main suite: which library and compiler setting was the fastest headline opponent (HEADLINE_OPPONENTS) in that configuration.',
  'main.<scenario>.n<n>.x<throttle>.vsGranular': 'Main suite: store + compiler vs the granular control (zustand-granular, a Zustand store per entity) at its faster compiler setting. Not part of the headline.',
  'main.tally.<comparison>.<scenario>.wins': 'Main suite: configurations of the scenario the left side won (outside two standard errors). Comparisons: see KEYS.md "Comparisons".',
  'main.tally.<comparison>.<scenario>.ties': 'Main suite: configurations within two standard errors.',
  'main.tally.<comparison>.<scenario>.losses': 'Main suite: configurations the left side lost.',
  'main.tally.<comparison>.<scenario>.total': 'Main suite: configurations compared.',
  'main.tally.<comparison>.<scenario>.matchOrBeat': 'Main suite: wins + ties.',
  'main.tally.<comparison>.<scenario>.range': 'Main suite: the range of speedups as text, e.g. "1.2–1.4× faster" or "up to 1.3× faster (5 faster, 1 tie)".',
  'main.tally.<comparison>.all.wins': 'Main suite, every scenario: wins.',
  'main.tally.<comparison>.all.ties': 'Main suite, every scenario: ties.',
  'main.tally.<comparison>.all.losses': 'Main suite, every scenario: losses.',
  'main.tally.<comparison>.all.total': 'Main suite, every scenario: configurations compared.',
  'main.tally.<comparison>.all.matchOrBeat': 'Main suite, every scenario: wins + ties. main.tally.selectors.all.matchOrBeat is the headline.',
  'main.tally.<comparison>.all.range': 'Main suite, every scenario: range of speedups as text.',
  'counts.<suite>.<scenario>.<variant>.<compiler>.<metric>': 'Counting build, one update (averaged where the suite averages): renders, rows (Row renders), selectors (selector calls) or derivations. Suite "main" is the main suite at N=1,000.',
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
  'spike.tally.<left>.range': 'Spike: range of speedups vs Redux as text.',
  'spike.tally.<left>.k<k>.range': 'Spike at one K: range of speedups vs Redux as text.',
  'sweep.<scenario>.x<throttle>.<config>.<library>.median': 'Sweeps (N=1,000): median ms per update. Configs: c100/c90/c75/c50-w8 (% of rows compiled, 8 props), c0-w8 (no compiler), c100-w4, c100-w16 (props per row).',
  'sweep.<scenario>.x<throttle>.<config>.<library>.verdict': 'Sweeps: store or store-keyed vs the faster of Redux and Zustand at the same config.',
  'sweep.<scenario>.<config>.<library>.range': 'Sweeps: store or store-keyed vs the faster of Redux and Zustand, range of ratios across CPU throttles as text.',
  'sweep.tally.<library>.<scenario>.wins': 'Sweeps: configs (all, × throttles) won.',
  'sweep.tally.<library>.<scenario>.ties': 'Sweeps: ties.',
  'sweep.tally.<library>.<scenario>.losses': 'Sweeps: losses.',
  'sweep.tally.<library>.<scenario>.total': 'Sweeps: configs compared.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.p50': 'Typing (which = main or suite): median keydown-to-frame latency, ms.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.p95': 'Typing: 95th percentile latency, ms.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.max': 'Typing: worst latency, ms.',
  'typing.<which>.<variant>.<compiler>.x<throttle>.settle': 'Typing: ms until the list settled after the last key (median of runs).',
  'typing.<which>.rows': 'Typing: rows re-filtered on every key.',
  'typing.<which>.keys': 'Typing: keys typed per run.',
  'memory.<variant>.<compiler>.n<n>.bytesPerRow': 'Heap growth after mounting N rows (after GC) / N, bytes (median of runs).',
  'memory.<variant>.<compiler>.n<n>.mountMs': 'Time to mount N rows, ms (median of runs).',
  'losses.<area>.count': 'Where it doesn\'t win: configurations the store side lost (outside two standard errors) in an area: main (vs the headline opponents), granular (main suite vs the granular control), suites, sweeps, spike.',
  'losses.<area>.of': 'Where it doesn\'t win: configurations compared in the area.',
  'losses.all.count': 'Where it doesn\'t win: losses over every area.',
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
  const placeholderSets = setNames.filter(s => sources.sets[s].status !== 'head');
  const mismatched = [];
  const compilers = new Set();
  let loadMax = null;
  for (const s of setNames) {
    loaded[s].envs.forEach((env, i) => {
      if (!matchesBuild(env, expectedBuild(sources, s))) {
        mismatched.push(loaded[s].files[i]);
      }
      if (env.compiler?.sha256) compilers.add(env.compiler.sha256);
      for (const l of [...(env.loadStart ?? []), ...(env.loadEnd ?? [])]) {
        loadMax = loadMax === null ? l : Math.max(loadMax, l);
      }
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
      : `PLACEHOLDER: ${placeholderSets.length} of ${setNames.length} result sets (${placeholderSets.join(', ')}) aren't from the frozen builds yet (older builds or not run). Do not cite these numbers.`;
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
  put('method.loadMax', [], loadMax, {
    unit: 'count',
    display: loadMax === null ? undefined : loadMax.toFixed(1),
    source: 'max of env.loadStart and env.loadEnd over every pinned file that records them',
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
        const granular = fastest(byVariant, ['zustand-granular'], false);
        const cg = judge(store, granular?.entry ?? null);
        cell.granular = slimVerdict(cg);
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
      all.push(...cs);
    }
    perScenario.all = tallyOf(all);
    tallies[id] = perScenario;
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
      put(`${base}.range`, params, describe(t), {unit: 'text', source});
    }
  }

  series.main = {
    headline: HEADLINE_LABEL,
    scenarios: scenarios.map(([key, title, description]) => ({key, title, description})),
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

  // -------------------------------------------------------------- counts

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
            source: src(set, [file], `counting build, ${metric} for one ${r.scenario} update, ${r.bundle}`),
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
      ['renders', 'component renders'],
      ['rows', 'Row renders'],
      ['selectors', 'selector calls'],
      ['derivations', 'derivations'],
    ].filter(([f]) => typeof a[f] === 'number' && typeof b[f] === 'number' && (a[f] !== 0 || b[f] !== 0));
    const describeCounts = r => fields.map(([f, label]) => `${countDisplay(r[f])} ${label}`).join(', ');
    return `Counting build, one update${suite === 'main' || suite === 'fairness' || suite === 'sweeps' ? ' at N=1,000' : ''}: ${left.variant} ${describeCounts(a)}; ${opponent.variant} ${describeCounts(b)}.`;
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
    const lefts = ['store', ...EXTRA_VERDICTS.filter(v => suiteVariants.includes(v))];
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
      for (const left of lefts) {
        const l = byVariant.get(name(left, true));
        const c = judge(l, best?.entry ?? null);
        row.verdicts[left] = slimVerdict(c);
        comparisonsByLeft[left].push(c);
        if (!c) continue;
        put('suite.<suite>.<scenario>.x<throttle>.<left>.verdict', [suite, scenario, t, left], c.ratio, {
          unit: 'verdict',
          display: verdictText(c),
          source: src(suite, fileList([l, best.entry]), `stats.mjs compare(${left} + compiler, fastest of ${opponents.join('/')}), ${scenario}, ${t}× CPU`),
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
    }
    series.suites.push({
      suite,
      title: SUITES[suite].title,
      variants: suiteVariants,
      opponents,
      lefts,
      rows,
      tallies: lefTallies,
    });
  }

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
        const c = judge(l ?? null, redux ?? null);
        cell.verdicts[left] = slimVerdict(c);
        byLeft[left].push(c);
        ((byLeftK[left] ??= {})[k] ??= []).push(c);
        if (!c) continue;
        put('spike.<family>.k<k>.x<throttle>.<left>.verdict', [family, k, t, left], c.ratio, {
          unit: 'verdict',
          display: verdictText(c),
          source: src('spike', fileList([l, redux]), `stats.mjs compare(${left === 'sharing' ? 'fastest correct sharing variant' : left}, redux), ${scenario}, ${t}× CPU`),
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
      for (const [k, cs] of Object.entries(byLeftK[left])) {
        put('spike.tally.<left>.k<k>.range', [left, k], describe(tallyOf(cs)), {
          unit: 'text',
          source: src('spike', spikeFiles, `tally of stats.mjs compare(${left}, redux) at K=${k}`),
        });
      }
    }
    series.spike = {
      families,
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
    const sweepTallies = {};
    for (const [lib, byScenario] of Object.entries(byLib)) {
      for (const [scenario, cs] of Object.entries(byScenario)) {
        const t = tallyOf(cs);
        (sweepTallies[lib] ??= {})[scenario] = roundTally(t);
        const source = src(set, sweepFiles, `tally of stats.mjs compare(${lib}, faster of redux/zustand), ${scenario}, every config and throttle`);
        for (const field of ['wins', 'ties', 'losses', 'total']) {
          put(`${prefix}sweep.tally.<library>.<scenario>.${field}`, [lib, scenario], t[field], {unit: 'count', source});
        }
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
    }
    series.nobailout = {
      scenarios: nbScenarios.map(([key, title]) => ({key, title})),
      ns: nbNs,
      throttles: nbThrottles,
      variants: nbVariants,
      cells: nbCells,
      tallies: Object.fromEntries(Object.entries(nbTallies).map(([k, t]) => [k, roundTally(t)])),
    };
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
  const areaOrder = ['main', 'granular', 'suites', 'sweeps', 'spike'];
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
      sweeps: 'sweeps',
      spike: 'spike',
    }[area];
    put('losses.<area>.count', [area], t.count, {unit: 'count', source: `${set}: comparisons outside two standard errors where the store side is slower`});
    put('losses.<area>.of', [area], t.of, {unit: 'count', source: `${set}: comparisons made`});
  }
  put('losses.all.count', [], lossCount, {unit: 'count', source: 'sum of losses.<area>.count'});
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
        ['settle', 'median settleMs'],
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
  series.memory.sort(
    (a, b) =>
      a.n - b.n ||
      VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) ||
      a.compiler.localeCompare(b.compiler),
  );

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
  return t ? {...t, min: r4(t.min), max: r4(t.max), range: describe(t)} : null;
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
    'Verdicts use `stats.mjs` `compare`: a tie is a difference in means within two standard errors; otherwise the ratio of means decides. Each library is compared at its faster compiler setting unless the comparison says otherwise.',
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
  for (const set of sets.length ? sets : Object.keys(sources.sets)) {
    const entry = sources.sets[set];
    if (!entry) throw new Error(`Unknown set ${set}`);
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
