# Refactor: Split Bindings.swift into Extensions

`Bindings.swift` is ~31K tokens — the largest file in the package. It has multiple distinct responsibilities that map cleanly to separate extension files.

## Current Responsibilities in Bindings.swift

1. **Core properties & init** — engine, viewRegistry, differentiator, mutationApplier, node registry
2. **Surface management** — registerSurface, unregisterSurface, registerSurfaceForHydration
3. **SSR/Hydration tree management** — registerSSRTree, clearSSRTree, revealBoundaryInSSRTree, updateSSRTree, markHydrationStarted, SSR commit timings
4. **Layout** — calculateYogaLayout, syncAllFrames, computeTreeStats
5. **Event dispatch** — dispatchEvent, registerEventHandler, event priority constants
6. **`$$` binding registration** — registerBindingFunctions (the bulk of the file: ~40+ bindings)

## Proposed Split

All files stay in `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/`.

### Keep in `Bindings.swift`
- Class declaration, stored properties, init
- Node registry (`registerNode`, `lookupNode`, `nextNodeId`, `nodeRegistry`, `childSetRegistry`)
- Surface management (registerSurface, unregisterSurface, registerSurfaceForHydration)
- `registerBindingFunctions()` dispatch method (calls into extension methods)

### New: `Bindings+Hydration.swift`
Move all SSR/hydration-related methods:
- `registerSSRTree`, `registerSSRSubtree`, `buildParentMap`
- `clearSSRTree`, `revealBoundaryInSSRTree`, `updateSSRTree`
- `revealBoundaryInCurrentTree`, `updateCurrentTree`
- `findSuspenseNodeByBoundaryId`, `registerNewNodesInSubtree`
- `markHydrationStarted`, `addSSRCommitTimings`, `pushPendingSSRCommitTimingsToJS`
- `ssrTrees`, `hydrationInProgress`, `pendingSSRCommitTimings`, `ssrNodeToParent`, `onHydrationComplete`

### New: `Bindings+Layout.swift`
Move layout methods:
- `calculateYogaLayout` (both tracing and non-tracing variants)
- `syncAllFrames` (both variants)
- `computeTreeStats`
- `rootYogaNodes` dictionary
- `lastLayoutTimings`, `lastSyncTimings`, `lastLayoutNodeTimings`

### New: `Bindings+Events.swift`
Move event dispatch:
- `dispatchEvent`
- `eventHandler` property
- `registerEventPriorityConstants`

### New: `Bindings+Registration.swift`
Move the bulk of `$$` function registrations:
- All `engine.setGlobalFunction("$$...")` calls
- Currently these are inline in `registerBindingFunctions()` — extract groups of related bindings into named methods called from `registerBindingFunctions()`

## Approach

- Use `extension Bindings { }` in each new file
- Properties that need to move to extensions must use computed properties backed by storage in the main class, OR use `internal` access on the main class's stored properties so extensions in the same module can access them
- Since all files are in the same Swift module (`ReactDomNativeKit`), `internal` access works fine
- Mark moved stored properties as `internal` (default) on the main class, accessed from extensions

## Verification

1. `npm run test:swift` — Swift unit tests pass
2. `npm run test:fantom` — Integration tests pass
3. `npm run test:e2e-swift` — E2E tests pass
4. Build Falcon Demo app — no compile errors
