'use strict';

// ---------------------------------------------------------------------------
// react-dom-native framework bundle entry point
//
// This is the framework entry point bundled into the native app. It contains
// all framework code (renderer, flight client, bridge, component registration)
// but NO app-specific code (no client components, no MODULE_MAP, no server URL).
//
// After evaluating this bundle, the native side calls:
//   globalThis.__REACT_DOM_NATIVE__.renderFromURL(serverURL, {surfaceId: N})
// ---------------------------------------------------------------------------

var React = require('react');
var renderer = require('./renderer/index');
var createRoot = renderer.createRoot;
var flightClient = require('./flight-client/index');
var createFromFetch = flightClient.createFromFetch;
var http = require('./flight-client/http');
var fetchWithBridge = http.fetchWithBridge;

// Import components to trigger element registration (side effects)
require('./components/index');

// ---------------------------------------------------------------------------
// Expose React globally so on-demand client component modules can use it.
// Component IIFEs are built with `react` aliased to globalThis.React.
// ---------------------------------------------------------------------------
globalThis.React = React;

// ---------------------------------------------------------------------------
// Global API exposed to native Swift code
// ---------------------------------------------------------------------------

globalThis.__REACT_DOM_NATIVE__ = {
  // Called by native to render an RSC stream from a URL.
  // `url` is the server base URL (e.g. 'http://localhost:6000').
  // `options` is { surfaceId: number }.
  renderFromURL: function renderFromURL(url, options) {
    var surfaceId = options && options.surfaceId ? options.surfaceId : 1;
    var root = createRoot({surfaceId: surfaceId});
    var fetchPromise = fetchWithBridge(url, {
      headers: {Accept: 'text/x-component'},
    });
    var tree = createFromFetch(fetchPromise, {serverURL: url});

    tree.then(function(element) {
      root.render(element);
    }, function(error) {
      console.error('[react-dom-native] RSC stream error: ' + error);
    });

    return root;
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
