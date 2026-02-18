# Investigation: Boundary Reveals During Hydration

## Context

react-dom-native hydrates SSR content against a shadow tree built from the SSR
instruction stream. Suspense boundaries in the SSR stream go through a
fallback → reveal cycle: initially the fallback is shown, and when the
boundary's content arrives, an `X` (reveal) instruction replaces it.

The concern: if a boundary reveal fires while React's hydration is mid-walk
through the SSR tree, the hydration cursor could be pointing at stale
pre-reveal nodes. `revealBoundaryImmutable` clones the path from root to the
boundary, producing a new tree. Nodes already returned to JS via
`$$getFirstSSRChild`/`$$getSSRChildOf` would point at old pre-reveal nodes no
longer in the current tree. Specifically, `findNextSibling` searches only the
current `ssrTrees[surfaceId]`, so a stale node from the old tree returns nil.

## Current Protection Mechanism

The code has a serialization mechanism via `pendingHydration` +
`ssrStreamComplete` in `Root.swift:435-443`:

1. SSR stream data is parsed on the main thread (`delegateQueue: .main`)
2. `ssrStreamComplete` is set when the HTTP response finishes
3. Hydration only starts after both bundle loads AND `ssrStreamComplete`

This means ALL Fizz instructions (including `X` reveals) should be processed
before hydration starts, because the URLSession delegate completes after all
data is parsed.

## What Needs Investigation

We need to verify this protection actually works end-to-end, identify edge
cases where it doesn't, and add safety mechanisms.

### Step 1: Add logging to confirm reveal-before-hydration ordering

Add timestamped logging to trace the exact ordering of events.

**Files to modify:**

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
  - In the `SSRStreamDelegate` onComplete callback (~line 435): log
    "SSR stream complete, reveals processed: N"
  - In `doHydrate` closure (~line 518): log "Hydration starting"
  - In `registerSurfaceForHydration` call (~line 524): log tree snapshot

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift`
  - In `didReceiveRevealBoundary` (~line 160): log "Reveal boundary {id}
    at timestamp"

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`
  - In `$$getFirstSSRChild` handler (~line 807): log "Hydration traversal:
    getFirstSSRChild"
  - In `updateSSRTree` (~line 223): log "SSR tree updated (reveal during
    hydration?)" with check if hydration is in progress

**Verification:** Run the example app with a server component that has a
Suspense boundary with a delay. Check logs to confirm all "Reveal boundary"
messages appear before "Hydration starting".

### Step 2: Write integration test reproducing the race

Create an integration test that forces the race condition by:
1. Starting SSR with a pending Suspense boundary
2. Starting hydration before the boundary reveals
3. Verifying hydration sees the correct tree

**File to create:** `tests/integration/hydration-boundary-reveal-itest.js`

Use the existing Fantom test harness pattern from
`tests/integration/hydration-itest.js`. The test should:

- Render a component with `<Suspense>` containing an async child
- SSR the tree (produces `B`/`/B` boundary markers + `P` placeholder)
- Start hydration against the initial tree (fallback state)
- Deliver the segment content (`S`/`/S`) and reveal (`X`) instruction
- Verify hydration completes without errors
- Verify the revealed content is displayed

### Step 3: Add a hydration-active guard to prevent mid-hydration reveals

Add a flag that prevents SSR tree mutations during the hydration walk.

**Files to modify:**

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`
  - Add `private var hydrationInProgress: Bool = false`
  - Set to `true` when `callHydrateFromSSRData` or `callHydrateFromURL`
    is called
  - Set to `false` when `$$completeRoot` runs for that surface (first
    post-hydration commit)
  - In `updateSSRTree`: if `hydrationInProgress`, queue the update
    instead of applying it immediately. Apply queued updates after
    hydration completes.

This ensures the SSR tree is stable during the entire hydration walk.
Queued reveals would be applied after the first `$$completeRoot`, at which
point React owns the tree and handles updates through the reconciler.

### Step 4: Make `findNextSibling` resilient to stale nodes

Even with the guard from Step 3, make the sibling search robust.

**File to modify:**
`packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

Currently `findNextSibling` only searches `ssrTrees[surfaceId]`. If the node
isn't found (because it's from a stale tree), it returns nil. Change it to
also search the node's parent directly:

- Store a `parent` weak reference on `ShadowNodeWrapper` (or maintain a
  `nodeToParent` map in Bindings)
- When `findNextSibling` can't find the node in `ssrTrees`, fall back to
  walking the parent's children array to find the node's index, then
  return `parent.children[index + 1]`

This makes sibling lookup work even if the tree was replaced.

### Step 5: Clean up SSR state after hydration

After the first successful `$$completeRoot` post-hydration, clean up SSR
state to prevent interference and free memory.

**Files to modify:**

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`
  - In `$$completeRoot`: if this is the first commit after hydration
    (track via a `hydrationPending` flag), call `$$clearSSRTree` to
    remove `ssrTrees[surfaceId]`
  - Clear `hydrationInProgress` flag

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
  - After hydration succeeds (in the completion callback or after first
    `$$completeRoot`), nil out:
    - `ssrParser`
    - `ssrTreeBuilder`
    - `ssrBoundaryManager`
    - `ssrCoordinator`
    - `ssrFlightDataBuffer`
    - `ssrViewRegistry`
    - `ssrMutationApplier`

## Key Files

| File | Role |
|------|------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | Orchestrates SSR → hydration lifecycle |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` | Handles reveal instructions |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` | Bridge: `$$getFirstSSRChild`, `$$completeRoot`, `updateSSRTree` |
| `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift` | `revealBoundaryImmutable` clones tree |
| `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift` | Clone methods, family identity |
| `packages/react-dom-native/src/renderer/HostConfig.js` | Hydration host config functions |
| `tests/integration/hydration-itest.js` | Existing hydration tests (pattern reference) |

## Verification

1. **Logging (Step 1):** Run example app, confirm reveal-before-hydration
   ordering in all cases (fast network, slow network, fast/slow Suspense
   delays)
2. **Integration test (Step 2):** `npm run test:fantom` passes with the new
   boundary reveal hydration test
3. **Guard (Step 3):** Add a test that artificially calls `updateSSRTree`
   during hydration and verify it queues correctly
4. **Resilience (Step 4):** Test that `$$getNextSSRSibling` works on nodes
   from a pre-reveal tree snapshot
5. **Cleanup (Step 5):** Verify SSR state objects are nil after hydration
   completes (add assertion in test or log)
