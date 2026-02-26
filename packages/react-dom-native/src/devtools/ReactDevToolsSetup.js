'use strict';

// ---------------------------------------------------------------------------
// React DevTools Backend Setup
//
// Initializes the React DevTools backend so the standalone DevTools app
// (npx react-devtools) can connect and inspect the component tree.
//
// MUST load before React so the DevTools hook's console.* patches are in
// place when React checks for them at module init time.
//
// Initialization order:
//   1. Native console injection (Swift — already done before bundle eval)
//   2. This module — installs DevTools hook, patches console, connects
//   3. React loads — detects patched console and DevTools hook
//
// Connection: WebSocket to localhost:8097 (standalone React DevTools port)
// via a JS WebSocket polyfill backed by native URLSessionWebSocketTask.
// ---------------------------------------------------------------------------

if (__DEV__) {
  // react-devtools-core uses `window` and `self` to find the global hook and
  // WebSocket. JSC doesn't have either, so alias them to globalThis.
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }
  if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis;
  }

  // --- WebSocket polyfill (backed by native bridge) ---
  //
  // The native side (JSRuntime.swift) provides:
  //   $$nativeWSOpen(id, url)   — creates a URLSessionWebSocketTask
  //   $$nativeWSSend(id, data)  — sends a string message
  //   $$nativeWSClose(id)       — closes the connection
  //
  // And calls back into JS via:
  //   $$nativeWSOnOpen(id)          — connection opened
  //   $$nativeWSOnMessage(id, data) — message received
  //   $$nativeWSOnClose(id)         — connection closed
  //   $$nativeWSOnError(id, msg)    — error occurred

  var nextWsId = 1;
  var wsInstances = {};

  function WebSocketPolyfill(url) {
    var id = nextWsId++;
    this._id = id;
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    wsInstances[id] = this;

    if (typeof $$nativeWSOpen === 'function') {
      $$nativeWSOpen(id, url);
    }
  }

  WebSocketPolyfill.CONNECTING = 0;
  WebSocketPolyfill.OPEN = 1;
  WebSocketPolyfill.CLOSING = 2;
  WebSocketPolyfill.CLOSED = 3;

  WebSocketPolyfill.prototype.send = function send(data) {
    if (typeof $$nativeWSSend === 'function') {
      $$nativeWSSend(this._id, typeof data === 'string' ? data : String(data));
    }
  };

  WebSocketPolyfill.prototype.close = function close() {
    this.readyState = 2; // CLOSING
    if (typeof $$nativeWSClose === 'function') {
      $$nativeWSClose(this._id);
    }
  };

  globalThis.WebSocket = WebSocketPolyfill;

  // --- Native callbacks ---

  globalThis.$$nativeWSOnOpen = function (id) {
    var ws = wsInstances[id];
    if (ws) {
      ws.readyState = 1; // OPEN
      if (typeof ws.onopen === 'function') {
        ws.onopen();
      }
    }
  };

  globalThis.$$nativeWSOnMessage = function (id, data) {
    var ws = wsInstances[id];
    if (ws && typeof ws.onmessage === 'function') {
      ws.onmessage({data: data});
    }
  };

  globalThis.$$nativeWSOnClose = function (id) {
    var ws = wsInstances[id];
    if (ws) {
      ws.readyState = 3; // CLOSED
      if (typeof ws.onclose === 'function') {
        ws.onclose();
      }
      delete wsInstances[id];
    }
  };

  globalThis.$$nativeWSOnError = function (id, message) {
    var ws = wsInstances[id];
    if (ws) {
      if (typeof ws.onerror === 'function') {
        ws.onerror({message: message});
      }
    }
  };

  // --- DevTools backend initialization ---

  var devtools = require('react-devtools-core/backend');

  // Install the full DevTools hook (with sub/emit/rendererInterfaces).
  // This replaces our lightweight DevToolsHookShim if it hasn't run yet.
  devtools.initialize();

  // Connect to the standalone React DevTools app.
  // Uses the WebSocket polyfill above to create a connection to localhost:8097.
  // Handles automatic reconnection if DevTools isn't running yet.
  devtools.connectToDevTools({
    host: 'localhost',
    port: 8097,
    resolveRNStyle: null,
  });
}
