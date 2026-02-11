'use strict';

// react-dom-native entry point
//
// This is the main entry file bundled by esbuild into ios/Sources/ReactDomNative/Resources/bundle.js.
// It wires together the renderer, components, bridge, and Flight client,
// then exposes a global API for the native side to trigger rendering.

const {createRoot} = require('../renderer/src/index');
const {createFromFetch, fetchRSC} = require('../flight-client/src/index');

// Import components to trigger element registration (side effects)
require('../components/src/index');

// ---------------------------------------------------------------------------
// Global API exposed to native Swift code
// ---------------------------------------------------------------------------

globalThis.__REACT_DOM_NATIVE__ = {
  // Called by native to render an RSC stream from a URL
  renderFromURL: function renderFromURL(url, rootViewHandle) {
    const root = createRoot(rootViewHandle);
    const fetchPromise = fetchRSC(url);
    const tree = createFromFetch(fetchPromise);
    root.render(tree);
    return root;
  },

  // Called by native to render a React element directly
  render: function render(element, rootViewHandle) {
    const root = createRoot(rootViewHandle);
    root.render(element);
    return root;
  },

  // Version info
  version: '0.0.1',
};

if (typeof $$log !== 'undefined') {
  $$log('react-dom-native runtime loaded v0.0.1');
}
