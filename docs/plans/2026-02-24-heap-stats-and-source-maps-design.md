# Heap Stats & Source Map Stack Resolution — Design

## Overview

Two features for the Falcon DevTools integration:

1. **Heap stats in the Performance panel** — periodic memory snapshots as trace events, visible alongside React render events in Chrome DevTools.
2. **Source map stack trace resolution** — translate bundled `bundle.js` locations in console messages, errors, and CDP responses back to original source files.

---

## 1. Heap Stats

### Goal

When recording a Performance trace, emit periodic memory usage counters so developers can correlate memory growth with specific React renders or interactions.

### Approach

Emit Chrome Trace Format **counter events** (`ph: 'C'`) from the PerformanceTracer at regular intervals while tracing is active. Chrome DevTools renders counter events as line charts in the Performance panel.

### Data source

The existing `$$getMemoryUsage()` binding (`Bindings.swift:1796`) returns `{usedSize, totalSize}` from `mach_task_basic_info`. This gives process-level RSS, which is the most actionable metric for a native app.

Additionally, add a new `$$getJSHeapUsage()` binding that calls `JSVirtualMachine`'s memory footprint API to get JS-heap-specific stats.

### Implementation

**Swift side** — new binding in `Bindings.registerDevTools()`:

```swift
engine.setGlobalFunction("$$getJSHeapUsage") { [weak engine] _ in
    guard let engine = engine as? JavaScriptCoreEngine else { return engine?.makeNull() }
    let obj = engine.makeObject()
    // JSContext exposes the virtual machine; JSVirtualMachine has no public
    // heap size API, so we use the JSC C API via the context's JSGlobalContextRef
    // to get heap stats.
    let ctx = engine.context.jsGlobalContextRef
    // Fall back to process memory if JSC heap API unavailable
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
        }
    }
    engine.setProperty(obj, "usedSize", engine.makeNumber(Double(info.resident_size)))
    engine.setProperty(obj, "totalSize", engine.makeNumber(Double(info.virtual_size)))
    return obj
}
```

**JS side** — new `HeapStatsCollector` in `src/devtools/HeapStatsCollector.js`:

- On `startTracing()`: start a `setInterval` (500ms) that calls `$$getMemoryUsage()` and pushes counter events to the tracer.
- On `stopTracing()`: clear the interval.
- Counter event format:

```js
{
  name: 'Memory',
  cat: 'disabled-by-default-devtools.timeline',
  ph: 'C',        // counter
  ts: now * 1000,  // µs
  pid: 1,
  tid: 1,
  args: {
    usedSize: info.usedSize,    // RSS bytes
    totalSize: info.totalSize,  // virtual bytes
  },
}
```

**Integration** — Wire into `PerformanceTracer.startTracing()` / `stopTracing()`:
- `startTracing()` calls `HeapStatsCollector.start(tracer)`
- `stopTracing()` calls `HeapStatsCollector.stop()`

### Chrome DevTools rendering

Counter (`ph: 'C'`) events with numeric `args` values are automatically rendered as line charts in the Performance panel's "Counters" section. No proxy changes needed — these events flow through the existing `Tracing.dataCollected` pipeline.

---

## 2. Source Map Stack Trace Resolution

### Goal

When Chrome DevTools shows a stack trace (console error/warning, uncaught exception, `Runtime.getProperties` error), display original source file paths, line numbers, and column numbers instead of `bundle.js:12345:67`.

### Current state

- Webpack generates `bundle.js.map` in `example/build/` with `devtool: 'source-map'`.
- The RSC server serves `build/` as static files, so `http://localhost:6000/bundle.js.map` is already accessible.
- `RemoteObject.parseStackTrace()` parses JSC's `Error().stack` format (`func@file:line:col`) into CDP `callFrames`.
- Console forwarding (`ConsoleForwarding.js`) and exception reporting (`ExceptionReporter.js`) send raw bundle.js locations.

### Approach

Resolve source maps **in the inspector proxy** (Node.js side). The proxy loads the source map once, caches it, and translates all outgoing stack frames before sending them to Chrome DevTools. This keeps the JS bundle and Swift code unchanged.

### Why proxy-side, not client-side

- The source map file can be large (several MB). Loading it into the JSC context would increase memory pressure.
- The proxy already intercepts every message between app and DevTools.
- Source maps are a Node.js concern (webpack runs in Node).
- No changes needed to the app bundle or Swift layer.

### Implementation

**New module** — `example/scripts/source-map-resolver.js`:

```js
const { SourceMapConsumer } = require('source-map');
const fs = require('fs');
const path = require('path');

class SourceMapResolver {
  constructor(buildDir) {
    this._buildDir = buildDir;
    this._consumers = {};  // filename -> SourceMapConsumer
  }

  async load(filename) {
    // filename = 'bundle.js' or chunk name
    const mapPath = path.join(this._buildDir, filename + '.map');
    if (!fs.existsSync(mapPath)) return;
    const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    this._consumers[filename] = await new SourceMapConsumer(raw);
  }

  resolveFrame(frame) {
    // frame = CDP callFrame {url, lineNumber, columnNumber, ...}
    const filename = path.basename(frame.url || '');
    const consumer = this._consumers[filename];
    if (!consumer) return frame;

    const pos = consumer.originalPositionFor({
      line: frame.lineNumber + 1,   // CDP is 0-based, source-map is 1-based
      column: frame.columnNumber,
    });

    if (!pos.source) return frame;

    return {
      ...frame,
      url: pos.source,
      lineNumber: pos.line - 1,      // back to 0-based for CDP
      columnNumber: pos.column || 0,
      functionName: pos.name || frame.functionName,
    };
  }

  resolveStackTrace(stackTrace) {
    if (!stackTrace || !stackTrace.callFrames) return stackTrace;
    return {
      ...stackTrace,
      callFrames: stackTrace.callFrames.map(f => this.resolveFrame(f)),
    };
  }
}
```

**Integration into inspector-proxy.js**:

- On startup, load source maps for `bundle.js` (and any chunks).
- On webpack rebuild, reload the source maps.
- Intercept outgoing messages that contain stack traces:
  - `Runtime.consoleAPICalled` — resolve `stackTrace`
  - `Runtime.exceptionThrown` — resolve `exceptionDetails.stackTrace` and `exceptionDetails.url`/`lineNumber`/`columnNumber`
  - `cdp-response` for `Runtime.evaluate` — resolve `exceptionDetails` if present

The interception happens in the proxy's message forwarding path (where it already handles `console-message` and `cdp-event` from the app).

### Source map reload on rebuild

The dev server already broadcasts `notify-reload` / `notify-refresh` on webpack rebuild. The inspector proxy can listen for these events and reload source maps:

```js
devServer.on('rebuild', () => {
  resolver.load('bundle.js');
});
```

Or more simply, watch the `.map` file for changes with `fs.watchFile`.

---

## Files changed

### Heap stats

| File | Change |
|------|--------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` | Add `$$getJSHeapUsage` binding (optional, can reuse `$$getMemoryUsage`) |
| `packages/react-dom-native/src/devtools/HeapStatsCollector.js` | **New** — interval-based memory counter event emitter |
| `packages/react-dom-native/src/devtools/PerformanceTracer.js` | Wire HeapStatsCollector into start/stop |
| `packages/react-dom-native/src/entry.js` | Require `HeapStatsCollector` in dev mode |

### Source maps

| File | Change |
|------|--------|
| `example/scripts/source-map-resolver.js` | **New** — loads `.map` files, resolves frames |
| `example/scripts/inspector-proxy.js` | Import resolver, intercept outgoing stack traces |
| `example/scripts/start-inspector.js` | Pass build dir to resolver on init |
| `example/package.json` | Add `source-map` dependency |

---

## Testing

### Heap stats
1. Start dev server, build app, open Chrome DevTools Performance panel.
2. Record a trace, interact with the app, stop recording.
3. Verify "Memory" counters appear as a line chart in the Counters section.
4. Verify counter values change during React renders.

### Source maps
1. Start dev server + inspector proxy.
2. Add `console.error('test')` in a component.
3. Open Chrome DevTools Console — verify the stack trace shows original file paths (e.g., `components/Counter.jsx:15`) instead of `bundle.js:12345`.
4. Trigger an uncaught exception — verify the exception details show original source locations.
5. Rebuild the bundle — verify source maps reload and new locations are correct.

---

## Not included

- **CPU sampling profiler** — deferred; requires either JSC private API or WebKit Inspector Protocol bridge.
- **Chrome DevTools Memory panel (HeapProfiler domain)** — would require V8-format heap snapshot graph, which JSC doesn't expose. The counter events in the Performance panel are the pragmatic alternative.
- **Debugger domain (breakpoints/stepping)** — use Safari Web Inspector for this.
