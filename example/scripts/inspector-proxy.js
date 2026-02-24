'use strict';

// ---------------------------------------------------------------------------
// CDP Inspector Proxy
//
// Minimal Chrome DevTools Protocol (CDP) server that enables the Performance
// panel in Chrome DevTools to record traces from the native app.
//
// Architecture:
//   Chrome DevTools <--CDP WebSocket (9222)--> This proxy (Node.js)
//                                               | messages via WS (8082)
//                                          App (JSC on iOS Simulator)
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

const http = require('http');
const {WebSocketServer} = require('ws');

const DEFAULT_CDP_PORT = 9222;
const CHUNK_SIZE = 1000; // Events per Tracing.dataCollected message (matches RN)

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------
function log(tag, msg, data) {
  var ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    var str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length > 200) str = str.slice(0, 200) + '...';
    console.log('[' + ts + '] [' + tag + '] ' + msg + ' ' + str);
  } else {
    console.log('[' + ts + '] [' + tag + '] ' + msg);
  }
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

function createTracingDomain(targetId) {
  var pendingTraceResolve = null;

  function handle(method, params, ctx) {
    switch (method) {
      case 'start': {
        log('Tracing', 'start — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
        }
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
              resolve([]);
            }
          }, 5000);
        });

        tracePromise.then(function (events) {
          log('Tracing', 'Got ' + events.length + ' events from app, emitting');
          log('Tracing', '--- Trace events from app ---');
          for (var k = 0; k < events.length; k++) {
            var e = events[k];
            log('Tracing', '  [' + k + '] name=' + e.name + ' cat=' + e.cat + ' ph=' + e.ph + ' ts=' + e.ts + ' pid=' + e.pid + ' tid=' + e.tid + (e.id2 ? ' id2=' + JSON.stringify(e.id2) : ''));
          }
          log('Tracing', '--- End trace events ---');
          emitTraceEvents(ws, id, events, 'Tracing', targetId, ctx);
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
          resolve(message.events || []);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// NodeTracing domain (alias for Tracing, used by some DevTools versions)
// ---------------------------------------------------------------------------

function createNodeTracingDomain(targetId) {
  var pendingTraceResolve = null;

  function handle(method, params, ctx) {
    switch (method) {
      case 'start': {
        log('NodeTracing', 'start — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
        }
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
              resolve([]);
            }
          }, 5000);
        });

        tracePromise.then(function (events) {
          log('NodeTracing', 'Got ' + events.length + ' events from app, emitting');
          log('NodeTracing', '--- Trace events from app ---');
          for (var k = 0; k < events.length; k++) {
            var e = events[k];
            log('NodeTracing', '  [' + k + '] name=' + e.name + ' cat=' + e.cat + ' ph=' + e.ph + ' ts=' + e.ts + ' pid=' + e.pid + ' tid=' + e.tid + (e.id2 ? ' id2=' + JSON.stringify(e.id2) : ''));
          }
          log('NodeTracing', '--- End trace events ---');
          emitTraceEvents(ws, id, events, 'NodeTracing', targetId, ctx);
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
          resolve(message.events || []);
        }
      }
    },
  };
}

// Shared trace event emission logic
function emitTraceEvents(ws, id, events, domainPrefix, targetId, ctx) {
  // Chrome DevTools Performance panel needs metadata events to associate
  // trace data with the correct process. React Native uses
  // TracingStartedInPage (not TracingStartedInBrowser) since the trace
  // comes from a single JS runtime, not a full browser.
  var pid = 1; // Must match tracer's _pid
  var tid = 1; // Must match tracer's _tid

  // Find the earliest and latest timestamps to set the timeline range
  // via a RunTask event. Skip metadata events (ph:'M') and zero-ts events.
  // Note: SSR events may have negative timestamps (SSR occurs before JS
  // loads, so timestamps relative to performance.timeOrigin are negative).
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
  log(domainPrefix, 'Timeline range: minTs=' + minTs + ' maxTs=' + maxTs + ' ssrEvents=' + ssrEventCount);

  var infraEvents = [
    // SetLayerTreeId — establishes the rendering context (matches RN)
    {
      name: 'SetLayerTreeId',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      ts: minTs - 3,
      pid: pid,
      tid: tid,
      s: 't',
      args: {data: {frame: '', layerTreeId: 1}},
    },
    // TracingStartedInPage — tells DevTools this is a page-level trace
    // (matches React Native's TracingAgent, not TracingStartedInBrowser)
    {
      name: 'TracingStartedInPage',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      ts: minTs - 2,
      pid: pid,
      tid: tid,
      s: 't',
      args: {data: {}},
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

function createRuntimeDomain() {
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
          log('Runtime', 'WARNING: sendToApp is null!');
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
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Profiler domain — forwarded to in-app handler for correct timestamps
// ---------------------------------------------------------------------------

function createProfilerDomain() {
  var pendingRequests = new Map();
  var nextReqId = 0;
  var pendingTraceEvents = null; // Store trace events until Profiler.stop response
  var profilerStopPending = null; // {ws, id, ctx} for delayed Profiler.stop response

  function handle(method, params, ctx) {
    if (method === 'start') {
      // Also start tracing — Chrome doesn't send Tracing.start for node targets
      log('Profiler', 'start — also starting tracing');
      if (ctx.sendToApp) {
        ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
      }
      // Forward Profiler.start to app for timestamps
      var reqId = 'profiler-' + (nextReqId++);
      log('Profiler', 'Forwarding start to app (reqId=' + reqId + ')');
      pendingRequests.set(reqId, {ws: ctx.ws, id: ctx.messageId});
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'Profiler',
        method: 'start',
        params: params || {},
      }));
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
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'Profiler',
        method: 'stop',
        params: params || {},
      }));

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

    // Emit trace events FIRST via Tracing.dataCollected
    if (events.length > 0) {
      log('Profiler', '--- Trace events ---');
      for (var k = 0; k < Math.min(events.length, 20); k++) {
        var e = events[k];
        log('Profiler', '  [' + k + '] name=' + e.name + ' cat=' + e.cat + ' ph=' + e.ph + ' ts=' + e.ts);
      }
      if (events.length > 20) log('Profiler', '  ... and ' + (events.length - 20) + ' more');
      log('Profiler', '--- End ---');

      emitTraceEvents(ws, null, events, 'Tracing', ctx.targetId, ctx);
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

function createPageDomain(targetId) {
  function handle(method, params, ctx) {
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
          // Chrome sends navigate(about:blank) as its "Reload and Profile"
          // trigger. We need to:
          //   1. Immediately acknowledge about:blank (so Chrome doesn't fail)
          //   2. Trigger the actual app reload
          //   3. After reload completes, emit file:// lifecycle events
          log('Page', 'navigate(about:blank) — acknowledging + triggering reload');
          var reloadLoaderId = targetId + '-reload-' + Date.now();

          // 1. Quickly acknowledge about:blank navigation
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

          // 2. Trigger actual app reload (slightly after about:blank ack)
          setTimeout(function () {
            if (ctx.sendToApp) {
              ctx.sendToApp(JSON.stringify({type: 'reload'}));
            }
          }, 100);

          // 3. After reload completes, emit real page lifecycle events
          setTimeout(function () {
            var ts = Date.now() / 1000;
            ctx.sendCDP(ctx.ws, {
              method: 'Page.frameNavigated',
              params: {
                frame: {
                  id: targetId,
                  loaderId: reloadLoaderId,
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
          }, 1500);

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

      default:
        return {};
    }
  }

  return {
    name: 'Page',
    handle: handle,
  };
}

// ---------------------------------------------------------------------------
// DOM domain
// ---------------------------------------------------------------------------

function createDOMDomain(broadcastCDP) {
  var pendingRequests = new Map();
  var nextReqId = 0;
  var enabled = false;

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
      case 'highlightNode':
      case 'hideHighlight':
      case 'resolveNode':
        return forward(method, params, ctx);

      // Local stubs
      case 'requestChildNodes':
      case 'markUndoableState':
      case 'pushNodesByBackendIdsToFrontend':
        return {};

      // Forward to app — triggers highlight
      case 'setInspectedNode':
        return forward(method, params, ctx);
      case 'highlightRect':
        return forward('highlightNode', params, ctx);
      case 'querySelector':
        return {nodeId: 0};
      case 'querySelectorAll':
        return {nodeIds: []};

      default:
        return {};
    }
  }

  return {
    name: 'DOM',
    handle: handle,
    handleAppMessage: function (message) {
      // Handle cdp-response for forwarded requests
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('DOM', 'Got cdp-response for ' + message.requestId);
          pendingRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
      // Handle live tree updates
      if (message.type === 'dom-updated' && broadcastCDP) {
        log('DOM', 'Tree updated — broadcasting DOM.documentUpdated');
        broadcastCDP({method: 'DOM.documentUpdated', params: {}});
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

function createDebuggerDomain() {
  function handle(method, params, ctx) {
    log('Debugger', method);
    switch (method) {
      case 'enable':
        ctx.sendCDP(ctx.ws, {
          method: 'Debugger.scriptParsed',
          params: {
            scriptId: '1',
            url: 'http://localhost:6000/bundle.js',
            startLine: 0,
            startColumn: 0,
            endLine: 999999,
            endColumn: 0,
            executionContextId: 1,
            hash: '',
          },
        });
        return {debuggerId: 'falcon-debugger-1'};
      case 'disable':
        return {};
      case 'getScriptSource':
        return {scriptSource: ''};
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
      case 'highlightNode':
        return forward('highlightNode', params, ctx);
      case 'hideHighlight':
        return forward('hideHighlight', params, ctx);
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

// ---------------------------------------------------------------------------
// createInspectorProxy
// ---------------------------------------------------------------------------

function createInspectorProxy(options) {
  const cdpPort = (options && options.port) || DEFAULT_CDP_PORT;
  const targetId = 'falcon-' + Math.random().toString(36).slice(2, 10);
  var devtoolsFrontendUrl =
    'chrome-devtools://devtools/bundled/devtools_app.html?experiments=true&ws=127.0.0.1:' +
    cdpPort +
    '/' +
    targetId;

  // sendToApp — injected by the dev server to forward messages to the app
  let sendToApp = null;

  // CDP WebSocket clients
  const cdpClients = new Set();

  function sendCDP(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcastCDP(msg) {
    for (const client of cdpClients) {
      sendCDP(client, msg);
    }
  }

  // -----------------------------------------------------------------------
  // Create domain handlers
  // -----------------------------------------------------------------------
  var tracingDomain = createTracingDomain(targetId);
  var nodeTracingDomain = createNodeTracingDomain(targetId);
  var runtimeDomain = createRuntimeDomain();
  var profilerDomain = createProfilerDomain();
  var pageDomain = createPageDomain(targetId);
  var domDomain = createDOMDomain(function(msg) { broadcastCDP(msg); });
  var logDomain = createLogDomain();
  var networkDomain = createNetworkDomain();
  var debuggerDomain = createDebuggerDomain();
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
  ]);

  // -----------------------------------------------------------------------
  // HTTP server for CDP discovery endpoints
  // -----------------------------------------------------------------------

  // Chrome DevTools requires Content-Length header for discovery.
  // Match React Native's InspectorProxy response format exactly.
  function sendJSON(res, data) {
    var body = JSON.stringify(data);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-cache',
      'Content-Length': Buffer.byteLength(body),
      'Connection': 'close',
    });
    res.end(body);
  }

  const httpServer = http.createServer(function (req, res) {
    const url = req.url;
    log('HTTP', req.method + ' ' + url);

    if (url === '/json/version') {
      sendJSON(res, {
        Browser: 'Mobile JavaScript',
        'Protocol-Version': '1.1',
      });
      return;
    }

    if (url === '/json' || url === '/json/list') {
      sendJSON(res, [
        {
          description: 'Falcon JSC',
          devtoolsFrontendUrl: devtoolsFrontendUrl,
          devtoolsFrontendUrlCompat: devtoolsFrontendUrl,
          faviconUrl: 'https://reactnative.dev/img/favicon.ico',
          id: targetId,
          title: 'Falcon — react-dom-native',
          type: 'page',
          url: 'file://',
          webSocketDebuggerUrl: 'ws://127.0.0.1:' + cdpPort + '/' + targetId,
        },
      ]);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // -----------------------------------------------------------------------
  // CDP WebSocket server
  // -----------------------------------------------------------------------
  const wss = new WebSocketServer({server: httpServer});

  wss.on('connection', function onConnection(ws) {
    cdpClients.add(ws);
    log('WS', 'Chrome DevTools connected (total clients: ' + cdpClients.size + ')');

    ws.on('message', function onMessage(data) {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (e) {
        log('WS', 'Failed to parse message: ' + data.toString().slice(0, 100));
        return;
      }

      handleCDPMessage(ws, message);
    });

    ws.on('close', function onClose() {
      cdpClients.delete(ws);
      log('WS', 'Chrome DevTools disconnected (remaining: ' + cdpClients.size + ')');
    });

    ws.on('error', function onError(err) {
      log('WS', 'WebSocket error: ' + err.message);
      cdpClients.delete(ws);
    });
  });

  // -----------------------------------------------------------------------
  // CDP message handling — delegated to domain router
  // -----------------------------------------------------------------------
  function handleCDPMessage(ws, message) {
    var ctx = {
      sendToApp: sendToApp,
      sendCDP: sendCDP,
      broadcastCDP: broadcastCDP,
      targetId: targetId,
      cdpClients: cdpClients,
      _currentId: message.id,
    };
    router.route(ws, message, ctx);
  }

  // -----------------------------------------------------------------------
  // App -> proxy: receive messages from the app
  // -----------------------------------------------------------------------
  function handleAppMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      log('App', 'Failed to parse app message: ' + String(data).slice(0, 100));
      return;
    }

    log('App', '← ' + (message.type || 'unknown'), message.type === 'console-message' ? (message.args || []).map(function(a) { return a.value || a.type; }).join(' ') : undefined);

    // Route to domain handlers that care about app messages
    tracingDomain.handleAppMessage(message);
    nodeTracingDomain.handleAppMessage(message);
    if (runtimeDomain.handleAppMessage) {
      runtimeDomain.handleAppMessage(message);
    }
    if (profilerDomain.handleAppMessage) {
      profilerDomain.handleAppMessage(message);
    }
    if (domDomain.handleAppMessage) {
      domDomain.handleAppMessage(message);
    }
    if (cssDomain.handleAppMessage) {
      cssDomain.handleAppMessage(message);
    }
    if (overlayDomain.handleAppMessage) {
      overlayDomain.handleAppMessage(message);
    }

    if (message.type === 'cdp-event') {
      log('App', 'Broadcasting cdp-event: ' + message.method);
      broadcastCDP({
        method: message.method,
        params: message.params,
      });
    }

    if (message.type === 'console-message') {
      broadcastCDP({
        method: 'Runtime.consoleAPICalled',
        params: {
          type: message.cdpType || 'log',
          args: message.args || [],
          executionContextId: 1,
          timestamp: message.timestamp || Date.now(),
          stackTrace: message.stackTrace || {callFrames: []},
        },
      });

      // Also emit Log.entryAdded for error-level messages
      if (message.cdpType === 'error' && logDomain.isEnabled()) {
        broadcastCDP({
          method: 'Log.entryAdded',
          params: {
            entry: {
              source: 'javascript',
              level: 'error',
              text: (message.args || []).map(function (a) { return a.value || a.description || ''; }).join(' '),
              timestamp: message.timestamp || Date.now(),
              stackTrace: message.stackTrace || {callFrames: []},
            },
          },
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------
  httpServer.listen(cdpPort, function () {
    log('Init', 'CDP server listening on http://localhost:' + cdpPort);
    log('Init', 'Target: ' + targetId);
    log('Init', 'DevTools URL: ' + devtoolsFrontendUrl);
  });

  return {
    port: cdpPort,

    setSendToApp: function (fn) {
      log('Init', 'sendToApp ' + (fn ? 'SET' : 'CLEARED'));
      sendToApp = fn;
    },

    handleAppMessage: handleAppMessage,
    router: router,

    close: function () {
      for (const client of cdpClients) {
        client.close();
      }
      cdpClients.clear();
      httpServer.close();
    },
  };
}

module.exports = {createInspectorProxy, DEFAULT_CDP_PORT};
