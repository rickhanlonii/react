# Design: Split Bindings.swift and Root.swift

**Date:** 2026-02-28
**Status:** Approved

## Problem

`Bindings.swift` (~31K tokens) and `Root.swift` (~63K tokens) are the two largest files in the package. Both have multiple distinct responsibilities that would benefit from separation.

## Approach: Hybrid Extraction

Two-layer pattern:
- **Extensions** for tightly-coupled concerns that need shared access to class state
- **Separate types** for genuinely independent concerns with minimal dependencies

This matches React's organizational pattern: `ReactDOMInput.js` is a separate file because it's independent, but `ReactFiberCommitWork.js` keeps all commit phases together because they share state.

## Bindings.swift → 6 files

### File Structure

```
Bindings/
  Bindings.swift              — Core: properties, init, node registry, surface management
  Bindings+Registration.swift — Extension: 40+ $$ binding registrations
  Bindings+Layout.swift       — Extension: Yoga layout, frame sync, tree stats
  Bindings+SSR.swift          — Extension: SSR tree mgmt, hydration traversal
  EventDispatcher.swift       — New type: event handler, dispatch, touch forwarding
  DevToolsInspector.swift     — New type: CDP methods, screenshot, inspector (#if DEBUG)
  UIKitMutationApplier.swift  — (existing, unchanged)
  ViewRegistry.swift          — (existing, unchanged)
```

### Bindings.swift (core)

Keeps all stored properties (source of truth for state):
- `engine`, `viewRegistry`, `differentiator`, `mutationApplier`
- `eventDispatcher` (new, owns EventDispatcher instance)
- `devToolsInspector` (new, owns DevToolsInspector instance, #if DEBUG)
- Node registry: `nodeRegistry`, `nextNodeId`, `childSetRegistry`, `nextChildSetId`
- Surface state: `currentTrees`, `rootYogaNodes`, `rootViews`
- SSR state: `ssrTrees`, `ssrNodeToParent`, `hydrationInProgress`, `pendingSSRCommitTimings`
- Layout state: `lastLayoutTimings`, `lastSyncTimings`, `lastLayoutNodeTimings`, `nativeTracingEnabled`
- Callbacks: `onHydrationComplete`

Methods:
- `init(engine:)`
- `registerBindingFunctions()` — dispatcher that calls sub-registration methods
- `registerSurface()`, `unregisterSurface()`, `registerSurfaceForHydration()`
- `currentTree(forSurface:)` getter

### Bindings+Registration.swift (extension)

All `register*()` methods that set up `$$` bindings:
- `registerNodeCreation()` — `$$createNode`, `$$createTextNode`
- `registerCloneOperations()` — `$$cloneNode`, `$$cloneNodeWithNewProps`, etc.
- `registerTreeConstruction()` — `$$appendChild`
- `registerContainerOperations()` — `$$replaceChildren`, `$$completeRoot`
- `registerMeasurement()` — `$$measureNode`
- `registerNetworking()` — `$$fetch`
- `registerEventHandling()` — `$$registerEventHandler` (forwards to EventDispatcher)

These remain as extension methods because they need access to `nodeRegistry`, `engine`, `viewRegistry`, etc.

### Bindings+Layout.swift (extension)

- `calculateYogaLayout(surfaceId:width:height:)` and overloads
- `syncAllFrames()` (both variants)
- `computeTreeStats()`

Stays as extension because it reads `rootYogaNodes`, `currentTrees`, `rootViews`, `viewRegistry`.

### Bindings+SSR.swift (extension)

- `registerSSRTree()`, `clearSSRTree()`, `revealBoundaryInSSRTree()`, `updateSSRTree()`
- `markHydrationStarted()`, `addSSRCommitTimings()`, `pushPendingSSRCommitTimingsToJS()`
- `registerSSRSubtree()`, `buildParentMap()`, `findSuspenseNodeByBoundaryId()`
- `makeSSRNodeRef()`, `findNextSibling()`, `findNextSiblingInChildren()`
- `registerNewNodesInSubtree()`

Stays as extension because it reads/writes `ssrTrees`, `hydrationInProgress`, `nodeRegistry`, etc.

### EventDispatcher.swift (new type)

```swift
class EventDispatcher {
    private var eventHandler: JSValueRef?
    private let engine: JSEngine
    private let viewRegistry: ViewRegistry

    init(engine: JSEngine, viewRegistry: ViewRegistry)
    func registerEventHandler(_ handler: JSValueRef)
    func dispatchEvent(from family: ShadowNodeFamily, eventType: String, payload: [String: Any])
    func dispatchTouchAtWindowPoint(_ point: CGPoint, in rootView: UIView)
}
```

Cleanly separable — only needs `engine` and `viewRegistry`, no shared mutable state with other concerns.

### DevToolsInspector.swift (new type, #if DEBUG)

```swift
#if DEBUG
class DevToolsInspector {
    var sendInspectorMessage: ((String) -> Void)?
    private var inspectorNodeIdCounter: Int = 900000

    func captureScreenshot(engine: JSEngine)
    func deliverInspectorMessage(_ message: String, ...)
    func cdpGetDocumentTree(...) -> [String: Any]
    func cdpGetComputedStyle(...) -> [String: Any]
    func cdpGetInlineStyle(...) -> [String: Any]
    func cdpGetOuterHTML(...) -> String
    func cdpGetBoxModel(...) -> [String: Any]
    // serialization helpers
}
#endif
```

Receives `nodeRegistry`, `viewRegistry`, `currentTrees` as parameters to methods (not stored — avoids reference cycles).

## Root.swift → 6 files

### File Structure

```
ReactDomNativeKit/
  Root.swift                  — Core: RootOptions, Root properties, render(), unmount(), renderCSR()
  Root+SSR.swift              — Extension: SSR stream + hydration (combined)
  Root+BoundaryReveals.swift  — Extension: throttled reveal queue, timing collection
  Root+HotReload.swift        — Extension: rerender(), state reset, Fast Refresh
  Root+Lifecycle.swift        — Extension: layout observer, viewport updates, teardown
  Flight/
    FlightStreamController.swift  — New type: startFlightStream() setup
    FlightStreamClient.swift      — (existing, unchanged)
    FlightStreamDelegate.swift    — (existing, unchanged)
```

### Root.swift (core)

Keeps all stored properties (source of truth):
- Public: `container`, `options`, `isUnmounted`
- Private: `surfaceId`, `renderMode`, `layoutObserver`
- SSR state: `ssrParser`, `ssrTreeBuilder`, `ssrBoundaryManager`, `ssrCoordinator`, `ssrDataTask`, `ssrFlightDataBuffer`, `ssrJavaScriptBuffer`, `ssrViewRegistry`, `ssrMutationApplier`, `ssrRevealHasOccurred`, `ssrStreamComplete`, `ssrShellComplete`, `ssrURL`
- Hydration state: `hydrationStarted`, `hydrationCommitted`, `flightResponseId`, `postHydrationFlightBuffer`, `pendingHydration`
- Reveal state: `pendingReveals`, `revealTimer`, `shellPaintTime`, `ssrCommitTimings`

Methods:
- `RootOptions` struct
- `init(container:options:)`
- `render(serverURL:completion:)` — public entry, delegates to CSR or SSR
- `renderCSR(serverURL:completion:)` — CSR flow
- `unmount()` — teardown

### Root+SSR.swift (extension)

SSR and Hydration combined (too coupled to separate — share 15+ properties, bidirectional state flow):
- `renderWithSSR(serverURL:completion:)` — SSR entry, sets up parser/coordinator/tree builder
- `hydrateRoot(serverURL:completion:)` — hydration entry, boots runtime, registers SSR tree
- `onHydrationCommitted()` — React commit callback
- `cleanupSSRState()` — post-hydration cleanup
- `feedSSRData()`, `feedSSRSegment()` — test hooks
- Helpers: `createViewsFromTree()`, `collectCreateMutations()`, `syncSSRFrames()`, `computeSSRTreeStats()`

### Root+BoundaryReveals.swift (extension)

- `queueBoundaryReveal(id:contentNodes:)`
- `scheduleRevealFlush()`
- `flushPendingReveals()`
- `onViewsNeedUpdate` callback setup
- Constants: `FALLBACK_THROTTLE_MS`, `TARGET_LCP_MS`
- SSR commit timing accumulation

Stays as extension because it reads `hydrationStarted`, `hydrationCommitted` and calls Bindings methods.

### Root+HotReload.swift (extension)

- `rerender()` — reset all state, re-execute render mode
- `setupHotReload()` — WebSocket handler for Fast Refresh
- State reset logic for all SSR/hydration/reveal properties

### Root+Lifecycle.swift (extension)

- `setupLayoutObserver()` — KVO on container bounds
- `updateViewportSize()` — notify runtime of viewport changes
- Cleanup helpers

### FlightStreamController.swift (new type)

```swift
class FlightStreamController {
    func startFlightStream(
        serverURL: String,
        engine: JSEngine,
        onRow: @escaping (String) -> Void,
        onComplete: @escaping () -> Void
    )
}
```

Encapsulates `FlightStreamClient` + `FlightStreamDelegate` setup. Cleanly separable — opens URLSession, receives chunks, calls back.

## Implementation Strategy

### Order

1. **Bindings extensions first** (lowest risk, purely organizational)
   - Create `Bindings+Registration.swift`, move registration methods
   - Create `Bindings+Layout.swift`, move layout methods
   - Create `Bindings+SSR.swift`, move SSR/hydration methods
   - Test: `npm run test:swift`

2. **Bindings type extractions** (new types, requires updating call sites)
   - Create `EventDispatcher.swift`, update Bindings to delegate
   - Create `DevToolsInspector.swift` (#if DEBUG), update Bindings
   - Test: `npm run test:swift` + `npm run test:fantom`

3. **Root extensions** (same approach as Bindings)
   - Create `Root+SSR.swift`, move SSR+hydration methods
   - Create `Root+BoundaryReveals.swift`, move reveal methods
   - Create `Root+HotReload.swift`, move hot reload methods
   - Create `Root+Lifecycle.swift`, move lifecycle methods
   - Test: `npm run test:swift`

4. **Root type extraction**
   - Create `FlightStreamController.swift`, update Root to delegate
   - Test: `npm run test:swift` + `npm run test:fantom` + `npm run test:e2e-swift`

### Testing

- `npm run test:swift` after each step (compilation + unit tests)
- `npm run test:fantom` after type extractions (integration)
- `npm run test:e2e-swift` as final verification (end-to-end)

### Commits

One commit per logical step to keep the diff reviewable and bisectable.

## Decision Log

- **Why extensions for SSR+Hydration?** They share 15+ properties with bidirectional state flow. Separating into types would require complex observer/delegate protocols for little encapsulation benefit.
- **Why separate types for EventDispatcher/DevToolsInspector?** They have minimal dependencies (just `engine` + `viewRegistry`), no shared mutable state with other concerns. Genuinely independent.
- **Why combine SSR+Hydration in Root?** SSR buffers Flight data for hydration, hydration reads SSR infrastructure. They're phases of one lifecycle, not independent concerns.
- **Why keep all stored properties on the core class?** Extensions can access them directly. Moving properties to sub-types would require indirection/delegation that adds complexity without benefit for tightly-coupled concerns.
