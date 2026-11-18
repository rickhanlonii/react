# use(store) test-copy inventory (2026-11-01)

Read-only inventory of `rh/use-store` at HEAD `4845cbfd47`, plus the working tree as it was during the scan. Other agents had uncommitted edits in progress, and those are included:

- `ReactUseStore-test.js`: +213 lines, the new `describe('reducer errors to follow up on')`.
- `ReactDOMStore-test.js`: +9 lines.
- `ReactDOMFizzServer-test.js`: +54 lines, "warns once if a store was updated before the server render".
- `ReactFlight-test.js` and `profilingCache-test.js`.

Line numbers are working-tree line numbers. "Spec" means `packages/react-reconciler/src/__tests__/ReactUseStore-test.js`. Paths are shortened:

- `R/` = `packages/react-reconciler/src/__tests__/`
- `D/` = `packages/react-dom/src/__tests__/`

The kept integration set, as briefed:

- `D/ReactDOMStore-test.js`, the core and "dehydrated boundaries" parts only;
- `ReactDebugHooksStore-test.js`;
- `R/ReactUseStoreMultipleRenderers-test.js`;
- `R/ReactUseStoreLegacyMode-test.js`, which is being rewritten;
- the Flight, Fizz and Markup blocks;
- the DevTools blocks: inspectedElement, profilingCache, profilingStoreChangeDetection, parseHookNames, DevToolsFacade.

Where "Fizz" is ambiguous, I say so.

Sources: DECISIONS.md, OVERNIGHT.md, BLOCKERS.md (its "Found in" column is the copy-campaign record), DESIGN.md, STATUS.md, the 7 commit bodies, the plan `~/.claude/plans/vivid-squishing-river.md`, and the 95 `store-semantics:` comments.

---

## 1. Behaviors the copies caught

28 behaviors:

- **15 covered:** by the spec, or by a kept integration test.
- **4 partly covered:** a core case is covered, but the part the copy caught isn't.
- **9 not covered:** by the spec or by the keep list.

"Covered by a kept file" counts as covered only when the test sits in a part of the file that is kept.

| # | Behavior (one line) | Caught or pinned by (copy file, test) | Coverage |
|---|---|---|---|
| 1 | B-4: a render of an older transition skipped a newer entangled update and committed an intermediate state | `ReactTransitionUseStore` (BLOCKERS:10, copies-transitions). Which test is **unsure**; BLOCKERS names only the file. | Covered. Spec "multiple transitions that update the same store are entangled" (L1420) |
| 2 | B-5: false "hasn't mounted yet" warning when a new reader in a newly inserted parent caught up | `ReactUpdatesUseStore` "should queue updates from during mount" (copies-dom-inputs). That file was deleted in 44478fac17, and the case moved to `R/ReactUseStoreLegacyMode-test.js:426`. | Covered. `ReactDOMStore` core "a reader inside a newly inserted host component catches up without warnings" (L60). The legacy copy (L426) is at risk in the legacy rewrite. |
| 3 | B-6: a store update before a dehydrated reader hydrated caused a hydration mismatch (DCP-4) | ReactDOMServerPartialHydration copies (copies-fizz), now `ReactDOMStore` "dehydrated boundaries" | Covered. `ReactDOMStore` core "a store update before a dehydrated reader hydrates does not cause a mismatch" (L135), plus dehydrated boundaries L931, L1015, L1097, L1194 |
| 4 | B-7 / DCP-6: the reducer ran extra times (eager `_head`, render, commit). The eager state is reused, and the commit doesn't rerun the reducer after a skip. | `R/ReactIncrementalUpdates-test.js:741` "can abort an update, schedule additional updates, and resume" (the use(store) block). It logs every updater call through an interruption, a sync flush and a rebase. | **Partly.** Spec "runs the reducer as often as useReducer" (L1492) covers the eager state and in-render batching only. It never skips an update, although DECISIONS:79 says it pins "the commit doesn't re-run the reducer when the render skipped updates". The rebase and interruption count is **NOT COVERED**. |
| 5 | B-8: an urgent update followed by a transition on the same store got entangled | copies-suspense, copies-hooks (BLOCKERS:14). Test **unsure**. | Covered. Spec "a transition does not entangle with a pending urgent update to the same store" (L1465) |
| 6 | B-9: the commit folded raw lanes while reads used entangled lanes, so an entangled update was rendered and then reverted by the next update | copies-transitions (BLOCKERS:15). Test **unsure**. | **Partly.** DCP-17 made the commit a pointer swap, so the mechanism is gone. L1420 asserts the entangled commit, but no later update checks that the next update builds on the entangled value. |
| 7 | B-10: `use(store)` in a class render or a memo compare threw a TypeError instead of the invalid hook call error | copies-hooks (BLOCKERS:16). Test **unsure**. | **Partly.** Spec "throws an invalid hook call error when read outside a function component" (L1560) covers class render only. The memo-compare case has no test. |
| 8 | B-11 / DCP-14: a throwing updater threw at `store.update()` or during the commit | copies-hooks | Covered. Spec L1578 "throws a reducer error during render…", L2069 "throws a reducer error from store.update when nothing reads the store", L2019 "reports a reducer error that no component rendered…" |
| 9 | B-12 / DCP-7: a render-phase self-update warned "while rendering a different component (X)". It now warns about the store and renders after the render, and the update is not discarded if the render suspends or is thrown away. | copies-hooks, copies-suspense. Now pinned by `R/ReactHooksWithNoopRendererUseStore-test.js:274` "discards render phase updates if something suspends", :334, :413, :190 "warns about render phase update on a different component", :242 "keeps restarting…" | **Partly.** Spec L1526 "warns when a store is updated during render, and renders the update after" covers the self-update warning and the render after. **NOT COVERED:** the update survives a render that suspends or is thrown away; the warning is deduplicated per component; the update is on a store another component reads. |
| 10 | B-13: no "not mounted yet" warning for store updates, and the update isn't dropped | copies-activity-context, copies-dom-classes. Now `R/Activity-test.js:1863` "regression: Activity instance is sometimes null during setState", `ReactDOMStore` folded "should not warn on updating function component from componentWillMount" (L498), and dehydrated L931 | Covered only by `ReactDOMStore`, and L498 is in "folded copies › updates during render", which is outside the kept core. The spec has nothing. **At risk.** |
| 11 | B-14: StrictMode didn't double-invoke store reducers or updaters | copies-react-pkg. Now `packages/react/src/__tests__/ReactStrictMode-test.js:585` "double invokes setState updater functions" | Covered. Spec "double invokes reducers in StrictMode even when a reader outside StrictMode reads first" (L2095), which takes the same path as an updater function |
| 12 | B-15: debug-tools had Store outside the primitive stack cache and gave it a hook id | copies-react-pkg | Covered (kept). `ReactDebugHooksStore` L47, L157, L185; `DevToolsFacade` block L2447 |
| 13 | B-16: Profiler change descriptions missed changed store reads | copies-devtools | Covered (kept). `profilingCache-test.js:1447` "should properly detect changed hooks" (block); `profilingStoreChangeDetection` L111 |
| 14 | B-17: the inspector showed `hooks: null` for store-only components | copies-devtools | Covered (kept). `inspectedElement-test.js:3320` (block) |
| 15 | B-18 / DCP-16: a store update didn't retry a boundary whose reader suspended on mount | `R/ReactContextPropagationUseStore-test.js:737` "regression: context change triggers retry…on initial mount" and :788 "(nested)" | Covered. Spec L2130, L2161, L2199. The "(nested)" shape (an Indirection between the store-reading parent and the boundary, which must not re-render) isn't in the spec. Low risk. |
| 16 | B-19: Flight gave the generic client-reference error for a store | ReactFlight context copy | Covered (kept). `ReactFlight-test.js:4589` "should error if a client reference to a store is passed to use()" |
| 17 | B-20: DevTools change detection crashed on a dropped conditional store read | profilingCache context copy | Covered (kept). `profilingStoreChangeDetection` L76, L93, L111, L134 |
| 18 | No warning for `store.update` during server rendering, and the server doesn't render render-phase updates (copies-dom-server, DECISIONS:94) | `D/ReactDOMServerIntegrationHooksUseStore-test.js` notes at L94, L212, L280, L352 | **NOT COVERED** by the keep list. That file is a dedicated copy. `ReactDOMStore` L123 covers only an update made before the server render. |
| 19 | Fizz checks: `use(store)` on the server throws in classes and warns inside `useMemo` or a reducer (DECISIONS:85) | `ServerIntegrationHooksUseStore` L415 "reading a store in a disallowed place" | **NOT COVERED** by the keep list. Only the `renderToHTML` throw is covered, by the Markup blocks (`ReactMarkupClient:242`, `ReactMarkupServer:278`). |
| 20 | Fast Refresh: `use(store)` isn't in the signature; no remount; `@refresh reset` has nothing to attach to; re-creating the store in the edited module switches stores (copies-refresh, DECISIONS:95) | `ReactFreshBabelPlugin-test.js:568`, `ReactFreshIntegration-test.js:2253`, :2302, :2415, `ReactFresh-test.js:2766`, :2869 | **NOT COVERED** by the briefed keep list. PR_READINESS decision 2.6 says to keep one Fast Refresh case. |
| 21 | DevTools hook names: `use(store)` isn't named | copies-devtools-hooks | Covered (kept). `parseHookNames-test.js:924` |
| 22 | The `use()` nested in a `useMemo` callback gets the enclosing component's name with extended source maps (DECISIONS:98, "pinned with store-semantics notes in parseHookNamesUseStore-test.js") | `parseHookNamesUseStore-test.js`, **already deleted** in 44478fac17. Today's parseHookNames block has only "does not name use(store) reads". | **NOT COVERED**, and DECISIONS:98 is stale. DECISIONS:99 (the `indexUseStore.js` fixture gap) is also stale: those fixtures are gone. |
| 23 | DCP-17: a hidden Activity reader renders the root's committed value directly (B1) and never renders the intermediate value (B0), unlike useState | `R/ActivitySuspense-test.js:644` "updates at multiple priorities that suspend inside hidden tree", note L682. DESIGN.md "Hidden trees" names this test as the pin. | **NOT COVERED**. Spec L1137 and L1650 don't assert it. |
| 24 | DCP-17: on error paths, the HostRoot runs the reducer once per begin (concurrent render, sync retry, after unwinding to the root) | `R/ReactHooksUseStore-test.internal.js:577` "warns when calling hooks inside useReducer" (4 invalid-hook warnings, L620) | **NOT COVERED** |
| 25 | No "large number of updates inside startTransition" warning for stores (DECISIONS:86) | `packages/react/src/__tests__/ReactStartTransition-test.js:96` (notes L129, L140) | **NOT COVERED**. Already listed as a gap in PR_READINESS §5. |
| 26 | The profiler's updater is the last reader that was scheduled (DECISIONS:90, follow-up) | `R/ReactUpdaters-test.internal.js:486` "should report a function component as the scheduler for a hooks update", plus :536, :615, :675, :733 | **NOT COVERED** (the current behavior isn't pinned) |
| 27 | DCP-18: a transition update to a store no root reads was applied right away. Found by the ponyfill port. | `D/ReactUseStorePonyfill-test.js:1239` "Does not miss sync updates triggered in useEffect or useLayoutEffect during a long-running transition" | Covered. Spec L2591, L2635, L2667, L2713, L2741, L2786 and "reducer errors and held updates" |
| 28 | An update the root rejects for an infinite loop isn't applied to the store (correctness-review fix in f01419287a) | `ReactDOMStore` folded "infinite update loops" L891 | Covered only in `ReactDOMStore` "folded copies", outside the kept core. The spec has no infinite-loop test (`grep -n "Maximum\|infinite"` finds nothing). **At risk; keep it or move it.** |

---

## 2. `store-semantics:` notes

`git grep -n "store-semantics:" -- packages` gives 95 hits in 24 files. Grouped by the semantic each one states:

| Semantic | Hits (file:line) | Spec coverage |
|---|---|---|
| **S1.** A store update during render warns and is rendered after the current render | 25. ServerIntegrationHooksUseStore 201, 230, 267, 340. AsyncActionsUseStore 389, 472, 538. DeferredValue 1207, 1297. HooksUseStore 484, 518, 566, 660. HooksWithNoopUseStore 149, 225, 267, 317, 458, 838. IncrementalErrorHandling 2036. SuspenseEffectsSemanticsDOM 617. SuspenseWithNoopUseStore 1088. ReactUse 2631. useMemoCache 820, 1130. | Covered: L1526 |
| **S2.** A render-phase update isn't processed in the current render. It's scheduled, the component renders again (commits the previous value first), and it keeps restarting until stable. | 21. AsyncActionsUseStore 370, 400, 427, 486, 519, 551. DeferredValue 1167, 1199, 1223, 1242, 1262, 1293, 1325, 1339. HooksWithNoopUseStore 146, 255, 385, 503, 542, 876. ServerIntegrationHooksUseStore 286. | Partly: L1526 asserts `[1, 2]`. A chain of restarts (`keeps restarting…`, HooksWithNoop:242) isn't covered. |
| **S3.** Render-phase store updates are real updates. They aren't discarded when the render suspends or never commits (server render, failed hydration). | 4. HooksWithNoopUseStore 326, 403, 467. ServerIntegrationHooksUseStore 316. | **NOT COVERED** |
| **S4.** Stores persist across remounts, so the test passes a new store | 7. ServerIntegrationHooksUseStore 94. SuspenseFuzzUseStore 96. LegacyMode 609, 717. ReactFresh 2842, 2923, 2991. | Covered: spec "state survives remounting, unlike component state" (L1064) |
| **S5.** The server renders the value the store was created with: not updates, not render-phase updates, and no warning on the server | 6. ServerIntegrationHooksUseStore 212, 241, 280, 352 (and 94, "warns on the client but not on the server"). FizzStaticBrowser 2970. | Partly: `ReactDOMStore` L123 covers updates made before the server render. Render-phase updates on the server and the absence of a server warning are **NOT COVERED** by the keep list. |
| **S6.** A store update isn't tied to a fiber: no "hasn't mounted yet" or unmounted warning, and the update isn't dropped | 3. `ReactDOMStore` 487, 992. Activity 1901. | Covered only in `ReactDOMStore` (L487 is in folded copies, L992 in dehydrated boundaries). Not in the spec. |
| **S7.** A store update isn't routed into dehydrated boundaries; the server HTML stays until the boundary hydrates | 2. `ReactDOMStore` 1164, 1263 | Covered (kept: dehydrated boundaries) |
| **S8.** The HostRoot owns store state, so a hidden reader renders the committed value directly | 1. ActivitySuspense 682 | **NOT COVERED** |
| **S9.** A boundary subscribes to the stores its suspended-on-mount reader read | 2. ContextPropagationUseStore 734, 785 | Covered: L2130, L2161 |
| **S10.** A store update only schedules its readers, so primary children that don't read it aren't retried or pre-warmed (unlike context) | 1. ContextPropagationUseStore 893 | **NOT COVERED** |
| **S11.** Eager bailout at dispatch when the store's queue on the root is empty, even where useState must render (alternate has lanes); so one less commit | 7. HooksUseStore 103, 196, 228, 299, 357, 385. TransitionTracing 2702. | Partly: spec "bails out when the value does not change" (L189) covers the idle case. The case where useState would render isn't covered. |
| **S12.** A reducer runs without a dispatcher: reading context or calling a Hook in it throws in the reader; render-phase updates aren't computed eagerly | 3. HooksUseStore 518, 566, 602 | **NOT COVERED** on the normal path. Spec L3308 covers only the held-update path. |
| **S13.** `use(store)` goes through the Hooks dispatcher, so inside `useMemo` or an eager updater it gets the Hooks warning, not the context-read warning; inside a class's eager updater it throws, and the eager state is discarded | 3. HooksUseStore 767, 810, 821 | **NOT COVERED** |
| **S14.** Like useState, the first update to an idle store is computed eagerly, and that eager state is reused in a rebase | 2. IncrementalUpdates 767, 794 | Partly: L1492 covers the eager state. Reuse in a rebase isn't covered (see #4). |
| **S15.** DevTools shows a `Store` node with id null and the rendered value, not editable | 3. ReactDebugHooksStore 1013. DevToolsFacade 2482. inspectedElement 3332. | Covered (kept) |
| **S16.** Fast Refresh: `use(store)` isn't part of the signature (no remount, `@refresh reset` has nothing to attach to, a re-created store is read) | 6. FreshBabelPlugin 569. FreshIntegration 2290, 2341, 2359, 2404, 2451. | **NOT COVERED** by the keep list |
| **S17.** Store updates don't count toward the startTransition update-count warning | 2. StartTransition 129, 140 | **NOT COVERED** |

Total: 17 distinct semantics. 5 covered (S1, S4, S7, S9, S15), 5 partly covered (S2, S5, S6, S11, S14), 7 not covered (S3, S8, S10, S12, S13, S16, S17).

---

## 3. Store-specific assertions in copies, beyond the notes

Copies whose expectations differ from the original, or that exercise a store-only path. The spec has no equivalent unless noted.

**Lanes and entanglement** (store updates go through the HostRoot queue, and `requestStoreUpdateLane` is a fork of `requestUpdateLane`, `ReactFiberWorkLoop.js:912`):

- **Transitions on different stores, in separate events, don't entangle.** B resolves and commits while A is still suspended. `R/ReactTransitionUseStore-test.js:178` "when multiple transitions update different queues, they entangle" (same title as the original; the log shows B committing alone). The file header (L32-35) says this path is store specific. Spec: **NOT COVERED**. L2280 is a single transition over two stores.
- **Transitive entanglement across overlapping stores:** A, then A+B, then B+C. Resolving B or A still renders C; only C finishes. `ReactTransitionUseStore:581`. Spec: **NOT COVERED**.
- Transitions on different stores that suspend the same boundary do entangle: `ReactTransitionUseStore:324`. **NOT COVERED**.
- Only the most recent transition on the same store finishes (no intermediate state, with Suspense): `ReactTransitionUseStore:461`. Covered in substance by L1420 (without Suspense).
- **Store updates take the event's priority:**
  - a continuous update interrupts a transition: `R/ReactUpdatePriority-test.js:243`;
  - an idle update: :192;
  - a passive effect after a sync update gets the default priority: :169;
  - discrete events aren't batched between handlers and continuous events are: `internal-test-utils/__tests__/ReactInternalTestUtilsDOM-test.js:578`, :643;
  - a transition scheduled in a popstate event renders synchronously: `D/ReactDOMFiberAsync-test.js:920`;
  - `startTransition` and `flushSync` nested inside each other: `R/ReactFlushSync-test.js:402`.

  Spec: **NOT COVERED**. It only uses `discreteUpdates` (L1479) and `idleUpdates` for other purposes.
- Async-action entanglement still holds after the `useTransition` hook unmounts (updater and root-update variants): `R/ReactAsyncActionsUseStore-test.js:670`, :758. The optimistic state isn't reverted until the action finishes: :567. **NOT COVERED**. Spec L1267 covers basic async-action batching.
- A lower-priority store update isn't dropped when a memo reader bails out at a higher priority: `R/ReactMemo-test.js:665`, :697. **NOT COVERED**.
- Expiration and starvation of store updates; idle store work never expires: `R/ReactExpiration-test.js:841`, :915, :983, :1036. **NOT COVERED** (low).

**Render-phase updates** (S1–S3):

- Deduplicated warning, and an update to a store another component reads: `ReactHooksWithNoopRendererUseStore:190`.
- Restart chain: :242.
- Not discarded on suspend: :274, :334, :413.
- Lower-priority work isn't dropped: :477.
- `startTransition` during render: :525.
- Effect deps persist after a render-phase update: :845.
- With useOptimistic rebasing: `ReactAsyncActionsUseStore:353`, :407, :509.
- With useDeferredValue: `ReactDeferredValue:1162`, :1257.
- With `use()`: `ReactUse:2605`.
- No infinite loop when a render-phase update meets an error: `ReactIncrementalErrorHandling:1985`.
- No pending state stuck forever: `ReactSuspenseWithNoopRendererUseStore:1072`.

Spec: only the basic case (L1526).

**Reducers and dispatchers:**

- A Hook call in a reducer, a context read in a reducer, the eager variant: `ReactHooksUseStore:491`, :530, :577.
- `use(store)` in `useMemo` and in a class's eager updater: :749, :781.
- The server variant: `ServerIntegrationHooksUseStore:415`.

**NOT COVERED** in the spec, except the held-update dispatcher case (L3308).

**Suspense and context differences:**

- A store update doesn't retry primary children that don't read the store: `ReactContextPropagationUseStore:837` (S10). **NOT COVERED**.
- A store update reaches readers through retries, offscreen trees, SuspenseList and nested bailouts: `ReactContextPropagationUseStore:309`, :433, :477, :518, :568, :638, :690; `ReactNewContextUseStore:100`, :386.
  - Spec L1089 and L1137 cover a suspended tree and a hidden tree.
  - L598 covers memo.
  - Retries, SuspenseList and `shouldComponentUpdate` aren't covered (low).
- Mounting during a transition whose state would suspend: the reader renders the committed value and doesn't get stuck on the fallback. `D/ReactUseStorePonyfill-test.js:1814` "gets stuck in suspense when transition state suspends on mount" (DIFFERS, L1879). **NOT COVERED**. Spec L298 has no Suspense.
- The primary fragment fiber isn't always on the reader's return path: `ReactSuspenseWithNoopRendererUseStore:555`, :633. Readers are stored fibers marked through `enqueueConcurrentRenderForLaneOnMountedFiber`. **NOT COVERED** (low, but it tests the stored-reader path).
- The only reader is inside a hidden Activity and re-renders in the background: `R/useEffectEvent-test.js:1273`. Partly covered: L2019 and L2902 use hidden-only readers.

**Root and commit plumbing:**

- **The act warning for a store update names the reader:** `R/ReactActWarnings-test.js:457`. **NOT COVERED**. The no-readers case is already a PR_READINESS gap.
- **Profiler:** a Profiler next to a reader isn't reported, and store updates scheduled in layout effects are tagged `nested-update`: `packages/react/src/__tests__/ReactProfiler-test.internal.js:1280`, :1368, :1412. **NOT COVERED**.
- **Selective hydration:** a sync store update that cascades into 100 unhydrated boundaries doesn't hit the nested-update limit, because a store update is a HostRoot update. `D/ReactDOMServerSelectiveHydration-test.internal.js:1925`. **NOT COVERED**.
- A store update from a user insertion effect still warns "useInsertionEffect must not schedule updates", even though readers subscribe in an internal insertion effect: `ReactHooksWithNoopRendererUseStore:708`. **NOT COVERED**.
- Default transition indicator: an urgent store update counts as a sync mutation: `R/ReactDefaultTransitionIndicator-test.js:491`, :547. **NOT COVERED** (low).
- Transition tracing of store updates: `R/ReactTransitionTracing-test.js:2584`, :2642. **NOT COVERED** (low).
- Hydration replay keeps store reads intact (#33580): `D/ReactDOMFizzShellHydration-test.js:851`, :919. Kept if "Fizz blocks" includes this file; otherwise **NOT COVERED**.
- A transition flowing into a dehydrated boundary showing a fallback doesn't suspend: `D/ReactDOMFizzServer-test.js:10957`. Kept (Fizz).
- Controlled input whose value is a store, edited before hydration: `D/ReactDOMServerIntegrationUserInteraction-test.js:470`, :484. Partly covered by `ReactDOMStore` L182 (core) and L766 (folded).

---

## 4. Recommended additions (deduplicated, by importance)

Each addition goes in the spec unless noted. The logs use the spec's `Text` and `Scheduler.log` style.

1. **Render-phase store updates survive a render that suspends or is thrown away (S3, #9).**
   - Setup: `counter = createStore(0)` and `signal = createStore(true)`. `Bar({signal})` reads both. If `use(signal) !== signal`, it calls `counter.update(c => c + 1)` and `signal.update(signal)`, and when `counter` is 0 it logs `'Suspend!'` and throws a never-resolving thenable. Render `<Suspense fallback="Loading"><Bar signal={true} /></Suspense>`.
   - Expected:
     - Mount logs `[0]`.
     - `startTransition(() => root.render(<…signal={false} />))` logs `['Suspend!']`, warns once "Cannot update a store while rendering a component (`Bar`)…", and the output stays `0`.
     - Running the same transition again logs `[1]`: the render-phase updates were kept, so Bar doesn't suspend.
   - Add the same check for a render that's interrupted and restarted.

2. **The render-phase warning is per rendering component, and fires for a store another component reads (#9).**
   - Setup: `Foo` reads `store`; `Bar({trigger})` calls `store.update(x => x + 1)` during render when `trigger` is set.
   - Expected:
     - `<Foo /><Bar trigger />` logs `['Foo [0]', 'Bar', 'Foo [1]']` with one warning naming `Bar`.
     - Rendering it again logs `['Foo [1]', 'Bar', 'Foo [2]']` with no new warning.
   - Add `Counter`, which calls `store.update(c + 1)` while `c < 3`. It logs `Render: 0` through `Render: 3` with one warning.

3. **A hidden Activity reader renders the committed value directly (S8, #23).**
   - Setup: `text = createStore('A')`, `step = createStore(0)`. `Child` renders `<AsyncText text={use(text) + use(step)} />` inside `<Activity mode="hidden">`, with A0 resolved.
   - Steps: `startTransition(() => step.update(1))`, then `flushSync(() => text.update('B'))`.
   - Expected: `['Suspend! [B1]', 'Suspend! [B1]']`, never `B0`, and the output stays hidden `A0`. Resolving B1 logs `['B1']`.
   - Narrate that useState renders B0 first. DESIGN.md "Hidden trees" should then point at this test.

4. **Transitions on different stores stay independent, and stores that overlap entangle transitively.**
   - Part a: A and B each read their own store under separate Suspense boundaries.
     - `startTransition(() => a.update(1))` suspends on `A: 1`.
     - `startTransition(() => b.update(1))`. Resolving `B: 1` logs `['B: 1', 'Suspend! [A: 1]']`: B commits alone.
     - Resolving `A: 1` logs `['A: 1']`.
   - Part b: three stores, transitions A, A+B, B+C (from `ReactTransitionUseStore:581`). Resolving B or A still logs `['Suspend! [C]', 'Loading...']`; resolving C logs `['C']`.
   - Then one boundary suspended by both stores (`:324`) entangles them.

5. **The reducer call count through interruption and rebase (#4, S14).**
   - Setup: `createStore({}, merge)`, where each updater logs its letter.
   - Steps:
     - `startTransition` with updates a, b, c. Dispatching logs `['a']` (eager).
     - `waitFor(['b', 'c'])`.
     - Dispatch d, then `flushSync` with e and f, then `startTransition` with g.
   - Expected: the flush logs `['d', 'e', 'f']`. Then `waitForAll(['b', 'c', 'd', 'e', 'f', 'g'])`: a's eager state is reused, and nothing reruns at commit. The output is `abcdefg`.

6. **A reducer runs without a dispatcher, and runs once per HostRoot begin on error retries (S12, #24).**
   - Setup: `createStore(0, (s, a) => { if (a === 'ctx') return React.useContext(Ctx); if (a === 'hook') { useRef(0); } return s + 1; })`. A reader sits inside `<Ctx.Provider value="leaked">` with an error boundary.
   - Expected:
     - `store.update('ctx')` logs `Caught: Cannot read properties of null (reading 'useContext')`. The reducer never sees `leaked`.
     - Rendering a reader that dispatches `'hook'` during render gives one store-update-in-render warning and four invalid-hook-call warnings (concurrent render, sync retry, unwind to root).
   - Assert the count, or narrate it as "once per HostRoot begin".

7. **A store update only retries boundaries whose suspended children read it (S10).**
   - Setup: `Parent` reads `store` and renders `memo(() => <Suspense fallback={<FallbackReader />}><AsyncChild /></Suspense>)`. `FallbackReader` reads `store`; `AsyncChild` suspends and doesn't read it.
   - Steps: `store.update(1)` while the fallback shows.
   - Expected: `['Parent 1', 'Fallback 1']`, with no `Suspend!` or pre-warm of AsyncChild. With context, those would appear.
   - Add the B-18 "(nested)" shape too: an Indirection between the reading parent and the boundary doesn't re-render.

8. **Store updates take the event's priority.**
   - A `ContinuousEventPriority` store update (`ReactNoop.unstable_runWithPriority`) interrupts an in-progress transition: the `ReactUpdatePriority:243` shape. Expected: the continuous render commits first, and the resumed transition is a no-op.
   - An idle store update doesn't flush with a later default update (`:192`).
   - A store update from a passive effect that a sync update triggered gets the default lane (`:169`).
   - Put the popstate case (`ReactDOMFiberAsync:920`) and the discrete/continuous batching cases (`ReactInternalTestUtilsDOM:578`, :643) in `ReactDOMStore`.

9. **The startTransition update-count warning skips stores (#25).**
   - Setup: 11 or more readers, each with its own store, all updated in one `startTransition`.
   - Expected: `assertConsoleErrorDev([])`. Updating the same components through `useState` warns. This is the `ReactStartTransition:96` shape.

10. **The act warning for store updates (`ReactActWarnings:457`).**
    - With `IS_REACT_ACT_ENVIRONMENT = true`, an unwrapped `store.update(2)` warns "An update to App inside a test was not wrapped in act(...)", naming the reader.
    - Undefined or false: no warning.
    - Add the no-readers case (the PR_READINESS gap): the update schedules the HostRoot. Assert whatever it does, and narrate it.

11. **Keep the infinite-loop rejection (#28) and the not-mounted case (#10, S6).**
    - Move or keep `ReactDOMStore` "an update the root rejects for an infinite loop is not applied to the store" (L891) and "should not warn on updating function component from componentWillMount" (L498) in the kept part of `ReactDOMStore`.
    - Or rewrite them on ReactNoop in the spec: a layout effect that updates forever gives `rejects.toThrow('Maximum')`, and a new root then reads the last value that rendered.

12. **Profiler (`ReactProfiler:1368`, :1412).**
    - A layout effect calls `didMountStore.update(true)`, and a passive effect calls `didMountAndUpdateStore.update(true)`.
    - Expected: the log is `['false:false', 'true:false', 'true:true']`, and `onRender` phases are `mount`, `nested-update`, `update`.
    - Add the "Profiler next to a reader isn't reported" case (:1280).

13. **Selective hydration and the nested-update limit (`ReactDOMServerSelectiveHydration:1925`), in `ReactDOMStore`.**
    - Hydrate the shell of 100 Suspense children.
    - `flushSync(() => store.update(true))`.
    - Expected: no "Maximum update depth" error, and every child hydrates.

14. **Async actions after `useTransition` unmounts (`ReactAsyncActionsUseStore:670`).**
    - An async action updates two stores with an await in between.
    - Unmount the component that owns `useTransition` mid-action.
    - Expected: neither intermediate value renders until the action finishes; after that, a single commit.

15. **`use(store)` in a disallowed place (S13).**
    - Inside `useMemo` after a top-level read, it warns "Do not call Hooks inside useEffect(...), useMemo(...)…", and both top-level reads return `'light'`.
    - Inside an eager class `setState` updater, it throws.
    - Put the server variant (`ServerIntegrationHooksUseStore:415`) in `ReactDOMStore` or the Fizz cases (#19).

16. **Server render-phase updates (S5, #18), in `ReactDOMStore`.**
    - A component calls `store.update` during a server render.
    - Expected: the server HTML has the initial value and there's no server warning. The client warns once and renders the update after hydrating.

17. **Mounting during a suspended transition doesn't get stuck on the fallback** (ponyfill :1814).
    - A transition updates the store to a value whose reader suspends (`use(promiseFor(value))`). A new reader mounts urgently in the same tree.
    - Expected: the new reader renders the committed value and commits without a fallback. Then the transition retries, and both readers suspend while the committed content stays.

18. **A lower-priority store update survives a high-priority memo bailout (`ReactMemo:665`).**
    - `store.update(1)` followed by `discreteUpdates(() => root.render(<App />))`, where `memo(Counter)` reads the store.
    - Expected output: `'1'`.

19. **Eager bailout where useState would render (S11).**
    - Do a normal update, then an update to the same value while the reader's alternate still has lanes.
    - Expected: the log is `[]` with no render phase, no effect, and no extra commit. This is the `ReactHooksUseStore:323` shape.

20. **An entangled commit is the base for the next update (#6, B-9).**
    - Extend L1420: after `E` commits, `store.update(s => s + '!')` logs `['E!']`.

21. **A user insertion effect that updates a store warns (`ReactHooksWithNoopRendererUseStore:708`).**
    - Expected: "useInsertionEffect must not schedule updates.", while readers' internal subscriptions never trigger it.

22. **The profiler updater attribution (#26).** Pin the current "last scheduled reader" behavior with a narrated TODO, or explicitly leave it for the DevTools follow-up.

23. **Fast Refresh (#20).** Keep one or two cases in the integration set, as PR_READINESS decision 2.6 says: `ReactFreshBabelPlugin` "leaves use(store) out of signatures" and `ReactFreshIntegration` "reads the new store when an edit re-creates it".

24. **The memo-compare variant of B-10:** `use(store)` inside a `memo` `areEqual` throws "Invalid hook call". Low.

Also fix the stale references in DECISIONS.md: lines 51, 98 and 99, plus the file names at :95 and :263. They name deleted files (`parseHookNamesUseStore`, `indexUseStore.js`, `ReactFreshBabelPluginUseStore`, `ReactFreshIntegrationUseStore`, `ActivitySuspenseUseStore`, `ReactUpdatesUseStore`).

---

## 5. Delete list

### Dedicated copy files (whole file)

| File | Lines |
|---|---|
| `D/ReactUseStorePonyfill-test.js` (ponyfill port) | 2743 |
| `R/ReactSuspenseWithNoopRendererUseStore-test.js` | 1266 |
| `R/ReactSuspenseUseStore-test.internal.js` | 983 |
| `R/ReactContextPropagationUseStore-test.js` | 975 |
| `R/ReactTransitionUseStore-test.js` | 962 |
| `R/ReactHooksWithNoopRendererUseStore-test.js` | 893 |
| `R/ReactAsyncActionsUseStore-test.js` | 841 |
| `R/ReactHooksUseStore-test.internal.js` | 833 |
| `R/ReactNewContextUseStore-test.js` | 700 |
| `R/ReactSuspenseFuzzUseStore-test.internal.js` | 495 |
| `D/ReactDOMServerIntegrationHooksUseStore-test.js` | 450 |
| `R/ReactSameElementBailoutUseStore-test.js` | 278 |
| `R/ReactSameElementBailoutUseStoreContext-test.js` | 106 |
| **Total** | **11,525** (8,782 without the ponyfill) |

### `describe('use(store)')` blocks to strip

32 files, 5,290 block lines, from `git diff main...HEAD --numstat`:

| File | Block | Lines |
|---|---|---|
| `R/useMemoCache-test.js` | 678–1152 | 475 |
| `R/ReactUse-test.js` | 2351–2744 | 394 |
| `R/ReactUpdaters-test.internal.js` | 474–823 | 350 |
| `R/ReactExpiration-test.js` | 772–1079 | 308 |
| `R/Activity-test.js` | 1632–1907 | 276 |
| `R/ReactMemo-test.js` | 460–730 | 271 |
| `R/ReactDeferredValue-test.js` | 1147–1411 | 265 |
| `packages/react-refresh/src/__tests__/ReactFresh-test.js` | 2755–3017 | 263 |
| `R/ActivitySuspense-test.js` | 602–840 | 239 |
| `packages/react-refresh/src/__tests__/ReactFreshIntegration-test.js` | 2243–2459 | 217 |
| `R/ReactIncrementalUpdates-test.js` | 689–889 | 201 |
| `R/useEffectEvent-test.js` | 1261–1451 | 191 |
| `packages/react/src/__tests__/ReactProfiler-test.internal.js` | 1272–1454 | 183 |
| `R/ReactSuspenseEffectsSemanticsDOM-test.js` | 579–734 | 156 |
| `R/ReactTransitionTracing-test.js` | 2572–2719 | 148 |
| `packages/internal-test-utils/__tests__/ReactInternalTestUtilsDOM-test.js` | 570–707 | 138 |
| `R/ReactIncrementalScheduling-test.js` | 317–454 | 138 |
| `R/ReactUpdatePriority-test.js` | 157–288 | 132 |
| `R/ReactIncrementalErrorHandling-test.internal.js` | 1923–2047 | 125 |
| `R/ReactInterleavedUpdates-test.js` | 137–251 | 115 |
| `R/ReactDefaultTransitionIndicator-test.js` | 481–588 | 108 |
| `R/ReactFlushSync-test.js` | 346–442 | 97 |
| `D/ReactDOMServerSelectiveHydration-test.internal.js` | 1913–1977 | 65 |
| `packages/react/src/__tests__/ReactStartTransition-test.js` | 84–144 | 61 |
| `R/ReactActWarnings-test.js` | 445–504 | 60 |
| `D/ReactDOMFiberAsync-test.js` | 910–965 | 56 |
| `D/ReactDOMServerIntegrationUserInteraction-test.js` | 444–495 | 52 |
| `R/ReactBatching-test.internal.js` | 174–222 | 49 |
| `D/ReactDOMForm-test.js` | 2406–2451 | 46 |
| `packages/react/src/__tests__/ReactStrictMode-test.js` | 573–616 | 44 |
| `R/ActivityStrictMode-test.js` | 357–394 | 38 |
| `packages/react-refresh/src/__tests__/ReactFreshBabelPlugin-test.js` | 565–593 | 29 |

Kept blocks, not in the delete list:

- `ReactFlight` 4564–4603 (40 lines);
- `ReactDOMFizzServer` 10949–11062 (114 lines in the working tree; 60 at HEAD);
- `ReactMarkupClient` 240–255 and `ReactMarkupServer` 276–297;
- `DevToolsFacade` 2431–2499, `inspectedElement` 3314–3365, `profilingCache` 1433–1667, `parseHookNames` 916–930. Keep `__source__/__untransformed__/ComponentWithUseStore.js` (26 lines) with parseHookNames: it's that test's fixture (`parseHookNames-test.js:926`).
- **Ambiguous "Fizz":** `D/ReactDOMFizzShellHydration-test.js` 839–987 (149 lines) and `D/ReactDOMFizzStaticBrowser-test.js` 2952–3019 (68 lines). Decide whether these count as Fizz store cases. If not, add them to the strip list. Before stripping ShellHydration, see §3 on hydration replay.

### Flags: things the keep list should keep, or that aren't copies

- **`D/ReactDOMStore-test.js` "folded copies" (L402–925) has cases that aren't "core" but pin real behavior.** Keep or move:
  - "infinite update loops" (L889–923, #28);
  - "should not warn on updating function component from componentWillMount" (L498, #10, S6);
  - "warns about potential infinite loop if there's a synchronous render phase update on another component" (L534).

  The rest (L424, L455, L593, L706, L766) look droppable. L766 "should hydrate controlled radio buttons" is the only store-in-hydration controlled-input case besides the UserInteraction block.
- **Not copies; they go with the same-element bailout PR (DCP-10), not this cleanup:**
  - `R/ReactSameElementBailout-test.js` (274 lines, the DCP-10 spec);
  - the `ReactFresh-test.js` hunk at L467–524, "updates a child whose parent returns a memoized element". It's outside the use(store) block, and DECISIONS DCP-10 cites it.

  The two `ReactSameElementBailoutUseStore*` files are copies of that spec. Delete them, or keep one store case in the bailout PR as its motivation.
- **ESLint tests:** `ESLintRuleExhaustiveDeps-test.js` (+51), `ESLintRulesOfHooks-test.js` (+36), `ReactCompilerRuleTypescript-test.ts` (+32). They have no use(store) describe block. They're the only lint coverage for stores (`store.update` isn't stable when the store is a prop; `createStore` and `store.update` aren't Hooks). Keep them; this is PR_READINESS split item 6.
- **Fast Refresh:** keep one or two of the Fresh blocks (#20, S16), as PR_READINESS decision 2.6 says. The briefed keep list leaves them out.
- **`R/ReactUseStoreLegacyMode-test.js` rewrite (1945 lines, 33 tests → about 6).** Keep these three, which pin store behavior:
  - L426 "should queue updates from during mount" (the DCP-5/B-5 legacy pin);
  - L1824 "a reader that committed next to a sibling that suspended on mount renders store updates";
  - L1878 "a mounted reader that suspends on an update renders store updates".

  Also add one assertion that a legacy-root store update is synchronous (the `requestStoreUpdateLane` LegacyRoot branch).
- **The ponyfill port's unique content** is #27 (covered) and #17 in §4 (not covered). Its other DIFFERS notes (no fixup render, dynamic stores, polymorphic `use()` error) are covered by spec L298, L350, L826 and by the use() typing. Low.
- **Before deleting, spec L1492 should get the rebase case (§4.5),** because DECISIONS:79 already cites L1492 for behavior it doesn't test.
