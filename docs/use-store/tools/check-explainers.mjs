// G4: the interactive explainers agree with the real React build.
//
// Loads a page with the explainers from file:// in headless Chromium (every
// non-file request is blocked, and file access isn't widened), then runs the
// checks the page exposes on window.__explainers:
//
// - queue: the preview matches React on 200 seeded random sequences of
//   dispatches and steps (prints the first mismatch and its sequence);
// - tearing: the global tears, useSyncExternalStore de-opts to a sync
//   render, and use(store) stays consistent;
// - rerenders: each panel renders the expected components, and the frame
//   hook's flashes match the components' body counters;
// - subscriptions: reader and record counts match the model on random
//   sequences of conditional reads, mounts and updates.
//
//   node docs/use-store/tools/check-explainers.mjs [--page=<html>] [--no-build]
//     [--seeds=200] [--headed] [--browser-path=<chrome>]
//
// tools/check-docs.mjs imports it and calls check(ctx) (sandbox/API.md,
// section 6), which checks demo.html and every built page with explainers.

import fs from 'fs';
import os from 'os';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..');
const repo = path.resolve(docs, '../..');

const args = process.argv.slice(2);
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}
function flag(name) {
  return args.includes('--' + name);
}

// Runs every check for the explainers on an open page. Returns failures and
// notes as strings.
async function checkPage(tab, {seeds}) {
  const failures = [];
  const notes = [];
  function report(name, ok, details) {
    (ok ? notes : failures).push(name + (details ? ': ' + details : ''));
  }

  const ready = await tab.evaluate(async () => {
    try {
      await window.__explainers.ready();
      return {ok: true, kinds: window.__explainers.instances.map(i => i.kind)};
    } catch (error) {
      return {ok: false, error: String(error && error.stack ? error.stack : error)};
    }
  });
  report('explainers load', ready.ok, ready.ok ? ready.kinds.join(', ') : ready.error);
  if (!ready.ok) {
    return {failures, notes};
  }
  const kinds = new Set(ready.kinds);

  if (kinds.has('queue')) {
    const queue = await tab.evaluate(n => window.__explainers.checks.queue({seeds: n}), seeds);
    if (queue.ok) {
      report('queue preview matches React', true, queue.seeds + ' seeds, ' + queue.commands + ' commands');
    } else {
      report(
        'queue preview matches React',
        false,
        'seed ' + queue.seed + ', command ' + queue.index + '\n  sequence: ' + queue.sequence +
          '\n  ' + queue.problems.join('\n  '),
      );
    }
  }

  if (kinds.has('tearing')) {
    const tearing = await tab.evaluate(async () => {
      const results = await window.__explainers.checks.tearing();
      const out = {};
      for (const source of Object.keys(results)) {
        out[source] = results[source].problems;
      }
      out.observed = {};
      for (const source of ['store', 'store-click']) {
        if (results[source]) {
          out.observed[source] = results[source].observed;
        }
      }
      return out;
    });
    for (const source of Object.keys(tearing.observed)) {
      const facts = tearing.observed[source];
      notes.push(
        'tearing: observed ' + source + ': ' + facts.storeOrder +
          ', ' + facts.renderedOnChange + ' renders when the store changed',
      );
    }
    const labels = {
      global: 'tearing: the global tears',
      uses: 'tearing: useSyncExternalStore de-opts to sync',
      store: 'tearing: use(store) with a default-lane update: consistent, the transition commits first',
      'store-click': 'tearing: use(store) with a click (sync lane): consistent, the update interrupts',
    };
    for (const source of Object.keys(labels)) {
      const problems = tearing[source] || ['no ' + source + ' column'];
      report(labels[source], problems.length === 0, problems.join('; '));
    }
  }

  if (kinds.has('rerenders')) {
    const rerenders = await tab.evaluate(() => window.__explainers.checks.rerenders());
    report(
      'who re-renders: renders, and flashes match body counters',
      rerenders.problems.length === 0,
      rerenders.problems.join('\n  '),
    );
  }

  if (kinds.has('subscriptions')) {
    const subscriptions = await tab.evaluate(() =>
      window.__explainers.checks.subscriptions({seeds: 20}),
    );
    if (subscriptions.ok) {
      report('subscriptions: reader counts', true, subscriptions.seeds + ' seeds, ' + subscriptions.commands + ' commands');
    } else {
      report(
        'subscriptions: reader counts',
        false,
        'seed ' + subscriptions.seed + ', command ' + subscriptions.index + '\n  sequence: ' +
          subscriptions.sequence + '\n  ' + subscriptions.problems.join('\n  '),
      );
    }
  }
  return {failures, notes};
}

async function build() {
  const {buildDemos} = await import(
    pathToFileURL(path.join(docs, 'src/demos/build-demos.mjs')).href
  );
  await buildDemos({log: () => {}});
}

const demoPage = path.join(docs, 'sandbox/explainers/demo.html');

function pagesWithExplainers(pages) {
  return pages.filter(file => /data-explainer=/.test(fs.readFileSync(file, 'utf8')));
}

// The check-docs.mjs entry point (sandbox/API.md, section 6).
export async function check(ctx) {
  await build();
  const failures = [];
  const notes = [];
  const pages = [demoPage, ...pagesWithExplainers(ctx.pages || []).filter(p => p !== demoPage)];
  for (const file of pages) {
    ctx.log('G4: ' + path.relative(ctx.docs, file));
    const tab = await ctx.openPage(file, {block: true});
    const result = await checkPage(tab, {seeds: 200});
    const label = path.relative(ctx.docs, file) + ': ';
    failures.push(...result.failures.map(f => label + f));
    notes.push(...result.notes.map(n => label + n));
    const errors = tab.__errors || [];
    if (errors.length > 0) {
      failures.push(label + 'errors: ' + errors.slice(0, 5).map(String).join('; '));
    }
    await tab.close();
  }
  return {failures, notes};
}

// Standalone: node docs/use-store/tools/check-explainers.mjs
async function main() {
  const page = path.resolve(option('page', demoPage));
  const seeds = Number(option('seeds', 200));
  const headlessShell = path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  );
  const browserPath = option(
    'browser-path',
    process.env.BENCH_BROWSER || (fs.existsSync(headlessShell) ? headlessShell : null),
  );
  if (!flag('no-build')) {
    await build();
  }
  const {chromium} = require(path.join(repo, 'node_modules/playwright'));
  const browser = await chromium.launch({
    executablePath: browserPath || undefined,
    headless: !flag('headed'),
    args: ['--single-process', '--no-zygote', '--disable-gpu'],
  });
  let failures = [];
  try {
    const context = await browser.newContext();
    const blocked = [];
    await context.route(
      url => !url.href.startsWith('file:'),
      route => {
        blocked.push(route.request().url());
        return route.abort();
      },
    );
    const tab = await context.newPage();
    const errors = [];
    const failedRequests = [];
    tab.on('pageerror', error => errors.push('page: ' + error.message));
    tab.on('console', message => {
      if (message.type() === 'error') {
        errors.push('console: ' + message.text());
      }
    });
    tab.on('requestfailed', request => failedRequests.push(request.url()));
    await tab.goto(pathToFileURL(page).href);
    const result = await checkPage(tab, {seeds});
    failures = result.failures.slice();
    for (const note of result.notes) {
      console.log('PASS ' + note);
    }
    if (errors.length > 0) {
      failures.push('page errors: ' + errors.slice(0, 5).join('\n  '));
    }
    if (blocked.length > 0 || failedRequests.length > 0) {
      failures.push('requests: ' + blocked.concat(failedRequests).slice(0, 5).join(', '));
    }
  } finally {
    await browser.close();
  }
  for (const failure of failures) {
    console.log('FAIL ' + failure);
  }
  console.log(failures.length > 0 ? 'G4 failed' : 'G4 passed');
  return failures.length === 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    ok => process.exit(ok ? 0 : 1),
    error => {
      console.error(error);
      process.exit(1);
    },
  );
}
