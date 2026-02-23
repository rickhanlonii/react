'use strict';

// ---------------------------------------------------------------------------
// Standalone inspector proxy launcher
//
// Starts the CDP inspector proxy (port 9222) with its own WebSocket server
// (port 8082) for receiving trace data from the native app.
//
// This is launched as a separate process by dev.sh.
// ---------------------------------------------------------------------------

const {createInspectorProxy} = require('./inspector-proxy');
const {WebSocketServer} = require('ws');

const WS_PORT = 8082;
const CDP_PORT = 8976;

// 1. Start the CDP inspector proxy
const proxy = createInspectorProxy({port: CDP_PORT});

// 2. Start a WebSocket server for app communication
const wss = new WebSocketServer({port: WS_PORT});
const clients = new Set();
var tracingActive = false;

wss.on('connection', function onConnection(ws) {
  clients.add(ws);
  console.log('[Inspector] App connected via WebSocket (tracingActive=' + tracingActive + ')');

  // If tracing was active before this connection, re-send start-tracing
  // so the new JSContext (after reload) picks up where we left off.
  if (tracingActive && ws.readyState === 1) {
    console.log('[Inspector] Re-sending start-tracing to new connection');
    ws.send(JSON.stringify({type: 'start-tracing'}));
  }

  ws.on('message', function onMessage(data) {
    // Forward app messages (trace-data) to the inspector proxy
    proxy.handleAppMessage(data.toString());
  });

  ws.on('close', function onClose() {
    clients.delete(ws);
  });
  ws.on('error', function onError() {
    clients.delete(ws);
  });
});

// Wire proxy → app: send tracing commands to all connected apps
proxy.setSendToApp(function sendToApp(data) {
  try {
    var parsed = JSON.parse(data);
    if (parsed.type === 'start-tracing') {
      tracingActive = true;
      console.log('[Inspector] tracingActive = true (from proxy)');
    }
    if (parsed.type === 'stop-tracing') {
      tracingActive = false;
      console.log('[Inspector] tracingActive = false (from proxy)');
    }
  } catch (e) {}
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
});

console.log('[Inspector] WebSocket server on ws://localhost:' + WS_PORT);

// Cleanup
process.on('SIGTERM', function () {
  wss.close();
  proxy.close();
  process.exit(0);
});
