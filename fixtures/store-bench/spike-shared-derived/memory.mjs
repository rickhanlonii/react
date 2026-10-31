// What each shared-cache lifetime retains after many updates. Simulates the
// derived-selectors data: every update replaces the posts snapshot (and every
// fourth, the comments snapshot), and 8 categories x 5 readers call the cached
// derivation. Reports the heap growth after GC and how many old posts
// snapshots are still alive (sampled every 10th).
//
//   node --expose-gc spike-shared-derived/memory.mjs
//
// Part of the shared-derived-data spike
// (docs/use-store/research/shared-derived-data.md).

import {weakMapMemoize} from 'reselect';
import {
  weakMemo,
  sharedCall,
  generationalMemo,
  nextGeneration,
} from '../src/redux-suite/derived-selectors/shared-memo.js';

// The same shape and size as the suite's seed data (data.js, which Node can't
// import directly because of its extensionless imports).
const CATEGORIES = 'tech science sports politics entertainment business health education'.split(' ');
function createSeedData() {
  const posts = Array.from({length: 500}, (_, i) => ({
    id: i,
    userId: (i * 37) % 100,
    title: `Post ${i}`,
    score: (i * 53) % 101,
    category: CATEGORIES[(i * 7) % CATEGORIES.length],
  }));
  const comments = Array.from({length: 1000}, (_, i) => ({
    id: i,
    postId: (i * 31) % 500,
    userId: (i * 17) % 100,
    text: `Comment ${i}`,
  }));
  return {posts, comments};
}

if (typeof gc !== 'function') {
  throw new Error('Run with node --expose-gc');
}

const UPDATES = 10000;
const READERS = 5;

function getCategoryStats(posts, comments, category) {
  const catPosts = posts.filter(p => p.category === category);
  const postIds = new Set(catPosts.map(p => p.id));
  const commentCount = comments.filter(c => postIds.has(c.postId)).length;
  const avgScore =
    catPosts.length > 0
      ? catPosts.reduce((sum, p) => sum + p.score, 0) / catPosts.length
      : 0;
  return {postCount: catPosts.length, avgScore, commentCount};
}

// A derivation of a long-lived object and a primitive that changes every
// update, like filtering a constant list by the text in an input.
const LIST = createSeedData().posts;
function search(list, query) {
  return list.filter(p => p.title.includes(query)).length;
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function measure(name, setup) {
  gc();
  await tick();
  gc();
  const before = process.memoryUsage().heapUsed;
  // A weak reference to every 10th posts snapshot.
  const refs = [];
  const {call, onUpdate} = setup();
  let {posts, comments} = createSeedData();
  for (let i = 0; i < UPDATES; i++) {
    posts = posts.slice();
    posts[i % posts.length] = {...posts[i % posts.length], score: i % 101};
    if (i % 10 === 0) {
      refs.push(new WeakRef(posts));
    }
    if (i % 4 === 0) {
      comments = [...comments, {id: 1000 + i, postId: i % 500, userId: 0}];
    }
    for (const category of CATEGORIES) {
      for (let r = 0; r < READERS; r++) {
        call(posts, comments, category, i);
      }
    }
    onUpdate?.();
  }
  for (let i = 0; i < 3; i++) {
    gc();
    await tick();
  }
  const after = process.memoryUsage().heapUsed;
  // Keep the cache alive until after the measurement.
  call(posts, comments, CATEGORIES[0], 0);
  console.log(
    name.padEnd(58),
    `${((after - before) / 1024 / 1024).toFixed(1)} MB`.padStart(9),
    `${refs.filter(ref => ref.deref() !== undefined).length * 10}`.padStart(8),
  );
}

console.log(
  `After ${UPDATES} updates:`.padEnd(58),
  'heap'.padStart(9),
  'posts'.padStart(8),
);

await measure('no cache (per-instance, for reference)', () => ({
  call: (p, c, cat) => getCategoryStats(p, c, cat),
}));

await measure('weakMemo(posts, comments, category)', () => {
  const memo = weakMemo(getCategoryStats);
  return {call: (p, c, cat) => memo(p, c, cat)};
});

await measure('weakMemo(category, posts, comments), primitive first', () => {
  const memo = weakMemo((cat, p, c) => getCategoryStats(p, c, cat));
  return {call: (p, c, cat) => memo(cat, p, c)};
});

await measure('sharedCall(fn, posts, comments, category)', () => ({
  call: (p, c, cat) => sharedCall(getCategoryStats, p, c, cat),
}));

await measure('reselect weakMapMemoize(posts, comments, category)', () => {
  const memo = weakMapMemoize(getCategoryStats);
  return {call: (p, c, cat) => memo(p, c, cat)};
});

await measure('generationalMemo, new generation per update', () => {
  const memo = generationalMemo(getCategoryStats);
  return {call: (p, c, cat) => memo(p, c, cat), onUpdate: nextGeneration};
});

await measure('generationalMemo(fn, 1), scoped to a render', () => {
  const memo = generationalMemo(getCategoryStats, 1);
  return {call: (p, c, cat) => memo(p, c, cat), onUpdate: nextGeneration};
});

await measure('strong Map trie, never evicted', () => {
  // generationalMemo without new generations is a plain strong cache.
  const memo = generationalMemo(getCategoryStats);
  return {call: (p, c, cat) => memo(p, c, cat)};
});

console.log('\nA long-lived object and a new primitive every update:');

await measure('weakMemo(LIST, query)', () => {
  const memo = weakMemo(search);
  return {call: (p, c, cat, i) => memo(LIST, 'Post ' + i)};
});

await measure('reselect weakMapMemoize(LIST, query)', () => {
  const memo = weakMapMemoize(search);
  return {call: (p, c, cat, i) => memo(LIST, 'Post ' + i)};
});

await measure('generationalMemo(LIST, query), new generation per update', () => {
  const memo = generationalMemo(search);
  return {
    call: (p, c, cat, i) => memo(LIST, 'Post ' + i),
    onUpdate: nextGeneration,
  };
});
