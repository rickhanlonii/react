'use strict';

var renderer = require('react-dom-native/src/renderer/renderer');
var React = require('react');
var flightClient = require('react-dom-native/src/flight-client/client');

/**
 * Creates a root and renders into it within the test harness.
 * Returns an object with render/unmount methods.
 */
function createRoot() {
  var surfaceId = 1; // Tests use a single surface
  var nativeRootView = {surfaceId: surfaceId, width: 390, height: 844};
  var root = renderer.createRoot(nativeRootView);

  return {
    render: function (element) {
      root.render(element);
    },
    unmount: function () {
      root.unmount();
    },
  };
}

/**
 * Creates a pre-populated SSR tree and returns a hydration root.
 *
 * Usage:
 *   var root = Fantom.createHydrationRoot(<div><p>Hello</p></div>);
 *   Fantom.runTask(function() {
 *     root.hydrate(<div><p>Hello</p></div>);
 *   });
 *
 * The SSR step renders the element via createRoot (building the shadow tree),
 * then registers that tree as the SSR tree for hydration traversal.
 * The hydrate step runs hydrateRoot against the registered SSR tree.
 */
function createHydrationRoot(ssrElement) {
  var surfaceId = 1;
  var nativeRootView = {surfaceId: surfaceId, width: 390, height: 844};

  // Step 1: Render the SSR content to build the shadow tree
  var ssrRoot = renderer.createRoot(nativeRootView);
  ssrRoot.render(ssrElement);
  $$flushWork();

  // Step 2: Get the current tree node IDs and register as SSR tree
  var nodeIds = $$getRenderedNodeIds(surfaceId);
  $$registerSSRTree(surfaceId, nodeIds);

  return {
    hydrate: function(element) {
      // Create a hydration root that will walk the SSR tree
      var hydrationRoot = renderer.hydrateRoot(nativeRootView, element);
      return hydrationRoot;
    },
    getRenderedOutput: function() {
      return JSON.parse($$getRenderedOutput(surfaceId));
    },
  };
}

/**
 * Run a synchronous task and flush all pending React scheduler work.
 * Calls the user callback, then drains the setTimeout queue so that
 * React's deferred scheduler callbacks run before returning.
 */
function runTask(fn) {
  fn();
  $$flushWork();
}

/**
 * Get the rendered StubView tree as a JSON object.
 * Calls $$getRenderedOutput on the Swift side.
 */
function getRenderedOutput(surfaceId) {
  if (surfaceId === undefined) surfaceId = 1;
  return JSON.parse($$getRenderedOutput(surfaceId));
}

/**
 * Dispatch a native event to a node identified by type.
 */
function dispatchEvent(target, eventType, payload) {
  if (payload === undefined) payload = {};
  $$dispatchEvent(target, eventType, payload);
}

// ---------------------------------------------------------------------------
// Flight encoding / decoding for RSC integration tests
// ---------------------------------------------------------------------------

var ELEMENT_TYPE = Symbol.for('react.transitional.element');
var FRAGMENT_TYPE = Symbol.for('react.fragment');

/**
 * Renders a React element tree to a Flight wire format string.
 *
 * Resolves all function components (server components) by calling them,
 * then encodes the resulting host element tree in Flight row format.
 * The output can be parsed by createFromFlight().
 *
 * Only supports pure server components (no 'use client', no async components).
 *
 * @param {ReactElement} element - A React element (may include function components)
 * @returns {string} Flight wire format payload
 */
function renderToFlightString(element) {
  var encoded = encodeValue(element);
  return '0:' + JSON.stringify(encoded) + '\n';
}

/**
 * Recursively encodes a React value into Flight wire format.
 * Function components are resolved by calling them with their props.
 * Host elements become ["$", type, key, props] tuples.
 */
function encodeValue(value) {
  if (value == null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    // Escape $-prefixed strings so the Flight client reviver doesn't
    // misinterpret them as chunk references or special markers
    if (value.length > 0 && value[0] === '$') {
      return '$' + value;
    }
    return value;
  }

  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      arr.push(encodeValue(value[i]));
    }
    return arr;
  }

  // React element
  if (
    typeof value === 'object' &&
    (value.$$typeof === ELEMENT_TYPE ||
      value.$$typeof === Symbol.for('react.element'))
  ) {
    var type = value.type;

    // Function component — resolve by calling it
    if (typeof type === 'function') {
      var result = type(value.props);
      return encodeValue(result);
    }

    // Fragment — encode with symbol reference as type
    if (type === FRAGMENT_TYPE) {
      return ['$', '$Sreact.fragment', value.key != null ? value.key : null, encodeProps(value.props)];
    }

    // Host element (string type like "div", "h1", etc.)
    if (typeof type === 'string') {
      return ['$', type, value.key != null ? value.key : null, encodeProps(value.props)];
    }

    throw new Error(
      'renderToFlightString: unsupported element type: ' + String(type),
    );
  }

  // Plain object (style, props, etc.)
  if (typeof value === 'object') {
    var obj = {};
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var encoded = encodeValue(value[key]);
      if (encoded !== undefined) {
        obj[key] = encoded;
      }
    }
    return obj;
  }

  // Functions (event handlers) cannot be serialized through Flight
  if (typeof value === 'function') {
    return undefined;
  }

  return value;
}

/**
 * Encodes a props object, recursing into children and other values.
 */
function encodeProps(props) {
  if (!props) {
    return {};
  }
  var encoded = {};
  var keys = Object.keys(props);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = encodeValue(props[key]);
    if (val !== undefined) {
      encoded[key] = val;
    }
  }
  return encoded;
}

/**
 * Parses a complete Flight payload string and returns the root React element.
 *
 * @param {string} payload - Complete Flight wire format string
 * @returns {*} The resolved root value (typically a React element tree)
 */
function createFromFlight(payload) {
  var bundlerConfig = {modules: {}};
  var response = flightClient.createResponse(bundlerConfig);
  var streamState = flightClient.createStreamState();
  flightClient.processStringChunk(response, streamState, payload);
  flightClient.close(response);
  var root = flightClient.getRoot(response);
  if (root.status === 'fulfilled') {
    return root.value;
  }
  if (root.status === 'rejected') {
    throw root.reason;
  }
  throw new Error(
    'createFromFlight: root chunk still pending after processing complete payload',
  );
}

module.exports = {
  createRoot: createRoot,
  createHydrationRoot: createHydrationRoot,
  renderToFlightString: renderToFlightString,
  createFromFlight: createFromFlight,
  runTask: runTask,
  getRenderedOutput: getRenderedOutput,
  dispatchEvent: dispatchEvent,
};
