'use strict';

// ---------------------------------------------------------------------------
// test-proxy.js — Test the inspector proxy CDP roundtrip in isolation.
//
// Starts the inspector proxy with its own HTTP server, connects as both a
// "DevTools client" (CDP) and a "mock app" (trace-data sender), and verifies
// the full roundtrip:
//   DevTools sends Tracing.start → proxy relays to app
//   App sends trace-data → proxy wraps in Tracing.dataCollected → DevTools
//
// Usage:  node example/scripts/test-proxy.js
//
// No dev server, no iOS simulator, no Chrome DevTools needed.
// ---------------------------------------------------------------------------

var http = require('http');
var express = require('express');
var WebSocket = require('ws');
var {createInspectorProxy, mountInspectorRoutes, createCDPUpgradeHandler} = require('./inspector-proxy');
var {WebSocketServer} = require('ws');

var TEST_PORT = 19222; // Use non-standard port to avoid conflicts
var passed = 0;
var failed = 0;

function pass(msg) {
  passed++;
  console.log('  PASS: ' + msg);
}

function fail(msg) {
  failed++;
  console.error('  FAIL: ' + msg);
}

function assert(condition, msg) {
  if (condition) pass(msg);
  else fail(msg);
}

// Sample trace events matching what the app would produce
var sampleAppEvents = [
  {name: 'process_name', cat: '__metadata', ph: 'M', pid: 1, tid: 0, ts: 0, args: {name: 'Falcon'}},
  {name: 'thread_name', cat: '__metadata', ph: 'M', pid: 1, tid: 1, ts: 0, args: {name: 'CrRendererMain'}},
  {
    id2: {local: '0x0'}, name: '\u200bApp', cat: 'blink.user_timing', ph: 'b',
    ts: 100000, pid: 1, tid: 1,
    args: {detail: JSON.stringify({devtools: {track: 'Components \u269b', color: 'primary-dark', tooltipText: 'App'}})},
  },
  {
    id2: {local: '0x0'}, name: '\u200bApp', cat: 'blink.user_timing', ph: 'e',
    ts: 200000, pid: 1, tid: 1, args: {},
  },
  {
    id2: {local: '0x1'}, name: 'Render', cat: 'blink.user_timing', ph: 'b',
    ts: 50000, pid: 1, tid: 1,
    args: {detail: JSON.stringify({devtools: {track: 'Blocking', trackGroup: 'Scheduler \u269b', color: 'primary-dark'}})},
  },
  {
    id2: {local: '0x1'}, name: 'Render', cat: 'blink.user_timing', ph: 'e',
    ts: 210000, pid: 1, tid: 1, args: {},
  },
];

async function run() {
  console.log('\n  Inspector Proxy Roundtrip Test');
  console.log('  ==============================\n');

  // --- Setup: start proxy with its own HTTP server ---

  var proxy = createInspectorProxy({port: TEST_PORT});
  var app = express();
  mountInspectorRoutes(app, proxy);
  var handleCDPUpgrade = createCDPUpgradeHandler(proxy);

  // Create dev WS server for mock app connections
  var devWSS = new WebSocketServer({noServer: true});
  var cdpWSS = new WebSocketServer({noServer: true});

  var httpServer = http.createServer(app);

  // Track mock app sendToApp function
  var mockAppSendToApp = null;
  var mockTargetId = null;

  devWSS.on('connection', function (ws) {
    ws.on('message', function (data) {
      var text = data.toString();
      var message;
      try { message = JSON.parse(text); } catch (e) { return; }

      if (message.type === 'connect') {
        mockTargetId = proxy.addTarget(message, function sendToApp(msg) {
          if (ws.readyState === 1) {
            ws.send(msg);
          }
        });
        return;
      }

      if (mockTargetId) {
        proxy.handleAppMessage(mockTargetId, text);
      }
    });

    ws.on('close', function () {
      if (mockTargetId) {
        proxy.disconnectTarget(mockTargetId);
      }
    });
  });

  httpServer.on('upgrade', function (req, socket, head) {
    var pathname = req.url || '/';
    if (pathname === '/__dev') {
      devWSS.handleUpgrade(req, socket, head, function (ws) {
        devWSS.emit('connection', ws, req);
      });
    } else if (pathname.startsWith('/__cdp/')) {
      cdpWSS.handleUpgrade(req, socket, head, function (ws) {
        handleCDPUpgrade(ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise(function (resolve) {
    httpServer.listen(TEST_PORT, resolve);
  });

  // Connect mock app via dev WS
  var mockApp = new WebSocket('ws://127.0.0.1:' + TEST_PORT + '/__dev');

  await new Promise(function (resolve) {
    mockApp.on('open', function () {
      // Send connect identity
      mockApp.send(JSON.stringify({
        type: 'connect',
        appName: 'Falcon',
        deviceName: 'react-dom-native',
        deviceModel: 'Test',
        platform: 'iOS Simulator',
      }));
      // Give proxy a moment to register the target
      setTimeout(resolve, 200);
    });
  });

  // Handle messages on the mock app side (receives from sendToApp via proxy)
  mockApp.on('message', function (raw) {
    var msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (msg.type === 'start-tracing') {
      pass('Mock app received start-tracing command');
    }

    if (msg.type === 'stop-tracing') {
      pass('Mock app received stop-tracing command');
      // Respond with trace data (simulates what InspectorMessageHandler does)
      mockApp.send(JSON.stringify({type: 'trace-data', events: sampleAppEvents}));
    }
  });

  // --- Test 1: CDP discovery endpoint ---
  console.log('  --- CDP Discovery ---');

  var targets = await new Promise(function (resolve, reject) {
    http.get('http://127.0.0.1:' + TEST_PORT + '/json', function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });

  assert(Array.isArray(targets) && targets.length > 0, '/json returns target list');
  assert(targets[0].webSocketDebuggerUrl, 'Target has webSocketDebuggerUrl');
  assert(targets[0].title === 'Falcon — react-dom-native (Test)', 'Target title is correct');

  // --- Test 2: CDP trace roundtrip ---
  console.log('\n  --- CDP Trace Roundtrip ---');

  var wsUrl = targets[0].webSocketDebuggerUrl;
  var allEvents = [];

  await new Promise(function (resolve, reject) {
    var ws = new WebSocket(wsUrl);

    ws.on('open', function () {
      pass('Connected to CDP WebSocket');
      // Send Tracing.start
      ws.send(JSON.stringify({id: 1, method: 'Tracing.start', params: {}}));
    });

    ws.on('message', function (raw) {
      var msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

      // Ack for Tracing.start
      if (msg.id === 1) {
        pass('Tracing.start acknowledged');
        // Immediately send Tracing.end (no need to wait for app activity in this test)
        setTimeout(function () {
          ws.send(JSON.stringify({id: 2, method: 'Tracing.end', params: {}}));
        }, 100);
      }

      // Collect Tracing.dataCollected events
      if (msg.method === 'Tracing.dataCollected' && msg.params && msg.params.value) {
        allEvents = allEvents.concat(msg.params.value);
      }

      // Tracing complete
      if (msg.method === 'Tracing.tracingComplete') {
        pass('Tracing.tracingComplete received');
        ws.close();
        resolve();
      }
    });

    ws.on('error', reject);

    // Timeout
    setTimeout(function () {
      ws.close();
      reject(new Error('CDP roundtrip timed out'));
    }, 10000);
  });

  // --- Test 3: Validate trace events ---
  console.log('\n  --- Trace Event Validation ---');

  assert(allEvents.length > 0, 'Received ' + allEvents.length + ' trace events');

  // TracingStartedInBrowser must be present (prepended by proxy)
  var tsib = allEvents.filter(function (e) { return e.name === 'TracingStartedInBrowser'; });
  assert(tsib.length > 0, 'TracingStartedInBrowser event present');

  if (tsib.length > 0) {
    assert(
      tsib[0].cat === 'disabled-by-default-devtools.timeline',
      'TracingStartedInBrowser has correct category'
    );
    assert(
      tsib[0].args && tsib[0].args.data && tsib[0].args.data.frames,
      'TracingStartedInBrowser has frames data'
    );
    var rendererPid = tsib[0].args.data.frames[0].processId;
    assert(rendererPid === 1, 'Renderer PID matches app tracer PID (' + rendererPid + ')');
  }

  // Browser process metadata (prepended by proxy)
  var browserMeta = allEvents.filter(function (e) {
    return e.cat === '__metadata' && e.pid === 0;
  });
  assert(browserMeta.length >= 2, 'Browser process metadata present (' + browserMeta.length + ')');

  // App metadata (from app trace events)
  var appMeta = allEvents.filter(function (e) {
    return e.cat === '__metadata' && e.pid === 1;
  });
  assert(appMeta.length >= 2, 'App process metadata present (' + appMeta.length + ')');

  // CrRendererMain thread
  var rendererThread = appMeta.filter(function (e) {
    return e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain';
  });
  assert(rendererThread.length > 0, 'CrRendererMain thread metadata present');

  // blink.user_timing events
  var userTiming = allEvents.filter(function (e) {
    return e.cat === 'blink.user_timing';
  });
  assert(userTiming.length > 0, 'blink.user_timing events present (' + userTiming.length + ')');

  var begins = userTiming.filter(function (e) { return e.ph === 'b'; });
  var ends = userTiming.filter(function (e) { return e.ph === 'e'; });
  assert(begins.length === ends.length, 'Begin/end event count matches (' + begins.length + ' pairs)');

  // id2.local format
  var badId = begins.filter(function (e) { return !e.id2 || !e.id2.local; });
  assert(badId.length === 0, 'All begin events use id2.local format');

  // detail as JSON string with devtools metadata
  var badDetail = begins.filter(function (e) {
    if (!e.args || !e.args.detail) return true;
    try {
      var d = JSON.parse(e.args.detail);
      return !d.devtools;
    } catch (err) { return true; }
  });
  assert(badDetail.length === 0, 'All begin events have valid JSON detail with devtools metadata');

  // Components track
  var componentEvents = begins.filter(function (e) {
    try {
      var d = JSON.parse(e.args.detail);
      return d.devtools.track === 'Components \u269b';
    } catch (err) { return false; }
  });
  assert(componentEvents.length > 0, 'Component render events present (' + componentEvents.length + ')');

  // Scheduler track
  var schedulerEvents = begins.filter(function (e) {
    try {
      var d = JSON.parse(e.args.detail);
      return d.devtools.trackGroup === 'Scheduler \u269b';
    } catch (err) { return false; }
  });
  assert(schedulerEvents.length > 0, 'Scheduler events present (' + schedulerEvents.length + ')');

  // --- Test 4: Trace loadable in chrome://tracing ---
  console.log('\n  --- Chrome Trace Format ---');

  var traceJson = {traceEvents: allEvents};
  var traceString = JSON.stringify(traceJson, null, 2);

  // Verify it's valid JSON
  try {
    JSON.parse(traceString);
    pass('Trace is valid JSON');
  } catch (e) {
    fail('Trace is not valid JSON: ' + e.message);
  }

  // Write to file for manual inspection
  var fs = require('fs');
  fs.writeFileSync('/tmp/falcon-proxy-test-trace.json', traceString);
  pass('Trace written to /tmp/falcon-proxy-test-trace.json');
  console.log('  Load in chrome://tracing to visually verify\n');

  // --- Cleanup ---
  mockApp.close();
  devWSS.close();
  cdpWSS.close();
  proxy.close();
  httpServer.close();

  // --- Summary ---
  console.log('  ==============================');
  console.log('  ' + passed + ' passed, ' + failed + ' failed');
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(function (err) {
  console.error('Test error:', err);
  process.exit(1);
});
