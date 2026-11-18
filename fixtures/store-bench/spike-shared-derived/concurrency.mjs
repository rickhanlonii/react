// Checks that a shared derivation cache is correct when renders at different
// cuts are in flight: a transition is interrupted by a sync update, then
// restarts. Uses the frozen React build (react-builds/baseline) in jsdom, with
// the mock scheduler so the transition can be paused mid-render.
//
//   node spike-shared-derived/concurrency.mjs
//
// Part of the shared-derived-data spike
// (docs/use-store/research/shared-derived-data.md).

import {createRequire} from 'module';
import Module from 'module';
import path from 'path';
import {fileURLToPath} from 'url';
import {JSDOM} from 'jsdom';
import {
  weakMemo,
  generationalMemo,
  nextGeneration,
} from '../src/redux-suite/derived-selectors/shared-memo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = path.resolve(here, '../react-builds/baseline');
const require = createRequire(import.meta.url);

// Everything resolves to the baseline build, and react-dom gets the mock
// scheduler.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'scheduler') {
    return path.join(baseline, 'scheduler/unstable_mock.js');
  }
  if (request === 'react' || request === 'react-dom') {
    return path.join(baseline, request, 'index.js');
  }
  return resolve.call(this, request, ...rest);
};

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const React = require(path.join(baseline, 'react'));
const ReactDOM = require(path.join(baseline, 'react-dom'));
const ReactDOMClient = require(path.join(baseline, 'react-dom/client'));
const Scheduler = require(path.join(baseline, 'scheduler/unstable_mock.js'));
const {use, useLayoutEffect, startTransition, createElement: h} = React;
const createStore = React.unstable_createStore;

const CATEGORIES = ['a', 'b', 'c', 'd'];
const K = 3;

function seed() {
  const posts = [];
  for (let i = 0; i < 40; i++) {
    posts.push({id: i, score: i * 7 % 101, category: CATEGORIES[i % 4]});
  }
  const comments = [];
  for (let i = 0; i < 80; i++) {
    comments.push({id: i, postId: (i * 13) % 40});
  }
  return {posts, comments};
}

let derivations = 0;
function getCategoryStats(posts, comments, category) {
  derivations++;
  const catPosts = posts.filter(p => p.category === category);
  const ids = new Set(catPosts.map(p => p.id));
  return {
    postCount: catPosts.length,
    commentCount: comments.filter(c => ids.has(c.postId)).length,
    total: catPosts.reduce((sum, p) => sum + p.score, 0),
  };
}

function format(category, stats) {
  return `${category}:${stats.postCount}:${stats.commentCount}:${stats.total}`;
}

function expected(posts, comments) {
  const saved = derivations;
  const text = [];
  for (const category of CATEGORIES) {
    for (let i = 0; i < K; i++) {
      text.push(format(category, getCategoryStats(posts, comments, category)));
    }
  }
  derivations = saved;
  return text.join('|');
}

// React schedules root work in a microtask.
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function run(name, memo, rotate) {
  derivations = 0;
  const data = seed();
  const postsStore = createStore(data.posts);
  const commentsStore = createStore(data.comments);
  const shared = memo(getCategoryStats);

  function CategoryStats({category}) {
    const stats = shared(use(postsStore), use(commentsStore), category);
    Scheduler.log(category);
    return h('p', null, format(category, stats));
  }
  function Generation() {
    use(postsStore);
    use(commentsStore);
    useLayoutEffect(() => {
      if (rotate) {
        rotate();
      }
    });
    return null;
  }
  function App() {
    const children = [];
    for (const category of CATEGORIES) {
      for (let i = 0; i < K; i++) {
        children.push(h(CategoryStats, {key: category + i, category}));
      }
    }
    children.push(h(Generation, {key: 'g'}));
    return h('div', null, children);
  }

  const container = document.createElement('div');
  const root = ReactDOMClient.createRoot(container);
  const text = () =>
    [...container.querySelectorAll('p')].map(p => p.textContent).join('|');
  const results = [];
  function check(label, posts, comments, expectedDerivations) {
    const ok = text() === expected(posts, comments);
    const countOk =
      expectedDerivations === undefined || derivations === expectedDerivations;
    results.push({label, ok, derivations, countOk});
    if (!ok || !countOk) {
      process.exitCode = 1;
    }
  }

  ReactDOM.flushSync(() => root.render(h(App)));
  Scheduler.unstable_clearLog();
  const posts0 = data.posts;
  const comments0 = data.comments;
  check('mount', posts0, comments0, CATEGORIES.length);

  // A transition changes a score in category a. Render 4 of the 12 readers
  // (3 of a, 1 of b) at the transition's cut, then stop.
  let posts1;
  startTransition(() => {
    postsStore.update(prev => {
      posts1 = prev.slice();
      posts1[0] = {...prev[0], score: 1000};
      return posts1;
    });
  });
  await tick();
  Scheduler.unstable_flushNumberOfYields(4);
  const partial = Scheduler.unstable_clearLog().length;
  results.push({
    label: `transition paused after ${partial} readers (DOM still committed)`,
    ok: text() === expected(posts0, comments0),
    derivations,
    countOk: derivations === CATEGORIES.length + 2,
  });

  // A sync update to comments interrupts it. This render's cut has the new
  // comments but not the transition's posts.
  let comments1;
  ReactDOM.flushSync(() => {
    commentsStore.update(prev => {
      comments1 = [...prev, {id: 999, postId: 1}];
      return comments1;
    });
  });
  Scheduler.unstable_clearLog();
  check(
    'sync update commits over the paused transition',
    posts0,
    comments1,
    CATEGORIES.length * 2 + 2,
  );

  // The transition restarts at a cut with both updates.
  await tick();
  Scheduler.unstable_flushAllWithoutAsserting();
  Scheduler.unstable_clearLog();
  const posts1Rendered = posts1;
  check(
    'transition restarts and commits',
    posts1Rendered,
    comments1,
    CATEGORIES.length * 3 + 2,
  );

  // The entries for the interrupted render's cut are still keyed by its
  // snapshots, so nothing that read another cut could have seen them.
  const before = derivations;
  shared(posts1, comments0, 'a');
  const reused = derivations === before;
  results.push({
    label: 'is the interrupted cut (posts1, comments0) still cached?',
    ok: true,
    derivations: reused ? 'hit' : 'miss',
    countOk: true,
  });

  ReactDOM.flushSync(() => root.unmount());
  console.log(`\n${name}`);
  for (const r of results) {
    console.log(
      `  ${r.ok && r.countOk ? 'ok  ' : 'FAIL'} ${r.label} (derivations: ${r.derivations})`,
    );
  }
}

// Two roots reading the same stores, updated with an updater function: each
// root's record computes its own snapshot, so they share cache entries only
// when the snapshots are the same object.
function twoRoots(updateWith) {
  derivations = 0;
  const data = seed();
  const postsStore = createStore(data.posts);
  const commentsStore = createStore(data.comments);
  const shared = weakMemo(getCategoryStats);
  function CategoryStats({category}) {
    const stats = shared(use(postsStore), use(commentsStore), category);
    return h('p', null, format(category, stats));
  }
  function App() {
    return h(
      'div',
      null,
      CATEGORIES.map(c => h(CategoryStats, {key: c, category: c})),
    );
  }
  const roots = [0, 1].map(() => {
    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    ReactDOM.flushSync(() => root.render(h(App)));
    return {root, container};
  });
  const mount = derivations;
  const next = data.posts.slice();
  next[0] = {...next[0], score: 1000};
  ReactDOM.flushSync(() =>
    postsStore.update(updateWith === 'value' ? next : () => next.slice()),
  );
  const same =
    roots[0].container.innerHTML === roots[1].container.innerHTML &&
    roots[0].container.textContent.length > 0;
  console.log(
    `  ${same ? 'ok  ' : 'FAIL'} two roots, update with ${updateWith}: ` +
      `${mount} derivations to mount, ${derivations - mount} for the update ` +
      `(${CATEGORIES.length} categories)`,
  );
  for (const {root} of roots) {
    ReactDOM.flushSync(() => root.unmount());
  }
}

// For comparison, option 2 (store-derived.jsx): the stats are computed in the
// action, from a userland mirror of the latest values, and kept in their own
// store. The same interleaving: a transition updates posts, then a sync update
// to comments commits before it.
async function computedInTheUpdate() {
  const data = seed();
  const latest = {posts: data.posts, comments: data.comments};
  const all = (posts, comments) =>
    CATEGORIES.map(c => getCategoryStats(posts, comments, c));
  const postsStore = createStore(data.posts);
  const commentsStore = createStore(data.comments);
  const statsStore = createStore(all(data.posts, data.comments));
  function Posts() {
    // A reader of posts, like PostCard.
    return h('p', null, 'score:' + use(postsStore)[0].score);
  }
  function CategoryStats({index}) {
    return h('p', null, format(CATEGORIES[index], use(statsStore)[index]));
  }
  function App() {
    return h('div', null, [
      h(Posts, {key: 'p'}),
      ...CATEGORIES.map((c, i) => h(CategoryStats, {key: c, index: i})),
    ]);
  }
  const container = document.createElement('div');
  const root = ReactDOMClient.createRoot(container);
  ReactDOM.flushSync(() => root.render(h(App)));
  startTransition(() => {
    latest.posts = latest.posts.slice();
    latest.posts[0] = {...latest.posts[0], score: 1000};
    postsStore.update(latest.posts);
    statsStore.update(all(latest.posts, latest.comments));
  });
  await tick();
  ReactDOM.flushSync(() => {
    latest.comments = [...latest.comments, {id: 999, postId: 0}];
    commentsStore.update(latest.comments);
    statsStore.update(all(latest.posts, latest.comments));
  });
  // What this commit shows: posts without the transition, and stats computed
  // from the transition's posts.
  const shown = [...container.querySelectorAll('p')].map(p => p.textContent);
  const consistent = all(data.posts, latest.comments).map((s, i) =>
    format(CATEGORIES[i], s),
  );
  const torn = shown[0] === 'score:0' && shown[1] !== consistent[0];
  console.log('\nstore-derived (option 2, computed in the update)');
  console.log(
    `  ${torn ? 'TORN' : 'ok  '} the sync commit shows ${shown[0]} ` +
      `(transition not rendered) next to ${shown[1]} ` +
      `(consistent with that: ${consistent[0]})`,
  );
  Scheduler.unstable_flushAllWithoutAsserting();
  ReactDOM.flushSync(() => root.unmount());
}

await run('weakMemo (option 3, and React cache() keyed by identity)', weakMemo);
await run(
  'generationalMemo (option 4, two generations, rotated at commit)',
  generationalMemo,
  nextGeneration,
);
await run(
  'generationalMemo(fn, 1) (option 4, scoped to a render, cleared at commit)',
  fn => generationalMemo(fn, 1),
  nextGeneration,
);
console.log('\nweakMemo across roots');
twoRoots('value');
twoRoots('an updater function');
await computedInTheUpdate();
