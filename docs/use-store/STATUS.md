# use(store) status

Last updated 2026-10-31.

## Tests

The overnight copy campaign gave every test file that uses state (or reads context) a `…UseStore` copy, with parity checked by title. On 2026-10-31 the copies were cleaned up (plan: `~/.claude/plans/vivid-squishing-river.md`): parity by title is retired, and `scripts/store-parity/` and `COPY_RULES.md` are deleted. Its "Differences to expect" list is now "Intentional differences from useState" and "Differences from context" in `DESIGN.md`.

A case stays only if what it checks depends on store machinery: lane selection, rebasing and entanglement, subscriptions, Suspense and Activity, hydration, StrictMode, reducer errors, bailouts and context, DevTools, Fast Refresh, the compiler, Fizz and Flight. Where it lives:

- **Store spec suites:** `ReactUseStore-test.js`, `ReactDOMStore-test.js`, `ReactDebugHooksStore-test.js`, and their `…Staged-test.js` files waiting to be merged into them.
- **Base files:** a `describe('use(store)')` block, gated `enableStore`, when the case is about the base file's subject (event priority in `ReactInternalTestUtilsDOM-test.js`, transitions in `ReactExpiration-test.js`, and so on). Each case names the copy it came from.
- **Dedicated `…UseStore` files** for store-heavy subjects: ReactHooks, ReactHooksWithNoopRenderer, ReactTransition, ReactAsyncActions, ReactSuspense, ReactSuspenseWithNoopRenderer, ReactSuspenseFuzz, ReactContextPropagation, ReactNewContext, ReactDOMServerIntegrationHooks, and the same-element bailout pair (DCP-10, to go with that PR).
- **Legacy roots:** `ReactUseStoreLegacyMode-test.js` (react-reconciler, so it runs on xplat). Legacy mode is only on in the native-fb forks, where `enableStore` is now a dynamic flag (`__VARIANT__`), so the legacy store cases run on `-r=xplat --variant=true`.

The cleanup removed about 177,000 lines of copies. A before/after coverage comparison of `ReactFiberStore.js`, `ReactStore.js`, `getStoreHead.js`, the store lines of the other reconciler files, `ReactFizzHooks.js`, `ReactFlightHooks.js` and `ReactDebugHooks.js` (experimental, www-modern variant=true, xplat variant=true) lost no store line or branch.

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

- `packages/react-reconciler/src/__tests__/ReactUseStore-test.js` (78 tests): rebasing, joining in-flight transitions, interleaving, entanglement, conditional reads and loops, stores of stores, Activity, Suspense, multiple roots, StrictMode, async actions, render-phase warnings, reducer errors, and reducer call counts.
- `packages/react-dom/src/__tests__/ReactDOMStore-test.js`: hydration with the initial value, server rendering, controlled inputs, and catch-up inside newly inserted parents.

## Open follow-ups (not blocking)

See the end of `DECISIONS.md`:

- DevTools store editing.
- DevTools hook names for `use(...)`.
- Profiler updater attribution for stores.
- Optimistic stores, external-source interop and observables, from the original plan.
