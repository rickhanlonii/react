'use strict';

// Test that the native PerformanceTracer produces Chrome Trace Format events
// matching what Chrome DevTools expects for custom performance tracks.
//
// Tests use mock $$ bridge functions that simulate the native Swift
// PerformanceTracer. No JS shim is needed — HostConfig.js and renderer.js
// call $$ bridge functions directly.
//
// Reference: React's ReactFiberPerformanceTrack.js emits:
//   performance.measure(name, {start, end, detail: {devtools: {track, color, ...}}})
//   console.timeStamp(name, start, end, track, trackGroup, color)

// Reset globals before tests
delete globalThis.performance;

// Creates mock $$ bridge functions that simulate what the native Swift
// PerformanceTracer does.
function createMockNativeTracer() {
  var mock = {
    _tracing: false,
    _events: [],
    _nextId: 0,
    _nextInteractionId: 1,
    _tracingStartTs: 0,
    _pid: 1,
    _tid: 1,
  };

  globalThis.$$startTracing = function() {
    mock._tracing = true;
    mock._tracingStartTs = (typeof performance !== 'undefined' && performance.now
      ? performance.now() : Date.now()) * 1000;
    mock._nextId = 0;
    mock._events = [
      {name: 'process_name', cat: '__metadata', ph: 'M', pid: mock._pid, tid: 0, ts: 0, args: {name: 'Falcon'}},
      {name: 'thread_name', cat: '__metadata', ph: 'M', pid: mock._pid, tid: mock._tid, ts: 0, args: {name: 'CrRendererMain'}},
    ];
  };

  globalThis.$$stopTracing = function() {
    mock._tracing = false;
    var events = mock._events;
    var startTs = mock._tracingStartTs;
    mock._events = [];
    return {events: events, tracingStartTs: startTs};
  };

  globalThis.$$isTracing = function() {
    return mock._tracing;
  };

  globalThis.$$reportTimeStamp = function(label, start, end, track, trackGroup, color, properties) {
    if (!mock._tracing) return;
    var id = '0x' + (mock._nextId++).toString(16);
    var devtools = {track: track, color: color};
    if (trackGroup !== undefined && trackGroup !== null) {
      devtools.trackGroup = trackGroup;
    }
    if (properties !== undefined && properties !== null) {
      devtools.properties = properties;
    }
    mock._events.push({
      id2: {local: id}, name: label, cat: 'blink.user_timing',
      ph: 'b', ts: start * 1000, pid: mock._pid, tid: mock._tid,
      args: {detail: JSON.stringify({devtools: devtools})},
    });
    mock._events.push({
      id2: {local: id}, name: label, cat: 'blink.user_timing',
      ph: 'e', ts: end * 1000, pid: mock._pid, tid: mock._tid,
      args: {},
    });
  };

  globalThis.$$reportMeasure = function(name, start, duration, detail) {
    if (!mock._tracing) return;
    var id = '0x' + (mock._nextId++).toString(16);
    mock._events.push({
      id2: {local: id}, name: name, cat: 'blink.user_timing',
      ph: 'b', ts: start * 1000, pid: mock._pid, tid: mock._tid,
      args: {detail: JSON.stringify(detail || {})},
    });
    mock._events.push({
      id2: {local: id}, name: name, cat: 'blink.user_timing',
      ph: 'e', ts: (start + duration) * 1000, pid: mock._pid, tid: mock._tid,
      args: {},
    });
  };

  globalThis.$$reportMark = function(name, startTime) {
    if (!mock._tracing) return;
    mock._events.push({
      name: name, cat: 'blink.user_timing',
      ph: 'I', ts: startTime * 1000, pid: mock._pid, tid: mock._tid, args: {},
    });
  };

  globalThis.$$reportInteraction = function(eventType, interactionId, inputTime, processingStart, processingEnd) {
    if (!mock._tracing) return;
    var id = 'interaction-' + interactionId;
    var duration = Math.max(Math.round((processingEnd - inputTime) / 8) * 8, 1);
    mock._events.push({
      name: 'EventTiming', cat: 'devtools.timeline',
      ph: 'b', id: id, ts: inputTime * 1000, pid: mock._pid, tid: mock._tid,
      args: {data: {
        type: eventType, interactionId: interactionId, duration: duration,
        timeStamp: inputTime, processingStart: processingStart, processingEnd: processingEnd,
        cancelable: true, nodeId: 0, interactionOffset: 0,
      }},
    });
    mock._events.push({
      name: 'EventTiming', cat: 'devtools.timeline',
      ph: 'e', id: id, ts: processingEnd * 1000, pid: mock._pid, tid: mock._tid,
      args: {},
    });
  };

  globalThis.$$nextInteractionId = function() {
    return mock._nextInteractionId++;
  };

  return mock;
}

function cleanupMockBridgeFunctions() {
  delete globalThis.$$startTracing;
  delete globalThis.$$stopTracing;
  delete globalThis.$$isTracing;
  delete globalThis.$$reportTimeStamp;
  delete globalThis.$$reportMeasure;
  delete globalThis.$$reportMark;
  delete globalThis.$$reportInteraction;
  delete globalThis.$$nextInteractionId;
  delete globalThis.$$onInspectorMessage;
  delete globalThis.$$sendInspectorMessage;
}

// Creates a tracer-like interface that calls $$ bridge functions directly.
// Replaces the removed PerformanceTracer.js shim.
function createTracerInterface() {
  return {
    startTracing: function() { $$startTracing(); },
    stopTracing: function() { return $$stopTracing(); },
    isTracing: function() { return $$isTracing(); },
    reportTimeStamp: function(label, start, end, track, trackGroup, color, properties) {
      $$reportTimeStamp(label, start, end, track, trackGroup, color, properties);
    },
    reportMeasure: function(name, start, duration, detail) {
      $$reportMeasure(name, start, duration, detail);
    },
    reportMark: function(name, startTime) {
      $$reportMark(name, startTime);
    },
    reportInteraction: function(eventType, interactionId, inputTime, processingStart, processingEnd) {
      $$reportInteraction(eventType, interactionId, inputTime, processingStart, processingEnd);
    },
    nextInteractionId: function() { return $$nextInteractionId(); },
  };
}

// Installs a mock $$onInspectorMessage that simulates the native Swift
// handler in JSRuntime.setupPerformancePolyfill().
function installMockInspectorMessageHandler() {
  globalThis.$$onInspectorMessage = function(jsonString) {
    var message;
    try { message = JSON.parse(jsonString); } catch (e) { return; }
    var type = message && message.type;
    if (!type) return;

    if (type === 'start-tracing') {
      if ($$isTracing()) return;
      $$startTracing();
    } else if (type === 'stop-tracing') {
      if (!$$isTracing()) return;
      var result = $$stopTracing();
      if (typeof $$sendInspectorMessage === 'function') {
        $$sendInspectorMessage(JSON.stringify({
          type: 'trace-data',
          events: result.events,
          tracingStartTs: result.tracingStartTs || 0,
        }));
      }
    } else if (type === 'cdp-request') {
      if (typeof $$handleCDPRequest === 'function') {
        $$handleCDPRequest(jsonString);
      }
    }
  };
}

describe('PerformanceTracer trace format', () => {
  let tracer;

  beforeEach(() => {
    // Fresh tracer for each test
    delete globalThis.performance;
    cleanupMockBridgeFunctions();
    jest.resetModules();

    // Install mock bridge functions and create tracer interface
    createMockNativeTracer();
    tracer = createTracerInterface();

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
  });

  it('emits metadata events on startTracing', () => {
    tracer.startTracing();
    const events = tracer.stopTracing().events;
    const meta = events.filter(e => e.ph === 'M');
    expect(meta).toHaveLength(2);
    expect(meta[0]).toEqual(expect.objectContaining({
      name: 'process_name',
      cat: '__metadata',
      ph: 'M',
      args: {name: 'Falcon'},
    }));
    expect(meta[1]).toEqual(expect.objectContaining({
      name: 'thread_name',
      cat: '__metadata',
      ph: 'M',
      args: {name: 'CrRendererMain'},
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

    const events = tracer.stopTracing().events;
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');

    expect(userTiming).toHaveLength(2);

    // Begin event
    const begin = userTiming[0];
    expect(begin.ph).toBe('b');
    expect(begin.name).toBe('\u200bApp');
    expect(begin.ts).toBe(100000); // ms → µs
    expect(begin.id2).toBeDefined();
    expect(begin.id2.local).toBeDefined();
    const detail = JSON.parse(begin.args.detail);
    expect(detail.devtools.track).toBe('Components \u269b');
    expect(detail.devtools.color).toBe('primary-dark');

    // End event
    const end = userTiming[1];
    expect(end.ph).toBe('e');
    expect(end.name).toBe('\u200bApp');
    expect(end.ts).toBe(200000);
    expect(end.id2.local).toBe(begin.id2.local);
  });

  it('captures console.timeStamp with extended args as blink.user_timing b/e events', () => {
    tracer.startTracing();

    // Simulate what React's logRenderPhase does for scheduling
    console.timeStamp('Render', 100, 200, 'Blocking', 'Scheduler \u269b', 'primary-dark');

    const events = tracer.stopTracing().events;
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

    const events = tracer.stopTracing().events;
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');

    expect(userTiming).toHaveLength(2);
    const detail = JSON.parse(userTiming[0].args.detail);
    expect(detail.devtools.track).toBe('Components \u269b');
    expect(detail.devtools.color).toBe('primary-light');
    // trackGroup should not be present when undefined
    expect(detail.devtools.trackGroup).toBeUndefined();
  });

  it('includes properties in timeStamp detail when provided', () => {
    tracer.startTracing();

    tracer.reportTimeStamp('Commit', 100, 200, 'Shadow Tree', 'Native \u269b', 'primary',
      [['Nodes', '12'], ['Tree depth', '4']]);

    const events = tracer.stopTracing().events;
    const begin = events.find(e => e.cat === 'blink.user_timing' && e.ph === 'b');
    const detail = JSON.parse(begin.args.detail);
    expect(detail.devtools.properties).toEqual([
      ['Nodes', '12'],
      ['Tree depth', '4'],
    ]);
  });

  it('omits properties from timeStamp detail when not provided', () => {
    tracer.startTracing();

    tracer.reportTimeStamp('Sync Frames', 100, 200, 'Shadow Tree', 'Native \u269b', 'primary');

    const events = tracer.stopTracing().events;
    const begin = events.find(e => e.cat === 'blink.user_timing' && e.ph === 'b');
    const detail = JSON.parse(begin.args.detail);
    expect(detail.devtools.properties).toBeUndefined();
  });

  it('does not capture events when not tracing', () => {
    performance.measure('\u200bApp', {start: 100, end: 200, detail: {devtools: {track: 'Components \u269b', color: 'primary'}}});
    console.timeStamp('Render', 100, 200, 'Blocking', 'Scheduler \u269b', 'primary');

    tracer.startTracing();
    const events = tracer.stopTracing().events;
    // Only metadata events, no user timing
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');
    expect(userTiming).toHaveLength(0);
  });

  it('matches web reference trace format (field-by-field)', () => {
    // Load a real Chrome DevTools trace for comparison
    const webTrace = require('./fixtures/web-trace.json');
    const webEvents = (webTrace.traceEvents || webTrace).filter(
      e => e.cat === 'blink.user_timing' && e.ph === 'b'
    );
    expect(webEvents.length).toBeGreaterThan(0);

    // Generate our trace events
    tracer.startTracing();
    console.timeStamp('Update', 100, 200, 'Blocking', 'Scheduler \u269b', 'primary-light');
    const events = tracer.stopTracing().events;
    const ourBegin = events.find(e => e.cat === 'blink.user_timing' && e.ph === 'b');
    const webBegin = webEvents[0];

    // Category must match exactly
    expect(ourBegin.cat).toBe(webBegin.cat);
    // Phase must match
    expect(ourBegin.ph).toBe(webBegin.ph);
    // detail must be a JSON string (not object)
    expect(typeof ourBegin.args.detail).toBe('string');
    expect(typeof webBegin.args.detail).toBe('string');
    // detail must parse to {devtools: {track, color, ...}}
    const ourDetail = JSON.parse(ourBegin.args.detail);
    const webDetail = JSON.parse(webBegin.args.detail);
    expect(ourDetail.devtools).toBeDefined();
    expect(webDetail.devtools).toBeDefined();
    expect(ourDetail.devtools.track).toBeDefined();
    expect(ourDetail.devtools.color).toBeDefined();
    // ts must be a number (microseconds)
    expect(typeof ourBegin.ts).toBe('number');
    // id must be present as id2.local (Chrome's scoped async id format)
    expect(ourBegin.id2).toBeDefined();
    expect(ourBegin.id2.local).toBeDefined();
    expect(webBegin.id2).toBeDefined();
    expect(webBegin.id2.local).toBeDefined();
  });

  it('satisfies React supportsUserTiming requirements after polyfill load', () => {
    // These are the exact checks React's reconciler performs at module eval time
    // (react-reconciler.development.js:17214-17218)
    expect(typeof console).not.toBe('undefined');
    expect(typeof console.timeStamp).toBe('function');
    expect(typeof performance).not.toBe('undefined');
    expect(typeof performance.measure).toBe('function');
  });

  it('produces a valid Chrome Trace Format JSON', () => {
    tracer.startTracing();
    performance.measure('\u200bApp', {start: 10, end: 20, detail: {devtools: {track: 'Components \u269b', color: 'primary', tooltipText: 'App'}}});
    console.timeStamp('Render', 5, 25, 'Blocking', 'Scheduler \u269b', 'primary-dark');
    const events = tracer.stopTracing().events;

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

describe('InspectorMessageHandler roundtrip', () => {
  let tracer;
  let sentMessages;

  beforeEach(() => {
    delete globalThis.performance;
    delete globalThis.$$onInspectorMessage;
    delete globalThis.$$sendInspectorMessage;
    cleanupMockBridgeFunctions();
    sentMessages = [];
    jest.resetModules();

    // Install mock bridge functions and create tracer interface
    createMockNativeTracer();
    tracer = createTracerInterface();

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

    // Mock the native bridge send function
    globalThis.$$sendInspectorMessage = function (data) {
      sentMessages.push(JSON.parse(data));
    };

    // Install mock native inspector message handler
    installMockInspectorMessageHandler();
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

describe('Native commit timing trace events', () => {
  let tracer;

  beforeEach(() => {
    delete globalThis.performance;
    cleanupMockBridgeFunctions();
    jest.resetModules();

    // Install mock bridge functions and create tracer interface
    createMockNativeTracer();
    tracer = createTracerInterface();

    // Stub performance.now for startTracing()
    globalThis.performance = {
      now: function() { return Date.now(); },
    };

    // Stub console.timeStamp to route extended form to tracer (mirrors native)
    console.timeStamp = function(label, start, end, track, trackGroup, color) {
      if (arguments.length <= 1) return;
      if (tracer.isTracing()) {
        tracer.reportTimeStamp(label, start, end, track, trackGroup, color);
      }
    };
  });

  function makeTimings(overrides) {
    return Object.assign({
      commitStart: 100, commitEnd: 110,
      prepareStart: 100, prepareEnd: 100.5,
      layoutStart: 100.5, layoutEnd: 104,
      diffStart: 104, diffEnd: 106,
      mutationsStart: 106, mutationsEnd: 108,
      syncStart: 108, syncEnd: 109,
      cleanupStart: 109, cleanupEnd: 109.5,
      treePromoteStart: 109, treePromoteEnd: 109.1,
      nodeGCStart: 109.1, nodeGCEnd: 109.3,
      devtoolsNotifyStart: 109.3, devtoolsNotifyEnd: 109.5,
      mutationCount: 5,
      yogaStart: 100, yogaEnd: 103,
      textRemeasureStart: 101, textRemeasureEnd: 102,
      didRemeasure: 0,
      scrollStart: 103, scrollEnd: 104,
      readFramesStart: 103, readFramesEnd: 103.5,
      nodeCount: 12,
      treeDepth: 4,
      rootTypes: 'div, main',
      creates: 2,
      deletes: 1,
      inserts: 3,
      removes: 1,
      updates: 2,
      affectedTypes: 'div, p, span',
      // Per-node timings: [type, start, end, ...] (timestamps are absolute, origin-adjusted in JS)
      diffNodes: ['div', 104, 106, 'h1', 104.5, 105, 'p', 105, 105.8],
      mutationNodes: ['CREATE', 'div', 106, 106.5, 'UPDATE', 'p', 106.5, 107],
      layoutNodes: ['div', 100, 104, 'h1', 100.5, 102, 'p', 102, 103.5],
    }, overrides);
  }

  function emitNativeTimings(timings) {
    // This mirrors what PerformanceTracer.reportCommitTimings does in Swift
    var t = timings;
    function durationColor(startMs, endMs) {
      var duration = endMs - startMs;
      return duration < 0.5 ? 'primary-light' : duration < 50 ? 'primary' : 'primary-dark';
    }

    tracer.reportTimeStamp('Commit', t.commitStart, t.commitEnd,
      'Shadow Tree', 'Native \u269b', durationColor(t.commitStart, t.commitEnd),
      [['Nodes', String(t.nodeCount)],
       ['Tree depth', String(t.treeDepth)],
       ['Root elements', t.rootTypes]]);
    if (t.prepareEnd > t.prepareStart) {
      tracer.reportTimeStamp('Prepare', t.prepareStart, t.prepareEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.prepareStart, t.prepareEnd));
    }
    if (t.layoutEnd > t.layoutStart) {
      tracer.reportTimeStamp('Blocked (Layout)', t.layoutStart, t.layoutEnd,
        'Shadow Tree', 'Native \u269b', 'secondary-light');
    }
    tracer.reportTimeStamp('Diff', t.diffStart, t.diffEnd,
      'Shadow Tree', 'Native \u269b', durationColor(t.diffStart, t.diffEnd),
      [['Mutations', String(t.mutationCount)],
       ['Creates', String(t.creates)],
       ['Updates', String(t.updates)],
       ['Deletes', String(t.deletes)]]);
    tracer.reportTimeStamp('Apply Mutations (' + t.mutationCount + ')', t.mutationsStart, t.mutationsEnd,
      'Shadow Tree', 'Native \u269b', durationColor(t.mutationsStart, t.mutationsEnd),
      [['Inserts', String(t.inserts)],
       ['Removes', String(t.removes)],
       ['Affected elements', t.affectedTypes || 'none']]);
    tracer.reportTimeStamp('Sync Frames', t.syncStart, t.syncEnd,
      'Shadow Tree', 'Native \u269b', durationColor(t.syncStart, t.syncEnd));
    if (t.cleanupEnd > t.cleanupStart) {
      tracer.reportTimeStamp('Cleanup', t.cleanupStart, t.cleanupEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.cleanupStart, t.cleanupEnd));
    }
    if (t.treePromoteEnd > t.treePromoteStart) {
      tracer.reportTimeStamp('Tree Promote', t.treePromoteStart, t.treePromoteEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.treePromoteStart, t.treePromoteEnd));
    }
    if (t.nodeGCEnd > t.nodeGCStart) {
      tracer.reportTimeStamp('Node GC', t.nodeGCStart, t.nodeGCEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.nodeGCStart, t.nodeGCEnd));
    }
    if (t.devtoolsNotifyEnd > t.devtoolsNotifyStart) {
      tracer.reportTimeStamp('DevTools Notify', t.devtoolsNotifyStart, t.devtoolsNotifyEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.devtoolsNotifyStart, t.devtoolsNotifyEnd));
    }

    tracer.reportTimeStamp('Calculate Layout', t.layoutStart, t.layoutEnd,
      'Layout', 'Native \u269b', durationColor(t.layoutStart, t.layoutEnd),
      [['Nodes', String(t.nodeCount)],
       ['Second pass', t.didRemeasure ? 'yes' : 'no']]);
    tracer.reportTimeStamp('Yoga', t.yogaStart, t.yogaEnd,
      'Layout', 'Native \u269b', durationColor(t.yogaStart, t.yogaEnd),
      [['Nodes', String(t.nodeCount)]]);

    if (t.didRemeasure) {
      tracer.reportTimeStamp('Text Remeasure', t.textRemeasureStart, t.textRemeasureEnd,
        'Layout', 'Native \u269b', 'warning');
    }
    if (t.readFramesEnd > t.readFramesStart) {
      tracer.reportTimeStamp('Read Frames', t.readFramesStart, t.readFramesEnd,
        'Layout', 'Native \u269b', durationColor(t.readFramesStart, t.readFramesEnd),
        [['Nodes', String(t.nodeCount)]]);
    }
    if (t.scrollEnd > t.scrollStart) {
      tracer.reportTimeStamp('Scroll Content', t.scrollStart, t.scrollEnd,
        'Layout', 'Native \u269b', durationColor(t.scrollStart, t.scrollEnd));
    }

    // Diff Nodes — per-node timing, nested below Diff on Shadow Tree track
    var diffNodes = t.diffNodes;
    if (diffNodes && diffNodes.length > 0) {
      for (var i = 0; i < diffNodes.length; i += 3) {
        tracer.reportTimeStamp(diffNodes[i], diffNodes[i + 1], diffNodes[i + 2],
          'Shadow Tree', 'Native \u269b', 'primary-light');
      }
    }

  // Mutation Nodes — per-mutation timing, nested below Apply Mutations on Shadow Tree track
    var mutationNodes = t.mutationNodes;
    if (mutationNodes && mutationNodes.length > 0) {
      for (var i = 0; i < mutationNodes.length; i += 4) {
        tracer.reportTimeStamp(
          mutationNodes[i] + ' ' + mutationNodes[i + 1],
          mutationNodes[i + 2], mutationNodes[i + 3],
          'Shadow Tree', 'Native \u269b', 'primary-light');
      }
    }

    // Layout Nodes — per-node timing, nested on Layout track
    var layoutNodes = t.layoutNodes;
    if (layoutNodes && layoutNodes.length > 0) {
      for (var i = 0; i < layoutNodes.length; i += 3) {
        tracer.reportTimeStamp(layoutNodes[i], layoutNodes[i + 1], layoutNodes[i + 2],
          'Layout', 'Native \u269b', 'primary-light');
      }
    }
  }

  function getBeginEvents(events) {
    return events
      .filter(e => e.cat === 'blink.user_timing' && e.ph === 'b')
      .map(e => ({
        name: e.name,
        detail: JSON.parse(e.args.detail),
      }));
  }

  it('emits Shadow Tree track events with correct track and trackGroup', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const shadowTreeEvents = begins.filter(e => e.detail.devtools.track === 'Shadow Tree');
    expect(shadowTreeEvents).toHaveLength(15);
    expect(shadowTreeEvents.map(e => e.name)).toEqual([
      'Commit', 'Prepare', 'Blocked (Layout)', 'Diff', 'Apply Mutations (5)', 'Sync Frames',
      'Cleanup', 'Tree Promote', 'Node GC', 'DevTools Notify',
      'div', 'h1', 'p',
      'CREATE div', 'UPDATE p',
    ]);

    for (const e of shadowTreeEvents) {
      expect(e.detail.devtools.trackGroup).toBe('Native \u269b');
    }
  });

  it('emits Layout track events with correct track and trackGroup', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const layoutEvents = begins.filter(e => e.detail.devtools.track === 'Layout');
    // Without didRemeasure: Calculate Layout, Yoga, Read Frames, Scroll Content + 3 layout nodes = 7
    expect(layoutEvents).toHaveLength(7);
    expect(layoutEvents.map(e => e.name)).toEqual([
      'Calculate Layout', 'Yoga', 'Read Frames', 'Scroll Content',
      'div', 'h1', 'p',
    ]);

    for (const e of layoutEvents) {
      expect(e.detail.devtools.trackGroup).toBe('Native \u269b');
    }
  });

  it('includes Text Remeasure span only when didRemeasure is truthy', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({didRemeasure: 1}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const textRemeasure = begins.filter(e => e.name === 'Text Remeasure');
    expect(textRemeasure).toHaveLength(1);
    expect(textRemeasure[0].detail.devtools.color).toBe('warning');
    expect(textRemeasure[0].detail.devtools.track).toBe('Layout');
  });

  it('excludes Text Remeasure span when didRemeasure is 0', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({didRemeasure: 0}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const textRemeasure = begins.filter(e => e.name === 'Text Remeasure');
    expect(textRemeasure).toHaveLength(0);
  });

  it('excludes Scroll Content span when scrollEnd equals scrollStart', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({scrollStart: 103, scrollEnd: 103}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const scrollEvents = begins.filter(e => e.name === 'Scroll Content');
    expect(scrollEvents).toHaveLength(0);
  });

  it('uses duration-based coloring: primary-light for <0.5ms', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({commitStart: 100, commitEnd: 100.3}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const commit = begins.find(e => e.name === 'Commit');
    expect(commit.detail.devtools.color).toBe('primary-light');
  });

  it('uses duration-based coloring: primary for <50ms', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({commitStart: 100, commitEnd: 130}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const commit = begins.find(e => e.name === 'Commit');
    expect(commit.detail.devtools.color).toBe('primary');
  });

  it('uses duration-based coloring: primary-dark for >=50ms', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({commitStart: 100, commitEnd: 200}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const commit = begins.find(e => e.name === 'Commit');
    expect(commit.detail.devtools.color).toBe('primary-dark');
  });

  it('emits valid begin/end event pairs with end > start timestamps', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings());
    const events = tracer.stopTracing().events;
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');
    const begins = userTiming.filter(e => e.ph === 'b');
    const ends = userTiming.filter(e => e.ph === 'e');

    // Each begin has a matching end
    expect(begins.length).toBe(ends.length);
    for (let i = 0; i < begins.length; i++) {
      expect(begins[i].id2.local).toBe(ends[i].id2.local);
      expect(begins[i].name).toBe(ends[i].name);
      expect(ends[i].ts).toBeGreaterThanOrEqual(begins[i].ts);
    }
  });

  it('includes properties in Commit event detail', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({nodeCount: 15, treeDepth: 5, rootTypes: 'div, footer'}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const commit = begins.find(e => e.name === 'Commit');
    expect(commit.detail.devtools.properties).toEqual([
      ['Nodes', '15'],
      ['Tree depth', '5'],
      ['Root elements', 'div, footer'],
    ]);
  });

  it('includes properties in Diff event detail', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({mutationCount: 8, creates: 3, updates: 4, deletes: 1}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const diff = begins.find(e => e.name === 'Diff');
    expect(diff.detail.devtools.properties).toEqual([
      ['Mutations', '8'],
      ['Creates', '3'],
      ['Updates', '4'],
      ['Deletes', '1'],
    ]);
  });

  it('includes properties in Apply Mutations event detail', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({inserts: 2, removes: 1, affectedTypes: 'div, span'}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const applyMutations = begins.find(e => e.name.startsWith('Apply Mutations'));
    expect(applyMutations.detail.devtools.properties).toEqual([
      ['Inserts', '2'],
      ['Removes', '1'],
      ['Affected elements', 'div, span'],
    ]);
  });

  it('includes properties in Calculate Layout event detail', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({nodeCount: 20, didRemeasure: 1}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const layout = begins.find(e => e.name === 'Calculate Layout');
    expect(layout.detail.devtools.properties).toEqual([
      ['Nodes', '20'],
      ['Second pass', 'yes'],
    ]);
  });

  it('includes properties in Yoga event detail', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings({nodeCount: 10}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const yoga = begins.find(e => e.name === 'Yoga');
    expect(yoga.detail.devtools.properties).toEqual([
      ['Nodes', '10'],
    ]);
  });

  it('omits properties from events that do not include them', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const syncFrames = begins.find(e => e.name === 'Sync Frames');
    expect(syncFrames.detail.devtools.properties).toBeUndefined();

    const scrollContent = begins.find(e => e.name === 'Scroll Content');
    expect(scrollContent.detail.devtools.properties).toBeUndefined();
  });

  it('emits Diff Nodes events nested on Shadow Tree track', () => {
    tracer.startTracing();
    const timings = makeTimings();
    emitNativeTimings(timings);
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    // Diff node events fall within the diff time window
    const diffStart = timings.diffStart * 1000;
    const diffEnd = timings.diffEnd * 1000;
    const diffNodeEvents = begins.filter(e => {
      if (e.detail.devtools.track !== 'Shadow Tree') return false;
      if (e.detail.devtools.color !== 'primary-light') return false;
      const ev = events.find(ev => ev.cat === 'blink.user_timing' && ev.ph === 'b' && ev.name === e.name && ev.ts >= diffStart && ev.ts < diffEnd);
      return !!ev;
    });
    expect(diffNodeEvents).toHaveLength(3);
    expect(diffNodeEvents.map(e => e.name)).toEqual(['div', 'h1', 'p']);
    for (const e of diffNodeEvents) {
      expect(e.detail.devtools.trackGroup).toBe('Native \u269b');
    }
  });

  it('emits mutation node events nested on Shadow Tree track with mutation type labels', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const mutNodeEvents = begins.filter(e =>
      e.detail.devtools.track === 'Shadow Tree' &&
      (e.name.startsWith('CREATE ') || e.name.startsWith('UPDATE ') ||
       e.name.startsWith('DELETE ') || e.name.startsWith('INSERT ') ||
       e.name.startsWith('REMOVE '))
    );
    expect(mutNodeEvents).toHaveLength(2);
    expect(mutNodeEvents.map(e => e.name)).toEqual(['CREATE div', 'UPDATE p']);
  });

  it('emits Layout Nodes events nested on Layout track', () => {
    tracer.startTracing();
    emitNativeTimings(makeTimings());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const layoutNodeEvents = begins.filter(e =>
      e.detail.devtools.track === 'Layout' &&
      e.detail.devtools.color === 'primary-light'
    );
    expect(layoutNodeEvents).toHaveLength(3);
    expect(layoutNodeEvents.map(e => e.name)).toEqual(['div', 'h1', 'p']);
  });

  it('skips per-node events when timing arrays are empty', () => {
    tracer.startTracing();
    const timings = makeTimings({diffNodes: [], mutationNodes: [], layoutNodes: []});
    emitNativeTimings(timings);
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    // No diff/mutation per-node events within diff/mutations time windows
    const diffStart = timings.diffStart * 1000;
    const diffEnd = timings.diffEnd * 1000;
    const mutStart = timings.mutationsStart * 1000;
    const mutEnd = timings.mutationsEnd * 1000;
    const perNodeInDiff = events.filter(e =>
      e.cat === 'blink.user_timing' && e.ph === 'b' &&
      e.ts >= diffStart && e.ts < diffEnd &&
      JSON.parse(e.args.detail).devtools.color === 'primary-light'
    );
    const perNodeInMut = events.filter(e =>
      e.cat === 'blink.user_timing' && e.ph === 'b' &&
      e.ts >= mutStart && e.ts < mutEnd &&
      JSON.parse(e.args.detail).devtools.color === 'primary-light'
    );
    expect(perNodeInDiff).toHaveLength(0);
    expect(perNodeInMut).toHaveLength(0);
    expect(begins.filter(e =>
      e.detail.devtools.track === 'Layout' &&
      e.detail.devtools.color === 'primary-light'
    )).toHaveLength(0);
  });
});

describe('SSR commit timing trace events', () => {
  let tracer;

  beforeEach(() => {
    delete globalThis.performance;
    cleanupMockBridgeFunctions();
    jest.resetModules();

    // Install mock bridge functions and create tracer interface
    createMockNativeTracer();
    tracer = createTracerInterface();

    // Stub performance.now for startTracing()
    globalThis.performance = {
      now: function() { return Date.now(); },
      timeOrigin: 0,
    };
  });

  function emitNativeTimings(timings) {
    // This mirrors what PerformanceTracer.reportCommitTimings does in Swift
    var t = timings;
    function durationColor(startMs, endMs) {
      var duration = endMs - startMs;
      return duration < 0.5 ? 'primary-light' : duration < 50 ? 'primary' : 'primary-dark';
    }

    var label = t.label || 'Commit';
    tracer.reportTimeStamp(label, t.commitStart, t.commitEnd,
      'Shadow Tree', 'Native \u269b', durationColor(t.commitStart, t.commitEnd),
      [['Nodes', String(t.nodeCount)],
       ['Tree depth', String(t.treeDepth)],
       ['Root elements', t.rootTypes]]);
    if (t.layoutEnd > t.layoutStart) {
      tracer.reportTimeStamp('Blocked (Layout)', t.layoutStart, t.layoutEnd,
        'Shadow Tree', 'Native \u269b', 'secondary-light');
    }
    if (t.diffEnd > t.diffStart) {
      tracer.reportTimeStamp('Diff', t.diffStart, t.diffEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.diffStart, t.diffEnd),
        [['Mutations', String(t.mutationCount)],
         ['Creates', String(t.creates)],
         ['Updates', String(t.updates)],
         ['Deletes', String(t.deletes)]]);
    }
    if (t.mutationsEnd > t.mutationsStart) {
      tracer.reportTimeStamp('Apply Mutations (' + t.mutationCount + ')', t.mutationsStart, t.mutationsEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.mutationsStart, t.mutationsEnd),
        [['Inserts', String(t.inserts)],
         ['Removes', String(t.removes)],
         ['Affected elements', t.affectedTypes || 'none']]);
    }
    if (t.syncEnd > t.syncStart) {
      tracer.reportTimeStamp('Sync Frames', t.syncStart, t.syncEnd,
        'Shadow Tree', 'Native \u269b', durationColor(t.syncStart, t.syncEnd));
    }
    if (t.layoutEnd > t.layoutStart) {
      tracer.reportTimeStamp('Calculate Layout', t.layoutStart, t.layoutEnd,
        'Layout', 'Native \u269b', durationColor(t.layoutStart, t.layoutEnd),
        [['Nodes', String(t.nodeCount)],
         ['Second pass', t.didRemeasure ? 'yes' : 'no']]);
    }

    // Per-node timing arrays
    var diffNodes = t.diffNodes;
    if (diffNodes && diffNodes.length > 0) {
      for (var i = 0; i < diffNodes.length; i += 3) {
        tracer.reportTimeStamp(diffNodes[i], diffNodes[i + 1], diffNodes[i + 2],
          'Shadow Tree', 'Native \u269b', 'primary-light');
      }
    }
    var mutationNodes = t.mutationNodes;
    if (mutationNodes && mutationNodes.length > 0) {
      for (var i = 0; i < mutationNodes.length; i += 4) {
        tracer.reportTimeStamp(
          mutationNodes[i] + ' ' + mutationNodes[i + 1],
          mutationNodes[i + 2], mutationNodes[i + 3],
          'Shadow Tree', 'Native \u269b', 'primary-light');
      }
    }
    var layoutNodes = t.layoutNodes;
    if (layoutNodes && layoutNodes.length > 0) {
      for (var i = 0; i < layoutNodes.length; i += 3) {
        tracer.reportTimeStamp(layoutNodes[i], layoutNodes[i + 1], layoutNodes[i + 2],
          'Layout', 'Native \u269b', 'primary-light');
      }
    }
  }

  function makeSSRFirstPaint(overrides) {
    return Object.assign({
      label: 'SSR First Paint',
      commitStart: 50,
      commitEnd: 70,
      layoutStart: 50,
      layoutEnd: 60,
      mutationsStart: 60,
      mutationsEnd: 70,
      mutationCount: 10,
      creates: 5,
      inserts: 5,
      deletes: 0,
      removes: 0,
      updates: 0,
      nodeCount: 5,
      treeDepth: 3,
      rootTypes: 'div',
    }, overrides);
  }

  function makeSSRReveal(overrides) {
    return Object.assign({
      label: 'SSR Reveal',
      commitStart: 80,
      commitEnd: 100,
      layoutStart: 80,
      layoutEnd: 85,
      diffStart: 85,
      diffEnd: 90,
      mutationsStart: 90,
      mutationsEnd: 95,
      syncStart: 95,
      syncEnd: 98,
      mutationCount: 4,
      creates: 2,
      inserts: 2,
      deletes: 1,
      removes: 1,
      updates: 0,
      nodeCount: 8,
      treeDepth: 4,
      rootTypes: 'div',
    }, overrides);
  }

  function getBeginEvents(events) {
    return events
      .filter(e => e.cat === 'blink.user_timing' && e.ph === 'b')
      .map(e => ({
        name: e.name,
        detail: JSON.parse(e.args.detail),
      }));
  }

  it('emits SSR First Paint on Shadow Tree and Layout tracks', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRFirstPaint());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    // Shadow Tree track should have the outer span with label
    const commit = begins.find(e => e.name === 'SSR First Paint');
    expect(commit).toBeDefined();
    expect(commit.detail.devtools.track).toBe('Shadow Tree');
    expect(commit.detail.devtools.trackGroup).toBe('Native \u269b');

    // Layout track should have Calculate Layout
    const layout = begins.find(e => e.name === 'Calculate Layout');
    expect(layout).toBeDefined();
    expect(layout.detail.devtools.track).toBe('Layout');
    expect(layout.detail.devtools.trackGroup).toBe('Native \u269b');
  });

  it('emits SSR Reveal on Shadow Tree track with Diff and Apply Mutations', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRReveal());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const shadowTreeEvents = begins.filter(e => e.detail.devtools.track === 'Shadow Tree');
    const names = shadowTreeEvents.map(e => e.name);

    expect(names).toContain('SSR Reveal');
    expect(names).toContain('Diff');
    expect(names).toContain('Sync Frames');
    // Apply Mutations includes count in name
    expect(names.some(n => n.startsWith('Apply Mutations'))).toBe(true);
  });

  it('handles multiple SSR commit timings', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRFirstPaint());
    emitNativeTimings(makeSSRReveal());
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const commits = begins.filter(e =>
      e.name === 'SSR First Paint' || e.name === 'SSR Reveal'
    );
    expect(commits).toHaveLength(2);
  });

  it('does not emit events when not tracing', () => {
    // Don't start tracing — reportTimeStamp guards on isTracing
    emitNativeTimings(makeSSRFirstPaint());

    tracer.startTracing();
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const ssrEvents = begins.filter(e => e.name === 'SSR First Paint');
    expect(ssrEvents).toHaveLength(0);
  });

  it('emits valid begin/end event pairs', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRReveal());
    const events = tracer.stopTracing().events;
    const userTiming = events.filter(e => e.cat === 'blink.user_timing');
    const begins = userTiming.filter(e => e.ph === 'b');
    const ends = userTiming.filter(e => e.ph === 'e');

    expect(begins.length).toBe(ends.length);
    for (let i = 0; i < begins.length; i++) {
      expect(begins[i].id2.local).toBe(ends[i].id2.local);
      expect(begins[i].name).toBe(ends[i].name);
      expect(ends[i].ts).toBeGreaterThanOrEqual(begins[i].ts);
    }
  });

  it('includes node count and tree depth properties on outer span', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRFirstPaint({nodeCount: 42, treeDepth: 7}));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const commit = begins.find(e => e.name === 'SSR First Paint');
    expect(commit.detail.devtools.properties).toEqual(
      expect.arrayContaining([
        ['Nodes', '42'],
        ['Tree depth', '7'],
      ])
    );
  });

  it('emits per-node component stacks from diffNodes, mutationNodes, and layoutNodes', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRReveal({
      diffNodes: ['div', 85, 86, 'p', 86, 87],
      mutationNodes: ['CREATE', 'div', 90, 91, 'INSERT', 'p', 91, 92],
      layoutNodes: ['div', 95, 96, 'p', 96, 97],
    }));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const shadowTreeNames = begins
      .filter(e => e.detail.devtools.track === 'Shadow Tree')
      .map(e => e.name);
    const layoutNames = begins
      .filter(e => e.detail.devtools.track === 'Layout')
      .map(e => e.name);

    // Diff nodes on Shadow Tree track
    expect(shadowTreeNames).toContain('div');
    expect(shadowTreeNames).toContain('p');
    // Mutation nodes on Shadow Tree track
    expect(shadowTreeNames).toContain('CREATE div');
    expect(shadowTreeNames).toContain('INSERT p');
    // Layout nodes on Layout track
    expect(layoutNames).toContain('div');
    expect(layoutNames).toContain('p');
  });

  it('emits per-mutation component stacks from SSR First Paint mutationNodes', () => {
    tracer.startTracing();
    emitNativeTimings(makeSSRFirstPaint({
      mutationNodes: ['CREATE', 'div', 60, 62, 'INSERT', 'div', 62, 64, 'CREATE', 'h1', 64, 66],
    }));
    const events = tracer.stopTracing().events;
    const begins = getBeginEvents(events);

    const shadowTreeNames = begins
      .filter(e => e.detail.devtools.track === 'Shadow Tree')
      .map(e => e.name);

    expect(shadowTreeNames).toContain('CREATE div');
    expect(shadowTreeNames).toContain('INSERT div');
    expect(shadowTreeNames).toContain('CREATE h1');
  });
});
