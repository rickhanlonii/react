// Drives the benchmark bundles in headless Chromium with Playwright.
//
//   node run.mjs --verify    Every variant renders the same DOM after each
//                            update (--steps=20) and after typing into the
//                            filter (counting build)
//   node run.mjs --counts    Renders and selector calls per update (counting build)
//   node run.mjs --smoke     Quick timing run: N=1k, no throttling
//   node run.mjs --full      Full timing matrix, typing latency and memory
//                            (--no-updates, --no-typing, --no-memory skip parts,
//                            so a long run can be split into gated pieces)
//
// Filters: --variants=store,redux --scenarios=entity,selection --n=1000
//          --compiler=on|off --throttle=1,4 --iterations=200 --warmup=50
//
// --suite=<name> runs a suite from src/redux-suite/suites.mjs (build it with
// node build.mjs --suite=<name>). The ported suites have a fixed data size, so
// N is 0.

import {chromium} from 'playwright';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {suites} from './src/redux-suite/suites.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function flag(name) {
  return args.includes('--' + name);
}
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}
function list(name, fallback) {
  const value = option(name, null);
  return value === null ? fallback : value.split(',');
}

const UPDATE_SCENARIOS = [
  'entity',
  'selection',
  'filter',
  'details-inline',
  'details-component',
  'details-churn',
  'structure',
];

const suite = option('suite', null);
if (suite !== null && !suites[suite]) {
  console.error(`Unknown suite ${suite}`);
  process.exit(1);
}

const mode = flag('verify')
  ? 'verify'
  : flag('counts')
    ? 'counts'
    : flag('full')
      ? 'full'
      : 'smoke';

const config = {
  verify: {dir: 'dist-count', n: [200], throttle: [1]},
  counts: {dir: 'dist-count', n: [1000], throttle: [1]},
  smoke: {
    dir: 'dist',
    n: [1000],
    throttle: [1],
    iterations: 100,
    warmup: 30,
    restarts: 1,
  },
  full: {
    dir: 'dist',
    n: [100, 1000, 10000],
    throttle: [1, 4],
    iterations: 200,
    warmup: 50,
    restarts: 3,
  },
}[mode];

// --dist=<dir> runs bundles from somewhere other than the mode's default.
const distDir = path.resolve(here, option('dist', config.dir));
const manifestPath = path.join(distDir, 'manifest.json');

function readBuildInfo() {
  const file = path.join(distDir, 'build-info.json');
  if (!fs.existsSync(file)) {
    console.warn(`no build-info.json in ${distDir}: rebuild to record the React build`);
    return {react: null, compiler: null};
  }
  const {react, compiler} = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {react, compiler};
}
if (!fs.existsSync(manifestPath)) {
  console.error(
    `Missing ${manifestPath}. Run: node build.mjs${config.dir === 'dist-count' ? ' --count' : ''}`,
  );
  process.exit(1);
}

const compilerFilter = option('compiler', null);
const variantFilter = list('variants', null);
const bundles = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  .map(file => {
    const match = file.match(/^(.*)-(compiler|nocompiler)(-count)?\.js$/);
    return {
      file: file.replace(/\.js$/, '.html'),
      variant: match[1],
      compiler: match[2] === 'compiler',
    };
  })
  .filter(b => variantFilter === null || variantFilter.includes(b.variant))
  .filter(
    b =>
      compilerFilter === null ||
      (compilerFilter === 'on') === b.compiler,
  );

const scenarioList = list(
  'scenarios',
  (suite && suites[suite].scenarios) || UPDATE_SCENARIOS,
);
const nList = list(
  'n',
  ((suite && suites[suite].n) || config.n).map(String),
).map(Number);
const throttleList = list('throttle', config.throttle.map(String)).map(Number);
const iterations = Number(option('iterations', config.iterations || 0));
const warmup = Number(option('warmup', config.warmup || 0));
const restarts = Number(option('restarts', config.restarts || 1));

// Uses the installed Google Chrome by default, so no browser download is needed.
const browserChannel = option('browser', 'chrome');
// --browser-path=<executable> runs any Chromium build instead.
const browserPath = option('browser-path', process.env.BENCH_BROWSER || null);
// --single-process runs the renderer in the browser process. V8 and React do
// the same work, but it avoids launching renderer processes, which some
// sandboxed environments don't allow.
const singleProcess = flag('single-process') || process.env.BENCH_SINGLE_PROCESS === '1';
function launch(extraArgs = []) {
  return chromium.launch({
    executablePath: browserPath || undefined,
    channel:
      browserPath || browserChannel === 'chromium' ? undefined : browserChannel,
    args: singleProcess
      ? ['--single-process', '--no-zygote', '--disable-gpu', ...extraArgs]
      : extraArgs,
  });
}

// ---------------------------------------------------------------- server

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(distDir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(distDir) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.endsWith('.html')
        ? 'text/html'
        : 'application/javascript',
      // Cross-origin isolation gives performance.now() ~5µs resolution
      // instead of 100µs.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => {
    server.listen(0, () => resolve(server));
  });
}

// ---------------------------------------------------------------- stats

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
// Same approach as scripts/bench/benchmark.js.
function standardErrorOfMean(values) {
  const means = [];
  for (let i = 0; i < 2000; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      sum += values[(Math.random() * values.length) | 0];
    }
    means.push(sum / values.length);
  }
  const m = mean(means);
  return Math.sqrt(mean(means.map(x => (x - m) ** 2)));
}
function summarize(values) {
  return {
    median: median(values),
    p95: percentile(values, 0.95),
    mean: mean(values),
    sem: standardErrorOfMean(values),
  };
}

// ---------------------------------------------------------------- pages

const timerInfo = {crossOriginIsolated: null};
let browserVersion = null;

// Every page gets its own browser, so no variant inherits another's JIT or GC
// state. (Single-process mode also only supports one page per browser.)
async function openBundle(port, bundle, throttle) {
  const browser = await launch(['--js-flags=--expose-gc']);
  browserVersion = browser.version();
  const page = await browser.newPage();
  const context = {close: () => browser.close()};
  page.on('pageerror', error => {
    throw new Error(`${bundle.file}: ${error.message}`);
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`http://localhost:${port}/${bundle.file}`);
  await page.waitForFunction(() => window.__bench !== undefined);
  // Without cross-origin isolation (e.g. in single-process mode) timers have
  // 100µs resolution. Timing is batched to compensate; record which we got.
  timerInfo.crossOriginIsolated = await page.evaluate(
    () => window.crossOriginIsolated,
  );
  if (throttle !== 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
  }
  return {context, page, cdp};
}

async function heapUsed(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const {usedSize} = await cdp.send('Runtime.getHeapUsage');
  return usedSize;
}

function label(bundle) {
  return `${bundle.variant}${bundle.compiler ? ' +compiler' : ''}`;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Typed into the filter by the typing scenario. It matches no label, so the
// list ends up empty.
const TYPED_TEXT = 'alpha bravo charlie';

// True once the list has caught up with the filter input: every row is hidden
// exactly when its label doesn't match, and the count agrees. Runs in the page.
function listMatchesInput() {
  const input = document.querySelector('input.filter');
  const count = document.querySelector('.count');
  if (input === null || count === null) {
    return false;
  }
  const filter = input.value;
  let visible = 0;
  for (const row of document.querySelectorAll('li.row')) {
    // The label text is the entity's label, ' #', and a hash.
    const text = row.querySelector('.label').textContent;
    const matches =
      filter === '' || text.slice(0, text.lastIndexOf(' #')).includes(filter);
    if (matches === row.classList.contains('hidden')) {
      return false;
    }
    if (matches) {
      visible++;
    }
  }
  return count.textContent === String(visible);
}

// Sweep variants with different row widths render different DOM, so verify
// compares bundles within a width.
function domGroup(bundle) {
  const match = bundle.variant.match(/-w(\d+)$/);
  return match === null ? '' : ` (w${match[1]})`;
}

// ---------------------------------------------------------------- modes

// Checks that every bundle in a group produced the same hashes, and prints
// the result. Returns false on a mismatch.
function compareTraces(name, traces) {
  let ok = true;
  const groups = new Map();
  for (const trace of traces) {
    const group = domGroup(trace.bundle);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(trace);
  }
  for (const [group, members] of groups) {
    const expected = members[0].hashes;
    const mismatches = members.filter(t => t.hashes !== expected);
    if (mismatches.length > 0) {
      ok = false;
      console.log(
        `✗ ${name}${group}: DOM differs from ${label(members[0].bundle)} in ` +
          mismatches.map(t => label(t.bundle)).join(', '),
      );
    } else {
      // A scenario whose DOM never changes would pass without testing much.
      const unchanged = new Set(expected.split(',')).size === 1;
      console.log(
        `✓ ${name}${group}: ${members.length} bundles render the same DOM` +
          (unchanged ? ' (the DOM never changes)' : ''),
      );
    }
  }
  return ok;
}

async function verify(port) {
  const steps = Number(option('steps', 20));
  let failed = false;
  for (const scenario of scenarioList) {
    const traces = [];
    for (const bundle of bundles) {
      const {context, page} = await openBundle(port, bundle, 1);
      await page.evaluate(
        ([n, s]) => window.__bench.mount(n, s),
        [nList[0], scenario],
      );
      const hashes = await page.evaluate(
        ([s, count]) => window.__bench.trace(s, count),
        [scenario, steps],
      );
      traces.push({bundle, hashes: hashes.join(',')});
      await context.close();
    }
    failed = !compareTraces(scenario, traces) || failed;
  }
  // The typing scenario, if the apps have a filter input: type into it, wait
  // for the list to catch up, and compare the DOM.
  const traces = [];
  for (const bundle of bundles) {
    const {context, page} = await openBundle(port, bundle, 1);
    await page.evaluate(n => window.__bench.mount(n, 'typing'), nList[0]);
    if ((await page.$('input.filter')) === null) {
      await context.close();
      break;
    }
    const before = await page.evaluate(() => window.__bench.trace(null, 0));
    await page.click('input.filter');
    await page.keyboard.type(TYPED_TEXT.slice(0, 4));
    await page.waitForFunction(listMatchesInput, null, {
      polling: 50,
      timeout: 10000,
    });
    const after = await page.evaluate(() => window.__bench.trace(null, 0));
    traces.push({bundle, hashes: [...before, ...after].join(',')});
    await context.close();
  }
  if (traces.length > 0) {
    failed = !compareTraces('typing', traces) || failed;
  }
  if (failed) {
    process.exitCode = 1;
  }
}

async function counts(port) {
  const rows = [];
  for (const scenario of scenarioList) {
    for (const bundle of bundles) {
      const {context, page} = await openBundle(port, bundle, 1);
      await page.evaluate(
        ([n, s]) => window.__bench.mount(n, s),
        [nList[0], scenario],
      );
      // Skip the first step, which can include one-time work. Suites with
      // random update mixes report the average over 200 steps.
      await page.evaluate(s => window.__bench.countStep(s, 0), scenario);
      const c = await page.evaluate(
        s =>
          window.__bench.countSteps
            ? window.__bench.countSteps(s, 1, 200)
            : window.__bench.countStep(s, 1),
        scenario,
      );
      rows.push({scenario, bundle: label(bundle), ...c});
      await context.close();
    }
  }
  console.log(`\nWork per update, N=${nList[0]} (one step, after a warm-up step)\n`);
  console.log('scenario'.padEnd(20), 'variant'.padEnd(28), 'renders'.padStart(8), 'rows'.padStart(8), 'selectors'.padStart(10), 'derivations'.padStart(12));
  for (const r of rows) {
    console.log(
      r.scenario.padEnd(20),
      r.bundle.padEnd(28),
      String(r.renders).padStart(8),
      String(r.rows ?? '').padStart(8),
      String(r.selectors).padStart(10),
      String(r.derivations ?? '').padStart(12),
    );
  }
  return rows;
}

async function timing(port, results) {
  // Randomize the order of configurations within each restart.
  const configs = [];
  for (const n of nList) {
    for (const throttle of throttleList) {
      for (const scenario of scenarioList) {
        for (const bundle of bundles) {
          configs.push({n, throttle, scenario, bundle});
        }
      }
    }
  }
  for (let restart = 0; restart < restarts; restart++) {
    const order = shuffle(configs);
    let done = 0;
    for (const {n, throttle, scenario, bundle} of order) {
      const {context, page} = await openBundle(port, bundle, throttle);
      const mountMs = await page.evaluate(
        ([count, s]) => window.__bench.mount(count, s),
        [n, scenario],
      );
      await page.evaluate(() => window.gc && window.gc());
      const {durations, batch} = await page.evaluate(
        ([s, it, wu]) => window.__bench.run(s, it, wu),
        [scenario, iterations, warmup],
      );
      results.push({
        kind: 'update',
        variant: bundle.variant,
        compiler: bundle.compiler,
        n,
        throttle,
        scenario,
        restart,
        mountMs,
        batch,
        durations,
      });
      await context.close();
      done++;
      process.stdout.write(`\r  restart ${restart + 1}/${restarts}: ${done}/${order.length}`);
    }
    process.stdout.write('\n');
  }
}

async function typing(port, results) {
  const n = Number(option('typing-n', 10000));
  for (const throttle of throttleList) {
    for (const bundle of bundles) {
      const {context, page} = await openBundle(port, bundle, throttle);
      await page.evaluate(count => window.__bench.mount(count, 'typing'), n);
      await page.evaluate(() => {
        // Rows are expensive in this scenario, so a synchronous re-filter
        // blocks the main thread.
        window.__bench.setWork(400);
        window.__latencies = [];
        document.addEventListener(
          'keydown',
          () => {
            const start = performance.now();
            requestAnimationFrame(() => {
              const channel = new MessageChannel();
              channel.port1.onmessage = () => {
                window.__latencies.push(performance.now() - start);
              };
              channel.port2.postMessage(null);
            });
          },
          true,
        );
      });
      const t0 = Date.now();
      await page.click('input.filter');
      await page.keyboard.type(TYPED_TEXT, {delay: 50});
      // settleMs: until the list has caught up with the input, and every
      // keydown's latency is recorded.
      await page.waitForFunction(
        length =>
          window.__latencies.length === length &&
          document.querySelector('input.filter').value.length === length,
        TYPED_TEXT.length,
        {polling: 50, timeout: 120000},
      );
      await page.waitForFunction(listMatchesInput, null, {
        polling: 50,
        timeout: 120000,
      });
      const settleMs = Date.now() - t0;
      const latencies = await page.evaluate(() => window.__latencies);
      results.push({
        kind: 'typing',
        variant: bundle.variant,
        compiler: bundle.compiler,
        n,
        throttle,
        settleMs,
        latencies,
      });
      console.log(
        `  typing ${label(bundle)} x${throttle}: p50 ${median(latencies).toFixed(1)}ms, p95 ${percentile(latencies, 0.95).toFixed(1)}ms`,
      );
      await context.close();
    }
  }
}

async function memory(port, results) {
  for (const n of nList) {
    for (const bundle of bundles) {
      const {context, page, cdp} = await openBundle(port, bundle, 1);
      const before = await heapUsed(cdp);
      const mountMs = await page.evaluate(count => window.__bench.mount(count, 'entity'), n);
      const after = await heapUsed(cdp);
      results.push({
        kind: 'memory',
        variant: bundle.variant,
        compiler: bundle.compiler,
        n,
        mountMs,
        bytes: after - before,
        bytesPerRow: (after - before) / n,
      });
      await context.close();
    }
  }
}

function printUpdateSummary(results) {
  const groups = new Map();
  for (const r of results.filter(r => r.kind === 'update')) {
    const key = [r.scenario, r.n, r.throttle, r.variant, r.compiler].join('|');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(...r.durations);
  }
  console.log('\nUpdate cost (ms per update, flushSync)\n');
  console.log('scenario'.padEnd(18), 'N'.padStart(6), 'cpu'.padStart(4), 'variant'.padEnd(28), 'median'.padStart(8), 'p95'.padStart(8), 'mean±sem'.padStart(16));
  for (const [key, durations] of [...groups].sort()) {
    const [scenario, n, throttle, variant, compiler] = key.split('|');
    const s = summarize(durations);
    console.log(
      scenario.padEnd(18),
      n.padStart(6),
      ('x' + throttle).padStart(4),
      (variant + (compiler === 'true' ? ' +compiler' : '')).padEnd(28),
      s.median.toFixed(3).padStart(8),
      s.p95.toFixed(3).padStart(8),
      (s.mean.toFixed(3) + '±' + s.sem.toFixed(3)).padStart(16),
    );
  }
}

async function main() {
  if (bundles.length === 0) {
    console.error('No bundles match the filters.');
    process.exit(1);
  }
  const server = await serve();
  const port = server.address().port;
  const results = [];
  const env = {
    date: new Date().toISOString(),
    mode,
    node: process.version,
    cpu: os.cpus()[0].model,
    platform: `${os.platform()} ${os.release()}`,
    chromium: chromium.name(),
    browserPath,
    singleProcess,
    timerInfo,
    suite,
    iterations,
    warmup,
    restarts,
    // Which React build and compiler the bundles were built from (build.mjs).
    ...readBuildInfo(),
    loadStart: os.loadavg(),
  };

  if (mode === 'verify') {
    await verify(port);
  } else if (mode === 'counts') {
    results.push(...(await counts(port)).map(r => ({kind: 'counts', ...r})));
  } else {
    if (!flag('no-updates')) {
      await timing(port, results);
    }
    printUpdateSummary(results);
    if ((mode === 'full' && !flag('no-typing')) || flag('typing')) {
      console.log('\nTyping during a re-filter (keydown → next frame)\n');
      await typing(port, results);
    }
    if ((mode === 'full' && !flag('no-memory')) || flag('memory')) {
      await memory(port, results);
    }
  }

  if (results.length > 0) {
    fs.mkdirSync(path.join(here, 'results'), {recursive: true});
    env.loadEnd = os.loadavg();
    env.browserVersion = browserVersion;
    const label = option('label', null);
    const out = path.join(
      here,
      'results',
      `${mode}${label ? '-' + label : ''}-${Date.now()}.json`,
    );
    fs.writeFileSync(out, JSON.stringify({env, results}, null, 1));
    console.log(`\nwrote ${path.relative(here, out)}`);
  }
  server.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
