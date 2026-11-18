// Suites other than the default one, read by build.mjs, run.mjs and
// run-jsdom.mjs (--suite=<name>). The ported scenarios from
// reduxjs/react-redux-benchmarks have their own apps and scenarios, and a
// fixed data size (n: [0]). The others build extra variants from src/apps and
// run the default scenarios.

const redux = {name: 'redux', deps: ['@reduxjs/toolkit', 'react-redux', 'redux']};
const store = {name: 'store', deps: []};
const zustand = {name: 'zustand', deps: ['zustand']};

export const suites = {
  'derived-selectors': {
    n: [0],
    apps: 'src/redux-suite/derived-selectors/apps',
    // store-memo shares derived data across readers with a userland
    // weakMemo (shared-memo.js), the recommended pattern for selector-like
    // derived data.
    variants: [
      redux,
      store,
      {name: 'store-derived', deps: []},
      {name: 'store-memo', deps: []},
      zustand,
    ],
    scenarios: ['mixed', 'score', 'comment', 'role'],
  },
  // Ways to share derived data between use(store) readers, next to the
  // derived-selectors variants, with 5, 20 and 50 components per category.
  // See docs/use-store/research/shared-derived-data.md.
  'derived-selectors-spike': {
    n: [0],
    apps: 'src/redux-suite/derived-selectors/apps',
    variants: [
      redux,
      store,
      {name: 'store-derived', deps: []},
      zustand,
      {name: 'store-memo', deps: []},
      {name: 'store-reselect', deps: ['reselect']},
      {name: 'store-cache-gen', deps: []},
      {name: 'store-cache-render', deps: []},
      {name: 'store-derived-lazy', deps: []},
      {name: 'store-compiled', deps: []},
      {name: 'store-compiled-shared', deps: []},
      {name: 'store-compiled-shared-site', deps: []},
    ],
    scenarios: ['mixed', 'score', 'comment', 'role'].flatMap(name => [
      name,
      `${name}-k20`,
      `${name}-k50`,
    ]),
  },
  'rapid-dispatch': {
    n: [0],
    apps: 'src/redux-suite/rapid-dispatch/apps',
    variants: [redux, store, zustand],
    scenarios: ['mixed', 'syncBurst', 'thunkBurst', 'listenerCascade'],
  },
  'many-components-same-slice': {
    n: [0],
    apps: 'src/redux-suite/many-components-same-slice/apps',
    variants: [redux, store, zustand],
    scenarios: ['increment'],
  },
  'deeptree-nested-hooks': {
    n: [0],
    apps: 'src/redux-suite/deeptree-nested-hooks/apps',
    variants: [redux, store, zustand],
    scenarios: [
      'mixed',
      'incrementRandom',
      'appendRandomCharacter',
      'incrementFifth',
      'incrementThird',
      'appendMany',
    ],
  },
  // Controls for the redux variant: no RTK/Immer, and no auto-freeze.
  fairness: {
    apps: 'src/apps',
    variants: [
      redux,
      {name: 'redux-plain', deps: ['react-redux', 'redux', 'reselect']},
      {name: 'redux-nofreeze', deps: ['@reduxjs/toolkit', 'react-redux', 'immer']},
      store,
      zustand,
    ],
  },
  // useDeferredValue versions of redux and zustand, for run.mjs --typing.
  // There are no update scenarios: the deferred render doesn't happen inside
  // flushSync.
  typing: {
    apps: 'src/apps',
    variants: [
      store,
      redux,
      {name: 'redux-deferred', deps: ['@reduxjs/toolkit', 'react-redux']},
      zustand,
      {name: 'zustand-deferred', deps: ['zustand']},
    ],
    scenarios: [],
  },
  // Compiler coverage (100/90/75/50% of rows compiled, at 8 props) and row
  // width (4/8/16 props, fully compiled), from src/apps/sweep-*.jsx. The
  // c100-w8 build without the compiler is the 0% coverage point. The other
  // configurations are only built with the compiler: without it, c90/c75/c50
  // are the same app as c100, and the report doesn't use w4/w16 at 0%.
  sweeps: {
    apps: 'src/apps',
    variants: sweepVariants(),
    scenarios: ['entity', 'selection'],
  },
};

function sweepVariants() {
  const libraries = [
    {name: 'store', deps: []},
    // Selection through a weakMemo'd store per row (sweep-store-keyed.jsx).
    {name: 'store-keyed', deps: []},
    {name: 'redux', deps: ['@reduxjs/toolkit', 'react-redux']},
    {name: 'zustand', deps: ['zustand']},
  ];
  const configs = [
    [100, 8],
    [90, 8],
    [75, 8],
    [50, 8],
    [100, 4],
    [100, 16],
  ];
  const variants = [];
  for (const library of libraries) {
    for (const [coverage, width] of configs) {
      variants.push({
        name: `${library.name}-c${coverage}-w${width}`,
        entry: 'sweep-' + library.name,
        deps: library.deps,
        define: {__COVERAGE__: String(coverage), __WIDTH__: String(width)},
        compiled: coverage === 100 && width === 8 ? [false, true] : [true],
      });
    }
  }
  return variants;
}
