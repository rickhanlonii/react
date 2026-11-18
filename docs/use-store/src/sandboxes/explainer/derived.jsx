import {use, unstable_createStore as createStore} from 'react';

// A cache shared by every component, keyed by the identity of the arguments,
// like weakMemo in the benchmarks. A new snapshot is a new key, and the old
// entries are collected with the old snapshot.
function weakMemo(fn) {
  const newNode = () => ({objects: new WeakMap(), primitives: new Map()});
  const root = newNode();
  return (...args) => {
    let node = root;
    for (const arg of args) {
      const map =
        typeof arg === 'object' && arg !== null
          ? node.objects
          : node.primitives;
      if (!map.has(arg)) map.set(arg, newNode());
      node = map.get(arg);
    }
    if (!('value' in node)) node.value = fn(...args);
    return node.value;
  };
}

const posts = createStore([
  {category: 'news', score: 4},
  {category: 'sports', score: 2},
]);

let runs = 0;
const getStats = weakMemo((posts, category) => {
  log('computed ' + category + ' (' + ++runs + ' so far)');
  const scores = posts.filter(p => p.category === category).map(p => p.score);
  return {count: scores.length, total: scores.reduce((a, b) => a + b, 0)};
});

function CategoryStats({category}) {
  const stats = getStats(use(posts), category);
  return (
    <li>
      {category}: {stats.count} {stats.count === 1 ? 'post' : 'posts'},{' '}
      {stats.total} points
    </li>
  );
}

export default function App() {
  return (
    <>
      <button
        onClick={() => posts.update(p => [...p, {category: 'news', score: 1}])}>
        Add a news post
      </button>
      <ul>
        {['news', 'news', 'news', 'sports', 'sports'].map((category, i) => (
          <CategoryStats key={i} category={category} />
        ))}
      </ul>
    </>
  );
}
