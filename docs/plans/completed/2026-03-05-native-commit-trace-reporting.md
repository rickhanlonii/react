# Move commit trace reporting from JS to native Swift

## Problem

Native commit timing follows a wasteful Native → JS → Native roundtrip:

1. **Renderer.swift** collects a timing dict during `commitTree`
2. **Root.swift** buffers it or passes it to `Bindings.addSSRCommitTimings`
3. **Bindings** serializes the dict to JSON, calls `engine.evaluate("$$handleSSRCommitTimings(...)")`
4. **HostConfig.js** `reportNativeCommitTimings` parses the dict, calls `$$reportTimeStamp` ~20+ times
5. Each `$$reportTimeStamp` crosses back into **PerformanceTracer.swift** `reportTimeStamp`

The JS function is pure formatting — no React state, no reconciler interaction. All data originates in Swift, gets serialized to JSON, crosses to JS, and immediately crosses back to Swift 20+ times.

## Goal

Call `perfTracer.reportTimeStamp` directly from Swift, eliminating the JS hop entirely.

## Current data flow

```
Renderer.commitTree (Swift)
  → onTimingCollected([String: Any])
    → Root buffers in ssrCommitTimings OR calls bindings.addSSRCommitTimings
      → bindings.pushPendingSSRCommitTimingsToJS()
        → engine.evaluate("$$handleSSRCommitTimings(json)")  [Native → JS]
          → reportNativeCommitTimings(t)                     [JS]
            → $$reportTimeStamp(...)  ×20+                   [JS → Native]
              → perfTracer.reportTimeStamp(...)               [Native]
```

## New data flow

```
Renderer.commitTree (Swift)
  → onTimingCollected([String: Any])
    → Root buffers in ssrCommitTimings OR calls bindings.reportCommitTimings
      → bindings.reportCommitTimings (or flush pending)
        → perfTracer.reportTimeStamp(...)  ×20+              [Native only]
```

---

## Tasks

### Task 1: Add `reportCommitTimings` to PerformanceTracer or a helper extension

**Files:** `PerformanceTracer.swift` (or new extension file)

Port the formatting logic from `reportNativeCommitTimings` (HostConfig.js:319-486) to Swift. This is a direct translation:

- `durationColor(startMs, endMs)` helper → Swift function returning a String
- Each `$$reportTimeStamp(...)` call → `reportTimeStamp(label:start:end:track:trackGroup:color:properties:)`
- Same conditional logic (skip phases where end <= start)
- Same per-node flame graph loops for diffNodes, mutationNodes, layoutNodes
- The timing dict keys stay the same (they're already `[String: Any]`)

The method signature:
```swift
func reportCommitTimings(_ timing: [String: Any])
```

### Task 2: Update Bindings to call PerformanceTracer directly

**Files:** `Bindings+SSR.swift`, `Bindings+Registration.swift`, `Bindings.swift`

1. Change `addSSRCommitTimings` to call `reportCommitTimings` on the tracer directly instead of buffering for JS push:
   - When tracing is active: iterate timings and call `tracer.reportCommitTimings(timing)` for each
   - When tracing is inactive: still buffer in `pendingSSRCommitTimings` (unchanged)

2. Change `pushPendingSSRCommitTimingsToJS` → `flushPendingCommitTimings`:
   - Instead of serializing to JSON and calling `engine.evaluate`, iterate buffered timings and call `tracer.reportCommitTimings` for each
   - Clear the buffer after

3. Update callers:
   - `ReactRuntime.swift:552`: `bindings.pushPendingSSRCommitTimingsToJS()` → `bindings.flushPendingCommitTimings()`
   - `JSRuntime.swift:346`: `bindings.pendingSSRCommitTimings.removeAll()` stays the same

### Task 3: Remove JS-side reporting code

**Files:** `HostConfig.js`

Delete:
- `durationColor` function (line 314-317)
- `reportNativeCommitTimings` function (lines 319-486)
- `globalThis.$$handleSSRCommitTimings` handler (lines 493-499)

### Task 4: Remove `$$handleSSRCommitTimings` bridge registration

**Files:** `Bindings+Registration.swift` or wherever `$$handleSSRCommitTimings` is set as a global

This global function is no longer called from anywhere. Remove any registration of it if it exists as a named binding (it may only exist as a JS global set via the evaluate call, in which case this is a no-op).

### Task 5: Update tests

**Files:** `trace-format.test.js`

The `emitNativeTimings` helper (lines 668-769) currently mirrors the JS `reportNativeCommitTimings`. Since the formatting now happens in Swift:

- The test helper should continue to call `tracer.reportTimeStamp` directly (as it already does) — this tests the tracer's output format
- Remove or update comments referencing `reportNativeCommitTimings` in HostConfig.js
- The test is still valid because it tests the same `reportTimeStamp` calls that Swift will now make

If there are integration tests that test the full Native → JS → Native roundtrip, they should be updated to test the new direct path. The Fantom test runner may need a test that exercises `reportCommitTimings` from Swift.

### Task 6: Verify `$$isTracing` is no longer needed in HostConfig.js

**Files:** `HostConfig.js`

Check if `$$isTracing` is used anywhere else in HostConfig.js besides the now-deleted `reportNativeCommitTimings`. If not, no action needed — it's still used by React's `console.timeStamp` polyfill in the performance polyfills.

---

## What stays the same

- `Renderer.onTimingCollected` callback and the timing dict format — unchanged
- `Root.ssrCommitTimings` buffering for pre-tracing commits — unchanged (just the flush target changes)
- `Bindings.nativeTracingEnabled` flag — unchanged
- `Bindings.pendingSSRCommitTimings` buffer — unchanged (type stays `[[String: Any]]`)
- `PerformanceTracer.reportTimeStamp` API — unchanged (new method calls it)
- React's own `console.timeStamp` → `$$reportTimeStamp` path — unchanged (that's JS → Native, not a roundtrip)

## Risk

Low. The formatting is a pure function with no side effects beyond calling `reportTimeStamp`. The test already validates the trace event format independently. The only risk is a typo in the Swift translation causing a missing or misformatted trace event — caught by running a trace and visually inspecting in Chrome DevTools.
