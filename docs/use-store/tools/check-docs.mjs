// The verification gates for the use(store) reports (see the plan, "Verification
// gates"). Browser gates use Playwright with chrome-headless-shell, loading the
// pages from file:// with every non-file request blocked. Never pass
// --allow-file-access-from-files: the pages must work without it.
//
//   node docs/use-store/tools/check-docs.mjs
//   node docs/use-store/tools/check-docs.mjs --gates=G1,G3 --pages=demo
//
// Options:
//   --gates=G1,G2,...   default: G1 G2 G3 G6 G7 G8, plus G4 and G5 when their
//                       checkers exist
//   --pages=a,b         explainer, benchmark-report, demo, or a path to an .html
//   --allow-missing     a page that isn't built yet is a note, not a failure
//   --only=<sandbox id> G3: run one sandbox
//   --verbose           print each step
//
// Gates:
//   G1 vendor   bundles exist, contain unstable_createStore, match
//               VERSIONS.json and the frozen build, fit the size budget; each
//               page is <= 350 KB without vendor/.
//   G2 offline  each page loads from file:// with non-file requests blocked:
//               zero failed requests, zero page errors, every sandbox starts.
//   G3 sandbox  each sandbox runs its steps file (API.md section 5) with no
//               unexpected warnings; edit + Run works; Reset restores it.
//   G4 explainers   tools/check-explainers.mjs (interactives-eng)
//   G5 numbers      tools/check-numbers.mjs (data-eng)
//   G6 links    every anchor and relative link resolves; the old
//               shared-derived-data page redirects into the benchmark report.
//   G7 style    the prose (visible text, not code, sandboxes, explainer UI,
//               gen blocks, data-n values or SVG): the everwrite checker (tells.py) is clean
//               except for entries in tools/style-allow.json, which each
//               need a reason; no em dashes or semicolons; h1-h4 in sentence
//               case (proper nouns from style-allow.json, and code, allowed).
//   G8 a11y     with prefers-reduced-motion emulated, after running every
//               sandbox and building every explainer: every control and
//               iframe has an accessible name; color-coded statuses and
//               flashes carry a text cue; nothing animates or transitions;
//               img has alt, svg has role="img" + aria-label or a <title>;
//               heading levels don't skip.

import {createRequire} from 'module';
import {fileURLToPath, pathToFileURL} from 'url';
import {spawnSync} from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..');
const repo = path.resolve(docs, '../..');

const args = process.argv.slice(2);
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}
const verbose = args.includes('--verbose');
const allowMissing = args.includes('--allow-missing');
const onlySandbox = option('only', null);

const PAGES = {
  explainer: path.join(docs, 'explainer.html'),
  'benchmark-report': path.join(docs, 'benchmark-report.html'),
  'store-vs-context': path.join(docs, 'store-vs-context.html'),
  demo: path.join(docs, 'sandbox/demo.html'),
};
const REDIRECT = {
  file: path.join(docs, 'shared-derived-data.html'),
  target: 'benchmark-report.html',
};
const PAGE_BUDGET = 350 * 1024;
const BUDGET = {
  'react-dev.js': 1.2 * 1024 * 1024,
  'react-step.js': 1.2 * 1024 * 1024,
  'sucrase.js': 300 * 1024,
};
const HEADLESS_SHELL = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',
);

function rel(file) {
  return path.relative(repo, file).split(path.sep).join('/');
}
function log(...parts) {
  console.log(...parts);
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- pages

function selectPages() {
  const names = option('pages', Object.keys(PAGES).join(',')).split(',');
  const pages = [];
  const notes = [];
  const failures = [];
  for (const name of names) {
    const file = PAGES[name] || path.resolve(name);
    if (fs.existsSync(file)) {
      pages.push(file);
    } else if (allowMissing) {
      notes.push(`${rel(file)} isn't built yet`);
    } else {
      failures.push(`${rel(file)} doesn't exist (pass --allow-missing while it's being written)`);
    }
  }
  return {pages, notes, failures};
}

let JSDOM = null;
function jsdom() {
  if (JSDOM === null) {
    JSDOM = require(require.resolve('jsdom', {paths: [repo]})).JSDOM;
  }
  return JSDOM;
}
function parse(file) {
  return new (jsdom())(fs.readFileSync(file, 'utf8')).window.document;
}

// ---------------------------------------------------------------- browser

let browser = null;
async function getBrowser() {
  if (browser === null) {
    const {chromium} = require(require.resolve('playwright', {paths: [repo]}));
    browser = await chromium.launch({
      executablePath: fs.existsSync(HEADLESS_SHELL) ? HEADLESS_SHELL : undefined,
      // As in fixtures/store-bench/run.mjs launch(): renderer processes
      // aren't allowed in some sandboxed environments.
      args: ['--single-process', '--no-zygote', '--disable-gpu'],
    });
  }
  return browser;
}

const LOCAL = /^(file|data|blob|about):/;

// One context for the whole run: with --single-process, closing a context
// takes the browser down with it.
let sharedContext = null;
let currentPage = null;
async function getContext() {
  if (sharedContext === null) {
    const b = await getBrowser();
    sharedContext = await b.newContext({reducedMotion: 'reduce'});
    await sharedContext.route('**/*', route => {
      const url = route.request().url();
      if (LOCAL.test(url) || currentPage === null || !currentPage.__block) {
        route.continue();
      } else {
        currentPage.__blocked.push(url);
        route.abort();
      }
    });
  }
  return sharedContext;
}

// A page on file://, with every other request blocked and recorded.
async function openPage(file, {block = true} = {}) {
  const context = await getContext();
  const page = await context.newPage();
  currentPage = page;
  page.__block = block;
  page.__errors = [];
  page.__failed = [];
  page.__blocked = [];
  page.__consoleErrors = [];
  page.on('pageerror', error => {
    page.__errors.push(error.message);
  });
  page.on('requestfailed', request => {
    page.__failed.push(`${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Only the page's own errors. Code in sandbox frames (vendor/, the frame
    // scripts, the sandbox's own module) reports to the host, and G3 checks
    // it against each steps file.
    const url = message.location().url || '';
    if (/about:srcdoc|\/vendor\/|\/sandbox\/frame[\w-]*\.js|sandbox-[^/]*\.js$/.test(url)) return;
    page.__consoleErrors.push(message.text());
  });
  const close = page.close.bind(page);
  page.close = async () => {
    if (currentPage === page) currentPage = null;
    await close();
  };
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load'});
  return page;
}

// ---------------------------------------------------------------- G1

async function gateG1(pages) {
  const failures = [];
  const notes = [];
  const vendor = path.join(docs, 'vendor');
  const versionsFile = path.join(vendor, 'VERSIONS.json');
  if (!fs.existsSync(versionsFile)) {
    return {failures: ['no vendor/VERSIONS.json: run node docs/use-store/tools/build-vendor.mjs'], notes};
  }
  const versions = JSON.parse(fs.readFileSync(versionsFile, 'utf8'));
  for (const name of ['react-dev.js', 'react-step.js', 'react-server-dev.js', 'sucrase.js']) {
    const file = path.join(vendor, name);
    const expected = versions.bundles[name];
    if (!fs.existsSync(file)) {
      failures.push(`vendor/${name} is missing`);
      continue;
    }
    if (!expected) {
      failures.push(`vendor/${name} isn't in VERSIONS.json`);
      continue;
    }
    const buffer = fs.readFileSync(file);
    if (buffer.length !== expected.bytes || sha256(buffer) !== expected.sha256) {
      failures.push(`vendor/${name} doesn't match VERSIONS.json (rebuild with build-vendor.mjs)`);
    }
    if (BUDGET[name] !== undefined && buffer.length > BUDGET[name]) {
      failures.push(`vendor/${name} is ${(buffer.length / 1024).toFixed(0)} KB, over ${BUDGET[name] / 1024} KB`);
    }
    notes.push(`vendor/${name} ${(buffer.length / 1024).toFixed(0)} KB`);
    const text = buffer.toString('utf8');
    if (name === 'react-dev.js' || name === 'react-step.js') {
      if (!text.includes('unstable_createStore')) {
        failures.push(`vendor/${name} doesn't contain unstable_createStore`);
      }
      if (!text.includes(versions.react.version)) {
        failures.push(`vendor/${name} isn't React ${versions.react.version}`);
      }
      const mock = text.includes('unstable_flushNumberOfYields');
      if (mock !== (name === 'react-step.js')) {
        failures.push(`vendor/${name} ${mock ? 'has' : "doesn't have"} the mock scheduler`);
      }
    }
  }
  // The bundles must come from the frozen build, and it must still be frozen.
  const buildDir = path.join(repo, versions.react.dir);
  const buildFile = path.join(buildDir, 'BUILD.json');
  if (!fs.existsSync(buildFile)) {
    failures.push(`${rel(buildFile)} is missing`);
  } else {
    const build = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
    for (const key of ['sha', 'version', 'dirtyAffectsBuild']) {
      if (build[key] !== versions.react[key]) {
        failures.push(`VERSIONS.json react.${key} is ${versions.react[key]}, the build says ${build[key]}`);
      }
    }
    if (JSON.stringify(build.dirty) !== JSON.stringify(versions.react.dirty)) {
      failures.push('VERSIONS.json react.dirty differs from BUILD.json');
    }
    for (const [file, hash] of Object.entries(build.hashes || {})) {
      const actual = path.join(buildDir, file);
      if (!fs.existsSync(actual) || sha256(fs.readFileSync(actual)) !== hash) {
        failures.push(`${rel(actual)} no longer matches BUILD.json: the frozen build changed`);
      }
    }
    notes.push(`React ${build.version} (${build.sha.slice(0, 10)}), dirtyAffectsBuild: ${build.dirtyAffectsBuild}`);
  }
  // Each page and the local files it loads, without vendor/.
  for (const file of pages) {
    const doc = parse(file);
    const assets = new Set();
    doc.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach(el => {
      const ref = el.getAttribute('src') || el.getAttribute('href');
      if (/^[a-z]+:/i.test(ref)) return;
      const asset = path.resolve(path.dirname(file), ref.split(/[?#]/)[0]);
      if (!asset.startsWith(vendor + path.sep) && fs.existsSync(asset)) assets.add(asset);
    });
    let bytes = fs.statSync(file).size;
    for (const asset of assets) bytes += fs.statSync(asset).size;
    const kb = (bytes / 1024).toFixed(0);
    if (bytes > PAGE_BUDGET) {
      failures.push(`${rel(file)} is ${kb} KB with its assets, over ${PAGE_BUDGET / 1024} KB`);
    } else {
      notes.push(`${rel(file)} ${kb} KB with ${assets.size} local assets`);
    }
  }
  return {failures, notes};
}

// ---------------------------------------------------------------- steps

function readSteps(file, doc, el) {
  const inline = el.querySelector('script.steps[type="application/json"]');
  if (inline) {
    return {steps: JSON.parse(inline.textContent), from: 'inline'};
  }
  const ref = el.getAttribute('data-steps');
  if (ref) {
    const stepsFile = path.resolve(path.dirname(file), ref);
    if (!fs.existsSync(stepsFile)) {
      throw new Error(`data-steps points at ${rel(stepsFile)}, which doesn't exist`);
    }
    return {steps: JSON.parse(fs.readFileSync(stepsFile, 'utf8')), from: rel(stepsFile)};
  }
  return null;
}

function sandboxesOf(file) {
  const doc = parse(file);
  return Array.from(doc.querySelectorAll('div.sandbox')).map(el => {
    let steps = null;
    let error = null;
    try {
      steps = readSteps(file, doc, el);
    } catch (e) {
      error = e.message;
    }
    return {id: el.id, steps, error};
  });
}

// ---------------------------------------------------------------- G2

async function gateG2(pages) {
  const failures = [];
  const notes = [];
  for (const file of pages) {
    const name = rel(file);
    const expectsErrors = new Set(
      sandboxesOf(file)
        .filter(s => s.steps && s.steps.steps.expectErrors)
        .map(s => s.id),
    );
    let page;
    try {
      page = await openPage(file);
      const hasHost = await page.evaluate(() => !!window.__sandboxHost);
      if (hasHost) {
        const results = await Promise.race([
          page.evaluate(() => window.__sandboxHost.runAll()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('sandboxes did not start within 60 s')), 60000)),
        ]);
        for (const r of results) {
          if (!r.ok && !expectsErrors.has(r.id)) {
            failures.push(`${name}#${r.id} didn't run: ${r.errors.map(e => e.message).join('; ')}`);
          }
        }
        notes.push(`${name}: ${results.length} sandboxes started`);
        // Let late requests (lazy scripts, images) settle.
        await page.waitForTimeout(500);
      }
      for (const url of page.__blocked) failures.push(`${name} requested ${url} (blocked: pages must work offline)`);
      for (const f of page.__failed) {
        if (!page.__blocked.some(url => f.startsWith(url))) failures.push(`${name}: failed request ${f}`);
      }
      for (const e of page.__errors) failures.push(`${name}: page error: ${e}`);
      for (const e of page.__consoleErrors) failures.push(`${name}: console error: ${e}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    } finally {
      if (page) await page.close();
    }
  }
  return {failures, notes};
}

// ---------------------------------------------------------------- G3

function cssId(id) {
  return '#' + id.replace(/([^\w-])/g, '\\$1');
}

function matches(actual, spec, what) {
  const text = typeof actual === 'string' ? actual.trim() : actual;
  if ('equals' in spec) {
    const expected = typeof spec.equals === 'string' ? spec.equals.trim() : spec.equals;
    return JSON.stringify(text) === JSON.stringify(expected)
      ? null
      : `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(text)}`;
  }
  if ('contains' in spec) {
    return String(text).includes(spec.contains)
      ? null
      : `${what}: expected to contain ${JSON.stringify(spec.contains)}, got ${JSON.stringify(text)}`;
  }
  if ('matches' in spec) {
    return new RegExp(spec.matches).test(String(text))
      ? null
      : `${what}: expected to match /${spec.matches}/, got ${JSON.stringify(text)}`;
  }
  return `${what}: needs equals, contains or matches`;
}

function entryMatches(entry, spec) {
  if (spec.kind && entry.kind !== spec.kind) return false;
  if ('contains' in spec) return entry.text.includes(spec.contains);
  if ('matches' in spec) return new RegExp(spec.matches).test(entry.text);
  return true;
}

function getPath(object, dotted) {
  return dotted.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

async function poll(fn, timeout) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await fn();
    if (last === null || Date.now() > end) return last;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

class SandboxRunner {
  constructor(page, id, spec) {
    this.page = page;
    this.id = id;
    this.spec = spec;
    this.timeout = spec.timeout || 2000;
    this.consoleMark = 0;
    this.errorMark = 0;
    this.consumedErrors = 0;
    this.rendersBase = {};
  }
  frame() {
    return this.page.frameLocator(`${cssId(this.id)} iframe.sb-frame`);
  }
  host(fn, ...rest) {
    return this.page.evaluate(
      ([id, source, extra]) => {
        const api = window.__sandboxHost.get(id);
        // eslint-disable-next-line no-new-func
        return new Function('api', 'extra', `return (${source})(api, extra)`)(api, extra);
      },
      [this.id, fn.toString(), rest[0]],
    );
  }
  state() {
    return this.host(api => api.state());
  }
  async ran() {
    return this.host(api => api.ran());
  }
  ui(text) {
    return this.page.locator(`${cssId(this.id)} .sb-toolbar button`, {hasText: text});
  }

  async step(step) {
    const t = step.timeout || this.timeout;
    const frame = this.frame();
    if ('click' in step) {
      await frame.locator(step.click).first().click({timeout: t});
      return null;
    }
    if ('fill' in step) {
      await frame.locator(step.fill).first().fill(String(step.value), {timeout: t});
      return null;
    }
    if ('press' in step) {
      await frame.locator(step.press).first().press(step.key, {timeout: t});
      return null;
    }
    if ('stepper' in step) {
      const reply = await this.host((api, extra) => api.step(extra.cmd, extra.count), {
        cmd: step.stepper,
        count: step.count,
      });
      return reply.error ? `stepper: ${reply.error}` : null;
    }
    if ('wait' in step) {
      await this.page.waitForTimeout(step.wait);
      return null;
    }
    if ('waitFor' in step) {
      await frame.locator(step.waitFor).first().waitFor({timeout: t});
      return null;
    }
    if ('expectText' in step) {
      return poll(async () => {
        const locator = frame.locator(step.expectText).first();
        const text = (await locator.count()) > 0 ? await locator.textContent() : null;
        if (text === null) return `no element matches ${step.expectText}`;
        return matches(text, step, `text of ${step.expectText}`);
      }, t);
    }
    if ('expectCount' in step) {
      return poll(async () => {
        const n = await frame.locator(step.expectCount).count();
        return matches(n, step, `count of ${step.expectCount}`);
      }, t);
    }
    if ('expectConsole' in step || 'expectNoConsole' in step) {
      const spec = step.expectConsole || step.expectNoConsole;
      const want = 'expectConsole' in step;
      return poll(async () => {
        const entries = (await this.state()).console.slice(this.consoleMark);
        const found = entries.some(e => entryMatches(e, spec));
        if (found === want) return null;
        return `${want ? 'no' : 'an'} console entry matches ${JSON.stringify(spec)}. Console: ${JSON.stringify(entries.map(e => e.kind + ': ' + e.text))}`;
      }, want ? t : 0);
    }
    if ('clearConsole' in step) {
      this.consoleMark = (await this.state()).console.length;
      return null;
    }
    if ('resetRenders' in step) {
      await this.host(api => api.resetRenders());
      await poll(async () => (Object.keys((await this.state()).counts).length === 0 ? null : 'counts not reset'), t);
      return null;
    }
    if ('expectRenders' in step) {
      return poll(async () => {
        const counts = (await this.state()).counts;
        for (const [name, n] of Object.entries(step.expectRenders)) {
          if ((counts[name] || 0) !== n) {
            return `renders: expected ${name} ×${n}, got ${JSON.stringify(counts)}`;
          }
        }
        return null;
      }, t);
    }
    if ('expectStore' in step) {
      return poll(async () => {
        const reply = await this.host(api => api.inspect());
        const store = reply.stores.find(s => s.label === step.expectStore);
        if (!store) return `no watched store labeled ${step.expectStore}`;
        if (!store.ok) return `store ${step.expectStore}: ${store.reason}`;
        return matches(getPath(store.snapshot, step.path), step, `store ${step.expectStore} ${step.path}`);
      }, t);
    }
    if ('expectStepper' in step) {
      // The frame reports pending work it didn't start (a click) on a timer.
      return poll(async () => {
        const stepper = (await this.state()).stepper;
        const want = step.expectStepper;
        if ('pending' in want && stepper.pending !== want.pending) {
          return `stepper: expected pending ${want.pending}, got ${stepper.pending}`;
        }
        if ('log' in want && JSON.stringify(stepper.log) !== JSON.stringify(want.log)) {
          return `stepper log: expected ${JSON.stringify(want.log)}, got ${JSON.stringify(stepper.log)}`;
        }
        return null;
      }, t);
    }
    if ('expectError' in step) {
      return poll(async () => {
        const errors = (await this.state()).errors;
        const fresh = errors.slice(this.errorMark);
        const hit = fresh.find(e => entryMatches({text: e.message}, step.expectError));
        if (!hit) return `no error matches ${JSON.stringify(step.expectError)}. Errors: ${JSON.stringify(errors.map(e => e.message))}`;
        this.errorMark = errors.length;
        this.consumedErrors = errors.length;
        return null;
      }, t);
    }
    if ('expectNoError' in step) {
      const state = await this.state();
      const fresh = state.errors.slice(this.errorMark);
      return fresh.length === 0 && !state.overlay ? null : `unexpected error: ${fresh.map(e => e.message).join('; ')}`;
    }
    return `unknown step ${JSON.stringify(step)}`;
  }

  async runSteps(steps, label) {
    const failures = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (verbose) log(`      ${label} ${i + 1}: ${JSON.stringify(step)}`);
      let failure;
      try {
        failure = await this.step(step);
      } catch (error) {
        failure = error.message.split('\n')[0];
      }
      if (failure) {
        failures.push(`${label} step ${i + 1} ${JSON.stringify(step)}: ${failure}`);
        break;
      }
    }
    return failures;
  }

  // Warnings and errors the steps file didn't allow.
  async unexpected(label) {
    const state = await this.state();
    const allow = this.spec.allowConsole || [];
    const failures = [];
    for (const entry of state.console) {
      if (entry.kind !== 'warn' && entry.kind !== 'error') continue;
      if (entry.source === 'host') continue; // errors, checked below
      if (!allow.some(a => entryMatches(entry, a))) {
        failures.push(`${label}: unexpected ${entry.kind}: ${entry.text.split('\n')[0]}`);
      }
    }
    if (!this.spec.expectErrors && state.errors.length > this.consumedErrors) {
      for (const e of state.errors.slice(this.consumedErrors)) {
        failures.push(`${label}: unexpected ${e.phase} error: ${e.message.split('\n')[0]}`);
      }
    }
    return failures;
  }

  resetMarks() {
    this.consoleMark = 0;
    this.errorMark = 0;
    this.consumedErrors = 0;
  }

  async run() {
    const failures = [];
    await this.ran();
    const steps = this.spec.steps || [];
    failures.push(...(await this.runSteps(steps, 'run')));
    failures.push(...(await this.unexpected('run')));
    if (failures.length > 0) return failures;

    // Edit, then Run, through the UI.
    const original = await this.host(api => api.originalCode());
    const edit = this.spec.edit || {};
    let edited;
    if (edit.replace) {
      if (!original.includes(edit.replace.find)) {
        return [`edit: the code doesn't contain ${JSON.stringify(edit.replace.find)}`];
      }
      edited = original.replace(edit.replace.find, edit.replace.with);
    } else {
      edited = original + '\n// edited by check-docs\n';
    }
    const editButton = this.ui('Edit');
    if ((await editButton.count()) > 0) {
      await editButton.click();
      await this.page.locator(`${cssId(this.id)} textarea.sb-editor`).fill(edited);
      await this.ui('Run').click();
      this.resetMarks();
      await this.ran();
      const code = await this.host(api => api.getCode());
      if (code !== edited) failures.push('edit: the editor lost the edit after Run');
      failures.push(...(await this.runSteps(edit.steps || [], 'edit')));
      failures.push(...(await this.unexpected('edit')));
      if (failures.length > 0) return failures;
    } else if (this.spec.edit) {
      return ['edit: the steps file has an edit, but the sandbox is read-only'];
    }

    // Reset restores the original and it works again.
    await this.ui('Reset').click();
    this.resetMarks();
    await this.ran();
    const code = await this.host(api => api.getCode());
    if (code !== original) failures.push("reset: the editor doesn't hold the original code");
    // Run the steps again up to the first check, so it sees the same state.
    const firstExpect = steps.findIndex(s => Object.keys(s).some(k => k.startsWith('expect')));
    if (firstExpect !== -1) {
      failures.push(...(await this.runSteps(steps.slice(0, firstExpect + 1), 'reset')));
    }
    failures.push(...(await this.unexpected('reset')));
    return failures;
  }
}

async function gateG3(pages) {
  const failures = [];
  const notes = [];
  for (const file of pages) {
    const name = rel(file);
    const sandboxes = sandboxesOf(file).filter(s => !onlySandbox || s.id === onlySandbox);
    if (sandboxes.length === 0) {
      notes.push(`${name}: no sandboxes`);
      continue;
    }
    let page;
    try {
      page = await openPage(file);
      for (const sandbox of sandboxes) {
        const label = `${name}#${sandbox.id}`;
        if (sandbox.error) {
          failures.push(`${label}: ${sandbox.error}`);
          continue;
        }
        if (!sandbox.steps) {
          failures.push(`${label}: no steps file (add <name>.steps.json next to its source)`);
          continue;
        }
        if (verbose) log(`    ${label} (${sandbox.steps.from})`);
        const runner = new SandboxRunner(page, sandbox.id, sandbox.steps.steps);
        let result;
        try {
          result = await runner.run();
        } catch (error) {
          result = [error.message.split('\n')[0]];
        }
        for (const f of result) failures.push(`${label}: ${f}`);
        if (result.length === 0) notes.push(`${label} ok`);
      }
      for (const e of page.__errors) failures.push(`${name}: page error: ${e}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    } finally {
      if (page) await page.close();
    }
  }
  return {failures, notes};
}

// ---------------------------------------------------------------- G6

function linkTargets(doc) {
  const out = [];
  doc.querySelectorAll('[href], [src], [data-steps], [data-scripts], [data-styles]').forEach(el => {
    for (const a of ['href', 'src', 'data-steps']) {
      const v = el.getAttribute(a);
      if (v !== null) out.push({attr: a, value: v, tag: el.tagName.toLowerCase()});
    }
    for (const a of ['data-scripts', 'data-styles']) {
      const v = el.getAttribute(a);
      if (v) v.split(/\s+/).filter(Boolean).forEach(value => out.push({attr: a, value, tag: el.tagName.toLowerCase()}));
    }
  });
  return out;
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const doc = parse(file);
    const ids = new Set();
    doc.querySelectorAll('[id]').forEach(el => ids.add(el.id));
    doc.querySelectorAll('a[name]').forEach(el => ids.add(el.getAttribute('name')));
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

function checkLink(file, value, failures, label) {
  if (/^(https?|mailto):/i.test(value)) return 'external';
  if (/^(javascript|data|blob):/i.test(value)) {
    failures.push(`${label}: ${value.slice(0, 40)} isn't allowed`);
    return 'bad';
  }
  if (/^[a-z]+:/i.test(value)) {
    failures.push(`${label}: ${value} is an absolute URL`);
    return 'bad';
  }
  const [pathPart, hash] = value.split('#');
  const target = pathPart === '' ? file : path.resolve(path.dirname(file), decodeURIComponent(pathPart.split('?')[0]));
  if (!fs.existsSync(target)) {
    failures.push(`${label}: ${value} doesn't exist`);
    return 'bad';
  }
  if (hash && /\.html?$/.test(target) && !idsOf(target).has(decodeURIComponent(hash))) {
    failures.push(`${label}: no #${hash} in ${rel(target)}`);
    return 'bad';
  }
  return 'ok';
}

async function gateG6(pages) {
  const failures = [];
  const notes = [];
  for (const file of pages) {
    const doc = parse(file);
    // Anchors need unique ids.
    const seen = new Map();
    doc.querySelectorAll('[id]').forEach(el => {
      seen.set(el.id, (seen.get(el.id) || 0) + 1);
    });
    for (const [id, n] of seen) {
      if (n > 1) failures.push(`${rel(file)}: ${n} elements have id="${id}"`);
    }
    let ok = 0;
    const external = new Set();
    for (const link of linkTargets(doc)) {
      const label = `${rel(file)} <${link.tag} ${link.attr}>`;
      const result = checkLink(file, link.value, failures, label);
      if (result === 'ok') ok++;
      if (result === 'external') external.add(link.value);
    }
    notes.push(`${rel(file)}: ${ok} local links ok, ${external.size} external links (not fetched)`);
  }

  // The old page redirects into the new section of the benchmark report.
  const redirect = REDIRECT.file;
  const target = path.join(docs, REDIRECT.target);
  // The redirect lands in the benchmark report, so it's checked with that
  // page. Gating only the explainer doesn't depend on it.
  if (!pages.includes(target)) {
    notes.push(`${rel(redirect)}: checked when ${REDIRECT.target} is one of the pages`);
    return {failures, notes};
  }
  if (!fs.existsSync(target) && allowMissing) {
    notes.push(`${rel(redirect)}: not checked, ${REDIRECT.target} isn't built yet`);
    return {failures, notes};
  }
  const before = failures.length;
  const doc = parse(redirect);
  const refresh = doc.querySelector('meta[http-equiv="refresh" i]');
  const url = refresh && (refresh.getAttribute('content') || '').match(/url=(.+)$/i);
  if (!url) {
    failures.push(`${rel(redirect)} has no <meta http-equiv="refresh" content="0; url=${REDIRECT.target}#…">`);
  } else {
    const href = url[1].trim().replace(/^['"]|['"]$/g, '');
    if (!href.startsWith(REDIRECT.target + '#')) {
      failures.push(`${rel(redirect)} redirects to ${href}, not a section of ${REDIRECT.target}`);
    }
    checkLink(redirect, href, failures, `${rel(redirect)} refresh`);
    if (!doc.querySelector(`a[href="${href}"]`)) {
      failures.push(`${rel(redirect)} needs a visible link to ${href} too`);
    }
    if (failures.length === before) {
      let page;
      try {
        page = await openPage(redirect);
        await page.waitForURL(u => String(u).includes(REDIRECT.target), {timeout: 5000});
        notes.push(`${rel(redirect)} redirects to ${href}`);
      } catch (error) {
        failures.push(`${rel(redirect)} didn't redirect in the browser: ${error.message.split('\n')[0]}`);
      } finally {
        if (page) await page.close();
      }
    }
  }
  return {failures, notes};
}

// ---------------------------------------------------------------- G7

const TELLS =
  process.env.EVERWRITE_TELLS ||
  path.join(
    os.homedir(),
    '.claude/plugins/cache/anthropic-plugin-directory/everwrite/1.0.0-8b9f0f4c058f/skills/everwrite/scripts/tells.py',
  );
const STYLE_ALLOW = path.join(here, 'style-allow.json');

// Not prose: code, generated blocks, sandboxes, explainer UI, SVG.
const NOT_PROSE =
  'script, style, pre, svg, template, noscript, iframe, .sandbox, .explainer, ' +
  '[data-explainer], [aria-hidden="true"], [hidden]';
const BLOCK_TAGS = new Set(
  ('p li h1 h2 h3 h4 h5 h6 blockquote dt dd figcaption caption td th summary ' +
    'div section article main header footer aside nav ul ol dl table thead ' +
    'tbody tfoot tr figure details body form fieldset legend').split(' '),
);

function stripGenerated(html) {
  return html
    .replace(/<!--\s*gen:(\S+?)(?:\s+\{[\s\S]*?\})?\s*-->[\s\S]*?<!--\s*\/gen:\1\s*-->/g, '')
    .replace(/<!--\s*gen:\S+?(?:\s+\{[\s\S]*?\})?\s*\/-->/g, '');
}

// The page's prose as blocks: {kind: 'h' | 'p', level, md, plain}. md keeps
// inline code in backticks (tells.py skips it); plain drops it.
function extractProse(file) {
  const doc = new (jsdom())(stripGenerated(fs.readFileSync(file, 'utf8'))).window.document;
  doc.querySelectorAll(NOT_PROSE).forEach(el => el.remove());
  const blocks = [];
  const squash = text => text.replace(/\s+/g, ' ').trim();
  function inlineText(nodes) {
    let md = '';
    let plain = '';
    for (const node of nodes) {
      if (node.nodeType === 3) {
        md += node.textContent;
        plain += node.textContent;
      } else if (node.nodeType === 1) {
        if (node.hasAttribute('data-n')) {
          // A generated value (bench-data display), like a gen block: not
          // prose, so it's a token for tells.py and the dash checks.
          md += '`n`';
          plain += ' NUM ';
        } else if (node.tagName === 'CODE' || node.tagName === 'KBD') {
          md += '`' + node.textContent.replace(/`/g, "'") + '`';
          plain += ' CODE ';
        } else if (node.tagName === 'BR') {
          md += ' ';
          plain += ' ';
        } else {
          const inner = inlineText(node.childNodes);
          md += inner.md;
          plain += inner.plain;
        }
      }
    }
    return {md, plain};
  }
  function emit(el, nodes) {
    const {md, plain} = inlineText(nodes);
    if (!squash(plain)) return;
    const h = /^H([1-6])$/.exec(el.tagName);
    blocks.push({
      kind: h ? 'h' : 'p',
      level: h ? Number(h[1]) : 0,
      md: squash(md),
      plain: squash(plain),
    });
  }
  function walk(el) {
    const children = Array.from(el.childNodes);
    const hasBlock = children.some(c => c.nodeType === 1 && BLOCK_TAGS.has(c.tagName.toLowerCase()));
    if (!hasBlock) {
      emit(el, children);
      return;
    }
    let run = [];
    for (const child of children) {
      if (child.nodeType === 1 && BLOCK_TAGS.has(child.tagName.toLowerCase())) {
        if (run.length) emit(el, run);
        run = [];
        walk(child);
      } else {
        run.push(child);
      }
    }
    if (run.length) emit(el, run);
  }
  walk(doc.body);
  return blocks;
}

function loadStyleAllow() {
  if (!fs.existsSync(STYLE_ALLOW)) return {headingTerms: [], tells: []};
  const allow = JSON.parse(fs.readFileSync(STYLE_ALLOW, 'utf8'));
  return {headingTerms: allow.headingTerms || [], tells: allow.tells || []};
}

function sentenceAt(text, needle) {
  const at = text.toLowerCase().indexOf(String(needle).toLowerCase());
  if (at === -1) return text.length > 160 ? text.slice(0, 157) + '…' : text;
  const before = text.slice(0, at);
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '));
  const rest = text.slice(at + String(needle).length);
  const endMatch = rest.search(/[.!?](\s|$)/);
  const end = endMatch === -1 ? text.length : at + String(needle).length + endMatch + 1;
  return text.slice(start === -1 ? 0 : start + 2, end).trim();
}

// Sentence case: after the first word, a capitalized word must be a known
// proper noun or code. Acronyms (API, DOM) and identifiers with inner
// capitals (useState, ReactDOM) are fine, and so is a capital after a colon.
function headingProblems(text, terms) {
  const phrases = terms.filter(t => /\s/.test(t)).sort((a, b) => b.length - a.length);
  let rest = text;
  for (const phrase of phrases) rest = rest.split(phrase).join(' TERM ');
  const words = new Set(terms.filter(t => !/\s/.test(t)));
  const tokens = rest.split(/\s+/).filter(Boolean);
  const bad = [];
  tokens.forEach((token, i) => {
    if (i === 0) return;
    if (/:$/.test(tokens[i - 1])) return;
    for (const part of token.split(/[-/]/)) {
      const word = part.replace(/^[^\w]+|[^\w]+$/g, '').replace(/['’]s$/, '');
      if (!word || word === 'CODE' || word === 'TERM' || word === 'I') continue;
      if (words.has(word)) continue;
      if (/^[A-Z0-9]{2,}s?$/.test(word)) continue; // acronym
      if (/^[A-Z]+-?\d/.test(word)) continue; // DCP-16
      if (/[A-Z]/.test(word.slice(1))) continue; // useState, ReactDOM
      if (/^[A-Z]/.test(word)) bad.push(word);
    }
  });
  return bad;
}

function runTells(markdown) {
  if (!fs.existsSync(TELLS)) {
    throw new Error(`the everwrite checker isn't at ${TELLS} (set EVERWRITE_TELLS)`);
  }
  const run = spawnSync('python3', [TELLS, '--json', '-'], {input: markdown, encoding: 'utf8'});
  if (run.status === 2 || !run.stdout) {
    throw new Error(`tells.py failed: ${run.stderr || 'no output'}`);
  }
  return JSON.parse(run.stdout).hits;
}

async function gateG7(pages) {
  const failures = [];
  const notes = [];
  const allow = loadStyleAllow();
  for (const entry of allow.tells) {
    if (!entry.reason || !entry.match) {
      failures.push(`tools/style-allow.json: every tells entry needs match and reason (${JSON.stringify(entry)})`);
    }
  }
  const usedAllow = new Set();
  for (const file of pages) {
    const name = rel(file);
    const page = path.basename(file).replace(/\.html$/, '');
    const blocks = extractProse(file);
    let heading = '(top)';
    const lines = [];
    const starts = [];
    for (const block of blocks) {
      starts.push(lines.length + 1);
      lines.push(block.kind === 'h' ? '#'.repeat(block.level) + ' ' + block.md : block.md, '');
    }
    const where = new Map();
    blocks.forEach((block, i) => {
      if (block.kind === 'h') heading = block.plain;
      where.set(i, heading);
      for (const [ch, label] of [['—', 'em dash'], [';', 'semicolon']]) {
        if (block.plain.includes(ch)) {
          failures.push(`${name} [${heading}]: ${label} in prose: "${sentenceAt(block.plain, ch)}"`);
        }
      }
      if (block.kind === 'h' && block.level <= 4) {
        const bad = headingProblems(block.plain, allow.headingTerms);
        if (bad.length) {
          failures.push(`${name}: heading isn't sentence case (${bad.join(', ')}): "${block.plain}"`);
        }
      }
    });
    let hits;
    try {
      hits = runTells(lines.join('\n'));
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      continue;
    }
    let allowed = 0;
    for (const hit of hits) {
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= hit.line) index++;
      const block = blocks[index];
      const sentence = sentenceAt(block ? block.md : '', hit.match);
      const entry = allow.tells.find(
        e =>
          (!e.page || e.page === page) &&
          (!e.category || e.category === hit.category) &&
          String(hit.match).toLowerCase().includes(String(e.match).toLowerCase()) &&
          (!e.contains || sentence.includes(e.contains)),
      );
      if (entry) {
        usedAllow.add(entry);
        allowed++;
        continue;
      }
      failures.push(
        `${name} [${where.get(index)}]: ${hit.severity} ${hit.category} "${hit.match}" (${hit.hint}): "${sentence}"`,
      );
    }
    notes.push(`${name}: ${blocks.length} prose blocks, ${hits.length} tells (${allowed} allowed)`);
  }
  for (const entry of allow.tells) {
    if (!usedAllow.has(entry)) notes.push(`style-allow.json entry not used on these pages: ${JSON.stringify(entry.match)}`);
  }
  return {failures, notes};
}

// ---------------------------------------------------------------- G8

// Runs in every frame. Returns problems as strings.
function a11yProbe() {
  const problems = [];
  const describe = el => {
    let d = el.tagName.toLowerCase();
    if (el.id) d += '#' + el.id;
    if (el.className && typeof el.className === 'string') d += '.' + el.className.trim().split(/\s+/).join('.');
    const text = (el.textContent || '').trim().slice(0, 30);
    return text ? `${d} "${text}"` : d;
  };
  const textOf = el => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const nameOf = el => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby.split(/\s+/).map(id => textOf(document.getElementById(id))).join(' ').trim();
      if (text) return text;
    }
    const label = (el.getAttribute('aria-label') || '').trim();
    if (label) return label;
    if (el.labels && el.labels.length) {
      const text = Array.from(el.labels).map(textOf).join(' ').trim();
      if (text) return text;
    }
    if (el.tagName === 'BUTTON' || el.getAttribute('role')) {
      const text = textOf(el);
      if (text) return text;
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type) && el.value) return el.value;
    if (el.tagName === 'INPUT' && el.type === 'image' && el.alt) return el.alt;
    return (el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
  };
  document
    .querySelectorAll(
      'button, input:not([type="hidden"]), select, textarea, iframe, [role="button"], [role="checkbox"], [role="tab"], [role="switch"], [role="slider"]',
    )
    .forEach(el => {
      // Controls that aren't rendered aren't in the accessibility tree.
      if (el.closest('[hidden], [aria-hidden="true"]') || el.getClientRects().length === 0) return;
      if (!nameOf(el)) problems.push(`no accessible name: ${describe(el)}`);
    });
  // Color-coded statuses need a text cue too.
  document
    .querySelectorAll('[class*="verdict"], [class*="status"], .ex-ok, .ex-bad, .sb-last, .sb-pending, .ok, .bad, .good, .warn, .pass, .fail')
    .forEach(el => {
      if (el.getClientRects().length === 0) return;
      const cue = textOf(el) || el.getAttribute('aria-label') || el.getAttribute('title') || el.querySelector('img[alt], svg[aria-label], svg title');
      if (!cue && /\b(ex-ok|ex-bad|ok|bad|good|warn|pass|fail|sb-last)\b/.test(el.className)) {
        problems.push(`status shown by color alone: ${describe(el)}`);
      }
    });
  document.querySelectorAll('.sb-last').forEach(el => {
    if (!el.querySelector('.sb-dot')) problems.push(`last-commit chip without its dot: ${describe(el)}`);
  });
  // Images and diagrams.
  document.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('alt')) problems.push(`img without alt: ${describe(img)}`);
  });
  document.querySelectorAll('svg').forEach(svg => {
    if (svg.parentElement && svg.parentElement.closest('svg')) return;
    if (svg.closest('[aria-hidden="true"]')) return;
    const labeled =
      (svg.getAttribute('role') === 'img' && (svg.getAttribute('aria-label') || svg.getAttribute('aria-labelledby'))) ||
      Array.from(svg.children).some(c => c.tagName.toLowerCase() === 'title' && c.textContent.trim());
    if (!labeled) problems.push(`svg without role="img" + aria-label, or a <title>: ${describe(svg)}`);
  });
  return problems;
}

function headingSkips() {
  const problems = [];
  let previous = 0;
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
    if (h.closest('.sandbox, .explainer, [hidden]')) return;
    const level = Number(h.tagName[1]);
    if (previous && level > previous + 1) {
      problems.push(`heading skips a level (h${previous} to h${level}): "${h.textContent.trim().slice(0, 60)}"`);
    }
    previous = level;
  });
  return problems;
}

// Running CSS animations and transitions, and flashes without a label.
function motionProbe() {
  const running = document
    .getAnimations()
    .filter(a => {
      const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
      return a.playState === 'running' && timing && timing.duration > 0;
    })
    .map(a => {
      const el = a.effect && a.effect.target;
      const kind = a.constructor.name;
      const what = el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '') : '?';
      return `${kind} on ${what}`;
    });
  const flashes = Array.from(document.querySelectorAll('.__sandbox-flash'));
  const unlabeled = flashes.filter(f => !(f.querySelector('.__sandbox-flash-label') || {}).textContent);
  const moving = flashes.filter(f => getComputedStyle(f).transitionDuration.split(',').some(d => parseFloat(d) > 0));
  return {running, flashes: flashes.length, unlabeled: unlabeled.length, moving: moving.length};
}

async function frameLabel(frame) {
  if (frame.parentFrame() === null) return 'page';
  try {
    const el = await frame.frameElement();
    return await el.evaluate(node => {
      const host = node.closest('.sandbox, .explainer');
      if (!host) return 'iframe';
      return host.classList.contains('sandbox') ? `sandbox#${host.id}` : `explainer ${host.getAttribute('data-explainer')}`;
    });
  } catch {
    return 'iframe';
  }
}

async function gateG8(pages) {
  const failures = [];
  const notes = [];
  for (const file of pages) {
    const name = rel(file);
    let page;
    try {
      page = await openPage(file);
      if (!(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))) {
        failures.push(`${name}: prefers-reduced-motion isn't emulated, so the motion check means nothing`);
      }
      const ids = await page.evaluate(() => (window.__sandboxHost ? window.__sandboxHost.list() : []));
      if (ids.length) await page.evaluate(() => window.__sandboxHost.runAll());
      // Explainers build when they come near the viewport.
      const explainers = await page.locator('.explainer').count();
      for (let i = 0; i < explainers; i++) {
        await page.locator('.explainer').nth(i).scrollIntoViewIfNeeded();
      }
      if (explainers) await page.waitForTimeout(2000);

      // Motion: re-run each sandbox (its mount flashes) and sample every frame.
      const running = new Set();
      let flashes = 0;
      let unlabeled = 0;
      let moving = 0;
      const sample = async () => {
        for (const frame of page.frames()) {
          let result;
          try {
            result = await frame.evaluate(motionProbe);
          } catch {
            continue;
          }
          const label = await frameLabel(frame);
          result.running.forEach(r => running.add(`${label}: ${r}`));
          flashes += result.flashes;
          unlabeled += result.unlabeled;
          moving += result.moving;
        }
      };
      for (const id of ids) {
        await page.evaluate(sid => window.__sandboxHost.get(sid).run(), id);
        await sample();
      }
      for (let i = 0; i < 5; i++) {
        await sample();
        await page.waitForTimeout(100);
      }
      for (const r of running) failures.push(`${name}: running with reduced motion: ${r}`);
      if (ids.length && flashes === 0) failures.push(`${name}: no render flash appeared after re-running the sandboxes`);
      if (unlabeled) failures.push(`${name}: ${unlabeled} flashes without a text label`);
      if (moving) failures.push(`${name}: ${moving} flashes still transition with reduced motion`);

      // Names, color-only statuses and images, in every frame.
      for (const frame of page.frames()) {
        let problems;
        try {
          problems = await frame.evaluate(a11yProbe);
        } catch {
          continue;
        }
        const label = await frameLabel(frame);
        for (const p of new Set(problems)) failures.push(`${name} ${label}: ${p}`);
      }
      for (const p of await page.evaluate(headingSkips)) failures.push(`${name}: ${p}`);
      notes.push(`${name}: ${page.frames().length - 1} frames, ${flashes} flashes sampled`);
    } catch (error) {
      failures.push(`${name}: ${error.message.split('\n')[0]}`);
    } finally {
      if (page) await page.close();
    }
  }
  return {failures, notes};
}

// ---------------------------------------------------------------- plug-ins

function pluginGate(file) {
  return async pages => {
    const mod = await import(pathToFileURL(file).href);
    if (typeof mod.check === 'function') {
      const result = await mod.check({docs, repo, pages, openPage, log});
      return {failures: result.failures || [], notes: result.notes || []};
    }
    const run = spawnSync(process.execPath, [file], {stdio: 'inherit', cwd: repo});
    return {failures: run.status === 0 ? [] : [`${rel(file)} exited with ${run.status}`], notes: []};
  };
}

const GATES = {
  G1: {title: 'vendor', run: gateG1},
  G2: {title: 'offline', run: gateG2, browser: true},
  G3: {title: 'sandboxes', run: gateG3, browser: true},
  G4: {title: 'explainers', file: path.join(here, 'check-explainers.mjs'), browser: true},
  G5: {title: 'numbers', file: path.join(here, 'check-numbers.mjs')},
  G6: {title: 'links', run: gateG6},
  G7: {title: 'style', run: gateG7},
  G8: {title: 'accessibility', run: gateG8, browser: true},
};

async function main() {
  const requested = option('gates', null);
  let gates;
  if (requested !== null) {
    gates = requested.split(',');
    const unknown = gates.filter(g => !GATES[g]);
    if (unknown.length > 0) throw new Error(`Unknown gates ${unknown.join(', ')}`);
  } else {
    gates = ['G1', 'G2', 'G3'];
    if (fs.existsSync(GATES.G4.file)) gates.push('G4');
    if (fs.existsSync(GATES.G5.file)) gates.push('G5');
    gates.push('G6', 'G7', 'G8');
  }

  const selection = selectPages();
  let failed = selection.failures.length > 0;
  for (const n of selection.notes) log(`note   ${n}`);
  for (const f of selection.failures) log(`FAIL   ${f}`);

  for (const id of gates) {
    const gate = GATES[id];
    let run = gate.run;
    if (!run) {
      if (!fs.existsSync(gate.file)) {
        log(`\n${id} ${gate.title}: FAIL\n  ${rel(gate.file)} doesn't exist yet`);
        failed = true;
        continue;
      }
      run = pluginGate(gate.file);
    }
    const started = Date.now();
    let result;
    try {
      result = await run(selection.pages);
    } catch (error) {
      result = {failures: [error.stack || error.message], notes: []};
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
    log(`\n${id} ${gate.title}: ${status} (${seconds} s)`);
    for (const n of result.notes) log(`  note ${n}`);
    for (const f of result.failures) log(`  FAIL ${f}`);
    if (result.failures.length > 0) failed = true;
  }
  if (browser !== null) await browser.close();
  log(failed ? '\nFAILED' : '\nALL GATES PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch(async error => {
  console.error(error.stack || error.message);
  if (browser !== null) await browser.close();
  process.exit(1);
});
