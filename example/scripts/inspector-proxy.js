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
        if (id !== undefined) ctx.sendCDP(ws, {id: id, result: {}});
        return;
      }

      var domainName = method.slice(0, dotIdx);
      var methodName = method.slice(dotIdx + 1);
      var domain = handlers[domainName];

      if (!domain) {
        if (id !== undefined) ctx.sendCDP(ws, {id: id, result: {}});
        return;
      }

      var result = domain.handle(methodName, params, Object.assign({ws: ws}, ctx));
      if (result && typeof result.then === 'function') {
        result.then(function (r) {
          if (id !== undefined) ctx.sendCDP(ws, {id: id, result: r || {}});
        });
      } else if (result !== null) {
        if (id !== undefined) ctx.sendCDP(ws, {id: id, result: result || {}});
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
        // Tell app to start collecting trace events
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
        }
        console.log('[InspectorProxy] Tracing started');
        return {};
      }

      case 'end': {
        // Tell app to stop and collect events
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
        }

        var ws = ctx.ws;
        var id = ctx._currentId;

        // Wait for trace data from app, then emit to DevTools
        var tracePromise = new Promise(function (resolve) {
          pendingTraceResolve = resolve;
          // Timeout after 5 seconds in case app doesn't respond
          setTimeout(function () {
            if (pendingTraceResolve === resolve) {
              pendingTraceResolve = null;
              resolve([]);
            }
          }, 5000);
        });

        tracePromise.then(function (events) {
          emitTraceEvents(ws, id, events, 'Tracing', targetId, ctx);
        });

        return null; // Response sent asynchronously
      }

      default:
        return {};
    }
  }

  return {
    name: 'Tracing',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'trace-data' && pendingTraceResolve) {
        var resolve = pendingTraceResolve;
        pendingTraceResolve = null;
        resolve(message.events || []);
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
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'start-tracing'}));
        }
        console.log('[InspectorProxy] Tracing started (NodeTracing)');
        return {};
      }

      case 'stop': {
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
        }

        var ws = ctx.ws;
        var id = ctx._currentId;

        var tracePromise = new Promise(function (resolve) {
          pendingTraceResolve = resolve;
          setTimeout(function () {
            if (pendingTraceResolve === resolve) {
              pendingTraceResolve = null;
              resolve([]);
            }
          }, 5000);
        });

        tracePromise.then(function (events) {
          emitTraceEvents(ws, id, events, 'NodeTracing', targetId, ctx);
        });

        return null;
      }

      default:
        return {};
    }
  }

  return {
    name: 'NodeTracing',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'trace-data' && pendingTraceResolve) {
        var resolve = pendingTraceResolve;
        pendingTraceResolve = null;
        resolve(message.events || []);
      }
    },
  };
}

// Shared trace event emission logic
function emitTraceEvents(ws, id, events, domainPrefix, targetId, ctx) {
  // Chrome DevTools Performance panel requires a TracingStartedInBrowser
  // event to establish the frame/process context. Without it, the
  // MetaHandler can't associate blink.user_timing events with a renderer
  // and shows an empty trace. We prepend it here so the tracer in the
  // app stays format-agnostic.
  var rendererPid = 1; // Must match tracer's _pid
  var browserPid = 0;

  // Find the earliest timestamp in the trace events to anchor
  // TracingStartedInBrowser just before the first real event.
  var minTs = Infinity;
  for (var j = 0; j < events.length; j++) {
    if (events[j].ts > 0 && events[j].ts < minTs) {
      minTs = events[j].ts;
    }
  }
  if (minTs === Infinity) minTs = 0;

  var infraEvents = [
    // Browser process metadata
    {name: 'process_name', cat: '__metadata', ph: 'M', pid: browserPid, tid: 0, ts: 0, args: {name: 'Browser'}},
    {name: 'thread_name', cat: '__metadata', ph: 'M', pid: browserPid, tid: 0, ts: 0, args: {name: 'CrBrowserMain'}},
    // TracingStartedInBrowser — required by DevTools MetaHandler
    {
      name: 'TracingStartedInBrowser',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      ts: minTs > 0 ? minTs - 1 : 0,
      pid: browserPid,
      tid: 0,
      s: 't',
      args: {
        data: {
          frameTreeNodeId: 1,
          persistentIds: true,
          frames: [{
            frame: targetId,
            url: 'file://',
            name: 'Falcon',
            processId: rendererPid,
            isInPrimaryMainFrame: true,
            isOutermostMainFrame: true,
          }],
        },
      },
    },
  ];
  events = infraEvents.concat(events);

  // Optionally dump trace events to file for debugging
  if (process.env.FALCON_DUMP_TRACE) {
    try {
      var fs = require('fs');
      fs.writeFileSync('/tmp/falcon-trace.json',
        JSON.stringify({traceEvents: events}, null, 2));
      console.log('[InspectorProxy] Trace dumped to /tmp/falcon-trace.json (' + events.length + ' events)');
    } catch (e) {}
  }

  // Acknowledge Tracing.end
  ctx.sendCDP(ws, {id: id, result: {}});

  // Emit events in chunks (matching RN's behavior)
  for (var i = 0; i < events.length; i += CHUNK_SIZE) {
    var chunk = events.slice(i, i + CHUNK_SIZE);
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
  console.log(
    '[InspectorProxy] Tracing complete, sent ' + events.length + ' events',
  );
}

// ---------------------------------------------------------------------------
// Runtime domain
// ---------------------------------------------------------------------------

function createRuntimeDomain() {
  // Pending CDP requests forwarded to the app
  var pendingCDPRequests = new Map(); // requestId -> {ws, id}

  function handle(method, params, ctx) {
    switch (method) {
      case 'enable':
        // DevTools expects an executionContextCreated event after enable
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
        return {id: 'falcon-isolate-1'};

      case 'runIfWaitingForDebugger':
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
        pendingCDPRequests.set(requestId, {ws: ctx.ws, id: ctx._currentId});
        if (ctx.sendToApp) {
          ctx.sendToApp(JSON.stringify({
            type: 'cdp-request',
            requestId: requestId,
            domain: 'Runtime',
            method: method,
            params: params,
          }));
        }
        return null; // Response sent asynchronously via handleAppMessage
      }

      default:
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
          pendingCDPRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Profiler domain
// ---------------------------------------------------------------------------

function createProfilerDomain() {
  function handle(method, params, ctx) {
    switch (method) {
      case 'stop':
        return {
          profile: {
            nodes: [
              {
                id: 1,
                callFrame: {
                  functionName: '(root)',
                  scriptId: '0',
                  url: '',
                  lineNumber: -1,
                  columnNumber: -1,
                },
                children: [],
              },
            ],
            startTime: 0,
            endTime: 0,
            samples: [],
            timeDeltas: [],
          },
        };

      default:
        return {};
    }
  }

  return {
    name: 'Profiler',
    handle: handle,
  };
}

// ---------------------------------------------------------------------------
// Page domain
// ---------------------------------------------------------------------------

function createPageDomain(targetId) {
  function handle(method, params, ctx) {
    switch (method) {
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

function createDOMDomain() {
  function handle(method, params, ctx) {
    switch (method) {
      case 'getDocument':
        return {
          root: {
            nodeId: 1,
            backendNodeId: 1,
            nodeType: 9,
            nodeName: '#document',
            localName: '',
            nodeValue: '',
            childNodeCount: 0,
            children: [],
            documentURL: 'file://',
            baseURL: 'file://',
            xmlVersion: '',
          },
        };

      default:
        return {};
    }
  }

  return {
    name: 'DOM',
    handle: handle,
  };
}

// ---------------------------------------------------------------------------
// Log domain
// ---------------------------------------------------------------------------

function createLogDomain() {
  var enabled = false;

  function handle(method, params, ctx) {
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
// createInspectorProxy
// ---------------------------------------------------------------------------

function createInspectorProxy(options) {
  const cdpPort = (options && options.port) || DEFAULT_CDP_PORT;
  const targetId = 'falcon-' + Math.random().toString(36).slice(2, 10);
  var devtoolsFrontendUrl =
    'devtools://devtools/bundled/inspector.html?experiments=true&ws=127.0.0.1:' +
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
  var domDomain = createDOMDomain();
  var logDomain = createLogDomain();

  var router = createDomainRouter([
    tracingDomain,
    nodeTracingDomain,
    runtimeDomain,
    profilerDomain,
    pageDomain,
    domDomain,
    logDomain,
  ]);

  // -----------------------------------------------------------------------
  // HTTP server for CDP discovery endpoints
  // -----------------------------------------------------------------------
  const httpServer = http.createServer(function (req, res) {
    const url = req.url;

    if (url === '/json/version') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          Browser: 'node.js/v22.0.0',
          'Protocol-Version': '1.1',
        }),
      );
      return;
    }

    if (url === '/json' || url === '/json/list') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify([
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
        ]),
      );
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
    console.log('[InspectorProxy] Chrome DevTools connected');

    ws.on('message', function onMessage(data) {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (e) {
        return;
      }

      handleCDPMessage(ws, message);
    });

    ws.on('close', function onClose() {
      cdpClients.delete(ws);
      console.log('[InspectorProxy] Chrome DevTools disconnected');
    });

    ws.on('error', function onError() {
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
      return;
    }

    // Route to domain handlers that care about app messages
    tracingDomain.handleAppMessage(message);
    nodeTracingDomain.handleAppMessage(message);
    if (runtimeDomain.handleAppMessage) {
      runtimeDomain.handleAppMessage(message);
    }

    if (message.type === 'cdp-event') {
      // Broadcast CDP event from app to all connected DevTools clients
      broadcastCDP({
        method: message.method,
        params: message.params,
      });
    }

    if (message.type === 'console-message') {
      // Forward as Runtime.consoleAPICalled to all connected DevTools clients
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
    console.log(
      '[InspectorProxy] CDP server listening on http://localhost:' + cdpPort,
    );
    console.log('[InspectorProxy] Open in Chrome: ' + devtoolsFrontendUrl);
  });

  return {
    port: cdpPort,

    // Called by dev-server.js to set the function that sends messages to the app
    setSendToApp: function (fn) {
      sendToApp = fn;
    },

    // Called by dev-server.js when a message arrives from the app
    handleAppMessage: handleAppMessage,

    // Access domain router for extending with new domains
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
