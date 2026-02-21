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

    const events = tracer.stopTracing();
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
    const events = tracer.stopTracing();
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
