'use strict';

const {WebSocketServer} = require('ws');
const path = require('path');

const DEFAULT_PORT = 8082;

function createDevServer(options) {
  const port = (options && options.port) || DEFAULT_PORT;
  const wss = new WebSocketServer({port});
  const clients = new Set();

  wss.on('connection', function onConnection(ws) {
    clients.add(ws);
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
    notifyReload,
    notifyError,
    notifyClearErrors,
    close,
    get clientCount() {
      return clients.size;
    },
  };
}

module.exports = {createDevServer, DEFAULT_PORT};
