# Split Bindings.swift and Root.swift Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the two largest Swift files (`Bindings.swift` ~2566 lines, `Root.swift` ~1331 lines) into focused extension files and extracted types, without changing any behavior.

**Architecture:** Hybrid approach — Swift extensions for tightly-coupled concerns that share class state, separate types for genuinely independent concerns (EventDispatcher, DevToolsInspector). All stored properties stay on the core class.

**Tech Stack:** Swift, UIKit, Yoga, JavaScriptCore

**Design doc:** `docs/plans/2026-02-28-bindings-root-split-design.md`

---

## Phase 1: Bindings Extensions

### Task 1: Extract Bindings+Registration.swift

Move all `register*()` methods that set up `$$` JS bindings into an extension file. These are the methods called by `registerBindingFunctions()`.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Create extension file with registration methods**

Create `Bindings+Registration.swift` containing an `extension Bindings` with these methods cut from `Bindings.swift`:

- `registerEventPriorityConstants()` (line 509)
- `registerNodeCreation()` (line 530)
- `registerCloneOperations()` (line 588)
- `registerTreeConstruction()` (line 672)
- `registerContainerOperations()` (line 920)
- `registerMeasurement()` (line 1600)
- `registerEventHandling()` (line 1619)
- `registerNetworking()` (line 1774)
- `registerHydrationTraversal()` (line 1845)

Also move these private helper methods that are only called from within registration methods:
- `registerNode(_:)` (line 99) — called during node creation/cloning
- `lookupNode(_:)` (line 107) — called during clone/tree operations
- `findInsertionIndex(...)` — called from `registerContainerOperations`
- `reparentSuspenseContentViews(...)` — called from `registerContainerOperations`
- `unwrapRevealedSuspenseNodes(...)` and `unwrapRevealedSuspenseNodesInTree(...)` — called from `$$completeRoot`
- `collectNodeIds(...)` and `collectNodeIds(from:into:)` — called from `$$completeRoot`
- `pushPendingSSRCommitTimingsToJS()` — called from `$$completeRoot`

**Important:** The `registerBindingFunctions()` method (line 517) stays in `Bindings.swift` — it's the dispatcher that calls all the sub-registration methods. The `registerNode` and `lookupNode` helpers need to change from `private` to `internal` since they'll be in an extension file accessing `nodeRegistry` and `nextNodeId`.

All moved methods that are currently `private` must become `internal` (Swift extensions in the same module can't access private members of the class unless they're in the same file).

All stored properties accessed by these methods must also change from `private` to `internal`:
- `nodeRegistry` → `internal`
- `nextNodeId` → `internal`
- `childSetRegistry` → `internal`
- `nextChildSetId` → `internal`
- `eventHandler` → `internal`
- `nativeTracingEnabled` → already `internal`
- `lastLayoutTimings` → `internal`
- `lastSyncTimings` → `internal`
- `lastLayoutNodeTimings` → `internal`
- `currentTrees` → `internal`
- `rootYogaNodes` → `internal`
- `rootViews` → `internal`
- `ssrTrees` → `internal`
- `hydrationInProgress` → `internal`
- `pendingSSRCommitTimings` → `internal`
- `ssrNodeToParent` → `internal`

**Note:** Since almost all private properties need to become internal for cross-file extension access, change ALL `private` stored properties in Bindings to `internal` in this step. This is a one-time access modifier change — Swift extensions across files require it.

**Step 2: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass, no compilation errors.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/
git commit -m "refactor: extract Bindings+Registration extension"
```

---

### Task 2: Extract Bindings+Layout.swift

Move Yoga layout calculation and frame sync methods into an extension file.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Layout.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Create extension file with layout methods**

Create `Bindings+Layout.swift` containing an `extension Bindings` with these methods cut from `Bindings.swift`:

- `calculateYogaLayout(for:in:surfaceId:tracing:)` (line 1494)
- `syncAllFrames(_:)` (line 1442) — basic version
- `syncAllFrames(_:tracing:nodeTimings:)` (line 1458) — tracing version
- `computeTreeStats(_:)` (line 1253)

These methods access `rootYogaNodes`, `currentTrees`, `rootViews`, `viewRegistry`, `lastLayoutTimings`, `lastSyncTimings`, `lastLayoutNodeTimings` — all already `internal` from Task 1.

**Step 2: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/
git commit -m "refactor: extract Bindings+Layout extension"
```

---

### Task 3: Extract Bindings+SSR.swift

Move SSR tree management, hydration traversal, and boundary reveal methods into an extension file.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+SSR.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Create extension file with SSR/hydration methods**

Create `Bindings+SSR.swift` containing an `extension Bindings` with these methods cut from `Bindings.swift`:

- `registerSSRTree(surfaceId:rootChildren:)` (line 192)
- `registerSSRSubtree(_:)` (line 205)
- `buildParentMap(_:)` (line 213)
- `clearSSRTree(surfaceId:)` (line 221)
- `revealBoundaryInSSRTree(surfaceId:boundaryId:contentNodes:)` (line 228)
- `findSuspenseNodeByBoundaryId(_:in:)` (line 248)
- `markHydrationStarted(surfaceId:)` (line 264)
- `addSSRCommitTimings(_:)` (line 273)
- `revealBoundaryInCurrentTree(surfaceId:boundaryId:contentNodes:)` (line 466)
- `updateSSRTree(surfaceId:newTree:)` (line 489)
- `registerNewNodesInSubtree(_:)` (line 496)
- `makeSSRNodeRef(_:engine:)` (line 1934)
- `findNextSibling(_:)` and `findNextSiblingInChildren(...)` — SSR traversal helpers

Also move `registerSurfaceForHydration(surfaceId:rootView:)` (line 167) — this is SSR-specific surface setup.

These methods access `ssrTrees`, `ssrNodeToParent`, `hydrationInProgress`, `pendingSSRCommitTimings`, `nodeRegistry`, `currentTrees`, `rootYogaNodes`, `engine` — all already `internal`.

**Step 2: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/
git commit -m "refactor: extract Bindings+SSR extension"
```

---

## Phase 2: Bindings Type Extractions

### Task 4: Extract EventDispatcher type

Create a new `EventDispatcher` class that owns event handling state and logic. Bindings creates and owns an instance.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/EventDispatcher.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — add `eventDispatcher` property, remove `eventHandler`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` — update `registerEventHandling()` to forward to `eventDispatcher`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift:920` — update `bindings.dispatchEvent(...)` call
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — if it references `dispatchEvent`

**Step 1: Create EventDispatcher class**

```swift
import JavaScriptCore

/// Handles event dispatch between native UIKit views and the JS runtime.
/// Owns the registered JS event handler and provides methods for dispatching
/// native events (taps, etc.) to the React event system.
class EventDispatcher {
    private var eventHandler: JSValueRef?
    private let engine: JSEngine
    private let viewRegistry: ViewRegistry

    init(engine: JSEngine, viewRegistry: ViewRegistry) {
        self.engine = engine
        self.viewRegistry = viewRegistry
    }

    /// Registers a JS function as the event handler. Called via $$registerEventHandler.
    func registerEventHandler(_ handler: JSValueRef) {
        if let old = eventHandler {
            engine.unprotect(old)
        }
        engine.protect(handler)
        eventHandler = handler
    }

    /// Dispatches an event from a native UIView to the JS event system.
    func dispatchEvent(from view: UIView, eventType: String, payload: [String: Any]) {
        // Move the existing dispatchEvent logic from Bindings.swift
        // Uses viewRegistry.family(for:) to find the shadow node family
        // Calls engine.callFunction(eventHandler, ...) to dispatch to JS
    }

    /// Dispatches a synthetic touch event at window coordinates (used by DevTools).
    func dispatchTouchAtWindowPoint(x: Double, y: Double) {
        // Move existing logic from Bindings.swift
    }

    deinit {
        if let handler = eventHandler {
            engine.unprotect(handler)
        }
    }
}
```

**Step 2: Update Bindings.swift**

Remove `eventHandler` stored property. Add:
```swift
public let eventDispatcher: EventDispatcher
```

Initialize in `init(engine:)`:
```swift
self.eventDispatcher = EventDispatcher(engine: engine, viewRegistry: viewRegistry)
```

Remove `dispatchEvent(from:eventType:payload:)` and `dispatchTouchAtWindowPoint(x:y:)` from Bindings.

**Step 3: Update call sites**

In `Bindings+Registration.swift`, update `registerEventHandling()` to forward to `eventDispatcher.registerEventHandler(...)`.

In `Root.swift:920`, change:
```swift
bindings.dispatchEvent(from: view, eventType: eventType, payload: payload)
```
to:
```swift
bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
```

Search for any other call sites with:
```
grep -r "\.dispatchEvent\|\.dispatchTouchAtWindowPoint" packages/react-dom-native/ios/Sources/
```

**Step 4: Verify compilation and tests**

Run: `npm run test:swift`
Run: `npm run test:fantom`
Expected: All tests pass.

**Step 5: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift
git commit -m "refactor: extract EventDispatcher type from Bindings"
```

---

### Task 5: Extract DevToolsInspector type

Create a new `DevToolsInspector` class that owns all DevTools/CDP inspection logic. Wrap in `#if DEBUG`.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/DevToolsInspector.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — add `devToolsInspector` property, remove inspector-related state
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift` — update `cdpGet*` calls from `bindings.cdpGet*` to `bindings.devToolsInspector?.cdpGet*`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — update `sendInspectorMessage` reference

**Step 1: Create DevToolsInspector class**

```swift
#if DEBUG
import UIKit

/// Handles Chrome DevTools Protocol (CDP) inspection of the shadow tree.
/// Provides methods for DOM inspection, computed styles, box model,
/// screenshots, and HTML serialization for the Elements panel.
class DevToolsInspector {
    var sendInspectorMessage: ((String) -> Void)?
    private var inspectorNodeIdCounter: Int = 900_000

    // Move all CDP methods from Bindings.swift:
    // - cdpGetDocumentTree(surfaceId:)
    // - cdpGetComputedStyle(nodeId:)
    // - cdpGetInlineStyle(nodeId:)
    // - cdpGetOuterHTML(nodeId:)
    // - cdpGetBoxModel(nodeId:)
    // - cdpGetMemoryUsage()
    // - cdpGetPreviewHTML()
    // - captureScreenshot(maxWidth:quality:)
    // - deliverInspectorMessage(_:)
    // - serializeNodeToDict(...)
    // - makeEmptyDocumentDict(...)
    // - nodeToHTML(...)
    // - styleDictToCSS(...)
    // - camelToKebab(...)
    // - formatting helpers

    // These methods need nodeRegistry, viewRegistry, currentTrees passed as parameters
    // since they can't directly access Bindings state
    func cdpGetDocumentTree(
        surfaceId: Int,
        currentTrees: [Int: [ShadowNodeWrapper]],
        viewRegistry: ViewRegistry
    ) -> [String: Any] { ... }

    // etc. for other methods
}
#endif
```

**Step 2: Update Bindings.swift**

Remove `sendInspectorMessage` and `inspectorNodeIdCounter`. Add:
```swift
#if DEBUG
public let devToolsInspector = DevToolsInspector()
#endif
```

Remove all `cdpGet*`, `captureScreenshot`, `deliverInspectorMessage`, `serializeNodeToDict`, `makeEmptyDocumentDict`, `nodeToHTML`, `styleDictToCSS`, `camelToKebab` methods.

**Step 3: Update JSRuntime.swift call sites**

Update all `self.bindings.cdpGet*` calls (lines 359-511) to route through `devToolsInspector`:
```swift
// Before:
cdpResult = self.bindings.cdpGetDocumentTree(surfaceId: 0)
// After:
cdpResult = self.bindings.devToolsInspector?.cdpGetDocumentTree(
    surfaceId: 0,
    currentTrees: self.bindings.currentTrees,
    viewRegistry: self.bindings.viewRegistry
) ?? [:]
```

Update `sendInspectorMessage` references:
```swift
// Before (ReactRuntime.swift:747):
bindings.sendInspectorMessage = { ... }
// After:
bindings.devToolsInspector?.sendInspectorMessage = { ... }

// Before (JSRuntime.swift:342, 529):
self.bindings.sendInspectorMessage?(responseString)
// After:
self.bindings.devToolsInspector?.sendInspectorMessage?(responseString)
```

**Step 4: Verify compilation and tests**

Run: `npm run test:swift`
Run: `npm run test:fantom`
Expected: All tests pass.

**Step 5: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/
git commit -m "refactor: extract DevToolsInspector type from Bindings (#if DEBUG)"
```

---

## Phase 3: Root Extensions

### Task 6: Extract Root+SSR.swift

Move SSR rendering and hydration methods into an extension file. These stay together because they share 15+ properties with bidirectional state flow.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Change all private stored properties to internal**

In `Root.swift`, change all `private` stored properties and methods to `internal` (same rationale as Bindings — cross-file extensions need access):

Properties to change (lines 66-319):
- `surfaceId`, `layoutObserver`, `renderMode` → `internal`
- All SSR properties (`ssrParser`, `ssrTreeBuilder`, etc.) → `internal`
- All hydration properties (`hydrationStarted`, `hydrationCommitted`, etc.) → `internal`
- All reveal properties (`pendingReveals`, `revealTimer`, `shellPaintTime`, `ssrCommitTimings`) → `internal`
- `RenderMode` enum → `internal`

**Step 2: Create extension file with SSR + hydration methods**

Create `Root+SSR.swift` containing an `extension Root` with these methods cut from `Root.swift`:

- `renderWithSSR(serverURL:completion:)` (line 333) — main SSR entry
- `hydrateRoot(serverURL:completion:)` (line 849) — hydration entry
- `onHydrationCommitted()` (line 1220) — React commit callback
- `cleanupSSRState()` (line 1255) — post-hydration cleanup
- `feedSSRData(_:finish:completion:)` (line 662) — test hook
- `feedSSRSegment(_:)` (line 824) — test hook
- `flushPendingRevealsForTesting()` (line 831) — test hook
- `createViewsFromTree(...)` (line 992) — SSR view creation
- `collectCreateMutations(...)` (line 1035) — mutation collection
- `syncSSRFrames(_:)` (line 1049) — basic frame sync
- `syncSSRFrames(_:tracing:nodeTimings:)` (line 1066) — tracing frame sync
- `computeSSRTreeStats(_:)` (line 1094) — static tree stats

**Step 3: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 4: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift
git commit -m "refactor: extract Root+SSR extension (SSR + hydration)"
```

---

### Task 7: Extract Root+BoundaryReveals.swift

Move throttled boundary reveal methods into an extension file.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+BoundaryReveals.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Create extension file with boundary reveal methods**

Create `Root+BoundaryReveals.swift` containing an `extension Root` with these methods cut from `Root.swift`:

- `queueBoundaryReveal(id:contentNodes:)` (line 1111)
- `scheduleRevealFlush()` (line 1118)
- `flushPendingReveals()` (line 1158)

Also move the constants — these must become `static` properties in the extension:
- `FALLBACK_THROTTLE_MS` (line 307)
- `TARGET_LCP_MS` (line 310)

**Note:** The stored properties `pendingReveals`, `revealTimer`, `shellPaintTime`, and `ssrCommitTimings` stay in `Root.swift` — Swift extensions can't add stored properties.

**Step 2: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+BoundaryReveals.swift
git commit -m "refactor: extract Root+BoundaryReveals extension"
```

---

### Task 8: Extract Root+HotReload.swift

Move hot reload / rerender methods into an extension file.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+HotReload.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Create extension file with hot reload methods**

Create `Root+HotReload.swift` containing an `extension Root` with these methods cut from `Root.swift`:

- `rerender()` (line 204) — resets state and re-executes render mode

Note: `rerender()` is `internal` (called by ReactRuntime). It resets all SSR/hydration/reveal state and then calls `render()` or `renderWithSSR()` + `hydrateRoot()` based on `renderMode`.

**Step 2: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+HotReload.swift
git commit -m "refactor: extract Root+HotReload extension"
```

---

### Task 9: Extract Root+Lifecycle.swift

Move layout observer and viewport update methods into an extension file.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Lifecycle.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Create extension file with lifecycle methods**

Create `Root+Lifecycle.swift` containing an `extension Root` with these methods cut from `Root.swift`:

- `setupLayoutObserver()` (line 1287)
- `updateViewportSize()` (line 195)

**Step 2: Verify compilation**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Lifecycle.swift
git commit -m "refactor: extract Root+Lifecycle extension"
```

---

## Phase 4: Final Verification

### Task 10: Full test suite verification

Run the complete test suite to verify no regressions.

**Step 1: Run Swift unit tests**

Run: `npm run test:swift`
Expected: All tests pass.

**Step 2: Run Fantom integration tests**

Run: `npm run test:fantom`
Expected: All tests pass.

**Step 3: Run E2E tests**

Run: `npm run test:e2e-swift`
Expected: All tests pass.

**Step 4: Final commit (move design doc)**

```
mv docs/plans/2026-02-28-bindings-root-split-design.md docs/plans/complete/
git add docs/plans/
git commit -m "docs: move bindings-root-split design to complete"
```

---

## File Summary

After all tasks complete:

```
Bindings/
  Bindings.swift                — Core: properties, init, surface management (~200 lines)
  Bindings+Registration.swift   — 40+ $$ binding registrations (~1300 lines)
  Bindings+Layout.swift         — Yoga layout, frame sync (~150 lines)
  Bindings+SSR.swift            — SSR tree, hydration traversal (~350 lines)
  EventDispatcher.swift         — Event handler, dispatch (~80 lines)
  DevToolsInspector.swift       — CDP methods, screenshot (#if DEBUG) (~500 lines)
  UIKitMutationApplier.swift    — (unchanged)
  ViewRegistry.swift            — (unchanged)

ReactDomNativeKit/
  Root.swift                    — Core: RootOptions, properties, render/unmount (~200 lines)
  Root+SSR.swift                — SSR + hydration (~700 lines)
  Root+BoundaryReveals.swift    — Throttled reveals, timing (~120 lines)
  Root+HotReload.swift          — Rerender, state reset (~50 lines)
  Root+Lifecycle.swift          — Layout observer, viewport (~30 lines)
```
