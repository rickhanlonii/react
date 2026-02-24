'use strict';

// react-dom-native Host Config (Persistent Mode)
//
// This module implements the react-reconciler host config interface for
// react-dom-native. It operates in persistent mode (clone-on-write),
// delegating native operations to the bridge via $$ globals.

// ---------------------------------------------------------------------------
// Event priority constants — provided by the bridge
// ---------------------------------------------------------------------------
const DefaultEventPriority = 32;
const DiscreteEventPriority = 2;
const ContinuousEventPriority = 8;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let currentUpdatePriority = DefaultEventPriority;

// ---------------------------------------------------------------------------
// Event handler bridging
// ---------------------------------------------------------------------------
// JSC's toDictionary() drops function values, so event handlers like onClick
// vanish when props cross the bridge. Replace them with `true` canary values
// so the native side can check which elements have handlers and skip
// dispatching events for those that don't.
function replaceEventHandlers(props) {
  for (var key in props) {
    if (key.length > 2 && key[0] === 'o' && key[1] === 'n' && typeof props[key] === 'function') {
      props[key] = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Suspense boundary tracking — maps SSR boundary IDs to suspense instances
// so $$notifyBoundaryRevealed can fire retry callbacks when the Swift side
// reveals a boundary after hydration has already registered retry callbacks.
// ---------------------------------------------------------------------------
const pendingSuspenseByBoundary = new Map();

// ---------------------------------------------------------------------------
// Text element set — elements that create a text context for children
// ---------------------------------------------------------------------------
const TEXT_CONTEXT_ELEMENTS = new Set([
  'p',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'code',
  'kbd',
  'samp',
  'cite',
  'dfn',
  'var',
  'sub',
  'sup',
  'q',
  'time',
  'abbr',
  'data',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'legend',
  'li',
  'pre',
  'summary',
]);

// ---------------------------------------------------------------------------
// Reconciler Mode Flags
// ---------------------------------------------------------------------------
exports.supportsPersistence = true;
exports.supportsMutation = false;
exports.supportsHydration = true;
exports.supportsMicrotasks = true;

// ---------------------------------------------------------------------------
// Renderer Metadata
// ---------------------------------------------------------------------------
exports.isPrimaryRenderer = true;
exports.warnsIfNotActing = true;
exports.rendererPackageName = 'react-dom-native';
exports.rendererVersion = '0.0.1';
exports.extraDevToolsConfig = null;

// ---------------------------------------------------------------------------
// Tier 1: Core — Instance Creation
// ---------------------------------------------------------------------------

exports.createInstance = function createInstance(
  type,
  props,
  rootContainer,
  hostContext,
  internalHandle,
) {
  // Strip children from props — child nodes are managed by the reconciler
  // via appendInitialChild, not stored as props on the native node.
  // Element-type defaults and style shorthand expansion are handled natively
  // in $$createNode — no JS-side merging needed.
  let resolvedProps = props;
  // Resolve Flight lazy references — shared style objects may arrive as lazy
  // wrappers from the Flight protocol that need JS-side resolution.
  const style = props.style;
  if (style != null && typeof style === 'object' && typeof style._init === 'function') {
    resolvedProps = {...props, style: style._init(style._payload)};
  }
  const {children, ...nativeProps} = resolvedProps;
  // Replace event handler functions with `true` so they survive toDictionary()
  // across the JSC bridge. The native side uses these canary values to skip
  // dispatching events for views without handlers.
  replaceEventHandlers(nativeProps);
  const nativeNode = $$createNode(
    type,
    rootContainer.surfaceId,
    nativeProps,
    hostContext.isInsideTextContext,
    internalHandle,
  );
  return {
    _nativeNode: nativeNode,
    _nativeFamily: nativeNode._family || nativeNode,
    _internalInstanceHandle: internalHandle,
    type,
    props,
    children: [],
  };
};

exports.createTextInstance = function createTextInstance(
  text,
  rootContainer,
  hostContext,
  internalHandle,
) {
  const nativeNode = $$createTextNode(
    text,
    rootContainer.surfaceId,
    internalHandle,
  );
  return {
    _nativeNode: nativeNode,
    _nativeFamily: nativeNode._family || nativeNode,
    _internalInstanceHandle: internalHandle,
    text,
  };
};

exports.appendInitialChild = function appendInitialChild(parentInstance, child) {
  $$appendChild(parentInstance._nativeNode, child._nativeNode);
  parentInstance.children.push(child);
};

exports.finalizeInitialChildren = function finalizeInitialChildren(
  instance,
  type,
  props,
  hostContext,
) {
  return false;
};

exports.shouldSetTextContent = function shouldSetTextContent(type, props) {
  return false;
};

// ---------------------------------------------------------------------------
// Tier 1: Core — Persistent Mode
// ---------------------------------------------------------------------------

exports.cloneInstance = function cloneInstance(
  instance,
  type,
  oldProps,
  newProps,
  keepChildren,
  recyclable,
) {
  let resolvedNewProps = newProps;
  const newStyle = newProps.style;
  if (newStyle != null && typeof newStyle === 'object' && typeof newStyle._init === 'function') {
    resolvedNewProps = {...newProps, style: newStyle._init(newStyle._payload)};
  }
  const {children, ...nativeNewProps} = resolvedNewProps;
  replaceEventHandlers(nativeNewProps);
  let newNativeNode;
  if (keepChildren) {
    newNativeNode = $$cloneNodeWithNewProps(instance._nativeNode, nativeNewProps);
  } else {
    newNativeNode = $$cloneNodeWithNewChildrenAndProps(
      instance._nativeNode,
      undefined,
      nativeNewProps,
    );
  }
  return {
    _nativeNode: newNativeNode,
    _nativeFamily: instance._nativeFamily,
    _internalInstanceHandle: instance._internalInstanceHandle,
    type,
    props: newProps,
    children: keepChildren ? instance.children : [],
  };
};

exports.cloneHiddenInstance = function cloneHiddenInstance(instance, type, props, internalHandle) {
  const hiddenProps = {...props, style: {...(props.style || {}), display: 'none'}};
  const newNativeNode = $$cloneNodeWithNewProps(
    instance._nativeNode,
    hiddenProps,
  );
  return {
    _nativeNode: newNativeNode,
    _nativeFamily: instance._nativeFamily,
    _internalInstanceHandle: internalHandle,
    type,
    props: hiddenProps,
    children: instance.children,
  };
};

exports.cloneHiddenTextInstance = function cloneHiddenTextInstance(instance, text, internalHandle) {
  const newNativeNode = $$cloneNodeWithNewProps(instance._nativeNode, {
    text: '',
    hidden: true,
  });
  return {
    _nativeNode: newNativeNode,
    _nativeFamily: instance._nativeFamily,
    _internalInstanceHandle: internalHandle,
    text: '',
  };
};

exports.createContainerChildSet = function createContainerChildSet() {
  return [];
};

exports.appendChildToContainerChildSet = function appendChildToContainerChildSet(childSet, child) {
  childSet.push(child);
};

exports.finalizeContainerChildren = function finalizeContainerChildren(container, newChildren) {
  // No-op — preparation happens in replaceContainerChildren
};

exports.replaceContainerChildren = function replaceContainerChildren(container, newChildren) {
  if (newChildren == null) return;
  const childNodes = newChildren.map(c => c._nativeNode);
  const timings = $$completeRoot(container.surfaceId, childNodes);
  if (timings) {
    reportNativeCommitTimings(timings);
  }
  container.currentTree = container.pendingTree;
  container.pendingTree = null;
};

// ---------------------------------------------------------------------------
// Native commit performance tracing
// ---------------------------------------------------------------------------

function durationColor(startMs, endMs) {
  var duration = endMs - startMs;
  return duration < 0.5 ? 'primary-light' : duration < 50 ? 'primary' : 'primary-dark';
}

function reportNativeCommitTimings(t) {
  var tracer = globalThis.__PERFORMANCE_TRACER__;
  if (!tracer || !tracer.isTracing()) return;

  // Native timestamps are absolute (CACurrentMediaTime * 1000, ms since boot).
  // JS timestamps are relative (performance.now() = $$performanceNow() - timeOrigin).
  // Derive the actual timeOrigin from the relationship between absolute and
  // relative clocks. Don't use performance.timeOrigin — JSC may have a built-in
  // read-only value (set at JSContext creation) that differs from the polyfill's
  // timeOrigin (set at bundle evaluation), causing a ~50ms misalignment equal
  // to the bundle fetch time.
  var origin = typeof $$performanceNow === 'function'
    ? $$performanceNow() - performance.now()
    : performance.timeOrigin;
  var commitStart = t.commitStart - origin;
  var commitEnd = t.commitEnd - origin;
  var layoutStart = t.layoutStart - origin;
  var layoutEnd = t.layoutEnd - origin;
  var diffStart = t.diffStart - origin;
  var diffEnd = t.diffEnd - origin;
  var mutationsStart = t.mutationsStart - origin;
  var mutationsEnd = t.mutationsEnd - origin;
  var syncStart = (t.syncStart || 0) - origin;
  var syncEnd = (t.syncEnd || 0) - origin;
  var yogaStart = (t.yogaStart || 0) - origin;
  var yogaEnd = (t.yogaEnd || 0) - origin;
  var textRemeasureStart = (t.textRemeasureStart || 0) - origin;
  var textRemeasureEnd = (t.textRemeasureEnd || 0) - origin;
  var scrollStart = (t.scrollStart || 0) - origin;
  var scrollEnd = (t.scrollEnd || 0) - origin;

  // Shadow Tree track — outer Commit span
  var label = t.label || 'Commit';
  tracer.reportTimeStamp(label, commitStart, commitEnd,
    'Shadow Tree', 'Native \u269b', durationColor(commitStart, commitEnd),
    [['Nodes', String(t.nodeCount)],
     ['Tree depth', String(t.treeDepth)],
     ['Root elements', t.rootTypes]]);

  // Shadow Tree track — sub-spans
  var prepareStart = (t.prepareStart || 0) - origin;
  var prepareEnd = (t.prepareEnd || 0) - origin;
  if (prepareEnd > prepareStart) {
    tracer.reportTimeStamp('Prepare', prepareStart, prepareEnd,
      'Shadow Tree', 'Native \u269b', durationColor(prepareStart, prepareEnd));
  }
  if (layoutEnd > layoutStart) {
    tracer.reportTimeStamp('Blocked (Layout)', layoutStart, layoutEnd,
      'Shadow Tree', 'Native \u269b', 'secondary-light');
  }
  if (diffEnd > diffStart) {
    tracer.reportTimeStamp('Diff', diffStart, diffEnd,
      'Shadow Tree', 'Native \u269b', durationColor(diffStart, diffEnd),
      [['Mutations', String(t.mutationCount)],
       ['Creates', String(t.creates)],
       ['Updates', String(t.updates)],
       ['Deletes', String(t.deletes)]]);
  }
  if (mutationsEnd > mutationsStart) {
    tracer.reportTimeStamp('Apply Mutations (' + t.mutationCount + ')', mutationsStart, mutationsEnd,
      'Shadow Tree', 'Native \u269b', durationColor(mutationsStart, mutationsEnd),
      [['Inserts', String(t.inserts)],
       ['Removes', String(t.removes)],
       ['Affected elements', t.affectedTypes || 'none']]);
  }
  if (syncEnd > syncStart) {
    tracer.reportTimeStamp('Sync Frames', syncStart, syncEnd,
      'Shadow Tree', 'Native \u269b', durationColor(syncStart, syncEnd));
  }

  var cleanupStart = (t.cleanupStart || 0) - origin;
  var cleanupEnd = (t.cleanupEnd || 0) - origin;
  if (cleanupEnd > cleanupStart) {
    tracer.reportTimeStamp('Cleanup', cleanupStart, cleanupEnd,
      'Shadow Tree', 'Native \u269b', durationColor(cleanupStart, cleanupEnd));
  }

  // Cleanup sub-spans
  var treePromoteStart = (t.treePromoteStart || 0) - origin;
  var treePromoteEnd = (t.treePromoteEnd || 0) - origin;
  if (treePromoteEnd > treePromoteStart) {
    tracer.reportTimeStamp('Tree Promote', treePromoteStart, treePromoteEnd,
      'Shadow Tree', 'Native \u269b', durationColor(treePromoteStart, treePromoteEnd));
  }

  var nodeGCStart = (t.nodeGCStart || 0) - origin;
  var nodeGCEnd = (t.nodeGCEnd || 0) - origin;
  if (nodeGCEnd > nodeGCStart) {
    tracer.reportTimeStamp('Node GC', nodeGCStart, nodeGCEnd,
      'Shadow Tree', 'Native \u269b', durationColor(nodeGCStart, nodeGCEnd));
  }

  var devtoolsNotifyStart = (t.devtoolsNotifyStart || 0) - origin;
  var devtoolsNotifyEnd = (t.devtoolsNotifyEnd || 0) - origin;
  if (devtoolsNotifyEnd > devtoolsNotifyStart) {
    tracer.reportTimeStamp('DevTools Notify', devtoolsNotifyStart, devtoolsNotifyEnd,
      'Shadow Tree', 'Native \u269b', durationColor(devtoolsNotifyStart, devtoolsNotifyEnd));
  }

  // Layout track — outer Calculate Layout span
  if (layoutEnd > layoutStart) {
    tracer.reportTimeStamp('Calculate Layout', layoutStart, layoutEnd,
      'Layout', 'Native \u269b', durationColor(layoutStart, layoutEnd),
      [['Nodes', String(t.nodeCount)],
       ['Second pass', t.didRemeasure ? 'yes' : 'no']]);
  }

  // Layout track — sub-spans
  if (yogaEnd > yogaStart) {
    tracer.reportTimeStamp('Yoga', yogaStart, yogaEnd,
      'Layout', 'Native \u269b', durationColor(yogaStart, yogaEnd),
      [['Nodes', String(t.nodeCount)]]);
  }
  if (t.didRemeasure) {
    tracer.reportTimeStamp('Text Remeasure', textRemeasureStart, textRemeasureEnd,
      'Layout', 'Native \u269b', 'warning');
  }

  var readFramesStart = (t.readFramesStart || 0) - origin;
  var readFramesEnd = (t.readFramesEnd || 0) - origin;
  if (readFramesEnd > readFramesStart) {
    tracer.reportTimeStamp('Read Frames', readFramesStart, readFramesEnd,
      'Layout', 'Native \u269b', durationColor(readFramesStart, readFramesEnd),
      [['Nodes', String(t.nodeCount)]]);
  }

  if (scrollEnd > scrollStart) {
    tracer.reportTimeStamp('Scroll Content', scrollStart, scrollEnd,
      'Layout', 'Native \u269b', durationColor(scrollStart, scrollEnd));
  }

  // Diff Nodes — per-node timing, nested below Diff on Shadow Tree track
  var diffNodes = t.diffNodes;
  if (diffNodes && diffNodes.length > 0) {
    for (var i = 0; i < diffNodes.length; i += 3) {
      tracer.reportTimeStamp(diffNodes[i], diffNodes[i + 1] - origin, diffNodes[i + 2] - origin,
        'Shadow Tree', 'Native \u269b', 'primary-light');
    }
  }

  // Mutation Nodes — per-mutation timing, nested below Apply Mutations on Shadow Tree track
  var mutationNodes = t.mutationNodes;
  if (mutationNodes && mutationNodes.length > 0) {
    for (var i = 0; i < mutationNodes.length; i += 4) {
      tracer.reportTimeStamp(
        mutationNodes[i] + ' ' + mutationNodes[i + 1],
        mutationNodes[i + 2] - origin,
        mutationNodes[i + 3] - origin,
        'Shadow Tree', 'Native \u269b', 'primary-light');
    }
  }

  // Layout Nodes — per-node timing from readLayoutFrames + syncAllFrames, nested on Layout track
  var layoutNodes = t.layoutNodes;
  if (layoutNodes && layoutNodes.length > 0) {
    for (var i = 0; i < layoutNodes.length; i += 3) {
      tracer.reportTimeStamp(layoutNodes[i], layoutNodes[i + 1] - origin, layoutNodes[i + 2] - origin,
        'Layout', 'Native \u269b', 'primary-light');
    }
  }
}

// ---------------------------------------------------------------------------
// SSR commit timing — pushes SSR operations onto the same Shadow Tree
// and Layout tracks as normal React commits.
// ---------------------------------------------------------------------------

// Called by native when SSR commit timings are ready (retroactively when
// tracing starts, or immediately if tracing is already active).
globalThis.$$handleSSRCommitTimings = function(timingsArray) {
  for (var i = 0; i < timingsArray.length; i++) {
    reportNativeCommitTimings(timingsArray[i]);
  }
};

// ---------------------------------------------------------------------------
// Tier 1: Core — Context
// ---------------------------------------------------------------------------

exports.getRootHostContext = function getRootHostContext() {
  return {isInsideTextContext: false};
};

exports.getChildHostContext = function getChildHostContext(parentContext, type) {
  if (TEXT_CONTEXT_ELEMENTS.has(type)) {
    if (parentContext.isInsideTextContext) {
      return parentContext;
    }
    return {isInsideTextContext: true};
  }
  if (parentContext.isInsideTextContext) {
    return {isInsideTextContext: false};
  }
  return parentContext;
};

exports.getPublicInstance = function getPublicInstance(instance) {
  return instance;
};

// ---------------------------------------------------------------------------
// Tier 2: Simple Logic
// ---------------------------------------------------------------------------

exports.prepareForCommit = function prepareForCommit() {
  return null;
};

exports.resetAfterCommit = function resetAfterCommit() {};

exports.commitMount = function commitMount() {};

exports.resetTextContent = function resetTextContent() {};

exports.setCurrentUpdatePriority = function setCurrentUpdatePriority(priority) {
  currentUpdatePriority = priority;
};

exports.getCurrentUpdatePriority = function getCurrentUpdatePriority() {
  return currentUpdatePriority;
};

exports.resolveUpdatePriority = function resolveUpdatePriority() {
  if (currentUpdatePriority !== DefaultEventPriority) {
    return currentUpdatePriority;
  }
  return DefaultEventPriority;
};

exports.scheduleTimeout = setTimeout;
exports.cancelTimeout = clearTimeout;
exports.noTimeout = -1;

exports.requestPostPaintCallback = function requestPostPaintCallback(callback) {
  callback(Date.now());
};

// HostTransitionContext — React context object for form/transition status
exports.HostTransitionContext = {
  $$typeof: Symbol.for('react.context'),
  Provider: null,
  Consumer: null,
  _currentValue: null,
  _currentValue2: null,
  _threadCount: 0,
};

exports.NotPendingTransition = null;

exports.scheduleMicrotask = queueMicrotask;

exports.resetFormInstance = function resetFormInstance() {};

exports.bindToConsole = function bindToConsole(methodName, args) {
  return Function.prototype.bind.apply(console[methodName], [
    console,
    ...args,
  ]);
};

// ---------------------------------------------------------------------------
// Tier 3: Stubs / No-ops
// ---------------------------------------------------------------------------

exports.trackSchedulerEvent = function trackSchedulerEvent() {};
exports.resolveEventType = function resolveEventType() { return null; };
exports.resolveEventTimeStamp = function resolveEventTimeStamp() { return -1.1; };
exports.shouldAttemptEagerTransition = function shouldAttemptEagerTransition() { return false; };

exports.getInstanceFromNode = function getInstanceFromNode() {
  throw new Error('getInstanceFromNode: Not yet implemented');
};

exports.beforeActiveInstanceBlur = function beforeActiveInstanceBlur() {};
exports.afterActiveInstanceBlur = function afterActiveInstanceBlur() {};
exports.preparePortalMount = function preparePortalMount() {};
exports.prepareScopeUpdate = function prepareScopeUpdate() {};

exports.getInstanceFromScope = function getInstanceFromScope() {
  throw new Error('getInstanceFromScope: Not yet implemented');
};

exports.detachDeletedInstance = function detachDeletedInstance() {};

// Fragment instances
exports.createFragmentInstance = function createFragmentInstance() { return null; };
exports.updateFragmentInstanceFiber = function updateFragmentInstanceFiber() {};
exports.commitNewChildToFragmentInstance = function commitNewChildToFragmentInstance() {};
exports.deleteChildFromFragmentInstance = function deleteChildFromFragmentInstance() {};

// Mutable clones (not needed)
exports.cloneMutableInstance = function cloneMutableInstance() {
  throw new Error('cloneMutableInstance: Not yet implemented');
};
exports.cloneMutableTextInstance = function cloneMutableTextInstance() {
  throw new Error('cloneMutableTextInstance: Not yet implemented');
};

// Suspense commit
exports.maySuspendCommit = function maySuspendCommit() { return false; };
exports.maySuspendCommitOnUpdate = function maySuspendCommitOnUpdate() { return false; };
exports.maySuspendCommitInSyncRender = function maySuspendCommitInSyncRender() { return false; };
exports.preloadInstance = function preloadInstance() { return true; };
exports.startSuspendingCommit = function startSuspendingCommit() { return null; };
exports.suspendInstance = function suspendInstance() {};
exports.suspendOnActiveViewTransition = function suspendOnActiveViewTransition() {};
exports.waitForCommitToBeReady = function waitForCommitToBeReady() { return null; };
exports.getSuspendedCommitReason = function getSuspendedCommitReason() { return null; };

// View transitions
exports.applyViewTransitionName = function applyViewTransitionName() {};
exports.restoreViewTransitionName = function restoreViewTransitionName() {};
exports.cancelViewTransitionName = function cancelViewTransitionName() {};
exports.cancelRootViewTransitionName = function cancelRootViewTransitionName() {};
exports.restoreRootViewTransitionName = function restoreRootViewTransitionName() {};

exports.cloneRootViewTransitionContainer = function cloneRootViewTransitionContainer() {
  throw new Error('cloneRootViewTransitionContainer: Not implemented');
};
exports.removeRootViewTransitionClone = function removeRootViewTransitionClone() {
  throw new Error('removeRootViewTransitionClone: Not implemented');
};

exports.measureInstance = function measureInstance() { return null; };
exports.measureClonedInstance = function measureClonedInstance() { return null; };
exports.wasInstanceInViewport = function wasInstanceInViewport() { return true; };
exports.hasInstanceChanged = function hasInstanceChanged() { return false; };
exports.hasInstanceAffectedParent = function hasInstanceAffectedParent() { return false; };

exports.startViewTransition = function startViewTransition(
  rootContainer,
  transitionTypes,
  mutationCallback,
  layoutCallback,
  afterMutationCallback,
  spawnedCallback,
) {
  mutationCallback();
  layoutCallback();
  if (afterMutationCallback) afterMutationCallback();
  if (spawnedCallback) spawnedCallback();
  return null;
};

exports.startGestureTransition = function startGestureTransition() { return null; };
exports.stopViewTransition = function stopViewTransition() {};
exports.addViewTransitionFinishedListener = function addViewTransitionFinishedListener(transition, callback) { callback(); };
exports.createViewTransitionInstance = function createViewTransitionInstance() { return null; };
exports.getCurrentGestureOffset = function getCurrentGestureOffset() { return 0; };

// ---------------------------------------------------------------------------
// Tier 4: Feature Shims — Hydration
// ---------------------------------------------------------------------------

exports.isSuspenseInstancePending = function(instance) {
  return instance.pending === true;
};
exports.isSuspenseInstanceFallback = function(instance) {
  return instance.fallback === true;
};
exports.getSuspenseInstanceFallbackErrorDetails = function() { return null; };
exports.registerSuspenseInstanceRetry = function(instance, callback) {
  // If boundary was already revealed before hydration started, the content
  // was hydrated during the initial pass — no retry needed. Firing the
  // callback would cause React to re-render the children as a client-side
  // render, creating duplicate views and tearing down the hydrated ones.
  if (instance.pending !== true) {
    return;
  }
  if (instance._retryCallbacks) {
    instance._retryCallbacks.push(callback);
  } else {
    instance._retryCallbacks = [callback];
  }
  // Track by boundary ID so $$notifyBoundaryRevealed can find this instance
  if (instance.boundaryId != null) {
    pendingSuspenseByBoundary.set(instance.boundaryId, instance);
  }
};
exports.canHydrateFormStateMarker = function() { return false; };

// ---------------------------------------------------------------------------
// Suspense boundary reveal notification (Swift -> JS)
//
// Called by the Swift SSRCoordinator when a boundary's content is revealed
// after hydration has already registered retry callbacks. This handles
// "Case B" — reveal after hydration. "Case A" (reveal before hydration)
// is handled by makeSSRNodeRef reading the updated pending=false prop.
// ---------------------------------------------------------------------------
globalThis.$$notifyBoundaryRevealed = function(boundaryId) {
  var instance = pendingSuspenseByBoundary.get(boundaryId);
  if (!instance) {
    return;
  }
  // Mark as resolved so isSuspenseInstancePending returns false
  instance.pending = false;
  // Fire and clear retry callbacks
  var callbacks = instance._retryCallbacks;
  if (callbacks) {
    instance._retryCallbacks = null;
    for (var i = 0; i < callbacks.length; i++) {
      callbacks[i]();
    }
  }
  pendingSuspenseByBoundary.delete(boundaryId);
};
exports.isFormStateMarkerMatching = function() { return false; };

exports.getNextHydratableSibling = function(instance) {
  return $$getNextSSRSibling(instance._ssrNodeRef);
};
exports.getNextHydratableSiblingAfterSingleton = function() { return null; };

exports.getFirstHydratableChild = function(instance) {
  return $$getSSRChildOf(instance._ssrNodeRef);
};
exports.getFirstHydratableChildWithinContainer = function(container) {
  return $$getFirstSSRChild(container.surfaceId);
};
exports.getFirstHydratableChildWithinActivityInstance = function() { return null; };
exports.getFirstHydratableChildWithinSuspenseInstance = function(instance) {
  return $$getSSRChildOf(instance._ssrNodeRef);
};
exports.getFirstHydratableChildWithinSingleton = function() { return null; };

exports.canHydrateInstance = function(instance, type, props, inRootOrSingleton) {
  if (instance.type === type) {
    return instance;
  }
  return null;
};
exports.canHydrateTextInstance = function(instance, text) {
  if (instance.type === '#text') {
    return instance;
  }
  return null;
};
exports.canHydrateActivityInstance = function() { return null; };
exports.canHydrateSuspenseInstance = function(instance) {
  if (instance.type === '#suspense') {
    return instance;
  }
  return null;
};

exports.hydrateInstance = function(instance, type, props, hostContext, internalHandle) {
  instance._nativeNode = instance._ssrNodeRef;
  instance._nativeFamily = instance._ssrFamily;
  instance._internalInstanceHandle = internalHandle;
  instance.props = props;
  instance.children = [];
  // Sync the fiber reference back to the Swift ShadowNodeFamily so event dispatch works.
  // Also pass whether this element has a click handler so the native tap gesture
  // can skip dispatching for elements without handlers.
  $$setInstanceHandle(instance._ssrNodeRef, internalHandle, typeof props.onClick === 'function');
  // Return truthy = hydration succeeded (reconciler checks `hydrateInstance(...) || throwOnHydrationMismatch`)
  return true;
};

exports.hydrateTextInstance = function(textInstance, text, internalHandle) {
  textInstance._nativeNode = textInstance._ssrNodeRef;
  textInstance._nativeFamily = textInstance._ssrFamily;
  textInstance._internalInstanceHandle = internalHandle;
  textInstance.text = text;
  $$setInstanceHandle(textInstance._ssrNodeRef, internalHandle);
  // Return truthy = hydration succeeded (reconciler checks `hydrateTextInstance(...) || throwOnHydrationMismatch`)
  return true;
};

exports.hydrateActivityInstance = function() {};
exports.hydrateSuspenseInstance = function(suspenseInstance, internalHandle) {
  // Set _nativeNode so cloneInstance can call $$cloneNode* on this instance.
  // Without this, the clone operation receives undefined and fails silently,
  // causing the committed tree to be missing the #suspense subtree entirely.
  suspenseInstance._nativeNode = suspenseInstance._ssrNodeRef;
  suspenseInstance._nativeFamily = suspenseInstance._ssrFamily;
  suspenseInstance._internalInstanceHandle = internalHandle;
  $$setInstanceHandle(suspenseInstance._ssrNodeRef, internalHandle);
};

exports.getNextHydratableInstanceAfterActivityInstance = function() { return null; };
exports.getNextHydratableInstanceAfterSuspenseInstance = function(instance) {
  return $$getNextSSRSibling(instance._ssrNodeRef);
};

exports.finalizeHydratedChildren = function() { return false; };
exports.commitHydratedInstance = function() {};
exports.commitHydratedContainer = function() {};
exports.commitHydratedActivityInstance = function() {};
exports.commitHydratedSuspenseInstance = function() {};
exports.flushHydrationEvents = function() {};

exports.clearActivityBoundary = function() {};
exports.clearSuspenseBoundary = function(parentInstance, suspenseInstance) {
  // Remove SSR content for this boundary so client render can replace it
};
exports.clearActivityBoundaryFromContainer = function() {};
exports.clearSuspenseBoundaryFromContainer = function(container, suspenseInstance) {
  // Remove SSR content for this boundary from the container
};

exports.hideDehydratedBoundary = function() {};
exports.unhideDehydratedBoundary = function() {};
exports.shouldDeleteUnhydratedTailInstances = function() { return false; };
exports.diffHydratedPropsForDevWarnings = function(instance, type, expectedProps, hostContext) {
  if (!instance || !instance.props) return null;
  var serverProps = instance.props;
  var diff = null;
  // Compare each expected prop against server props
  for (var propName in expectedProps) {
    if (propName === 'children') continue;
    var expected = expectedProps[propName];
    var actual = serverProps[propName];
    if (expected !== actual) {
      if (diff === null) diff = {};
      diff[propName] = actual !== undefined ? actual : null;
    }
  }
  // Check for server props not in expected
  for (var propName in serverProps) {
    if (propName === 'children' || propName === 'style') continue;
    if (!(propName in expectedProps)) {
      if (diff === null) diff = {};
      diff[propName] = serverProps[propName];
    }
  }
  return diff;
};
exports.diffHydratedTextForDevWarnings = function(textInstance, expectedText) {
  if (!textInstance) return null;
  var serverText = textInstance.text;
  if (serverText !== expectedText) {
    return serverText != null ? serverText : '';
  }
  return null;
};
exports.describeHydratableInstanceForDevWarnings = function(instance) {
  if (!instance) return '';
  if (instance.type === '#text') {
    return instance.text || '';
  }
  // Return {type, props} for describeExpandedElement to format
  return {type: instance.type, props: instance.props || {}};
};
exports.validateHydratableInstance = function(type, props, hostContext) { return true; };
exports.validateHydratableTextInstance = function() {};

// ---------------------------------------------------------------------------
// Tier 4: Feature Shims — Mutation (WithNoMutation)
// ---------------------------------------------------------------------------

exports.appendChild = function appendChild() {
  throw new Error('appendChild: Mutation mode not supported');
};
exports.appendChildToContainer = function appendChildToContainer() {
  throw new Error('appendChildToContainer: Mutation mode not supported');
};
exports.insertBefore = function insertBefore() {
  throw new Error('insertBefore: Mutation mode not supported');
};
exports.insertInContainerBefore = function insertInContainerBefore() {
  throw new Error('insertInContainerBefore: Mutation mode not supported');
};
exports.removeChild = function removeChild() {
  throw new Error('removeChild: Mutation mode not supported');
};
exports.removeChildFromContainer = function removeChildFromContainer() {
  throw new Error('removeChildFromContainer: Mutation mode not supported');
};
exports.commitUpdate = function commitUpdate() {
  throw new Error('commitUpdate: Mutation mode not supported');
};
exports.commitTextUpdate = function commitTextUpdate() {
  throw new Error('commitTextUpdate: Mutation mode not supported');
};
exports.clearContainer = function clearContainer() {
  throw new Error('clearContainer: Mutation mode not supported');
};
exports.hideInstance = function hideInstance() {
  throw new Error('hideInstance: Mutation mode not supported');
};
exports.hideTextInstance = function hideTextInstance() {
  throw new Error('hideTextInstance: Mutation mode not supported');
};
exports.unhideInstance = function unhideInstance() {
  throw new Error('unhideInstance: Mutation mode not supported');
};
exports.unhideTextInstance = function unhideTextInstance() {
  throw new Error('unhideTextInstance: Mutation mode not supported');
};

// ---------------------------------------------------------------------------
// Tier 4: Feature Shims — Resources (WithNoResources)
// ---------------------------------------------------------------------------

exports.isHostHoistableType = function() { return false; };
exports.getHoistableRoot = function() { return null; };
exports.getResource = function() { return null; };
exports.acquireResource = function() { return null; };
exports.releaseResource = function() {};
exports.hydrateHoistable = function() {};
exports.mountHoistable = function() {};
exports.unmountHoistable = function() {};
exports.createHoistableInstance = function() { return null; };
exports.prepareToCommitHoistables = function() {};
exports.mayResourceSuspendCommit = function() { return false; };
exports.preloadResource = function() {};
exports.suspendResource = function() {};

// ---------------------------------------------------------------------------
// Tier 4: Feature Shims — Singletons (WithNoSingletons)
// ---------------------------------------------------------------------------

exports.resolveSingletonInstance = function() { return null; };
exports.acquireSingletonInstance = function() {};
exports.releaseSingletonInstance = function() {};
exports.isHostSingletonType = function() { return false; };
exports.isSingletonScope = function() { return false; };

// ---------------------------------------------------------------------------
// Tier 4: Feature Shims — Test Selectors (WithNoTestSelectors)
// ---------------------------------------------------------------------------

exports.supportsTestSelectors = false;
exports.findFiberRoot = function() { return null; };
exports.getBoundingRect = function() { return null; };
exports.getTextContent = function() { return ''; };
exports.isHiddenSubtree = function() { return false; };
exports.matchAccessibilityRole = function() { return false; };
exports.setFocusIfFocusable = function() {};
exports.setupIntersectionObserver = function() { return null; };
