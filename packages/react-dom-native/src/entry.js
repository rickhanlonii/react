'use strict';

// ---------------------------------------------------------------------------
// react-dom-native framework bundle entry point
//
// This is the framework entry point bundled into the native app. It contains
// all framework code (renderer, flight client, bridge) but NO app-specific
// code (no client components, no MODULE_MAP, no server URL).
//
// After evaluating this bundle, the native side calls the bridge globals
// ($$createFlightResponse, etc.) and then renderFromStream/hydrateFromStream.
// ---------------------------------------------------------------------------

// DevTools polyfills must load BEFORE React so React detects `performance`
// and `console.timeStamp` during its module initialization.
if (__DEV__) {
  require('./devtools/ReactDevToolsSetup');         // Must be first — installs full DevTools hook
  require('./devtools/RemoteObject');              // CDP Runtime $$ helpers ($$evaluateForCDP, etc.)
}

// ---------------------------------------------------------------------------
// React Fast Refresh runtime — must initialize before React loads
// ---------------------------------------------------------------------------
if (__DEV__) {
  var RefreshRuntime = require('react-refresh/runtime');
  RefreshRuntime.injectIntoGlobalHook(globalThis);

  // Default no-op globals. The refresh wrapper loader overrides these
  // per-module with scoped versions that include the module path.
  globalThis.$RefreshReg$ = function() {};
  globalThis.$RefreshSig$ = function() { return function(type) { return type; }; };
}

var React = require('react');
var use = React.use;
var startTransition = React.startTransition;
var createElement = React.createElement;
var renderer = require('./renderer/index');
var createRoot = renderer.createRoot;
var hydrateRoot = renderer.hydrateRoot;
var client = require('./flight-client/client');

// Required for ReactFlightWebpackPlugin to discover and code-split 'use client'
// components. The plugin attaches async dependency blocks to this module during
// webpack compilation. We don't use its Flight parsing (Swift handles that).
// Must use client.browser explicitly — the plugin checks for client.browser.js,
// but target:'webworker' resolves the bare /client to client.edge.js.
require('react-server-dom-webpack/client.browser');

// ---------------------------------------------------------------------------
// Inline Flight Data Receiver
//
// Matches the Next.js pattern: server emits JS code that pushes Flight data
// into self.__next_f, which feeds a ReadableStream consumed by
// react-server-dom-webpack/client's createFromReadableStream.
// ---------------------------------------------------------------------------

var flightEncoder = new TextEncoder();
var flightDataBuffer = null;   // Array of buffered chunks (before ReadableStream starts)
var flightDataWriter = null;   // ReadableStream controller
var flightDataClosed = false;

function flightDataCallback(seg) {
  if (seg[0] === 0) {
    // Bootstrap — initialize buffer
    flightDataBuffer = [];
    return;
  }
  // seg[0] === 1: Flight data row
  var data = seg[1];
  if (typeof data === 'string') {
    data = flightEncoder.encode(data);
  }
  if (flightDataWriter) {
    flightDataWriter.enqueue(data);
  } else if (flightDataBuffer) {
    flightDataBuffer.push(data);
  }
}

function createFlightDataStream() {
  return new ReadableStream({
    start: function(controller) {
      // Flush any buffered chunks
      if (flightDataBuffer) {
        for (var i = 0; i < flightDataBuffer.length; i++) {
          controller.enqueue(flightDataBuffer[i]);
        }
        flightDataBuffer = null;
      }
      if (flightDataClosed) {
        controller.close();
        return;
      }
      flightDataWriter = controller;
    }
  });
}

function closeFlightDataStream() {
  flightDataClosed = true;
  if (flightDataWriter) {
    flightDataWriter.close();
    flightDataWriter = null;
  }
}

// Set up the global receiver
var selfGlobal = typeof self !== 'undefined' ? self : globalThis;
selfGlobal.__next_f = selfGlobal.__next_f || [];
selfGlobal.__next_f.push = flightDataCallback;

function Root(props) {
  return use(props.tree);
}

// ---------------------------------------------------------------------------
// Flight response registry — Swift creates responses by ID, then feeds rows
// ---------------------------------------------------------------------------
var responses = {};
var nextResponseId = 1;

// ---------------------------------------------------------------------------
// Bridge globals — called by Swift FlightStreamClient
// ---------------------------------------------------------------------------

// Creates a new Flight response. Returns an integer responseId.
globalThis.$$createFlightResponse = function $$createFlightResponse(serverURL) {
  var id = nextResponseId++;
  responses[id] = client.createResponse(serverURL);
  return id;
};

// Dispatches a parsed row to the Flight client for processing.
globalThis.$$processFlightRow = function $$processFlightRow(responseId, id, tag, data) {
  var response = responses[responseId];
  if (response) {
    client.processRow(response, id, tag, data);
  }
};

// Resolves a module chunk after Swift has fetched and evaluated the module.
// moduleExports is the full exports object; exportName selects the export.
globalThis.$$resolveFlightModule = function $$resolveFlightModule(responseId, chunkId, moduleExports, exportName) {
  var response = responses[responseId];
  if (!response) return;
  var chunk = client.getOrCreateChunk(response, chunkId);
  var mod;
  if (exportName === 'default' || exportName === '' || exportName === '*') {
    mod = moduleExports.default || moduleExports;
  } else {
    mod = moduleExports[exportName];
  }
  client.resolveChunk(chunk, mod);
};

// Resolves a webpack module after its chunk has been evaluated.
// Called by Swift FlightStreamClient after evaluating a chunk file.
// The chunk self-registers its modules via the JSONP push handler,
// so __webpack_require__ can find them.
globalThis.$$webpackRequire = function $$webpackRequire(moduleId, exportName) {
  var mod = __webpack_require__(moduleId);
  if (exportName === 'default' || exportName === '' || exportName === '*') {
    return mod.default || mod;
  }
  return mod[exportName];
};

// Rejects a module chunk when Swift fails to fetch or evaluate the module.
globalThis.$$rejectFlightModule = function $$rejectFlightModule(responseId, chunkId, errorMessage) {
  var response = responses[responseId];
  if (!response) return;
  var chunk = client.getOrCreateChunk(response, chunkId);
  client.rejectChunk(chunk, new Error(errorMessage));
};

// Closes a Flight response (stream complete). Flushes performance timing.
// Does NOT delete from registry — module fetches may still be in-flight
// and need the response to resolve chunks. The registry is cleared on
// full reset when the entire JS context is destroyed.
globalThis.$$closeFlightResponse = function $$closeFlightResponse(responseId) {
  var response = responses[responseId];
  if (response) {
    client.close(response);
  }
};

// Reports a transport-level error. All pending chunks are rejected.
globalThis.$$reportFlightError = function $$reportFlightError(responseId, errorMessage) {
  var response = responses[responseId];
  if (response) {
    client.reportGlobalError(response, new Error(errorMessage));
    delete responses[responseId];
  }
};

// Performs React Fast Refresh after changed chunks have been re-evaluated.
// Busts webpack module cache for the given module IDs, re-requires them
// (triggering $RefreshReg$ calls), and calls performReactRefresh().
// Returns true on success, false to signal that a full reload is needed.
if (__DEV__) {
  globalThis.$$performFastRefresh = function $$performFastRefresh(moduleIds) {
    var RefreshRuntime = require('react-refresh/runtime');
    var cache = __webpack_require__.c;
    var len = moduleIds.length;

    // 1. Bust webpack module cache for changed modules
    for (var i = 0; i < len; i++) {
      delete cache[moduleIds[i]];
    }

    // 2. Re-require each module — triggers $RefreshReg$ calls
    for (var i = 0; i < len; i++) {
      try {
        __webpack_require__(moduleIds[i]);
      } catch (e) {
        console.error('[FastRefresh] Module re-require failed:', e);
        return false;
      }
    }

    // 3. Perform the refresh — React updates components in-place
    try {
      RefreshRuntime.performReactRefresh();
      return true;
    } catch (e) {
      console.error('[FastRefresh] performReactRefresh failed:', e);
      return false;
    }
  };
}

// ---------------------------------------------------------------------------
// Global API exposed to native Swift code
// ---------------------------------------------------------------------------

globalThis.__REACT_DOM_NATIVE__ = {
  // Called by native to render from a Swift-managed Flight stream.
  // Swift has already created the response via $$createFlightResponse
  // and will feed rows via $$processFlightRow.
  renderFromStream: function renderFromStream(surfaceId, responseId) {
    var response = responses[responseId];
    if (!response) {
      console.error('[react-dom-native] renderFromStream: invalid responseId ' + responseId);
      return;
    }
    var root = createRoot({surfaceId: surfaceId});
    var tree = client.getRoot(response);

    tree.then(function(element) {
      root.render(element);
    }, function(error) {
      console.error('[react-dom-native] RSC stream error: ' + error);
    });

    return root;
  },

  // Called by native to hydrate SSR content from a Swift-managed Flight stream.
  // Swift has already created the response via $$createFlightResponse
  // and will feed rows via $$processFlightRow.
  hydrateFromStream: function hydrateFromStream(surfaceId, responseId) {
    var response = responses[responseId];
    if (!response) {
      console.error('[react-dom-native] hydrateFromStream: invalid responseId ' + responseId);
      return;
    }
    var tree = client.getRoot(response);

    startTransition(function() {
      hydrateRoot(
        {surfaceId: surfaceId},
        createElement(Root, {tree: tree})
      );
    });
  },

  // Called by native to render a React element directly
  render: function render(element, rootViewHandle) {
    var root = createRoot(rootViewHandle);
    root.render(element);
    return root;
  },

  // Version info
  version: '0.0.1',

  // Close the Flight data stream (called when SSR/CSR stream ends)
  __closeFlightDataStream__: closeFlightDataStream,

  // Create a ReadableStream from buffered Flight data
  __createFlightDataStream__: createFlightDataStream,
};

if (typeof $$log !== 'undefined') {
  $$log('react-dom-native runtime loaded v0.0.1');
}
