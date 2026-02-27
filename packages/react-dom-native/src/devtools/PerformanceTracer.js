'use strict';

// ---------------------------------------------------------------------------
// PerformanceTracer (thin shim)
//
// Delegates all tracing operations to native Swift via $$ bridge functions.
// The native PerformanceTracer.swift owns the event buffer and tracing state.
//
// This shim exists so that JS code (HostConfig.js, InspectorMessageHandler.js)
// can continue calling __PERFORMANCE_TRACER__.reportTimeStamp() etc. without
// changes.
// ---------------------------------------------------------------------------

var tracer = {
  startTracing: function () {
    if (typeof $$startTracing === 'function') {
      $$startTracing();
    }
  },

  stopTracing: function () {
    if (typeof $$stopTracing === 'function') {
      var result = $$stopTracing();
      console.log('[PerformanceTracer] stopTracing: collected ' +
        (result && result.events ? result.events.length : 0) + ' events');
      return result;
    }
    return { events: [], tracingStartTs: 0 };
  },

  isTracing: function () {
    if (typeof $$isTracing === 'function') {
      return $$isTracing();
    }
    return false;
  },

  reportTimeStamp: function (label, start, end, track, trackGroup, color, properties) {
    if (typeof $$reportTimeStamp === 'function') {
      $$reportTimeStamp(label, start, end, track, trackGroup, color, properties);
    }
  },

  reportMeasure: function (name, start, duration, detail) {
    if (typeof $$reportMeasure === 'function') {
      $$reportMeasure(name, start, duration, detail);
    }
  },

  reportMark: function (name, startTime) {
    if (typeof $$reportMark === 'function') {
      $$reportMark(name, startTime);
    }
  },

  reportInteraction: function (eventType, interactionId, inputTime, processingStart, processingEnd) {
    if (typeof $$reportInteraction === 'function') {
      $$reportInteraction(eventType, interactionId, inputTime, processingStart, processingEnd);
    }
  },

  nextInteractionId: function () {
    if (typeof $$nextInteractionId === 'function') {
      return $$nextInteractionId();
    }
    return 0;
  },
};

globalThis.__PERFORMANCE_TRACER__ = tracer;
