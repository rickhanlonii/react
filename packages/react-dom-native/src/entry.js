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
  require('./devtools/DevToolsHookShim');        // Must be first — sets __REACT_DEVTOOLS_GLOBAL_HOOK__
  require('./devtools/PerformanceTracer');
  require('./devtools/PerformancePolyfill');
  require('./devtools/ConsoleTimeStamp');
  // RemoteObject is loaded as a dependency by modules below (no explicit require)
  require('./devtools/ConsoleForwarding');
  require('./devtools/RuntimeAgent');             // CDP Runtime.evaluate/getProperties in JSC
  require('./devtools/NetworkAgent');             // CDP Network via fetch interception
  require('./devtools/ExceptionReporter');        // Uncaught exception → Runtime.exceptionThrown
  require('./devtools/ReactDevToolsAgent');       // $$getComponentTree() for Fiber inspection
  require('./devtools/DOMAgent');                 // CDP DOM/CSS domain handlers
  require('./devtools/InspectorMessageHandler'); // Must be last — dispatches to all above
}

var React = require('react');
var use = React.use;
var startTransition = React.startTransition;
var createElement = React.createElement;
var renderer = require('./renderer/index');
var createRoot = renderer.createRoot;
var hydrateRoot = renderer.hydrateRoot;
var client = require('./flight-client/client');
var http = require('./flight-client/http');
var fetchWithBridge = http.fetchWithBridge;

function Root(props) {
  return use(props.tree);
}

// ---------------------------------------------------------------------------
// Expose React globally so on-demand client component modules can use it.
// Component IIFEs are built with `react` aliased to globalThis.React.
// ---------------------------------------------------------------------------
globalThis.React = React;

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
};

if (typeof $$log !== 'undefined') {
  $$log('react-dom-native runtime loaded v0.0.1');
}
