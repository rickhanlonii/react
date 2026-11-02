// G5: every number in the use(store) reports is generated from pinned results.
//
//   node docs/use-store/tools/check-numbers.mjs [page.html ...]
//       Checks docs/use-store/*.html by default.
//   --data=<bench-data.json> --sources=<report-sources.json>
//       Check against another data file and pin list (used by the fixture in
//       tools/fixtures-numbers/).
//
// It fails when (1 and 2 only for pages that cite benchmark data, see 6, and
// always in the standalone run with no page arguments):
// 1. the pinned results aren't all from the frozen build: a set in
//    report-sources.json that isn't 'head', or a pinned file whose env.react
//    sha is missing or different (a 'history' set, an older run kept for
//    comparison, is exempt: it's from another build by design, and its files
//    only have to exist);
// 2. regenerating bench-data.json (and KEYS.md) from the pinned results
//    changes anything;
// 3. a <!-- gen:NAME --> block in a page differs from generators[NAME](data),
//    or names an unknown generator;
// 4. a <span data-n="key"> names an unknown key, a key without a source, or
//    shows anything but the key's display;
// 5. a digit appears in the prose outside data-n spans, gen blocks, <code>,
//    <pre>, <script>, <style>, <svg>, comments, elements with a data-lit
//    attribute, and the allowlist below (plus any page-level
//    <meta name="check-numbers-allow" content="regex;;regex">);
// 7. a bench-data key name shows up as text (a key, or a key prefix such as
//    "method.verdictRule" or "losses.control.*") anywhere a reader sees it,
//    including gen blocks: a generator or prose that printed the name
//    instead of the value. Code, pre, script, style and comments are skipped.
// 6. a page that cites benchmark numbers (a data-n span, or a gen block other
//    than code:*, sandbox-build and charts-assets) doesn't show the build label
//    (<!-- gen:build-label --> or <span data-n="build.label">).

import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(here, '..');
const repo = path.resolve(docsDir, '../..');
const bench = path.join(repo, 'fixtures/store-bench');

// Digits that aren't measurements: decision and gate ids, years, section
// signs, version names, and so on.
export const ALLOW = [
  /\bDCP-\d+(\.\d+)?\b/g,
  /\bDCP-\d+\.\.\d+\b/g,
  /\bG\d\b/g,
  /\bG\d[–-]G\d\b/g,
  /\b(19|20)\d\d\b/g,
  /§\s?\d+(\.\d+)*/g,
  /\bReact \d+(\.\d+)*\b/g,
  /\bES20\d\d\b/g,
  /\bH[1-6]\b/g,
  /\bB-\d+\b/g,
  /\b[HML]\d\b/g,
  /\bUTF-8\b/gi,
  /\bx86\b|\barm64\b/g,
];

// Replaces a range with spaces, keeping newlines, so offsets and line numbers
// stay put.
function blank(text, start, end) {
  return text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, ' ') + text.slice(end);
}

function blankAll(text, regex, keep) {
  let out = text;
  for (const m of text.matchAll(regex)) {
    if (keep && keep(m)) continue;
    out = blank(out, m.index, m.index + m[0].length);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// The same escaping build-docs.mjs uses for data-n values.
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DATA_N = /<span\b[^>]*\bdata-n="([^"]*)"[^>]*>([\s\S]*?)<\/span>/g;

// build-docs.mjs fills data-n spans after the generators run, including any
// a generator emits.
function fillNumbers(html, data) {
  return html.replace(DATA_N, (all, key, inner) => {
    const entry = data.values[key];
    return entry ? all.replace(`>${inner}</span>`, `>${escapeHTML(entry.display)}</span>`) : all;
  });
}

// build-docs.mjs built-ins, checked by its own --check rather than here.
const BUILT_IN = name => name.startsWith('code:') || name === 'sandbox-build';

// Every key and key prefix with a dot, for check 7.
const prefixCache = new WeakMap();
function keyPrefixes(data) {
  if (!prefixCache.has(data)) {
    prefixCache.set(
      data,
      new Set(Object.keys(data.values ?? {}).flatMap(k => k.split('.').slice(1).map((_, i, a) => k.split('.').slice(0, i + 2).join('.')))),
    );
  }
  return prefixCache.get(data);
}

export async function checkPage(file, html, data, generators) {
  const problems = [];
  const rel = path.relative(process.cwd(), file);
  const page = path.basename(file, '.html');
  let text = html;

  // 7. Key names printed instead of values (gen blocks included).
  {
    const prefixes = keyPrefixes(data);
    let seen = html;
    seen = blankAll(seen, /<!--[\s\S]*?-->/g);
    for (const tag of ['script', 'style', 'pre', 'code', 'textarea', 'template', 'head']) {
      seen = blankAll(seen, new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'));
    }
    seen = blankAll(seen, /<[^>]*>/g);
    for (const m of seen.matchAll(/\b[a-z]+(?:\.[a-zA-Z0-9-]+)+(?:\.\*)?/g)) {
      if (prefixes.has(m[0].replace(/\.\*$/, ''))) {
        problems.push(`${rel}:${lineOf(html, m.index)}: key name "${m[0]}" printed as text (show its value, or put it in <code>)`);
      }
    }
  }

  // Gen blocks: <!-- gen:NAME {args} -->…<!-- /gen:NAME -->.
  const genRe = /<!--\s*gen:(\S+?)(?:\s+(\{[\s\S]*?\}))?\s*-->([\s\S]*?)<!--\s*\/gen:\1\s*-->/g;
  const genNames = [];
  for (const m of html.matchAll(genRe)) {
    const [, name, json, body] = m;
    genNames.push(name);
    const where = `${rel}:${lineOf(html, m.index)}`;
    if (BUILT_IN(name)) {
      // Not ours.
    } else if (!generators[name]) {
      problems.push(`${where}: unknown generator gen:${name}`);
    } else {
      let args = {};
      try {
        args = json ? JSON.parse(json) : {};
      } catch (error) {
        problems.push(`${where}: bad JSON args for gen:${name}`);
      }
      const generated = fillNumbers(await generators[name](data, {page, args}), data);
      if (generated !== body) {
        problems.push(`${where}: gen:${name} differs from what bench-data.json generates (rebuild the page)`);
      }
    }
    text = blank(text, m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(/<!--\s*gen:(\S+?)(?:\s+\{[\s\S]*?\})?\s*\/?-->/g)) {
    problems.push(`${rel}:${lineOf(html, m.index)}: gen:${m[1]} has no <!-- /gen:${m[1]} --> (not filled in)`);
  }

  // data-n spans.
  const keys = [];
  for (const m of text.matchAll(DATA_N)) {
    const [, key, body] = m;
    keys.push(key);
    const entry = data.values[key];
    const where = `${rel}:${lineOf(html, m.index)}`;
    if (!entry) {
      problems.push(`${where}: data-n="${key}" is not a key in bench-data.json`);
    } else {
      if (!entry.source) problems.push(`${where}: data-n="${key}" has no source`);
      if (body !== escapeHTML(entry.display)) {
        problems.push(`${where}: data-n="${key}" shows "${body}", expected "${escapeHTML(entry.display)}"`);
      }
    }
    text = blank(text, m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(/\bdata-n="([^"]*)"/g)) {
    problems.push(`${rel}:${lineOf(html, m.index)}: data-n="${m[1]}" must be on a <span> with only text inside`);
  }

  // The build label, on every page that cites numbers.
  // build-docs built-ins (code blocks, the sandbox build line) and the chart
  // assets aren't benchmark data, so they don't need the bench build label.
  const citesNumbers =
    genNames.some(n => !BUILT_IN(n) && n !== 'charts-assets') || keys.length > 0;
  problems.citesNumbers = citesNumbers;
  if (citesNumbers && !genNames.includes('build-label') && !keys.includes('build.label')) {
    problems.push(`${rel}: no build label (<!-- gen:build-label --> or <span data-n="build.label">)`);
  }

  // Everything that isn't prose.
  const allow = [...ALLOW];
  const meta = html.match(/<meta\s+name="check-numbers-allow"\s+content="([^"]*)"/);
  if (meta) {
    for (const source of meta[1].split(';;').filter(Boolean)) allow.push(new RegExp(source, 'g'));
  }
  text = blankAll(text, /<!--[\s\S]*?-->/g);
  for (const tag of ['script', 'style', 'pre', 'code', 'svg', 'textarea', 'template']) {
    text = blankAll(text, new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'));
  }
  text = blankAll(text, /<head\b[\s\S]*?<\/head>/gi);
  // Elements marked data-lit (no nesting of the same tag inside).
  text = blankAll(text, /<(\w+)\b[^>]*\bdata-lit\b[^>]*>[\s\S]*?<\/\1>/g);
  // Section numbers at the start of a heading ("3. Method", "3.2 Timing").
  text = text.replace(/(<h[1-6]\b[^>]*>\s*)(\d+(\.\d+)*\.?)(?=\s)/gi, (all, open, num) => open + ' '.repeat(num.length));
  // Tags, then character references (a reference that encodes a digit stays
  // a digit).
  text = blankAll(text, /<[^>]*>/g);
  text = text.replace(/&#(x[0-9a-f]+|\d+);/gi, (all, code) => {
    const ch = String.fromCodePoint(code[0] === 'x' || code[0] === 'X' ? parseInt(code.slice(1), 16) : Number(code));
    return /\d/.test(ch) ? ch.padEnd(all.length) : ' '.repeat(all.length);
  });
  text = text.replace(/&[a-z]+;/gi, all => ' '.repeat(all.length));
  for (const re of allow) text = blankAll(text, re);
  for (const m of text.matchAll(/[^\s]*\d[^\s]*/g)) {
    const line = lineOf(html, m.index);
    problems.push(`${rel}:${line}: number in prose: "${m[0]}" (use <span data-n>, a gen block, <code>, or data-lit)`);
  }
  return problems;
}

// The pin and data checks (1, 2) apply to the pages that cite benchmark
// data, and to the standalone run (global), so a page that cites none (the
// explainer) doesn't fail because some benchmark set is still a placeholder.
export async function checkAll({pages, dataPath, sourcesPath, global = false}) {
  const problems = [];
  const reportData = await import(pathToFileURL(path.join(bench, 'report-data.mjs')).href);
  const {readSources} = await import(pathToFileURL(path.join(bench, 'report-suites.mjs')).href);
  const {generators} = await import(pathToFileURL(path.join(here, 'charts.mjs')).href);
  const data = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : null;

  // 3-6. The pages.
  let citing = [];
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const pageProblems = await checkPage(page, html, data ?? {values: {}, build: {}}, generators);
    if (pageProblems.citesNumbers) citing.push(path.relative(process.cwd(), page));
    problems.push(...pageProblems);
  }
  problems.citing = citing;
  if (!global && citing.length === 0) {
    return problems;
  }
  const scope = global ? '' : ` (cited by ${citing.join(', ')})`;
  const sources = readSources(sourcesPath);

  // 1. Pinned results from the frozen build only (history sets aside).
  for (const [set, entry] of Object.entries(sources.sets)) {
    if (entry.status !== 'head' && entry.status !== 'history') {
      problems.push(`report-sources.json: set "${set}" is ${entry.status}, not head${scope}`);
    }
  }
  for (const [set, entry] of Object.entries(sources.sets)) {
    const expected = reportData.expectedBuild(sources, set);
    for (const f of entry.files) {
      const file = path.join(bench, 'results', f);
      if (!fs.existsSync(file)) {
        problems.push(`report-sources.json: ${set} pins ${f}, which doesn't exist${scope}`);
        continue;
      }
      if (entry.status === 'history') continue;
      const env = JSON.parse(fs.readFileSync(file, 'utf8')).env;
      if (!env?.react?.sha) {
        problems.push(`${f}: no env.react sha${scope}`);
      } else if (!reportData.matchesBuild(env, expected)) {
        problems.push(`${f}: built from ${env.react.dir} at ${env.react.sha.slice(0, 8)}, but set "${set}" expects ${expected.dir} at ${expected.sha.slice(0, 8)}${scope}`);
      }
    }
  }

  // 2. Regenerating changes nothing.
  if (!data) {
    problems.push(`${dataPath} doesn't exist (run node fixtures/store-bench/report-data.mjs)`);
    return problems;
  }
  const regenerated = reportData.computeReportData(sources);
  if (fs.readFileSync(dataPath, 'utf8') !== reportData.serialize(regenerated)) {
    problems.push(`${path.relative(repo, dataPath)} is stale: regenerating from the pinned results changes it (run node fixtures/store-bench/report-data.mjs)`);
  }
  if (path.resolve(dataPath) === path.resolve(reportData.dataPath)) {
    const keys = (await reportData.keysMarkdown(regenerated)) + '\n';
    if (!fs.existsSync(reportData.keysPath) || fs.readFileSync(reportData.keysPath, 'utf8') !== keys) {
      problems.push('docs/use-store/data/KEYS.md is stale (run node fixtures/store-bench/report-data.mjs)');
    }
  }
  if (data.build.status !== 'head') {
    problems.push(`bench-data.json: build status is ${data.build.status} (${data.build.placeholderSets.join(', ')})${scope}`);
  }
  return problems;
}

// The check-docs.mjs interface (docs/use-store/sandbox/API.md section 6).
export async function check(ctx) {
  const dataPath = path.join(ctx.docs, 'data/bench-data.json');
  const sourcesPath = path.join(ctx.repo, 'fixtures/store-bench/results/report-sources.json');
  const failures = await checkAll({pages: ctx.pages, dataPath, sourcesPath});
  const notes = [];
  if (failures.length === 0) {
    const build = JSON.parse(fs.readFileSync(dataPath, 'utf8')).build;
    notes.push(
      failures.citing.length === 0
        ? `G5: ${ctx.pages.length} pages, none cite benchmark data; no numbers in the prose`
        : `G5: ${ctx.pages.length} pages; ${failures.citing.join(', ')} cite data, every number generated from results pinned ${build.resultsPinnedAt} on React ${build.shortSha}`,
    );
  }
  return {failures: [...failures], notes};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const files = args.filter(a => !a.startsWith('--'));
  const pages = files.length
    ? files.map(f => path.resolve(f))
    : fs
        .readdirSync(docsDir)
        .filter(f => f.endsWith('.html'))
        .map(f => path.join(docsDir, f));
  const dataPath = path.resolve(opt('data') ?? path.join(docsDir, 'data/bench-data.json'));
  const sourcesPath = path.resolve(opt('sources') ?? path.join(bench, 'results/report-sources.json'));
  // With no page arguments, the pin and data checks run regardless of what
  // the pages cite, so the pin status stays visible.
  const problems = await checkAll({pages, dataPath, sourcesPath, global: files.length === 0});
  if (problems.length) {
    console.log(`G5 FAIL: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  console.log(
    problems.citing.length === 0 && files.length > 0
      ? `G5 ok: ${pages.length} page${pages.length === 1 ? '' : 's'}, no benchmark numbers cited and no numbers in the prose`
      : `G5 ok: ${pages.length} page${pages.length === 1 ? '' : 's'}, every number generated from the pinned results (build ${JSON.parse(fs.readFileSync(dataPath, 'utf8')).build.shortSha})`,
  );
}
