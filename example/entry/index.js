'use strict';

// react-dom-native entry point
//
// This is the main entry file bundled by esbuild into Falcon/Falcon/Resources/bundle.js.
// It wires together the renderer, components, bridge, and Flight client,
// then exposes a global API for the native side to trigger rendering.

var renderer = require('react-dom-native/src/renderer/index');
var createRoot = renderer.createRoot;
var flightClient = require('react-dom-native/src/flight-client/index');
var createFromFetch = flightClient.createFromFetch;
var http = require('react-dom-native/src/flight-client/http');
var fetchWithBridge = http.fetchWithBridge;

// Import components to trigger element registration (side effects)
require('react-dom-native/src/components/index');

// ---------------------------------------------------------------------------
// Client components — bundled into the native JS for the module map
// ---------------------------------------------------------------------------

var Counter = require('../components/Counter');
var TextInput = require('../components/TextInput');

// Module map: maps module IDs (from server Flight I rows) to component modules.
// Keys must match the `id` field in the server's client manifest.
var MODULE_MAP = {
  Counter: {default: Counter.default || Counter},
  TextInput: {default: TextInput.default || TextInput},
};

// ---------------------------------------------------------------------------
// Server URL (development)
// ---------------------------------------------------------------------------

var SERVER_URL = 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Global API exposed to native Swift code
// ---------------------------------------------------------------------------

globalThis.__REACT_DOM_NATIVE__ = {
  // Called by native to render an RSC stream from a URL
  renderFromURL: function renderFromURL(url, rootViewHandle) {
    var root = createRoot(rootViewHandle);
    var fetchPromise = fetchWithBridge(url, {
      headers: {Accept: 'text/x-component'},
    });
    var tree = createFromFetch(fetchPromise, {moduleMap: MODULE_MAP});
    console.log('[Entry] tree.status: ' + (tree && tree.status ? tree.status : 'none'));

    // The tree is a thenable that resolves to the React element.
    // Wait for it to resolve before rendering.
    tree.then(function(element) {
      console.log('[Entry] tree resolved, rendering element');
      console.log('[Entry] element type: ' + (element ? (element.type || typeof element) : 'null'));
      root.render(element);
    }, function(error) {
      console.error('[Entry] tree rejected: ' + error);
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
console.log('[TEST-ITERATION-001] Automation test log - if you see this, iteration works!');

// ---------------------------------------------------------------------------
// Auto-boot: fetch and render RSC from the dev server
// ---------------------------------------------------------------------------
// setTimeout ensures the bridge is fully initialized (surface registered)
// before we start rendering. JSRuntime.start() calls registerSurface(1)
// then loadBundle() which evaluates this file synchronously.

if (typeof $$fetch !== 'undefined') {
  setTimeout(function () {
    if (typeof console !== 'undefined') {
      console.log('Fetching RSC from ' + SERVER_URL);
    }

    var root = globalThis.__REACT_DOM_NATIVE__.renderFromURL(SERVER_URL, {surfaceId: 1});
    console.log('renderFromURL returned, root:', root);

    // The root is a thenable that resolves to the React element tree
    // Let's add some logging to track resolution
    if (root && typeof root.then === 'function') {
      root.then(
        function(value) {
          console.log('Root resolved to:', value);
        },
        function(error) {
          console.error('Root rejected with:', error);
        }
      );
    }
  }, 0);
}
