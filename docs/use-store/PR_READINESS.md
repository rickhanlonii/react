# use(store) PR readiness review (2026-11-01)

Review of `main...rh/use-store` (merge-base a703ca64f9), from `/code-review high` plus three reviewers (packaging, tests, integrations). I checked each item marked "verified" against the code myself.

**Status (updated 2026-11-01, evening):** the branch is at `4845cbfd47`. Since the review: the StrictMode change is reverted, the sibling fast path is moved to its own branch, and the stale "From X-test.js" comments are fixed. Decisions 1–3 are made. The rest of section 1 is still open, waiting on decision 4.

## 0. Decisions for Ricky

1. ~~Are the cross-root limits OK for an experimental PR?~~ **Accepted** (2026-11-01). Transitions already don't span roots, and each root commits its part on its own, so a new root starting from `_head` (including another root's pending transition or held update) follows the existing model. DESIGN.md:44 and DCP-18 are reworded to match. Two tests should pin it (section 5).
2. ~~What happens to the test copies?~~ **Decided** (2026-11-01): do it the way Andrew writes feature tests. `ReactUseStore-test` becomes the spec (about 3k lines), organized by rule, and each test narrates one scenario with logs. A small set of integration tests (about 1–1.5k lines) stays elsewhere, and the copies are deleted. Plan:
   1. **Inventory first.** Every copy test that caught something (the "found by copies-…" entries in DECISIONS, plus any copy that failed during development) needs a named test in the spec. Add any that are missing.
   2. **Restructure `ReactUseStore-test` by rule:** reading and updating, batching and priority, transitions, Suspense and Activity, updates during render, reducer errors, multiple roots, lifetime. Rewrite the review-history comments as narration.
   3. **Add a handful of side-by-side tests** that run the same scenario with `useState` and with a store and assert identical logs: batching, rebasing over a pending transition, and joining a transition mid-render.
   4. **The section 1 fixes and the two multi-root tests** put their tests in the spec.
   5. **Rewrite the ~6 legacy cases** on `ReactNoop.renderLegacySyncRoot`, and put the leak checks behind one helper. Assert "who re-renders" through the log, not `readers.size`.
   6. **Keep a small set of integration tests:** hydration and Fizz in ReactDOMStore, the Flight error, DevTools inspection and Profiler, and one Fast Refresh case.
   7. **Delete** the copy files, the `use(store)` blocks in the 48 existing files, and the ponyfill port. Keep the copies on a local branch as a smoke suite to rerun when the reconciler core changes. It doesn't ship.
3. ~~A reducer update that throws while an earlier update is skipped~~ **Decided** (2026-11-01): keep the simplest implementation (DCP-19) and pin the open cases with tests ("reducer errors to follow up on" in ReactUseStore-test, notes under DCP-19). Testing showed React's error recovery usually applies the update after the transition. It's lost only when the retry can't finish, for example when the transition is waiting on data. Resolving it is a follow-up, not a PR blocker.
4. **Go-ahead for the rest of section 1:** `U` chaining, the Profiler hook id, the hydration error order, and the stale comment.

## 1. Fix before opening the PR

1. ~~The StrictMode fix has no flag~~ **Reverted** (2026-11-01). It reversed the behavior decided in react/react#32315, so it was removed from the branch, not split out.
2. ~~The sibling fast path in `finishQueueingConcurrentUpdates` has no flag~~ **Moved out** (2026-11-01). It's now `rh/sibling-lane-fast-path` (`63644d055a`, off main), for Ricky to open as a question PR. It isn't store specific: uSES forced re-renders and hydration and Suspense retries take it too. An assertion that its skipped writes were no-ops held across the reconciler and DOM suites, but the suites only reached it 42 times. `rh/use-store` now walks to the root for every reader, so the store benchmarks need re-measuring without it (see "Every dispatch enqueues every reader" in section 2).
3. ~~`ReactSharedInternals.U` is overwritten by each renderer~~ **Fixed.** `U` chains like `S`, held updates are shared entries on the store, and each renderer keeps its own lane per entry. There are three two-renderer tests in ReactUseStoreMultipleRenderers-test (one failed before the fix).
4. ~~The DevTools Profiler can name the wrong hook~~ **Fixed** (2026-11-01). The backend reports hook ids plus a `storeReads` field, and `HookChangeSummary` matches both. This also fixes a bug on main from #35123: `[useContext, useState]` showed "Hook 2 changed". There are new rendered-view tests that fail without the fix. The DevTools suite passes on a fresh build (44 suites, 611 passed).
5. ~~A reducer error during hydration skips the server value~~ **Fixed.** A hydrating reader takes `_initial` without throwing. The update that threw is dropped by the hydration render, so the error is reported at commit (DCP-19's rule for errors no component rendered). Test: ReactDOMStore "hydrates with the server value when a reducer throws, and reports the error".
6. ~~Stale comment in ReactInternalTypes.js~~ **Fixed.**

## 2. Should fix (perf and correctness edges)

- ~~`processStoreRecords` reprocesses every pending record~~ **Fixed:** records whose updates are all in other lanes use `record.committed` (`canUseCommittedStoreState`). Test: "does not run the reducer of a store whose updates are all in lanes the render skips".
- ~~Every dispatch enqueues every reader~~ **Fixed:** readers are marked once per lane per drain of the concurrent queue (`enqueuedLanes`/`enqueuedEpoch`). Scheduling-profiler marks now come once per reader per lane per drain.
- ~~`commitStoreStates` keeps a lane when any unrelated update used it~~ **Fixed:** the record keeps only the lanes dispatched to it since the last drain.
- ~~A throwing reducer update is dropped even when an earlier update was skipped~~ **Pinned as a follow-up** (decision 3). Error recovery usually saves it. It's lost when the recovery retry can't finish (the transition waits on data). The head divergence didn't show up in testing: once nothing is pending, a new root reads the committed value.
- ~~`removeLastHeadAction` pops the last action~~ **Fixed:** `removeHeadAction` removes the recorded index (not reproducible, so no test).
- ~~A held update can match a recycled transition lane~~ **Fixed (reproduced):** at the end of an event with nothing else to render, the event's held updates are done. Test: "a held update whose transition had nothing else to render is visible after its lane is reused".
- ~~Flag off, shape on~~ **Fixed:** the root fields are gated in the constructor, and the other fields are optional, set with `enableStore ? … : …`.
- ~~Flag on, no stores~~ **Fixed:** a module-level `didReadStores` check skips `collectStoreReadsOfSuspendedTree` and `finishStoreReads`.
- ~~`index.fb.js:88` type~~ **Fixed** (`?typeof createStore`).
- ~~Native-oss and test-renderer forks give a vague error~~ **Fixed:** "use(store) is not supported by this renderer." (code 615).
- ~~Fizz DEV warning~~ **Fixed:** warns once per store when it was updated before the server render.
- ~~Flight store prop~~ **Fixed:** "Stores can't be passed from a Server Component to a Client Component." (code 616).

## 3. Documented limits reviewers will ask about (decide whether they're OK for experimental)

- **Cross-root consistency (accepted).** A new root starts from `_head` (#403, DESIGN:44), including another root's pending transitions and held updates (code-review finding 1), and DCP-18 judges "done" on the committing root. This is the same as how transitions already work across roots: they don't span roots. Say so in the PR description.
- **Reading outside render or subscribing outside React (decided, DCP-21).** No public read in v1, following Seb's position (reads through `use()` in a React scope, writes through `update()`). The PR description explains why and what to use instead. A read of the latest value is open until Seb weighs in.
- **DevTools editing, selectors and derived data (D1–D4), Profiler updater attribution:** follow-ups.
- **Ship DevTools in lockstep.** Old debug-tools throws "unsupported type" on `use(store)`, and `getChangeDescription` has no try/catch.
- **Why not Seb's three slots (`_current`/`_sync`/`_transition`, reactwg #362)?** Reviewers will ask. `rh/use-store-three-slot` (`13aac471c3`) implements it: 50 store tests fail as written, and 24 still fail after per-render patches. The causes: the reducer runs at dispatch, urgent lanes collapse into `_sync`, a transition commit copies in a later same-lane transition and tears the tree, and the global variant breaks with multiple roots. The write-up is `docs/use-store/research/three-slot-model.md` on that branch.

## 4. Packaging

- **Stays local:** `docs/use-store/**` (main has no `docs/`), `docs/use-store/{data,sandbox,src,tools,vendor}`, `scripts/ponyfill-compat`, and the `.eslintignore`/`.prettierignore` lines. These are all in the local WIP commit `4845cbfd47`, so drop that commit when squashing. While `docs/use-store/src` is in the tree, `yarn linc` crashes in eslint's `no-eval` rule on `docs/use-store/src/demos/runtime/ui/styles.js`. Lint the `packages/` files directly until then.
- **`fixtures/store-bench`** gets its own PR, without spike-shared-derived/, derived-explainer.mjs, experiments/*.patch and react-builds paths.
- **Squash the WIP commits and split.** Separately, `rh/sibling-lane-fast-path` is already its own branch.
  1. Same-element bailout (its own flag)
  2. Flag, API and types
  3. Reconciler core and core tests
  4. Fizz/Flight
  5. Debug tools and DevTools
  6. Test-only (react-refresh, eslint) and coverage PRs
- **Already fine:** the flags are consistent across forks, the exports are experimental and www/RN-fb only, error codes only add 613/614, and the production source has no debris.

## 5. Tests

- **Size (decided, see decision 2):** 26k added lines. The reviewer recommends about 7k:
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
  - two roots, to pin the accepted cross-root behavior: a reader mounting on B during A's suspended transition shows the new value, and a held update is released when A commits while the transition is still pending in B. Also a reducer error with two roots;
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
