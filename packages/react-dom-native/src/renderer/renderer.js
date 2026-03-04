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
  var fiber = instanceHandle;
  if (!fiber) return;

  // Special handling for form submit events
  if (eventType === 'submit') {
    // The native side dispatches submit on the form view directly,
    // so the fiber here is the form fiber.
    var formFiber = fiber;

    // The form fiber must be a HostComponent (tag === 5) with type "form"
    if (formFiber.tag === 5 && formFiber.memoizedProps) {
      var action = formFiber.memoizedProps.action;
      if (typeof action === 'function') {
        // Check if a submitter button has a formAction override
        var submitterAction = null;
        if (payload && payload._submitterFiberHandle) {
          var submitterFiber = payload._submitterFiberHandle;
          if (submitterFiber.memoizedProps &&
              typeof submitterFiber.memoizedProps.formAction === 'function') {
            submitterAction = submitterFiber.memoizedProps.formAction;
          }
        }

        var finalAction = submitterAction || action;

        // Read form field values from the native submit event payload.
        // The native side collects UITextField values and passes them as _formData.
        // This is a plain object (not FormData) so encodeReply serializes it as JSON.
        var formData = (payload && payload._formData) ? payload._formData : collectFormDataFromFiber(formFiber);

        reconciler.discreteUpdates(function () {
          reconciler.startHostTransition(formFiber, {pending: true}, finalAction, formData);
        });
        reconciler.flushSyncWork();
        reconciler.flushPassiveEffects();
        return;
      }
    }
    // If no function action, fall through to normal event dispatch
  }

  // Normal event dispatch (onClick, onChange, etc.)
  var propName = 'on' + eventType.charAt(0).toUpperCase() + eventType.slice(1);
  if (fiber && fiber.memoizedProps && typeof fiber.memoizedProps[propName] === 'function') {
    // Capture timing for Interactions track
    var inputTime;
    var processingStart;
    if (typeof $$isTracing === 'function' && $$isTracing()) {
      inputTime = (payload && payload._nativeTimestamp) ? payload._nativeTimestamp : performance.now();
      processingStart = performance.now();
    }

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
    options && options.formState != null ? options.formState : null,  // formState
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
