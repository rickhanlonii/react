# Native Performance Polyfills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move `PerformancePolyfill.js` and `ConsoleTimeStamp.js` from JS devtools modules into native Swift, injected on the JSContext the same way `console` is.

**Architecture:** Swift's `JSRuntime.init()` already builds a `console` object with native-backed methods and sets it as a global property. We'll do the same for `performance` (with `now`, `mark`, `measure`, `clearMarks`, `clearMeasures`, `getEntriesByType`, `getEntriesByName`) and for `console.timeStamp` (the extended 6-arg form React uses). Both route to `__PERFORMANCE_TRACER__` when tracing is active — since the tracer is a JS global, the Swift methods call back into JS to check `isTracing()` and call `reportMeasure`/`reportMark`/`reportTimeStamp`.

**Tech Stack:** Swift (JSRuntime.swift), JSEngine API, existing `__PERFORMANCE_TRACER__` JS global

---

## Key Constraints

- `performance` and `console.timeStamp` must be available **before React loads** (React checks `typeof performance.measure === 'function'` and `typeof console.timeStamp === 'function'` at module init time)
- Current load order in `entry.js`: PerformanceTracer → PerformancePolyfill → ConsoleTimeStamp → ... → React
- Since Swift injects globals before any JS bundle evaluates, moving to native satisfies this ordering automatically — no timing concerns
- `__PERFORMANCE_TRACER__` is still set up by JS (`PerformanceTracer.js`), so the Swift `performance.measure()` must call into the JS tracer via the engine. This is fine because the tracer is installed by the time any `measure()` call happens (React hasn't loaded yet when the tracer is installed)
- The existing JS tests (`trace-format.test.js`) test the integration between PerformanceTracer + PerformancePolyfill + ConsoleTimeStamp. These tests run in Jest (Node.js), not in JSC. After this change, `performance` and `console.timeStamp` will be native in the real app but the tests need a way to work. **Solution:** Keep the JS test file but mock the globals the same way it currently does — the tests already `delete globalThis.performance` and re-require the modules. After removing the JS polyfills, the tests will set up their own `performance` and `console.timeStamp` via the PerformanceTracer (which stays in JS). The trace-format tests are really testing the PerformanceTracer output format, not the polyfill wiring.
- Swift unit tests (`npm run test:swift`) should test the native polyfill in isolation.

## Overview

1. Add `performance` object in Swift (JSRuntime)
2. Add `console.timeStamp` with extended 6-arg support in Swift (JSRuntime)
3. Remove JS polyfill files and update entry.js
4. Update JS tests to not depend on removed polyfill files

---

### Task 1: Add native `performance` polyfill in Swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`

**Step 1: Write the `performance` object setup method**

Add a new `setupPerformancePolyfill()` method to `JSRuntime`. Call it in `init()` right after the `console` setup (line 91), before `bindings = Bindings(engine: engine)`. This ensures `performance` is available before any JS evaluates.

```swift
private func setupPerformancePolyfill() {
    let eng = engine

    // Time origin — all performance.now() values are relative to this
    let timeOrigin = CACurrentMediaTime() * 1000.0 // ms

    let perfObj = eng.makeObject()

    // performance.timeOrigin
    eng.setProperty(perfObj, "timeOrigin", eng.makeNumber(timeOrigin))

    // performance.now() -> milliseconds relative to timeOrigin
    let nowFn = eng.makeFunction { [weak eng] _ in
        guard let eng = eng else { return nil }
        let now = CACurrentMediaTime() * 1000.0 - timeOrigin
        return eng.makeNumber(now)
    }
    eng.setProperty(perfObj, "now", nowFn)

    // Mark/measure storage and tracer routing are implemented in JS
    // because they interact heavily with __PERFORMANCE_TRACER__ (a JS object).
    // We inject a minimal JS snippet that uses the native performance.now().
    eng.setGlobalProperty("performance", perfObj)

    // The mark/measure/clear/getEntries methods are best implemented as JS
    // that references the native performance.now() we just installed, plus
    // the __PERFORMANCE_TRACER__ global. This avoids excessive bridge crossings
    // for the storage arrays and tracer callbacks.
    eng.evaluate("""
    (function() {
        var marks = [];
        var measures = [];
        var perf = globalThis.performance;
        var perfNow = perf.now.bind(perf);

        function findMarkTime(name) {
            for (var i = marks.length - 1; i >= 0; i--) {
                if (marks[i].name === name) return marks[i].startTime;
            }
            return 0;
        }

        perf.mark = function mark(name, options) {
            var startTime = options && typeof options.startTime === 'number'
                ? options.startTime : perfNow();
            var entry = {
                entryType: 'mark', name: name,
                startTime: startTime, duration: 0,
                detail: (options && options.detail) || null
            };
            marks.push(entry);
            if (typeof __PERFORMANCE_TRACER__ !== 'undefined' &&
                __PERFORMANCE_TRACER__.isTracing()) {
                __PERFORMANCE_TRACER__.reportMark(name, startTime);
            }
            return entry;
        };

        perf.measure = function measure(name, startOrOptions, endMark) {
            var startTime, endTime, detail = null;
            if (startOrOptions !== null && startOrOptions !== undefined &&
                typeof startOrOptions === 'object') {
                startTime = typeof startOrOptions.start === 'number'
                    ? startOrOptions.start
                    : typeof startOrOptions.start === 'string'
                        ? findMarkTime(startOrOptions.start) : perfNow();
                if (typeof startOrOptions.end === 'number') {
                    endTime = startOrOptions.end;
                } else if (typeof startOrOptions.end === 'string') {
                    endTime = findMarkTime(startOrOptions.end);
                } else if (typeof startOrOptions.duration === 'number') {
                    endTime = startTime + startOrOptions.duration;
                } else {
                    endTime = perfNow();
                }
                detail = startOrOptions.detail || null;
            } else if (typeof startOrOptions === 'string') {
                startTime = findMarkTime(startOrOptions);
                endTime = typeof endMark === 'string' ? findMarkTime(endMark) : perfNow();
            } else if (typeof startOrOptions === 'number') {
                startTime = startOrOptions;
                endTime = typeof endMark === 'number' ? endMark : perfNow();
            } else {
                startTime = 0;
                endTime = perfNow();
            }
            var duration = endTime - startTime;
            var entry = {
                entryType: 'measure', name: name,
                startTime: startTime, duration: duration, detail: detail
            };
            measures.push(entry);
            if (typeof __PERFORMANCE_TRACER__ !== 'undefined' &&
                __PERFORMANCE_TRACER__.isTracing()) {
                __PERFORMANCE_TRACER__.reportMeasure(name, startTime, duration, detail);
            }
            return entry;
        };

        perf.clearMarks = function clearMarks(name) {
            if (name === undefined) { marks = []; }
            else { marks = marks.filter(function(e) { return e.name !== name; }); }
        };

        perf.clearMeasures = function clearMeasures(name) {
            if (name === undefined) { measures = []; }
            else { measures = measures.filter(function(e) { return e.name !== name; }); }
        };

        perf.getEntriesByType = function getEntriesByType(type) {
            if (type === 'mark') return marks.slice();
            if (type === 'measure') return measures.slice();
            return [];
        };

        perf.getEntriesByName = function getEntriesByName(name, type) {
            var all = type ? perf.getEntriesByType(type) : marks.concat(measures);
            return all.filter(function(e) { return e.name === name; });
        };
    })();
    """)
}
```

**Step 2: Call `setupPerformancePolyfill()` in `init()`**

Add the call after the `console` setup block (after line 89) and before `bindings = Bindings(engine: engine)` (line 92):

```swift
// Register performance API polyfill (must be before bundle evaluation)
setupPerformancePolyfill()
```

**Step 3: Run Swift unit tests**

Run: `npm run test:swift`
Expected: PASS (no existing tests break — new method doesn't conflict)

**Step 4: Commit**

```
feat: add native performance polyfill in JSRuntime
```

---

### Task 2: Add native `console.timeStamp` with extended 6-arg support

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`

**Step 1: Add `timeStamp` to the console object**

In `JSRuntime.init()`, after the `for level in consoleLevels` loop (after line 85, before `engine.setGlobalProperty("console", consoleObj)`), add a `timeStamp` method to `consoleObj`:

```swift
// console.timeStamp — supports both standard single-arg form and
// React's extended 6-arg form: (name, start, end, track, trackGroup, color)
let timeStampFn = eng.makeFunction { [weak eng] args in
    guard let eng = eng else { return nil }
    if args.count <= 1 {
        // Standard single-arg — no-op in JSC (no built-in timeline)
        return nil
    }
    // Extended format — route to __PERFORMANCE_TRACER__
    guard let tracer = eng.getGlobalProperty("__PERFORMANCE_TRACER__") else { return nil }
    guard let isTracingFn = eng.getProperty(tracer, "isTracing") else { return nil }
    guard let isTracing = eng.callFunction(isTracingFn, args: []),
          eng.toBool(isTracing) == true else { return nil }
    guard let reportFn = eng.getProperty(tracer, "reportTimeStamp") else { return nil }
    // Forward all args: (label, start, end, track, trackGroup, color, properties)
    _ = eng.callFunction(reportFn, args: Array(args))
    return nil
}
eng.setProperty(consoleObj, "timeStamp", timeStampFn)
```

**Step 2: Run Swift unit tests**

Run: `npm run test:swift`
Expected: PASS

**Step 3: Commit**

```
feat: add native console.timeStamp with extended 6-arg support
```

---

### Task 3: Remove JS polyfill files and update entry.js

**Files:**
- Delete: `packages/react-dom-native/src/devtools/PerformancePolyfill.js`
- Delete: `packages/react-dom-native/src/devtools/ConsoleTimeStamp.js`
- Modify: `packages/react-dom-native/src/entry.js`

**Step 1: Remove the two require lines from entry.js**

Remove these two lines from the `if (__DEV__)` block:
```js
  require('./devtools/PerformancePolyfill');
  require('./devtools/ConsoleTimeStamp');
```

**Step 2: Delete the JS files**

```bash
rm packages/react-dom-native/src/devtools/PerformancePolyfill.js
rm packages/react-dom-native/src/devtools/ConsoleTimeStamp.js
```

**Step 3: Commit**

```
refactor: remove JS PerformancePolyfill and ConsoleTimeStamp

These are now injected natively by JSRuntime.swift, matching
the pattern used for console, setTimeout, and TextEncoder.
```

---

### Task 4: Update JS tests

**Files:**
- Modify: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js`

The trace-format tests currently `require('../PerformancePolyfill')` and `require('../ConsoleTimeStamp')` in their `beforeEach`. Since these files no longer exist, we need to update the tests.

The tests are really testing the **PerformanceTracer** output format. The polyfills were just the mechanism to feed data into the tracer. The tests can call `tracer.reportMeasure()`, `tracer.reportTimeStamp()`, and `tracer.reportMark()` directly — or set up inline stubs for `performance` and `console.timeStamp`.

**Step 1: Update `beforeEach` blocks**

In each `beforeEach` that currently does:
```js
require('../PerformanceTracer');
require('../PerformancePolyfill');
require('../ConsoleTimeStamp');
```

Replace with:
```js
require('../PerformanceTracer');
tracer = globalThis.__PERFORMANCE_TRACER__;

// Stub performance.measure to route to tracer (mirrors native polyfill)
globalThis.performance = {
    now: function() { return Date.now(); },
    measure: function(name, startOrOptions, endMark) {
        var startTime, endTime, detail = null;
        if (startOrOptions !== null && startOrOptions !== undefined &&
            typeof startOrOptions === 'object') {
            startTime = typeof startOrOptions.start === 'number'
                ? startOrOptions.start : performance.now();
            if (typeof startOrOptions.end === 'number') {
                endTime = startOrOptions.end;
            } else if (typeof startOrOptions.duration === 'number') {
                endTime = startTime + startOrOptions.duration;
            } else {
                endTime = performance.now();
            }
            detail = startOrOptions.detail || null;
        } else {
            startTime = 0;
            endTime = performance.now();
        }
        var duration = endTime - startTime;
        if (tracer.isTracing()) {
            tracer.reportMeasure(name, startTime, duration, detail);
        }
        return {entryType: 'measure', name: name, startTime: startTime, duration: duration, detail: detail};
    },
    mark: function(name, options) {
        var startTime = options && typeof options.startTime === 'number'
            ? options.startTime : performance.now();
        if (tracer.isTracing()) {
            tracer.reportMark(name, startTime);
        }
        return {entryType: 'mark', name: name, startTime: startTime, duration: 0};
    },
};

// Stub console.timeStamp to route extended form to tracer (mirrors native)
console.timeStamp = function(label, start, end, track, trackGroup, color) {
    if (arguments.length <= 1) return;
    if (tracer.isTracing()) {
        tracer.reportTimeStamp(label, start, end, track, trackGroup, color);
    }
};
```

**Step 2: Remove the `tracer = globalThis.__PERFORMANCE_TRACER__` line that comes after the requires** (it's now in the beforeEach stub above).

**Step 3: Update the `supportsUserTiming` test**

The test "satisfies React supportsUserTiming requirements after polyfill load" checks that `performance.measure` and `console.timeStamp` exist. This still works with the stubs above. No change needed.

**Step 4: Run JS tests**

Run: `npm test`
Expected: All trace-format tests PASS

**Step 5: Commit**

```
test: update trace-format tests for native performance polyfills
```

---

### Task 5: Remove `$$performanceNow` from Bindings.swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

Now that `performance.now()` is registered directly in `JSRuntime.swift`, the `$$performanceNow` bridge function in `Bindings.swift` is redundant for the performance polyfill. However, check if anything else still uses `$$performanceNow`:

- `PerformanceTracer.js` uses it in `startTracing()` for `_tracingStartTs`
- `ConsoleTimeStamp.js` used it (now deleted)
- `RuntimeAgent.js` uses it for Profiler start/stop timestamps

Since `PerformanceTracer.js` and `RuntimeAgent.js` still reference `$$performanceNow`, **keep it**. Skip this task — `$$performanceNow` is still live.

---

### Task 6: Verify full integration

**Step 1: Run all JS tests**

Run: `npm test`
Expected: All PASS

**Step 2: Run Swift unit tests**

Run: `npm run test:swift`
Expected: All PASS

**Step 3: Build and run demo app**

Use `/build-demo` to build and run the app. Verify it launches without errors in the Xcode console (no "performance is undefined" or "console.timeStamp is not a function" errors).

**Step 4: Verify Performance panel still works**

1. Open Chrome DevTools connected to the app
2. Go to Performance panel
3. Record a trace (click record, interact with app, stop)
4. Verify trace events appear on custom tracks (Components, Scheduler, Shadow Tree, Layout)

**Step 5: Commit (if any fixups needed)**

---

## Summary of changes

| Before | After |
|--------|-------|
| `PerformancePolyfill.js` — JS module, required in `entry.js` `__DEV__` block | `JSRuntime.setupPerformancePolyfill()` — Swift, runs before any JS |
| `ConsoleTimeStamp.js` — JS module overriding `console.timeStamp` | `timeStamp` method added to Swift-built `console` object |
| `entry.js` requires both modules | Two fewer requires in `entry.js` |
| Tests require the JS modules | Tests use inline stubs |
