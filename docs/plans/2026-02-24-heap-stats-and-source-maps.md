# Heap Stats & Source Map Stack Resolution — Implementation Plan

**Goal:** Add memory counter events to Performance panel traces and resolve source-mapped stack traces in the CDP inspector proxy.

**Architecture:** Two independent features. Heap stats: a JS module polls `$$getMemoryUsage()` on a timer during tracing and pushes Chrome Trace Format counter events into the existing PerformanceTracer buffer. Source maps: the Node.js inspector proxy loads webpack's `.map` files and translates all outgoing CDP stack frames before sending to Chrome DevTools.

**Tech Stack:** JavaScript (JSC runtime + Node.js), `source-map` npm package, Chrome Trace Format counter events.

**Design doc:** `docs/plans/2026-02-24-heap-stats-and-source-maps-design.md`

---

## Task 1: HeapStatsCollector module

**Files:**
- Create: `packages/react-dom-native/src/devtools/HeapStatsCollector.js`

**Step 1: Create the HeapStatsCollector module**

This module starts/stops a `setInterval` that pushes counter events into a tracer's event buffer. It uses the existing `$$getMemoryUsage()` Swift binding (already registered in `Bindings.swift:1796`).

```js
'use strict';

// ---------------------------------------------------------------------------
// HeapStatsCollector
//
// Polls $$getMemoryUsage() at regular intervals during tracing and pushes
// Chrome Trace Format counter events (ph:'C') into the PerformanceTracer
// buffer. Chrome DevTools renders these as line charts in the Performance
// panel's Counters section.
// ---------------------------------------------------------------------------

var POLL_INTERVAL_MS = 500;
var intervalId = null;

function start(tracer) {
  if (intervalId !== null) return;
  // Take an initial sample immediately
  sample(tracer);
  intervalId = setInterval(function () {
    sample(tracer);
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function sample(tracer) {
  if (!tracer._tracing) return;
  var now = typeof $$performanceNow === 'function' ? $$performanceNow() : 0;
  var info = typeof $$getMemoryUsage === 'function' ? $$getMemoryUsage() : null;
  if (!info) return;

  // Convert bytes to MB for readability in DevTools
  var usedMB = Math.round((info.usedSize || 0) / (1024 * 1024));
  var totalMB = Math.round((info.totalSize || 0) / (1024 * 1024));

  tracer._events.push({
    name: 'Memory (MB)',
    cat: 'disabled-by-default-devtools.timeline',
    ph: 'C',
    ts: now * 1000, // ms -> µs
    pid: tracer._pid,
    tid: tracer._tid,
    args: {
      'RSS': usedMB,
      'Virtual': totalMB,
    },
  });
}

module.exports = {start: start, stop: stop};
```

**Step 2: Verify the file is syntactically valid**

Run: `node -c packages/react-dom-native/src/devtools/HeapStatsCollector.js`
Expected: no output (syntax OK)

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/HeapStatsCollector.js
git commit -m "Add HeapStatsCollector for memory counter events in Performance panel"
```

---

## Task 2: Wire HeapStatsCollector into PerformanceTracer

**Files:**
- Modify: `packages/react-dom-native/src/devtools/PerformanceTracer.js`
- Modify: `packages/react-dom-native/src/entry.js`

**Step 1: Import and call HeapStatsCollector from PerformanceTracer**

In `packages/react-dom-native/src/devtools/PerformanceTracer.js`, add at the top (after `'use strict';` and the comment block, before `var tracer = {`):

```js
var HeapStatsCollector = require('./HeapStatsCollector');
```

In the `startTracing` function, add after the `$$setNativeTracingEnabled(true)` call (after line 41):

```js
    HeapStatsCollector.start(this);
```

In the `stopTracing` function, add before `var events = this._events;` (before line 49):

```js
    HeapStatsCollector.stop();
```

**Step 2: Add HeapStatsCollector require to entry.js**

In `packages/react-dom-native/src/entry.js`, add a require for HeapStatsCollector after the PerformanceTracer require (after line 18). It needs to load so webpack includes it in the bundle:

```js
  require('./devtools/HeapStatsCollector');
```

Note: HeapStatsCollector is already required by PerformanceTracer, so this line is technically redundant. However, it makes the dependency explicit in the entry point and matches the pattern used by other devtools modules. If you prefer DRY, skip this step — it will still work because PerformanceTracer requires it.

**Step 3: Verify the bundle still builds**

Run: `cd example && npx webpack --mode development 2>&1 | tail -5`
Expected: output ending with `webpack compiled successfully`

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/devtools/PerformanceTracer.js packages/react-dom-native/src/entry.js
git commit -m "Wire HeapStatsCollector into PerformanceTracer start/stop"
```

---

## Task 3: Source map resolver module

**Files:**
- Create: `example/scripts/source-map-resolver.js`

**Step 1: Install the source-map dependency**

Run: `cd example && npm install source-map`

The `source-map` package provides `SourceMapConsumer` for parsing `.map` files and resolving positions.

**Step 2: Create the SourceMapResolver module**

```js
'use strict';

// ---------------------------------------------------------------------------
// Source Map Resolver
//
// Loads webpack-generated .map files and resolves bundled source locations
// (bundle.js:12345:67) back to original file paths and line numbers.
//
// Used by the inspector proxy to translate stack frames in CDP messages
// (console errors, uncaught exceptions, Runtime.evaluate errors) before
// they reach Chrome DevTools.
// ---------------------------------------------------------------------------

const {SourceMapConsumer} = require('source-map');
const fs = require('fs');
const path = require('path');

class SourceMapResolver {
  constructor(buildDir) {
    this._buildDir = buildDir;
    this._consumers = {};
    this._loading = null;
  }

  /**
   * Load (or reload) the source map for a given bundle file.
   * @param {string} filename - e.g. 'bundle.js'
   */
  async load(filename) {
    const mapPath = path.join(this._buildDir, filename + '.map');
    if (!fs.existsSync(mapPath)) {
      console.log('[SourceMap] No source map found at ' + mapPath);
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      // Destroy previous consumer to free memory
      if (this._consumers[filename]) {
        this._consumers[filename].destroy();
      }
      this._consumers[filename] = await new SourceMapConsumer(raw);
      console.log('[SourceMap] Loaded ' + mapPath);
    } catch (e) {
      console.error('[SourceMap] Failed to load ' + mapPath + ': ' + e.message);
    }
  }

  /**
   * Load source maps for all .js.map files in the build directory.
   */
  async loadAll() {
    const files = fs.readdirSync(this._buildDir).filter(f => f.endsWith('.js.map'));
    for (const file of files) {
      const jsName = file.slice(0, -4); // remove '.map'
      await this.load(jsName);
    }
  }

  /**
   * Resolve a single CDP callFrame to its original source location.
   * Returns the frame unchanged if no mapping is found.
   *
   * @param {{url: string, lineNumber: number, columnNumber: number, functionName: string, scriptId: string}} frame
   * @returns {{url: string, lineNumber: number, columnNumber: number, functionName: string, scriptId: string}}
   */
  resolveFrame(frame) {
    if (!frame || !frame.url) return frame;
    const filename = path.basename(frame.url);
    const consumer = this._consumers[filename];
    if (!consumer) return frame;

    const pos = consumer.originalPositionFor({
      line: frame.lineNumber + 1,   // CDP is 0-based, source-map lib is 1-based
      column: frame.columnNumber,
    });

    if (!pos.source) return frame;

    return {
      functionName: pos.name || frame.functionName,
      scriptId: frame.scriptId,
      url: pos.source,
      lineNumber: pos.line - 1,     // back to 0-based for CDP
      columnNumber: pos.column || 0,
    };
  }

  /**
   * Resolve all callFrames in a CDP StackTrace object.
   *
   * @param {{callFrames: Array}} stackTrace
   * @returns {{callFrames: Array}}
   */
  resolveStackTrace(stackTrace) {
    if (!stackTrace || !stackTrace.callFrames) return stackTrace;
    return {
      callFrames: stackTrace.callFrames.map(f => this.resolveFrame(f)),
    };
  }

  /**
   * Resolve stack traces inside a CDP exceptionDetails object.
   *
   * @param {object} exceptionDetails
   * @returns {object}
   */
  resolveExceptionDetails(exceptionDetails) {
    if (!exceptionDetails) return exceptionDetails;
    const resolved = Object.assign({}, exceptionDetails);

    // Resolve the top-level url/lineNumber/columnNumber
    if (resolved.url) {
      const topFrame = this.resolveFrame({
        url: resolved.url,
        lineNumber: resolved.lineNumber || 0,
        columnNumber: resolved.columnNumber || 0,
        functionName: '',
        scriptId: resolved.scriptId || '0',
      });
      resolved.url = topFrame.url;
      resolved.lineNumber = topFrame.lineNumber;
      resolved.columnNumber = topFrame.columnNumber;
    }

    // Resolve the stack trace
    if (resolved.stackTrace) {
      resolved.stackTrace = this.resolveStackTrace(resolved.stackTrace);
    }

    return resolved;
  }

  /**
   * Watch source map files for changes and reload automatically.
   * Call this once after initial load.
   */
  watchForChanges() {
    const dir = this._buildDir;
    const self = this;
    fs.watch(dir, function (eventType, filename) {
      if (filename && filename.endsWith('.js.map')) {
        const jsName = filename.slice(0, -4);
        console.log('[SourceMap] Detected change in ' + filename + ', reloading...');
        self.load(jsName);
      }
    });
  }
}

module.exports = {SourceMapResolver};
```

**Step 3: Verify the file is syntactically valid**

Run: `node -c example/scripts/source-map-resolver.js`
Expected: no output (syntax OK)

**Step 4: Commit**

```bash
git add example/scripts/source-map-resolver.js example/package.json example/package-lock.json
git commit -m "Add SourceMapResolver for translating bundled stack frames"
```

---

## Task 4: Integrate source map resolution into inspector proxy

**Files:**
- Modify: `example/scripts/inspector-proxy.js`

The source map resolver hooks into the `handleAppMessage` function in the inspector proxy. There are three interception points where outgoing CDP messages contain stack traces:

1. **`console-message`** (line ~1466) — `message.stackTrace` on errors/warnings
2. **`cdp-event` with `Runtime.exceptionThrown`** (line ~1458) — `message.params.exceptionDetails`
3. **`cdp-response`** from Runtime domain (line ~429) — `message.result.exceptionDetails` on eval errors

**Step 1: Add resolver import and initialization to `createInspectorProxy`**

At the top of `inspector-proxy.js`, after the existing `require` statements (after line 2):

```js
const {SourceMapResolver} = require('./source-map-resolver');
const path = require('path');
```

Inside `createInspectorProxy` function (around line 1259), after the local variable declarations, add:

```js
  // Source map resolver — translates bundle.js stack frames to original sources
  const BUILD_DIR = path.resolve(__dirname, '../build');
  const sourceMapResolver = new SourceMapResolver(BUILD_DIR);
  // Load asynchronously — resolution is a no-op until maps are loaded
  sourceMapResolver.loadAll().then(function () {
    sourceMapResolver.watchForChanges();
  });
```

**Step 2: Resolve stack traces in console-message handling**

In the `handleAppMessage` function, find the `console-message` block (around line 1466). Before the `broadcastCDP` call, resolve the stack trace:

Change from:
```js
    if (message.type === 'console-message') {
      broadcastCDP({
        method: 'Runtime.consoleAPICalled',
        params: {
          type: message.cdpType || 'log',
          args: message.args || [],
          executionContextId: 1,
          timestamp: message.timestamp || Date.now(),
          stackTrace: message.stackTrace || {callFrames: []},
        },
      });
```

To:
```js
    if (message.type === 'console-message') {
      broadcastCDP({
        method: 'Runtime.consoleAPICalled',
        params: {
          type: message.cdpType || 'log',
          args: message.args || [],
          executionContextId: 1,
          timestamp: message.timestamp || Date.now(),
          stackTrace: sourceMapResolver.resolveStackTrace(message.stackTrace || {callFrames: []}),
        },
      });
```

Also update the `Log.entryAdded` emission below it (around line 1480):

Change:
```js
              stackTrace: message.stackTrace || {callFrames: []},
```
To:
```js
              stackTrace: sourceMapResolver.resolveStackTrace(message.stackTrace || {callFrames: []}),
```

**Step 3: Resolve stack traces in cdp-event forwarding**

In the `handleAppMessage` function, find the `cdp-event` block (around line 1458). Add source map resolution for `Runtime.exceptionThrown`:

Change from:
```js
    if (message.type === 'cdp-event') {
      log('App', 'Broadcasting cdp-event: ' + message.method);
      broadcastCDP({
        method: message.method,
        params: message.params,
      });
    }
```

To:
```js
    if (message.type === 'cdp-event') {
      log('App', 'Broadcasting cdp-event: ' + message.method);
      var params = message.params;
      // Resolve source maps in exception stack traces
      if (message.method === 'Runtime.exceptionThrown' && params && params.exceptionDetails) {
        params = Object.assign({}, params, {
          exceptionDetails: sourceMapResolver.resolveExceptionDetails(params.exceptionDetails),
        });
      }
      broadcastCDP({
        method: message.method,
        params: params,
      });
    }
```

**Step 4: Resolve stack traces in Runtime domain cdp-response**

In the Runtime domain's `handleAppMessage` (around line 429), resolve exception details in responses:

Change from:
```js
    handleAppMessage: function (message) {
      if (message.type === 'cdp-response') {
        var pending = pendingCDPRequests.get(message.requestId);
        if (pending) {
          log('Runtime', 'Got cdp-response for ' + message.requestId);
          pendingCDPRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
    },
```

To:
```js
    handleAppMessage: function (message) {
      if (message.type === 'cdp-response') {
        var pending = pendingCDPRequests.get(message.requestId);
        if (pending) {
          log('Runtime', 'Got cdp-response for ' + message.requestId);
          pendingCDPRequests.delete(message.requestId);
          var result = message.result;
          // Resolve source maps in eval error stack traces
          if (result && result.exceptionDetails) {
            result = Object.assign({}, result, {
              exceptionDetails: sourceMapResolver.resolveExceptionDetails(result.exceptionDetails),
            });
          }
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: result}));
        }
      }
    },
```

**Step 5: Verify the proxy still starts**

Run: `node -c example/scripts/inspector-proxy.js`
Expected: no output (syntax OK)

**Step 6: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "Integrate source map resolution into inspector proxy for stack traces"
```

---

## Task 5: Manual verification

**Files:** None (testing only)

**Step 1: Build the bundle and verify source maps exist**

Run: `cd example && npx webpack --mode development 2>&1 | tail -5`
Expected: `webpack compiled successfully`

Run: `ls -la example/build/bundle.js.map`
Expected: file exists, several hundred KB to several MB

**Step 2: Test heap stats with the Performance panel**

1. Start dev server: `cd example && npm run dev`
2. Build and run the app with `/build-demo`
3. Open Chrome, navigate to `chrome://inspect`, click "Configure..." and add `localhost:8976`
4. Click "inspect" on the Falcon target
5. Go to Performance panel, click Record
6. Interact with the app for a few seconds
7. Click Stop
8. Verify: In the trace timeline, a "Counters" section should appear with "Memory (MB)" line chart showing RSS and Virtual values

**Step 3: Test source map resolution**

1. With dev server + inspector still running from Step 2
2. Go to the Console tab in Chrome DevTools
3. Type: `console.error('test error')`
4. Verify: The stack trace should show original source file paths (e.g., `devtools/RuntimeAgent.js:23`) instead of `bundle.js:12345`
5. If the app has any component that throws, trigger it and verify the exception details show mapped source locations

**Step 4: Test source map reload**

1. Make a trivial change to any JS file (e.g., add a space to a comment in `entry.js`)
2. Webpack should rebuild automatically
3. Trigger another `console.error('test')` in DevTools
4. Verify: Source locations still resolve correctly after rebuild
