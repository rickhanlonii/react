// Tests G5 (check-numbers.mjs) on small pages:
// - good.src.html, filled the way build-docs.mjs fills pages, passes against
//   a pin list with only head results and a history set (report-sources.json
//   here), and fails once a cited set is a placeholder;
// - bad.html fails with every kind of problem;
// - good.src.html fails against the real pin list while it has placeholder
//   sets or files without env.react.
//
//   node docs/use-store/tools/fixtures-numbers/test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {checkAll} from '../check-numbers.mjs';
import {generators} from '../charts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const dataPath = path.join(here, 'bench-data.json');
const sourcesPath = path.join(here, 'report-sources.json');

// The build-docs.mjs contract (sandbox/API.md): keep the markers, put the
// generator's output between them, then put each key's escaped display
// inside its span.
const escapeHTML = text =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function fill(html, data, page = 'good') {
  return html
    .replace(
      /<!--\s*gen:(\S+?)(?:\s+(\{[\s\S]*?\}))?\s*\/?-->(?:[\s\S]*?<!--\s*\/gen:\1\s*-->)?/g,
      (all, name, json) =>
        name.startsWith('code:') || name === 'sandbox-build'
          ? all
          : `<!-- gen:${name}${json ? ' ' + json : ''} -->${generators[name](data, {page, args: json ? JSON.parse(json) : {}})}<!-- /gen:${name} -->`,
    )
    .replace(
      /<span data-n="([^"]*)">[\s\S]*?<\/span>/g,
      (all, key) => `<span data-n="${key}">${escapeHTML(data.values[key].display)}</span>`,
    );
}

let failed = 0;
function expect(label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    failed++;
    if (detail) console.log('     ' + detail.join('\n     '));
  }
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-'));
const good = path.join(tmp, 'good.html');
fs.writeFileSync(good, fill(fs.readFileSync(path.join(here, 'good.src.html'), 'utf8'), data));

const goodProblems = await checkAll({pages: [good], dataPath, sourcesPath});
expect('good page passes against head pins plus a history set', goodProblems.length === 0, goodProblems);

// A history set (an older run from another build) never fails the check,
// but a placeholder set still does for a page that cites data.
const fixturePins = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
expect('the fixture pins a history set', Object.values(fixturePins.sets).some(s => s.status === 'history'));
const placeholderPins = path.join(tmp, 'placeholder-sources.json');
fs.writeFileSync(
  placeholderPins,
  JSON.stringify({...fixturePins, sets: {...fixturePins.sets, counts: {...fixturePins.sets.counts, status: 'placeholder'}}}),
);
const placeholderProblems = await checkAll({pages: [good], dataPath, sourcesPath: placeholderPins});
expect('a placeholder set fails a page that cites data', placeholderProblems.some(p => p.includes('set "counts" is placeholder')), placeholderProblems);
expect('the history set is not reported', !placeholderProblems.some(p => p.includes('history-final')), placeholderProblems);

const badProblems = await checkAll({pages: [path.join(here, 'bad.html')], dataPath, sourcesPath});
for (const [label, needle] of [
  ['prose number', 'number in prose: "5,000"'],
  ['prose ratio', 'number in prose: "1.4×"'],
  ['digit as a character reference', 'number in prose: "1'],
  ['wrong display', `shows "5,000", expected "${data.values['counts.main.selection.redux.on.selectors'].display}"`],
  ['unknown key', 'is not a key in bench-data.json'],
  ['stale gen block', 'gen:counts-table differs'],
  ['unknown generator', 'unknown generator gen:not-a-generator'],
  ['unfilled gen block', 'gen:scoreboard has no'],
  ['missing build label', 'no build label'],
  ['key name printed as text', 'key name "method.verdictRule" printed as text'],
]) {
  expect(`bad page: ${label}`, badProblems.some(p => p.includes(needle)), badProblems);
}

const noBenchProblems = await checkAll({pages: [path.join(here, 'no-bench.html')], dataPath, sourcesPath});
expect('a page with only sandbox-build and code blocks needs no build label', noBenchProblems.length === 0, noBenchProblems);

const realSources = path.join(repo, 'fixtures/store-bench/results/report-sources.json');
const realData = path.join(repo, 'docs/use-store/data/bench-data.json');
const pinned = JSON.parse(fs.readFileSync(realSources, 'utf8'));
if (Object.values(pinned.sets).some(s => s.status !== 'head' && s.status !== 'history')) {
  const goodReal = path.join(tmp, 'good-real.html');
  fs.writeFileSync(goodReal, fill(fs.readFileSync(path.join(here, 'good.src.html'), 'utf8'), JSON.parse(fs.readFileSync(realData, 'utf8'))));
  const realProblems = await checkAll({pages: [goodReal], dataPath: realData, sourcesPath: realSources});
  expect('placeholder sets fail', realProblems.some(p => /set "\w[\w-]*" is placeholder/.test(p)), realProblems);
  expect('files without env.react fail', realProblems.some(p => p.includes('no env.react sha')), realProblems);
  const noBenchReal = await checkAll({pages: [path.join(here, 'no-bench.html')], dataPath: realData, sourcesPath: realSources});
  expect('a page citing no benchmark data passes despite placeholder pins', noBenchReal.length === 0, noBenchReal);
  const globalReal = await checkAll({pages: [path.join(here, 'no-bench.html')], dataPath: realData, sourcesPath: realSources, global: true});
  expect('the standalone (global) run still reports placeholder pins', globalReal.some(p => /set "\w[\w-]*" is placeholder/.test(p)), globalReal);
}

// Head sets never pick up files from the build without the bailout, and the
// reverse: by file name (headPattern) and by build (env.react).
const headnbNames = [
  'full-headnb-r1-entity-x1-1793600000000.json',
  'smoke-headnb-q-sweeps-r1-1793600000000.json',
  'counts-headnb-1793600000000.json',
  'counts-headnb-q-sweeps-1793600000000.json',
];
const headNames = [
  'full-head-r1-entity-x1-1793600000000.json',
  'smoke-head-q-sweeps-r1-1793600000000.json',
];
const leaks = [];
for (const [set, entry] of Object.entries(pinned.sets)) {
  // History sets pin by historyPattern and must match neither build's files.
  if (entry.status === 'history') {
    const re = new RegExp(entry.historyPattern);
    for (const n of [...headNames, ...headnbNames]) {
      if (re.test(n)) leaks.push(`${set} (history) matches ${n}`);
    }
    continue;
  }
  const re = new RegExp(entry.headPattern);
  const nobailout = set.startsWith('nobailout-');
  for (const n of nobailout ? headNames : headnbNames) {
    if (re.test(n)) leaks.push(`${set} matches ${n}`);
  }
}
expect('head, head-nobailout and history file names never cross', leaks.length === 0, leaks);
const {matchesBuild, expectedBuild} = await import('../../../../fixtures/store-bench/report-data.mjs');
const headEnv = {react: {sha: pinned.expectBuild.sha, dir: 'react-builds/head'}};
const nbEnv = {react: {sha: pinned.expectBuild.sha, dir: 'react-builds/head-nobailout'}};
expect(
  'head and head-nobailout builds never cross',
  matchesBuild(headEnv, expectedBuild(pinned, 'main')) &&
    !matchesBuild(nbEnv, expectedBuild(pinned, 'main')) &&
    matchesBuild(nbEnv, expectedBuild(pinned, 'nobailout-main')) &&
    !matchesBuild(headEnv, expectedBuild(pinned, 'nobailout-main')),
);

fs.rmSync(tmp, {recursive: true});
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
