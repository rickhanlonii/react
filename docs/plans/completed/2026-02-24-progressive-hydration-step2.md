# Plan: Progressive Hydration Step 2 — Enable Progressive Hydration

## Context

Step 1 (landed in `093e8bc`) fixed five infrastructure bugs that would cause failures if hydration ran while Suspense boundaries are still pending. Step 2 removes the gate that waits for the SSR stream to complete before starting hydration. After Step 2, the app becomes interactive as soon as the shell is hydrated, even while boundaries are still streaming in.

**Current behavior:** Hydration waits for the entire SSR stream to finish (`ssrStreamComplete`), then replays all buffered Flight rows at once and closes the Flight response.

**Target behavior:** Hydration starts as soon as the SSR shell is complete (`onRootComplete`) and JS runtime is ready. Flight data arriving after hydration forwards to the JS Flight client in real-time. Boundaries reveal progressively.

## Files Modified

| File | Change |
|------|--------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | Replace stream-complete gate with shell-complete gate, forward Flight data, split cleanup |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` | Return responseId from `hydrateSurface`, add `keepOpen` parameter |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` | No changes needed |
| `packages/react-dom-native/src/entry.js` | No changes needed ($$closeFlightResponse already exists) |

## Changes

### 1. Modify `hydrateSurface` to support keep-open mode

**File:** `ReactRuntime.swift` — `hydrateSurface()` (line ~218)

- Change return type from `Void` to `Int` (responseId)
- Add `keepOpen: Bool = false` parameter
- When `keepOpen` is true, skip the `client.close()` call after replaying buffered rows
- Return `responseId` so Root.swift can reference the Flight response

```swift
// BEFORE:
internal func hydrateSurface(surfaceId: Int, serverURL: String, ssrData: [String]) throws {
    ...
    client.close()
}

// AFTER:
@discardableResult
internal func hydrateSurface(surfaceId: Int, serverURL: String, ssrData: [String], keepOpen: Bool = false) throws -> Int {
    ...
    let responseId = engine.toInt(responseIdRef) ?? 0
    ...
    if !keepOpen {
        client.close()
    }
    return responseId
}
```

### 2. Add Flight row forwarding method to ReactRuntime

**File:** `ReactRuntime.swift`

Add a method to forward individual Flight rows to an existing FlightStreamClient:

```swift
/// Forwards a raw Flight row to an active FlightStreamClient for real-time processing.
internal func processFlightRow(responseId: Int, row: String) {
    guard let entry = activeFlightClients[responseId] else { return }
    entry.client.processString(row + "\n")
}

/// Closes an active Flight response (signals end of data to JS).
internal func closeFlightResponse(responseId: Int) {
    guard let entry = activeFlightClients[responseId] else { return }
    entry.client.close()
}
```

This reuses the existing `FlightStreamClient` parser, which correctly handles the Flight wire protocol including binary rows. No new JS bridge function needed.

### 3. Replace hydration gate with shell-complete trigger

**File:** `Root.swift`

Add new state properties:

```swift
private var ssrShellComplete: Bool = false
private var hydrationStarted: Bool = false
private var flightResponseId: Int?
```

In `renderWithSSR()` → `treeBuilder.onRootComplete`, set `ssrShellComplete` and fire pending hydration:

```swift
treeBuilder.onRootComplete = { [weak self] rootChildren in
    guard let self = self else { return }
    // ... existing first paint logic ...

    self.ssrShellComplete = true

    // If hydration was requested and JS is ready, start now
    if let pending = self.pendingHydration {
        self.pendingHydration = nil
        pending()
    }
}
```

In `hydrateRoot()` → the gate check, replace `ssrStreamComplete` with `ssrShellComplete`:

```swift
// BEFORE:
if self.ssrStreamComplete {
    doHydrate()
} else {
    self.pendingHydration = doHydrate
}

// AFTER:
if self.ssrShellComplete {
    doHydrate()
} else {
    // Shell not ready yet — queue until onRootComplete fires
    self.pendingHydration = doHydrate
}
```

### 4. Switch Flight data from buffering to streaming

**File:** `Root.swift` — `renderWithSSR()`

Change the `onFlightDataReceived` callback to forward rows after hydration starts:

```swift
coordinator.onFlightDataReceived = { [weak self] row in
    guard let self = self else { return }
    if self.hydrationStarted, let responseId = self.flightResponseId {
        // Hydration active — forward to JS Flight client immediately
        ReactRuntime.shared.processFlightRow(responseId: responseId, row: row)
    } else {
        // Hydration not started — buffer for replay
        self.ssrFlightDataBuffer.append(row)
    }
}
```

### 5. Store responseId and set hydrationStarted in doHydrate

**File:** `Root.swift` — `doHydrate` closure in `hydrateRoot()`

Mark hydration started before calling `hydrateSurface`, and store the response ID. Pass `keepOpen: true` so the Flight response stays open for streaming rows:

```swift
let doHydrate = { [weak self] in
    guard let self = self, let surfaceId = self.surfaceId else { return }
    self.hydrationStarted = true
    // ... existing setup logic ...

    do {
        let responseId = try rt.hydrateSurface(
            surfaceId: surfaceId,
            serverURL: serverURL,
            ssrData: self.ssrFlightDataBuffer,
            keepOpen: !self.ssrStreamComplete  // Keep open if stream still active
        )
        self.flightResponseId = responseId
        completion?(nil)
    } catch { ... }
}
```

Note: If the SSR stream already completed before hydration starts (slow JS boot), `keepOpen` is false and the response closes immediately — matching current behavior.

### 6. Close Flight response on SSR stream complete

**File:** `Root.swift` — SSR stream completion handler

When the SSR stream finishes, close the Flight response if hydration is already active:

```swift
let streamDelegate = SSRStreamDelegate(parser: parser) { [weak self] in
    guard let self = self else { return }
    self.ssrStreamComplete = true
    let revealCount = boundaryManager.revealedCount
    print("[ReactDomNativeKit] SSR stream complete, reveals processed: \(revealCount)")

    // Close the Flight response if hydration is active
    if self.hydrationStarted, let responseId = self.flightResponseId {
        ReactRuntime.shared.closeFlightResponse(responseId: responseId)
    }

    // Clean up SSR stream infrastructure
    self.cleanupSSRStreamState()

    // Legacy safety net: if hydration was queued on stream complete
    if let pending = self.pendingHydration {
        self.pendingHydration = nil
        pending()
    }
}
```

### 7. Split cleanup into hydration cleanup + stream cleanup

**File:** `Root.swift`

**`cleanupSSRState()`** — called on hydration complete (first `$$completeRoot`). Keep SSR stream infrastructure alive:

```swift
private func cleanupSSRState() {
    // DON'T cancel data task — SSR stream may still be delivering
    // boundary content + Flight data. Only cancel on unmount.
    // DON'T release coordinator — handles boundary reveals after hydration.

    ssrFlightDataBuffer.removeAll()
    ssrViewRegistry = nil
    ssrRevealHasOccurred = false
    pendingHydration = nil
    ssrCommitTimings.removeAll()

    // Cancel any pending throttled reveals
    revealTimer?.cancel()
    revealTimer = nil
    pendingReveals.removeAll()

    print("[ReactDomNativeKit] Hydration complete (SSR stream may still be active)")
}
```

**Add `cleanupSSRStreamState()`** — called when the SSR stream actually finishes:

```swift
private func cleanupSSRStreamState() {
    ssrDataTask = nil
    ssrParser = nil
    ssrTreeBuilder = nil
    ssrBoundaryManager = nil
    ssrCoordinator = nil
    flightResponseId = nil

    print("[ReactDomNativeKit] SSR stream complete, stream state cleaned up")
}
```

### 8. Update unmount and rerender cleanup

**File:** `Root.swift`

`unmount()` and `rerender()` already clean up everything. Add the new state properties to their cleanup:

```swift
// In unmount() and rerender(), add:
ssrShellComplete = false
hydrationStarted = false
flightResponseId = nil
```

## Edge Cases

1. **JS boots before shell**: `hydrateRoot()` called, `ssrShellComplete` is false → queued in `pendingHydration`. When `onRootComplete` fires, `pendingHydration` executes.

2. **Shell completes before JS**: `ssrShellComplete` set to true. When `hydrateRoot()` called later, `ssrShellComplete` is already true → hydrate immediately.

3. **All boundaries resolve before hydration**: Degrades to current behavior — all nodes have `pending=false`, React hydrates everything in one pass. `keepOpen` may be false if stream also completed.

4. **SSR stream errors after hydration starts**: Pending boundaries stay as fallbacks. React's dehydrated fibers eventually timeout. The `cleanupSSRStreamState()` handles cleanup.

## Verification

1. **Build and run demo app** with `/build-demo`
2. **Nested Suspense fixture**: Load it, confirm all 4 boundaries reveal progressively and hydrate correctly. Check logs for no errors. The key difference: hydration should start before all boundaries resolve (look for "Hydration starting" before "SSR stream complete").
3. **Client Components fixture**: Load it, confirm hydration works, tap +/- buttons to verify interactivity.
4. **Run Swift tests**: `npm run test:swift` to verify no regressions.
