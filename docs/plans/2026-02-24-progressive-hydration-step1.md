# Plan: Progressive Hydration Infrastructure (Step 1)

## Context

Hydration is currently gated behind SSR stream completion — React never sees pending `#suspense` boundaries during hydration. Step 2 will remove that gate, but five infrastructure bugs would cause failures if hydration ran while boundaries are still pending. This plan fixes all five bugs **without changing when hydration happens**, keeping the system safe to land independently.

The bugs:
1. **Stale SSR node refs** — `revealBoundaryImmutable()` clones nodes, leaving React's `_ssrNodeRef` pointing at stale originals
2. **`pending` not synced to Swift** — JS sets `pending=false` but Swift-side `ShadowNodeWrapper.props["pending"]` never updates, so `unwrapRevealedSuspenseNodesInTree` never fires
3. **SSR tree updates queued during hydration** — `updateSSRTree()` queues when `hydrationInProgress` is set, but `$$notifyBoundaryRevealed` fires immediately against stale tree
4. **`unwrapRevealedSuspenseNodesInTree` skipped during hydration** — the `$completeRoot` guard prevents unwrapping on the initial hydration commit
5. **No throttling for boundary reveals** — reveals happen immediately and individually, causing brief fallback flashes and layout thrashing

## Changes

### Step 1: Add `$$markBoundaryRevealed` bridge function (Problem 2)

**`Bindings.swift`** — in `registerHydrationTraversal()`, add a new bridge function:

```swift
engine.setGlobalFunction("$$markBoundaryRevealed") { [weak self, weak engine] args in
    guard let self = self, let engine = engine else { return nil }
    guard let nodeId = engine.toInt(args.first) else { return nil }
    guard let node = self.nodeRegistry[nodeId] else { return nil }
    node.props["pending"] = false
    return nil
}
```

**`HostConfig.js`** — in `$$notifyBoundaryRevealed` (line 678, after `instance.pending = false`), add:

```javascript
// Sync pending state to Swift-side ShadowNodeWrapper
if (typeof $$markBoundaryRevealed === 'function') {
    $$markBoundaryRevealed(instance._ssrNodeRef);
}
```

### Step 2: Remove SSR tree update queueing (Problem 3)

**`Bindings.swift`** — three changes:

1. `updateSSRTree()` (line ~432): remove the `hydrationInProgress` guard. Apply updates immediately:
```swift
public func updateSSRTree(surfaceId: Int, newTree: [ShadowNodeWrapper]) {
    ssrTrees[surfaceId] = newTree
    for child in newTree { registerNewNodesInSubtree(child) }
    for child in newTree { buildParentMap(child) }
}
```

2. `$$completeRoot` hydration completion (line ~1033): remove the `pendingSSRTreeUpdates` flush:
```swift
if self.hydrationInProgress.contains(surfaceId) {
    self.hydrationInProgress.remove(surfaceId)
    self.onHydrationComplete?(surfaceId)
    self.ssrTrees.removeValue(forKey: surfaceId)
}
```

3. Remove the `pendingSSRTreeUpdates` property declaration (line ~70).

### Step 3: Always run `unwrapRevealedSuspenseNodesInTree` (Problem 4)

**`Bindings.swift`** — in `$$completeRoot` (line ~925), remove the hydration guard:

```swift
// BEFORE:
if !self.hydrationInProgress.contains(surfaceId) {
    self.unwrapRevealedSuspenseNodesInTree(oldChildren)
}

// AFTER:
self.unwrapRevealedSuspenseNodesInTree(oldChildren)
```

Safe because the method only unwraps nodes where `props["pending"] == false`. During the initial hydration commit all boundaries are still pending, so nothing unwraps.

### Step 4: Add `revealBoundaryInSSRTree` for in-place SSR tree mutation (Problem 1)

**`Bindings.swift`** — add two methods:

```swift
/// Mutates the SSR reference tree in place when a boundary reveals.
/// Keeps node IDs stable so React's _ssrNodeRef references remain valid.
public func revealBoundaryInSSRTree(surfaceId: Int, boundaryId: Int, contentNodes: [ShadowNodeWrapper]) {
    guard let tree = ssrTrees[surfaceId] else { return }
    guard let suspenseNode = findSuspenseNodeByBoundaryId(boundaryId, in: tree) else { return }
    suspenseNode.children = contentNodes
    suspenseNode.props["pending"] = false
    for child in contentNodes { registerNewNodesInSubtree(child) }
    buildParentMap(suspenseNode)
}

private func findSuspenseNodeByBoundaryId(_ boundaryId: Int, in nodes: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
    for node in nodes {
        if node.family.elementType == "#suspense",
           let bid = node.props["boundaryId"] as? Int,
           bid == boundaryId {
            return node
        }
        if let found = findSuspenseNodeByBoundaryId(boundaryId, in: node.children) {
            return found
        }
    }
    return nil
}
```

### Step 5: Split SSRCoordinator reveal into prepare + process (Problem 5 prep)

**`SSRCoordinator.swift`** — split `didReceiveRevealBoundary` and add a new callback:

1. Add new callback:
```swift
/// Called when a boundary is ready to reveal. Root.swift controls timing (throttle).
var onBoundaryRevealQueued: ((Int, [ShadowNodeWrapper]) -> Void)?
```

2. Add `segmentContentNodes(for:)` accessor:
```swift
func segmentContentNodes(for boundaryId: Int) -> [ShadowNodeWrapper]? {
    return segmentContentNodes[boundaryId]
}
```

3. Add `processReveal(id:)` — executes the visual update (called from Root.swift after throttle):
```swift
func processReveal(id: Int) {
    let contentNodes = segmentContentNodes[id] ?? []
    guard let wrapper = boundaryWrappers[id] else { return }
    let oldRootChildren = currentRootChildren ?? treeBuilder.rootChildren
    let newRootChildren = ShadowTreeBuilder.revealBoundaryImmutable(
        rootChildren: oldRootChildren, suspenseNode: wrapper, contentNodes: contentNodes
    )
    currentRootChildren = newRootChildren
    boundaryWrappers.removeValue(forKey: id)
    segmentBuilders.removeValue(forKey: id)
    boundaryManager.revealBoundary(id: id)
    onViewsNeedUpdate?(oldRootChildren, newRootChildren)
    segmentContentNodes.removeValue(forKey: id)
}
```

4. Change `didReceiveRevealBoundary` to queue instead of execute:
```swift
func didReceiveRevealBoundary(id: Int) {
    let contentNodes = segmentContentNodes[id] ?? []
    guard boundaryWrappers[id] != nil else { return }
    onBoundaryRevealQueued?(id, contentNodes)
}
```

### Step 6: Add throttled boundary reveal batching in Root.swift (Problem 5)

**`Root.swift`** — add throttling infrastructure:

1. Add constants and state properties:
```swift
private static let FALLBACK_THROTTLE_MS: Double = 300.0
private static let TARGET_LCP_MS: Double = 2300.0

private var pendingReveals: [(id: Int, contentNodes: [ShadowNodeWrapper])] = []
private var revealTimer: DispatchWorkItem?
private var shellPaintTime: Double?
```

2. Record shell paint time in `renderWithSSR()` inside `treeBuilder.onRootComplete`:
```swift
self.shellPaintTime = CACurrentMediaTime() * 1000.0
```

3. Add `queueBoundaryReveal`, `scheduleRevealFlush`, `flushPendingReveals` methods (logic per spec section 4.6).

4. Wire `onBoundaryRevealQueued` in `renderWithSSR()`:
```swift
coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
    self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
}
```

5. In `flushPendingReveals`, for each boundary: call `ssrCoordinator?.processReveal(id:)`, then `revealBoundaryInSSRTree(...)`, then `$$notifyBoundaryRevealed(...)`.

6. Update `unmount()` and `cleanupSSRState()` to cancel timer and clear pending reveals.

### Step 7: Wire SSR tree mutation into reveal flow

**`Root.swift`** — update the `onBoundaryRevealed` callback in `hydrateRoot()` (line ~602):

```swift
self.ssrCoordinator?.onBoundaryRevealed = { [weak self] boundaryId in
    guard let self = self, let surfaceId = self.surfaceId else { return }
    let contentNodes = self.ssrCoordinator?.segmentContentNodes(for: boundaryId) ?? []
    rt.bindings?.revealBoundaryInSSRTree(
        surfaceId: surfaceId, boundaryId: boundaryId, contentNodes: contentNodes
    )
    guard let engine = rt.engine else { return }
    engine.evaluate("globalThis.$$notifyBoundaryRevealed(\(boundaryId))")
}
```

Note: once throttling is wired (Step 6), this callback fires from `flushPendingReveals` rather than directly from the coordinator. The `onBoundaryRevealed` callback on SSRCoordinator is still used during the SSR-only phase (pre-hydration). During hydration, the flow goes through `onBoundaryRevealQueued` -> throttle -> `flushPendingReveals`.

### Step 8: Add debug assertions

**`Bindings.swift`** — DEV-only assertions:

1. In `$$completeRoot` after unwrap: assert no revealed `#suspense` wrappers remain
2. In `revealBoundaryInSSRTree`: assert node ID doesn't change during in-place mutation

## Files Modified

| File | Lines of Change |
|------|----------------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` | ~60 lines changed/added |
| `packages/react-dom-native/src/renderer/HostConfig.js` | ~5 lines added |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | ~80 lines added |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` | ~30 lines changed |

## Verification

1. **No behavior change** — build and run with `/build-demo`, verify SSR first paint, boundary reveals, hydration, and event handlers all work identically
2. **Unit tests** — run `npm run test:swift` to verify existing tests pass and new assertions don't fire
3. **Manual smoke test** — use the example app with Suspense boundaries, confirm no visual regressions
