# DevTools Tracing Profiler — Systematic Test Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Systematically verify each layer of the DevTools tracing profiler pipeline, identify where it breaks, and fix it — using pre-approved test scripts that can be iterated without permission prompts.

**Architecture:** The tracing pipeline has 7 layers: JS polyfills → React reconciler → InspectorMessageHandler → Swift bridge → HotReloadClient WebSocket → dev server relay → CDP inspector proxy → Chrome DevTools. Each layer needs independent verification. We create one test script per layer, run them bottom-up, and fix the first layer that fails.

**Tech Stack:** Node.js test scripts, Jest unit tests, CDP WebSocket, `ws` package

---

## Pipeline Layers (bottom-up verification order)

```
Layer 1: JS Polyfills (PerformanceTracer + PerformancePolyfill + ConsoleTimeStamp)
         ↓ tested by: npm test -- --testPathPattern trace-format
Layer 2: React → Polyfills (supportsUserTiming detection, performance.measure calls)
         ↓ tested by: Task 2 diagnostic in test-tracer-format.test.js
Layer 3: InspectorMessageHandler ($$onInspectorMessage start/stop dispatch)
         ↓ tested by: Task 3 new test in trace-format.test.js
Layer 4: CDP Proxy roundtrip (Tracing.start → mock trace-data → Tracing.dataCollected)
         ↓ tested by: Task 4 new script example/scripts/test-proxy.js
Layer 5: Live pipeline (dev server + app + proxy, no Chrome DevTools)
         ↓ tested by: Task 5 existing example/scripts/test-trace.js
Layer 6: Chrome DevTools (load trace file in Performance panel)
         ↓ tested by: Task 6 manual verification with /tmp/falcon-trace.json
```

## Pre-approved files

These are the files we'll create or modify. Approve these up front so we can iterate freely:

**Create:**
- `example/scripts/test-proxy.js` — CDP proxy roundtrip test (no app needed)

**Modify:**
- `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js` — add Layer 2 & 3 tests
- `example/scripts/test-trace.js` — minor fixes if needed during iteration

**No other files will be created or modified** until a specific fix is identified.

---

### Task 1: Verify Layer 1 — JS polyfill trace format

Run the existing unit tests to confirm the polyfills produce correct Chrome Trace Format events.

**Files:**
- Test: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js` (existing)

**Step 1: Run the trace format tests**

```bash
npm test -- --testPathPattern trace-format
```

Expected: All 7 tests PASS. If any fail, fix the polyfills before proceeding.

**Step 2: Verify specific format requirements**

The tests already check:
- Metadata events (`process_name: Falcon`, `thread_name: CrRendererMain`)
- `performance.measure()` → `blink.user_timing` b/e events with `id2.local`
- `console.timeStamp()` extended 6-arg → `blink.user_timing` b/e events
- `args.detail` as JSON string (not object)
- Timestamps in microseconds
- Field-by-field match against web reference trace

If all pass → Layer 1 is good. Proceed to Task 2.

---

### Task 2: Verify Layer 2 — React reconciler detects polyfills

The reconciler sets `supportsUserTiming` at module eval time by checking:
```js
supportsUserTiming =
  "undefined" !== typeof console &&
  "function" === typeof console.timeStamp &&
  "undefined" !== typeof performance &&
  "function" === typeof performance.measure
```
(see `node_modules/react-reconciler/cjs/react-reconciler.development.js:17214`)

If this is `false`, React falls back to `console.timeStamp` for component renders (which our ConsoleTimeStamp override handles), but it's better if both paths work.

**Files:**
- Modify: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js`

**Step 1: Add a test verifying React's detection requirements**

Add this test to the existing describe block:

```js
it('satisfies React supportsUserTiming requirements after polyfill load', () => {
  // These are the exact checks React's reconciler performs at module eval time
  // (react-reconciler.development.js:17214-17218)
  expect(typeof console).not.toBe('undefined');
  expect(typeof console.timeStamp).toBe('function');
  expect(typeof performance).not.toBe('undefined');
  expect(typeof performance.measure).toBe('function');
});
```

**Step 2: Run the test**

```bash
npm test -- --testPathPattern trace-format
```

Expected: PASS. If FAIL, the polyfills aren't setting up correctly and React won't emit `performance.measure()` calls.

**Step 3: If it fails — diagnose**

Likely causes:
- `performance` is `undefined` in the test environment
- `performance.measure` is not a function after polyfill load
- `console.timeStamp` is not a function

Fix by checking the polyfill augmentation in `PerformancePolyfill.js:169-183` and `ConsoleTimeStamp.js`.

---

### Task 3: Verify Layer 3 — InspectorMessageHandler roundtrip

Test that `$$onInspectorMessage` correctly starts/stops tracing and that `$$sendInspectorMessage` is called with the right payload.

**Files:**
- Modify: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js`

**Step 1: Add InspectorMessageHandler tests**

Add a new describe block:

```js
describe('InspectorMessageHandler roundtrip', () => {
  let tracer;
  let sentMessages;

  beforeEach(() => {
    delete globalThis.__PERFORMANCE_TRACER__;
    delete globalThis.performance;
    delete globalThis.$$onInspectorMessage;
    delete globalThis.$$sendInspectorMessage;
    sentMessages = [];
    jest.resetModules();

    require('../PerformanceTracer');
    require('../PerformancePolyfill');
    require('../ConsoleTimeStamp');

    // Mock the native bridge send function
    globalThis.$$sendInspectorMessage = function (data) {
      sentMessages.push(JSON.parse(data));
    };

    require('../InspectorMessageHandler');
    tracer = globalThis.__PERFORMANCE_TRACER__;
  });

  it('start-tracing message starts the tracer', () => {
    expect(tracer.isTracing()).toBe(false);
    globalThis.$$onInspectorMessage(JSON.stringify({type: 'start-tracing'}));
    expect(tracer.isTracing()).toBe(true);
  });

  it('stop-tracing message stops tracer and sends trace-data', () => {
    globalThis.$$onInspectorMessage(JSON.stringify({type: 'start-tracing'}));

    // Generate some trace events
    performance.measure('\u200bApp', {
      start: 100, end: 200,
      detail: {devtools: {track: 'Components \u269b', color: 'primary-dark'}},
    });

    globalThis.$$onInspectorMessage(JSON.stringify({type: 'stop-tracing'}));

    expect(tracer.isTracing()).toBe(false);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe('trace-data');
    expect(sentMessages[0].events.length).toBeGreaterThan(2); // metadata + b/e pair

    // Verify the events have correct format
    const userTiming = sentMessages[0].events.filter(
      e => e.cat === 'blink.user_timing'
    );
    expect(userTiming.length).toBeGreaterThan(0);
    expect(userTiming[0].id2).toBeDefined();
    expect(userTiming[0].id2.local).toBeDefined();
  });

  it('stop-tracing when not tracing does nothing', () => {
    globalThis.$$onInspectorMessage(JSON.stringify({type: 'stop-tracing'}));
    expect(sentMessages).toHaveLength(0);
  });

  it('duplicate start-tracing is ignored', () => {
    globalThis.$$onInspectorMessage(JSON.stringify({type: 'start-tracing'}));
    globalThis.$$onInspectorMessage(JSON.stringify({type: 'start-tracing'}));
    expect(tracer.isTracing()).toBe(true);
    // Only one start should have been processed
  });

  it('full roundtrip: start → measure → stop → validate trace-data', () => {
    globalThis.$$onInspectorMessage(JSON.stringify({type: 'start-tracing'}));

    // Simulate React component renders and scheduling
    performance.measure('\u200bApp', {
      start: 100, end: 200,
      detail: {devtools: {track: 'Components \u269b', color: 'primary-dark', tooltipText: 'App'}},
    });
    performance.measure('\u200bCounter', {
      start: 110, end: 150,
      detail: {devtools: {track: 'Components \u269b', color: 'primary-light', tooltipText: 'Counter'}},
    });
    console.timeStamp('Render', 50, 210, 'Blocking', 'Scheduler \u269b', 'primary-dark');

    globalThis.$$onInspectorMessage(JSON.stringify({type: 'stop-tracing'}));

    const traceData = sentMessages[0];
    expect(traceData.type).toBe('trace-data');

    // Should have: 2 metadata + 2 measure pairs + 1 timeStamp pair = 8 events
    const meta = traceData.events.filter(e => e.cat === '__metadata');
    const ut = traceData.events.filter(e => e.cat === 'blink.user_timing');
    expect(meta).toHaveLength(2);
    expect(ut).toHaveLength(6); // 3 begin + 3 end

    // Verify all begin events have detail as JSON string
    const begins = ut.filter(e => e.ph === 'b');
    for (const b of begins) {
      expect(typeof b.args.detail).toBe('string');
      const detail = JSON.parse(b.args.detail);
      expect(detail.devtools).toBeDefined();
      expect(detail.devtools.track).toBeDefined();
      expect(detail.devtools.color).toBeDefined();
    }
  });
});
```

**Step 2: Run the tests**

```bash
npm test -- --testPathPattern trace-format
```

Expected: All tests PASS. This confirms the JS-side roundtrip works — `$$onInspectorMessage` → tracer → `$$sendInspectorMessage`.

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/__tests__/trace-format.test.js
git commit -m "test: add InspectorMessageHandler roundtrip and supportsUserTiming tests"
```

---

### Task 4: Verify Layer 4 — CDP proxy roundtrip (no app needed)

Create a self-contained test that starts the inspector proxy, sends a mock trace-data response, and verifies the CDP output is correct for Chrome DevTools.

This is the **key diagnostic** — it tests the proxy in isolation without needing the iOS app or dev server running.

**Files:**
- Create: `example/scripts/test-proxy.js`

**Step 1: Write the proxy roundtrip test**

```js
'use strict';

// ---------------------------------------------------------------------------
// test-proxy.js — Test the inspector proxy CDP roundtrip in isolation.
//
// Starts the inspector proxy, connects as both a "DevTools client" (CDP)
// and a "mock app" (trace-data sender), and verifies the full roundtrip:
//   DevTools sends Tracing.start → proxy relays to app
//   App sends trace-data → proxy wraps in Tracing.dataCollected → DevTools
//
// Usage:  node example/scripts/test-proxy.js
//
// No dev server, no iOS simulator, no Chrome DevTools needed.
// ---------------------------------------------------------------------------

var http = require('http');
var WebSocket = require('ws');
var {createInspectorProxy} = require('./inspector-proxy');
var {WebSocketServer} = require('ws');

var CDP_PORT = 19222; // Use non-standard port to avoid conflicts
var APP_WS_PORT = 19082;
var passed = 0;
var failed = 0;

function pass(msg) {
  passed++;
  console.log('  PASS: ' + msg);
}

function fail(msg) {
  failed++;
  console.error('  FAIL: ' + msg);
}

function assert(condition, msg) {
  if (condition) pass(msg);
  else fail(msg);
}

// Sample trace events matching what the app would produce
var sampleAppEvents = [
  {name: 'process_name', cat: '__metadata', ph: 'M', pid: 1, tid: 0, ts: 0, args: {name: 'Falcon'}},
  {name: 'thread_name', cat: '__metadata', ph: 'M', pid: 1, tid: 1, ts: 0, args: {name: 'CrRendererMain'}},
  {
    id2: {local: '0x0'}, name: '\u200bApp', cat: 'blink.user_timing', ph: 'b',
    ts: 100000, pid: 1, tid: 1,
    args: {detail: JSON.stringify({devtools: {track: 'Components \u269b', color: 'primary-dark', tooltipText: 'App'}})},
  },
  {
    id2: {local: '0x0'}, name: '\u200bApp', cat: 'blink.user_timing', ph: 'e',
    ts: 200000, pid: 1, tid: 1, args: {},
  },
  {
    id2: {local: '0x1'}, name: 'Render', cat: 'blink.user_timing', ph: 'b',
    ts: 50000, pid: 1, tid: 1,
    args: {detail: JSON.stringify({devtools: {track: 'Blocking', trackGroup: 'Scheduler \u269b', color: 'primary-dark'}})},
  },
  {
    id2: {local: '0x1'}, name: 'Render', cat: 'blink.user_timing', ph: 'e',
    ts: 210000, pid: 1, tid: 1, args: {},
  },
];

async function run() {
  console.log('\n  Inspector Proxy Roundtrip Test');
  console.log('  ==============================\n');

  // --- Setup: start proxy + mock app WebSocket server ---

  var proxy = createInspectorProxy({port: CDP_PORT});

  // Mock app WebSocket server (simulates what dev-server.js does)
  var appWss = new WebSocketServer({port: APP_WS_PORT});
  var appClient = null;

  // Wire proxy → app: proxy sends start/stop-tracing to our mock app
  proxy.setSendToApp(function (data) {
    if (appClient && appClient.readyState === 1) {
      appClient.send(data);
    }
  });

  // Wait for mock app to connect
  var appReady = new Promise(function (resolve) {
    appWss.on('connection', function (ws) {
      appClient = ws;

      ws.on('message', function (raw) {
        var msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

        if (msg.type === 'start-tracing') {
          pass('Mock app received start-tracing command');
        }

        if (msg.type === 'stop-tracing') {
          pass('Mock app received stop-tracing command');
          // Respond with trace data (simulates what InspectorMessageHandler does)
          ws.send(JSON.stringify({type: 'trace-data', events: sampleAppEvents}));
        }
      });

      // Forward app messages to proxy (simulates what dev-server.js does)
      ws.on('message', function (raw) {
        var msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        if (msg.type === 'trace-data') {
          proxy.handleAppMessage(raw.toString());
        }
      });

      resolve();
    });
  });

  // Connect mock app
  var mockApp = new WebSocket('ws://127.0.0.1:' + APP_WS_PORT);
  await appReady;

  // Give the proxy HTTP server a moment to start
  await new Promise(function (r) { setTimeout(r, 200); });

  // --- Test 1: CDP discovery endpoint ---
  console.log('  --- CDP Discovery ---');

  var targets = await new Promise(function (resolve, reject) {
    http.get('http://127.0.0.1:' + CDP_PORT + '/json', function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });

  assert(Array.isArray(targets) && targets.length > 0, '/json returns target list');
  assert(targets[0].webSocketDebuggerUrl, 'Target has webSocketDebuggerUrl');
  assert(targets[0].title === 'Falcon — react-dom-native', 'Target title is correct');

  // --- Test 2: CDP trace roundtrip ---
  console.log('\n  --- CDP Trace Roundtrip ---');

  var wsUrl = targets[0].webSocketDebuggerUrl;
  var allEvents = [];

  await new Promise(function (resolve, reject) {
    var ws = new WebSocket(wsUrl);

    ws.on('open', function () {
      pass('Connected to CDP WebSocket');
      // Send Tracing.start
      ws.send(JSON.stringify({id: 1, method: 'Tracing.start', params: {}}));
    });

    ws.on('message', function (raw) {
      var msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

      // Ack for Tracing.start
      if (msg.id === 1) {
        pass('Tracing.start acknowledged');
        // Immediately send Tracing.end (no need to wait for app activity in this test)
        setTimeout(function () {
          ws.send(JSON.stringify({id: 2, method: 'Tracing.end', params: {}}));
        }, 100);
      }

      // Collect Tracing.dataCollected events
      if (msg.method === 'Tracing.dataCollected' && msg.params && msg.params.value) {
        allEvents = allEvents.concat(msg.params.value);
      }

      // Tracing complete
      if (msg.method === 'Tracing.tracingComplete') {
        pass('Tracing.tracingComplete received');
        ws.close();
        resolve();
      }
    });

    ws.on('error', reject);

    // Timeout
    setTimeout(function () {
      ws.close();
      reject(new Error('CDP roundtrip timed out'));
    }, 10000);
  });

  // --- Test 3: Validate trace events ---
  console.log('\n  --- Trace Event Validation ---');

  assert(allEvents.length > 0, 'Received ' + allEvents.length + ' trace events');

  // TracingStartedInBrowser must be present (prepended by proxy)
  var tsib = allEvents.filter(function (e) { return e.name === 'TracingStartedInBrowser'; });
  assert(tsib.length > 0, 'TracingStartedInBrowser event present');

  if (tsib.length > 0) {
    assert(
      tsib[0].cat === 'disabled-by-default-devtools.timeline',
      'TracingStartedInBrowser has correct category'
    );
    assert(
      tsib[0].args && tsib[0].args.data && tsib[0].args.data.frames,
      'TracingStartedInBrowser has frames data'
    );
    var rendererPid = tsib[0].args.data.frames[0].processId;
    assert(rendererPid === 1, 'Renderer PID matches app tracer PID (' + rendererPid + ')');
  }

  // Browser process metadata (prepended by proxy)
  var browserMeta = allEvents.filter(function (e) {
    return e.cat === '__metadata' && e.pid === 0;
  });
  assert(browserMeta.length >= 2, 'Browser process metadata present (' + browserMeta.length + ')');

  // App metadata (from app trace events)
  var appMeta = allEvents.filter(function (e) {
    return e.cat === '__metadata' && e.pid === 1;
  });
  assert(appMeta.length >= 2, 'App process metadata present (' + appMeta.length + ')');

  // CrRendererMain thread
  var rendererThread = appMeta.filter(function (e) {
    return e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain';
  });
  assert(rendererThread.length > 0, 'CrRendererMain thread metadata present');

  // blink.user_timing events
  var userTiming = allEvents.filter(function (e) {
    return e.cat === 'blink.user_timing';
  });
  assert(userTiming.length > 0, 'blink.user_timing events present (' + userTiming.length + ')');

  var begins = userTiming.filter(function (e) { return e.ph === 'b'; });
  var ends = userTiming.filter(function (e) { return e.ph === 'e'; });
  assert(begins.length === ends.length, 'Begin/end event count matches (' + begins.length + ' pairs)');

  // id2.local format
  var badId = begins.filter(function (e) { return !e.id2 || !e.id2.local; });
  assert(badId.length === 0, 'All begin events use id2.local format');

  // detail as JSON string with devtools metadata
  var badDetail = begins.filter(function (e) {
    if (!e.args || !e.args.detail) return true;
    try {
      var d = JSON.parse(e.args.detail);
      return !d.devtools;
    } catch (err) { return true; }
  });
  assert(badDetail.length === 0, 'All begin events have valid JSON detail with devtools metadata');

  // Components track
  var componentEvents = begins.filter(function (e) {
    try {
      var d = JSON.parse(e.args.detail);
      return d.devtools.track === 'Components \u269b';
    } catch (err) { return false; }
  });
  assert(componentEvents.length > 0, 'Component render events present (' + componentEvents.length + ')');

  // Scheduler track
  var schedulerEvents = begins.filter(function (e) {
    try {
      var d = JSON.parse(e.args.detail);
      return d.devtools.trackGroup === 'Scheduler \u269b';
    } catch (err) { return false; }
  });
  assert(schedulerEvents.length > 0, 'Scheduler events present (' + schedulerEvents.length + ')');

  // --- Test 4: Trace loadable in chrome://tracing ---
  console.log('\n  --- Chrome Trace Format ---');

  var traceJson = {traceEvents: allEvents};
  var traceString = JSON.stringify(traceJson, null, 2);

  // Verify it's valid JSON
  try {
    JSON.parse(traceString);
    pass('Trace is valid JSON');
  } catch (e) {
    fail('Trace is not valid JSON: ' + e.message);
  }

  // Write to file for manual inspection
  var fs = require('fs');
  fs.writeFileSync('/tmp/falcon-proxy-test-trace.json', traceString);
  pass('Trace written to /tmp/falcon-proxy-test-trace.json');
  console.log('  Load in chrome://tracing to visually verify\n');

  // --- Cleanup ---
  mockApp.close();
  appWss.close();
  proxy.close();

  // --- Summary ---
  console.log('  ==============================');
  console.log('  ' + passed + ' passed, ' + failed + ' failed');
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(function (err) {
  console.error('Test error:', err);
  process.exit(1);
});
```

**Step 2: Run the proxy roundtrip test**

```bash
node example/scripts/test-proxy.js
```

Expected: All assertions PASS. The trace file at `/tmp/falcon-proxy-test-trace.json` should be loadable in `chrome://tracing`.

This test verifies the inspector proxy in complete isolation — no iOS simulator, no dev server, no Chrome DevTools. If this passes, the proxy layer is correct.

**Step 3: Manually verify the trace file**

Open `chrome://tracing` in Chrome, click "Load" and select `/tmp/falcon-proxy-test-trace.json`. Verify:
- Process "Falcon" appears
- Thread "CrRendererMain" appears
- "Components ⚛" and "Scheduler ⚛" tracks appear with colored bars

If the trace loads correctly in `chrome://tracing` but not in the Performance panel, the issue is in how the Performance panel's `UserTimingsHandler` parses events (different from `chrome://tracing`).

**Step 4: Commit**

```bash
git add example/scripts/test-proxy.js
git commit -m "test: add inspector proxy CDP roundtrip test"
```

---

### Task 5: Verify Layer 5 — Live pipeline (dev server + app)

Run the full end-to-end test with the actual app running. This uses the existing `test-trace.js` script.

**Prerequisites:**
1. Dev server running: `cd example && npm run dev`
2. Falcon app running in simulator: use `/build-demo` skill

**Files:**
- Read: `example/scripts/test-trace.js` (existing)

**Step 1: Start the dev server**

```bash
cd example && npm run dev
```

Wait for "Ready." output.

**Step 2: Build and run the app**

Use the `/build-demo` skill. Wait for the app to appear in the simulator.

**Step 3: Trigger some React renders**

In the simulator, tap buttons or navigate between fixtures to generate React component renders and scheduler activity.

**Step 4: Run the e2e trace test**

```bash
node example/scripts/test-trace.js
```

Expected: All validations PASS, trace dumped to `/tmp/falcon-trace.json`.

**Step 5: Diagnose failures**

If the test fails with "No blink.user_timing events":

**5a: Check if the app WebSocket connected**
Look for `[Inspector] App connected via WebSocket` in the dev server output.

If missing → the app isn't connecting to the dev server WebSocket. Check:
- Is the dev server running on port 8082?
- Is `setupDevToolsConnection()` being called in Root.swift?
- Is HotReloadClient connecting to the right host/port?

**5b: Check if start-tracing was delivered**
Look for `[InspectorProxy] Tracing started` in the dev server output.

If missing → the CDP proxy didn't receive the Tracing.start command.
If present but no trace-data received → the start-tracing message didn't reach the app JS.

**5c: Check if React is emitting performance data**
Add a temporary diagnostic to `PerformancePolyfill.js:measure()` (line 121):
```js
console.log('[TRACE-DIAG] measure called: ' + name + ' tracing=' + __PERFORMANCE_TRACER__.isTracing());
```

Rebuild and re-test. If no `[TRACE-DIAG]` logs appear, React isn't calling `performance.measure()`.

**5d: Check supportsUserTiming at runtime**
Add a temporary diagnostic to `InspectorMessageHandler.js` (after line 33):
```js
console.log('[TRACE-DIAG] start-tracing received, supportsUserTiming check: ' +
  'console.timeStamp=' + (typeof console.timeStamp) +
  ' performance.measure=' + (typeof performance.measure));
```

**Step 6: Fix and re-test**

After identifying the failing layer, fix it and re-run `node example/scripts/test-trace.js` until all validations pass.

---

### Task 6: Verify Layer 6 — Chrome DevTools Performance panel

With a valid trace file from Task 5, verify it renders correctly in Chrome DevTools.

**Step 1: Load trace in chrome://tracing first**

Open `chrome://tracing` in Chrome, load `/tmp/falcon-trace.json`. This viewer is more forgiving than the Performance panel and will show raw events. Verify:
- Events appear on a timeline
- "Falcon" process with "CrRendererMain" thread
- `blink.user_timing` events visible

**Step 2: Load trace in Performance panel**

1. Open Chrome DevTools (F12 on any page)
2. Go to Performance panel
3. Click the upload icon (or Ctrl+U) to load a trace file
4. Select `/tmp/falcon-trace.json`

Verify:
- "Components ⚛" track appears under Falcon/CrRendererMain
- "Scheduler ⚛" track group appears with lane sub-tracks
- Colored duration bars are visible

**Step 3: If chrome://tracing works but Performance panel doesn't**

This means the Performance panel's `UserTimingsHandler` has additional requirements. Common issues:

a. **TracingStartedInBrowser format** — The `frames[0]` must have `isOutermostMainFrame: true` and `isInPrimaryMainFrame: true` (our proxy sets these).

b. **Thread name must be `CrRendererMain`** — The MetaHandler uses this exact string to identify the renderer's main thread.

c. **Process/thread ID mismatch** — The `processId` in TracingStartedInBrowser's frames must match the `pid` in user timing events.

d. **Timestamps** — Must be in microseconds and monotonically increasing within each event pair.

**Step 4: Live profiling**

If the trace file loads correctly, try live profiling:
1. Start dev server: `cd example && npm run dev`
2. Build app: `/build-demo`
3. Open `chrome://inspect` or the DevTools URL from dev server output
4. Go to Performance panel → Record → interact with app → Stop
5. Verify tracks appear

---

### Task 7: If live profiling fails but file loading works

If loading `/tmp/falcon-trace.json` into the Performance panel works but live CDP profiling doesn't, the issue is in the CDP protocol exchange, not the trace format.

**Step 1: Check CDP protocol flow**

The Performance panel may send additional CDP methods that our proxy doesn't handle. Add logging to the proxy's `handleCDPMessage` function:

In `example/scripts/inspector-proxy.js`, add before the switch statement (line 136):

```js
console.log('[CDP →] ' + method + ' (id=' + id + ')');
```

And after each `sendCDP` call, add:
```js
console.log('[CDP ←] response for ' + method);
```

**Step 2: Re-run live profiling and check logs**

Look for:
- Methods the proxy receives but doesn't handle (falls through to default)
- Methods that need specific responses the proxy doesn't provide
- Order of CDP calls (some methods must be acknowledged before others)

**Step 3: Compare against a real Chrome CDP session**

Use `chrome://inspect` → "Inspect" on any Chrome tab → Performance → Record/Stop. Use Chrome's `chrome://net-internals/#events` or a CDP logging proxy to see what methods Chrome sends during a normal profiling session. Our proxy only needs to handle the subset related to tracing.

---

## Quick Reference: Running Tests

| Layer | Command | Needs App? |
|-------|---------|-----------|
| 1: Polyfill format | `npm test -- --testPathPattern trace-format` | No |
| 2: supportsUserTiming | `npm test -- --testPathPattern trace-format` | No |
| 3: InspectorMessageHandler | `npm test -- --testPathPattern trace-format` | No |
| 4: CDP proxy roundtrip | `node example/scripts/test-proxy.js` | No |
| 5: Live pipeline e2e | `node example/scripts/test-trace.js` | Yes (dev server + simulator) |
| 6: DevTools visual | Load `/tmp/falcon-trace.json` in chrome://tracing | No |

## Key Files Reference

| File | Role |
|------|------|
| `packages/react-dom-native/src/devtools/PerformanceTracer.js` | Event buffer, Chrome Trace Format |
| `packages/react-dom-native/src/devtools/PerformancePolyfill.js` | `performance.measure()` polyfill |
| `packages/react-dom-native/src/devtools/ConsoleTimeStamp.js` | Extended `console.timeStamp()` override |
| `packages/react-dom-native/src/devtools/DevToolsHookShim.js` | `__REACT_DEVTOOLS_GLOBAL_HOOK__` shim |
| `packages/react-dom-native/src/devtools/InspectorMessageHandler.js` | Start/stop tracing dispatch |
| `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js` | Unit tests (Layers 1-3) |
| `example/scripts/inspector-proxy.js` | CDP server, Tracing domain |
| `example/scripts/test-proxy.js` | CDP proxy roundtrip test (Layer 4) |
| `example/scripts/test-trace.js` | Live pipeline e2e test (Layer 5) |
| `example/scripts/dev-server.js` | WebSocket relay, tracing state |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift` | Swift WebSocket client |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:1344` | `$$performanceNow`, `$$sendInspectorMessage` |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift:754` | `setupDevToolsConnection()` |
| `node_modules/react-reconciler/cjs/react-reconciler.development.js:17214` | `supportsUserTiming` check |
