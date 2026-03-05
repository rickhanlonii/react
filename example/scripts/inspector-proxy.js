'use strict';

// ---------------------------------------------------------------------------
// CDP Inspector Proxy
//
// Minimal Chrome DevTools Protocol (CDP) server that enables the Performance
// panel in Chrome DevTools to record traces from the native app.
//
// Architecture:
//   Chrome DevTools <--CDP WebSocket (6001/__cdp)--> This proxy (in SSR server)
//                                                     | messages via WS (6001/__dev)
//                                                App (JSC on iOS Simulator)
//
// HTTP endpoints (for chrome://inspect discovery):
//   GET /json/version  -> browser version info
//   GET /json          -> inspectable page list
//   GET /json/list     -> same as /json
//
// CDP WebSocket:
//   Tracing.start -> tells app to start collecting trace events
//   Tracing.end   -> tells app to stop, collects events, emits
//                    Tracing.dataCollected + Tracing.tracingComplete
//
// Reference: ReactCommon/jsinspector-modern/tracing/TracingAgent.cpp
// ---------------------------------------------------------------------------

const {SourceMapResolver} = require('./source-map-resolver');
const path = require('path');
const fs = require('fs');

const DEFAULT_CDP_PORT = 9222;
const CHUNK_SIZE = 1000; // Events per Tracing.dataCollected message (matches RN)

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------
var verboseLogging = false;

function log(tag, msg, data) {
  if (!verboseLogging) return;
  var ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    var str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length > 200) str = str.slice(0, 200) + '...';
    console.log('[' + ts + '] [' + tag + '] ' + msg + ' ' + str);
  } else {
    console.log('[' + ts + '] [' + tag + '] ' + msg);
  }
}

// Always prints regardless of verboseLogging
function logAlways(tag, msg) {
  var ts = new Date().toISOString().slice(11, 23);
  console.log('[' + ts + '] [' + tag + '] ' + msg);
}

// ---------------------------------------------------------------------------
// Domain handler architecture
//
// Each domain is an object:
//   { name: 'DomainName', handle(method, params, ctx) -> result | null | Promise }
//
// ctx = { sendToApp, sendCDP, broadcastCDP, targetId, ws }
//
// A handler returning null means "response will be sent asynchronously" (e.g.
// Tracing.end waits for app data). A handler returning an object sends that
// as the CDP result immediately.
// ---------------------------------------------------------------------------

function createDomainRouter(domains) {
  var handlers = {};
  for (var i = 0; i < domains.length; i++) {
    handlers[domains[i].name] = domains[i];
  }
  return {
    route: function route(ws, message, ctx) {
      var method = message.method;
      var id = message.id;
      var params = message.params || {};

      var dotIdx = method.indexOf('.');
      if (dotIdx === -1) {
        log('Router', 'No domain in method: ' + method);
        if (id !== undefined) ctx.sendCDP(ws, {id: id, result: {}});
        return;
      }

      var domainName = method.slice(0, dotIdx);
      var methodName = method.slice(dotIdx + 1);
      var domain = handlers[domainName];

      if (!domain) {
        log('Router', 'Unknown domain: ' + domainName + '.' + methodName + ' (id=' + id + ')');
        if (id !== undefined) ctx.sendCDP(ws, {id: id, result: {}});
        return;
      }

      log('Router', '→ ' + domainName + '.' + methodName + ' (id=' + id + ')');
      var result = domain.handle(methodName, params, Object.assign({ws: ws, messageId: id}, ctx));
      if (result && typeof result.then === 'function') {
        log('Router', '  ↳ async (promise) for ' + domainName + '.' + methodName);
        result.then(function (r) {
          log('Router', '  ↳ resolved ' + domainName + '.' + methodName + ' (id=' + id + ')');
          if (id !== undefined) ctx.sendCDP(ws, {id: id, result: r || {}});
        });
      } else if (result !== null) {
        log('Router', '  ↳ sync response for ' + domainName + '.' + methodName + ' (id=' + id + ')', result);
        if (id !== undefined) ctx.sendCDP(ws, {id: id, result: result || {}});
      } else {
        log('Router', '  ↳ async (null) for ' + domainName + '.' + methodName + ' — handler will respond');
      }
      // result === null means the handler will send the response itself
    },
    getDomain: function getDomain(name) {
      return handlers[name] || null;
    },
  };
}

// ---------------------------------------------------------------------------
// Tracing domain
// ---------------------------------------------------------------------------

function createTracingDomain(targetId, screenshotCapture) {
  var pendingTraceResolve = null;

  function handle(method, params, ctx) {
    switch (method) {
      case 'start': {
        log('Tracing', 'start — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
        }
        screenshotCapture.start();
        return {};
      }

      case 'end': {
        log('Tracing', 'end — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
        }

        var ws = ctx.ws;
        var id = ctx._currentId;

        var tracePromise = new Promise(function (resolve) {
          pendingTraceResolve = resolve;
          setTimeout(function () {
            if (pendingTraceResolve === resolve) {
              log('Tracing', 'TIMEOUT — no trace data from app after 5s');
              pendingTraceResolve = null;
              resolve({ events: [], tracingStartTs: 0 });
            }
          }, 5000);
        });

        tracePromise.then(function (traceData) {
          screenshotCapture.stop();
          var events = traceData.events;
          var tracingStartTs = traceData.tracingStartTs;
          log('Tracing', 'Got ' + events.length + ' events from app (tracingStartTs=' + tracingStartTs + '), emitting');
          log('Tracing', '--- Trace events from app ---');
          for (var k = 0; k < events.length; k++) {
            var e = events[k];
            log('Tracing', '  [' + k + '] name=' + e.name + ' cat=' + e.cat + ' ph=' + e.ph + ' ts=' + e.ts + ' pid=' + e.pid + ' tid=' + e.tid + (e.id2 ? ' id2=' + JSON.stringify(e.id2) : ''));
          }
          log('Tracing', '--- End trace events ---');
          emitTraceEvents(ws, id, events, 'Tracing', targetId, ctx, screenshotCapture, tracingStartTs);
        });

        return null; // Response sent asynchronously
      }

      default:
        log('Tracing', 'unhandled method: ' + method);
        return {};
    }
  }

  return {
    name: 'Tracing',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'trace-data') {
        log('Tracing', 'Received trace-data from app (' + (message.events || []).length + ' events), pendingResolve=' + (pendingTraceResolve ? 'yes' : 'NO'));
        if (pendingTraceResolve) {
          var resolve = pendingTraceResolve;
          pendingTraceResolve = null;
          resolve({
            events: message.events || [],
            tracingStartTs: message.tracingStartTs || 0,
          });
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// NodeTracing domain (alias for Tracing, used by some DevTools versions)
// ---------------------------------------------------------------------------

function createNodeTracingDomain(targetId, screenshotCapture) {
  var pendingTraceResolve = null;

  function handle(method, params, ctx) {
    switch (method) {
      case 'start': {
        log('NodeTracing', 'start — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
        }
        screenshotCapture.start();
        return {};
      }

      case 'stop': {
        log('NodeTracing', 'stop — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
        }

        var ws = ctx.ws;
        var id = ctx._currentId;

        var tracePromise = new Promise(function (resolve) {
          pendingTraceResolve = resolve;
          setTimeout(function () {
            if (pendingTraceResolve === resolve) {
              log('NodeTracing', 'TIMEOUT — no trace data from app after 5s');
              pendingTraceResolve = null;
              resolve({ events: [], tracingStartTs: 0 });
            }
          }, 5000);
        });

        tracePromise.then(function (traceData) {
          screenshotCapture.stop();
          var events = traceData.events;
          var tracingStartTs = traceData.tracingStartTs;
          log('NodeTracing', 'Got ' + events.length + ' events from app (tracingStartTs=' + tracingStartTs + '), emitting');
          log('NodeTracing', '--- Trace events from app ---');
          for (var k = 0; k < events.length; k++) {
            var e = events[k];
            log('NodeTracing', '  [' + k + '] name=' + e.name + ' cat=' + e.cat + ' ph=' + e.ph + ' ts=' + e.ts + ' pid=' + e.pid + ' tid=' + e.tid + (e.id2 ? ' id2=' + JSON.stringify(e.id2) : ''));
          }
          log('NodeTracing', '--- End trace events ---');
          emitTraceEvents(ws, id, events, 'NodeTracing', targetId, ctx, screenshotCapture, tracingStartTs);
        });

        return null;
      }

      default:
        log('NodeTracing', 'unhandled method: ' + method);
        return {};
    }
  }

  return {
    name: 'NodeTracing',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'trace-data') {
        log('NodeTracing', 'Received trace-data from app (' + (message.events || []).length + ' events), pendingResolve=' + (pendingTraceResolve ? 'yes' : 'NO'));
        if (pendingTraceResolve) {
          var resolve = pendingTraceResolve;
          pendingTraceResolve = null;
          resolve({
            events: message.events || [],
            tracingStartTs: message.tracingStartTs || 0,
          });
        }
      }
    },
  };
}

// Shared trace event emission logic
function emitTraceEvents(ws, id, events, domainPrefix, targetId, ctx, screenshotCapture, tracingStartTs) {
  // Chrome DevTools Performance panel needs metadata events to associate
  // trace data with the correct process. We use TracingStartedInBrowser
  // (not TracingStartedInPage) so DevTools creates a browser+renderer
  // process model — this is required for the screenshot filmstrip to work.
  var browserPid = 0; // Browser process — owns screenshots
  var pid = 1; // Must match tracer's _pid (renderer process)
  var tid = 1; // Must match tracer's _tid

  // Find the earliest and latest timestamps to set the timeline range.
  // Skip metadata events (ph:'M') and zero-ts events.
  var minTs = Infinity;
  var maxTs = -Infinity;
  var ssrEventCount = 0;
  for (var j = 0; j < events.length; j++) {
    if (events[j].ph !== 'M' && events[j].ts !== 0) {
      if (events[j].ts < minTs) minTs = events[j].ts;
      if (events[j].ts > maxTs) maxTs = events[j].ts;
    }
    // Count SSR track events
    if (events[j].args && events[j].args.detail) {
      try {
        var detail = JSON.parse(events[j].args.detail);
        if (detail.devtools && detail.devtools.track === 'SSR') {
          ssrEventCount++;
        }
      } catch (e) {}
    }
  }
  if (minTs === Infinity) minTs = 0;
  if (maxTs === -Infinity) maxTs = 0;
  // Use tracingStartTs as the RunTask anchor when available, so Chrome
  // DevTools zooms to the trace period. Without this, React's track-init
  // events (hardcoded at 0.003ms) pull minTs to ~0, creating a huge
  // timeline where real events at the end are invisible.
  // Events before tracingStartTs are NOT filtered — they still exist in
  // the trace (e.g. server component timing data) but fall outside the
  // initial visible range.
  if (tracingStartTs > 0 && tracingStartTs < maxTs) {
    minTs = tracingStartTs;
  }
  log(domainPrefix, 'Timeline range: minTs=' + minTs + ' maxTs=' + maxTs + ' tracingStartTs=' + tracingStartTs + ' ssrEvents=' + ssrEventCount);

  var infraEvents = [
    // Browser process metadata — needed for screenshot filmstrip
    {name: 'process_name', cat: '__metadata', ph: 'M', pid: browserPid, tid: 0, ts: 0, args: {name: 'Browser'}},
    {name: 'thread_name', cat: '__metadata', ph: 'M', pid: browserPid, tid: 0, ts: 0, args: {name: 'CrBrowserMain'}},
    // TracingStartedInBrowser — tells DevTools about browser + renderer
    // processes. Required for the screenshot filmstrip (screenshots are
    // associated with the browser process, not the renderer).
    {
      name: 'TracingStartedInBrowser',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      ts: minTs - 3,
      pid: browserPid,
      tid: 0,
      s: 't',
      args: {
        data: {
          frames: [{
            frame: targetId || 'main-frame',
            isInPrimaryMainFrame: true,
            isOutermostMainFrame: true,
            name: '',
            processId: pid,
            url: '',
          }],
          persistentIds: true,
        },
      },
    },
    // SetLayerTreeId — establishes the rendering context (matches RN)
    {
      name: 'SetLayerTreeId',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      ts: minTs - 2,
      pid: pid,
      tid: tid,
      s: 't',
      args: {data: {frame: targetId || 'main-frame', layerTreeId: 1}},
    },
    // RunTask — a main thread event spanning the trace duration.
    // Chrome DevTools sets its timeline range from main thread events.
    // Without this, custom track events (React's Scheduler/Components)
    // fall outside the visible range and are invisible.
    {
      name: 'RunTask',
      cat: 'toplevel',
      ph: 'X',
      ts: minTs - 1,
      dur: maxTs > minTs ? (maxTs - minTs + 2) : 1,
      pid: pid,
      tid: tid,
      args: {},
    },
  ];
  events = infraEvents.concat(events);

  // Merge screenshot trace events if available
  if (screenshotCapture) {
    var screenshotEvents = screenshotCapture.getEvents();
    if (screenshotEvents.length > 0) {
      log(domainPrefix, 'Adding ' + screenshotEvents.length + ' screenshot events to trace');
      events = events.concat(screenshotEvents);
    }
  }

  // Always dump trace events to file for debugging
  try {
    var fs = require('fs');
    fs.writeFileSync('/tmp/falcon-trace.json',
      JSON.stringify({traceEvents: events}, null, 2));
    log('Tracing', 'Dumped to /tmp/falcon-trace.json (' + events.length + ' events)');
  } catch (e) {}

  // Acknowledge Tracing.end / NodeTracing.stop (skip if no id, e.g. Profiler-initiated)
  if (id !== null && id !== undefined) {
    log('Tracing', 'Sending response id=' + id);
    ctx.sendCDP(ws, {id: id, result: {}});
  }

  // Emit events in chunks (matching RN's behavior)
  for (var i = 0; i < events.length; i += CHUNK_SIZE) {
    var chunk = events.slice(i, i + CHUNK_SIZE);
    log('Tracing', 'Sending ' + domainPrefix + '.dataCollected chunk (' + chunk.length + ' events)');
    ctx.sendCDP(ws, {
      method: domainPrefix + '.dataCollected',
      params: {value: chunk},
    });
  }

  // Signal tracing is complete
  ctx.sendCDP(ws, {
    method: domainPrefix + '.tracingComplete',
    params: {dataLossOccurred: false},
  });
  log('Tracing', domainPrefix + '.tracingComplete sent');
}

// ---------------------------------------------------------------------------
// Runtime domain
// ---------------------------------------------------------------------------

function createRuntimeDomain(sourceMapResolver) {
  var pendingCDPRequests = new Map();

  function handle(method, params, ctx) {
    switch (method) {
      case 'enable':
        log('Runtime', 'enable — sending executionContextCreated');
        ctx.sendCDP(ctx.ws, {
          method: 'Runtime.executionContextCreated',
          params: {
            context: {
              id: 1,
              origin: '',
              name: 'Falcon JSC',
            },
          },
        });
        return {};

      case 'getIsolateId':
        log('Runtime', 'getIsolateId');
        return {id: 'falcon-isolate-1'};

      case 'runIfWaitingForDebugger':
        log('Runtime', 'runIfWaitingForDebugger');
        return {};

      // Forward these methods to JSC for real evaluation
      case 'evaluate':
      case 'getProperties':
      case 'callFunctionOn':
      case 'releaseObject':
      case 'releaseObjectGroup':
      case 'globalLexicalScopeNames':
      case 'getHeapUsage': {
        // DevTools injects scripts into isolated worlds (e.g. web-vitals for
        // performance metrics) and evaluates in those contexts. Our JSC
        // runtime only has one execution context (id: 1). If the request
        // targets a different context, return a stub instead of forwarding
        // to the app (which would never respond correctly).
        if (params && (params.uniqueContextId || (params.contextId && params.contextId !== 1))) {
          log('Runtime', method + ' targets non-main context (contextId=' +
            (params.contextId || 'none') + ', uniqueContextId=' +
            (params.uniqueContextId || 'none') + ') — returning stub');
          return {result: {type: 'undefined'}};
        }
        var requestId = 'cdp-' + ctx._currentId;
        log('Runtime', 'Forwarding ' + method + ' to app (reqId=' + requestId + ')');
        pendingCDPRequests.set(requestId, {ws: ctx.ws, id: ctx._currentId});
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({
            type: 'cdp-request',
            requestId: requestId,
            domain: 'Runtime',
            method: method,
            params: params,
          }));
        } else {
          log('Runtime', 'WARNING: sendToApp is null — returning error');
          pendingCDPRequests.delete(requestId);
          return {result: {type: 'undefined'}};
        }
        return null;
      }

      default:
        log('Runtime', 'unhandled method: ' + method);
        return {};
    }
  }

  return {
    name: 'Runtime',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'cdp-response') {
        var pending = pendingCDPRequests.get(message.requestId);
        if (pending) {
          log('Runtime', 'Got cdp-response for ' + message.requestId);
          pendingCDPRequests.delete(message.requestId);
          var result = message.result;
          // Resolve source maps in eval error stack traces
          if (sourceMapResolver && result && result.exceptionDetails) {
            result = Object.assign({}, result, {
              exceptionDetails: sourceMapResolver.resolveExceptionDetails(result.exceptionDetails),
            });
          }
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: result}));
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Profiler domain — forwarded to in-app handler for correct timestamps
// ---------------------------------------------------------------------------

function createProfilerDomain(screenshotCapture) {
  var pendingRequests = new Map();
  var nextReqId = 0;
  var pendingTraceEvents = null; // Store trace events until Profiler.stop response
  var pendingTracingStartTs = 0; // App's trace start timestamp for screenshot alignment
  var profilerStopPending = null; // {ws, id, ctx} for delayed Profiler.stop response

  function handle(method, params, ctx) {
    if (method === 'start') {
      // Also start tracing — Chrome doesn't send Tracing.start for node targets
      log('Profiler', 'start — also starting tracing');
      if (ctx.sendToApp) {
        ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
      }
      screenshotCapture.start();
      // Forward Profiler.start to app for timestamps
      var reqId = 'profiler-' + (nextReqId++);
      log('Profiler', 'Forwarding start to app (reqId=' + reqId + ')');
      pendingRequests.set(reqId, {ws: ctx.ws, id: ctx.messageId});
      if (ctx.sendToApp) {
        ctx.sendToApp(JSON.stringify({
          type: 'cdp-request',
          requestId: reqId,
          domain: 'Profiler',
          method: 'start',
          params: params || {},
        }));
      }
      return null;
    }

    if (method === 'stop') {
      log('Profiler', 'stop — also stopping tracing, waiting for both responses');
      // Stop tracing
      if (ctx.sendToApp) {
        ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
      }
      // Forward Profiler.stop to app
      var reqId = 'profiler-' + (nextReqId++);
      pendingRequests.set(reqId, {ws: ctx.ws, id: ctx.messageId});
      if (ctx.sendToApp) {
        ctx.sendToApp(JSON.stringify({
          type: 'cdp-request',
          requestId: reqId,
          domain: 'Profiler',
          method: 'stop',
          params: params || {},
        }));
      }

      // Store context for sending trace events + profiler response together
      pendingTraceEvents = null;
      profilerStopPending = {ws: ctx.ws, ctx: ctx, reqId: reqId};

      // Timeout: if trace data doesn't arrive in 3s, proceed without it
      setTimeout(function () {
        if (profilerStopPending && profilerStopPending.reqId === reqId) {
          log('Profiler', 'Trace data timeout — proceeding without trace events');
          pendingTraceEvents = [];
          maybeFinishStop();
        }
      }, 3000);

      return null;
    }

    // For other methods (enable, setSamplingInterval), forward to app
    if (ctx.sendToApp) {
      var reqId = 'profiler-' + (nextReqId++);
      log('Profiler', 'Forwarding ' + method + ' to app (reqId=' + reqId + ', messageId=' + ctx.messageId + ')');
      pendingRequests.set(reqId, {ws: ctx.ws, id: ctx.messageId});
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'Profiler',
        method: method,
        params: params || {},
      }));
      return null;
    }

    log('Profiler', 'No sendToApp — returning empty for ' + method);
    return {};
  }

  // Called when we have both trace events AND profiler response
  function maybeFinishStop() {
    if (!profilerStopPending) return;
    var pending = pendingRequests.get(profilerStopPending.reqId);
    if (!pending) return; // Profiler.stop response not yet received
    if (pendingTraceEvents === null) return; // trace-data not yet received

    var ws = profilerStopPending.ws;
    var ctx = profilerStopPending.ctx;
    var events = pendingTraceEvents;

    log('Profiler', 'Both trace data (' + events.length + ' events) and profiler response ready');

    screenshotCapture.stop();

    // Emit trace events FIRST via Tracing.dataCollected
    if (events.length > 0) {
      log('Profiler', '--- Trace events ---');
      for (var k = 0; k < Math.min(events.length, 20); k++) {
        var e = events[k];
        log('Profiler', '  [' + k + '] name=' + e.name + ' cat=' + e.cat + ' ph=' + e.ph + ' ts=' + e.ts);
      }
      if (events.length > 20) log('Profiler', '  ... and ' + (events.length - 20) + ' more');
      log('Profiler', '--- End ---');

      emitTraceEvents(ws, null, events, 'Tracing', ctx.targetId, ctx, screenshotCapture, pendingTracingStartTs);
    }

    // THEN send the Profiler.stop response
    log('Profiler', 'Sending Profiler.stop response (id=' + pending.id + ')');
    pending.ws.readyState === 1 &&
      pending.ws.send(JSON.stringify({id: pending.id, result: pending.result}));
    pendingRequests.delete(profilerStopPending.reqId);

    // Clean up
    profilerStopPending = null;
    pendingTraceEvents = null;
  }

  return {
    name: 'Profiler',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'trace-data') {
        log('Profiler', 'Received trace-data (' + (message.events || []).length + ' events)');
        pendingTraceEvents = message.events || [];
        pendingTracingStartTs = message.tracingStartTs || 0;
        maybeFinishStop();
      }
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('Profiler', 'Got cdp-response for ' + message.requestId);
          if (profilerStopPending && profilerStopPending.reqId === message.requestId) {
            // Don't send yet — store result and wait for trace data
            pending.result = message.result;
            maybeFinishStop();
          } else {
            // Non-stop responses: send immediately
            pendingRequests.delete(message.requestId);
            pending.ws.readyState === 1 &&
              pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
          }
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Page domain
// ---------------------------------------------------------------------------

function createPageDomain(targetId, getSendToApp) {
  // Screencast state
  var screencastActive = false;
  var screencastWs = null;
  var screencastSessionId = 0;
  var screencastQuality = 80;
  var screencastMaxWidth = 0;
  var captureInFlight = false;
  var sendCDPRef = null;
  var captureTimeout = null;
  var nextScriptId = 1;

  // Device dimensions (populated from first screenshot-data response)
  var devicePixelWidth = 0;
  var devicePixelHeight = 0;
  var deviceScale = 3;

  function captureFrame() {
    if (!screencastActive || !screencastWs || captureInFlight) return;
    captureInFlight = true;
    // Use the module-level sendToApp (always points to current connection)
    var currentSendToApp = getSendToApp();
    if (currentSendToApp) {
      currentSendToApp(JSON.stringify({
        type: 'capture-screenshot',
        maxWidth: screencastMaxWidth || 0,
        quality: (screencastQuality || 80) / 100,
      }));
      // Timeout: if app doesn't respond within 2s (e.g. disconnected/reloading),
      // reset captureInFlight so we can try again
      captureTimeout = setTimeout(function () {
        if (captureInFlight) {
          captureInFlight = false;
          log('Page', 'Screenshot capture timed out — retrying');
          captureFrame();
        }
      }, 2000);
    } else {
      captureInFlight = false;
    }
  }

  function handle(method, params, ctx) {
    sendCDPRef = ctx.sendCDP;
    log('Page', method);
    switch (method) {
      case 'enable':
        // Emit lifecycle events Chrome expects for page targets
        ctx.sendCDP(ctx.ws, {
          method: 'Page.frameNavigated',
          params: {
            frame: {
              id: targetId,
              loaderId: targetId,
              url: 'file://',
              domainAndRegistry: '',
              securityOrigin: 'file://',
              mimeType: 'text/html',
            },
          },
        });
        ctx.sendCDP(ctx.ws, {
          method: 'Page.loadEventFired',
          params: {timestamp: Date.now() / 1000},
        });
        ctx.sendCDP(ctx.ws, {
          method: 'Page.domContentEventFired',
          params: {timestamp: Date.now() / 1000},
        });
        return {};

      case 'getFrameTree':
      case 'getResourceTree':
        return {
          frameTree: {
            frame: {
              id: targetId,
              loaderId: targetId,
              url: 'file://',
              securityOrigin: 'file://',
              mimeType: 'text/html',
            },
            childFrames: [],
            resources: [],
          },
        };

      case 'getNavigationHistory':
        return {
          currentIndex: 0,
          entries: [
            {
              id: 0,
              url: 'file://',
              userTypedURL: 'file://',
              title: 'Falcon',
              transitionType: 'typed',
            },
          ],
        };

      case 'navigate': {
        var navUrl = (params && params.url) || '';
        var loaderId = targetId + '-' + Date.now();

        if (navUrl === 'about:blank') {
          // Chrome sends navigate(about:blank) as the first step of
          // "Start profiling and reload page". It follows this with
          // Page.reload which triggers the actual app reload.
          // We clear the screen here (like navigating to a blank page)
          // but don't trigger a full reload — Page.reload handles that.
          log('Page', 'navigate(about:blank) — clearing screen');
          if (ctx.sendToApp) {
            ctx.sendToApp(JSON.stringify({type: 'clear'}));
          }

          // Acknowledge about:blank navigation immediately
          setTimeout(function () {
            var ts = Date.now() / 1000;
            ctx.sendCDP(ctx.ws, {
              method: 'Page.frameNavigated',
              params: {
                frame: {
                  id: targetId,
                  loaderId: loaderId,
                  url: 'about:blank',
                  domainAndRegistry: '',
                  securityOrigin: '://',
                  mimeType: 'text/html',
                },
              },
            });
            ctx.sendCDP(ctx.ws, {
              method: 'Page.domContentEventFired',
              params: {timestamp: ts},
            });
            ctx.sendCDP(ctx.ws, {
              method: 'Page.loadEventFired',
              params: {timestamp: ts},
            });
            ctx.sendCDP(ctx.ws, {
              method: 'Page.frameStoppedLoading',
              params: {frameId: targetId},
            });
          }, 50);

          return {frameId: targetId, loaderId: loaderId};
        }

        // Fall through: navigate to a real URL triggers reload
        log('Page', 'navigate(' + navUrl + ') — triggering app reload');
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'reload'}));
        }
        ctx.sendCDP(ctx.ws, {
          method: 'Page.frameStartedLoading',
          params: {frameId: targetId},
        });
        setTimeout(function () {
          var ts = Date.now() / 1000;
          ctx.sendCDP(ctx.ws, {
            method: 'Page.frameNavigated',
            params: {
              frame: {
                id: targetId,
                loaderId: loaderId,
                url: 'file://',
                domainAndRegistry: '',
                securityOrigin: 'file://',
                mimeType: 'text/html',
              },
            },
          });
          ctx.sendCDP(ctx.ws, {
            method: 'Page.domContentEventFired',
            params: {timestamp: ts},
          });
          ctx.sendCDP(ctx.ws, {
            method: 'Page.loadEventFired',
            params: {timestamp: ts},
          });
          ctx.sendCDP(ctx.ws, {
            method: 'Page.frameStoppedLoading',
            params: {frameId: targetId},
          });
        }, 500);
        return {frameId: targetId, loaderId: loaderId};
      }

      case 'reload': {
        log('Page', 'reload — triggering app reload');
        var loaderId = targetId + '-' + Date.now();
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'reload'}));
        }
        ctx.sendCDP(ctx.ws, {
          method: 'Page.frameStartedLoading',
          params: {frameId: targetId},
        });
        setTimeout(function () {
          var ts = Date.now() / 1000;
          ctx.sendCDP(ctx.ws, {
            method: 'Page.frameNavigated',
            params: {
              frame: {
                id: targetId,
                loaderId: loaderId,
                url: 'file://',
                domainAndRegistry: '',
                securityOrigin: 'file://',
                mimeType: 'text/html',
              },
            },
          });
          ctx.sendCDP(ctx.ws, {
            method: 'Page.domContentEventFired',
            params: {timestamp: ts},
          });
          ctx.sendCDP(ctx.ws, {
            method: 'Page.loadEventFired',
            params: {timestamp: ts},
          });
          ctx.sendCDP(ctx.ws, {
            method: 'Page.frameStoppedLoading',
            params: {frameId: targetId},
          });
        }, 500);
        return {};
      }

      case 'startScreencast': {
        screencastActive = true;
        screencastWs = ctx.ws;
        screencastSessionId = 0;
        screencastQuality = (params && params.quality) || 80;
        screencastMaxWidth = (params && params.maxWidth) || 0;
        log('Page', 'Screencast started (maxWidth=' + screencastMaxWidth + ', quality=' + screencastQuality + ')');
        captureFrame();
        return {};
      }

      case 'screencastFrameAck': {
        if (screencastActive) {
          captureFrame();
        }
        return {};
      }

      case 'stopScreencast': {
        screencastActive = false;
        screencastWs = null;
        log('Page', 'Screencast stopped');
        return {};
      }

      case 'addScriptToEvaluateOnNewDocument': {
        // DevTools injects scripts (e.g. web-vitals for performance metrics)
        // into isolated worlds. We don't support isolated worlds in JSC, so
        // return a valid identifier without evaluating the script.
        var scriptId = 'injected-' + (nextScriptId++);
        log('Page', 'addScriptToEvaluateOnNewDocument — stub identifier=' + scriptId);
        return {identifier: scriptId};
      }

      case 'removeScriptToEvaluateOnNewDocument':
        return {};

      default:
        return {};
    }
  }

  return {
    name: 'Page',
    handle: handle,
    // Called on dom-updated to push a fresh frame when the tree changes
    onTreeUpdated: function () {
      if (screencastActive) {
        captureFrame();
      }
    },
    // Expose device scale for Input domain coordinate conversion
    getDeviceScale: function () { return deviceScale; },
    // Handle screenshot-data responses from the app
    handleAppMessage: function (message) {
      if (message.type !== 'screenshot-data') return;
      if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
      captureInFlight = false;
      if (!screencastActive || !screencastWs) return;

      // Cache device dimensions from the app
      if (message.width && message.height && message.scale) {
        devicePixelWidth = message.width;
        devicePixelHeight = message.height;
        deviceScale = message.scale;
      }

      var sessionId = screencastSessionId++;
      if (sendCDPRef && screencastWs.readyState === 1) {
        sendCDPRef(screencastWs, {
          method: 'Page.screencastFrame',
          params: {
            data: message.data,
            metadata: {
              offsetTop: 0,
              pageScaleFactor: deviceScale,
              deviceWidth: devicePixelWidth,
              deviceHeight: devicePixelHeight,
              scrollOffsetX: 0,
              scrollOffsetY: 0,
              timestamp: Date.now() / 1000,
            },
            sessionId: sessionId,
          },
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// DOM domain
// ---------------------------------------------------------------------------

function createDOMDomain(broadcastCDP) {
  var pendingRequests = new Map();
  var nextReqId = 0;
  var enabled = false;
  var onDomUpdated = null;

  function forward(method, params, ctx) {
    var reqId = 'dom-' + (nextReqId++);
    log('DOM', 'Forwarding ' + method + ' to app (reqId=' + reqId + ')');
    pendingRequests.set(reqId, {ws: ctx.ws, id: ctx._currentId});
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'DOM',
        method: method,
        params: params,
      }));
    }
    return null; // deferred — response comes via handleAppMessage
  }

  function handle(method, params, ctx) {
    log('DOM', method);
    switch (method) {
      case 'enable':
        enabled = true;
        return {};
      case 'disable':
        enabled = false;
        return {};

      // Forward to app — need shadow tree data
      case 'getDocument':
      case 'getOuterHTML':
      case 'getBoxModel':
      case 'resolveNode':
        return forward(method, params, ctx);

      // Handled by DevTools screencast overlay — no in-simulator highlight
      case 'highlightNode':
      case 'hideHighlight':
      case 'highlightRect':
        return {};

      // Local stubs
      case 'requestChildNodes':
      case 'markUndoableState':
      case 'pushNodesByBackendIdsToFrontend':
        return {};

      case 'setInspectedNode':
        return {};
      case 'querySelector':
        return {nodeId: 0};
      case 'querySelectorAll':
        return {nodeIds: []};

      default:
        return {};
    }
  }

  // Request full body HTML from the app for the /preview page.
  // Uses a callback instead of a CDP WebSocket response.
  function requestPreviewHTML(sendToApp, callback) {
    var reqId = 'dom-' + (nextReqId++);
    log('DOM', 'Requesting preview HTML (reqId=' + reqId + ')');
    if (!sendToApp) {
      callback(null);
      return;
    }
    pendingRequests.set(reqId, {callback: callback});
    sendToApp(JSON.stringify({
      type: 'cdp-request',
      requestId: reqId,
      domain: 'DOM',
      method: 'getPreviewHTML',
      params: {},
    }));
    // Timeout after 5 seconds
    setTimeout(function () {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        callback(null);
      }
    }, 5000);
  }

  return {
    name: 'DOM',
    handle: handle,
    requestPreviewHTML: requestPreviewHTML,
    setOnDomUpdated: function (fn) { onDomUpdated = fn; },
    handleAppMessage: function (message) {
      // Handle cdp-response for forwarded requests
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('DOM', 'Got cdp-response for ' + message.requestId);
          pendingRequests.delete(message.requestId);
          if (pending.callback) {
            pending.callback(message.result);
          } else {
            pending.ws.readyState === 1 &&
              pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
          }
        }
      }
      // Handle live tree updates
      if (message.type === 'dom-updated') {
        if (broadcastCDP) {
          log('DOM', 'Tree updated — broadcasting DOM.documentUpdated');
          broadcastCDP({method: 'DOM.documentUpdated', params: {}});
        }
        if (onDomUpdated) {
          onDomUpdated();
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Log domain
// ---------------------------------------------------------------------------

function createLogDomain() {
  var enabled = false;

  function handle(method, params, ctx) {
    log('Log', method);
    switch (method) {
      case 'enable':
        enabled = true;
        return {};
      case 'disable':
        enabled = false;
        return {};
      case 'clear':
        return {};
      case 'startViolationsReport':
        return {};
      case 'stopViolationsReport':
        return {};
      default:
        return {};
    }
  }

  return {
    name: 'Log',
    handle: handle,
    isEnabled: function () { return enabled; },
  };
}

// ---------------------------------------------------------------------------
// Network domain
// ---------------------------------------------------------------------------

function createNetworkDomain() {
  function handle(method, params, ctx) {
    log('Network', method);
    switch (method) {
      case 'enable':
        return {};
      case 'disable':
        return {};
      case 'setCacheDisabled':
        return {};
      case 'setExtraHTTPHeaders':
        return {};
      default:
        return {};
    }
  }

  return {
    name: 'Network',
    handle: handle,
  };
}

// ---------------------------------------------------------------------------
// Debugger domain
// ---------------------------------------------------------------------------

function createDebuggerDomain(sourceMapResolver) {
  // Map scriptId -> source URL for original source lookups
  var sourceScriptIds = {};

  function handle(method, params, ctx) {
    log('Debugger', method);
    switch (method) {
      case 'enable': {
        // Emit scriptParsed for each bundle file (bundle.js + client chunks)
        var filenames = sourceMapResolver ? sourceMapResolver.getConsumerFilenames() : [];
        for (var f = 0; f < filenames.length; f++) {
          var filename = filenames[f];
          ctx.sendCDP(ctx.ws, {
            method: 'Debugger.scriptParsed',
            params: {
              scriptId: 'bundle-' + f,
              url: 'http://localhost:6000/' + filename,
              startLine: 0,
              startColumn: 0,
              endLine: 999999,
              endColumn: 0,
              executionContextId: 1,
              hash: '',
              sourceMapURL: 'http://localhost:6000/' + filename + '.map',
            },
          });
        }

        // Build a flat index across all source maps and emit scriptParsed
        // for each original source file
        var entries = sourceMapResolver ? sourceMapResolver.buildSourceIndex() : [];
        sourceScriptIds = {};
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          sourceScriptIds[entry.scriptId] = entry.source;
          ctx.sendCDP(ctx.ws, {
            method: 'Debugger.scriptParsed',
            params: {
              scriptId: entry.scriptId,
              url: entry.source,
              startLine: 0,
              startColumn: 0,
              endLine: 999999,
              endColumn: 0,
              executionContextId: 1,
              hash: '',
              sourceMapURL: '',
            },
          });
        }
        log('Debugger', 'Emitted scriptParsed for ' + filenames.length + ' bundles + ' + entries.length + ' original sources');

        return {debuggerId: 'falcon-debugger-1'};
      }
      case 'disable':
        return {};
      case 'getScriptSource': {
        var scriptId = params && params.scriptId;
        // Bundle files: 'bundle-0', 'bundle-1', etc.
        if (scriptId && scriptId.indexOf('bundle-') === 0) {
          var bundleIdx = parseInt(scriptId.slice(7), 10);
          var bundleFilenames = sourceMapResolver ? sourceMapResolver.getConsumerFilenames() : [];
          if (bundleIdx < bundleFilenames.length) {
            try {
              var fs = require('fs');
              var bundlePath = path.resolve(__dirname, '../build/' + bundleFilenames[bundleIdx]);
              var bundleSource = fs.readFileSync(bundlePath, 'utf8');
              return {scriptSource: bundleSource};
            } catch (e) {
              log('Debugger', 'Failed to read ' + bundleFilenames[bundleIdx] + ': ' + e.message);
            }
          }
          return {scriptSource: ''};
        }
        // Original source files: 'source-0', 'source-1', etc.
        if (scriptId && scriptId.indexOf('source-') === 0) {
          var sourcePath = sourceScriptIds[scriptId];
          if (sourcePath && sourceMapResolver) {
            var content = sourceMapResolver.getSourceContent(sourcePath);
            return {scriptSource: content || ''};
          }
        }
        return {scriptSource: ''};
      }
      case 'setPauseOnExceptions':
        return {};
      case 'setAsyncCallStackDepth':
        return {};
      case 'setBlackboxPatterns':
        return {};
      default:
        return {};
    }
  }

  return {
    name: 'Debugger',
    handle: handle,
  };
}

// ---------------------------------------------------------------------------
// Additional domains Chrome expects for type: "page" targets
// ---------------------------------------------------------------------------

function createTargetDomain() {
  function handle(method, params, ctx) {
    log('Target', method);
    switch (method) {
      case 'setAutoAttach':
        return {};
      case 'setDiscoverTargets':
        return {};
      case 'setRemoteLocations':
        return {};
      default:
        return {};
    }
  }
  return {name: 'Target', handle: handle};
}

function createInspectorDomain() {
  function handle(method, params, ctx) {
    log('Inspector', method);
    return {};
  }
  return {name: 'Inspector', handle: handle};
}

function createCSSDomain() {
  var pendingRequests = new Map();
  var nextReqId = 0;

  function forward(method, params, ctx) {
    var reqId = 'css-' + (nextReqId++);
    log('CSS', 'Forwarding ' + method + ' to app (reqId=' + reqId + ')');
    pendingRequests.set(reqId, {ws: ctx.ws, id: ctx._currentId});
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'CSS',
        method: method,
        params: params,
      }));
    }
    return null;
  }

  function handle(method, params, ctx) {
    log('CSS', method);
    switch (method) {
      case 'enable':
      case 'disable':
        return {};

      // Forward to app — need style data
      case 'getComputedStyleForNode':
      case 'getInlineStylesForNode':
      case 'getMatchedStylesForNode':
        return forward(method, params, ctx);

      // Local stubs
      case 'getMediaQueries':
        return {medias: []};
      case 'getStyleSheetText':
        return {text: ''};
      case 'getPlatformFontsForNode':
        return {fonts: []};
      default:
        return {};
    }
  }

  return {
    name: 'CSS',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('CSS', 'Got cdp-response for ' + message.requestId);
          pendingRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
    },
  };
}

function createOverlayDomain() {
  var pendingRequests = new Map();
  var nextReqId = 0;

  function forward(method, params, ctx) {
    var reqId = 'overlay-' + (nextReqId++);
    log('Overlay', 'Forwarding ' + method + ' to app (reqId=' + reqId + ')');
    pendingRequests.set(reqId, {ws: ctx.ws, id: ctx._currentId});
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'DOM',
        method: method,
        params: params,
      }));
    }
    return null;
  }

  function handle(method, params, ctx) {
    log('Overlay', method + ' params=' + JSON.stringify(params).slice(0, 300));
    switch (method) {
      // Handled by DevTools screencast overlay — no in-simulator highlight
      case 'highlightNode':
      case 'hideHighlight':
        return {};
      default:
        return {};
    }
  }
  return {
    name: 'Overlay',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('Overlay', 'Got cdp-response for ' + message.requestId);
          pendingRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
    },
  };
}

function createEmulationDomain() {
  function handle(method, params, ctx) {
    log('Emulation', method);
    return {};
  }
  return {name: 'Emulation', handle: handle};
}

// ---------------------------------------------------------------------------
// Input domain — forwards mouse events from DevTools screencast to the app
// ---------------------------------------------------------------------------
function createInputDomain(pageDomain) {
  function handle(method, params, ctx) {
    log('Input', method + ' ' + JSON.stringify(params));
    switch (method) {
      case 'dispatchMouseEvent': {
        // Only dispatch on mousePressed (not mouseMoved, mouseReleased)
        if (params.type !== 'mousePressed') {
          return {};
        }
        // DevTools sends coordinates in device pixels (physical pixels).
        // Divide by deviceScale to get UIKit logical points.
        var scale = pageDomain.getDeviceScale() || 3;
        var x = params.x / scale;
        var y = params.y / scale;
        log('Input', 'Dispatching tap at (' + x + ', ' + y + ') logical points (raw: ' + params.x + ', ' + params.y + ', scale: ' + scale + ')');
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({
            type: 'dispatch-touch',
            x: x,
            y: y,
          }));
        }
        return {};
      }

      case 'dispatchTouchEvent':
      case 'dispatchKeyEvent':
      case 'emulateTouchFromMouseEvent':
        return {};

      default:
        return {};
    }
  }
  return {name: 'Input', handle: handle};
}

function createHeapProfilerDomain() {
  function handle(method, params, ctx) {
    log('HeapProfiler', method);
    return {};
  }
  return {name: 'HeapProfiler', handle: handle};
}

function createServiceWorkerDomain() {
  function handle(method, params, ctx) {
    log('ServiceWorker', method);
    return {};
  }
  return {name: 'ServiceWorker', handle: handle};
}

function createStorageDomain() {
  function handle(method, params, ctx) {
    log('Storage', method);
    return {};
  }
  return {name: 'Storage', handle: handle};
}

function createDatabaseDomain() {
  function handle(method, params, ctx) {
    log('Database', method);
    return {};
  }
  return {name: 'Database', handle: handle};
}

function createIndexedDBDomain() {
  function handle(method, params, ctx) {
    log('IndexedDB', method);
    return {};
  }
  return {name: 'IndexedDB', handle: handle};
}

function createCacheStorageDomain() {
  function handle(method, params, ctx) {
    log('CacheStorage', method);
    return {};
  }
  return {name: 'CacheStorage', handle: handle};
}

function createDOMStorageDomain() {
  function handle(method, params, ctx) {
    log('DOMStorage', method);
    return {};
  }
  return {name: 'DOMStorage', handle: handle};
}

function createSecurityDomain() {
  function handle(method, params, ctx) {
    log('Security', method);
    return {};
  }
  return {name: 'Security', handle: handle};
}

function createAuditsDomain() {
  function handle(method, params, ctx) {
    log('Audits', method);
    return {};
  }
  return {name: 'Audits', handle: handle};
}

function createPerformanceDomain() {
  function handle(method, params, ctx) {
    log('Performance', method);
    switch (method) {
      case 'getMetrics':
        return {metrics: []};
      default:
        return {};
    }
  }
  return {name: 'Performance', handle: handle};
}

function createFalconAppDomain() {
  function handle(method, params, ctx) {
    log('FalconApp', method, params);
    switch (method) {
      case 'navigate': {
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({
            type: 'navigate-fixture',
            fixture: params.fixture || '',
            variant: params.variant || 'hydrated',
          }));
        }
        return {};
      }
      default:
        return {};
    }
  }
  return {name: 'FalconApp', handle: handle};
}

// ---------------------------------------------------------------------------
// createTarget — per-app domain handlers and CDP client tracking
// ---------------------------------------------------------------------------

function createTarget(targetId, sourceMapResolver) {
  var cdpClients = new Set();
  var sendToApp = null;

  // -----------------------------------------------------------------------
  // Screenshot capture during performance tracing
  //
  // While tracing is active, periodically captures screenshots from the app
  // and buffers them. When trace data arrives, the screenshots are converted
  // to Chrome Trace Format events and merged into the trace output.
  // -----------------------------------------------------------------------
  var screenshotBuffer = []; // [{data, ts}]
  var isCapturingScreenshots = false;

  var screenshotCapture = {
    start: function () {
      isCapturingScreenshots = true;
      screenshotBuffer = [];
      // Capture a baseline frame at trace start
      captureOneScreenshot();
      // Tell the app to capture a screenshot after every commit.
      // This avoids the round-trip delay that causes missed intermediate frames.
      if (sendToApp) {
        sendToApp(JSON.stringify({
          type: 'enable-commit-screenshots',
          maxWidth: 300,
          quality: 0.4,
        }));
      }
      log('Screenshots', 'Started capture for tracing');
    },
    stop: function () {
      isCapturingScreenshots = false;
      if (sendToApp) {
        sendToApp(JSON.stringify({ type: 'disable-commit-screenshots' }));
      }
      log('Screenshots', 'Stopped capture (' + screenshotBuffer.length + ' frames buffered)');
    },
    // Convert buffered screenshots to trace events. All screenshots include
    // an app-side performanceNow timestamp (µs) in the same clock domain as
    // trace events.
    getEvents: function () {
      var events = [];
      for (var i = 0; i < screenshotBuffer.length; i++) {
        var s = screenshotBuffer[i];
        events.push({
          name: 'Screenshot',
          cat: 'disabled-by-default-devtools.screenshot',
          ph: 'O',
          id: '0x1',
          ts: s.ts,
          pid: 0, // Browser process — DevTools shows filmstrip from browser pid
          tid: 0,
          args: {snapshot: s.data},
        });
      }
      screenshotBuffer = [];
      return events;
    },
    handleScreenshotData: function (message) {
      if (isCapturingScreenshots && message.type === 'screenshot-data') {
        var lastFrame = screenshotBuffer.length > 0
          ? screenshotBuffer[screenshotBuffer.length - 1]
          : null;
        if (!lastFrame || lastFrame.data !== message.data) {
          screenshotBuffer.push({
            data: message.data,
            ts: message.ts,
          });
          log('Screenshots', 'Buffered frame #' + screenshotBuffer.length);
        } else {
          log('Screenshots', 'Skipped duplicate frame');
        }
      }
    },
  };

  function captureOneScreenshot() {
    if (sendToApp) {
      sendToApp(JSON.stringify({
        type: 'capture-screenshot',
        maxWidth: 300,
        quality: 0.4,
      }));
    }
  }

  function sendCDP(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcastCDP(msg) {
    for (var client of cdpClients) {
      sendCDP(client, msg);
    }
  }

  var tracingDomain = createTracingDomain(targetId, screenshotCapture);
  var nodeTracingDomain = createNodeTracingDomain(targetId, screenshotCapture);
  var runtimeDomain = createRuntimeDomain(sourceMapResolver);
  var profilerDomain = createProfilerDomain(screenshotCapture);
  var pageDomain = createPageDomain(targetId, function () { return sendToApp; });
  var domDomain = createDOMDomain(function(msg) { broadcastCDP(msg); });
  var logDomain = createLogDomain();
  var networkDomain = createNetworkDomain();
  var debuggerDomain = createDebuggerDomain(sourceMapResolver);
  var cssDomain = createCSSDomain();
  var overlayDomain = createOverlayDomain();

  var router = createDomainRouter([
    tracingDomain,
    nodeTracingDomain,
    runtimeDomain,
    profilerDomain,
    pageDomain,
    domDomain,
    logDomain,
    networkDomain,
    debuggerDomain,
    createTargetDomain(),
    createInspectorDomain(),
    cssDomain,
    overlayDomain,
    createInputDomain(pageDomain),
    createEmulationDomain(),
    createHeapProfilerDomain(),
    createServiceWorkerDomain(),
    createStorageDomain(),
    createDatabaseDomain(),
    createIndexedDBDomain(),
    createCacheStorageDomain(),
    createDOMStorageDomain(),
    createSecurityDomain(),
    createAuditsDomain(),
    createPerformanceDomain(),
    createFalconAppDomain(),
  ]);

  return {
    cdpClients: cdpClients,
    router: router,
    pageDomain: pageDomain,
    domDomain: domDomain,
    tracingDomain: tracingDomain,
    nodeTracingDomain: nodeTracingDomain,
    runtimeDomain: runtimeDomain,
    profilerDomain: profilerDomain,
    logDomain: logDomain,
    cssDomain: cssDomain,
    overlayDomain: overlayDomain,
    sendCDP: sendCDP,
    broadcastCDP: broadcastCDP,

    setSendToApp: function (fn) {
      sendToApp = fn;
      // Re-enable commit screenshots if profiling is active and app reconnected
      if (fn && isCapturingScreenshots) {
        // Discard pre-reload screenshots — they show the old app state
        screenshotBuffer = [];
        captureOneScreenshot();
        fn(JSON.stringify({
          type: 'enable-commit-screenshots',
          maxWidth: 300,
          quality: 0.4,
        }));
      }
    },
    getSendToApp: function () { return sendToApp; },
    // No-op: screenshots are now captured on the Swift side during each commit.
    // Kept for API compatibility with setOnDomUpdated callback.
    captureTraceScreenshot: function () {},

    handleAppMessage: function (data) {
      var message;
      try { message = JSON.parse(data); } catch (e) { return; }

      log('App', '← ' + (message.type || 'unknown'), message.type === 'console-message' ? (message.args || []).map(function(a) { return a.value || a.type; }).join(' ') : undefined);

      // Buffer screenshot-data for tracing (before pageDomain consumes it for screencast)
      screenshotCapture.handleScreenshotData(message);

      tracingDomain.handleAppMessage(message);
      nodeTracingDomain.handleAppMessage(message);
      if (runtimeDomain.handleAppMessage) runtimeDomain.handleAppMessage(message);
      if (profilerDomain.handleAppMessage) profilerDomain.handleAppMessage(message);
      if (domDomain.handleAppMessage) domDomain.handleAppMessage(message);
      if (cssDomain.handleAppMessage) cssDomain.handleAppMessage(message);
      if (overlayDomain.handleAppMessage) overlayDomain.handleAppMessage(message);
      if (pageDomain.handleAppMessage) pageDomain.handleAppMessage(message);

      if (message.type === 'cdp-event') {
        log('App', 'Broadcasting cdp-event: ' + message.method);
        var params = message.params;
        if (message.method === 'Runtime.exceptionThrown' && params && params.exceptionDetails) {
          params = Object.assign({}, params, {
            exceptionDetails: sourceMapResolver.resolveExceptionDetails(params.exceptionDetails),
          });
        }
        broadcastCDP({ method: message.method, params: params });
      }

      if (message.type === 'console-message') {
        broadcastCDP({
          method: 'Runtime.consoleAPICalled',
          params: {
            type: message.cdpType || 'log',
            args: message.args || [],
            executionContextId: 1,
            timestamp: message.timestamp || Date.now(),
            stackTrace: sourceMapResolver.resolveStackTrace(message.stackTrace || {callFrames: []}),
          },
        });
        if (message.cdpType === 'error' && logDomain.isEnabled()) {
          broadcastCDP({
            method: 'Log.entryAdded',
            params: {
              entry: {
                source: 'javascript',
                level: 'error',
                text: (message.args || []).map(function (a) { return a.value || a.description || ''; }).join(' '),
                timestamp: message.timestamp || Date.now(),
                stackTrace: sourceMapResolver.resolveStackTrace(message.stackTrace || {callFrames: []}),
              },
            },
          });
        }
      }
    },

    handleCDPMessage: function (ws, message) {
      var ctx = {
        sendToApp: sendToApp,
        sendCDP: sendCDP,
        broadcastCDP: broadcastCDP,
        targetId: targetId,
        cdpClients: cdpClients,
        _currentId: message.id,
      };
      router.route(ws, message, ctx);
    },

    close: function () {
      for (var client of cdpClients) { client.close(); }
      cdpClients.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// createInspectorProxy — multi-target
// ---------------------------------------------------------------------------

function createInspectorProxy(options) {
  var cdpPort = (options && options.port) || DEFAULT_CDP_PORT;

  // Source map resolver (shared across targets)
  var BUILD_DIR = path.resolve(__dirname, '../build');
  var sourceMapResolver = new SourceMapResolver(BUILD_DIR);
  sourceMapResolver.loadAll().then(function () {
    sourceMapResolver.watchForChanges();
  });

  // Connected targets: targetId -> { target, info }
  var targets = new Map();

  // SSE preview clients (shared — preview shows first target's DOM)
  var previewClients = new Set();

  // Callback for tracing state changes
  var onTracingStateChange = null;

  function deriveTargetId(connectInfo) {
    if (connectInfo.simulatorUDID) {
      return 'falcon-' + connectInfo.simulatorUDID;
    }
    // Sanitize device name for URL path
    return 'falcon-' + (connectInfo.deviceName || 'unknown')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  function addTarget(connectInfo, sendToAppFn) {
    var targetId = deriveTargetId(connectInfo);

    // If target already exists (reconnect after reload), reuse it so
    // Chrome DevTools CDP connections stay alive
    if (targets.has(targetId)) {
      var existing = targets.get(targetId);
      existing.target.setSendToApp(sendToAppFn);
      existing.info = connectInfo;

      // Notify CDP clients that the JS context was restarted
      existing.target.broadcastCDP({
        method: 'Runtime.executionContextsCleared',
        params: {},
      });
      existing.target.broadcastCDP({
        method: 'Runtime.executionContextCreated',
        params: {
          context: {
            id: 1,
            origin: '',
            name: 'Falcon JSC',
          },
        },
      });

      logAlways('Proxy', 'Target reconnected: ' + targetId + ' (' +
        connectInfo.appName + ' — ' + connectInfo.deviceName +
        ', ' + existing.target.cdpClients.size + ' CDP client(s) preserved)');

      return targetId;
    }

    var target = createTarget(targetId, sourceMapResolver);
    target.setSendToApp(sendToAppFn);

    // Wire up preview SSE for this target's DOM updates
    target.domDomain.setOnDomUpdated(function () {
      for (var client of previewClients) {
        client.write('data: refresh\n\n');
      }
      target.pageDomain.onTreeUpdated();
      target.captureTraceScreenshot();
    });

    targets.set(targetId, {
      target: target,
      info: connectInfo,
    });

    logAlways('Proxy', 'Target added: ' + targetId + ' (' +
      connectInfo.appName + ' — ' + connectInfo.deviceName + ')');

    return targetId;
  }

  function disconnectTarget(targetId) {
    var entry = targets.get(targetId);
    if (entry) {
      // Null out sendToApp but keep target and CDP clients alive
      entry.target.setSendToApp(null);
      logAlways('Proxy', 'Target disconnected (kept alive): ' + targetId +
        ' (' + entry.target.cdpClients.size + ' CDP client(s))');
    }
  }

  function removeTarget(targetId) {
    var entry = targets.get(targetId);
    if (entry) {
      entry.target.close();
      targets.delete(targetId);
      logAlways('Proxy', 'Target removed: ' + targetId);
    }
  }

  // Helper: get the first target (for preview endpoints)
  function getFirstTarget() {
    for (var [, entry] of targets) {
      return entry;
    }
    return null;
  }

  var proxy = {
    port: cdpPort,
    targets: targets,
    previewClients: previewClients,
    addTarget: addTarget,
    disconnectTarget: disconnectTarget,
    removeTarget: removeTarget,
    getFirstTarget: getFirstTarget,
    handleAppMessage: function (targetId, data) {
      var entry = targets.get(targetId);
      if (entry) {
        entry.target.handleAppMessage(data);
      }
    },
    set onTracingStateChange(fn) { onTracingStateChange = fn; },
    close: function () {
      for (var [, entry] of targets) { entry.target.close(); }
      targets.clear();
    },
  };

  return proxy;
}

// ---------------------------------------------------------------------------
// mountInspectorRoutes — mounts CDP discovery HTTP routes on an Express app
// ---------------------------------------------------------------------------

function mountInspectorRoutes(app, proxy) {
  function sendJSON(res, data) {
    res.json(data);
  }

  app.get('/json/version', function (req, res) {
    log('HTTP', 'GET /json/version');
    sendJSON(res, {
      Browser: 'React DOM Native',
      'Protocol-Version': '1.1',
    });
  });

  app.get('/json/list', function (req, res) {
    log('HTTP', 'GET /json/list');
    sendJSON(res, buildTargetList(proxy));
  });

  app.get('/json', function (req, res) {
    log('HTTP', 'GET /json');
    sendJSON(res, buildTargetList(proxy));
  });

  app.get('/debug/verbose', function (req, res) {
    verboseLogging = !verboseLogging;
    logAlways('Debug', 'Verbose logging ' + (verboseLogging ? 'ENABLED' : 'DISABLED'));
    sendJSON(res, {verbose: verboseLogging});
  });

  app.get('/debug/status', function (req, res) {
    sendJSON(res, {verbose: verboseLogging});
  });

  app.get('/preview/events', function (req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('data: connected\n\n');
    proxy.previewClients.add(res);
    req.on('close', function () { proxy.previewClients.delete(res); });
    setTimeout(function () {
      if (proxy.previewClients.has(res)) {
        res.write('data: refresh\n\n');
      }
    }, 300);
  });

  app.get('/preview/html', function (req, res) {
    var first = proxy.getFirstTarget();
    if (first) {
      first.target.domDomain.requestPreviewHTML(first.target.getSendToApp(), function (result) {
        var bodyHTML = (result && result.html) || '';
        res.set('Content-Type', 'text/html; charset=UTF-8');
        res.set('Cache-Control', 'no-cache');
        res.send(bodyHTML);
      });
    } else {
      res.set('Content-Type', 'text/html; charset=UTF-8');
      res.set('Cache-Control', 'no-cache');
      res.send('');
    }
  });

  app.get('/preview', function (req, res) {
    var page = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>Falcon Preview</title>',
      '  <style>',
      '    * { box-sizing: border-box; }',
      '    body { margin: 0; font-family: -apple-system, system-ui, sans-serif; }',
      '    #preview-root { min-height: 100vh; }',
      '    #preview-waiting { color: #888; padding: 20px; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div id="preview-root">',
      '    <p id="preview-waiting">Waiting for app\u2026</p>',
      '  </div>',
      '  <script>',
      '    var root = document.getElementById("preview-root");',
      '    function refresh() {',
      '      fetch("/preview/html").then(function(r) { return r.text(); }).then(function(html) {',
      '        if (html) root.innerHTML = html;',
      '      });',
      '    }',
      '    var es = new EventSource("/preview/events");',
      '    es.onmessage = function(e) {',
      '      if (e.data === "refresh") refresh();',
      '    };',
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n');
    res.set('Content-Type', 'text/html; charset=UTF-8');
    res.set('Cache-Control', 'no-cache');
    res.send(page);
  });
}

function buildTargetList(proxy) {
  var pages = [];
  for (var [id, entry] of proxy.targets) {
    var info = entry.info;
    var cdpPort = proxy.port;
    var devtoolsUrl = 'chrome-devtools://devtools/bundled/devtools_app.html?experiments=true&ws=127.0.0.1:' +
      cdpPort + '/__cdp/' + id;
    pages.push({
      description: (info.deviceModel || 'iOS') + (info.platform === 'iOS Simulator' ? ' Simulator' : ''),
      devtoolsFrontendUrl: devtoolsUrl,
      devtoolsFrontendUrlCompat: devtoolsUrl,
      faviconUrl: 'https://reactnative.dev/img/favicon.ico',
      id: id,
      title: (info.appName || 'Falcon') + ' — ' + (info.deviceName || 'Unknown') + ' (' + (info.deviceModel || 'iOS') + ')',
      type: 'page',
      url: (info.deviceModel || 'iOS') + (info.platform === 'iOS Simulator' ? ' (Simulator)' : ''),
      webSocketDebuggerUrl: 'ws://127.0.0.1:' + cdpPort + '/__cdp/' + id,
    });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// createCDPUpgradeHandler — returns a function for handling WS upgrades
// for CDP connections (path: /__cdp/<targetId>)
// ---------------------------------------------------------------------------

function createCDPUpgradeHandler(proxy) {
  return function handleCDPUpgrade(ws, req) {
    // Extract target ID from URL path (e.g. /__cdp/falcon-61F83D8B-...)
    var urlPath = req.url || '/';
    var cdpPrefix = '/__cdp/';
    var requestedTargetId;
    if (urlPath.startsWith(cdpPrefix)) {
      requestedTargetId = urlPath.slice(cdpPrefix.length);
    } else {
      // Fallback: strip leading /
      requestedTargetId = urlPath.slice(1);
    }

    var entry = proxy.targets.get(requestedTargetId);
    if (!entry) {
      log('WS', 'No target found for: ' + requestedTargetId);
      ws.close(1008, 'Target not found');
      return;
    }

    var target = entry.target;
    target.cdpClients.add(ws);
    logAlways('WS', 'Chrome DevTools connected to ' + requestedTargetId +
      ' (total clients: ' + target.cdpClients.size + ')');

    ws.on('message', function onMessage(data) {
      var message;
      try { message = JSON.parse(data.toString()); } catch (e) { return; }
      target.handleCDPMessage(ws, message);
    });

    ws.on('close', function onClose() {
      target.cdpClients.delete(ws);
      logAlways('WS', 'Chrome DevTools disconnected from ' + requestedTargetId);
    });

    ws.on('error', function onError(err) {
      log('WS', 'WebSocket error: ' + err.message);
      target.cdpClients.delete(ws);
    });
  };
}

module.exports = {createInspectorProxy, mountInspectorRoutes, createCDPUpgradeHandler, DEFAULT_CDP_PORT};
