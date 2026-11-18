## Overview

Stacked on #1 (same-element bailout). Server rendering is in #3 and DevTools is in #4.

Adds an experimental concurrent store, behind `enableStore`:

```js
const store = React.unstable_createStore(initialValue, reducer?);

function Count() {
  const count = use(store); // conditional and in loops, like any use()
  return <button onClick={() => store.update(c => c + 1)}>{count}</button>;
}
```

A store is like `useReducer` state lifted out of the tree. Any component on any root can read it with `use(store)`, and `store.update()` works like `setState`:
- updates batch with other updates in the same event;
- a store update in a transition is a transition;
- sync updates rebase over pending transitions;
- a component that starts reading a store mid-transition joins that transition.

There are no selectors. Use granular stores (a store per entity, or a store of stores), and let the compiler memoize what's derived from them.

## How it works

Each root that reads a store gets a record, which holds the update queue for that store on that root, the same way `hook.queue` holds a Hook's updates. The state lives on the HostRoot: `updateHostRoot` processes the pending records for the render's lanes like `updateReducerImpl` does, and the commit swaps the processed states in. Readers look up the state for the current render, merge any skipped lanes into their fiber (which is how a reader joins a transition), and bail out when the value didn't change. Updates go through the concurrent queue onto the HostRoot, so a render in progress never sees an update dispatched during it.

The store itself keeps the latest value, with every update applied in dispatch order. A root that starts reading a store starts from that value. When no root reads a store, an update in a transition is held until the transition is done, so a component that mounts urgently in the meantime doesn't see it early. Every renderer on the page (for example react-dom and react-art) keeps its own records and chains the hook that holds those updates, like `ReactSharedInternals.S`.

With the flag off, none of the new fields are allocated, and a renderer built without stores throws "use(store) is not supported by this renderer."

## Behavior that differs from useState

- A store keeps its value across unmounts and remounts, and it's shared by every component and root that reads it.
- A root that starts reading a store starts from the latest value, including updates from transitions that are still pending in another root. That's consistent with how transitions already work across roots: each root commits its part on its own.
- Updating a store during render warns, even from a component that reads it, because a store is shared. The update renders after the current render.
- Reducers run outside any component (no dispatcher), so calling a Hook or reading context in one throws.
- A reducer error throws in every component that reads the store, and the update that threw is dropped when that render commits. If no component reads the store, `update()` throws instead.
- The client hydrates with the value the store was created with (#3 renders that on the server), and readers catch up to the latest value after hydration.

## Why not three slots

Seb's earlier sketch kept three values per store: `_current`, `_sync` and `_transition`. I implemented it to compare: 50 of the store tests fail as written, and 24 still fail after per-render patches. The slots hold values, but React renders and commits subsets of lanes, so:
- all urgent lanes collapse into `_sync`;
- a transition commit copies a later transition in the same lane into `_sync`, which tears the tree;
- with global slots, one root's commit changes what every other root reads.

A queue per root is what `useState` does for the same reason.

## Follow-ups (not in this PR)

- Reading a store outside render. There's deliberately no `getSnapshot()` or `subscribe()`: reads go through `use()` in a React scope, and a store is read with `use()` and written with `update()`, like state. A handler uses the value from its render closure, and read-then-write uses an updater. Whether to ever add a read of the latest value is open.
- Selectors and derived data. The recommendation for now is granular stores plus a userland `weakMemo` for derived values.
- DevTools: editing store values, and Profiler updater attribution. DevTools needs to ship alongside this, since older debug-tools don't know about store reads.
- Reducer errors without a boundary that owns the store. An update that only throws because a pending transition was skipped is usually applied by error recovery, but it's dropped when the recovery render can't finish (for example, when the transition is waiting on data). These cases are pinned by tests with `FIXME` comments.

## Tests

- **`ReactUseStore-test.js`** is the spec: 91 tests, one rule each, organized as reading and updating, batching and priority, transitions, Suspense and Activity, updates during render, reducer errors, multiple roots, lifetime, and "same as useState" (side-by-side tests that run one scenario with `useState` and with a store and assert the same logs).
- **`ReactUseStoreLegacyMode-test.js`** covers legacy roots.
- **`ReactUseStoreMultipleRenderers-test.js`** covers two renderers sharing a store.
- **Later PRs:** DOM and server rendering tests are in #3, and DevTools tests are in #4.
