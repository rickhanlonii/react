'use strict';

const Reconciler = require('react-reconciler');
const HostConfig = require('./HostConfig');

const reconciler = Reconciler(HostConfig);

// Register with __REACT_DEVTOOLS_GLOBAL_HOOK__ — this triggers
// injectInternals() which enables profiling hooks and DevTools integration.
reconciler.injectIntoDevTools({
  bundleType: typeof __DEV__ !== 'undefined' && __DEV__ ? 1 : 0,
  version: '19.1',
  rendererPackageName: 'react-dom-native',
});

// Register the event handler that maps native events to React props.
// When a native event arrives (e.g. type='click'), the handler looks up
// the corresponding React prop (e.g. 'onClick') on the fiber's props
// and calls it with the event payload.
//
// Events are dispatched inside discreteUpdates so state updates use SyncLane.
// Without this, updates land on DefaultLane and passive effects (useEffect,
// performance profiling) are deferred to the Scheduler's async callback,
// which may not fire reliably in JavaScriptCore.
// Collect form data by walking the fiber tree for input elements
function collectFormDataFromFiber(formFiber) {
  var data = {};
  function walk(fiber) {
    if (!fiber) return;
    if (fiber.tag === 5 && fiber.type === 'input' && fiber.memoizedProps) {
      var name = fiber.memoizedProps.name;
      if (name) {
        // Read the current React-side value (controlled inputs)
        var value = fiber.memoizedProps.value || fiber.memoizedProps.defaultValue || '';
        data[name] = value;
      }
    }
    walk(fiber.child);
    walk(fiber.sibling);
  }
  walk(formFiber.child);
  return data;
}

function urlEncodeFormData(data) {
  return Object.keys(data).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
  }).join('&');
}

$$registerEventHandler(function (instanceHandle, eventType, payload) {
  const propName = 'on' + eventType.charAt(0).toUpperCase() + eventType.slice(1);
  const fiber = instanceHandle;
  if (fiber && fiber.memoizedProps && typeof fiber.memoizedProps[propName] === 'function') {
    // Capture timing for Interactions track
    var inputTime;
    var processingStart;
    if (typeof $$isTracing === 'function' && $$isTracing()) {
      // Use native timestamp if available (more accurate — captures before bridge crossing).
      // Native timestamps are already performance.now()-relative (ms since JSRuntime init).
      inputTime = (payload && payload._nativeTimestamp) ? payload._nativeTimestamp : performance.now();
      processingStart = performance.now();
    }

    // Wrap in discreteUpdates so state updates use SyncLane (not DefaultLane).
    // This ensures passive effects (including React profiling) flush synchronously.
    reconciler.discreteUpdates(function () {
      fiber.memoizedProps[propName](payload);
    });
    reconciler.flushSyncWork();
    reconciler.flushPassiveEffects();

    if (typeof $$isTracing === 'function' && $$isTracing()) {
      var processingEnd = performance.now();
      $$reportInteraction(eventType, $$nextInteractionId(), inputTime, processingStart, processingEnd);
    }
  }

  // Handle form submit with string action (MPA form POST)
  if (eventType === 'submit' && fiber && fiber.memoizedProps) {
    var action = fiber.memoizedProps.action;
    if (typeof action === 'string' && action) {
      // String action — MPA form POST
      // Collect input values by walking the fiber tree
      var formData = collectFormDataFromFiber(fiber);
      var body = urlEncodeFormData(formData);

      $$fetch(action, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: body,
      }, function(type, data) {
        if (type === 'error') {
          console.error('[form submit] POST failed:', data);
        }
        // For MPA, the response is a new page — handle in Step 5
      });
    }
  }
});

let nextSurfaceId = 1;

function createRoot(nativeRootView) {
  console.log('[Renderer] createRoot called with surfaceId: ' + (nativeRootView.surfaceId || 'auto'));
  const surfaceId = nativeRootView.surfaceId != null
    ? nativeRootView.surfaceId
    : nextSurfaceId++;
  const container = {
    surfaceId,
    rootView: nativeRootView,
    width: nativeRootView.width || 0,
    height: nativeRootView.height || 0,
    currentTree: null,
    pendingTree: null,
  };
  const root = reconciler.createContainer(
    container,
    1,       // tag: ConcurrentRoot
    null,    // hydrationCallbacks
    false,   // isStrictMode
    null,    // concurrentUpdatesByDefaultOverride
    '',      // identifierPrefix
    function(error) {
      if (typeof $$nativeOnUncaughtError === 'function') {
        $$nativeOnUncaughtError(error.message, error.stack);
      }
    },
    function(error, errorInfo) {
      if (typeof $$nativeOnCaughtError === 'function') {
        $$nativeOnCaughtError(error.message, error.stack);
      }
    },
  );
  console.log('[Renderer] Container created for surfaceId: ' + surfaceId);
  return {
    render(element, callback) {
      console.log('[Renderer] render called with element type: ' + (element ? (element.$$typeof ? String(element.$$typeof) : typeof element) : 'null'));
      reconciler.updateContainer(element, root, null, callback || null);
      console.log('[Renderer] updateContainer completed');
    },
    unmount() {
      reconciler.updateContainer(null, root, null, null);
    },
  };
}

function noop() {}

function hydrateRoot(nativeRootView, initialElement, options) {
  console.log('[Renderer] hydrateRoot called with surfaceId: ' + (nativeRootView.surfaceId || 'auto'));
  const surfaceId = nativeRootView.surfaceId != null
    ? nativeRootView.surfaceId
    : nextSurfaceId++;
  const container = {
    surfaceId,
    rootView: nativeRootView,
    width: nativeRootView.width || 0,
    height: nativeRootView.height || 0,
    currentTree: null,
    pendingTree: null,
  };
  const root = reconciler.createHydrationContainer(
    initialElement,
    null,           // callback
    container,
    1,              // ConcurrentRoot
    null,           // hydrationCallbacks
    false,          // isStrictMode
    null,           // concurrentUpdatesByDefaultOverride
    '',             // identifierPrefix
    options && options.onUncaughtError ? options.onUncaughtError : function(error) {
      if (typeof $$nativeOnUncaughtError === 'function') {
        $$nativeOnUncaughtError(error.message, error.stack);
      }
    },
    options && options.onCaughtError ? options.onCaughtError : function(error, errorInfo) {
      if (typeof $$nativeOnCaughtError === 'function') {
        $$nativeOnCaughtError(error.message, error.stack);
      }
    },
    options && options.onRecoverableError ? options.onRecoverableError : function(error, errorInfo) {
      if (typeof $$nativeOnRecoverableError === 'function') {
        $$nativeOnRecoverableError(error.message, error.stack);
      }
    },
    noop,           // onDefaultTransitionIndicator
    null,           // transitionCallbacks
    null,           // formState
  );
  console.log('[Renderer] Hydration container created for surfaceId: ' + surfaceId);
  return {
    render(element) {
      reconciler.updateContainer(element, root, null, null);
    },
    unmount() {
      console.log('### unmount called.');
      reconciler.updateContainer(null, root, null, null);
    },
  };
}

module.exports = {createRoot, hydrateRoot, reconciler};
