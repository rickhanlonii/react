'use strict';

// ---------------------------------------------------------------------------
// Network Agent (in-JSC)
//
// Intercepts globalThis.fetch to emit CDP Network domain events:
//   Network.requestWillBeSent — when a request starts
//   Network.responseReceived  — when a response arrives
//   Network.loadingFinished   — when response body is read
//   Network.loadingFailed     — when a request fails
//
// Events are sent as {type: 'cdp-event', method, params} via
// $$sendInspectorMessage, and the inspector proxy broadcasts them
// to connected DevTools clients.
//
// Also pushes devtools.timeline trace events into __PERFORMANCE_TRACER__
// when tracing is active, so network requests appear in the Performance
// panel timeline.
// ---------------------------------------------------------------------------

var nextRequestId = 1;
var originalFetch = globalThis.fetch;

function emitCDPEvent(method, params) {
  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-event',
      method: method,
      params: params,
    }));
  }
}

function now() {
  return typeof $$performanceNow === 'function' ? $$performanceNow() / 1000 : Date.now() / 1000;
}

function nowMicros() {
  return typeof $$performanceNow === 'function' ? $$performanceNow() * 1000 : Date.now() * 1000;
}

// Push a devtools.timeline trace event if tracing is active
function pushTraceEvent(name, args) {
  if (typeof __PERFORMANCE_TRACER__ !== 'undefined' && __PERFORMANCE_TRACER__.isTracing()) {
    __PERFORMANCE_TRACER__._events.push({
      name: name,
      cat: 'devtools.timeline',
      ph: 'I',
      ts: nowMicros(),
      pid: 1,
      tid: 1,
      s: 't',
      args: {data: args},
    });
  }
}

if (typeof originalFetch === 'function') {
  globalThis.fetch = function (input, init) {
    var requestId = String(nextRequestId++);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = (init && init.method) || 'GET';
    var timestamp = now();

    emitCDPEvent('Network.requestWillBeSent', {
      requestId: requestId,
      loaderId: requestId,
      documentURL: '',
      request: {
        url: url,
        method: method.toUpperCase(),
        headers: (init && init.headers) || {},
        postData: (init && init.body) ? String(init.body) : undefined,
      },
      timestamp: timestamp,
      wallTime: Date.now() / 1000,
      initiator: {type: 'script'},
      type: 'Fetch',
    });

    // Also push a trace event for the Performance panel
    pushTraceEvent('ResourceSendRequest', {
      requestId: requestId,
      url: url,
      requestMethod: method.toUpperCase(),
      priority: 'High',
    });

    return originalFetch.apply(globalThis, arguments).then(function (response) {
      var responseTimestamp = now();

      // Collect response headers
      var headers = {};
      try {
        if (response.headers && typeof response.headers.entries === 'function') {
          var entries = response.headers.entries();
          var entry = entries.next();
          while (!entry.done) {
            headers[entry.value[0]] = entry.value[1];
            entry = entries.next();
          }
        }
      } catch (e) {}

      emitCDPEvent('Network.responseReceived', {
        requestId: requestId,
        loaderId: requestId,
        timestamp: responseTimestamp,
        type: 'Fetch',
        response: {
          url: url,
          status: response.status,
          statusText: response.statusText || '',
          headers: headers,
          mimeType: headers['content-type'] || '',
        },
      });

      // Push trace event for response
      pushTraceEvent('ResourceReceiveResponse', {
        requestId: requestId,
        statusCode: response.status,
        mimeType: headers['content-type'] || '',
      });

      emitCDPEvent('Network.loadingFinished', {
        requestId: requestId,
        timestamp: responseTimestamp,
        encodedDataLength: 0,
      });

      // Push trace event for finish
      pushTraceEvent('ResourceFinish', {
        requestId: requestId,
        didFail: false,
      });

      return response;
    }).catch(function (error) {
      emitCDPEvent('Network.loadingFailed', {
        requestId: requestId,
        timestamp: now(),
        type: 'Fetch',
        errorText: String(error),
      });

      // Push trace event for failure
      pushTraceEvent('ResourceFinish', {
        requestId: requestId,
        didFail: true,
      });

      throw error;
    });
  };
}
