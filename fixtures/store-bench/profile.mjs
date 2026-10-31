// CPU profiles of the update scenarios, for attributing time to React
// internals. Builds unminified compiled bundles (so React's function names
// survive) and samples them with the CDP Profiler.
//
//   node profile.mjs --variants=store,zustand --scenarios=selection --n=1000
//
// Options:
//   --react=<dir>      React build to bundle (default build/oss-experimental)
//   --out=<dir>        Where to write the bundles (default dist-prof)
//   --no-build         Reuse the bundles in --out
//   --compiler=on|off  Default on
//   --iterations=N     Timed samples (the harness batches each one)
//   --interval=µs      Sampling interval (default 25)
//   --top=N            Functions to print per variant (default 40)
//   --save             Keep the raw .cpuprofile files in results/profiles
//   --suite=<name>     Profile a suite from src/redux-suite/suites.mjs

import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {suites} from './src/redux-suite/suites.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}
function flag(name) {
  return args.includes('--' + name);
}

const reactBuild = path.resolve(
  here,
  option('react', path.join(repo, 'build/oss-experimental'))
);
const outDir = path.resolve(here, option('out', 'dist-prof'));
const suiteName = option('suite', null);
if (suiteName !== null && !suites[suiteName]) {
  throw new Error(`Unknown suite ${suiteName}`);
}
const suite = suiteName === null ? null : suites[suiteName];
const appsDir = suite === null ? 'src/apps' : suite.apps;
const variants = option('variants', 'store,store-single,zustand,context').split(
  ','
);
const scenarios = option('scenarios', 'selection').split(',');
const nList = option('n', suite && suite.n ? suite.n.join(',') : '1000')
  .split(',')
  .map(Number);
const compiled = option('compiler', 'on') === 'on';
const iterations = Number(option('iterations', 300));
const warmup = Number(option('warmup', 200));
const interval = Number(option('interval', 25));
const top = Number(option('top', 40));
const throttle = Number(option('throttle', 1));
const browserPath = process.env.BENCH_BROWSER || null;
const singleProcess = process.env.BENCH_SINGLE_PROCESS === '1';

const compilerPath = path.join(
  repo,
  'compiler/packages/babel-plugin-react-compiler/dist/index.js'
);

function compilerPlugin() {
  const babel = require('@babel/core');
  const reactCompiler = require(compilerPath);
  return {
    name: 'react-compiler',
    setup(b) {
      b.onLoad({filter: /\/src\/.*\.jsx$/}, async a => {
        const source = await fs.promises.readFile(a.path, 'utf8');
        const result = await babel.transformAsync(source, {
          filename: a.path,
          babelrc: false,
          configFile: false,
          parserOpts: {plugins: ['jsx']},
          plugins: [
            [reactCompiler, {target: '19', panicThreshold: 'all_errors'}],
          ],
        });
        return {contents: result.code, loader: 'jsx'};
      });
    },
  };
}

function bundleName(variant) {
  return `${variant}-${compiled ? 'compiler' : 'nocompiler'}`;
}

async function buildBundles() {
  fs.mkdirSync(outDir, {recursive: true});
  for (const variant of variants) {
    const outfile = path.join(outDir, bundleName(variant) + '.js');
    // A suite variant can build another entry with extra defines.
    const config =
      (suite && suite.variants.find(v => v.name === variant)) || {};
    await build({
      entryPoints: [
        path.join(here, appsDir, (config.entry || variant) + '.jsx'),
      ],
      bundle: true,
      // Not minified, so the profile has React's function names. Syntax
      // minification only, to stay close to the timed bundles.
      minify: false,
      minifySyntax: true,
      format: 'iife',
      target: 'es2022',
      outfile,
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"production"',
        __COUNT__: 'false',
        ...config.define,
      },
      alias: {
        react: path.join(reactBuild, 'react'),
        'react-dom': path.join(reactBuild, 'react-dom'),
        scheduler: path.join(reactBuild, 'scheduler'),
        'use-sync-external-store': path.join(
          reactBuild,
          'use-sync-external-store'
        ),
      },
      plugins: compiled ? [compilerPlugin()] : [],
      logLevel: 'warning',
    });
    fs.writeFileSync(
      outfile.replace(/\.js$/, '.html'),
      `<!doctype html><html><head><meta charset="utf-8"></head><body><script src="./${path.basename(outfile)}"></script></body></html>`
    );
  }
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(outDir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(outDir) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.endsWith('.html')
        ? 'text/html'
        : 'application/javascript',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

function launch() {
  return chromium.launch({
    executablePath: browserPath || undefined,
    channel: browserPath ? undefined : 'chrome',
    args: [
      process.env.PROF_JS_FLAGS
        ? '--js-flags=--expose-gc ' + process.env.PROF_JS_FLAGS
        : '--js-flags=--expose-gc',
      ...(singleProcess
        ? ['--single-process', '--no-zygote', '--disable-gpu']
        : []),
    ],
  });
}

// Self and inclusive time per function, from the samples.
function analyze(profile) {
  const byId = new Map();
  for (const node of profile.nodes) {
    byId.set(node.id, node);
  }
  const parent = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children || []) {
      parent.set(child, node.id);
    }
  }
  function key(node) {
    const cf = node.callFrame;
    const name = cf.functionName || '(anonymous)';
    if (!cf.url) {
      return name;
    }
    return `${name} ${path.basename(cf.url)}:${cf.lineNumber + 1}`;
  }
  const self = new Map();
  const inclusive = new Map();
  let total = 0;
  const {samples, timeDeltas} = profile;
  for (let i = 0; i < samples.length; i++) {
    // The delta before sample i+1 is the time spent in sample i.
    const dt = i + 1 < timeDeltas.length ? timeDeltas[i + 1] : 0;
    total += dt;
    let node = byId.get(samples[i]);
    const k = key(node);
    self.set(k, (self.get(k) || 0) + dt);
    const seen = new Set();
    while (node !== undefined) {
      const kk = key(node);
      if (!seen.has(kk)) {
        seen.add(kk);
        inclusive.set(kk, (inclusive.get(kk) || 0) + dt);
      }
      node = byId.get(parent.get(node.id));
    }
  }
  return {self, inclusive, total};
}

async function profileOne(port, variant, scenario, n) {
  const browser = await launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error(variant, e.message));
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`http://localhost:${port}/${bundleName(variant)}.html`);
  await page.waitForFunction(() => window.__bench !== undefined);
  if (throttle !== 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
  }
  await page.evaluate(([c, s]) => window.__bench.mount(c, s), [n, scenario]);
  await page.evaluate(
    ([s, w]) => window.__bench.run(s, 1, w),
    [scenario, warmup]
  );
  await page.evaluate(() => window.gc && window.gc());
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', {interval});
  await cdp.send('Profiler.start');
  const {durations, batch} = await page.evaluate(
    ([s, it]) => window.__bench.run(s, it, 0),
    [scenario, iterations]
  );
  const {profile} = await cdp.send('Profiler.stop');
  await browser.close();
  const updates = durations.length * batch;
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    profile,
    updates,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function report(label, result) {
  const {self, inclusive, total} = analyze(result.profile);
  const perUpdate = us => ((us / result.updates) * 1).toFixed(2);
  console.log(
    `\n=== ${label}: ${result.updates} updates, median ${result.median.toFixed(3)} ms/update (profiled), ${perUpdate(total)} µs sampled/update ===`
  );
  console.log('self µs/update   %   function');
  const rows = [...self].sort((a, b) => b[1] - a[1]).slice(0, top);
  for (const [k, v] of rows) {
    console.log(
      perUpdate(v).padStart(10),
      ((v / total) * 100).toFixed(1).padStart(6),
      ' ',
      k
    );
  }
  const interesting = [
    'flushSyncWork',
    'performWorkOnRoot',
    'renderRootSync',
    'workLoopSync',
    'performUnitOfWork',
    'beginWork',
    'completeWork',
    'completeUnitOfWork',
    'renderWithHooks',
    'finishRenderingHooks',
    'use',
    'useMemoCache',
    'pushSimpleEffect',
    'reconcileChildFibers',
    'createWorkInProgress',
    'bailoutOnAlreadyFinishedWork',
    'commitRoot',
    'commitRootImpl',
    'flushMutationEffects',
    'flushLayoutEffects',
    'commitMutationEffectsOnFiber',
    'recursivelyTraverseMutationEffects',
    'commitStoreRecords',
    'flushStoreCatchUps',
    'dispatchStoreUpdate',
    'enqueueConcurrentRenderForLane',
    'finishQueueingConcurrentUpdates',
    'markUpdateLaneFromFiberToRoot',
    'scheduleUpdateOnFiber',
    'propagateContextChange',
    'propagateParentContextChanges',
    'readContext',
    'checkIfSnapshotChanged',
    'forceStoreRerender',
    'setState',
    '(garbage collector)',
  ];
  const incl = new Map();
  for (const [k, v] of inclusive) {
    const name = k.split(' ')[0];
    incl.set(name, (incl.get(name) || 0) + v);
  }
  console.log('inclusive µs/update  function');
  for (const name of interesting) {
    if (incl.has(name)) {
      console.log(perUpdate(incl.get(name)).padStart(10), ' ', name);
    }
  }
}

async function main() {
  if (!flag('no-build')) {
    await buildBundles();
  }
  const server = await serve();
  const port = server.address().port;
  const saveDir = path.join(here, 'results/profiles');
  for (const n of nList) {
    for (const scenario of scenarios) {
      for (const variant of variants) {
        const result = await profileOne(port, variant, scenario, n);
        const label = `${variant}${compiled ? '+compiler' : ''} ${scenario} N=${n} x${throttle}`;
        report(label, result);
        if (flag('save')) {
          fs.mkdirSync(saveDir, {recursive: true});
          fs.writeFileSync(
            path.join(
              saveDir,
              `${path.basename(outDir)}-${variant}-${scenario}-${n}.cpuprofile`
            ),
            JSON.stringify(result.profile)
          );
        }
      }
    }
  }
  server.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
