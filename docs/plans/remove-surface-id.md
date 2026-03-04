# Remove surfaceId: Use Direct Object References Like React DOM

## Context

The renderer currently uses an integer `surfaceId` to identify React roots — a pattern inherited from React Native's Fabric architecture. Fabric needs serializable integer IDs because JS and native run in separate processes. But react-dom-native uses JSC's native Swift API (same process, direct object access), so this indirection is unnecessary.

React DOM doesn't have this concept. `createRoot(domNode)` uses the DOM node itself as the container identity. We should do the same: the `Root` object IS the identity. No integer mapping layer.

**Key finding**: `ShadowNodeFamily.surfaceId` is written during init but **never read anywhere** — it's already dead code.

## Plan

### Step 1: Remove `surfaceId` from `ShadowNodeFamily` and `ShadowNodeWrapper.createElementNode`

It's never read. Just delete it.

**Files:**
- `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeFamily.swift` — Remove `surfaceId` property and init parameter
- `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift` — Remove `surfaceId` param from `createElementNode()`, stop passing it to `ShadowNodeFamily`
- `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift` — Remove `surfaceId` property, stop passing to node creation
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` — Stop passing `surfaceId` when creating segment `ShadowTreeBuilder`s
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` — Stop extracting `surfaceId` from bridge args in `$$createNode`/`$$createTextNode`, stop passing to node creation

### Step 2: Move per-surface state from `Bindings` dictionaries to `Root`

Currently Bindings holds 5 `[Int: X]` dictionaries keyed by surfaceId. Move this state onto Root itself.

**Add to `Root`:**
```swift
// Per-surface state (previously in Bindings dictionaries)
var currentTree: [ShadowNodeWrapper] = []  // was currentTrees[surfaceId]
var rootYogaNode: YGNodeRef?               // was rootYogaNodes[surfaceId]
var rootView: UIView?                      // was rootViews[surfaceId]
var ssrTree: [ShadowNodeWrapper]?          // was ssrTrees[surfaceId]
var hydrationInProgress: Bool = false       // was hydrationInProgress.contains(surfaceId)
```

Note: Root already has `let renderer = Renderer()` which owns `currentTree`. So `renderer.currentTree` is already the source of truth. We just need `rootYogaNode`, `rootView`, `ssrTree`, `hydrationInProgress`.

**Files:**
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` — Add per-surface state properties, update `unmount()` to clean them up
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — Remove `currentTrees`, `rootYogaNodes`, `rootViews`, `ssrTrees`, `hydrationInProgress` dictionaries. Remove `registerSurface(surfaceId:)`, `unregisterSurface(surfaceId:)`, `currentTree(forSurface:)`. Add methods that take `Root` directly.
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+SSR.swift` — Change all methods from `surfaceId: Int` to `root: Root`. Access `root.ssrTree`, `root.rootView`, etc. directly.

### Step 3: Pass `Root` reference through JS instead of `surfaceId` integer

Use JSC's existing `wrapNativeObject`/`unwrapNativeObject` to pass Root as an opaque handle through JS. JS holds it, passes it back to bridge functions — just like React DOM passes the container DOM node.

**Swift → JS (entry points):**
- `ReactRuntime.renderSurface()` — pass wrapped Root ref instead of surfaceId integer
- `ReactRuntime.hydrateSurface()` — same

```swift
// Before:
engine.evaluate("globalThis.__REACT_DOM_NATIVE__.renderFromStream(\(surfaceId))")
// After:
let rootRef = engine.wrapNativeObject(root)
engine.callFunction("globalThis.__REACT_DOM_NATIVE__.renderFromStream", args: [rootRef])
```

**JS container object:**
```javascript
// Before:
const container = { surfaceId, rootView: nativeRootView, ... }
// After:
const container = { rootHandle: nativeRootView, ... }
// nativeRootView IS the opaque Root reference (was called "nativeRootView",
// now it literally is the Root handle from Swift)
```

**JS → Swift (bridge functions):**
- `$$createNode(type, rootHandle, props, ...)` — Swift unwraps rootHandle to Root (but note: Step 1 already removed the surfaceId param from node creation, so this param can actually be removed entirely — nodes don't need their root at creation time, just like `document.createElement` doesn't)
- `$$createTextNode(text, rootHandle, ...)` — same (can be removed)
- `$$completeRoot(rootHandle, childNodes)` — Swift unwraps to get Root, accesses root.renderer directly
- `$$onHydrationCommit(rootHandle)` — Swift unwraps to Root
- `$$getFirstSSRChild(rootHandle)` — Swift unwraps, reads root.ssrTree
- `$$registerSSRTree(rootHandle, nodeIds)` — Swift unwraps, sets root.ssrTree
- `$$clearSSRTree(rootHandle)` — Swift unwraps, clears root.ssrTree

**Files:**
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — Update `renderSurface`/`hydrateSurface` to pass Root ref. Update entry point JS calls.
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` — Update `$$createNode`, `$$createTextNode` to drop surfaceId param entirely (nodes don't need it). Update `$$completeRoot` to unwrap Root ref. Update `$$onHydrationCommit`, SSR traversal functions.
- `packages/react-dom-native/src/renderer/renderer.js` — Update `createRoot`/`hydrateRoot` to store rootHandle instead of surfaceId. Remove `nextSurfaceId` counter.
- `packages/react-dom-native/src/renderer/HostConfig.js` — Update `createInstance`, `createTextInstance` to not pass surfaceId. Update `replaceContainerChildren` to pass rootHandle. Update `getFirstHydratableChildWithinContainer`.
- `packages/react-dom-native/src/bridge/types.d.ts` — Update function signatures (remove surfaceId params, add rootHandle where needed)
- `packages/react-dom-native/src/bridge/index.js` — Update wrapper functions
- `packages/react-dom-native/src/entry.js` — Update `renderFromStream`/`hydrateFromStream` to accept rootHandle

### Step 4: Simplify `ReactRuntime` surface management

Remove the `activeSurfaces` dictionary and `nextSurfaceId`. Replace with a simple `Set` for tracking active roots (needed for iteration in `syncTracingToRenderers`, `clearAllSurfaces`, `resetForTesting`, `performFullReset`).

**Files:**
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`:
  - Remove `activeSurfaces: [Int: SurfaceInfo]`, `SurfaceInfo`, `nextSurfaceId`
  - Remove `rootForSurface(_:)`, `reserveSurface()`, `registerSurface()`, `registerSurfaceForHydration()`, `unregisterSurface()`
  - Add `activeRoots: NSHashTable<Root>` (weak set) and simple `registerRoot`/`unregisterRoot` methods
  - Update `renderSurface`/`hydrateSurface` to take Root directly
  - Update `syncTracingToRenderers`, `clearAllSurfaces`, `resetForTesting`, `performFullReset` to iterate activeRoots
  - Move `serverURL` storage to Root (it's already a per-root concept)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` — Update `render()` and `unmount()` to use new API
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` — Remove `reserveSurface` calls, use `registerRoot` instead. Update hydration setup to pass Root refs directly.
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Prerender.swift` — Same as SSR
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+BoundaryReveals.swift` — Pass Root instead of surfaceId to bindings methods

### Step 5: Update `onHydrationComplete` callback signature

Currently `onHydrationComplete: ((Int) -> Void)?` passes surfaceId. Change to pass Root:

```swift
// Before:
var onHydrationComplete: ((Int) -> Void)?
// After:
var onHydrationComplete: ((Root) -> Void)?
```

**Files:**
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — Update type
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` — Update callback registration
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Prerender.swift` — Same

## Verification

1. **Swift unit tests**: `npm run test:swift`
2. **JS unit tests**: `npm test`
3. **Fantom integration tests**: `npm run test:fantom` (JS ↔ Swift bridge — most critical)
4. **E2E tests**: `npm run test:e2e-swift`
5. **Manual**: Run the demo app (`/build demo`), verify CSR, SSR+hydration, and prerender all work
6. **Hot reload**: Verify fast refresh and full reload still work with the new Root-based tracking
