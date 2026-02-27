# Plan: Move InspectorMessageHandler to Native & Remove PerformanceTracer.js

## Goal

Move `$$onInspectorMessage` handling from JS to native Swift, then remove `PerformanceTracer.js` and the `__PERFORMANCE_TRACER__` global entirely. After this change, the tracing pipeline is fully native — no JS intermediary.

## Current State

- `InspectorMessageHandler.js` registers `$$onInspectorMessage(jsonString)` handling 3 message types:
  - `start-tracing` → `__PERFORMANCE_TRACER__.startTracing()` → `$$startTracing()`
  - `stop-tracing` → `__PERFORMANCE_TRACER__.stopTracing()` → `$$stopTracing()`, sends result via `$$sendInspectorMessage`
  - `cdp-request` → `$$handleCDPRequest(jsonString)` (remains in JS)
- `PerformanceTracer.js` is a thin shim: every method just delegates to `$$` bridge functions
- `HostConfig.js` references `__PERFORMANCE_TRACER__` for `reportNativeCommitTimings` and `$$handleSSRCommitTimings`

## Why

- The JS shim is pure passthrough — zero logic, just forwarding
- InspectorMessageHandler parses JSON, calls tracer, serializes JSON — all better done natively
- Removing the JS shim eliminates a load-order dependency (PerformanceTracer.js must load before HostConfig.js)
- One less file in the bundle

## Tasks

### Task 1: Update HostConfig.js to use `$$` bridge functions directly

Replace all `__PERFORMANCE_TRACER__` references in `HostConfig.js` with direct `$$` calls:

- `__PERFORMANCE_TRACER__.isTracing()` → `$$isTracing()`
- `__PERFORMANCE_TRACER__.reportTimeStamp(...)` → `$$reportTimeStamp(...)`
- `__PERFORMANCE_TRACER__.reportMeasure(...)` → `$$reportMeasure(...)`
- `__PERFORMANCE_TRACER__.reportMark(...)` → `$$reportMark(...)`
- `__PERFORMANCE_TRACER__.reportInteraction(...)` → `$$reportInteraction(...)`
- `__PERFORMANCE_TRACER__.nextInteractionId()` → `$$nextInteractionId()`

Guard each call with `typeof $$isTracing === 'function'` (same pattern the shim used). The `$$handleSSRCommitTimings` handler also references the tracer — update it the same way.

**Verify:** `npm test` — all JS tests pass. `grep -r '__PERFORMANCE_TRACER__' packages/` returns zero hits in non-test files.

### Task 2: Move `$$onInspectorMessage` to native Swift

Create the handler as a native function in `JSRuntime.setupPerformancePolyfill()` (alongside the other `$$` bridge functions):

```swift
// $$onInspectorMessage(jsonString)
eng.setGlobalFunction("$$onInspectorMessage") { [weak self, weak eng] args in
    guard let self = self, let eng = eng else { return nil }
    guard let jsonString = eng.toString(args[0]),
          let data = jsonString.data(using: .utf8),
          let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = message["type"] as? String else {
        return nil
    }

    switch type {
    case "start-tracing":
        guard !self.tracer.isTracing else { return nil }
        self.tracer.startTracing()
        self.bindings.nativeTracingEnabled = true
        self.bindings.pushPendingSSRCommitTimingsToJS()

    case "stop-tracing":
        guard self.tracer.isTracing else { return nil }
        let result = self.tracer.stopTracing()
        self.bindings.nativeTracingEnabled = false
        // Serialize events to JSON and send via WebSocket
        let response: [String: Any] = [
            "type": "trace-data",
            "events": result.events,
            "tracingStartTs": result.tracingStartTs,
        ]
        if let responseData = try? JSONSerialization.data(withJSONObject: response),
           let responseString = String(data: responseData, encoding: .utf8) {
            self.bindings.sendInspectorMessage?(responseString)
        }

    case "cdp-request":
        // Forward CDP requests to the JS handler (RuntimeAgent, etc.)
        if let cdpHandler = eng.getGlobalProperty("$$handleCDPRequest") {
            _ = eng.callFunction(cdpHandler, args: args)
        }

    default:
        break
    }
    return nil
}
```

Note: `sendInspectorMessage` is currently a closure on Bindings. Verify it's accessible (may need to make it internal like `pushPendingSSRCommitTimingsToJS`).

Also remove the now-redundant `$$startTracing` and `$$stopTracing` bridge functions — the inspector handler calls the tracer directly. Keep `$$isTracing`, `$$reportTimeStamp`, `$$reportMeasure`, `$$reportMark`, `$$reportInteraction`, `$$nextInteractionId` since HostConfig.js still calls them.

**Verify:** `npm run test:swift` passes.

### Task 3: Remove PerformanceTracer.js and InspectorMessageHandler.js

1. Delete `packages/react-dom-native/src/devtools/PerformanceTracer.js`
2. Delete `packages/react-dom-native/src/devtools/InspectorMessageHandler.js`
3. Remove their `require()` calls from the bundle entry point (check `entry/` files and esbuild config for where they're imported)
4. Remove the `globalThis.__PERFORMANCE_TRACER__` reference from anywhere remaining

**Verify:** `npm run build` (from example/) succeeds. Bundle doesn't contain PerformanceTracer or InspectorMessageHandler.

### Task 4: Update tests

1. **trace-format.test.js**: Remove all `require('../PerformanceTracer')` and `require('../InspectorMessageHandler')` calls. Tests should work entirely through mock `$$` bridge functions (already mostly there from the previous plan). The `InspectorMessageHandler roundtrip` tests need rewriting — instead of testing JS→JS roundtrip, test that the mock `$$onInspectorMessage` (which simulates native) produces correct trace-data output.

2. **Any other test files** referencing `__PERFORMANCE_TRACER__`, `PerformanceTracer`, or `InspectorMessageHandler` — update or remove.

**Verify:** `npm test` — all tests pass. `npm run test:fantom` — no regressions.

### Task 5: Final verification

1. `npm test` — all JS tests pass
2. `npm run test:swift` — all Swift tests pass
3. `npm run test:fantom` — no regressions vs baseline (2 pre-existing failures OK)
4. `grep -r '__PERFORMANCE_TRACER__' packages/` — zero hits outside test mocks
5. `grep -r 'PerformanceTracer' packages/react-dom-native/src/` — zero hits (only in Swift and tests)
6. Verify `$$onInspectorMessage` is registered in JSRuntime.swift
7. Verify no `require('../PerformanceTracer')` in non-test files
