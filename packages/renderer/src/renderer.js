'use strict';

const Reconciler = require('react-reconciler');
const HostConfig = require('./HostConfig');

const reconciler = Reconciler(HostConfig);

let nextSurfaceId = 1;

function createRoot(nativeRootView) {
  const surfaceId = nextSurfaceId++;
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
  return {
    render(element) {
      reconciler.updateContainer(element, root, null, null);
    },
    unmount() {
      reconciler.updateContainer(null, root, null, null);
    },
  };
}

module.exports = {createRoot, reconciler};
