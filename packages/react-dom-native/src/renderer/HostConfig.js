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

// Resolves lazy style refs, strips children, replaces event handlers, and
// sets form/button canary values. Returns a props dict ready to bridge.
function prepareNativeProps(type, props) {
  let resolved = props;
  const style = props.style;
  if (style != null && typeof style === 'object' && typeof style._init === 'function') {
    resolved = {...props, style: style._init(style._payload)};
  }
  const {children, ...nativeProps} = resolved;
  replaceEventHandlers(nativeProps);
  if (type === 'form' && typeof props.action === 'function') {
    nativeProps.action = true;
  }
  if ((type === 'button' || type === 'input') && typeof props.formAction === 'function') {
    nativeProps.formAction = true;
  }
  return nativeProps;
}

// ---------------------------------------------------------------------------
// Suspense boundary tracking — maps SSR boundary IDs to suspense instances
// so $$notifyBoundaryRevealed can fire retry callbacks when the Swift side
// reveals a boundary after hydration has already registered retry callbacks.
// ---------------------------------------------------------------------------
const pendingSuspenseByBoundary = new Map();

// Tracks boundary IDs that were revealed (via $$notifyBoundaryRevealed) before
// their retry callback was registered (via registerSuspenseInstanceRetry).
// This handles the race condition in progressive hydration where boundary
// content arrives from the SSR stream before React finishes setting up
// dehydrated Suspense fibers.
const preRevealedBoundaries = new Set();

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
  const nativeProps = prepareNativeProps(type, props);
  const nativeNode = $$createNode(
    type,
    rootContainer.surfaceId,
    nativeProps,
    hostContext.isInsideTextContext,
    internalHandle,
  );
  return {
    _nativeNode: nativeNode,
    _nativeFamily: nativeNode,
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
    _nativeFamily: nativeNode,
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
  let newNativeNode;
  if (keepChildren) {
    // Props changed, same children — bridge new props
    newNativeNode = $$cloneNodeWithNewProps(
      instance._nativeNode,
      prepareNativeProps(type, newProps),
    );
  } else if (oldProps === newProps) {
    // Children changed, props unchanged — skip prop bridging entirely
    newNativeNode = $$cloneNodeWithNewChildren(instance._nativeNode);
  } else {
    // Both children and props changed
    newNativeNode = $$cloneNodeWithNewChildrenAndProps(
      instance._nativeNode,
      undefined,
      prepareNativeProps(type, newProps),
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
  if (newChildren == null) {
    // Hydration commit — React reused the existing SSR tree, no children to swap.
    // Signal completion so native side can clean up SSR state.
    if (typeof $$onHydrationCommit === 'function') {
      $$onHydrationCommit(container.surfaceId);
    }
    return;
  }
  const childNodes = newChildren.map(c => c._nativeNode);
  $$completeRoot(container.surfaceId, childNodes);
  // Timing goes through renderer.onTimingCollected → $$handleSSRCommitTimings
  container.currentTree = container.pendingTree;
  container.pendingTree = null;
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

exports.NotPendingTransition = Object.freeze({
  pending: false,
  data: null,
  method: null,
  action: null,
});

exports.scheduleMicrotask = function scheduleMicrotask(fn) {
  queueMicrotask(fn);
};

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

    // If the boundary was already revealed before this retry was registered
    // (race condition in progressive hydration), fire the reveal now.
    if (preRevealedBoundaries.has(instance.boundaryId)) {
      preRevealedBoundaries.delete(instance.boundaryId);
      globalThis.$$notifyBoundaryRevealed(instance.boundaryId);
    }
  }
};
exports.canHydrateFormStateMarker = function(instance) {
  if (instance && instance.type === '#formStateMarker') {
    return instance;
  }
  return false;
};

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
    // Retry callback not registered yet — mark as pre-revealed so
    // registerSuspenseInstanceRetry can fire the reveal immediately.
    preRevealedBoundaries.add(boundaryId);
    return;
  }
  // Mark as resolved so isSuspenseInstancePending returns false
  instance.pending = false;
  // Sync pending state to Swift-side ShadowNodeWrapper
  if (typeof $$markBoundaryRevealed === 'function') {
    $$markBoundaryRevealed(instance._ssrNodeRef);
  }
  // Fire and clear retry callbacks
  var callbacks = instance._retryCallbacks;
  if (callbacks) {
    instance._retryCallbacks = null;
    for (var i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i]();
      } catch (e) {
        console.error('[Hydration] Retry callback error:', e);
      }
    }
  }
  pendingSuspenseByBoundary.delete(boundaryId);
};
exports.isFormStateMarkerMatching = function(instance) {
  return instance && instance.props && instance.props.isMatching === true;
};

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
