'use strict';

// ---------------------------------------------------------------------------
// react-dom-native framework bundle entry point
//
// This is the framework entry point bundled into the native app. It contains
// all framework code (renderer, bridge) but NO app-specific code (no client
// components, no MODULE_MAP, no server URL).
//
// After evaluating this bundle, the native side pushes Flight data via
// self.__next_f and calls renderFromStream/hydrateFromStream.
// ---------------------------------------------------------------------------

// DevTools polyfills must load BEFORE React so React detects `performance`
// and `console.timeStamp` during its module initialization.
if (__DEV__) {
  require('../../packages/react-dom-native/src/devtools/ReactDevToolsSetup');         // Must be first — installs full DevTools hook
  require('../../packages/react-dom-native/src/devtools/RemoteObject');              // CDP Runtime $$ helpers ($$evaluateForCDP, etc.)
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

// ---------------------------------------------------------------------------
// FormData polyfill for JavaScriptCore
//
// JSC doesn't have FormData. React Flight's encodeReply checks
// `value instanceof FormData` which throws a ReferenceError if FormData is
// undefined. This minimal polyfill prevents the crash. Our form data is
// passed as plain objects (not FormData instances), so this polyfill is
// only needed to make the instanceof check safe.
// ---------------------------------------------------------------------------
if (typeof FormData === 'undefined') {
  globalThis.FormData = function FormData() {
    this._entries = [];
  };
  globalThis.FormData.prototype.append = function(name, value) {
    this._entries.push([name, value]);
  };
  globalThis.FormData.prototype.get = function(name) {
    for (var i = 0; i < this._entries.length; i++) {
      if (this._entries[i][0] === name) return this._entries[i][1];
    }
    return null;
  };
  globalThis.FormData.prototype.has = function(name) {
    for (var i = 0; i < this._entries.length; i++) {
      if (this._entries[i][0] === name) return true;
    }
    return false;
  };
  globalThis.FormData.prototype.forEach = function(callback) {
    for (var i = 0; i < this._entries.length; i++) {
      callback(this._entries[i][1], this._entries[i][0]);
    }
  };
}

var React = require('react');
var use = React.use;
var startTransition = React.startTransition;
var createElement = React.createElement;
var renderer = require('../../packages/react-dom-native/client');
var createRoot = renderer.createRoot;
var hydrateRoot = renderer.hydrateRoot;
var ReactFlightClient = require('react-server-dom-webpack/client.browser');
var encodeReply = ReactFlightClient.encodeReply;

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
    // Bootstrap — initialize/reset buffer for a new stream
    flightDataBuffer = [];
    flightDataWriter = null;
    flightDataClosed = false;
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

// ---------------------------------------------------------------------------
// Inline Debug Data Receiver
//
// Same pattern as Flight data, but for debug info (component names, times,
// stacks). The server sends debug rows via self.__next_debug, which feeds
// a separate ReadableStream passed as debugChannel to createFromReadableStream.
// ---------------------------------------------------------------------------

var debugDataBuffer = null;
var debugDataWriter = null;
var debugDataClosed = false;

function debugDataCallback(seg) {
  if (seg[0] === 0) {
    // Bootstrap — initialize/reset buffer for a new stream
    debugDataBuffer = [];
    debugDataWriter = null;
    debugDataClosed = false;
    return;
  }
  // seg[0] === 1: Debug data row
  var data = seg[1];
  if (typeof data === 'string') {
    data = flightEncoder.encode(data);
  }
  if (debugDataWriter) {
    debugDataWriter.enqueue(data);
  } else if (debugDataBuffer) {
    debugDataBuffer.push(data);
  }
}

function createDebugDataStream() {
  return new ReadableStream({
    start: function(controller) {
      // Flush any buffered chunks
      if (debugDataBuffer) {
        for (var i = 0; i < debugDataBuffer.length; i++) {
          controller.enqueue(debugDataBuffer[i]);
        }
        debugDataBuffer = null;
      }
      if (debugDataClosed) {
        controller.close();
        return;
      }
      debugDataWriter = controller;
    }
  });
}

function closeDebugDataStream() {
  debugDataClosed = true;
  if (debugDataWriter) {
    debugDataWriter.close();
    debugDataWriter = null;
  }
}

selfGlobal.__next_debug = selfGlobal.__next_debug || [];
selfGlobal.__next_debug.push = debugDataCallback;

// ---------------------------------------------------------------------------
// Server Action Support
//
// When React calls a server action (function marked with "use server"),
// the Flight client invokes callServer(actionId, args). We serialize the
// args with encodeReply, POST to the RSC server, and return the
// deserialized response tree via createFromReadableStream.
// ---------------------------------------------------------------------------

var FLIGHT_SERVER = 'http://localhost:6000';

// Track the current fixture name for server action routing.
// Set by SSR bootstrap or by the native side when navigating to a fixture.
var currentFixtureName = null;

// Track the current React root so we can re-render after server actions.
var currentRoot = null;

function callServer(id, args) {
  // Encode the arguments using the Flight reply protocol.
  // encodeReply returns Promise<string | FormData>.
  // For now we only handle the string case (no binary blobs in args).
  return encodeReply(args).then(function(body) {
    var fixtureName = currentFixtureName || 'kitchen-sink';
    var url = FLIGHT_SERVER + '/fixtures/' + fixtureName;

    // Create a ReadableStream that will be fed by the $$fetch callback.
    // We create it eagerly so createFromReadableStream can start consuming
    // while data is still arriving (true streaming).
    var streamController = null;
    var encoder = new TextEncoder();

    var responseStream = new ReadableStream({
      start: function(controller) {
        streamController = controller;
      }
    });

    // Start consuming the response stream immediately.
    // createFromReadableStream returns a thenable (React promise) that
    // resolves to the deserialized React element tree.
    var result = ReactFlightClient.createFromReadableStream(
      responseStream,
      { callServer: callServer }
    );

    // POST to the RSC server.
    // After Step 1, $$fetch accepts (url, options, callback).
    $$fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'rsc-action': id,
        'Content-Type': typeof body === 'string' ? 'text/plain' : 'multipart/form-data',
      },
      body: typeof body === 'string' ? body : '',
    }, function(type, data) {
      if (type === 'error') {
        if (streamController) {
          streamController.error(new Error('Server action failed: ' + data));
        }
        return;
      }
      if (type === 'data') {
        if (streamController && data) {
          streamController.enqueue(encoder.encode(data));
        }
        return;
      }
      if (type === 'end') {
        if (streamController) {
          streamController.close();
          streamController = null;
        }
        // After the action response is fully received, re-fetch the fixture
        // to get updated server state (e.g. new todos). This runs after
        // useActionState processes the return value.
        refetchCurrentFixture();
      }
    });

    return result;
  });
}

// Re-fetch the current fixture's Flight stream to get updated server state
// after a server action has mutated data. Renders the new tree into the
// existing React root.
function refetchCurrentFixture() {
  var fixtureName = currentFixtureName;
  if (!fixtureName || !currentRoot) return;

  var url = FLIGHT_SERVER + '/fixtures/' + fixtureName;
  var controller = null;
  var encoder = new TextEncoder();

  var stream = new ReadableStream({
    start: function(c) { controller = c; }
  });

  var tree = ReactFlightClient.createFromReadableStream(stream, {
    callServer: callServer,
  });

  $$fetch(url, {
    headers: {'Accept': 'text/x-component'},
  }, function(type, data) {
    if (type === 'data' && controller && data) {
      controller.enqueue(encoder.encode(data));
    } else if (type === 'end' && controller) {
      controller.close();
      controller = null;
    } else if (type === 'error' && controller) {
      controller.error(new Error('Refetch failed: ' + data));
      controller = null;
    }
  });

  Promise.resolve(tree).then(function(element) {
    if (currentRoot) {
      startTransition(function() {
        currentRoot.render(createElement(Root, {tree: Promise.resolve(element)}));
      });
    }
  });
}

function Root(props) {
  return use(props.tree);
}

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

  // Re-fetches and evaluates changed webpack chunks. Called by Swift during
  // Fast Refresh before $$performFastRefresh. Uses the document polyfill's
  // script loading (createElement('script') + head.appendChild).
  // Returns a Promise that resolves when all chunks are loaded.
  globalThis.$$refreshChunks = function $$refreshChunks(filenames) {
    var ic = __webpack_require__.ic;
    var promises = [];
    for (var i = 0; i < filenames.length; i++) {
      // Clear installed status so webpack's JSONP handler re-registers modules
      if (ic) {
        // Find the chunk ID for this filename by checking all installed chunks.
        // The ic object maps chunkId → 0 (installed) or Promise (loading).
        // We clear all entries to force re-load.
        var keys = Object.keys(ic);
        for (var j = 0; j < keys.length; j++) {
          delete ic[keys[j]];
        }
      }
      (function(filename) {
        promises.push(new Promise(function(resolve, reject) {
          var script = document.createElement('script');
          script.src = '/' + filename;
          script.onload = resolve;
          script.onerror = function() {
            reject(new Error('Failed to load chunk: ' + filename));
          };
          document.head.appendChild(script);
        }));
      })(filenames[i]);
    }
    return Promise.all(promises);
  };
}

// ---------------------------------------------------------------------------
// Global API exposed to native Swift code
// ---------------------------------------------------------------------------

globalThis.__REACT_DOM_NATIVE__ = {
  // Called by native to render from a Flight data stream.
  // Swift has already bootstrapped self.__next_f and will push Flight data
  // via self.__next_f.push([1, data]).
  renderFromStream: function renderFromStream(surfaceId) {
    var stream = createFlightDataStream();
    var tree = ReactFlightClient.createFromReadableStream(stream, {
      callServer: callServer,
      debugChannel: { readable: createDebugDataStream() },
    });
    var root = createRoot({surfaceId: surfaceId});
    currentRoot = root;

    tree.then(function(element) {
      root.render(element);
    }, function(error) {
      console.error('[react-dom-native] RSC stream error: ' + error);
    });

    return root;
  },

  // Called by native to hydrate SSR content from a Flight data stream.
  // Flight data has already been pushed via self.__next_f from the SSR
  // JS instructions replayed during boot.
  hydrateFromStream: function hydrateFromStream(surfaceId) {
    var stream = createFlightDataStream();
    var tree = ReactFlightClient.createFromReadableStream(stream, {
      callServer: callServer,
      debugChannel: { readable: createDebugDataStream() },
    });

    var formState = globalThis.__REACT_DOM_NATIVE__._formState || null;
    startTransition(function() {
      currentRoot = hydrateRoot(
        {surfaceId: surfaceId},
        createElement(Root, {tree: tree}),
        { formState: formState }
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

  // Set the current fixture name for callServer routing
  _setFixtureName: function _setFixtureName(name) {
    currentFixtureName = name;
  },

  // Close the Flight data stream (called when SSR/CSR stream ends)
  __closeFlightDataStream__: closeFlightDataStream,

  // Close the debug data stream (called when SSR/CSR stream ends)
  __closeDebugDataStream__: closeDebugDataStream,

  // Create a ReadableStream from buffered Flight data
  __createFlightDataStream__: createFlightDataStream,
};

if (typeof $$log !== 'undefined') {
  $$log('react-dom-native runtime loaded v0.0.1');
}
