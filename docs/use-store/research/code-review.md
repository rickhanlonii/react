# use(store): code review

> **Status (2026-10-30):** H1, H2, M1 to M4, L1, L3 to L6 and B-18 are fixed. See DCP-11 to DCP-16 and "Decisions from the code review" in `DECISIONS.md`. The scratch tests are now real tests in `ReactUseStore-test.js` and `ReactDOMStore-test.js`. L2 (the same-element bailout) is with zustand-gap.

Reviewed the uncommitted `rh/use-store` diff (`git diff HEAD -- packages/` plus the untracked `ReactFiberStore.js`) against `DESIGN.md` and `DECISIONS.md` (DCP-1 to DCP-10). Line numbers move, so each finding quotes the code.

Scratch tests that prove the findings (all six fail on the current tree, and each failure shows the defect):

- `packages/react-reconciler/src/__tests__/ScratchReviewStore-test.js`: LEAK, TEAR, PRIORITY, POISON
- `packages/react-reconciler/src/__tests__/ScratchReviewStoreDOM-test.js`: DEAD RECORD, STALE HYDRATED READER

Run with `yarn test --r=experimental ScratchReviewStore --maxWorkers=2`.

Severity counts: **2 high, 4 medium, 6 low**. There is also one note on B-18.

---

## High

### H1. A hydrating reader can subscribe to a record that the same commit drops, and then it never updates again

`ReactFiberHooks.js`, `useStore`:
```js
record = getStoreRecord(store, root);
if (isHydrating) {
  value = store._initial;
} else {
  value = readStoreRecord(record, renderLanes, root.storeRenderSeq, ...);
}
```
`ReactFiberStore.js`, `commitStoreRecords`:
```js
} else if (record.readSeq < renderSeq) {
  record.mayBeUnsubscribed = false;
  removeStoreRecord(record);
```

**Defect.** `record.readSeq` is only written in `readStoreRecord`, and hydrating reads skip that call. The "read by the committing render" guard therefore doesn't see hydrating reads. The sweep also runs in `commitRoot`, before the mutation phase. So when a hydration render reads an existing record that has no readers, and `readSeq < renderSeq` (any store update anywhere bumped the global seq), the commit removes the record from `store._records`. Then, in the mutation phase of that same commit, the hydrated reader subscribes to the removed record. Later updates never reach it.

**Scenario** (`DEAD RECORD`):
1. A boundary's first hydration attempt reads `store` (creating this root's record) and then a sibling suspends. The boundary stays dehydrated, so no reader subscribes.
2. An unrelated store on another root updates. This bumps `storeUpdateSeq` without a commit on the hydration root.
3. The boundary hydrates. Its commit drops the record, then the reader subscribes to it.
4. `store.update('B')` finds `_records.length === 0` and folds the update into `_head`. The DOM shows `A` forever.

**Fix.** Either of these works; the second is better:
- Call `readStoreRecord` on the hydrating path too. That sets `readSeq` and gives the skipped lanes H2 needs. Return `_initial` as the value.
- Run the unsubscribed sweep after the mutation phase, next to `flushStoreCatchUps`. At that point every reader of the committing render has subscribed and every deleted reader has unsubscribed, so `readers.size === 0` is the whole condition and `readSeq` can be deleted. This also fixes M1 (see Simplifications).

### H2. A hydrating reader never joins a pending transition, so it tears and stays stale

`useStore`:
```js
const skippedLanes = isHydrating ? NoLanes : getSkippedStoreLanes(record);
```
`flushStoreCatchUps`:
```js
if (isHydrating && !isOutOfDate) {
  isOutOfDate = !is(reads[j + 1], getCommittedStoreState(record));
}
...
const missedLanes = getLanesOfUpdatesAfter(record, seq);
```

**Defect.** A non-hydrating reader that skips a pending update merges the skipped lane into `fiber.lanes`, which is how DCP-3 joins in-flight transitions. A hydrating reader merges nothing. The catch-up doesn't cover the gap either:
- It compares `_initial` with the *committed* value, which leaves out pending lanes.
- It only schedules lanes of updates with `seq >` the hydration render's seq.

So a transition update dispatched *before* the hydration render, still pending when the boundary hydrates, never schedules the hydrated reader.

**Scenario** (`STALE HYDRATED READER`):
1. A shell reader `A` and a dehydrated boundary with reader `B`.
2. `startTransition(() => store.update('T'))`. The transition suspends in `A`, so it stays pending.
3. A click on the boundary hydrates it synchronously. `B` hydrates with `'A'`, which is also the committed value, so there's no catch-up.
4. The transition resolves. Only `A` re-renders, and the commit is `T` / `A`: two versions of the store in one commit. `B` stays stale until some later update reaches it.

**Fix.** On the hydrating path, compute the client value `v = readStoreRecord(record, lanes, seq, ...)`, merge its skipped lanes into `fiber.lanes` as usual, and return `_initial`. Then record `!is(v, store._initial)` on the catch-up and schedule a SyncLane render if it's true. That replaces `getCommittedStoreState`, which can then be deleted.

---

## Medium

### M1. An unmounted root stays reachable from every store it read until that store updates again

`commitStoreRecords` (runs before mutation) and the unsubscribe closure in `subscribeToStoreReads`:
```js
if (readers.size === 0 && !record.mayBeUnsubscribed) {
  record.mayBeUnsubscribed = true;
  addUnsubscribedStoreRecord(record.root, record);
}
```

**Defect.** Readers unsubscribe during the mutation phase, after the commit's sweep has already run. The record is only dropped by the *next* commit on that root. `root.unmount()` has no next commit, so the record (and through it the `FiberRoot`, its container, and the root's last fibers) stays in `store._records` for the store's lifetime. That's forever for a module-level store that's never updated again. The next `store.update()` schedules a render on the dead root just to drop the record. The existing test "stops updating unmounted readers and releases the root" only passes because it calls `store.update(1)` after unmounting.

**Scenario** (`LEAK`): `createRoot`, render a reader, `root.unmount()`. `store._records.length` is still 1. Short-lived roots (tooltips, portals into iframes, tests) each leak one root per store they read.

**Fix.** Sweep after mutation, as in H1. Unmount then drops the record in the same commit.

### M2. Dropping a record with pending updates leaks a transition update into an urgent render

`commitStoreRecords`, the unsubscribed sweep, never checks `record.firstUpdate`. `getStoreRecord` then recreates the record from `getStoreHead(store)`, which applies every dispatched action regardless of lane.

**Defect.** DESIGN.md accepts "a root that starts reading a store starts from `_head`" for a *new root*. But the sweep drops a record that still has a pending transition update on a root that keeps rendering. When the next reader mounts in an urgent render, it reads the transition's value before the transition commits, while React state from the same transition still shows the old value.

**Scenario** (`PRIORITY`):
1. `startTransition(() => { store.update(1); setTab('b'); })`
2. `flushSync` to unmount the only reader.
3. `flushSync` an unrelated update. This commit drops the record.
4. `flushSync` to remount the reader. It renders `Reader: 1` next to `Tab: a`. With useState semantics it would render `Reader: 0` until the transition commits.

**Fix.** Don't drop a record while `firstUpdate !== null`. Keep it in `unsubscribedStoreRecords` until the commit that empties its queue.

### M3. Readers inside a revealed hidden subtree read with that subtree's base lanes, so one commit shows two versions

`useStore`:
```js
// Use the same lanes as the update queue of useState. These include
// the lanes that are entangled with the ones being rendered.
value = readStoreRecord(record, renderLanes, root.storeRenderSeq, ...);
```

**Defect.** The hook's `renderLanes` is the work loop's `entangledRenderLanes`. That is *not* uniform across a render: `pushHiddenContext` merges an Offscreen's `baseLanes` into it while a previously hidden subtree renders. That's correct for per-fiber `useState`, but a store is shared. In the same render, a reader inside a revealed Activity or Suspense primary tree applies pending updates in the base lanes, and a reader outside skips them. The commit folds `finishedLanes | root.storeRenderLanes`, which leaves those updates in the queue, so the commit also disagrees with the inside reader. This came from the B-4 fix, which swapped raw root lanes for the hook lanes to get entanglement.

**Scenario** (`TEAR`):
1. Hide an Activity at IdleLane. Its `baseLanes` become IdleLane.
2. Before its offscreen render runs, dispatch an idle-priority store update, then `flushSync` a reveal.
3. The commit shows `Outside: 0` and `Inside: 1`.

DefaultLane doesn't reproduce this, because it's batched with Sync (`SyncUpdateLanes`). Transition and retry lanes do, once they're recycled.

**Fix.** Read with `root.storeRenderLanes`. These are already the entangled lanes from `prepareFreshStack`, so B-4 stays fixed, and they're the lanes the commit folds. Updates in the base lanes were folded into `baseState` when those lanes committed, so revealed readers don't need the base lanes. Pending ones are skipped and merged into `fiber.lanes`. With one set of lanes per render, the read cache also always hits, and `commitStoreRecord`'s `canReuseRead` always holds (see Simplifications).

### M4. A reducer error permanently poisons the store, and `_headQueue` grows without bound

There are three places.

`commitStoreRecord`:
```js
} catch (error) {
  didThrow = true;
  didSkip = true;
  newBaseState = state;
}
```
It keeps the throwing update as a `NoLane` clone. `record.lanes` no longer includes it, so `commitStoreRecord` never visits the record again, the record never leaves `pendingStoreRecords`, and `syncStoreHead` never runs.

`ReactStore.js` `updateStore`, when the store has no records:
```js
const queue = pendingHeadQueue === null ? [action] : pendingHeadQueue.concat(action);
... catch (error) { this._headQueue = queue.slice(i); }
```

`getStoreHead` does the same.

**Defect.** For useReducer, the error boundary unmounts the component and its queue goes away. Here, the throwing action is replayed on every read, by every root, for the store's lifetime. Every later update is appended behind it: to `_headQueue`, as a new array per update (`concat`), and to the record's queue, which also re-runs the reducer from the poisoned base on every render. The commit also runs the throwing reducer one extra time.

**Scenario** (`POISON`):
1. The reader renders, then `store.update('throw')`. The error boundary catches it.
2. `store.update(1..5)`, then reset the boundary.
3. The remount throws `Oops` again, and `_headQueue` is `['throw', 1, 2, 3, 4, 5]`. A store with no readers that's fed by a socket grows forever.

**Fix.** Once a throwing update has been surfaced during render, drop it:
- At commit, discard an update whose reducer throws, instead of keeping it.
- With no records, there's no render to defer to: throw synchronously from `update()`, or drop the action and `reportGlobalError`.

Either way, a store must be able to recover without being recreated. Replace `concat` with `push`.

---

## Low

### L1. The subscription closure keeps mount-time store values alive

`subscribeToStoreReads` returns `() => { for (...; i < reads.length; i += 2) ... }`, which captures `reads`, the `[record, value, ...]` array of the render that subscribed. With DCP-8, that destroy closure lives in `storeInst` until the set of stores changes or the component unmounts. Every reader therefore keeps the *mount-time* value of each store alive. For immutable-snapshot stores (Redux-style), that's one stale snapshot per mount generation, for as long as the readers stay mounted.

**Fix:** capture only the records. Copy them out when subscribing, which is already the rare path.

### L2. The same-element bailout stops marking the child's own lanes as skipped

`ReactFiberBeginWork.js`, `updateFunctionComponent` / `isUnchangedOnlyChild`.

I went through DCP-10 case by case and found no correctness divergence: same props object means `oldProps === newProps`, the excluded tags are handled, `bailoutOnChildren` does lazy context propagation, legacy context is excluded, refs are props, and `cloneChildFibers`' invariant holds. Profiler, DevTools and `return` pointers all match a normal parent bailout.

The one behavioral difference: on the normal path, the child's `attemptEarlyBailoutIfNoScheduledUpdate` → `bailoutOnAlreadyFinishedWork` calls `markSkippedUpdateLanes(child.lanes)` for the child's own non-render lanes. The new path never visits the child. `workInProgressRootSkippedLanes` is only read by `renderDidSuspendDelayIfPossible`, so the effect is scheduling only: a transition that suspends with delay no longer yields early to the child's skipped lane, and instead finishes and then suspends. It's not a correctness bug, but DCP-10's "why it's the same as the normal path" should say so.

Two more points:
- Only `updateFunctionComponent` gets the bailout. `updateForwardRef` doesn't, so a compiled `forwardRef` component misses the optimization.
- Suggested test: a child with a pending update in a non-render lane, with its parent re-rendering in a transition that suspends.

### L3. Hot-path costs that grow with the number of reads or mounts

- `useStore` dedupes with a linear scan of `storeReads`, and `compareStoreReads` falls back to `indexOf`. A component that reads k stores (the supported "list of stores in a loop") costs O(k²) per render. Use an O(1) marker on the record instead, e.g. a render-pass id and the fiber.
- `getLanesOfUpdatesAfter` walks the whole queue for each record of each catch-up. Mounting N readers while a queue has M updates costs O(N·M). The queue is ordered by seq, so return early when `record.lastUpdate === null || record.lastUpdate.seq <= seq`.
- Each re-render of a reader allocates a new `storeReads` array, plus a `FunctionComponentUpdateQueue` if the component has no effects. That's fine for parity with `useSyncExternalStore`, which allocates more. Reusing the previous array until the first difference would make an unchanged re-render allocation-free.

### L4. StrictMode double-invocation depends on which reader fills the read cache

`readStoreRecord` only double-invokes on a cache miss. If the first reader in a render is outside `<StrictMode>`, a StrictMode reader later in the same render gets a cache hit and no double-invoke. This is DEV-only. The fix is to key the double-invoke on whether *any* StrictMode reader read the record this render, or to accept it and document it.

### L5. Store updates are invisible to the scheduling profiler

`dispatchSetState` calls `markUpdateInDevTools` → `markStateUpdateScheduled`. `dispatchStoreUpdate` doesn't, so store updates don't appear in the scheduling profiler. DECISIONS notes the related `enableUpdaterTracking` gap; this one isn't mentioned.

### L6. Idiom and gating

- `ReactFiberWorkLoop.js`: `const didWarnAboutStoreUpdateInRender: Set<string> = new Set();` is allocated at module scope in production. Declare it inside an `if (__DEV__)` block, as the surrounding `didWarn*` sets are.
- `createFunctionComponentUpdateQueue` / `resetFunctionComponentUpdateQueue` add `storeReads` and `storeInst` for every function component, whether or not `enableStore` is on. The fields are typed optional (`storeReads?:`) even though they're always initialized, which forces `!= null` checks everywhere. Make them required and use `!== null`.
- `pendingStoreCatchUps` is module state, not per-root. If a commit throws between the insertion effects and `flushStoreCatchUps`, the catch-ups flush during the next commit of any root. That's harmless (`enqueueConcurrentRenderForLane` finds the right root) but surprising. Clear it, or key it to the root.
- `flushStoreCatchUps` passes `Lanes` to `enqueueConcurrentRenderForLane(fiber, lane: Lane)`.
- `ReactDebugHooks.readStore` falls back to running user reducers over `_headQueue` on each inspection. That's side effects in DevTools, and a reducer that throws crashes inspection. Use the record of the fiber's root, or `_head` without folding.
- The comment in `ReactStore.js`, "Nothing is reading the store, so apply the update right away", is really "no root has a record". Records without readers exist.
- The `useStore` comment, "If the store has changed since then, the component renders again with the latest value once it has hydrated", isn't true for pending transitions (H2). The comment "Use the same lanes as the update queue of useState" is the cause of M3.

---

## B-18 (known): would I fix it differently?

I agree with the direction (subscribe the Suspense boundary), with these refinements:
- **Collect at `use(store)` time, not at throw time.** The reads that matter are every read in the discarded primary subtree, including siblings that rendered before the thrower (the "(nested)" variant). Push `(record, handler)` while rendering, using `getSuspenseHandler()`. Filter to `SuspenseComponent` handlers, because Activity/Offscreen handlers can also be on that stack.
- **Store them on the boundary fiber**, like `retryQueue`, not in a root-level map. At commit, the boundary subscribes with the same machinery as a reader: insertion timing, the render's seq for catch-up, and `unsubscribeFromStoresOnDeletion` extended to the `SuspenseComponent` deletion case.
- **Unsubscribe the boundary** when its primary children commit, since they subscribe themselves then. A boundary scheduled by a store update needs its retry to re-render the primary tree even though the boundary's props didn't change. Scheduling the boundary fiber's lane does that, the way context marks boundaries in `propagateContextChanges`.
- The same mechanism covers the urgent-update variant in the doc, so don't special-case first mount.

---

## Simplifications

1. **Move the unsubscribed sweep after the mutation phase**, into `flushStoreCatchUps`' slot, and add a `firstUpdate === null` guard. This deletes `readSeq` and its write on every read, fixes H1, M1 and M2, and removes the "stays for the next commit" branch.
2. **Read with `root.storeRenderLanes`** (M3). Every read in a render then uses the same `(lanes, seq)`, so the cache key only needs to be invalidated when the queue changes. `commitStoreRecord`'s `canReuseRead` is then always true for the committing render.
3. **Drop `version`/`cachedVersion`.** Invalidate the cache directly (`record.cachedSeq = -1`) where the queue is mutated (dispatch, commit).
4. **`isPending` is redundant.** A record is in `pendingStoreRecords` exactly when `firstUpdate !== null`; the queue only shrinks at commit, which is when the record leaves the list. In `dispatchStoreUpdate`, push to the list when `record.firstUpdate === null` before appending. `isRemoved` and `mayBeUnsubscribed` could share a small bitfield.
5. **Seven cache fields** (`cachedVersion`, `cachedLanes`, `cachedSeq`, `cachedState`, `cachedBaseState`, `cachedSkippedLanes`, `cachedDidReadEntangledAction`) can shrink to one key and four results once 2 and 3 are done. `getSkippedStoreLanes` and `didReadEntangledStoreAction` are just field reads; `readStoreRecord` could return them through a module-level out-param, like `didReceiveUpdate`.
6. **The head is folded in three places**: `updateStore` (no records), `getStoreHead`, and `ReactDebugHooks.readStore`. Keep one helper in `shared/` (M4's fix touches all three anyway).
7. **`getCommittedStoreState`** exists only for the hydration catch-up. With H2's fix (compare `_initial` with the render-time value), delete it.
8. **`updateStore`'s `records.length === 1` / `> 1` branches**: the snapshot is only needed because a legacy-root synchronous flush can mutate `_records` mid-loop. Say so in a comment, or always iterate over a snapshot when `length > 1` and drop the single-record branch.
9. **Record `dispatch` field**: it's needed because each renderer bundle has its own `storeUpdateSeq` and work loop, so the store must call back into the renderer that created the record. Say so in a comment; today it reads like indirection for its own sake.

## Missing tests

Each item is a specific test to add to `ReactUseStore-test.js` unless it says otherwise.

1. **Unmount releases the root without a further update** (M1): `root.unmount()`, then `expect(store._records.length).toBe(0)` with no `store.update`. The DOM version is the `LEAK` test.
2. **Hydration drops no live record** (H1): the `DEAD RECORD` test, in `ReactDOMStore-test.js`.
3. **A hydrating reader joins a pending transition** (H2): the `STALE HYDRATED READER` test, in `ReactDOMStore-test.js`.
4. **Revealing a hidden Activity doesn't tear** (M3): the `TEAR` test, which uses idle lanes. Add a retry-lane variant with a Suspense boundary revealed while an update in its base lanes is pending.
5. **A pending transition isn't visible after the record is dropped and recreated** (M2): the `PRIORITY` test.
6. **The store recovers after a reducer error** (M4): the `POISON` test, plus a no-readers variant that checks `_headQueue` stays bounded.
7. **Multiple renderers share a store**: a `react-dom` root and a `react-noop` (or `react-art`) root read one store. Check that updates reach both, and that a render-phase update in one renderer doesn't use the other's seq.
8. **Legacy root plus a concurrent root on one store**: `store.update` flushes the legacy root synchronously inside the `_records` loop. Check that both roots end up consistent and the head is synced.
9. **An infinite render-phase store update loop** throws "Maximum update depth exceeded" (DCP-7 says it behaves like updating another component; nothing pins it).
10. **A store update from an insertion effect** of a newly mounted reader (the seq catch-up path inside the mutation phase).
11. **Unmount during a pending update**: delete the only reader while its transition update is pending, then commit the transition. Check that the queue is folded, the record is dropped afterwards, and `_headQueue` is null.
12. **StrictMode with a non-strict reader first** (L4): assert the reducer call count.
13. **Same-element bailout** (in DCP-10's suite):
    - (a) a child with a pending update in a non-render lane, under a parent that re-renders in a transition that suspends (L2);
    - (b) a `memo(C, () => false)` child under a parent that returns the same element, which must not re-render, pinning parity with the normal early bailout;
    - (c) a `forwardRef` parent, to pin whatever is decided there;
    - (d) a class child with `childContextTypes` under a re-rendering legacy-context provider, which must re-render.
14. **A component reading many stores** (L3): read 1,000 stores in a loop and change the order. This is a perf guard, e.g. assert on reducer/compare counts rather than time.
15. **B-18's urgent-update variant** (a new reader that mounts and suspends during an update), next to the two gated context copies.
