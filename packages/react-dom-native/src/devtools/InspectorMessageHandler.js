'use strict';

// ---------------------------------------------------------------------------
// Inspector message handler
//
// Registers $$onInspectorMessage as a global function that Swift calls when
// the dev server sends tracing commands via the hot reload WebSocket.
//
// Incoming messages:
//   {type: 'start-tracing'}  → starts collecting trace events
//   {type: 'stop-tracing'}   → stops collecting, sends trace-data back
//   {type: 'cdp-request'}    → forwards CDP domain request to in-JSC handler
//
// Outgoing messages (via $$sendInspectorMessage):
//   {type: 'trace-data', events: [...]}      → buffered trace events
//   {type: 'cdp-response', requestId, result} → CDP domain response
// ---------------------------------------------------------------------------

globalThis.$$onInspectorMessage = function (jsonString) {
  var message;
  try {
    message = JSON.parse(jsonString);
  } catch (e) {
    return;
  }

  var type = message && message.type;
  if (!type) return;

  if (type === 'start-tracing') {
    if (typeof __PERFORMANCE_TRACER__ !== 'undefined') {
      if (__PERFORMANCE_TRACER__.isTracing()) {
        return;
      }
      __PERFORMANCE_TRACER__.startTracing();
    }
  } else if (type === 'stop-tracing') {
    if (typeof __PERFORMANCE_TRACER__ !== 'undefined') {
      if (!__PERFORMANCE_TRACER__.isTracing()) {
        return;
      }
      var events = __PERFORMANCE_TRACER__.stopTracing();
      if (typeof $$sendInspectorMessage === 'function') {
        $$sendInspectorMessage(
          JSON.stringify({
            type: 'trace-data',
            events: events,
            tracingStartTs: __PERFORMANCE_TRACER__._tracingStartTs || 0,
          }),
        );
      }
    }
  } else if (type === 'cdp-request') {
    // Forward CDP request to the in-JSC handler (RuntimeAgent, etc.)
    if (typeof $$handleCDPRequest === 'function') {
      $$handleCDPRequest(jsonString);
    }
  }
};
