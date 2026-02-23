'use strict';

// ---------------------------------------------------------------------------
// Performance API polyfill for JSC
//
// Provides globalThis.performance with now(), mark(), measure(),
// clearMarks(), clearMeasures(), getEntriesByType(), getEntriesByName().
//
// React uses performance.now() for timing and performance.measure() with
// detail metadata for Custom Performance Tracks in Chrome DevTools.
//
// References:
//   - RN: packages/react-native/src/private/webapis/performance/Performance.js
//   - W3C: https://www.w3.org/TR/user-timing/
// ---------------------------------------------------------------------------

var marks = [];
var measures = [];

// Use the native bridge for high-resolution timing.
// $$performanceNow is registered by Bindings.swift using CACurrentMediaTime.
var now =
  typeof $$performanceNow === 'function'
    ? $$performanceNow
    : typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? function () {
          return performance.now();
        }
      : function () {
          return Date.now();
        };

// Cache the time origin so performance.now() returns relative timestamps
var timeOrigin = now();

function performanceNow() {
  return now() - timeOrigin;
}

function mark(name, options) {
  var startTime =
    options && typeof options.startTime === 'number'
      ? options.startTime
      : performanceNow();
  var entry = {
    entryType: 'mark',
    name: name,
    startTime: startTime,
    duration: 0,
    detail: (options && options.detail) || null,
  };
  marks.push(entry);

  // Report to tracer if active
  if (
    typeof __PERFORMANCE_TRACER__ !== 'undefined' &&
    __PERFORMANCE_TRACER__.isTracing()
  ) {
    __PERFORMANCE_TRACER__.reportMark(name, startTime);
  }

  return entry;
}

function measure(name, startOrOptions, endMark) {
  var startTime;
  var endTime;
  var detail = null;

  if (
    startOrOptions !== null &&
    startOrOptions !== undefined &&
    typeof startOrOptions === 'object'
  ) {
    // Options object form: measure(name, {start, end, duration, detail})
    startTime =
      typeof startOrOptions.start === 'number'
        ? startOrOptions.start
        : typeof startOrOptions.start === 'string'
          ? findMarkTime(startOrOptions.start)
          : performanceNow();
    if (typeof startOrOptions.end === 'number') {
      endTime = startOrOptions.end;
    } else if (typeof startOrOptions.end === 'string') {
      endTime = findMarkTime(startOrOptions.end);
    } else if (typeof startOrOptions.duration === 'number') {
      endTime = startTime + startOrOptions.duration;
    } else {
      endTime = performanceNow();
    }
    detail = startOrOptions.detail || null;
  } else if (typeof startOrOptions === 'string') {
    // Legacy form: measure(name, startMark, endMark)
    startTime = findMarkTime(startOrOptions);
    endTime =
      typeof endMark === 'string' ? findMarkTime(endMark) : performanceNow();
  } else if (typeof startOrOptions === 'number') {
    startTime = startOrOptions;
    endTime =
      typeof endMark === 'number' ? endMark : performanceNow();
  } else {
    startTime = 0;
    endTime = performanceNow();
  }

  var duration = endTime - startTime;
  var entry = {
    entryType: 'measure',
    name: name,
    startTime: startTime,
    duration: duration,
    detail: detail,
  };
  measures.push(entry);

  // Report to tracer if active
  if (
    typeof __PERFORMANCE_TRACER__ !== 'undefined' &&
    __PERFORMANCE_TRACER__.isTracing()
  ) {
    __PERFORMANCE_TRACER__.reportMeasure(name, startTime, duration, detail);
  }

  return entry;
}

function findMarkTime(name) {
  for (var i = marks.length - 1; i >= 0; i--) {
    if (marks[i].name === name) {
      return marks[i].startTime;
    }
  }
  return 0;
}

function clearMarks(name) {
  if (name === undefined) {
    marks = [];
  } else {
    marks = marks.filter(function (e) {
      return e.name !== name;
    });
  }
}

function clearMeasures(name) {
  if (name === undefined) {
    measures = [];
  } else {
    measures = measures.filter(function (e) {
      return e.name !== name;
    });
  }
}

function getEntriesByType(type) {
  if (type === 'mark') return marks.slice();
  if (type === 'measure') return measures.slice();
  return [];
}

function getEntriesByName(name, type) {
  var all = type ? getEntriesByType(type) : marks.concat(measures);
  return all.filter(function (e) {
    return e.name === name;
  });
}

// Augment the existing performance object if present, or create a new one.
// JSC may have a read-only globalThis.performance that can't be replaced,
// so we augment its properties instead.
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = {};
}
var perf = globalThis.performance;
perf.timeOrigin = timeOrigin;
perf.now = performanceNow;
perf.mark = mark;
perf.measure = measure;
perf.clearMarks = clearMarks;
perf.clearMeasures = clearMeasures;
perf.getEntriesByType = getEntriesByType;
perf.getEntriesByName = getEntriesByName;
