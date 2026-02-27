# Native Performance Tracer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the entire performance tracing system (event buffering, tracing state, mark/measure/timeStamp reporting) from JS (`PerformanceTracer.js` + `eng.evaluate` IIFE) into native Swift, eliminating all `eng.evaluate()` calls from the performance polyfill and removing the JS tracer object.

**Architecture:** A new `PerformanceTracer` Swift class on `JSRuntime` owns the tracing state (`isTracing`), the Chrome Trace Format event buffer, and the event ID counter. All JS-visible functions (`performance.now`, `performance.mark`, `performance.measure`, `performance.clearMarks`, `performance.clearMeasures`, `performance.getEntriesByType`, `performance.getEntriesByName`, `console.timeStamp`) are registered as native Swift functions via `eng.makeFunction` / `eng.setProperty` — no `eng.evaluate()`. The JS `PerformanceTracer.js` becomes a thin shim: `startTracing`/`stopTracing` delegate to `$$startTracing()`/`$$stopTracing()`, and `reportTimeStamp`/`reportMeasure`/`reportMark` delegate to `$$reportTimeStamp()`/`$$reportMeasure()`/`$$reportMark()` so existing JS callers (like `reportNativeCommitTimings` in HostConfig.js) continue to work without changes.

**Tech Stack:** Swift (JSEngine protocol), JavaScriptCore, Chrome Trace Format (JSON)

---

### Task 1: Create `PerformanceTracer.swift`

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/PerformanceTracer.swift`

**Step 1: Write the Swift class**

This class holds all state that was previously in the JS `tracer` object. It generates Chrome Trace Format events (begin/end pairs for `blink.user_timing`) and stores them in a Swift array. It also holds the mark/measure entry arrays for the `getEntriesByType`/`getEntriesByName` polyfill.

```swift
import Foundation

/// Native performance tracer — owns tracing state and Chrome Trace Format event buffer.
/// Replaces the JS-side __PERFORMANCE_TRACER__ object.
class PerformanceTracer {

    // MARK: - Tracing state

    private(set) var isTracing = false
    private var tracingStartTs: Double = 0  // µs — for screenshot alignment
    private var events: [[String: Any]] = []
    private var nextId = 0
    private var nextInteractionId = 1
    private let pid = 1
    private let tid = 1

    // MARK: - Performance entry storage (for getEntriesByType/Name)

    private var marks: [[String: Any]] = []
    private var measures: [[String: Any]] = []

    // MARK: - Time origin

    /// Milliseconds (CACurrentMediaTime * 1000) at init — all performance.now() values are relative to this.
    let timeOrigin: Double

    init() {
        timeOrigin = CACurrentMediaTime() * 1000.0
    }

    /// Returns milliseconds elapsed since timeOrigin.
    func now() -> Double {
        CACurrentMediaTime() * 1000.0 - timeOrigin
    }

    // MARK: - Tracing lifecycle

    func startTracing() {
        isTracing = true
        tracingStartTs = now() * 1000.0 // µs
        nextId = 0
        events = [
            // Process/thread metadata — required by Chrome DevTools MetaHandler
            ["name": "process_name", "cat": "__metadata", "ph": "M",
             "pid": pid, "tid": 0, "ts": 0, "args": ["name": "Falcon"]],
            ["name": "thread_name", "cat": "__metadata", "ph": "M",
             "pid": pid, "tid": tid, "ts": 0, "args": ["name": "CrRendererMain"]],
        ]
    }

    func stopTracing() -> (events: [[String: Any]], tracingStartTs: Double) {
        isTracing = false
        let result = events
        let startTs = tracingStartTs
        events = []
        return (result, startTs)
    }

    // MARK: - Event reporting

    /// Reports a timeStamp event (used by React's extended console.timeStamp and
    /// native commit timings). Generates begin/end async event pair.
    func reportTimeStamp(
        label: String, start: Double, end: Double,
        track: String, trackGroup: String?, color: String,
        properties: [[String]]? = nil
    ) {
        guard isTracing else { return }
        let id = nextEventId()
        var devtools: [String: Any] = ["track": track, "color": color]
        if let trackGroup = trackGroup {
            devtools["trackGroup"] = trackGroup
        }
        if let properties = properties {
            devtools["properties"] = properties
        }
        let startUs = start * 1000.0
        let endUs = end * 1000.0
        let detailJSON = serializeJSON(["devtools": devtools])
        events.append([
            "id2": ["local": id], "name": label, "cat": "blink.user_timing",
            "ph": "b", "ts": startUs, "pid": pid, "tid": tid,
            "args": ["detail": detailJSON],
        ])
        events.append([
            "id2": ["local": id], "name": label, "cat": "blink.user_timing",
            "ph": "e", "ts": endUs, "pid": pid, "tid": tid,
            "args": [:] as [String: Any],
        ])
    }

    /// Reports a performance.measure event (used by React's performance.measure calls).
    /// The detail object is passed through as-is (contains devtools track metadata).
    func reportMeasure(name: String, start: Double, duration: Double, detail: Any?) {
        guard isTracing else { return }
        let id = nextEventId()
        let detailJSON: String
        if let dict = detail as? [String: Any] {
            detailJSON = serializeJSON(dict)
        } else if let str = detail as? String {
            detailJSON = str
        } else {
            detailJSON = "{}"
        }
        events.append([
            "id2": ["local": id], "name": name, "cat": "blink.user_timing",
            "ph": "b", "ts": start * 1000.0, "pid": pid, "tid": tid,
            "args": ["detail": detailJSON],
        ])
        events.append([
            "id2": ["local": id], "name": name, "cat": "blink.user_timing",
            "ph": "e", "ts": (start + duration) * 1000.0, "pid": pid, "tid": tid,
            "args": [:] as [String: Any],
        ])
    }

    /// Reports a performance.mark event as an Instant event.
    func reportMark(name: String, startTime: Double) {
        guard isTracing else { return }
        events.append([
            "name": name, "cat": "blink.user_timing",
            "ph": "I", "ts": startTime * 1000.0,
            "pid": pid, "tid": tid, "args": [:] as [String: Any],
        ])
    }

    /// Reports an EventTiming interaction event for the Chrome DevTools Interactions track.
    func reportInteraction(
        eventType: String, interactionId: Int,
        inputTime: Double, processingStart: Double, processingEnd: Double
    ) {
        guard isTracing else { return }
        let id = "interaction-\(interactionId)"
        let duration = max(Int(round((processingEnd - inputTime) / 8.0)) * 8, 1)
        let inputTimeUs = inputTime * 1000.0
        let endTimeUs = processingEnd * 1000.0
        events.append([
            "name": "EventTiming", "cat": "devtools.timeline",
            "ph": "b", "id": id, "ts": inputTimeUs, "pid": pid, "tid": tid,
            "args": ["data": [
                "type": eventType, "interactionId": interactionId,
                "duration": duration, "timeStamp": inputTime,
                "processingStart": processingStart, "processingEnd": processingEnd,
                "cancelable": true, "nodeId": 0, "interactionOffset": 0,
            ]],
        ])
        events.append([
            "name": "EventTiming", "cat": "devtools.timeline",
            "ph": "e", "id": id, "ts": endTimeUs, "pid": pid, "tid": tid,
            "args": [:] as [String: Any],
        ])
    }

    func getNextInteractionId() -> Int {
        let id = nextInteractionId
        nextInteractionId += 1
        return id
    }

    // MARK: - Performance entry storage

    func addMark(_ entry: [String: Any]) {
        marks.append(entry)
    }

    func addMeasure(_ entry: [String: Any]) {
        measures.append(entry)
    }

    func clearMarks(_ name: String?) {
        if let name = name {
            marks.removeAll { ($0["name"] as? String) == name }
        } else {
            marks.removeAll()
        }
    }

    func clearMeasures(_ name: String?) {
        if let name = name {
            measures.removeAll { ($0["name"] as? String) == name }
        } else {
            measures.removeAll()
        }
    }

    func getEntriesByType(_ type: String) -> [[String: Any]] {
        switch type {
        case "mark": return marks
        case "measure": return measures
        default: return []
        }
    }

    func getEntriesByName(_ name: String, type: String?) -> [[String: Any]] {
        let all: [[String: Any]]
        if let type = type {
            all = getEntriesByType(type)
        } else {
            all = marks + measures
        }
        return all.filter { ($0["name"] as? String) == name }
    }

    func findMarkTime(_ name: String) -> Double {
        for entry in marks.reversed() {
            if (entry["name"] as? String) == name {
                return (entry["startTime"] as? Double) ?? 0
            }
        }
        return 0
    }

    // MARK: - Helpers

    private func nextEventId() -> String {
        let id = nextId
        nextId += 1
        return "0x" + String(id, radix: 16)
    }

    /// Minimal JSON serializer for dictionaries — avoids Foundation JSONSerialization
    /// overhead for the small, flat devtools metadata objects.
    private func serializeJSON(_ dict: [String: Any]) -> String {
        // Use JSONSerialization for correctness (these are small objects)
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return str
    }
}
```

**Step 2: Verify it compiles**

Run: `npm run test:swift`
Expected: PASS (new file with no references yet, should compile as part of the package)

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/PerformanceTracer.swift
git commit -m "Add native PerformanceTracer Swift class"
```

---

### Task 2: Wire `PerformanceTracer` into `JSRuntime` and register all `$$` bridge functions

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`

**Step 1: Add the tracer as a property and register bridge functions**

Add `let tracer = PerformanceTracer()` to `JSRuntime`.

Replace the entire `setupPerformancePolyfill()` method. Remove all `eng.evaluate()` calls. Instead, register every function on the `performance` object via `eng.makeFunction` + `eng.setProperty`. Also register `$$` bridge globals so JS code (PerformanceTracer.js shim, HostConfig.js) can call into the native tracer.

Replace `console.timeStamp` to call `tracer.reportTimeStamp()` directly in Swift (no `eng.evaluate`, no `__tsArgs__` global).

The new `setupPerformancePolyfill()` should look like this (pseudocode structure — each function is a `eng.makeFunction` closure calling `self.tracer`):

- `performance.timeOrigin` — `eng.makeNumber(tracer.timeOrigin)`
- `performance.now()` — calls `tracer.now()`, returns `eng.makeNumber`
- `performance.mark(name, options)` — parses name/startTime from args, calls `tracer.addMark()` and `tracer.reportMark()`, returns entry as JS object
- `performance.measure(name, startOrOptions, endMark)` — full options parsing in Swift, calls `tracer.addMeasure()` and `tracer.reportMeasure()`, returns entry as JS object
- `performance.clearMarks(name)` — calls `tracer.clearMarks()`
- `performance.clearMeasures(name)` — calls `tracer.clearMeasures()`
- `performance.getEntriesByType(type)` — calls `tracer.getEntriesByType()`, converts to JS array
- `performance.getEntriesByName(name, type)` — calls `tracer.getEntriesByName()`, converts to JS array
- `console.timeStamp(label, start, end, track, trackGroup, color, properties)` — for args.count > 1, calls `tracer.reportTimeStamp()` directly
- `$$startTracing()` — calls `tracer.startTracing()` and `bindings.nativeTracingEnabled = true` and `bindings.pushPendingSSRCommitTimingsToJS()`
- `$$stopTracing()` — calls `tracer.stopTracing()`, converts events to JS, returns `{events, tracingStartTs}`
- `$$isTracing()` — returns `tracer.isTracing`
- `$$reportTimeStamp(label, start, end, track, trackGroup, color, properties)` — calls `tracer.reportTimeStamp()`
- `$$reportMeasure(name, start, duration, detailJSON)` — calls `tracer.reportMeasure()`
- `$$reportMark(name, startTime)` — calls `tracer.reportMark()`
- `$$reportInteraction(eventType, interactionId, inputTime, processingStart, processingEnd)` — calls `tracer.reportInteraction()`
- `$$nextInteractionId()` — returns `tracer.getNextInteractionId()`

**Key implementation notes:**

- `performance.mark(name, options)`: The `options.startTime` property must trigger a getter (React's DevTools does `Object.defineProperty(markOptions, 'startTime', { get: ... })` for feature detection). When Swift reads `eng.toDouble(eng.getProperty(optionsRef, "startTime"))`, JSC invokes the getter automatically. This is critical — it's how React detects `supportsUserTimingV3`.

- `performance.measure(name, startOrOptions, endMark)`: Must handle 4 overload forms:
  1. Options object: `{start, end, duration, detail}` — start/end can be string (mark name lookup) or number
  2. Legacy string: `measure(name, startMark, endMark)`
  3. Legacy number: `measure(name, startTime, endTime)`
  4. No args: `measure(name)` — startTime=0, endTime=now()

- `performance.measure` must return a JS object with `{entryType, name, startTime, duration, detail}` where `detail` is the ORIGINAL JS object (not a Swift copy). This is important because React reads properties from the returned entry.

- `console.timeStamp` properties arg: React's HostConfig passes properties as `[['key', 'value'], ...]` (array of arrays). Extract with `eng.toArray()` and convert to `[[String]]`.

- For `$$stopTracing()`: Convert the Swift `[[String: Any]]` events array to a JS array of objects. Use `eng.makeObject()` + `eng.setProperty()` for each event dict, handling nested dicts (`id2`, `args`, `args.data`).

**Step 2: Remove `$$isTracing` from `Bindings.swift`**

The `$$isTracing` registered in `Bindings.swift` (added in the previous change) should be removed — it's now registered in `JSRuntime.setupPerformancePolyfill()`.

**Step 3: Verify it compiles and Swift tests pass**

Run: `npm run test:swift`
Expected: PASS

**Step 4: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "Wire native PerformanceTracer into JSRuntime, register all bridge functions"
```

---

### Task 3: Rewrite `PerformanceTracer.js` as a thin shim

**Files:**
- Modify: `packages/react-dom-native/src/devtools/PerformanceTracer.js`

**Step 1: Replace the JS tracer with a shim that delegates to Swift**

The `__PERFORMANCE_TRACER__` global must still exist because `HostConfig.js` (`reportNativeCommitTimings`) and `InspectorMessageHandler.js` reference it directly. But every method now delegates to a `$$` bridge function.

```js
'use strict';

// ---------------------------------------------------------------------------
// PerformanceTracer (thin shim)
//
// Delegates all tracing operations to native Swift via $$ bridge functions.
// The native PerformanceTracer.swift owns the event buffer and tracing state.
//
// This shim exists so that JS code (HostConfig.js, InspectorMessageHandler.js)
// can continue calling __PERFORMANCE_TRACER__.reportTimeStamp() etc. without
// changes.
// ---------------------------------------------------------------------------

var tracer = {
  startTracing: function () {
    if (typeof $$startTracing === 'function') {
      $$startTracing();
    }
  },

  stopTracing: function () {
    if (typeof $$stopTracing === 'function') {
      var result = $$stopTracing();
      console.log('[PerformanceTracer] stopTracing: collected ' +
        (result && result.events ? result.events.length : 0) + ' events');
      return result;
    }
    return { events: [], tracingStartTs: 0 };
  },

  isTracing: function () {
    if (typeof $$isTracing === 'function') {
      return $$isTracing();
    }
    return false;
  },

  reportTimeStamp: function (label, start, end, track, trackGroup, color, properties) {
    if (typeof $$reportTimeStamp === 'function') {
      $$reportTimeStamp(label, start, end, track, trackGroup, color, properties);
    }
  },

  reportMeasure: function (name, start, duration, detail) {
    if (typeof $$reportMeasure === 'function') {
      $$reportMeasure(name, start, duration, detail);
    }
  },

  reportMark: function (name, startTime) {
    if (typeof $$reportMark === 'function') {
      $$reportMark(name, startTime);
    }
  },

  reportInteraction: function (eventType, interactionId, inputTime, processingStart, processingEnd) {
    if (typeof $$reportInteraction === 'function') {
      $$reportInteraction(eventType, interactionId, inputTime, processingStart, processingEnd);
    }
  },

  nextInteractionId: function () {
    if (typeof $$nextInteractionId === 'function') {
      return $$nextInteractionId();
    }
    return 0;
  },
};

globalThis.__PERFORMANCE_TRACER__ = tracer;
```

**Step 2: Update `InspectorMessageHandler.js`**

The `stop-tracing` handler currently reads `__PERFORMANCE_TRACER__.stopTracing()` which returns `events` array, and accesses `__PERFORMANCE_TRACER__._tracingStartTs`. Update to use the return value from `stopTracing()` which now returns `{events, tracingStartTs}`:

```js
  } else if (type === 'stop-tracing') {
    if (typeof __PERFORMANCE_TRACER__ !== 'undefined') {
      if (!__PERFORMANCE_TRACER__.isTracing()) {
        return;
      }
      var result = __PERFORMANCE_TRACER__.stopTracing();
      if (typeof $$sendInspectorMessage === 'function') {
        $$sendInspectorMessage(
          JSON.stringify({
            type: 'trace-data',
            events: result.events,
            tracingStartTs: result.tracingStartTs || 0,
          }),
        );
      }
    }
  }
```

**Step 3: Verify JS unit tests pass**

Run: `npm test`
Expected: Some trace-format tests may fail because they check internal tracer state — fix in Task 4.

**Step 4: Commit**

```
git add packages/react-dom-native/src/devtools/PerformanceTracer.js packages/react-dom-native/src/devtools/InspectorMessageHandler.js
git commit -m "Rewrite PerformanceTracer.js as thin shim delegating to native Swift"
```

---

### Task 4: Update trace-format tests

**Files:**
- Modify: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js`

**Step 1: Update test stubs**

The tests currently set up `globalThis.performance` and `console.timeStamp` stubs that mirror the old JS polyfill. They also require `PerformanceTracer.js` and access `tracer._events` etc.

Now that the tracer is a shim, the tests need to:
1. Mock the `$$` bridge functions (`$$startTracing`, `$$stopTracing`, `$$isTracing`, `$$reportTimeStamp`, `$$reportMeasure`, `$$reportMark`, `$$reportInteraction`, `$$nextInteractionId`) — these simulate what Swift would do
2. The mocks should maintain their own `_tracing`, `_events`, `_nextId` state (basically a JS copy of the Swift tracer logic, just for tests)
3. Install the mocks as globals before requiring `PerformanceTracer.js`

Create a helper `function createMockNativeTracer()` that returns an object with all the state and registers all `$$` globals. Each `beforeEach` calls this helper after `jest.resetModules()` and `delete globalThis.__PERFORMANCE_TRACER__`.

After requiring `PerformanceTracer.js`, the `__PERFORMANCE_TRACER__` shim delegates to the mock `$$` functions, which buffer events in the mock's `_events` array. Tests can then inspect `mockTracer._events`.

**Step 2: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```
git add packages/react-dom-native/src/devtools/__tests__/trace-format.test.js
git commit -m "Update trace-format tests for native tracer bridge functions"
```

---

### Task 5: Final verification

**Step 1: Run all test suites**

Run: `npm test` — JS unit tests (should all pass)
Run: `npm run test:swift` — Swift unit tests (should all pass)
Run: `npm run test:fantom` — Fantom integration tests (should all pass)

**Step 2: Verify no `eng.evaluate` in `setupPerformancePolyfill`**

Grep `JSRuntime.swift` for `eng.evaluate` — it should NOT appear in `setupPerformancePolyfill()`. It may still appear in `setupTimerPolyfills()` for `queueMicrotask`, `TextEncoder`, `TextDecoder`, `ReadableStream` — those are unrelated.

**Step 3: Verify no `__PERFORMANCE_TRACER__` references in `JSRuntime.swift`**

The Swift code should never reference the JS tracer object. All tracing goes through `self.tracer` (the Swift `PerformanceTracer` instance).

**Step 4: Move plan to complete and commit**

```
mv docs/plans/2026-02-27-native-performance-tracer.md docs/plans/complete/
git add docs/plans/
git commit -m "Move native performance tracer plan to complete"
```
