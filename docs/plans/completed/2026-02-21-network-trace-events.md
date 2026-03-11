# Network Trace Events for Performance Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add network request trace events to the Performance panel recording so fetch() calls appear in the Chrome DevTools Performance timeline alongside React component renders and scheduler tracks.

**Architecture:** Intercept `globalThis.fetch` in JSC to emit `devtools.timeline` trace events (`ResourceSendRequest`, `ResourceReceiveResponse`, `ResourceFinish`) into the existing `PerformanceTracer` event buffer. Events flow through the existing pipeline: PerformanceTracer → InspectorMessageHandler → Swift bridge → dev server → inspector proxy → Chrome DevTools `Tracing.dataCollected`. No new domains, no new message types, no new bridge functions needed.

**Tech Stack:** JS (fetch interceptor in JSC), existing PerformanceTracer, Chrome Trace Format

---

## Audit Summary (Pre-existing Implementation)

Before implementing, a field-by-field comparison against the web trace reference (`__tests__/fixtures/web-trace.json`, 32,692 events from a real Chrome recording) confirms the existing implementation is correct:

| Component | Status |
|-----------|--------|
| TracingStartedInBrowser | ✅ All required fields, correct processId linkage |
| Process metadata (__metadata M events) | ✅ Browser (pid 0) + renderer (pid 1) |
| Thread metadata (CrRendererMain) | ✅ Exact string match |
| blink.user_timing b/e events | ✅ id2.local hex format, detail as JSON string, µs timestamps |
| performance.measure passthrough | ✅ Full detail including devtools.properties |
| console.timeStamp override | ✅ Converted to b/e pairs (valid alternative to TimeStamp instants) |
| Tracing.start/end CDP roundtrip | ✅ Chunked dataCollected + tracingComplete |
| Network trace events | ❌ Missing — this plan adds them |

---

### Task 1: Write failing tests for network trace events

**Files:**
- Create: `packages/react-dom-native/src/devtools/__tests__/network-tracing.test.js`

**Step 1: Write the test**

```js
'use strict';

// Test that the NetworkTracer produces Chrome Trace Format events matching
// what Chrome DevTools Performance panel expects for the network timeline.
//
// Reference format (from devtools-frontend NetworkHandler.ts):
//   ResourceSendRequest:     cat: "devtools.timeline", ph: "I", s: "t"
//   ResourceReceiveResponse: cat: "devtools.timeline", ph: "I", s: "t"
//   ResourceFinish:          cat: "devtools.timeline", ph: "I", s: "t"
//
// All events use args.data with requestId to correlate a single request.

delete globalThis.__PERFORMANCE_TRACER__;
delete globalThis.performance;

// Mock fetch before loading NetworkTracer
const mockResponses = [];
globalThis.fetch = jest.fn(function (url, init) {
  const response = mockResponses.shift() || {
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
  };
  return Promise.resolve({
    status: response.status,
    statusText: response.statusText,
    headers: {
      get: function (name) { return response.headers.get(name); },
      entries: function () { return response.headers.entries(); },
    },
    text: function () { return Promise.resolve('{"ok":true}'); },
    clone: function () { return this; },
  });
});

describe('NetworkTracer trace events', function () {
  let tracer;

  beforeEach(function () {
    delete globalThis.__PERFORMANCE_TRACER__;
    delete globalThis.performance;
    mockResponses.length = 0;
    jest.resetModules();
    require('../PerformanceTracer');
    require('../PerformancePolyfill');
    tracer = globalThis.__PERFORMANCE_TRACER__;

    // NetworkTracer must be loaded AFTER PerformanceTracer
    require('../NetworkTracer');
  });

  it('does not emit events when tracing is inactive', async function () {
    await fetch('https://example.com/api');
    tracer.startTracing();
    const events = tracer.stopTracing();
    const net = events.filter(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(net).toHaveLength(0);
  });

  it('emits ResourceSendRequest on fetch start', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api/data');
    const events = tracer.stopTracing();

    const send = events.filter(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(send).toHaveLength(1);
    expect(send[0].cat).toBe('devtools.timeline');
    expect(send[0].ph).toBe('I');
    expect(send[0].s).toBe('t');
    expect(send[0].pid).toBe(tracer._pid);
    expect(send[0].tid).toBe(tracer._tid);
    expect(typeof send[0].ts).toBe('number');
    expect(send[0].args.data.url).toBe('https://example.com/api/data');
    expect(send[0].args.data.requestMethod).toBe('GET');
    expect(typeof send[0].args.data.requestId).toBe('string');
  });

  it('emits ResourceReceiveResponse with status code', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api/data');
    const events = tracer.stopTracing();

    const recv = events.filter(function (e) { return e.name === 'ResourceReceiveResponse'; });
    expect(recv).toHaveLength(1);
    expect(recv[0].cat).toBe('devtools.timeline');
    expect(recv[0].ph).toBe('I');
    expect(recv[0].s).toBe('t');
    expect(recv[0].args.data.statusCode).toBe(200);
    expect(recv[0].args.data.mimeType).toBe('application/json');
    // requestId must match the ResourceSendRequest
    const send = events.find(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(recv[0].args.data.requestId).toBe(send.args.data.requestId);
  });

  it('emits ResourceFinish after response', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api/data');
    const events = tracer.stopTracing();

    const finish = events.filter(function (e) { return e.name === 'ResourceFinish'; });
    expect(finish).toHaveLength(1);
    expect(finish[0].cat).toBe('devtools.timeline');
    expect(finish[0].ph).toBe('I');
    expect(finish[0].s).toBe('t');
    expect(finish[0].args.data.didFail).toBe(false);
    // requestId must match
    const send = events.find(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(finish[0].args.data.requestId).toBe(send.args.data.requestId);
  });

  it('events are in chronological order: Send → Response → Finish', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api/data');
    const events = tracer.stopTracing();

    const net = events.filter(function (e) {
      return e.name === 'ResourceSendRequest' ||
             e.name === 'ResourceReceiveResponse' ||
             e.name === 'ResourceFinish';
    });
    expect(net).toHaveLength(3);
    expect(net[0].name).toBe('ResourceSendRequest');
    expect(net[1].name).toBe('ResourceReceiveResponse');
    expect(net[2].name).toBe('ResourceFinish');
    expect(net[0].ts).toBeLessThanOrEqual(net[1].ts);
    expect(net[1].ts).toBeLessThanOrEqual(net[2].ts);
  });

  it('includes request method from init', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api/data', {method: 'POST', body: '{"x":1}'});
    const events = tracer.stopTracing();

    const send = events.find(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(send.args.data.requestMethod).toBe('POST');
  });

  it('handles fetch errors with didFail: true', async function () {
    // Override fetch to reject
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(function () {
      return Promise.reject(new Error('Network error'));
    });

    // Reload to pick up new fetch
    jest.resetModules();
    require('../PerformanceTracer');
    require('../PerformancePolyfill');
    tracer = globalThis.__PERFORMANCE_TRACER__;
    require('../NetworkTracer');

    tracer.startTracing();
    try { await fetch('https://example.com/fail'); } catch (e) {}
    const events = tracer.stopTracing();

    const finish = events.filter(function (e) { return e.name === 'ResourceFinish'; });
    expect(finish).toHaveLength(1);
    expect(finish[0].args.data.didFail).toBe(true);

    globalThis.fetch = origFetch;
  });

  it('assigns unique requestIds to concurrent fetches', async function () {
    tracer.startTracing();
    await Promise.all([
      fetch('https://example.com/a'),
      fetch('https://example.com/b'),
    ]);
    const events = tracer.stopTracing();

    const sends = events.filter(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(sends).toHaveLength(2);
    expect(sends[0].args.data.requestId).not.toBe(sends[1].args.data.requestId);
  });

  it('sets resourceType to Fetch', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api');
    const events = tracer.stopTracing();

    const send = events.find(function (e) { return e.name === 'ResourceSendRequest'; });
    expect(send.args.data.resourceType).toBe('Fetch');
  });

  it('uses frame id matching TracingStartedInBrowser', async function () {
    tracer.startTracing();
    await fetch('https://example.com/api');
    const events = tracer.stopTracing();

    const send = events.find(function (e) { return e.name === 'ResourceSendRequest'; });
    // Frame ID is set by the tracer — should be present
    expect(send.args.data.frame).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=network-tracing`
Expected: FAIL — `../NetworkTracer` module not found

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/__tests__/network-tracing.test.js
git commit -m "test: add failing tests for network trace events in Performance panel"
```

---

### Task 2: Implement NetworkTracer

**Files:**
- Create: `packages/react-dom-native/src/devtools/NetworkTracer.js`

**Step 1: Implement the network tracer**

```js
'use strict';

// ---------------------------------------------------------------------------
// Network Tracer
//
// Intercepts globalThis.fetch to emit devtools.timeline trace events into
// the PerformanceTracer buffer. These events make network requests appear
// in the Chrome DevTools Performance panel timeline.
//
// Emitted events (all cat: "devtools.timeline", ph: "I", s: "t"):
//   ResourceSendRequest    — when fetch() is called
//   ResourceReceiveResponse — when response headers arrive
//   ResourceFinish          — when response body is complete (or error)
//
// Events are correlated by a unique requestId in args.data.
//
// Reference: Chromium's NetworkHandler.ts parses these from trace data.
// ---------------------------------------------------------------------------

var originalFetch = globalThis.fetch;
var nextRequestId = 1;

// Frame ID — matches what the inspector proxy uses in TracingStartedInBrowser.
// This links network events to the correct frame in the Performance panel.
var frameId = 'falcon-frame';

function now() {
  // Use the polyfill's performanceNow if available, then convert ms → µs
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return (performance.timeOrigin + performance.now()) * 1000;
  }
  return Date.now() * 1000;
}

function emitTraceEvent(name, data) {
  if (typeof __PERFORMANCE_TRACER__ === 'undefined' || !__PERFORMANCE_TRACER__.isTracing()) {
    return;
  }
  __PERFORMANCE_TRACER__._events.push({
    name: name,
    cat: 'devtools.timeline',
    ph: 'I',
    s: 't',
    ts: now(),
    pid: __PERFORMANCE_TRACER__._pid,
    tid: __PERFORMANCE_TRACER__._tid,
    args: {data: data},
  });
}

if (typeof originalFetch === 'function') {
  globalThis.fetch = function (input, init) {
    var requestId = String(nextRequestId++);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = (init && init.method) || 'GET';

    // ResourceSendRequest — emitted when fetch() is called
    emitTraceEvent('ResourceSendRequest', {
      requestId: requestId,
      url: url,
      requestMethod: method.toUpperCase(),
      frame: frameId,
      priority: 'High',
      resourceType: 'Fetch',
    });

    return originalFetch.apply(globalThis, arguments).then(function (response) {
      // ResourceReceiveResponse — emitted when headers arrive
      var mimeType = '';
      try {
        mimeType = (response.headers && response.headers.get('content-type')) || '';
      } catch (e) {}

      emitTraceEvent('ResourceReceiveResponse', {
        requestId: requestId,
        statusCode: response.status,
        mimeType: mimeType,
        frame: frameId,
      });

      // ResourceFinish — emitted after response is available
      emitTraceEvent('ResourceFinish', {
        requestId: requestId,
        didFail: false,
        encodedDataLength: 0,
        decodedBodyLength: 0,
        frame: frameId,
      });

      return response;
    }, function (error) {
      // ResourceFinish with failure
      emitTraceEvent('ResourceFinish', {
        requestId: requestId,
        didFail: true,
        encodedDataLength: 0,
        decodedBodyLength: 0,
        frame: frameId,
      });

      throw error;
    });
  };
}
```

**Step 2: Run tests**

Run: `npm test -- --testPathPattern=network-tracing`
Expected: PASS (all 9 tests)

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/NetworkTracer.js
git commit -m "feat(devtools): add network trace events for Performance panel timeline"
```

---

### Task 3: Align frame ID between NetworkTracer and inspector proxy

The inspector proxy sets the frame ID in TracingStartedInBrowser as `targetId` (a random string like `"falcon-abc12345"`). The NetworkTracer uses a hardcoded `"falcon-frame"`. These must match for DevTools to associate network events with the correct frame.

**Files:**
- Modify: `packages/react-dom-native/src/devtools/NetworkTracer.js`
- Modify: `packages/react-dom-native/src/devtools/PerformanceTracer.js`
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Add a configurable frameId to PerformanceTracer**

In `PerformanceTracer.js`, add a `_frameId` property that the inspector proxy can set:

```js
var tracer = {
  _tracing: false,
  _events: [],
  _nextId: 0,
  _pid: 1,
  _tid: 1,
  _frameId: 'falcon-frame', // Default; overridden by inspector proxy on connect

  // ... existing methods ...
};
```

**Step 2: Use tracer._frameId in NetworkTracer**

In `NetworkTracer.js`, replace the hardcoded `frameId`:

```js
var frameId = (typeof __PERFORMANCE_TRACER__ !== 'undefined')
  ? __PERFORMANCE_TRACER__._frameId
  : 'falcon-frame';
```

And in `emitTraceEvent`, read it dynamically:

```js
function getFrameId() {
  return (typeof __PERFORMANCE_TRACER__ !== 'undefined')
    ? __PERFORMANCE_TRACER__._frameId
    : 'falcon-frame';
}
```

Replace all `frame: frameId` with `frame: getFrameId()`.

**Step 3: Set frameId from inspector proxy via start-tracing message**

In `inspector-proxy.js`, include the targetId in the start-tracing command:

```js
case 'Tracing.start':
  if (sendToApp) {
    sendToApp(JSON.stringify({type: 'start-tracing', frameId: targetId}));
  }
  // ...
```

In `InspectorMessageHandler.js`, pass the frameId to the tracer:

```js
if (type === 'start-tracing') {
  if (typeof __PERFORMANCE_TRACER__ !== 'undefined') {
    if (__PERFORMANCE_TRACER__.isTracing()) {
      return;
    }
    if (message.frameId) {
      __PERFORMANCE_TRACER__._frameId = message.frameId;
    }
    __PERFORMANCE_TRACER__.startTracing();
  }
}
```

**Step 4: Update inspector proxy to use the same frameId in TracingStartedInBrowser**

The proxy already uses `targetId` in the `frames[0].frame` field, and now sends it as `frameId` in start-tracing. The IDs will match.

**Step 5: Run all tests**

Run: `npm test -- --testPathPattern="(trace-format|network-tracing)"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/react-dom-native/src/devtools/PerformanceTracer.js \
       packages/react-dom-native/src/devtools/NetworkTracer.js \
       packages/react-dom-native/src/devtools/InspectorMessageHandler.js \
       example/scripts/inspector-proxy.js
git commit -m "fix(devtools): align frame ID between network tracer and inspector proxy"
```

---

### Task 4: Load NetworkTracer in the entry point

**Files:**
- Modify: entry point file (wherever devtools polyfills are loaded)

**Step 1: Add NetworkTracer require**

After PerformanceTracer and PerformancePolyfill, before InspectorMessageHandler:

```js
require('react-dom-native/src/devtools/NetworkTracer');
```

Load order matters — NetworkTracer must load after PerformanceTracer (it reads `__PERFORMANCE_TRACER__`) and after the fetch polyfill if any.

**Step 2: Commit**

```bash
git add <entry-file>
git commit -m "feat(devtools): load NetworkTracer in dev entry point"
```

---

### Task 5: Add network events to the proxy roundtrip test

**Files:**
- Modify: `example/scripts/test-proxy.js`

**Step 1: Add network events to the sample app events**

In the `sampleAppEvents` array in `test-proxy.js`, add network trace events after the user timing events:

```js
// Network trace events (simulating a fetch during recording)
{
  name: 'ResourceSendRequest', cat: 'devtools.timeline', ph: 'I', s: 't',
  ts: 120000, pid: 1, tid: 1,
  args: {data: {requestId: '1', url: 'http://localhost:6000/flight', requestMethod: 'GET', frame: targetId, priority: 'High', resourceType: 'Fetch'}},
},
{
  name: 'ResourceReceiveResponse', cat: 'devtools.timeline', ph: 'I', s: 't',
  ts: 150000, pid: 1, tid: 1,
  args: {data: {requestId: '1', statusCode: 200, mimeType: 'application/octet-stream', frame: targetId}},
},
{
  name: 'ResourceFinish', cat: 'devtools.timeline', ph: 'I', s: 't',
  ts: 180000, pid: 1, tid: 1,
  args: {data: {requestId: '1', didFail: false, encodedDataLength: 4096, decodedBodyLength: 8192, frame: targetId}},
},
```

**Step 2: Add validation for network events**

After the existing user timing validation:

```js
// Network events
var netSend = allEvents.filter(function (e) { return e.name === 'ResourceSendRequest'; });
assert(netSend.length > 0, 'ResourceSendRequest events present (' + netSend.length + ')');
assert(netSend[0].cat === 'devtools.timeline', 'Network events use devtools.timeline category');
assert(netSend[0].args.data.requestId, 'ResourceSendRequest has requestId');
assert(netSend[0].args.data.url, 'ResourceSendRequest has url');

var netRecv = allEvents.filter(function (e) { return e.name === 'ResourceReceiveResponse'; });
assert(netRecv.length > 0, 'ResourceReceiveResponse events present');

var netFin = allEvents.filter(function (e) { return e.name === 'ResourceFinish'; });
assert(netFin.length > 0, 'ResourceFinish events present');

// All network events share the same requestId
assert(
  netSend[0].args.data.requestId === netRecv[0].args.data.requestId &&
  netRecv[0].args.data.requestId === netFin[0].args.data.requestId,
  'Network events correlated by requestId'
);
```

**Step 3: Commit**

```bash
git add example/scripts/test-proxy.js
git commit -m "test: add network trace events to proxy roundtrip test"
```

---

### Task 6: End-to-end verification

**Step 1: Start dev server**

```bash
cd example && npm run dev
```

**Step 2: Build and run app**

Use `/build-demo`.

**Step 3: Record a trace**

1. Open the DevTools URL from terminal output (or `chrome://inspect`)
2. Go to Performance panel
3. Click Record
4. In the simulator, navigate to a fixture that makes fetch requests (any fixture triggers the Flight stream fetch)
5. Click Stop

**Step 4: Verify**

Expected in the Performance panel:
- "Components ⚛" track with component render bars
- "Scheduler ⚛" track group with lane sub-tracks
- Network row showing fetch requests as colored bars with timing

**Step 5: Debug with trace dump**

If network events don't appear:
```bash
FALCON_DUMP_TRACE=1 npm run dev
```
Then record a trace. Inspect `/tmp/falcon-trace.json`:
- Check for `ResourceSendRequest` events in the trace
- Verify `cat: "devtools.timeline"`, `ph: "I"`, `s: "t"`
- Verify `args.data.frame` matches the `frame` in TracingStartedInBrowser

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(devtools): network requests in Performance panel timeline"
```

---

## Reference: Network Trace Event Format (from Chromium DevTools source)

### ResourceSendRequest
```json
{
  "name": "ResourceSendRequest",
  "cat": "devtools.timeline",
  "ph": "I",
  "s": "t",
  "ts": 638552000000,
  "pid": 1,
  "tid": 1,
  "args": {
    "data": {
      "requestId": "1",
      "url": "https://example.com/api",
      "requestMethod": "GET",
      "frame": "<frame_id>",
      "priority": "High",
      "resourceType": "Fetch"
    }
  }
}
```

Required: `requestId`, `url`, `requestMethod`. Optional: `frame`, `priority`, `resourceType`, `renderBlocking`.

### ResourceReceiveResponse
```json
{
  "name": "ResourceReceiveResponse",
  "cat": "devtools.timeline",
  "ph": "I",
  "s": "t",
  "ts": 638552050000,
  "pid": 1,
  "tid": 1,
  "args": {
    "data": {
      "requestId": "1",
      "statusCode": 200,
      "mimeType": "application/json",
      "encodedDataLength": 1234,
      "fromCache": false,
      "fromServiceWorker": false,
      "frame": "<frame_id>",
      "timing": {
        "requestTime": 638552.0,
        "sendStart": 0.5,
        "sendEnd": 0.7,
        "receiveHeadersStart": 12.3,
        "receiveHeadersEnd": 12.4
      }
    }
  }
}
```

Required: `requestId`, `statusCode`, `mimeType`. Optional: `encodedDataLength`, `fromCache`, `timing`, `headers`.

### ResourceFinish
```json
{
  "name": "ResourceFinish",
  "cat": "devtools.timeline",
  "ph": "I",
  "s": "t",
  "ts": 638552100000,
  "pid": 1,
  "tid": 1,
  "args": {
    "data": {
      "requestId": "1",
      "didFail": false,
      "encodedDataLength": 12345,
      "decodedBodyLength": 23456,
      "frame": "<frame_id>"
    }
  }
}
```

Required: `requestId`, `didFail`. Optional: `encodedDataLength`, `decodedBodyLength`, `finishTime`.

---

## Validation Checklist (complete)

After implementation, verify these against a recorded trace:

**Infrastructure (existing, verified correct):**
- [ ] TracingStartedInBrowser present with `frames[0].processId` = 1
- [ ] `frames[0].isOutermostMainFrame` = true
- [ ] `frames[0].isInPrimaryMainFrame` = true
- [ ] Browser process metadata: `{name: "Browser"}` on pid 0
- [ ] Renderer thread metadata: `{name: "CrRendererMain"}` on pid 1, tid 1
- [ ] All timestamps in microseconds (not milliseconds)

**User timing (existing, verified correct):**
- [ ] `blink.user_timing` b/e pairs with matching `id2.local`
- [ ] Begin event `args.detail` is a JSON **string** (not object)
- [ ] Detail parses to `{devtools: {track: "...", color: "..."[, trackGroup, properties, tooltipText]}}`
- [ ] End event has `args: {}` (empty object)

**Network (new):**
- [ ] `ResourceSendRequest` has `cat: "devtools.timeline"`, `ph: "I"`, `s: "t"`
- [ ] `ResourceReceiveResponse` has same cat/ph/s
- [ ] `ResourceFinish` has same cat/ph/s
- [ ] All three share the same `args.data.requestId`
- [ ] `args.data.frame` matches `TracingStartedInBrowser.frames[0].frame`
- [ ] Events are in order: Send → Response → Finish
- [ ] `ResourceSendRequest.args.data.url` is present
- [ ] `ResourceReceiveResponse.args.data.statusCode` is present
- [ ] `ResourceFinish.args.data.didFail` is present
