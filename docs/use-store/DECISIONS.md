# use(store) decision log

Append-only. Each entry records a design change (DCP) or a notable decision, why, and the tests that pin it.

## DCP-1: Lane-tagged update queue per store per root (replaces the two-slot model)

- **Status:** accepted (2026-10-30)
- **Problem:** The v0 design kept per-root `current`/`sync`/`transition` slots. This entangles all urgent lanes per store, needs a separate render-consistency check for interleaved updates, and can't compute the committed value for suspended commits or partial lane commits.
- **Decision:** Each root keeps a `StoreRecord` with a base state and a chronological queue of `{lane, action, seq}` updates. Reads apply the same skip/rebase rules as `updateReducerImpl`, once per store per root (cached per render), not once per component. Commits fold the committed lanes into the base state, the same way `useReducer` computes its new base state.
- **Interleaving:** every update gets a monotonically increasing `seq`. `prepareFreshStack` stores the current seq on the root (`root.storeRenderSeq`), and reads ignore later updates. This mirrors how concurrent updates to `useState` are invisible to an in-progress render. No consistency check or sync de-opt is needed.
- **Risk register:** this is the R2 fallback. It also resolves R3 (there is no restart loop) and R6 (commit work is skipped when `record.lanes ∩ committedLanes` is empty).
- **Pinned by:** `ReactUseStore-test.js`: "does not miss updates dispatched while a concurrent render is in progress", "never commits readers showing different versions of the store", "a sync update interrupts a transition and is rebased".

## DCP-2: Subscribe through an internal insertion effect

- **Status:** accepted (2026-10-30)
- **Decision:** `use(store)` pushes an insertion effect onto the fiber's effect list. There is no hook slot, so conditional reads still work. A store that was read in the previous render but not this one gets a cleanup-only effect. Insertion effects run synchronously in the mutation phase, so updates from layout effects aren't missed. Activity doesn't disconnect them, so hidden readers keep receiving updates at offscreen priority. Deletion cleanup comes for free.
- **Catch-up:** updates dispatched between render and commit (`seq > read seq`) are caught up with `enqueueConcurrentRenderForLane`. The root already has those lanes pending, so there's no `scheduleUpdateOnFiber` call inside the insertion effect.
- **Why not a new fiber flag:** the flag bits are nearly exhausted (see `ReactFiberFlags.js`).
- **Pinned by:** the layout/passive effect tests, "can be read conditionally", "readers in a hidden Activity update in the background", and "stops updating unmounted readers and releases the root".

## DCP-3: Joining in-flight transitions through skipped lanes

- **Status:** accepted (2026-10-30)
- **Decision:** when a read skips updates for lack of priority, merge their lanes into `currentlyRenderingFiber.lanes` and call `markSkippedUpdateLanes`, exactly like `updateReducerImpl`. A reader that mounts synchronously mid-transition re-renders with the transition. There is no fixup render and no `SomeTransitionLane`.
- **Pinned by:** "a reader that mounts during a transition shows the committed value, then updates with the transition" and "a reader that mounts during a non-blocked transition joins it".

## Decision: Root-level scheduling always goes through the concurrent queue

- An update with no subscribed readers still schedules the HostRoot with `enqueueConcurrentRenderForLane(root.current, lane)`. This makes sure the lane commits and is folded into the base state. It has to go through the concurrent queue so that an in-progress render doesn't mark the lane finished (`commitRoot` only keeps concurrently updated lanes pending).
- **Found by:** "does not miss updates dispatched while a concurrent render is in progress".

## Decision: Records are dropped at commit

- `commitStoreRecords` drops a record when it has no readers and wasn't read by the committing render (`readSeq < storeRenderSeq`). The store then no longer references the root, which keeps roots GC-able.
- **Pinned by:** "stops updating unmounted readers and releases the root" and "works with multiple roots".

## DCP-4: The initial value is the server snapshot

- **Status:** accepted (2026-10-30)
- **Problem (B-6):** a store update while a reader was still dehydrated caused a hydration mismatch. Readers only subscribe when they commit, so the update committed before the reader hydrated and then read the new value against the server's HTML. Unlike context, a store can't route the update through the dehydrated boundary, because the root doesn't track which boundaries contain readers.
- **Decision:** the value a store is created with (`_initial`) is what the server renders and what the client hydrates with. Fizz reads `_initial`, and hydrating readers read `_initial`. After a reader hydrates, if the committed value differs, it re-renders at SyncLane. This is the model `useSyncExternalStore` uses with `getServerSnapshot`, with the initial value as the server snapshot.
- **Consequence:** updates to a store on the server aren't rendered. To server render a different value, create the store with it, e.g. from serialized data on both sides. The same rule was found by the react-concurrent-store ponyfill (PR #26, "the initial value IS the snapshot").
- **Pinned by:** `ReactDOMStore-test.js` ("hydrates with the initial value of the store", "a store update before a dehydrated reader hydrates does not cause a mismatch", "the server renders the initial value, not updates"), and the partial hydration copies.

## DCP-5: Subscription catch-up runs after the mutation phase

- **Status:** accepted (2026-10-30)
- **Problem (B-5):** catching up on missed updates from inside the insertion effect called `enqueueConcurrentRenderForLane` while a newly inserted parent still had its Placement flag. That triggered the DEV "hasn't mounted yet" warning.
- **Decision:** `subscribeToStoreRecord` only registers the reader and queues a catch-up. `flushStoreCatchUps` runs right after `root.current = finishedWork`, when Placement flags are cleared and the tree is consistent. It also schedules hydration catch-ups, which need a new lane, so they can't be scheduled from an insertion effect.
- **Pinned by:** "a reader inside a newly inserted host component catches up without warnings" (`ReactDOMStore-test.js`), and `ReactUpdatesUseStore` "should queue updates from during mount".

## DCP-6: The reducer runs as often as it does for useReducer

- **Status:** accepted (2026-10-30)
- **Problem:** the store ran the reducer once eagerly for `_head`, again for the eager state, again during render, and again at commit. The copies of `ReactIncrementalUpdates` log updater calls and showed the extra entries.
- **Decision:**
  - `_head` is computed lazily while any root reads the store. Actions queue in `_headQueue` and fold when a new root needs the head. The queue is dropped once every record's queue is empty, which keeps it bounded.
  - Updates carry an eager state, computed only when the record's queue is empty, like `useState`. Reads reuse it when the base matches.
  - The commit reuses the cached read when it applied exactly the committed updates.
- **Result:** the reducer runs once per update at dispatch when the queue is idle (useState's eager state), and otherwise during render.

## DCP-7: Store updates during render warn, and are rendered after the render

- **Status:** accepted (2026-10-30)
- **Problem:** a component that called `store.update` during its own render got "Cannot update a component (`X`) while rendering a different component (`X`)", because the update scheduled the reading fiber. When no reader was subscribed, it scheduled the HostRoot and didn't warn at all.
- **Decision:** a store is shared, so updating it during render is a side effect, even when the rendering component reads the store itself. Every render-phase `store.update` warns once per rendering component with a store-specific message ("Cannot update a store while rendering a component..."). The update gets a `seq` after the render's, so it's rendered after the current render, like an update to another component. It schedules the HostRoot, so the generic warning doesn't fire. The render-phase update persists if the render is discarded.
- **Not supported:** `useState`'s "derive state during render" pattern, for stores. Infinite render-phase update loops behave like updating another component in render.
- **Pinned by:** "warns when a store is updated during render, and renders the update after".

## Decision: Store updates never warn about unmounted or not-yet-mounted components

- An update isn't tied to a fiber, so there's nothing unmounted to warn about. Copies drop those assertions with a `store-semantics` annotation.

## Fixes from the copy campaign (2026-10-30)

- **Only transition lanes are entangled** (`record.transitionLanes`, like `queue.lanes`). An urgent update followed by a transition on the same store render separately. Pinned by "a transition does not entangle with a pending urgent update to the same store".
- **The commit folds the entangled render lanes** (`root.storeRenderLanes`, set in `prepareFreshStack`), the same lanes the reads used. Before, an update in an entangled lane could be rendered, left in the queue, and then reverted by the next update.
- **The read caches the new base state**, so the commit doesn't re-run the reducer when the render skipped updates. Pinned by "runs the reducer as often as useReducer".
- **`use(store)` outside a function component** throws the invalid hook call error, not a TypeError.
- **Reducer errors:** the eager compute is try/caught, a throwing update with no readers is kept in the head queue, and a reducer that throws during the commit leaves its update in the queue. In every case the error is thrown during render, where error boundaries handle it. In DEV, reducers run under the invalid-nested-hooks dispatcher, like `useReducer`. Pinned by "throws a reducer error during render, not when the store is updated".

## Decisions (2026-10-30, later)

- **Fizz checks:** `use(store)` on the server calls `resolveCurrentlyRenderingComponent()`, so it throws in classes and warns inside `useMemo`, like the client. In `renderToHTML` (react-markup), where nothing is hydrated, it throws "Cannot use state or effect Hooks in renderToHTML...", like `useState`.
- **No transition update-count warning for stores.** `requestStoreUpdateLane` doesn't add to `transition._updatedFibers`. That warning tells userland subscriptions to use React primitives, and stores are the primitive.
- **The DOM spec suite is renamed** to `ReactDOMStore-test.js`. Its old name was the copy path of `ReactDOM-test.js`.
- **StrictMode double-invokes store reducers** (found by copies-react-pkg). In DEV, when the reading component renders in StrictMode, `readStoreRecord` calls the reducer an extra time for each applied update, like `updateReducerImpl` does, even when the update has an eager state.
- **`store.update` warns in DEV when passed a second function argument**, like `setState`/`dispatch`. The message is "store.update() doesn't support a second callback argument..." `store.update.length` stays 1.
- **Follow-up (not blocking):** with `enableUpdaterTracking`, a store update reports only one reader (the fiber passed to `scheduleUpdateOnFiber`) as the profiler's "updater". A store update has no updating component. Reporting every reader would need a per-reader `addFiberToLanesMap` call; revisit with the DevTools work.
- **DevTools inspection:** `use(store)` is seeded in the debug-tools primitive stack cache, so it shows as `Use` with a hook source, nested under custom hooks. It gets `id: null` because it takes no hook slot (before, it shifted the ids of later hooks and broke `overrideHookState`).
- **Store values aren't editable through DevTools' `overrideHookState` in v1.** A store is shared by every reader, not component state. Store editing in DevTools is a follow-up.
- **Follow-up (DevTools):** the Profiler's "Why did this render?" reports a store-driven render as "The parent component rendered." `DevToolsFiberChangeDetection` only looks at the hook list, and store reads live on `fiber.updateQueue.storeReads`. Fix it with the DevTools store editing work, e.g. by comparing the `storeReads` values of the previous and next fiber. Found by copies-devtools; no original test asserts it.
- **No warning for `store.update` during server rendering** (raised by copies-dom-server). Because Fizz renders `_initial` (DCP-4), an update during SSR only changes `_head`. It can't change this request's HTML or a later request's, so a module-level store doesn't leak across requests through rendering. Fizz never runs store reducers, so a reducer that reads context has nothing to warn about on the server.
- **Fast Refresh:** the Babel plugin doesn't include `use(store)` in a component's refresh signature, because it only counts `use[A-Z]` calls. That's correct: `use(store)` holds no component state, so renaming or adding a store read never remounts. A component whose only hook is `use(store)` is treated like a hookless component, so `/* @refresh reset */` has nothing to reset. A store keeps its value across edits unless it's created in the edited module, in which case re-executing the module creates a new store. Found by copies-refresh, and pinned by `ReactFreshBabelPluginUseStore` and `ReactFreshIntegrationUseStore`.
- **DevTools profiler detects store changes** (B-16, from copies-devtools; this resolves the earlier follow-up). Store reads have `displayName: 'Store'` in react-debug-tools, so the HooksNode name is `Store`, like `use(context)` shows the context's name. `DevToolsFiberChangeDetection.didStatefulHookChange` treats `Store` nodes as stateful. "Why did this render?" now reports the store read as a changed hook.
- **The DevTools inspector shows hooks for store-only components** (B-17, from copies-devtools). The backend's `usesHooks` check only looked at `memoizedState` and `dependencies`. A component whose only "hook" is `use(store)` had `hooks: null`. `readsStore(fiber)` now checks `fiber.updateQueue.storeReads`.
- **Follow-up (DevTools hook names):** `const count = use(countStore)` gets no variable name in DevTools, because hook-name parsing only names calls that match `/^use[A-Z0-9]/` (`isHookName` in `astUtils.js`, `generateHookMap`). The same is true for `use(context)` and `use(promise)` today. Suggestion: name a bare `use` callee like `useContext`. A related bug: with extended source maps, a `use(...)` nested in a `useMemo` callback gets the enclosing component's name, while source parsing gives `null`. Both are pinned with store-semantics notes in `parseHookNamesUseStore-test.js`. Found by copies-devtools-hooks.
- **Fixture maintenance gap:** the compiled `*UseStore*` hook-name fixtures were generated with the same `compile()` that `yarn update-mock-source-maps` uses (in `react-devtools-shared`). That script's bundle step only builds `index.js`, so running it would delete `__compiled__/bundle/indexUseStore.js`. Teach it about `indexUseStore.js` before landing.

## DCP-8: One subscription effect per component, pushed only when the set of stores changes (amends DCP-2)

- **Status:** accepted (2026-10-30)
- **Problem:** profiles of the `selection` benchmark (every row reads the selected id, 2 of N rows change) showed the per-`use(store)` bookkeeping, not the reducer or the store, as the cost that grows with the number of reads. Each read allocated a `{record, value, seq, isHydrating, inst}` object and pushed an insertion effect on every render, and matching reads against the previous render was O(k²). With 4 reads per row, `use()` was about 25% of the update's self time; with 1 read, about 5%.
- **Decision:**
  - `updateQueue.storeReads` is a flat list of `record, value` pairs. `use(store)` only dedupes and appends. `finishStoreReads` compares the list with the previous render's in one pass, position by position first. A changed value or a different set of stores calls `markWorkInProgressReceivedUpdate`, as before. The comparison moved out of `use()`, except when the record read a pending async action (`didReadEntangledStoreAction`), where `use()` still suspends during render.
  - A component has one effect instance for all its stores (`updateQueue.storeInst`, carried from render to render). The insertion effect is pushed only when the set of stores changes (mount, a store added or dropped). It cleans up the previous subscriptions, then subscribes to the whole new set and queues one catch-up (DCP-5) for the component. Re-subscribing a store that's still read is redundant but harmless: any update dispatched since the render started already scheduled the component through its old subscription.
  - Renders that read the same set of stores, in any order, push no effect. Because the effect may not be in the last render's effect list, deletion cleans up `storeInst` directly (`unsubscribeFromStoresOnDeletion`, called next to the insertion-effect unmount in `commitDeletionEffectsOnFiber`). This replaces "deletion cleanup comes for free" from DCP-2.
  - Everything else in DCP-2 holds: no hook slot, insertion-effect timing, not disconnected by Activity.
- **Why not skip the effect without the deletion hook:** an effect without `HasEffect` only exists so that deletion finds it. Pushing it on every render cost an allocation per reading component per render.
- **Pinned by:** the DCP-2 tests, plus "unsubscribes on unmount after re-rendering with the same stores", "keeps subscriptions when the same stores are read in a different order" and "subscribes to an added store and unsubscribes from a dropped one, keeping the rest".

## DCP-9: Commits visit only the records with updates or without readers (amends "Records are dropped at commit")

- **Status:** accepted (2026-10-30)
- **Problem:** `commitStoreRecords` looped over every record of the root on every commit, and then over all of them again to sync the head. The cost grew with the number of stores, not with the work: 1,000 per-entity stores cost about 2% of every update, and more at 10k.
- **Decision:** the root keeps two lists instead of `root.storeRecords`:
  - `pendingStoreRecords`: records with updates in their queue. A record is added on its first queued update and removed once its queue is empty. Only these are folded at commit, and only these sync the head.
  - `unsubscribedStoreRecords`: records that may have no readers. A record is added when it's created (nothing has subscribed yet) and when its last reader unsubscribes. At commit, a record with readers leaves the list; a record with no readers that the committing render didn't read is dropped, exactly as before; a record that the committing render read stays for the next commit, because its readers subscribe later in this commit.
- **Head sync on eager bailouts:** the old loop also synced the head of stores that had no queued updates, which covered `store.update()` calls that bailed out eagerly (DCP-6 keeps `_headQueue` bounded that way). An eager bailout now syncs the head itself (`syncStoreHead`) when every record's queue is empty. That's safe because every record with an empty queue has applied every dispatched action, so its base state is the head.
- **Pinned by:** "stops updating unmounted readers and releases the root", "works with multiple roots", "can be read conditionally", and "drops the records of stores that are no longer read, among many".

## Decision: Store updates mark readers without walking to the root from each one

- Readers subscribe when they commit and unsubscribe when they're deleted, so every reader is mounted on the record's root. `dispatchStoreUpdate` marks each reader with `enqueueConcurrentRenderForLaneOnMountedFiber` (the concurrent queue, without `getRootForUpdatedFiber`) and checks for infinite update loops once per dispatch. The lanes still go through the concurrent queue, so in-progress renders aren't affected.

## DCP-10: Skip reconciling a function component's child when it returns the same element (`enableSameElementBailout`)

- **Status:** accepted behind its own flag (2026-10-30): `__EXPERIMENTAL__` in OSS, `__VARIANT__` on www, off in React Native and the test renderers.
- **Problem:** without selectors, every reader of a changed store re-renders, and the React Compiler keeps that cheap by returning the memoized element. The reconciler still reconciles it, though: it clones the child fiber, begins it, sees the same props and bails out, then completes it. In the `selection` benchmark that was about 60 ns of the ~220 ns per row. It's the main reason use(store) + compiler was slower than Zustand, whose rows don't re-render at all. Context pays the same cost.
- **Decision:** in `updateFunctionComponent`, after rendering, if the component returned a single element with the same props object, `type` and `key` as its only current child, call `bailoutOnChildren` (the part of `bailoutOnAlreadyFinishedWork` that checks `childLanes`, propagates context lazily and clones children with work) instead of `reconcileChildren`.
- **Why it's the same as the normal path:** with the same props object, the child would reach `beginWork` with `oldProps === newProps` and bail out. Case by case:
  - **Pending work on the child or below** (`lanes`/`childLanes`): `bailoutOnChildren` clones the children and continues when `workInProgress.childLanes` includes the render lanes, which covers the child's own lanes. Tested: "still renders a child that has its own pending update".
  - **New context:** `bailoutOnChildren` calls `lazilyPropagateParentContextChanges` before deciding, the same as the child's own bailout would. Tested: "propagates a context change to consumers below the child".
  - **Legacy context:** excluded (`hasLegacyContextChanged()`), because the child's `beginWork` re-renders on a legacy context change.
  - **The component's own render is kept:** unlike `bailoutOnAlreadyFinishedWork`, `bailoutOnChildren` doesn't reset `dependencies` to the current fiber's, doesn't stop the profiler timer, and doesn't touch hooks, flags or effects. `didReceiveUpdate` was already true to get here, and nothing after this point reads it. Tested: "keeps the context dependencies of the render that bailed out", "runs the effects of the render that bailed out", and "records the render time of a component that bailed out of its child". The first and last fail if `bailoutOnAlreadyFinishedWork` is used instead.
  - **Refs:** refs are props, so the same props object means the same ref. A new ref makes a new element. Tested: "attaches a new ref when the element changes".
  - **Fast Refresh:** in DEV, excluded when `resolveTypeForHotReloading(child.type) !== child.type`, so the child is reconciled and `createWorkInProgress` picks up the new implementation. Fresh also schedules the fibers of every updated family, so this is defensive. Tested in `ReactFresh-test`: "updates a child whose parent returns a memoized element".
  - **DEV owner, debug info and stack:** the child fiber isn't touched. The same element would have set the same `_debugOwner`, `_debugStack` and `_debugTask`.
  - **Profiler:** the parent's `actualDuration` is recorded in `performUnitOfWork` as usual. `bubbleProperties` takes the bailed-out branch for the uncloned child and adds its `treeBaseDuration`.
  - **StrictMode:** the double render happens inside `renderWithHooks`; the check uses the final result.
  - **Hydration:** excluded (`getIsHydrating()`).
  - **The child's type:** only `FunctionComponent`, `ForwardRef`, `MemoComponent`, `SimpleMemoComponent`, `ClassComponent` and `HostComponent`. Those do no bookkeeping in `attemptEarlyBailoutIfNoScheduledUpdate` that matters when they and their subtree have no work. Profiler (sets flags for onRender/onPostCommit), Suspense (fallback retries on a context change, dehydrated boundaries), SuspenseList, Offscreen/Activity, LegacyHidden, ViewTransition, portals, fragments and everything else take the normal path.
  - **Previous render with several children, or a fragment:** excluded (`child.sibling !== null`). A top-level fragment's props are never a child fiber's `memoizedProps`. Tested: "takes the normal path when the previous render had more than one child".
- **Why a flag:** it isn't specific to stores; it runs for every function component, so it needs its own rollout.

## Finding: what's left of the gap to Zustand is the reconciler, not the store (2026-10-30)

- With DCP-8 and DCP-9, `selection` at N=1k (compiled, 1× CPU) went from about 0.26 to 0.22 ms per update. Zustand is about 0.19.
- Most of what's left is re-rendering 1,000 rows whose compiled output didn't change: for each row, the reconciler reconciles the memoized `RowView` element, clones its fiber, begins it and bails out, then completes it. That's about 45 µs per update at 1k, and it's the same for context.
- A prototype in `updateFunctionComponent` that skips reconciling when a component returns the exact element its only child was rendered with (same props object, type and key) brings `store` to Zustand's time and `store-single` and `context` below it. It landed behind its own flag as DCP-10 (`enableSameElementBailout`). The prototype patch was removed.

## DCP-11: Records are dropped after the mutation phase, and only when their queue is empty (amends DCP-9 and "Records are dropped at commit")

- **Status:** accepted (2026-10-30). From the code review (`research/code-review.md`, H1, M1, M2).
- **Problem:** the sweep of `unsubscribedStoreRecords` ran in `commitRoot`, before the mutation phase. Readers subscribe and unsubscribe during the mutation phase, so the sweep used `record.readSeq` to guess which records the committing render read. That caused three defects:
  - Hydrating reads didn't update `readSeq`. A hydration commit could drop a record, and then the hydrated reader subscribed to the dropped record in the same commit. After that, updates never reached the reader.
  - A record was only dropped by the *next* commit after its last reader unmounted. `root.unmount()` has no next commit, so every store kept the dead root until the store updated again.
  - A record with pending updates could be dropped. A reader that mounted later in an urgent render recreated the record from `_head`, which includes the pending transition's update.
- **Decision:** `flushStoreSubscriptions` sweeps right after the mutation phase, where `flushStoreCatchUps` used to run. A record with no readers is dropped if its queue is empty. If its queue isn't empty, it stays in the list until the commit that empties it. `readSeq` is deleted.
- **Pinned by:**
  - `ReactUseStore-test.js`: "stops updating unmounted readers and releases the root" (now asserts the drop in the unmounting commit), "a reader that mounts after the last reader unmounted does not see a pending transition early", and "drops the records of stores that are no longer read, among many";
  - `ReactDOMStore-test.js`: "releases the root when it unmounts, without another store update" and "a hydrated reader keeps updating when an unrelated store updated before it hydrated".

## DCP-12: Hydrating reads compute the client value (amends DCP-4)

- **Status:** accepted (2026-10-30). From the code review (H2).
- **Problem:** a hydrating reader returned `_initial` without reading its record, so it never merged skipped lanes into its fiber. The catch-up compared `_initial` with the *committed* value and only looked at updates dispatched after the render. A transition dispatched before a boundary hydrated, and still pending when it did, never scheduled the hydrated reader. The transition then committed two versions of the store, and the hydrated reader stayed stale.
- **Decision:** a hydrating read calls `readStoreRecord` like any read, merges the skipped lanes into the fiber, and returns `_initial`. If the client value differs from `_initial`, the component is marked stale. After the mutation phase, a stale component renders again at SyncLane, the same model as `useSyncExternalStore` with `getServerSnapshot`. `getCommittedStoreState` is deleted.
- **Pinned by:** "a reader that hydrates while a transition is pending joins the transition" (`ReactDOMStore-test.js`), plus the existing hydration tests.

## DCP-13: Every read in a render uses the root's entangled lanes (amends B-4)

- **Status:** accepted (2026-10-30). From the code review (M3).
- **Problem:** reads used the hook's `renderLanes`, which is the work loop's `entangledRenderLanes`. That isn't uniform across a render: `pushHiddenContext` adds an Offscreen's `baseLanes` while a hidden tree is revealed. Readers inside a revealed Activity or Suspense tree applied pending updates that the readers outside skipped, and one commit showed two versions of the store.
- **Decision:** reads use `root.storeRenderLanes`, the entangled lanes set in `prepareFreshStack`, which is also what the commit applies. Updates in a revealed tree's base lanes were folded into the base state when those lanes committed, so reads don't need the base lanes. Pending ones are skipped and merged into the fiber's lanes, like any skipped update.
- **Consequences:** every read in a render has the same `(seq, lanes)` key. New updates don't invalidate the cache: they always come after every render that has started, so no read includes them. Only the commit clears the cache. `version` and `cachedVersion` are deleted. `cachedDidReadEntangledAction` is deleted too: the rare check runs only while an async action is pending (`didReadStoreUpdateInLane`).
- **Pinned by:** "readers inside a revealed Activity read the same version as the rest of the tree".

## DCP-14: Reducer errors (amends B-11)

- **Status:** accepted (2026-10-30). From the code review (M4).
- **Problem:** a throwing update was kept forever: as a `NoLane` clone in the record, or in `_headQueue` when nothing read the store. Every later update was appended behind it, and remounting threw again. The store could never recover, and `_headQueue` grew without bound.
- **Decision:**
  - **With readers:** unchanged, the error throws during render. A read caches the error, so every reader in the render throws it without running the reducer again. The commit drops the update that threw, the way an error boundary drops the update queue of a useReducer Hook it unmounts.
  - **An error no component rendered:** for example, when the only reader is hidden, the commit applies the update before anything reads it. The commit reports the error with `reportGlobalError` and drops the update.
  - **No root reads the store:** `store.update()` throws the error and doesn't apply the update, because there's no render to throw it in. Before this, the update was deferred to a later render.
  - **Folding `_head`:** `getStoreHead`, now one helper in `shared/getStoreHead.js` shared by the store, the reconciler and react-debug-tools, skips updates that throw. Each root that had a record when the update was dispatched handles the error itself.
- **Pinned by:**
  - "throws a reducer error during render, not when the store is updated" (unchanged);
  - "drops an update whose reducer throws once an error boundary handles it";
  - "reports a reducer error that no component rendered, and drops the update";
  - "throws a reducer error from store.update when nothing reads the store".

## DCP-15: Subscribing catches up on every pending lane of the store (amends DCP-5)

- **Status:** accepted (2026-10-30).
- **Decision:** when a component or boundary subscribes, it's marked with `record.lanes`, every lane the store has pending, through `enqueueConcurrentRenderForLaneOnMountedFiber`, inline in the insertion effect. That replaces the post-mutation scan for updates with a later `seq`. It's equivalent for readers:
  - the updates the render included already committed and left the queue;
  - the ones it skipped are already in the fiber's lanes;
  - the rest were dispatched after the render.
  It also covers boundaries, whose readers' skipped lanes were thrown away (DCP-16). The concurrent queue walks to the root when the next render starts, so no "hasn't mounted yet" warning fires (B-5), and there's no per-update scan. Only stale hydrated readers (DCP-12) still wait for the end of the mutation phase, because they need a new lane, which can't be scheduled from an insertion effect.

## DCP-16: A Suspense boundary subscribes to the stores its suspended primary children read (resolves B-18)

- **Status:** accepted (2026-10-30).
- **Problem:** B-18. A reader that suspends while its boundary shows a fallback is thrown away, so it never subscribes. A store update didn't retry the boundary, and `use(use(store))` with a never-resolving promise hung.
- **Decision:**
  - When a component suspends, `throwException` collects the stores read by the component and by the components above it, up to the nearest Suspense boundary (`collectStoreReadsOfSuspendedTree`). Those are the reads that can change what the suspended component renders. Siblings that rendered before it can't unsuspend it, so their reads aren't collected. (Context is more conservative: a context update marks every client-rendered boundary below the Provider that's showing a fallback, because the primary children's fibers may not exist, so it retries regardless of who read what. Corrected 2026-11-01; an earlier version of this entry said context doesn't retry for those siblings.)
  - This happens on the suspend path only. `use(store)` itself does no extra work.
  - When the boundary renders its fallback, the reads go on its `SuspenseState` (`storeReads`). Without new reads, a boundary that's still showing its fallback keeps the previous state, and so its subscriptions. Without store reads, the state is still the shared `SUSPENDED_MARKER`.
  - In the mutation phase, the boundary subscribes to those records (`commitSuspenseStoreReads`), with the catch-up from DCP-15. It unsubscribes when its primary children commit or when it's deleted (a new `SuspenseComponent` case in `commitDeletionEffectsOnFiber`).
  - A store update marks the boundary with the update's lane, like context propagation marks suspended boundaries. The boundary re-renders, retries its primary children, and they read the new value.
- **Deviation from the review's suggestion:** the reads are collected when the component suspends, along its return path, rather than on every `use(store)` through `getSuspenseHandler()`. That keeps the hot path unchanged. The reads are stored on the boundary's `SuspenseState` rather than its retry queue, because the retry queue is consumed by the commit and isn't available at deletion.
- **Pinned by:**
  - `ReactUseStore-test.js`: "a store update retries a boundary whose reader suspended on mount", "a store update retries a boundary whose new reader suspended during an update", and "a boundary waiting on a store unsubscribes when it unmounts";
  - the two `ReactContextPropagationUseStoreContext` cases that were gated on B-18, now un-gated.

## Decisions from the code review (2026-10-30)

- **The subscription keeps only the records**, not the values that were read. The destroy closure used to capture the pairs, which kept the mount-time values alive for as long as the component stayed subscribed (L1).
- **`use(store)` checks for repeated reads with an epoch on the record** (`readEpoch`) instead of searching the component's list of reads. A component that reads k stores is O(k), not O(k²) (L3).
- **StrictMode double invoke doesn't depend on read order.** A cached read that didn't double invoke is recomputed for a StrictMode reader (`cachedInStrictModeDEV`). Pinned by "double invokes reducers in StrictMode even when a reader outside StrictMode reads first" (L4).
- **Store updates are visible in the scheduling profiler.** Each scheduled reader gets `markStateUpdateScheduled` (L5).
- **Smaller cleanups:**
  - `StoreRecord` loses `isPending` (it was `firstUpdate !== null`), `version`, `cachedVersion`, `readSeq` and `cachedDidReadEntangledAction`.
  - `isRemoved` is checked once, at dispatch.
  - The `FunctionComponentUpdateQueue` store fields are required.
  - The DEV-only warning set is allocated in DEV only (L6).
- **Tests moved from scratch files:** "two stores rebase like one combined store when a sync update interrupts a transition", "a transition that updates two stores commits them together, even when they are read in separate subtrees", and "a value derived from several stores outside of render tears with a pending transition". The last documents that values computed outside render from several stores tear.

## Finding: `enableNoCloningMemoCache` doesn't help store-driven re-renders (2026-10-31; not applied)

- **Question:** every reader of a changed store re-renders, and `useMemoCache` clones the compiler's cache on every update render (`data.map(array => array.slice())`). Would sharing the cache instead (`enableNoCloningMemoCache`, added in #28878 as "[Experiment] Reuse memo cache after interruption") speed that up?
- **Measured:** the same final source with the flag on (`react-builds/final-nocl`) against off, 3 interleaved rounds each:
  - Sweeps (2 reads per row), store selection: 0.95–1.06.
  - Main suite, store selection: 0.86–1.40. Filter: 0.98–1.09. The zustand and redux controls moved 0.80–1.35 in the same cells.
  - That's no measurable effect. The ~20 ns/row the line profile charged to the clone came from the first touch of the current fiber's queue and cache, and those loads remain without the clone.
- **The safety question, for whoever decides on the flag:**
  - With the flag on, one cache instance is shared by the committed fiber and every render attempt. A render that's thrown away (it suspended, was interrupted by a higher priority update, or was abandoned) leaves its writes in the cache the committed tree will render from next.
  - **Values stay correct.** The compiler writes each memo block atomically: it computes the output, then stores the dependencies and the output together (`$[0] !== id ? (t1 = ..., $[0] = id, $[1] = t1) : t1 = $[1]`). Nothing that can throw sits between the two stores. A slot is only reused when its dependencies are `===` to the current ones, and the output is a function of those dependencies as long as render is pure. So a later render never sees an output that doesn't match its inputs.
  - **Identity isn't preserved across a discarded render.** Each slot holds one entry. Say a transition renders with new inputs and is abandoned, and the component then renders with the committed inputs again. The slots now hold the abandoned inputs, so every block recomputes, and objects, callbacks and elements get new identities even though the committed inputs didn't change. Consequences:
    - effects whose dependencies include memoized objects fire again;
    - `memo` children re-render;
    - the same-element bailout (DCP-10) misses.
    That's extra work, not wrong output, but it's observable. With cloning, the committed cache is untouched, so returning to the committed inputs reuses the committed values.
  - **Purity assumptions leak further.** If a memoized computation reads something mutable, its result from a discarded render can survive into later renders. With cloning, discarded writes disappear.
  - This is what "Test this at Meta before enabling" is protecting against. Given that it has no measured benefit for stores, there's no store-related reason to enable it.

## DCP-17: The HostRoot owns the state of every store on its root (2026-10-31; supersedes the record-local state of DCP-1, DCP-9 and DCP-13)

- **Why:** the record kept its own render model next to the fiber tree: a global seq for the render's cut, `root.storeRenderLanes`, a read cache, and a commit that recomputed the base state. Its lanes lived only on reader fibers (or on HostRoot with no update object behind them), so a commit could drop them: the only reader deleted before a transition rendered (#3a), or HostRoot rendering a different lane first (#3b). And it assumed one work-in-progress tree per root.
- **Model:** a record is split like a Hook.
  - **The record is the shared part,** like `hook.queue`: pending updates, `lanes`, `transitionLanes`, readers, `dispatch`.
  - **A `StoreState` is the state in one version of the tree,** like a Hook object: `baseState`, `baseQueue`, `memoizedState`, the skipped lanes, the reducer error, and whether it read the pending async action.
  - **The HostRoot owns the states:** `RootState.storeStates` holds the states its render processed, and `record.committed` is the state of the committed tree.
- **Updates go through the concurrent queue onto the HostRoot,** with a real update object, so a render that's in progress never sees them (no seq) and the HostRoot holds their lanes.
- **`updateHostRoot` processes the pending records for the render's lanes,** the same way `updateReducerImpl` does, and keeps the skipped lanes on the HostRoot, like `processUpdateQueue`. Readers look up the state; a record the HostRoot didn't process uses `record.committed`, with every pending lane skipped. A record created after the HostRoot began is processed when it's first read (`getStoreStateForRender`).
- **Commit is a pointer swap:** `record.committed = state`. Then `record.lanes` is recomputed from the queues, plus updates dispatched during the render.
- **Reducers run without a dispatcher,** like eager state outside render. A reducer isn't part of any component, so calling a Hook or reading context in it throws, and the readers throw the error. (Before, it ran in the reader's render, read the reader's context, and a Hook call took the reader's first Hook slot.)
- **Reducer errors** are flagged on the update that threw (`didRenderError`), not on the state, because the HostRoot can process an update more than once in a render, for example after an error unwinds to the root.
- **StrictMode:** the reducer runs once, at the HostRoot. A reader in StrictMode replays the applied updates once per state in DEV (`doubleInvokeStoreReducerDEV`).
- **Observable differences, pinned by `store-semantics:` notes:** a hidden Activity reader renders the root's committed value directly, because a transition commits at the root before the hidden tree renders (ActivitySuspenseUseStore); and on error paths the reducer runs once per HostRoot begin.
- **Still single-tree:** `useStore` finds the work-in-progress HostRoot through `root.current.alternate`. With several work-in-progress trees, it comes from the render's context instead; nothing else depends on there being one.

## DCP-18: Transition updates to a store no root reads are held until the transition is done (2026-10-31)

- **Bug:** with no records, `store.update()` applied the update right away, so a reader that mounted in an urgent render while the transition (or its async action) was pending saw it early. Found by the react-concurrent-store port.
- **Fix:** the renderer installs `ReactSharedInternals.U`. With no records, an update in a transition is held on the store as `(action, lane)` (`_pendingTransitionUpdates`). An urgent update that comes after a held one is held too, with `NoLane`, so it's rebased on top, like useReducer.
- **The first root that reads the store** gets the held updates in its record's queue, as if they'd been dispatched to it. An update is still pending if its lane is the pending async action's, or pending on that root. Updates whose transitions are done are applied to the latest value first.
- **Held updates are released** at every commit, and when a root starts reading the store.
- **Limits:** with several roots, "done" is judged on the committing root, so a transition that's still pending on another root can be applied there early. That matches the existing rule that a root that starts reading a store starts from the latest value. With several renderers, the last one to load installs `U`.

## Not a bug: StrictMode under a newly mounted non-strict parent (2026-11-01; not store specific)

- The ponyfill-compat run reported that a `<StrictMode>` mounting under a non-strict parent placed in the same commit doesn't double invoke its effects on mount, and the branch briefly "fixed" it (`doubleInvokeEffectsInStrictSubtreesDEV`). That's the intended React 19 behavior, decided in react/react#32315: double invoking only the subtree on mount can't happen in production, so code could depend on it in development and break in production. The docs note is reactjs/react.dev#7702. The fix was reverted. The "TODO: this is currently broken" lines in ReactStrictMode-test.internal.js (from #31825) predate that decision.

## DCP-19: Reducer errors are reported unless a committed error boundary logs them (2026-10-31; amends DCP-14)

Found by three review passes of DCP-17/18. Pinned in ReactUseStore-test.js ("reducer errors and held updates", "reducer error reporting and retention", "reducer errors passed to an outer boundary").

- **The update that threw is dropped when the state commits,** so the committed state is cleared of the error. Later renders that read it, like a hidden reader that's revealed, don't throw it again.
- **The readers that threw are recorded on the per-render state** (`errorFibers`), not on the update: a render that's thrown away mustn't suppress the report. When the HostRoot begins again in the same render (after an error unwinds to the root), the new state inherits them.
- **At commit,** the error counts as handled if the nearest error boundary of a reader that threw (a class with `getDerivedStateFromError`/`componentDidCatch`, or the HostRoot) is in the finished tree. A boundary in a hidden Activity counts: React logs the error when it's revealed.
- **Otherwise it's reported after the layout phase,** unless React logged it during the layout phase (`logCaughtError`/`logUncaughtError` call `markErrorLoggedForStores`). That covers a boundary that caught it and passed it to an outer boundary, which React logs. It also catches the case the linkage misses: a boundary inside content that suspended on mount, which is thrown away, so no one would ever log the error.
- **Held transition updates (DCP-18) are applied eagerly when they settle,** and a reducer error is reported, like an update with no records that isn't held. An urgent update held behind a transition can't throw synchronously, so its error is reported the same way.

## DCP-20: Held updates are scheduled and entangled when a root takes them over (2026-10-31; amends DCP-18)

- **Scheduling:** when the first record takes over held updates, each lane is enqueued on the HostRoot through the concurrent queue. Lanes that aren't pending on the root (the pending async action's) go through `scheduleUpdateOnFiber`, so they survive a render that's thrown away. Transition lanes are entangled, like `useState`.
- **The event's transition lane is reset** at the end of the event (`ensureScheduleIsScheduled`), so a later transition doesn't reuse the lane of a held update whose transition is done.
- **Settling and creating a record run reducers without a dispatcher,** like the HostRoot.

## Performance notes for DCP-17 (2026-10-31)

- **Fast path:** a record without pending updates returns `record.committed` without looking at the HostRoot's states. Most stores a render reads weren't updated, so this removed a `Map.get` per read.
- **Memo:** `RootState.storeStates` is `{version, map, skippedLanes}`. A record remembers its last lookup by version (`lastVersion`/`lastState`), hits and misses alike, so it holds no reference to a map and can't retain dropped records.
- **Allocations:** no result wrapper from `processStoreRecords`, and no closure per commit.
- **Measured** (react-builds/final vs react-builds/hostroot5, store variant with the compiler, 7 interleaved rounds): every cell within ±2%. Entity, selection, structure and details-inline at N=1k/10k come out 0.92–1.016.
- **Known limits of DCP-19,** from the fourth review pass:
  - logged errors are matched by identity, so two stores throwing the same object (a shared sentinel or a string) in one commit, where a boundary logs one, report once;
  - a boundary that caught the error in a hidden Activity counts as handled, but React logs it only when it's revealed, so if the hidden tree is deleted first, it's never logged. This needs a store update processed in an Offscreen-lane render, which in practice means a render-phase update.
- **`flushStoreErrors` clears the logged set before reporting,** because an error handler can start a nested commit.
