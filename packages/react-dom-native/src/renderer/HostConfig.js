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
  'li',
]);

// ---------------------------------------------------------------------------
// Style shorthand expansion — parse CSS shorthands before sending to native
// ---------------------------------------------------------------------------

function expandStyleShorthands(props) {
  let style = props.style;

  // Resolve Flight lazy references — the Flight protocol deduplicates shared
  // objects by using path-based references (e.g. "$0:props:children:0:props:style")
  // which arrive as lazy wrappers when the referenced chunk is self-referencing.
  if (style != null && typeof style === 'object' && typeof style._init === 'function') {
    style = style._init(style._payload);
    props = {...props, style};
  }

  if (style == null || typeof style.border !== 'string') {
    return props;
  }

  const border = style.border;
  const expanded = {};

  // Parse: "<width> <style> <color>"
  // Color may contain spaces (e.g. "rgba(255, 0, 0, 0.4)"), so we parse
  // width and style tokens from the front, then treat the rest as color.
  const match = border.match(
    /^(\d+(?:\.\d+)?(?:px|em|rem)?)\s+(\w+)\s+(.+)$/,
  );
  if (match) {
    expanded.borderWidth = parseFloat(match[1]);
    // match[2] is border-style (e.g. "solid") — ignored, CALayer is always solid
    expanded.borderColor = match[3];
  } else {
    // Fallback: try width-only ("1px") or width+color ("1px red")
    const simple = border.match(/^(\d+(?:\.\d+)?(?:px|em|rem)?)(?:\s+(.+))?$/);
    if (simple) {
      expanded.borderWidth = parseFloat(simple[1]);
      if (simple[2]) {
        expanded.borderColor = simple[2];
      }
    }
  }

  // User-specified individual props take precedence over shorthand
  const {border: _removed, ...restStyle} = style;
  const newStyle = {...expanded, ...restStyle};
  return {...props, style: newStyle};
}

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
  console.log('[HostConfig] createInstance: ' + type);
  // Strip children from props — child nodes are managed by the reconciler
  // via appendInitialChild, not stored as props on the native node.
  // Element-type defaults (flexDirection, fontSize, etc.) are merged natively
  // in $$createNode — no JS-side merging needed.
  const {children, ...nativeProps} = expandStyleShorthands(props);
  const nativeNode = $$createNode(
    type,
    rootContainer.surfaceId,
    nativeProps,
    hostContext.isInsideTextContext,
    internalHandle,
  );
  console.log('[HostConfig] createInstance returned nativeNode: ' + (nativeNode ? 'yes' : 'no'));
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
  const {children, ...nativeNewProps} = expandStyleShorthands(newProps);
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
  console.log('[HostConfig] createContainerChildSet');
  return [];
};

exports.appendChildToContainerChildSet = function appendChildToContainerChildSet(childSet, child) {
  console.log('[HostConfig] appendChildToContainerChildSet, child type: ' + (child ? child.type : 'null'));
  childSet.push(child);
};

exports.finalizeContainerChildren = function finalizeContainerChildren(container, newChildren) {
  console.log('[HostConfig] finalizeContainerChildren, count: ' + (newChildren ? newChildren.length : 0));
  // No-op — preparation happens in replaceContainerChildren
};

exports.replaceContainerChildren = function replaceContainerChildren(container, newChildren) {
  console.log('[HostConfig] replaceContainerChildren, count: ' + (newChildren ? newChildren.length : 0));
  const childNodes = newChildren.map(c => c._nativeNode);
  console.log('[HostConfig] calling $$completeRoot with ' + childNodes.length + ' children');
  $$completeRoot(container.surfaceId, childNodes);
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
  if (instance._retryCallbacks) {
    instance._retryCallbacks.push(callback);
  } else {
    instance._retryCallbacks = [callback];
  }
};
exports.canHydrateFormStateMarker = function() { return false; };
exports.isFormStateMarkerMatching = function() { return false; };

exports.getNextHydratableSibling = function(instance) {
  var result = $$getNextSSRSibling(instance._ssrNodeRef);
  console.log('[HostConfig] getNextHydratableSibling ref=' + instance._ssrNodeRef + ' result=' + (result ? result.type : 'null'));
  return result;
};
exports.getNextHydratableSiblingAfterSingleton = function() { return null; };

exports.getFirstHydratableChild = function(instance) {
  var result = $$getSSRChildOf(instance._ssrNodeRef);
  console.log('[HostConfig] getFirstHydratableChild ref=' + instance._ssrNodeRef + ' result=' + (result ? result.type : 'null'));
  return result;
};
exports.getFirstHydratableChildWithinContainer = function(container) {
  var result = $$getFirstSSRChild(container.surfaceId);
  console.log('[HostConfig] getFirstHydratableChildWithinContainer surfaceId=' + container.surfaceId + ' result=' + (result ? JSON.stringify({type: result.type, _ssrNodeRef: result._ssrNodeRef}) : 'null'));
  return result;
};
exports.getFirstHydratableChildWithinActivityInstance = function() { return null; };
exports.getFirstHydratableChildWithinSuspenseInstance = function(instance) {
  return $$getSSRChildOf(instance._ssrNodeRef);
};
exports.getFirstHydratableChildWithinSingleton = function() { return null; };

exports.canHydrateInstance = function(instance, type, props, inRootOrSingleton) {
  console.log('[HostConfig] canHydrateInstance: instance.type=' + (instance ? instance.type : 'null') + ' fiberType=' + type + ' match=' + (instance && instance.type === type));
  if (instance.type === type) {
    return instance;
  }
  return null;
};
exports.canHydrateTextInstance = function(instance, text) {
  console.log('[HostConfig] canHydrateTextInstance: instance.type=' + (instance ? instance.type : 'null') + ' text=' + JSON.stringify(text && text.substring ? text.substring(0, 30) : text));
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
  console.log('[HostConfig] hydrateInstance: type=' + type + ' ref=' + instance._ssrNodeRef);
  instance._nativeNode = instance._ssrNodeRef;
  instance._nativeFamily = instance._ssrFamily;
  instance._internalInstanceHandle = internalHandle;
  instance.props = props;
  instance.children = [];
  return true;
};

exports.hydrateTextInstance = function(textInstance, text, internalHandle) {
  console.log('[HostConfig] hydrateTextInstance: ref=' + textInstance._ssrNodeRef + ' text=' + JSON.stringify(text && text.substring ? text.substring(0, 30) : text));
  textInstance._nativeNode = textInstance._ssrNodeRef;
  textInstance._nativeFamily = textInstance._ssrFamily;
  textInstance._internalInstanceHandle = internalHandle;
  textInstance.text = text;
  // Return true = hydration succeeded
  return true;
};

exports.hydrateActivityInstance = function() {};
exports.hydrateSuspenseInstance = function(suspenseInstance, internalHandle) {
  suspenseInstance._internalInstanceHandle = internalHandle;
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
exports.diffHydratedPropsForDevWarnings = function() { return null; };
exports.diffHydratedTextForDevWarnings = function() { return null; };
exports.describeHydratableInstanceForDevWarnings = function(instance) {
  return instance.type || '';
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
