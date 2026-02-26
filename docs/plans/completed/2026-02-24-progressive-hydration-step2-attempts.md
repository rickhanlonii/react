# Progressive Hydration Step 2: Approaches Tried

## Goal

Hydration starts when the SSR shell completes (`onRootComplete`), not when the entire SSR stream finishes. This makes the app interactive sooner by allowing React to begin hydrating resolved content while Suspense boundary content is still streaming.

## Files Modified

- `ReactRuntime.swift` — `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`
- `Root.swift` — `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

## Infrastructure Changes (Working, Keep These)

These changes are reusable regardless of which hydration approach we pursue:

- **`ReactRuntime.hydrateSurface()`** — added `keepOpen: Bool` param, returns `Int` responseId
- **`ReactRuntime.processFlightRow()`** — forwards individual Flight rows to active FlightStreamClient
- **`ReactRuntime.closeFlightResponse()`** — closes an active Flight response
- **`ReactRuntime.hydrateWithFlightStream()`** — sets up hydration with a live HTTP Flight stream instead of buffered data
- **`Root.swift` state** — added `ssrShellComplete`, `hydrationStarted`, `flightResponseId`, `ssrShellFlightDataCount`
- **`Root.swift` `onFlightDataReceived`** — forwards rows after hydration starts, buffers otherwise
- **`Root.swift` split cleanup** — `cleanupSSRState()` (hydration only) + `cleanupSSRStreamState()` (stream infra)
- **`Root.swift` SSR stream completion** — closes Flight response if hydration is active

## Approach 1: Gate on ssrShellComplete + Replay All Buffered Flight Data

Changed the hydration gate from `ssrStreamComplete` to `ssrShellComplete`, so hydration fires as soon as the shell is painted instead of waiting for the full stream.

**Result:** Hydration mismatch. React expects `<h3>` (resolved from Flight data) but the SSR tree has `<div>` (the Suspense fallback). All 59 Flight rows arrive before root complete — the server sends ALL Flight data upfront, including boundary resolution data. When replayed synchronously, React's lazy chunks resolve immediately, so React renders resolved content for boundaries that still have `pending=true` fallbacks in the SSR tree.

## Approach 2: Gate on ssrShellComplete + Split Buffer (Shell vs Boundary)

Track `ssrShellFlightDataCount` at root complete time, then only replay shell-related rows (the first N rows that arrived before `onRootComplete`), holding back boundary-resolution rows.

**Result:** Same mismatch. `shell: 59` equals `total: 59` — ALL Flight data arrives before root complete. The server embeds all Flight D rows in the SSR stream before the R (root complete) instruction. There is no way to separate shell vs boundary data by arrival timing since they all arrive together.

## Approach 3: Gate on ssrShellComplete + Live HTTP Flight Stream

Instead of replaying buffered data, start a fresh HTTP request to the Flight server (`hydrateWithFlightStream`). The Flight server streams progressively (boundary content delayed by 500ms, 1000ms, etc.), so React's `use()` should suspend for unresolved boundaries, creating dehydrated Suspense fibers.

**Result:** Same mismatch, but for a different reason. The SSR stream's boundary reveals fire `$$notifyBoundaryRevealed()` during React's active hydration walk, mutating the SSR reference tree while React is traversing it. The reveals happen because the SSR stream (port 6001) continues running in parallel with hydration.

## Root Cause Analysis

The hydration mismatch error shows React expects `<h3>` (resolved boundary content) but finds `<div>` (skeleton fallback) in the SSR reference tree. The `+` line is what React wants to render (from Flight data), the `-` line is what the SSR tree has.

The fundamental issue: when Flight data resolves Suspense boundary lazy chunks synchronously (because all D rows are sent before root complete), React's reconciler renders the resolved content. Even though the `#suspense` host instance has `pending=true`, React does not check this before deciding what to render — it checks whether `use()` suspends. If the lazy chunk is already resolved, `use()` returns immediately and React renders the resolved content, causing a mismatch with the SSR tree's fallback.

## Next Investigation Direction

There may be a cloning issue in how the SSR reference tree is passed to React. The tree registered via `registerSurfaceForHydration` / `registerSSRTree` might share object references with the tree being mutated by boundary reveals. When a boundary reveals in the SSR stream, it mutates nodes that React is also reading during hydration. Adding logging to track the shadow tree state at registration time vs when React reads it during hydration traversal would help identify if this is the issue.

## Key Bug Found: cleanupSSRStreamState Ordering

The stream complete handler was calling `cleanupSSRStreamState()` (which nils `ssrCoordinator`) BEFORE firing `pendingHydration`. This meant `doHydrate` read `treeBuilder.rootChildren` (stale shell with pending=true) instead of `ssrCoordinator.currentRootChildren` (fully revealed tree). Fixed by reordering: pendingHydration fires first, THEN cleanup.

## Approach 4: HTTP Flight Stream + Deferred Reveals

Used `hydrateWithFlightStream` (live HTTP stream) at shell complete, plus deferred SSR reveals during hydration.
- Result: Zero hydration errors, but React never commits (`$$completeRoot` never called). React's reconciler appears to not support hydration with dehydrated Suspense boundaries fed by a live Flight stream. The hydration walk starts but React stays suspended indefinitely even after all Flight data arrives and the stream completes.

## Current State

The codebase is in a working state with the ssrStreamComplete gate and the cleanupSSRStreamState ordering fix. All infrastructure for progressive hydration is in place (state properties, Flight forwarding, split cleanup, hydrateWithFlightStream). Progressive hydration requires either:
1. Reconciler support for hydrating dehydrated Suspense boundaries with live Flight streaming
2. Server-side changes to send Flight D rows progressively (after boundary resolution) instead of all upfront before root complete
