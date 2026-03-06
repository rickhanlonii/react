# Fix: Start PPR hydration before resume stream ends

## Context

In the PPR (Partial Pre-Rendering) flow, hydration doesn't start until the resume SSR stream fully completes. This delays interactivity unnecessarily because:

1. The static shell paints instantly (prelude replay is synchronous)
2. The JS bundle downloads in parallel
3. But hydration waits for the entire resume stream to finish, even though Flight data could flow progressively

The regular SSR flow (`startHydration` in Root+SSR.swift) already starts hydration eagerly when boot completes + shell is painted. The PPR flow should do the same.

## Root Cause

In `Root+Prerender.swift`:
- The boot callback is a **no-op** `rt.boot { _ in }` (line 104) — doesn't set up hydration
- `onRootComplete` does **not** trigger `pendingHydration` (line 140 comment: "hydration is NOT triggered here")
- `startResumeHydration()` is only called when the resume stream **completes** (line 182)

There's a technical reason it was built this way: the resume stream sends a duplicate Flight bootstrap `self.__next_f.push([0])` which **resets** `flightDataWriter` to null. If hydration started before this reset, the ReadableStream would break.

## Changes

### 1. Server: Remove duplicate Flight bootstrap from resume endpoint

**File**: `example/server/ssr-server.js`

In the `POST /resume/:name` handler, remove the Flight and debug bootstrap pushes (lines 494-499):

```javascript
// REMOVE these 4 lines:
var bootstrap = JSON.stringify(['JS', 'self.__next_f.push([0])']) + '\n';
pendingRows.push(bootstrap);
var debugBootstrap = JSON.stringify(['JS', 'self.__next_debug.push([0])']) + '\n';
pendingRows.push(debugBootstrap);
```

The prelude already initialized these receivers. The resume is a continuation, not a fresh start.

### 2. Swift: Start hydration eagerly in the prerender flow

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Prerender.swift`

Model after `startHydration()` in Root+SSR.swift (lines 83-224):

**a) Replace boot callback** — In `onBootstrapURLReceived` (line 86), replace `rt.boot { _ in }` with the full boot callback pattern from Root+SSR.swift lines 105-223. This creates a `doHydrate` closure that:
- Sets `hydrationStarted = true`
- Switches renderer to Bindings infrastructure
- Registers SSR tree for hydration
- Replays buffered JS instructions
- Derives Flight URL and calls `hydrateFromStream()`
- If shell not ready yet, stores as `pendingHydration`

**b) Add pendingHydration trigger to onRootComplete** — In the `onRootComplete` handler (line 126), add after `ssrShellComplete = true`:
```swift
if let pending = self.pendingHydration {
    self.pendingHydration = nil
    pending()
}
```

**c) Change resume stream completion** — In `startResumeRequest` (line 175), change the completion handler from calling `startResumeHydration()` to just:
```swift
self.ssrStreamComplete = true
self.maybeCleanupSSRState()
```

**d) Remove `startResumeHydration()`** — Delete the entire method (lines 199-316). Its logic is now in the boot callback.

## Key Timing Scenarios

All three work correctly due to the existing Flight receiver design (`flightDataBuffer`/`flightDataWriter`/`flightDataClosed`):

1. **Boot before resume data**: Empty ReadableStream created, resume data enqueued via writer as it arrives
2. **Boot after some resume data**: Buffered JS replayed, buffer flushed to ReadableStream, remaining data flows via writer
3. **Boot after resume ends**: All JS replayed including close instruction, ReadableStream gets all data and closes immediately

## Verification

1. Run the demo app with the prerender fixture (30-prerender-resume)
2. Check logs: "Resume hydration starting" should appear BEFORE "Resume stream complete"
3. Verify static shell appears instantly, dynamic content fills in, app is interactive
4. Run `/test` to check for regressions
