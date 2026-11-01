# use(store) PR readiness review (2026-11-01)

Review of `main...rh/use-store` (6 WIP commits, merge-base a703ca64f9), from `/code-review high` plus three reviewers (packaging, tests, integrations). I checked each item marked "verified" against the code myself.

## 1. Fix before opening the PR

1. ~~The StrictMode fix has no flag~~ **Reverted** (2026-11-01). It reversed the behavior decided in react/react#32315, so it was removed from the branch, not split out.
2. **The sibling fast path in `finishQueueingConcurrentUpdates` has no flag** (verified, ReactFiberConcurrentUpdates.js:84). It looks equivalent to the old code, but it runs for uSES forced re-renders and for hydration and Suspense retries. Gate it with `enableStore`, or split it out with a benchmark.
3. **`ReactSharedInternals.U` is overwritten by each renderer** (verified, ReactFiberStore.js:346, vs `S` chained in ReactFiberTransition.js:78). With react-dom plus react-art, held updates use the last-loaded renderer's lanes and async-action state. DCP-18 lists it as a limit, but every reviewer flagged it. Chain it like `S`, or keep the held state on the store. Add a two-renderer test. DESIGN.md:67 overstates multi-renderer support until this is fixed.
4. **The DevTools Profiler can name the wrong hook** (verified). `getChangedHooksIndices` reports leaf positions, while `HookChangeSummary.shouldKeepHook` matches `hook.id`, and Store nodes have id null. `[use(store), useState]` with the store changing shows "State changed". Main mixes positions and ids too, but Context never "changes", so stores are the first thing that exposes it. Report ids, or give Store nodes an id.
5. **A reducer error during hydration skips the server value** (verified, ReactFiberHooks.js:1231 vs 1249). `readStoreState` throws before the hydrating branch swaps in `store._initial`. Move the hydration check first, then throw on the post-hydration render.
6. **Stale comment** at ReactInternalTypes.js:235-238 ("store update sequence and the entangled lanes", fields that were removed) (verified).

## 2. Should fix (perf and correctness edges)

- **`processStoreRecords` reprocesses every pending record's whole base queue on each HostRoot begin, even with no lane in the render** (ReactFiberStore.js:457). For example, a suspended transition with N updates on store A, while store B gets keystrokes. Skip a record when `pending === null` and its queue lanes don't intersect `renderLanes`. `getStoreStateForRender` already handles unprocessed records. Benchmark it.
- **Every dispatch enqueues every reader** (ReactFiberStore.js:781). 100 updates × 10k readers in one event is 1M queue entries. Skip it when the record already enqueued that lane since the last drain.
- **`commitStoreStates` keeps a lane on a record when any unrelated update used that lane during the render** (verified, :1082, `intersectLanes(record.lanes, concurrentlyUpdatedLanes)`). It heals at the next commit, but until then the record stays pending (no eager bailout, `_headQueue` grows, new readers get an extra lane).
- **A throwing reducer update is dropped even when an earlier update was skipped** (verified, :539). The root never rebases it, but `getStoreHead` applies it after the skipped one, so a new root can diverge. Cloning it would rethrow on every render until the skipped lane commits, so this needs a decision. Document it, and add a test.
- **`removeLastHeadAction` pops the last action, not the failed one** (ReactStore.js:79). Low confidence: the throws come before any re-entrant dispatch. Record the index before dispatching anyway.
- **A held update without a render can match a recycled transition lane** (:368) and stay hidden until an unrelated transition commits. Low.
- **Flag off, shape on:** `pendingStoreRecords` and `unsubscribedStoreRecords` (FiberRoot), `storeStates` (RootState), `storeReads` (SuspenseState), and `storeReads`/`storeInst` (function component update queue) exist with the flag off. Use the `if (enableX)` pattern like other root fields.
- **Flag on, no stores:** `collectStoreReadsOfSuspendedTree` walks to the boundary on every suspension, and `finishStoreReads` runs on every function component render. Skip both behind a module-level "any store read yet" check.
- **`index.fb.js:88`:** type it `?typeof createStore`.
- **Native-oss and test-renderer forks:** `enableStore` is false there, but experimental exports `createStore`, so `use(store)` throws a vague "unsupported type passed to use()".
- **Fizz:** a DEV warning when a store was updated before a server render, since Fizz renders `_initial`. Document per-request stores.
- **Flight:** a store passed as a prop from a Server Component to a Client Component falls through to generic serialization. Add a test and a message.

## 3. Documented limits reviewers will ask about (decide whether they're OK for experimental)

- **Cross-root consistency.** A new root starts from `_head` (#403, DESIGN:44). That includes another root's pending transitions and held updates (code-review finding 1), and DCP-18 judges "done" on the committing root.
- **Reading outside render or subscribing outside React (D5).** Link `research/reading-outside-render.md` in the PR description.
- **DevTools editing, selectors and derived data (D1–D4), Profiler updater attribution:** follow-ups.
- **Ship DevTools in lockstep.** Old debug-tools throws "unsupported type" on `use(store)`, and `getChangeDescription` has no try/catch.

## 4. Packaging

- **Stays local:** `docs/use-store/**` (main has no `docs/`), the untracked `docs/use-store/{data,sandbox,src,tools,vendor}`, `scripts/ponyfill-compat`, and the `.eslintignore`/`.prettierignore` lines.
- **`fixtures/store-bench`** gets its own PR, without spike-shared-derived/, derived-explainer.mjs, experiments/*.patch and react-builds paths.
- **Squash the WIP commits and split:**
  1. Same-element bailout (its own flag)
  2. Flag, API and types
  3. Reconciler core and core tests
  4. Fizz/Flight
  5. Debug tools and DevTools
  6. Test-only (react-refresh, eslint) and coverage PRs
- **Already fine:** the flags are consistent across forks, the exports are experimental and www/RN-fb only, error codes only add 613/614, and the production source has no debris.

## 5. Tests

- **Size (decision for Ricky):** 26k added lines. The reviewer recommends about 7k:
  - **Keep:** ReactUseStore-test, the ReactDOMStore core, Flight/Markup/Fizz, and DevTools.
  - **Merge:** the copies into a few store suites. "store updates during render warn" is asserted 25 times in 10 files.
  - **Cut:** the Ponyfill port (2.7k lines, it.skip, GAP notes) and the Provider copies that test context.
  - **Or:** move the copies to a follow-up coverage PR.
- **Legacy tests** (51) render ReactDOM under xplat flags, which xplat's config deliberately excludes (verified). Rewrite about 6 on `ReactNoop.renderLegacySyncRoot`.
- **Dead test:** `#14162` in ReactSuspenseUseStore-test.internal.js:507 asserts nothing, and its update never fires (verified).
- **ReactDOMServerIntegrationHooksUseStore-test.js:71** patches `global.it` with the private `_test_gate`.
- **69 assertions read internals.** Keep the leak, `storeStates` and queue-boundedness checks behind one helper. Replace the `readers.size` checks with re-render logs.
- **Review-history comments:** "Finding 1 (high)", "Found by the second review pass", and DCP/B- IDs in 12 test files. Rewrite them as behavior descriptions.
- **Gaps:**
  - two roots: a reader mounting on B during A's transition, a reducer error, held updates;
  - two renderers re-rendering;
  - `root.unmount()` with a pending transition;
  - the act warning with no readers;
  - the "large number of updates" warning skip;
  - scheduling profiler marks;
  - compiler fixtures (`store.update` in a handler, a conditional `use(store)`).
- **Smaller fixes:**
  - two `.internal.js` files use no internals;
  - the DevTools tests rely on `@reactVersion` only;
  - the copies reuse the original describe names.
- **Runs:** stable `ReactUseStore-test` 79/79 expected failures. `--prod` experimental core suites 108/108.
