// Writes docs/use-store/shared-derived-data.html: the options for sharing
// derived data between use(store) readers, with code and measurements.
//
// The code for the measured options is read from the benchmark sources (with
// the counting instrumentation stripped), and the numbers come from the final
// spike run (results/smoke-spike-final-*.json), so neither can drift from
// what was measured. Proposed APIs that don't exist yet are hand-written and
// labeled as proposals.
//
//   node derived-explainer.mjs

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {block, extract, format} from './code-examples.mjs';
import {summarize} from './stats.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const suite = path.join(here, 'src/redux-suite/derived-selectors');
const out = path.join(repo, 'docs/use-store/shared-derived-data.html');

// Removes the counting instrumentation from source text, keeping the
// author's formatting: countRender() statements, and the counted(...) and
// derivation(...) wrappers (no-ops outside the counting build).
function unwrap(code, name) {
  let i;
  while ((i = code.indexOf(name + '(')) !== -1) {
    let depth = 0;
    let j = i + name.length;
    for (; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')' && --depth === 0) break;
    }
    code = code.slice(0, i) + code.slice(i + name.length + 1, j) + code.slice(j + 1);
  }
  return code;
}

async function source(file, width = 72) {
  let raw = fs.readFileSync(file, 'utf8');
  raw = raw.replace(/^[ \t]*countRender\(\);\n/gm, '');
  raw = unwrap(unwrap(raw, 'counted'), 'derivation');
  return format(raw, width);
}

function match(code, re, what) {
  const m = code.match(re);
  if (m === null) {
    throw new Error(`Couldn't find ${what}`);
  }
  return m[0].trimEnd();
}

function dedent(code, n) {
  return code.replace(new RegExp(`^ {${n}}`, 'gm'), '');
}

// ---------------------------------------------------------------- code

const app = name => path.join(suite, 'apps', name + '.jsx');
const redux = await source(app('redux'));
const store = await source(app('store'));
const storeDerived = await source(app('store-derived'));
const storeMemo = await source(app('store-memo'));
const storeCacheRender = await source(app('store-cache-render'));
const storeDerivedLazy = await source(app('store-derived-lazy'));
const storeCompiledShared = await source(app('store-compiled-shared'), 80);
const derive = await source(path.join(suite, 'derive.js'));
const sharedMemo = await source(path.join(suite, 'shared-memo.js'));
const storeTests = fs.readFileSync(
  path.join(
    repo,
    'packages/react-reconciler/src/__tests__/ReactUseStore-test.js',
  ),
  'utf8',
);

const code = {
  reduxSelector: block(
    match(
      redux,
      /const selectCategoryStats = createSelector\([\s\S]*?\n\);/,
      'selectCategoryStats',
    ) +
      '\n\n' +
      match(
        redux,
        /const CategoryStats = React\.memo\([\s\S]*?\n\}\);/,
        'Redux CategoryStats',
      ),
    {
      marks: ['createSelector(', 'selectCategoryStats(state, category)'],
      notes: {
        'createSelector(': 'one cache per argument list, shared by every component',
      },
    },
  ),
  getCategoryStats: block(
    match(
      derive,
      /export const getCategoryStats = [\s\S]*?\n\};/,
      'getCategoryStats',
    ),
  ),
  perInstance: block(extract(store, 'CategoryStats'), {
    bad: ['getCategoryStats(posts, comments, category)'],
    notes: {
      'getCategoryStats(posts, comments, category)':
        'the compiler memoizes this per component: K readers compute it K times',
    },
  }),
  computeInUpdate: block(
    dedent(
      match(
        storeDerived,
        / {2}const latest = \{[\s\S]*?addComment[\s\S]*?\n {4}\},/,
        'store-derived actions',
      ),
      2,
    ) + '\n};',
    {
      bad: ['s.categoryStats.update('],
      notes: {
        'const latest =': 'a userland copy of the latest values, outside React',
        's.categoryStats.update(':
          'computed from the latest values, not from what a render sees',
      },
    },
  ),
  tearTest: block(
    dedent(
      match(
        storeTests,
        / {2}it\('a value derived from several stores outside of render tears[\s\S]*?\n {2}\}\);/,
        'tear test',
      ),
      2,
    ),
    {
      bad: ["toMatchRenderedOutput('score:0 total:1000 comments:1')"],
    },
  ),
  weakMemoUse: block(
    match(
      storeMemo,
      /const getSharedCategoryStats = weakMemo\(getCategoryStats\);/,
      'weakMemo use',
    ) +
      '\n\n' +
      extract(storeMemo, 'CategoryStats'),
    {
      marks: ['weakMemo(getCategoryStats)', 'getSharedCategoryStats(posts'],
      notes: {
        'weakMemo(getCategoryStats)': 'module scope: one cache for every caller',
      },
    },
  ),
  weakMemoImpl: block(
    extract(sharedMemo, 'createNode') +
      '\n\n' +
      extract(sharedMemo, 'getNode') +
      '\n\n' +
      extract(sharedMemo, 'weakMemo'),
    {
      notes: {
        'objects.get(arg)':
          'snapshots are WeakMap keys, so entries die with their snapshot',
      },
    },
  ),
  cacheProposal: block(
    `import {cache, use} from 'react';

// Proposed: cache() on the client, scoped to a render. The same module
// already works on the server, where cache() is scoped to a request.
export const getCategoryStats = cache((posts, comments, category) => {
  const catPosts = posts.filter(p => p.category === category);
  // ...the same body as before
});

function CategoryStats({category}) {
  const posts = use(postsStore);
  const comments = use(commentsStore);
  const stats = getCategoryStats(posts, comments, category);
  return (
    <div>
      {category}: {stats.postCount} posts, avg {stats.avgScore.toFixed(1)}
    </div>
  );
}`,
    {
      marks: ['cache((posts, comments, category)'],
      notes: {
        'cache((posts, comments, category)':
          'the only change: wrap the function',
      },
    },
  ),
  cacheStandIn: block(
    match(
      storeCacheRender,
      /const getSharedCategoryStats = generationalMemo\(getCategoryStats, 1\);/,
      'generationalMemo use',
    ) +
      '\n\n' +
      extract(storeCacheRender, 'CacheGeneration'),
    {
      notes: {
        'useLayoutEffect(': 'React would start a new generation at commit for free',
      },
    },
  ),
  compiled: block(
    match(
      extract(storeCompiledShared, 'CategoryStats'),
      /function CategoryStats\(t0\) \{[\s\S]*?\} else \{/,
      'compiled CategoryStats',
    ) + '\n    // ...read the cached slots\n  }\n  // ...',
    {
      marks: ['_sharedCall(getCategoryStats'],
      notes: {
        '$[0] !== category': 'the per-instance check stays in front',
        '_sharedCall(getCategoryStats':
          'was getCategoryStats(...): only reached when this instance missed',
      },
    },
  ),
  adaptive: block(
    `// Sketch of the runtime a compiler pass would target (not implemented).
// One cache per call site, scoped to a render, that turns itself off when
// the call site isn't shared.
function createSharedCallSite(fn) {
  let hits = 0;
  let misses = 0;
  let direct = false;
  return function () {
    if (direct) {
      return fn.apply(null, arguments);
    }
    const node = getRenderCacheNode(fn, arguments); // reset each render
    if (node.hasValue) {
      hits++;
      return node.value;
    }
    if (++misses > 64 && hits < misses / 4) {
      // Expensive but never shared (like getCommentCount here): stop
      // paying for the lookup.
      direct = true;
    }
    node.hasValue = true;
    return (node.value = fn.apply(null, arguments));
  };
}`,
  ),
  derivedStoreProposal: block(
    `// Proposed API (not implemented): a store derived from other stores,
// computed once per root per render, at that render's cut.
const categoryStats = createStore(
  [postsStore, commentsStore],
  (posts, comments) => getAllCategoryStats(posts, comments),
);

function CategoryStats({category}) {
  const stats = use(categoryStats)[category];
  // ...
}`,
    {
      notes: {
        'getAllCategoryStats(posts, comments)':
          'no render-time parameter: it derives every category',
      },
    },
  ),
  derivedStoreStandIn: block(
    extract(storeDerivedLazy, 'createDerivedStore') +
      '\n\n' +
      extract(storeDerivedLazy, 'useDerived'),
  ),
};

// ---------------------------------------------------------------- numbers

const resultsDir = path.join(here, 'results');
const files = fs
  .readdirSync(resultsDir)
  .filter(
    f => /^smoke-spike-final-r\d+-.*\.json$/.test(f) && !f.includes('discarded'),
  );
const durations = new Map();
for (const file of files) {
  const {results} = JSON.parse(
    fs.readFileSync(path.join(resultsDir, file), 'utf8'),
  );
  for (const r of results) {
    if (r.kind !== 'update' || !r.compiler) continue;
    const key = [r.scenario, r.throttle, r.variant].join('|');
    if (!durations.has(key)) durations.set(key, []);
    durations.get(key).push(...r.durations);
  }
}
function stat(scenario, throttle, variant) {
  const values = durations.get([scenario, throttle, variant].join('|'));
  return values ? summarize(values) : null;
}

const VARIANTS = [
  ['redux', 'Redux createSelector', 'ref'],
  ['zustand', 'Zustand (derives in selectors)', 'ref'],
  ['store', '1 · per-instance (today)', ''],
  ['store-derived', '2 · compute in the update (tears)', 'bad'],
  ['store-memo', '3 · userland weakMemo', 'share'],
  ['store-reselect', '3 · reselect weakMapMemoize', 'share'],
  ['store-cache-render', '4 · cache(), scoped to a render', 'share'],
  ['store-cache-gen', '4 · cache(), two generations', 'share'],
  ['store-compiled-shared', '5 · compiler-emitted', 'share'],
  ['store-derived-lazy', '6 · derived store', 'share'],
];
const SHARING = VARIANTS.filter(([, , kind]) => kind === 'share').map(
  ([v]) => v,
);
const Ks = [
  ['', 5],
  ['-k20', 20],
  ['-k50', 50],
];

function fmt(v) {
  return v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(2) : v.toFixed(1);
}

function timingTable(scenario, throttle) {
  const header = Ks.map(([, k]) => `<th class="r">K=${k}</th>`).join('');
  const rows = VARIANTS.map(([variant, label, kind]) => {
    const cells = Ks.map(([suffix]) => {
      const s = stat(scenario + suffix, throttle, variant);
      const r = stat(scenario + suffix, throttle, 'redux');
      if (!s) return '<td class="r">–</td>';
      const rel =
        r && variant !== 'redux'
          ? ` <small class="muted">${(s.median / r.median).toFixed(2)}×</small>`
          : '';
      return `<td class="r">${fmt(s.median)}${rel}</td>`;
    }).join('');
    return `<tr class="${kind}"><td>${label}</td>${cells}</tr>`;
  });
  return `<table><tr><th>option</th>${header}</tr>${rows.join('')}</table>`;
}

// Bars: Redux, today's use(store), the fastest correct sharing option.
function chart(scenario, throttle) {
  const groups = Ks.map(([suffix, k]) => {
    const redux = stat(scenario + suffix, throttle, 'redux');
    const plain = stat(scenario + suffix, throttle, 'store');
    const shared = SHARING.map(v => stat(scenario + suffix, throttle, v))
      .filter(Boolean)
      .sort((a, b) => a.median - b.median)[0];
    return {k, redux, plain, shared};
  });
  const max = Math.max(
    ...groups.flatMap(g => [g.redux?.median ?? 0, g.plain?.median ?? 0]),
  );
  const bar = (entry, cls, label) =>
    entry
      ? `<div class="barrow"><span class="blabel">${label}</span><span class="track"><span class="fill ${cls}" style="width:${((entry.median / max) * 100).toFixed(1)}%"></span></span><span class="num">${fmt(entry.median)}</span></div>`
      : '';
  return groups
    .map(
      g =>
        `<div class="group"><div class="gname">K=${g.k}</div><div>${bar(g.redux, 'redux', 'Redux')}${bar(g.plain, 'plain', 'use(store) today')}${bar(g.shared, 'shared', 'fastest shared')}</div></div>`,
    )
    .join('');
}

function speedupRange() {
  const ratios = [];
  for (const scenario of ['score', 'comment', 'mixed']) {
    for (const [suffix] of Ks) {
      for (const throttle of [1, 4]) {
        const redux = stat(scenario + suffix, throttle, 'redux');
        const shared = SHARING.map(v => stat(scenario + suffix, throttle, v))
          .filter(Boolean)
          .sort((a, b) => a.median - b.median)[0];
        if (redux && shared) ratios.push(redux.median / shared.median);
      }
    }
  }
  return [Math.min(...ratios), Math.max(...ratios)];
}
function plainRange() {
  const ratios = [];
  for (const scenario of ['score', 'comment', 'mixed']) {
    for (const throttle of [1, 4]) {
      const redux = stat(scenario + '-k50', throttle, 'redux');
      const plain = stat(scenario + '-k50', throttle, 'store');
      if (redux && plain) ratios.push(plain.median / redux.median);
    }
  }
  return [Math.min(...ratios), Math.max(...ratios)];
}
const [sharedLo, sharedHi] = speedupRange();
const [plainLo, plainHi] = plainRange();

// ---------------------------------------------------------------- html

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shared derived data with use(store)</title>
<style>
:root{--bg:#0f1115;--panel:#171a21;--panel2:#1e222b;--text:#e6e8ee;--muted:#9aa3b2;--accent:#58c4dc;--accent2:#a78bfa;--good:#4ade80;--bad:#f87171;--warn:#fbbf24;--border:#2a2f3a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:48px 24px 80px}
h1{font-size:36px;margin:0 0 8px;letter-spacing:-.02em}h2{font-size:24px;margin:52px 0 10px}h3{font-size:17px;margin:26px 0 8px}
.sub{color:var(--muted);margin:0 0 18px}.muted{color:var(--muted)}a{color:var(--accent)}
.lead{font-size:17px;line-height:1.65;max-width:840px}
code{font:13px ui-monospace,Menlo,monospace;background:var(--panel2);padding:1px 6px;border-radius:5px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:16px}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
@media(max-width:860px){.g2,.g3{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}td.r,th.r{text-align:right}
tr.share td:first-child{color:var(--accent)}tr.bad td{color:var(--muted);text-decoration:line-through}tr.ref td:first-child{color:var(--accent2)}
.callout{border-left:3px solid var(--accent);background:var(--panel);padding:14px 18px;border-radius:0 12px 12px 0;margin:0 0 16px}
.callout.warn{border-color:var(--warn)}.callout.bad{border-color:var(--bad)}
.kpi{text-align:center}.kpi .v{font-size:28px;font-weight:700;color:var(--accent)}.kpi .l{color:var(--muted);font-size:13px}
.code{background:#0b0d11;border:1px solid var(--border);border-radius:10px;padding:12px 0;margin:0 0 12px;overflow-x:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace;color:#d4d8e1}
.code .ln{display:block;padding:0 14px;white-space:pre}
.code .hl{background:rgba(88,196,220,.13);box-shadow:inset 3px 0 var(--accent)}
.code .hlbad{background:rgba(248,113,113,.10);box-shadow:inset 3px 0 var(--bad)}
.code .note{display:block;font:italic 11.5px -apple-system,sans-serif;color:var(--warn);padding:1px 0 3px}
.g2 .code{font-size:11.5px}
.tk{color:#c792ea}.ts{color:#c3e88d}.tc{color:#6b7385;font-style:italic}.tt{color:#82aaff}.tn{color:#f78c6c}.th{color:var(--accent);font-weight:600}
.codehead{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 6px}.codehead b{font-size:14px}.codehead span{color:var(--muted);font-size:12px}
.tag{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;margin-left:8px;vertical-align:2px}
.tag.ok{background:rgba(74,222,128,.15);color:var(--good)}.tag.no{background:rgba(248,113,113,.15);color:var(--bad)}.tag.maybe{background:rgba(251,191,36,.15);color:var(--warn)}.tag.rec{background:rgba(88,196,220,.18);color:var(--accent)}
.facts{display:grid;grid-template-columns:120px 1fr;gap:4px 14px;font-size:14px;margin:8px 0 12px}.facts dt{color:var(--muted)}.facts dd{margin:0}
.chart{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.group{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:center;margin:8px 0}.gname{color:var(--muted);font-size:13px}
.barrow{display:grid;grid-template-columns:120px 1fr 52px;gap:8px;align-items:center;margin:2px 0}.blabel{font-size:12px;color:var(--muted)}
.track{background:var(--panel2);border-radius:4px;height:10px;overflow:hidden}.fill{display:block;height:100%}
.fill.redux{background:var(--accent2)}.fill.plain{background:#4b5263}.fill.shared{background:var(--accent)}
.num{font:12px ui-monospace,Menlo,monospace;color:var(--muted);text-align:right}
.legend{color:var(--muted);font-size:13px;margin:6px 0 10px}
</style></head><body><div class="wrap">

<h1>Shared derived data with use(store)</h1>
<p class="sub">Options for sharing an expensive derivation between components, with code and measurements · React core · ${new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})}</p>

<p class="lead">use(store) has no selectors. Components read store values with <code>use()</code> and derive whatever they need in plain code, and the React Compiler memoizes those derivations. But the compiler memoizes <em>per component instance</em>. When K components derive the same expensive value from the same store values, they compute it K times. Redux's <code>createSelector</code> computes it once. This page covers the six ways to fix that, which ones are correct under concurrent rendering, and what each would cost in API.</p>

<div class="grid g3">
  <div class="card kpi"><div class="v">8 vs 8×K</div><div class="l">expensive derivations per update: Redux and every sharing option, vs today's use(store) with K readers per value</div></div>
  <div class="card kpi"><div class="v">${plainLo.toFixed(1)}–${plainHi.toFixed(1)}×</div><div class="l">today's use(store) vs Redux at K=50 readers per value (slower)</div></div>
  <div class="card kpi"><div class="v">${sharedLo.toFixed(1)}–${sharedHi.toFixed(1)}×</div><div class="l">faster than Redux with any correct sharing option, at K=5/20/50 and 1×/4× CPU</div></div>
</div>

<div class="callout"><strong>Short version.</strong> Store values are immutable snapshots, and every component in a render reads the same snapshot object. So a cache keyed on the <em>identity</em> of its arguments is correct under concurrency by construction: two renders at different points in time read different snapshots and use different keys. Options 3–6 all reach Redux's derivation count and beat it. The recommendation is a React-owned client <code>cache()</code> scoped to a render, with the compiler as an optional accelerator. Computing derived values in updates (option 2) is fast but <strong>tears under transitions</strong>, and no API for reading stores outside render fixes that.</div>

<h2>The problem</h2>
<p class="sub">From the Redux team's <code>derived-selectors</code> benchmark: 40 <code>CategoryStats</code> components show stats for 8 categories (5 per category). The derivation filters 500 posts and 1,000+ comments, about 15 µs per call.</p>

<div class="grid g2">
<div>
<div class="codehead"><b>Redux: computed once per category</b><span>apps/redux.jsx</span></div>
${code.reduxSelector}
</div>
<div>
<div class="codehead"><b>use(store) today: computed once per component</b><span>apps/store.jsx</span></div>
${code.perInstance}
<div class="codehead"><b>The derivation (both)</b><span>derive.js</span></div>
${code.getCategoryStats}
</div>
</div>

<div class="card"><table>
<tr><th>Expensive derivations per update</th><th class="r">K=5</th><th class="r">K=20</th><th class="r">K=50</th></tr>
<tr><td>Redux <code>createSelector</code></td><td class="r">8</td><td class="r">8</td><td class="r">8</td></tr>
<tr><td>use(store) + compiler today (per instance)</td><td class="r">40</td><td class="r">160</td><td class="r">400</td></tr>
<tr><td>Every sharing option below (3–6)</td><td class="r">8</td><td class="r">8</td><td class="r">8</td></tr>
</table><p class="muted" style="margin:8px 0 0">The category stats only, from the counting build. Score updates add 50 unshared per-user derivations to every variant.</p></div>

<h3>Measured at 1× CPU (median ms per update)</h3>
<div class="legend">Purple: Redux. Grey: use(store) today. Blue: the fastest correct sharing option.</div>
<div class="grid g2">
<div class="chart"><div class="muted" style="font-size:13px;margin-bottom:6px">score updates</div>${chart('score', 1)}</div>
<div class="chart"><div class="muted" style="font-size:13px;margin-bottom:6px">comment updates</div>${chart('comment', 1)}</div>
</div>

<h2>The constraint: correctness under concurrency</h2>
<p class="lead">Any answer has to stay consistent while React renders a transition in the background and commits urgent updates over it. Two facts make sharing safe:</p>
<div class="grid g2">
<div class="card"><h3 style="margin-top:0">Snapshots are immutable</h3><p>Every <code>store.update()</code> produces a new value. A derivation keyed on the identity of its inputs can never return a result computed from different data.</p></div>
<div class="card"><h3 style="margin-top:0">One cut per render</h3><p>Every component in a render reads every store at the same point (lanes plus a global update sequence number), and gets the <em>same snapshot object</em>. So all K readers in a render hit the same cache entry, and a concurrent render at a different cut uses different keys.</p></div>
</div>
<p>That holds for any derivation that runs <strong>during render</strong>, from values read with <code>use()</code>. It doesn't hold for a derivation that runs outside render.</p>

<h2>The options</h2>

<h3>1 · Per-instance derivation <span class="tag ok">correct</span><span class="tag no">K× work</span></h3>
<p>What you get today with no extra code. Shown above.</p>
<dl class="facts"><dt>Correctness</dt><dd>Trivially correct.</dd><dt>Memory</dt><dd>Compiler cache slots, freed on unmount.</dd><dt>API</dt><dd>None.</dd><dt>Cost</dt><dd>Grows with K × derivation cost. ${plainLo.toFixed(1)}–${plainHi.toFixed(1)}× slower than Redux at K=50.</dd></dl>

<h3>2 · Compute in the update <span class="tag no">tears</span></h3>
<p>Compute the derived value once in the action, and keep it in its own store. It's the fastest variant, which is why it's tempting.</p>
<div class="codehead"><b>The actions</b><span>apps/store-derived.jsx</span></div>
${code.computeInUpdate}
<div class="callout bad"><strong>It tears.</strong> The derivation runs on the latest values, including a transition that hasn't committed. When an urgent update commits while a transition is pending, the derived value includes the transition's data but the rest of the UI doesn't. This test, now in <code>ReactUseStore-test.js</code>, passes on the current build, so the tear is real:</div>
${code.tearTest}
<dl class="facts"><dt>Correctness</dt><dd>Wrong under transitions. Fixing it means putting the sources and the derived value in one store with one reducer, which gives up granularity.</dd><dt>Ergonomics</dt><dd>A mutable copy of the latest values in userland, and a second <code>update</code> in every action that touches a source. A read-outside-render API would remove the copy, but not the tear.</dd></dl>

<h3>3 · Userland shared memo <span class="tag ok">correct</span><span class="tag maybe">works today</span></h3>
<p>Wrap the derivation in a memo keyed on argument identity, at module scope. It works today with reselect's <code>weakMapMemoize</code>; no <code>createSelector</code> needed.</p>
<div class="grid g2">
<div>
<div class="codehead"><b>Usage</b><span>apps/store-memo.jsx</span></div>
${code.weakMemoUse}
</div>
<div>
<div class="codehead"><b>The memo</b><span>shared-memo.js</span></div>
${code.weakMemoImpl}
</div>
</div>
<dl class="facts"><dt>Correctness</dt><dd>Correct by construction (identity keys).</dd><dt>Memory</dt><dd>Fine when the snapshots are object arguments: entries die with them. <strong>Leaks</strong> when a long-lived object is followed by a changing primitive (<code>search(LIST, query)</code>) or for primitive-only calls (1.6 MB per 10k values). reselect warns about this in dev.</dd><dt>API</dt><dd>None in React. Users have to know to do it.</dd><dt>Risks</dt><dd>The cache is module-global (shared across roots, tests and SSR requests). An impure function (one that reads a locale or <code>Date.now()</code>) returns stale results to newly mounted components. One result object is shared by every reader.</dd></dl>

<h3>4 · A React-provided client <code>cache()</code> <span class="tag ok">correct</span><span class="tag rec">recommended</span></h3>
<p>React exports <code>cache()</code>, but only the server version shipped, and it's scoped to a request. Client caching was removed in 2024 because its lifetime was undecided (#27977). <code>disableClientCache</code> is on everywhere, and the <code>&lt;Cache&gt;</code> element was removed too (#28698). The proposal here doesn't revive that design. It's a render-scoped root from a new dispatcher method (<code>getRenderCache()</code>, reset in <code>prepareFreshStack</code>), with no <code>&lt;Cache&gt;</code> boundary, <code>CacheContext</code>, <code>getCacheForType</code> or refcounting. That gives one rule for both server and client: <em>cache() dedupes calls within a render</em>. It's close to the "render's contextual cache" in Seb's "Cache without Signals" (reactwg #72), and derived data from stores is the "CPU based memoization" use case from "Global Memo === Cache" (#53).</p>
<div class="grid g2">
<div>
<div class="codehead"><b>What users would write (proposal)</b><span>not implemented</span></div>
${code.cacheProposal}
</div>
<div>
<div class="codehead"><b>The userland stand-in that was measured</b><span>apps/store-cache-render.jsx</span></div>
${code.cacheStandIn}
</div>
</div>
<div class="card"><table>
<tr><th>Lifetime</th><th>Memory</th><th>Hits across renders</th><th>Notes</th></tr>
<tr><td><strong>Scoped to a render</strong></td><td>Bounded by one render's entries, for any argument types</td><td>No (the compiler's per-instance slots cover re-renders of one component)</td><td>Can't return a result computed before this render, so no staleness for impure functions</td></tr>
<tr><td>Two generations (this render + last commit)</td><td>Bounded by two renders</td><td>From the last commit</td><td>The fallback if components that mount later recompute too much</td></tr>
<tr><td>Per <code>Cache</code> boundary (the removed client design; vestigial code behind <code>disableClientCache</code>)</td><td>Leaks for primitive and long-lived-object paths until refresh</td><td>Yes</td><td>Needs <code>CacheContext</code>, refcounting and refresh. Not recommended.</td></tr>
</table></div>
<dl class="facts"><dt>Correctness</dt><dd>Correct, and per root.</dd><dt>API</dt><dd>No new export, but it defines the client lifetime that was left open when client caching was removed. It's about 20–40 lines across the work loop, the async dispatcher and Fizz, where a per-request map replaces <code>getCacheForType</code>, which throws there today.</dd><dt>"No selectors"</dt><dd>Fits: it memoizes a plain function of values read with <code>use()</code>. Readers still subscribe to the source stores. There's no equality function or subscription.</dd></dl>

<h3>5 · Compiler-emitted sharing <span class="tag ok">correct</span><span class="tag maybe">needs a heuristic</span></h3>
<p>The compiler already memoizes the call per instance, which already assumes the function is pure. The change: keep the per-instance check, and go to a shared cache only when this instance's inputs changed. Hand-edited compiler output, measured:</p>
<div class="codehead"><b>Compiled CategoryStats with a shared call</b><span>apps/store-compiled-shared.jsx</span></div>
${code.compiled}
<p><strong>Which calls qualify.</strong> The compiler already knows most of what it needs:</p>
<ul>
<li>the callee is a module-scope or imported function;</li>
<li>every argument is frozen (<code>use()</code> results, props) or primitive;</li>
<li>the result isn't mutated after the call;</li>
<li>at least one argument is a reactive object.</li>
</ul>
<p><strong>The catch: the compiler can't see cost or sharing.</strong> A lookup costs 30–80 ns. That's noise against a 15 µs derivation, but it adds up across cheap calls. Routing <em>unshared</em> calls through the cache costs about 7% at steady state on this benchmark. A default-on pass needs an opt-in (a <code>cache()</code>-wrapped callee) or an adaptive runtime that turns off call sites that never hit:</p>
${code.adaptive}

<h3>6 · Derived stores <span class="tag ok">correct</span><span class="tag no">not for v1</span></h3>
<p>A store computed from other stores, lazily, once per root per render.</p>
<div class="grid g2">
<div>
<div class="codehead"><b>Possible API (proposal)</b><span>not implemented</span></div>
${code.derivedStoreProposal}
</div>
<div>
<div class="codehead"><b>The userland stand-in that was measured</b><span>apps/store-derived-lazy.jsx</span></div>
${code.derivedStoreStandIn}
</div>
</div>
<dl class="facts"><dt>Correctness</dt><dd>Correct if it derives during render at the render's cut, unlike option 2.</dd><dt>Problem</dt><dd>No render-time parameter. <code>getCategoryStats(posts, comments, category)</code> becomes "derive every category", or a family of stores keyed by parameter, which brings back the cache-lifetime questions of option 4.</dd><dt>API</dt><dd>The most of any option: a new store kind, dependency scheduling in dispatch, and DevTools support. And it reads as a selector in a store's clothes.</dd></dl>

<h2>Side by side</h2>
<div class="card"><table>
<tr><th>Option</th><th>Correct under concurrency</th><th>Derivations</th><th>Memory</th><th>API in React</th><th>What users write</th></tr>
<tr><td>1 · per instance</td><td>yes</td><td>8×K</td><td>bounded</td><td>none</td><td>nothing</td></tr>
<tr><td>2 · compute in update</td><td><strong style="color:var(--bad)">no</strong></td><td>8</td><td>one value</td><td>none</td><td>a mirror + extra updates</td></tr>
<tr><td>3 · userland memo</td><td>yes</td><td>8</td><td>leak cases</td><td>none</td><td><code>weakMemo(fn)</code></td></tr>
<tr><td>4 · client <code>cache()</code></td><td>yes</td><td>8</td><td>bounded (render-scoped)</td><td>new client semantics</td><td><code>cache(fn)</code></td></tr>
<tr><td>5 · compiler-emitted</td><td>yes</td><td>8</td><td>depends on runtime</td><td>compiler pass + runtime</td><td>nothing</td></tr>
<tr><td>6 · derived stores</td><td>yes</td><td>8 (all keys)</td><td>bounded</td><td>new store kind</td><td><code>createStore(sources, fn)</code></td></tr>
</table></div>

<h2>All measurements</h2>
<p class="sub">Median ms per update, compiler on, with the ratio to Redux. K = readers per category. Final build, three load-gated restarts per configuration.</p>
<div class="grid g2">
<div><h3>score updates · 1× CPU</h3><div class="card">${timingTable('score', 1)}</div></div>
<div><h3>comment updates · 1× CPU</h3><div class="card">${timingTable('comment', 1)}</div></div>
<div><h3>mixed updates · 1× CPU</h3><div class="card">${timingTable('mixed', 1)}</div></div>
<div><h3>mixed updates · 4× CPU</h3><div class="card">${timingTable('mixed', 4)}</div></div>
</div>
<p class="muted">The compiler-emitted variant was timed with 30 warm-up updates, so its <em>mixed</em> numbers include JIT warm-up of the cache path. At steady state it's about 7% slower than the userland memo there, because unshared calls go through the cache. Option 2 is struck through because it isn't correct.</p>

<h2>Recommendation</h2>
<div class="callout">
<ol style="margin:0;padding-left:20px">
<li><strong>Drop "compute in the update" as a pattern.</strong> It tears, and no API fixes that.</li>
<li><strong>Make sharing a React-owned client <code>cache()</code>, scoped to a render.</strong>
  <ul>
  <li>It's correct per root and bounded in memory for any arguments.</li>
  <li>It can't go stale for new mounts, and it matches the server's per-request semantics.</li>
  <li>It adds no new concept to the store API.</li>
  </ul>
  Two generations are the fallback.</li>
<li><strong>Use the compiler as the accelerator, not the decider.</strong> Keep its per-instance check in front of <code>cache()</code>. Prototype an automatic, adaptive pass behind a flag and measure it on a real app.</li>
<li><strong>No derived stores in v1.</strong></li>
</ol>
</div>
<h3>Decisions</h3>
<ul>
<li>Is cross-component sharing React's job (a client <code>cache()</code>) or userland's (document <code>weakMapMemoize</code>)? Userland performs the same today.</li>
<li>If it's React's job, which lifetime, and is reusing the name <code>cache</code> with a client lifetime acceptable? It also needs a Fizz implementation.</li>
<li>Fund the compiler experiment, and on which app?</li>
<li>Close the door on derived stores for v1?</li>
</ul>

<p class="muted" style="margin-top:40px">Sources:</p>
<ul class="muted">
<li>Analysis: <code>docs/use-store/research/shared-derived-data.md</code>.</li>
<li>Variants: <code>fixtures/store-bench/src/redux-suite/derived-selectors/apps/</code>.</li>
<li>Concurrency, memory and lookup-cost scripts: <code>fixtures/store-bench/spike-shared-derived/</code>.</li>
<li>Measurements: <code>fixtures/store-bench/results/smoke-spike-final-*.json</code> (${files.length} result files).</li>
<li>Generated by <code>fixtures/store-bench/derived-explainer.mjs</code>.</li>
</ul>
</div></body></html>`;

fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(repo, out)} from ${files.length} result files`);
