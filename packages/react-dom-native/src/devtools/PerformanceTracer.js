'use strict';

// ---------------------------------------------------------------------------
// PerformanceTracer
//
// Singleton trace event buffer that collects Chrome Trace Format events while
// tracing is active. Mirrors React Native's PerformanceTracer (C++).
//
// Events are buffered in-process and flushed to the dev server when tracing
// stops. The dev server wraps them in CDP Tracing.dataCollected notifications
// for Chrome DevTools.
//
// Chrome DevTools Performance panel recognizes custom tracks from
// blink.user_timing async events (ph:'b'/'e') where the begin event's
// args.detail is a JSON string containing {devtools: {track, color, ...}}.
// Both reportTimeStamp (console.timeStamp) and reportMeasure
// (performance.measure) emit this format so events land on named tracks
// like "Components ⚛" and "Scheduler ⚛".
// ---------------------------------------------------------------------------

var tracer = {
  _tracing: false,
  _events: [],
  _nextId: 0,
  _pid: 1,
  _tid: 1,

  startTracing: function () {
    this._tracing = true;
    this._nextId = 0;
    this._events = [
      // Process/thread metadata — cat:'__metadata' and thread name
      // 'CrRendererMain' are required by Chrome DevTools MetaHandler to
      // identify the renderer process and its main thread.
      {name: 'process_name', cat: '__metadata', ph: 'M', pid: this._pid, tid: 0, ts: 0, args: {name: 'Falcon'}},
      {name: 'thread_name', cat: '__metadata', ph: 'M', pid: this._pid, tid: this._tid, ts: 0, args: {name: 'CrRendererMain'}},
    ];
  },

  stopTracing: function () {
    this._tracing = false;
    var events = this._events;
    this._events = [];
    console.log('[PerformanceTracer] stopTracing: collected ' + events.length + ' events');
    return events;
  },

  isTracing: function () {
    return this._tracing;
  },

  // Called by the extended console.timeStamp override.
  // React uses console.timeStamp(name, start, end, track, trackGroup, color)
  // for component renders (when supportsUserTiming is false) and scheduling
  // events. We convert to blink.user_timing b/e events with devtools detail
  // so Chrome DevTools places them on named custom tracks.
  reportTimeStamp: function (label, start, end, track, trackGroup, color) {
    if (!this._tracing) return;
    // Log early events to verify initial render is captured
    if (this._events.length < 20) {
      console.log('[PerformanceTracer] timeStamp: ' + label + ' start=' + start.toFixed(1) + ' track=' + track);
    }
    var id = '0x' + (this._nextId++).toString(16);
    var devtools = {track: track, color: color};
    if (trackGroup) {
      devtools.trackGroup = trackGroup;
    }
    var startUs = start * 1000; // ms → µs
    var endUs = end * 1000;
    // Begin event — detail as JSON string in args (Chrome DevTools
    // UserTimingsHandler expects a string and calls parseDevtoolsDetails).
    // id2.local is the scoped async id format Chrome uses internally.
    this._events.push({
      id2: {local: id},
      name: label,
      cat: 'blink.user_timing',
      ph: 'b',
      ts: startUs,
      pid: this._pid,
      tid: this._tid,
      args: {detail: JSON.stringify({devtools: devtools})},
    });
    // End event
    this._events.push({
      id2: {local: id},
      name: label,
      cat: 'blink.user_timing',
      ph: 'e',
      ts: endUs,
      pid: this._pid,
      tid: this._tid,
      args: {},
    });
  },

  // Called by the performance.measure polyfill.
  // React uses performance.measure(name, {start, end, detail: {devtools: ...}})
  // for component renders (when supportsUserTiming is true). The detail
  // contains track assignment metadata that DevTools parses for custom tracks.
  reportMeasure: function (name, start, duration, detail) {
    if (!this._tracing) return;
    // Log early events to verify initial render is captured
    if (this._events.length < 20) {
      console.log('[PerformanceTracer] measure: ' + name + ' start=' + start.toFixed(1) + ' dur=' + duration.toFixed(1));
    }
    var id = '0x' + (this._nextId++).toString(16);
    // Begin event — detail as JSON string in args (Chrome expects string format)
    this._events.push({
      id2: {local: id},
      name: name,
      cat: 'blink.user_timing',
      ph: 'b',
      ts: start * 1000,
      pid: this._pid,
      tid: this._tid,
      args: {detail: JSON.stringify(detail || {})},
    });
    // End event
    this._events.push({
      id2: {local: id},
      name: name,
      cat: 'blink.user_timing',
      ph: 'e',
      ts: (start + duration) * 1000,
      pid: this._pid,
      tid: this._tid,
      args: {},
    });
  },

  // Called by the performance.mark polyfill.
  // Emits an Instant event for user timing marks.
  reportMark: function (name, startTime) {
    if (!this._tracing) return;
    this._events.push({
      name: name,
      cat: 'blink.user_timing',
      ph: 'I',
      ts: startTime * 1000,
      pid: this._pid,
      tid: this._tid,
      args: {},
    });
  },
};

globalThis.__PERFORMANCE_TRACER__ = tracer;
