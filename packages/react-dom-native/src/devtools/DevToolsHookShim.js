'use strict';

// ---------------------------------------------------------------------------
// React DevTools global hook shim (fallback)
//
// If the full DevTools backend (ReactDevToolsSetup.js) installed the hook
// via react-devtools-core, this module is a no-op. Otherwise, it installs
// a lightweight shim so React detects isDevToolsPresent = true and enables
// ProfileMode on root fibers.
//
// Captures Fiber tree commits for lightweight inspection via
// $$getComponentTree() (see ReactDevToolsAgent.js).
// ---------------------------------------------------------------------------

// Skip if the full DevTools hook was already installed by ReactDevToolsSetup
if (globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  // Already installed — nothing to do
} else {
  var renderers = new Map();
  var fiberRoots = new Map(); // rendererId -> Set of FiberRoot

  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: renderers,
    inject: function (renderer) {
      var id = renderers.size + 1;
      renderers.set(id, renderer);
      fiberRoots.set(id, new Set());
      return id;
    },
    onCommitFiberRoot: function (rendererId, fiberRoot) {
      var roots = fiberRoots.get(rendererId);
      if (roots) {
        roots.add(fiberRoot);
      }
    },
    onCommitFiberUnmount: function () {},
    onScheduleFiberRoot: function () {},

    // Expose for ReactDevToolsAgent
    _renderers: renderers,
    _fiberRoots: fiberRoots,
  };
}
