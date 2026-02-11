'use strict';

// react-dom-native entry point
//
// This is the main entry file bundled by esbuild into ios/Sources/ReactDomNative/Resources/bundle.js.
// It wires together the renderer, components, bridge, and Flight client,
// then exposes a global API for the native side to trigger rendering.

var renderer = require('../renderer/src/index');
var createRoot = renderer.createRoot;
var flightClient = require('../flight-client/src/index');
var createFromFetch = flightClient.createFromFetch;
var http = require('../flight-client/src/http');
var fetchWithBridge = http.fetchWithBridge;

// Import components to trigger element registration (side effects)
require('../components/src/index');

// ---------------------------------------------------------------------------
// Client components — bundled into the native JS for the module map
// ---------------------------------------------------------------------------

var Counter = require('../../example/components/Counter');
var TextInput = require('../../example/components/TextInput');

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
    root.render(tree);
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

// ---------------------------------------------------------------------------
// Auto-boot: fetch and render RSC from the dev server
// ---------------------------------------------------------------------------
// setTimeout ensures the bridge is fully initialized (surface registered)
// before we start rendering. JSRuntime.start() calls registerSurface(1)
// then loadBundle() which evaluates this file synchronously.

if (typeof $$fetch !== 'undefined') {
  setTimeout(function () {
    if (typeof $$log !== 'undefined') {
      $$log('Fetching RSC from ' + SERVER_URL);
    }
    globalThis.__REACT_DOM_NATIVE__.renderFromURL(SERVER_URL, {surfaceId: 1});
  }, 0);
}
