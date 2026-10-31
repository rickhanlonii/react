# use(store) status

Last updated 2026-10-30.

## Goal

Every test file that uses state has a passing copy that uses `use(store)`.

## Parity

`node scripts/store-parity/check.js` → **138/138 files done. 3230 cases copied, 21 skipped, 0 missing (of 3251).**

The 21 skips (`scripts/store-parity/skips/*.json`), each with a note:

- 8 `hook-only-semantics`, `reconciler-hooks.json`:
  - 6 reducers that close over render-time values;
  - Hooks inside a lazy initializer;
  - "Too many re-renders".
- 4 `hook-only-semantics`, `dom-server.json`: the server-integration versions of those same cases.
- 1 `hook-only-semantics`, `react-pkg.json`: the StrictMode lazy initializer.
- 3 `not-applicable`, `react-pkg.json`: DevTools hook editing.
- 5 `not-applicable`, `devtools.json`: DevTools hook editing.

Store values aren't editable from DevTools in v1.

## Context parity

Every test case that reads React context has a copy that reads a store instead, or a skip that says why a store can't replace context there (see "Context copies" in `COPY_RULES.md`).

`node scripts/store-parity/check.js --context` → **52/52 files done (7 excluded). 105 cases copied, 82 skipped, 0 missing (of 187).** In addition, 26 runs of `ReactNewContext`'s parametrized suite (the two class-reader runs) are left out.

- The 82 skips (`scripts/store-parity/skips/context-*.json`):
  - 52 `context-only-api`;
  - 14 `class-reader`;
  - 10 `no-subtree-scoping`;
  - 3 `not-context` (checker false positives);
  - 1 each of `server-component`, `server-subtree-value` and `no-client-apis`.
- Blockers found by the context copies:
  - B-18 (fixed, DCP-16): a reader that suspends on mount never subscribes;
  - B-19 (fixed): Flight's generic error for a client reference to a store;
  - B-20 (fixed in source, build-level DevTools run pending a rebuild): DevTools crashed on a dropped conditional store read and paired store reads by position.

## Test runs

- **Store copies and spec suites (121 suites):**
  - experimental: 3282 passed, 19 skipped;
  - stable: 3265 passed, 19 skipped;
  - www-modern variant=true: 3282 passed, 19 skipped;
  - www-modern variant=false: 3282 passed, 19 skipped.
- **DevTools (`--build --project devtools -r=experimental`), copies and originals:** 58 suites, 859 passed, 41 skipped. Run against a local experimental build.
- **ESLint plugin (`packages/eslint-plugin-react-hooks`, its own jest):** 5161 passed. This needs a fresh compiler `dist` (`yarn workspace babel-plugin-react-compiler build`).
- **Flow:** dom-node, fabric, dom-fb, test, noop, custom, dom-browser and markup all pass.
- **Lint and format:** ESLint and Prettier are clean on every changed and new file.
- **Known unrelated failures on Node 25:** `ReactFlightAsyncDebugInfo-test` and `ReactFlightDOMEdge-test` (B-2).

## Spec suites

- `packages/react-reconciler/src/__tests__/ReactUseStore-test.js` (40 tests): rebasing, joining in-flight transitions, interleaving, entanglement, conditional reads and loops, stores of stores, Activity, Suspense, multiple roots, StrictMode, async actions, render-phase warnings, reducer errors, and reducer call counts.
- `packages/react-dom/src/__tests__/ReactDOMStore-test.js`: hydration with the initial value, server rendering, controlled inputs, and catch-up inside newly inserted parents.

## Open follow-ups (not blocking)

See the end of `DECISIONS.md`:

- DevTools store editing.
- DevTools hook names for `use(...)`.
- Profiler updater attribution for stores.
- The fixture regeneration script must learn about `indexUseStore.js` before landing.
- Optimistic stores, external-source interop and observables, from the original plan.
