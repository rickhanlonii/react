'use strict';

const Reconciler = require('react-reconciler');
const HostConfig = require('./HostConfig');

const reconciler = Reconciler(HostConfig);

// Register the event handler that maps native events to React props.
// When a native event arrives (e.g. type='click'), the handler looks up
// the corresponding React prop (e.g. 'onClick') on the fiber's props
// and calls it with the event payload.
$$registerEventHandler(function (instanceHandle, eventType, payload) {
  const propName = 'on' + eventType.charAt(0).toUpperCase() + eventType.slice(1);
  const fiber = instanceHandle;
  if (fiber && fiber.memoizedProps && typeof fiber.memoizedProps[propName] === 'function') {
    fiber.memoizedProps[propName](payload);
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
    0,       // tag: LegacyRoot
    null,    // hydrationCallbacks
    false,   // isStrictMode
    null,    // concurrentUpdatesByDefaultOverride
    '',      // identifierPrefix
    null,    // onUncaughtError
    null,    // onCaughtError
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
      console.log('[Hydration] Uncaught error: ' + error.message);
      if (error.stack) console.log('[Hydration] Stack: ' + error.stack);
    },
    options && options.onCaughtError ? options.onCaughtError : function(error, errorInfo) {
      console.log('[Hydration] Caught error: ' + error.message);
      if (error.stack) console.log('[Hydration] Stack: ' + error.stack);
    },
    options && options.onRecoverableError ? options.onRecoverableError : function(error, errorInfo) {
      console.log('[Hydration] Recoverable error: ' + error.message);
      if (error.stack) console.log('[Hydration] Stack: ' + error.stack);
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
      reconciler.updateContainer(null, root, null, null);
    },
  };
}

module.exports = {createRoot, hydrateRoot, reconciler};
