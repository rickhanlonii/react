'use strict';

// ---------------------------------------------------------------------------
// Standalone inspector proxy launcher
//
// Starts the CDP inspector proxy (port 8976) with its own WebSocket server
// (port 8082) for receiving messages from native apps.
//
// Each app sends a "connect" message with identity info on WebSocket open.
// The proxy creates a separate CDP target per connected app.
// ---------------------------------------------------------------------------

const {createInspectorProxy} = require('./inspector-proxy');
const {WebSocketServer} = require('ws');

const WS_PORT = 8082;
const CDP_PORT = 8976;

// 1. Start the CDP inspector proxy (multi-target)
const proxy = createInspectorProxy({port: CDP_PORT});

// 2. Start a WebSocket server for app communication
const wss = new WebSocketServer({port: WS_PORT});

// Track which app WebSocket belongs to which target
// Map<ws, { targetId: string, identified: boolean }>
const clientInfo = new Map();

// Track tracing state per target so it survives reconnects
const tracingState = new Map(); // targetId -> boolean

wss.on('connection', function onConnection(ws) {
  clientInfo.set(ws, {targetId: null, identified: false});
  console.log('[Inspector] App connected via WebSocket (awaiting identity)');

  ws.on('message', function onMessage(data) {
    var text = data.toString();
    var message;
    try {
      message = JSON.parse(text);
    } catch (e) {
      return;
    }

    var info = clientInfo.get(ws);

    // Handle identity handshake
    if (message.type === 'connect') {
      var targetId = proxy.addTarget(message, function sendToApp(msg) {
        if (ws.readyState === 1) {
          ws.send(msg);
        }
      });
      info.targetId = targetId;
      info.identified = true;
      console.log('[Inspector] App identified: ' + targetId +
        ' (' + message.appName + ' — ' + message.deviceName + ')');

      // If tracing was active for this target, re-send start-tracing
      if (tracingState.get(targetId) && ws.readyState === 1) {
        console.log('[Inspector] Re-sending start-tracing to ' + targetId);
        ws.send(JSON.stringify({type: 'start-tracing'}));
      }
      return;
    }

    // Broadcast reload/refresh to all OTHER app clients (from esbuild watcher)
    if (message.type === 'notify-reload') {
      console.log('[Inspector] Broadcasting reload');
      var reloadMsg = JSON.stringify({type: 'reload'});
      for (var [client] of clientInfo) {
        if (client !== ws && client.readyState === 1) {
          client.send(reloadMsg);
        }
      }
      return;
    }

    if (message.type === 'notify-refresh') {
      console.log('[Inspector] Broadcasting refresh (' + message.chunks.length + ' chunk(s))');
      var refreshMsg = JSON.stringify({type: 'refresh', chunks: message.chunks});
      for (var [client] of clientInfo) {
        if (client !== ws && client.readyState === 1) {
          client.send(refreshMsg);
        }
      }
      return;
    }

    // Handle open-devtools request from the app
    if (message.type === 'open-devtools') {
      if (info && info.targetId) {
        var devtoolsUrl = 'devtools://devtools/bundled/inspector.html?remoteFrontend=true&ws=127.0.0.1:' + CDP_PORT + '/' + info.targetId;
        require('child_process').exec('open -a "Google Chrome" "' + devtoolsUrl + '"');
        console.log('[Inspector] Opening DevTools for ' + info.targetId);
      }
      return;
    }

    // Forward app messages to the correct target
    if (info.identified && info.targetId) {
      proxy.handleAppMessage(info.targetId, text);
    }
  });

  ws.on('close', function onClose() {
    var info = clientInfo.get(ws);
    if (info && info.targetId) {
      console.log('[Inspector] App disconnected: ' + info.targetId);
      proxy.removeTarget(info.targetId);
    }
    clientInfo.delete(ws);
  });
  ws.on('error', function onError() {
    var info = clientInfo.get(ws);
    if (info && info.targetId) {
      proxy.removeTarget(info.targetId);
    }
    clientInfo.delete(ws);
  });
});

// Track tracing state changes from proxy
proxy.onTracingStateChange = function (targetId, active) {
  tracingState.set(targetId, active);
};

console.log('[Inspector] WebSocket server on ws://localhost:' + WS_PORT);

// Cleanup
process.on('SIGTERM', function () {
  wss.close();
  proxy.close();
  process.exit(0);
});
