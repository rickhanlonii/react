'use strict';

const {WebSocketServer} = require('ws');
const path = require('path');

const DEFAULT_PORT = 8082;

function createDevServer(options) {
  const port = (options && options.port != null) ? options.port : DEFAULT_PORT;
  const wss = new WebSocketServer({port});
  const clients = new Set();

  // Inspector proxy integration — receives trace data from the app
  let inspectorProxy = null;
  let tracingActive = false;

  wss.on('connection', function onConnection(ws) {
    clients.add(ws);
    console.log('[Inspector] App connected via WebSocket');

    // If tracing is active, re-send start-tracing to the new client.
    // This handles app reloads during a recording session — the new
    // JSC context needs to know tracing is active.
    if (tracingActive && ws.readyState === 1) {
      ws.send(JSON.stringify({type: 'start-tracing'}));
    }

    ws.on('message', function onMessage(data) {
      // Handle messages from the app (e.g. trace-data)
      const text = data.toString();
      let message;
      try {
        message = JSON.parse(text);
      } catch (e) {
        return;
      }

      // Forward trace-data messages to the inspector proxy
      if (message.type === 'trace-data' && inspectorProxy) {
        inspectorProxy.handleAppMessage(text);
      }

      // Forward CDP responses and events from the app to the inspector proxy
      if ((message.type === 'cdp-response' || message.type === 'cdp-event') && inspectorProxy) {
        inspectorProxy.handleAppMessage(text);
      }

      // Forward console messages to the inspector proxy
      if (message.type === 'console-message' && inspectorProxy) {
        inspectorProxy.handleAppMessage(text);
      }
    });

    ws.on('close', function onClose() {
      clients.delete(ws);
    });
    ws.on('error', function onError() {
      clients.delete(ws);
    });
  });

  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  // Send a raw string to all connected app clients.
  // Used by the inspector proxy to relay tracing commands.
  // Also tracks tracing state for re-sending to reconnecting clients.
  function sendToApps(data) {
    try {
      var parsed = JSON.parse(data);
      if (parsed.type === 'start-tracing') tracingActive = true;
      if (parsed.type === 'stop-tracing') tracingActive = false;
    } catch (e) {}
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  function notifyReload() {
    broadcast({type: 'reload'});
  }

  function notifyError(error) {
    broadcast({
      type: 'error',
      message: error.message || String(error),
      stack: error.stack || null,
      file: error.file || null,
      line: error.line || null,
      column: error.column || null,
    });
  }

  function notifyClearErrors() {
    broadcast({type: 'clear-errors'});
  }

  function close() {
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close();
  }

  return {
    port,
    broadcast,
    sendToApps,
    notifyReload,
    notifyError,
    notifyClearErrors,
    close,
    get clientCount() {
      return clients.size;
    },

    // Connect to an inspector proxy for bidirectional tracing
    connectInspectorProxy: function (proxy) {
      inspectorProxy = proxy;
      proxy.setSendToApp(sendToApps);
    },
  };
}

module.exports = {createDevServer, DEFAULT_PORT};
