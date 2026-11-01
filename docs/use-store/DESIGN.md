# use(store): current design

This is the source of truth for the implementation. Changes go through `DECISIONS.md`.

## API (experimental, `enableStore`)

```js
const store = React.unstable_createStore(initialValue, reducer?);
store.update(action); // no reducer: a value or an updater function, like setState
const value = React.use(store); // conditional and in loops, like any use()
```

- There are no selectors. Use granular stores (a store per entity, or a store of stores) and the compiler.
- The reducer is fixed when the store is created.

## Model

- **The store** (`packages/react/src/ReactStore.js`) holds `_head`, the value with every update applied in dispatch order, `_initial`, and `_records`, one per root that reads it. `update()` queues the action for `_head` and dispatches it to each record. `_head` is folded lazily by `shared/getStoreHead.js`, which skips actions that throw.
  - **With no records:** outside a transition, `update()` applies the action to `_head` right away and throws if the reducer throws (DCP-14). Inside a transition, the renderer holds the update on the store with its lane (`_pendingTransitionUpdates`, through `ReactSharedInternals.U`) until the transition is done. The first root that reads the store takes the held updates into its record and schedules and entangles their lanes. Held updates whose transitions are done are applied to `_head` at every commit and when a record is created, and a reducer error there is reported (DCP-18, DCP-20).
- **A record and its states** (`packages/react-reconciler/src/ReactFiberStore.js`) are split like a Hook (DCP-17).
  - **The record** is the shared part, like `hook.queue`: `pending` updates (a circular list), `lanes`, `transitionLanes`, `readers`, `dispatch`, and `committed`, the `StoreState` of the committed tree.
  - **A `StoreState`** is the state in one version of the tree, like a Hook object: `baseState`, `baseQueue`, `memoizedState`, `skippedLanes`, and the reducer error if one threw.
  - **The HostRoot owns the states its render processed:** `RootState.storeStates` is `{version, map, skippedLanes}`, holding only the records processed in that render. Any other record's state for the render is `record.committed`.
  - **Dispatch:** `requestStoreUpdateLane(root)` (a fork of `requestUpdateLane` without a fiber). Eager bailout when the record has nothing pending and the value doesn't change. Otherwise the update goes through the concurrent queue onto the HostRoot (`enqueueConcurrentStoreUpdate`), so a render already in progress never sees it. Each subscribed reader is marked with the lane. Transition lanes are entangled per record, like `useState` queues.
  - **Process** (`processStoreRecords`, in `updateHostRoot`): the HostRoot processes every record with pending updates for the render's entangled lanes, the same way `updateReducerImpl` does. Updates in other lanes are skipped, and the updates after a skipped one are kept as `NoLane` clones. The skipped lanes stay on the HostRoot. A record created after the HostRoot began is processed the first time it's read, with the same lanes (`getStoreStateForRender`). Reducers run without a dispatcher.
  - **Read:** a record with no pending updates reads `record.committed` directly. Otherwise the read looks up the HostRoot's states, memoized per record by version (`lastVersion`, `lastState`).
  - **Commit** (`commitStoreStates`, right after `markRootFinished`): a pointer swap, `record.committed = state` for each state in the finished HostRoot's map, with no reducer run. Then `record.lanes` is recomputed from the queues, plus updates dispatched during the render.
  - **Reducer errors:** every reader throws the error, and the update that threw is dropped when the state commits. The error is reported after the layout phase unless a committed error boundary logs it (DCP-14, DCP-19).
  - **Drop** (`flushStoreSubscriptions`, right after the mutation phase): drop the records that have no readers and nothing pending, so the store doesn't keep the root alive (DCP-11). Only the records that may have no readers (`root.unsubscribedStoreRecords`) are visited.
- **Readers** (`useStore` in `ReactFiberHooks.js`):
  - Skipped lanes are merged into the fiber's lanes, which is how a reader joins in-flight transitions.
  - Reads are tracked in `updateQueue.storeReads` as `record, value` pairs, and compared with the previous render's in `finishStoreReads`.
  - Readers subscribe through an insertion effect with no hook slot, one per component (`updateQueue.storeInst`). It's only pushed when the set of stores changes, and deletion cleans it up directly (DCP-8). When it subscribes, the reader is marked with every lane the store has pending (DCP-15).
  - A changed value calls `markWorkInProgressReceivedUpdate`, so an unchanged value bails out.
  - A changed value that came from a pending async action suspends on the action, like `useState`.
- **Suspense:** when a reader suspends, the stores it and the components above it read are kept on the nearest boundary's `SuspenseState` while the fallback shows. The boundary subscribes to them, so a store update retries it (DCP-16).
- **Server:** Fizz reads `_initial`. Hydrating readers render `_initial` too, but compute the client value: they join pending transitions through its skipped lanes, and render again at SyncLane after commit if it differs from `_initial` (DCP-4, DCP-12). Flight throws "Cannot read a store from a Server Component."
- **DevTools:** `react-debug-tools` reports a `Store` primitive with the value the component rendered.

## Intentional differences from useState

- A store keeps its value across unmounts and remounts.
- A store is shared by every component and root that reads it. Updates are applied in dispatch order for all of them.
- A root that starts reading a store starts from `_head` (see #403). Consistency across roots isn't guaranteed.

The test suites assert these with a `// store-semantics:` comment wherever a store's expectation differs from the `useState` version of the test. Otherwise, store updates follow the same rules as `useState`: they batch with other updates in the same event, a transition update is a transition, sync updates are rebased over pending transitions, and a component that reads a store mid-transition joins that transition.

- **Remounts:** because a store keeps its value, a test that relies on a remount resetting state passes a new store to the new instance. `store.update` is stable, so remount detection through setter identity needs another signal (e.g. a `useRef` identity).
- **Readers:** updating a store re-renders every component that reads it, on every root. A component that only reads a store doesn't re-render when its parent's state changes unless the parent re-renders it.
- **Eager computation and bailout:** like `useState`, the first update to an idle store is computed eagerly when it's dispatched. When nothing is pending for the store, an update to the same value bails out without rendering at all, so where `useState` renders and then bails out, a store renders less. Updater and reducer logs follow `useState`, not class `setState`.
- **No lazy initializer:** the value passed to `createStore` is computed before rendering.
- **Conditional reads:** `use(store)` can be called conditionally and in loops.
- **Updates during render** warn: "Cannot update a store while rendering a component (`X`). Updating a store is a side effect, so it should happen in an event handler or an effect. The update will be rendered after the current render. ..." This holds even when `X` reads the store, because a store is shared. The update is rendered after the current render, the way an update to another component is, and it isn't discarded if that render suspends or is thrown away. An unconditional render-phase update loops the way updating another component in render does.
- **Reducers run outside any component:** a store's reducer runs without a dispatcher, like `useReducer`'s eager state outside of render. Calling a Hook or reading context in a reducer throws, and the component that reads the store throws the error. (Which provider's value would a shared store see?)
- **No component warnings:** store updates never warn about unmounted or not-yet-mounted components, because an update isn't tied to a component. There's no "Detected a large number of updates inside startTransition" warning either: that warning points userland subscriptions at React-provided primitives, and a store is one.
- **Hidden trees:** the HostRoot owns store state, so when a transition's store update commits at the root before a hidden (Activity) tree renders, the hidden reader renders the committed value. `useState` renders the older value first, because its updates are deferred with the hidden tree. Pinned by "updates at multiple priorities that suspend inside hidden tree" in `ActivitySuspense-test.js`.
- **Server and hydration:** the server renders, and the client hydrates with, the value the store was created with (DCP-4). Updates made before rendering on the server aren't rendered. After hydration, readers catch up to the latest value. A store update isn't routed into dehydrated boundaries: the server HTML stays until the boundary hydrates with the initial value, and then the reader catches up.

## Differences from context

A store can stand in for a context whose value is the same for the whole app. Where context's subtree scoping matters (nearest-Provider resolution, the default value outside a Provider, shadowing, different values per request, subtree or root on the server, or a Server Component providing a value), there's no store analog.

- **No Provider fiber:** DevTools element indices and ids shift, and profiler change descriptions report a changed `Store` hook (`hooks: [n]`) instead of `context: true` (B-16). Hook inspection shows `Store` (with `id: null`), not the context's name.
- **Suspense retries:** a Provider value change conservatively retries every Suspense boundary below it that shows a fallback. A store update only schedules its readers, so primary children that don't read the store aren't retried or pre-warmed.
- **Bailouts:** a store update reaches its readers past `memo`, `PureComponent`, `shouldComponentUpdate` and hidden boundaries without re-rendering the components in between.
- **Disallowed reads:** `use(store)` inside `useMemo`, a reducer or an effect gets the Hooks warning or the invalid Hook call error, not the context-read message.
- **Multiple roots and renderers** share one value. Every root that reads the store re-renders on an update.
- **Server Components:** reading a store throws "Cannot read a store from a Server Component."
