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

- **The store** (`packages/react/src/ReactStore.js`) holds `_head`, the value with every update applied in dispatch order, and `_records`, one per root that reads it. `update()` queues the action for `_head` and dispatches it to each record. With no records, it applies the action right away and throws if the reducer throws (DCP-14). `_head` is folded lazily by `shared/getStoreHead.js`, which skips actions that throw.
- **A record** (`packages/react-reconciler/src/ReactFiberStore.js`) is a root's view of a store. It holds a base state and a chronological queue of `{lane, action, seq}` updates. This is the `useReducer` model, once per root instead of once per component.
  - **Read:** every read in a render uses the root's entangled lanes, `root.storeRenderLanes` (DCP-13). Apply the updates in those lanes and skip the rest, but still apply later included updates (rebasing). Ignore updates with `seq > root.storeRenderSeq`, i.e. dispatched after the render started. The read is cached by `(seq, lanes)` until the next commit; a reducer error is cached too.
  - **Dispatch:** `requestStoreUpdateLane(root)` (a fork of `requestUpdateLane` without a fiber). Eager bailout when the queue is empty and the value doesn't change. Schedule each subscribed reader through the concurrent queue, or the HostRoot if there are none. Entangle transition lanes per record, like `useState` queues do.
  - **Commit** (`commitStoreRecords`, right after `markRootFinished`): fold the committed lanes into the base state, keeping skipped updates and the later updates (as `NoLane` clones). Drop an update whose reducer throws, and report it if no component rendered the error (DCP-14). Only the records with queued updates (`root.pendingStoreRecords`) are visited (DCP-9).
  - **Drop** (`flushStoreSubscriptions`, right after the mutation phase): drop the records that have no readers and an empty queue, so the store doesn't keep the root alive (DCP-11). Only the records that may have no readers (`root.unsubscribedStoreRecords`) are visited.
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
