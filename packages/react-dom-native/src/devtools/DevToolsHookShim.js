'use strict';

// ---------------------------------------------------------------------------
// React DevTools global hook shim
//
// Must load before React so the reconciler detects isDevToolsPresent = true
// and sets ProfileMode on root fibers.
//
// Captures Fiber tree commits for lightweight inspection via
// $$getComponentTree() (see ReactDevToolsAgent.js).
// ---------------------------------------------------------------------------

var renderers = new Map();
var fiberRoots = new Map(); // rendererId -> Set of FiberRoot

globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true,
  isDisabled: false,
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
