# React Performance Tracks — Debug & Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get React Performance Tracks (Components ⚛, Scheduler ⚛) rendering correctly in Chrome DevTools Performance panel when profiling the native app.

**Architecture:** React's reconciler (0.33.0) emits performance data via `performance.measure()` (with `detail.devtools` metadata) and `console.timeStamp()` (extended 6-arg form). Our polyfills intercept these, buffer as Chrome Trace Format events, and flush via CDP `Tracing.dataCollected`. The events must match the exact format Chrome DevTools' `UserTimingsHandler` expects for custom track assignment.

**Tech Stack:** JS (polyfills in JSC), Node.js (CDP inspector proxy), Chrome Trace Format, CDP protocol

**Current status:** Pipeline works end-to-end (CDP → WS → Swift → JS → trace events → DevTools), but traces show 0 events or empty tracks. Root causes: (1) tracing state lost on app reload, (2) trace event format may not match DevTools expectations.

---

### Task 1: Create trace event diagnostic test

Write a Node.js test that exercises the PerformanceTracer + polyfills in isolation, producing trace events in the exact format that will go to DevTools. This lets us iterate on the format without running the full app + simulator + DevTools pipeline.

**Files:**
- Create: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js`

**Step 1: Write the test**

```js
'use strict';

// Test that the PerformanceTracer produces Chrome Trace Format events
// matching what Chrome DevTools expects for custom performance tracks.
//
// Reference: React's ReactFiberPerformanceTrack.js emits:
//   performance.measure(name, {start, end, detail: {devtools: {track, color, ...}}})
//   console.timeStamp(name, start, end, track, trackGroup, color)

// Reset globals before loading polyfills
delete globalThis.__PERFORMANCE_TRACER__;
delete globalThis.performance;

describe('PerformanceTracer trace format', () => {
  let tracer;

  beforeEach(() => {
    // Fresh tracer for each test
    delete globalThis.__PERFORMANCE_TRACER__;
    delete globalThis.performance;
    jest.resetModules();
    require('../PerformanceTracer');
    require('../PerformancePolyfill');
    require('../ConsoleTimeStamp');
    tracer = globalThis.__PERFORMANCE_TRACER__;
  });

  it('emits metadata events on startTracing', () => {
    tracer.startTracing();
    const events = tracer.stopTracing();
    const meta = events.filter(e => e.ph === 'M');
    expect(meta).toHaveLength(2);
    expect(meta[0]).toEqual(expect.objectContaining({
      name: 'process_name',
      ph: 'M',
      args: {name: 'Falcon'},
    }));
    expect(meta[1]).toEqual(expect.objectContaining({
      name: 'thread_name',
      ph: 'M',
      args: {name: 'Main'},
    }));
  });

  it('captures performance.measure with devtools detail as blink.user_timing b/e events', () => {
    tracer.startTracing();

    // Simulate what React's logComponentRender does
    performance.measure('\u200bApp', {
      start: 100,
      end: 200,
      detail: {
        devtools: {
          color: 'primary-dark',
          track: 'Components \u269b',
          tooltipText: 'App',
          properties: null,
        },
      },
    });

    const events = tracer.stopTracing();
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');

    expect(userTiming).toHaveLength(2);

    // Begin event
    const begin = userTiming[0];
    expect(begin.ph).toBe('b');
    expect(begin.name).toBe('\u200bApp');
    expect(begin.ts).toBe(100000); // ms → µs
    expect(begin.id).toBeDefined();
    const detail = JSON.parse(begin.args.detail);
    expect(detail.devtools.track).toBe('Components \u269b');
    expect(detail.devtools.color).toBe('primary-dark');

    // End event
    const end = userTiming[1];
    expect(end.ph).toBe('e');
    expect(end.name).toBe('\u200bApp');
    expect(end.ts).toBe(200000);
    expect(end.id).toBe(begin.id);
  });

  it('captures console.timeStamp with extended args as blink.user_timing b/e events', () => {
    tracer.startTracing();

    // Simulate what React's logRenderPhase does for scheduling
    console.timeStamp('Render', 100, 200, 'Blocking', 'Scheduler \u269b', 'primary-dark');

    const events = tracer.stopTracing();
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');

    expect(userTiming).toHaveLength(2);

    const begin = userTiming[0];
    expect(begin.ph).toBe('b');
    expect(begin.name).toBe('Render');
    expect(begin.ts).toBe(100000);
    const detail = JSON.parse(begin.args.detail);
    expect(detail.devtools.track).toBe('Blocking');
    expect(detail.devtools.trackGroup).toBe('Scheduler \u269b');
    expect(detail.devtools.color).toBe('primary-dark');

    const end = userTiming[1];
    expect(end.ph).toBe('e');
    expect(end.ts).toBe(200000);
  });

  it('captures component render via console.timeStamp (supportsUserTiming=false path)', () => {
    tracer.startTracing();

    // This is what React emits when supportsUserTiming is false
    console.timeStamp('Counter', 100, 105, 'Components \u269b', undefined, 'primary-light');

    const events = tracer.stopTracing();
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');

    expect(userTiming).toHaveLength(2);
    const detail = JSON.parse(userTiming[0].args.detail);
    expect(detail.devtools.track).toBe('Components \u269b');
    expect(detail.devtools.color).toBe('primary-light');
    // trackGroup should not be present when undefined
    expect(detail.devtools.trackGroup).toBeUndefined();
  });

  it('does not capture events when not tracing', () => {
    performance.measure('\u200bApp', {start: 100, end: 200, detail: {devtools: {track: 'Components \u269b', color: 'primary'}}});
    console.timeStamp('Render', 100, 200, 'Blocking', 'Scheduler \u269b', 'primary');

    tracer.startTracing();
    const events = tracer.stopTracing();
    // Only metadata events, no user timing
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');
    expect(userTiming).toHaveLength(0);
  });

  it('produces a valid Chrome Trace Format JSON', () => {
    tracer.startTracing();
    performance.measure('\u200bApp', {start: 10, end: 20, detail: {devtools: {track: 'Components \u269b', color: 'primary', tooltipText: 'App'}}});
    console.timeStamp('Render', 5, 25, 'Blocking', 'Scheduler \u269b', 'primary-dark');
    const events = tracer.stopTracing();

    // Wrap in Chrome Trace Format envelope
    const traceJson = JSON.stringify({traceEvents: events});
    const parsed = JSON.parse(traceJson);
    expect(parsed.traceEvents).toBeInstanceOf(Array);
    expect(parsed.traceEvents.length).toBeGreaterThan(2);

    // Every event must have required fields
    for (const event of parsed.traceEvents) {
      expect(event.ph).toBeDefined();
      expect(event.pid).toBeDefined();
      expect(event.tid).toBeDefined();
      expect(typeof event.ts).toBe('number');
    }
  });
});
```

**Step 2: Run it**

```bash
npm test -- --testPathPattern trace-format
```

Expected: All tests PASS — this verifies the tracer format in isolation.

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/__tests__/trace-format.test.js
git commit -m "test: add trace format unit tests for PerformanceTracer"
```

---

### Task 2: Create trace dump script for end-to-end debugging

Write a script that the inspector proxy can use to dump trace events to a file, allowing offline inspection without Chrome DevTools. This is the key tool for iterating without the user.

**Files:**
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Add trace dump to inspector proxy**

In the `tracePromise.then` callback in `inspector-proxy.js`, add a file dump before sending to DevTools:

```js
tracePromise.then(function (events) {
  // Dump trace events to file for debugging
  var traceJson = JSON.stringify({traceEvents: events}, null, 2);
  try {
    require('fs').writeFileSync('/tmp/falcon-trace.json', traceJson);
    console.log('[InspectorProxy] Trace dumped to /tmp/falcon-trace.json (' + events.length + ' events)');
  } catch (e) {
    console.log('[InspectorProxy] Failed to dump trace: ' + e.message);
  }

  // Acknowledge Tracing.end
  sendCDP(ws, {id: id, result: {}});
  // ... rest unchanged
```

**Step 2: Verify by running the pipeline**

1. Start dev server: `cd example && npm run dev`
2. Build and run app (use `/build-demo` skill)
3. Open DevTools, record a trace, stop
4. Check `/tmp/falcon-trace.json` — inspect the events
5. Compare against web reference trace (if available at `/tmp/web-trace.json`)

**Step 3: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "debug: dump trace events to /tmp/falcon-trace.json for offline inspection"
```

---

### Task 3: Verify supportsUserTiming detection

The reconciler checks `supportsUserTiming` at module init. If this is `false`, React falls back to `console.timeStamp` for component renders (losing rich metadata like `tooltipText` and `properties`). Add a diagnostic log to confirm.

**Files:**
- Modify: `packages/react-dom-native/src/entry.js` (temporary diagnostic)

**Step 1: Add diagnostic after polyfills load**

After the `__DEV__` polyfill block, before `require('react')`:

```js
if (__DEV__) {
  // Diagnostic: verify polyfills are set up before React loads
  console.log('[DevTools] performance.measure available: ' + (typeof performance !== 'undefined' && typeof performance.measure === 'function'));
  console.log('[DevTools] console.timeStamp available: ' + (typeof console.timeStamp === 'function'));
}
```

**Step 2: Check the output**

After rebuilding, look for these logs in the Xcode console or forwarded console messages. If `performance.measure` is `false`, the polyfill isn't taking effect and we need to investigate why.

**Step 3: Fix if needed**

If `performance.measure` is not available, the issue is likely:
- JSC has a read-only `performance` global that can't be replaced
- Fix: instead of replacing the whole object, augment it:
  ```js
  if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = {};
  }
  var perf = globalThis.performance;
  perf.now = perf.now || performanceNow;
  perf.measure = measure;
  perf.mark = mark;
  // ... etc
  ```

**Step 4: Remove diagnostic logs after confirming**

**Step 5: Commit**

```bash
git add packages/react-dom-native/src/entry.js packages/react-dom-native/src/devtools/PerformancePolyfill.js
git commit -m "fix: augment existing performance object instead of replacing it"
```

---

### Task 4: Compare trace format against web reference

If the user provides a web trace JSON (from Chrome DevTools Performance panel recording of a React 19.2 web app), compare our trace events against the real Chrome format.

**Files:**
- Read: `/tmp/web-trace.json` (user-provided) or `~/Downloads/*.json`
- Read: `/tmp/falcon-trace.json` (our output from Task 2)

**Step 1: Extract relevant events from web trace**

```bash
# Find blink.user_timing events with devtools detail
node -e "
  const trace = require('/tmp/web-trace.json');
  const events = (trace.traceEvents || trace).filter(e =>
    e.cat === 'blink.user_timing' && e.args && e.args.detail
  );
  console.log('Found', events.length, 'user timing events with detail');
  events.slice(0, 4).forEach(e => console.log(JSON.stringify(e, null, 2)));
"
```

**Step 2: Compare field-by-field**

Key fields to verify:
- `cat`: must be `"blink.user_timing"`
- `ph`: `"b"` for begin, `"e"` for end
- `id`: hex string like `"0x..."` — begin/end pairs share the same id
- `args.detail`: JSON **string** (not object) on begin event, containing `{devtools: {track, color, ...}}`
- `ts`: microseconds
- Begin event has `args.detail`, end event has no `args` or empty `args`

**Step 3: Fix any format discrepancies found**

Common issues:
- `detail` as object instead of string
- `detail` on wrong event (end instead of begin, or both)
- Missing `id` field
- Wrong timestamp units
- Missing or wrong `cat` value

**Step 4: Re-run trace format tests to verify fixes**

```bash
npm test -- --testPathPattern trace-format
```

---

### Task 5: Verify end-to-end in DevTools

After format fixes, verify the full pipeline.

**Step 1: Start dev server**

```bash
cd example && npm run dev
```

**Step 2: Build and run the app**

Use the `/build-demo` skill.

**Step 3: Record a trace**

1. Open Chrome DevTools URL from terminal
2. Go to Performance panel
3. Click Record
4. In the simulator, navigate to a fixture (trigger React renders)
5. Click Stop

**Step 4: Verify tracks appear**

Expected:
- "Components ⚛" track with component render entries (colored duration bars)
- "Scheduler ⚛" track group with lane tracks (Blocking, Transition, etc.)
- Process named "Falcon", thread named "Main"

**Step 5: If tracks still empty, inspect `/tmp/falcon-trace.json`**

Check:
- Are there events? (count > 2 metadata events)
- Do user timing events have correct format?
- Load `/tmp/falcon-trace.json` directly in `chrome://tracing` to see if events render there

**Step 6: Commit final working state**

```bash
git add -A
git commit -m "feat: enable React Performance Tracks in Chrome DevTools"
```

---

### Task 6: Clean up

Remove temporary diagnostics and the trace file dump (or keep it gated behind an env var).

**Files:**
- Modify: `packages/react-dom-native/src/entry.js` — remove diagnostic logs
- Modify: `example/scripts/inspector-proxy.js` — gate trace dump behind `FALCON_DUMP_TRACE=1`

**Step 1: Gate trace dump**

```js
// Only dump trace file when FALCON_DUMP_TRACE is set
if (process.env.FALCON_DUMP_TRACE) {
  var traceJson = JSON.stringify({traceEvents: events}, null, 2);
  try {
    require('fs').writeFileSync('/tmp/falcon-trace.json', traceJson);
    console.log('[InspectorProxy] Trace dumped to /tmp/falcon-trace.json (' + events.length + ' events)');
  } catch (e) {}
}
```

**Step 2: Remove diagnostic logs from entry.js**

**Step 3: Run all tests**

```bash
npm test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up performance track debugging scaffolding"
```

---

## Key Files Reference

| File | Role |
|------|------|
| `packages/react-dom-native/src/devtools/PerformanceTracer.js` | Buffers Chrome Trace Format events |
| `packages/react-dom-native/src/devtools/PerformancePolyfill.js` | `performance.measure()` polyfill for JSC |
| `packages/react-dom-native/src/devtools/ConsoleTimeStamp.js` | Extended `console.timeStamp()` override |
| `packages/react-dom-native/src/devtools/DevToolsHookShim.js` | `__REACT_DEVTOOLS_GLOBAL_HOOK__` for ProfileMode |
| `packages/react-dom-native/src/devtools/InspectorMessageHandler.js` | Handles start/stop tracing from CDP proxy |
| `packages/react-dom-native/src/entry.js` | Load order: polyfills → React → renderer |
| `packages/react-dom-native/src/renderer/renderer.js` | `injectIntoDevTools()` call |
| `example/scripts/inspector-proxy.js` | CDP proxy: Tracing.start/end, trace event relay |
| `example/scripts/dev-server.js` | WebSocket relay, re-sends start-tracing on reconnect |
| `node_modules/react-reconciler/cjs/react-reconciler.development.js:17214` | `supportsUserTiming` check |
| `node_modules/react-reconciler/cjs/react-reconciler.development.js:1108-1290` | `logComponentRender`, `performance.measure` calls |

## Iteration Approach (for autonomous execution)

1. **Unit test first** (Task 1) — verify format in isolation, fast iteration
2. **Trace dump** (Task 2) — inspect real events from the app without needing DevTools
3. **Diagnose** (Task 3) — confirm `supportsUserTiming` and fix polyfill if needed
4. **Compare** (Task 4) — diff against web reference trace
5. **E2E verify** (Task 5) — full pipeline test
6. **Clean up** (Task 6) — remove scaffolding
