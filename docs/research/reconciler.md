# Research: React Reconciler Host Config API

> Source: `react/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js`
> Reference renderer: `react/packages/react-noop-renderer/src/createReactNoop.js`
> Real-world reference: `react/packages/react-native-renderer/src/ReactFiberConfigNative.js`

## Overview

The `react-reconciler` package accepts a **host config** object that defines how the reconciler interacts with the host environment. The config is passed as an argument to the reconciler factory function. The reconciler uses it as a module-level dependency via the `$$$config` injection pattern.

The host config exports **opaque types** (Instance, TextInstance, Container, etc.) and **functions** organized by lifecycle phase. The reconciler operates in one of two modes:

- **Mutation mode** (`supportsMutation: true`) -- the reconciler mutates existing host instances in place. This is what react-dom and React Native Paper use.
- **Persistent mode** (`supportsPersistence: true`) -- the reconciler clones instances on each update. This is what React Native Fabric uses.

**react-dom-native will use persistent mode**, matching React Native Fabric's architecture. This provides:
- Thread safety through immutability
- Support for concurrent features (React 18+)
- Structural sharing for memory efficiency
- Alignment with React's direction

See `docs/research/persistent-mode-analysis.md` for full comparison.

## Pre-Built Stub Modules

React provides "WithNo" modules that export shim implementations for optional feature sets. A renderer can re-export from these to opt out of features:

| Module | Opts out of |
|--------|-------------|
| `ReactFiberConfigWithNoHydration.js` | SSR hydration (40 functions) |
| `ReactFiberConfigWithNoPersistence.js` | Persistent mode (7 functions) |
| `ReactFiberConfigWithNoResources.js` | Resource hoisting (14 functions) |
| `ReactFiberConfigWithNoSingletons.js` | Singleton elements like `<html>`, `<head>` (5 functions) |
| `ReactFiberConfigWithNoTestSelectors.js` | Test selector API (7 functions) |
| `ReactFiberConfigWithNoMicrotasks.js` | Microtask scheduling (2 functions) |
| `ReactFiberConfigWithNoScopes.js` | React Scopes (2 functions) |
| `ReactFiberConfigWithNoMutation.js` | Mutation mode |

React Native Fabric uses all of these except NoPersistence (it uses persistent mode). For react-dom-native we will follow the same pattern, using persistent mode.

---

## Complete Function Reference

### 1. Instance Creation

These functions create and configure host instances during the render/complete phase.

| Function | Signature (from noop) | Required | Noop Implementation | RN Implementation | Notes for react-dom-native |
|----------|----------------------|----------|---------------------|-------------------|---------------------------|
| `createInstance` | `(type, props, rootContainer, hostContext, internalHandle) => Instance` | Yes | Creates JS object with `{id, type, children, text, prop, hidden, context}` | Allocates native tag, calls `UIManager.createView()`, creates `ReactNativeFiberHostComponent` | **Real logic needed.** Must create native view node via bridge, store Yoga layout node. Core function. |
| `createTextInstance` | `(text, rootContainer, hostContext, internalHandle) => TextInstance` | Yes | Creates JS object `{text, id, parent, hidden, context}` | Allocates tag, calls `UIManager.createView('RCTRawText', ...)` | **Real logic needed.** Must create text node, bridge to native UILabel/text rendering. |
| `appendInitialChild` | `(parentInstance, child) => void` | Yes | Pushes child to parent's children array | Pushes child to parent's `_children` array | **Real logic needed.** Must add child Yoga node to parent Yoga node. |
| `finalizeInitialChildren` | `(instance, type, props, hostContext) => boolean` | Yes | Returns `false` | Calls `UIManager.setChildren()` to batch-attach children; returns `false` | **Real logic needed.** Batch-send children to native side. Return `true` if `commitMount` should fire (for autoFocus-like behavior). |
| `shouldSetTextContent` | `(type, props) => boolean` | Yes | Returns `true` if `props.children` is string/number/bigint | Always returns `false` | Should return `false` for most elements. For `<span>` with string children only, could return `true` to avoid extra text nodes. |
| `cloneMutableInstance` | `(instance, keepChildren) => Instance` | No (new) | Throws "Not yet implemented" | Throws "Not yet implemented" | Not needed for initial implementation. |
| `cloneMutableTextInstance` | `(textInstance) => TextInstance` | No (new) | Throws "Not yet implemented" | Throws "Not yet implemented" | Not needed for initial implementation. |
| `createFragmentInstance` | `(fragmentFiber) => FragmentInstanceType` | Yes | Returns `null` | Returns `null` | Return `null`. Fragment instances are for DOM-specific fragment tracking. |
| `updateFragmentInstanceFiber` | `(fragmentFiber, fragmentInstance) => void` | Yes | Noop | Noop | Noop. |
| `commitNewChildToFragmentInstance` | `(child, fragmentInstance) => void` | Yes | Noop | Noop | Noop. |
| `deleteChildFromFragmentInstance` | `(child, fragmentInstance) => void` | Yes | Noop | Noop | Noop. |

### 2. Mutation Operations (Not Used - Persistent Mode)

These functions are called during the commit phase in mutation mode. **react-dom-native uses persistent mode instead**, so these are not implemented. See Section 13 for the persistence functions we implement instead.

| Function | Signature | Required | Noop Implementation | RN Implementation | Notes for react-dom-native |
|----------|----------|----------|---------------------|-------------------|---------------------------|
| `appendChild` | `(parentInstance, child) => void` | Yes | Splices child into parent's children array | Calls `UIManager.manageChildren()` with move or add | **Real logic needed.** Must call bridge to add child view to parent view and update Yoga tree. |
| `appendChildToContainer` | `(container, child) => void` | Yes | Same as appendChild but validates container | Calls `UIManager.setChildren()` on container tag | **Real logic needed.** Must add root-level child to container. |
| `insertBefore` | `(parentInstance, child, beforeChild) => void` | Yes | Splices child before beforeChild in array | Calls `UIManager.manageChildren()` with position calc | **Real logic needed.** Must insert child at correct position in both Yoga tree and native view hierarchy. |
| `insertInContainerBefore` | `(container, child, beforeChild) => void` | Yes | Same as insertBefore but validates container | Throws (unsupported for container) | **Real logic needed.** Insert at root container level. |
| `removeChild` | `(parentInstance, child) => void` | Yes | Removes child from parent's children array | Calls `UIManager.manageChildren()` with remove, uncaches fiber nodes | **Real logic needed.** Must remove from Yoga tree, remove native view, clean up. |
| `removeChildFromContainer` | `(container, child) => void` | Yes | Same as removeChild but validates container | Calls `UIManager.manageChildren()`, uncaches | **Real logic needed.** Remove root-level child. |
| `commitUpdate` | `(instance, type, oldProps, newProps) => void` | Yes | Updates `instance.prop`, `instance.hidden`, `instance.text` | Diffs props via `ReactNativeAttributePayload.diff()`, calls `UIManager.updateView()` | **Real logic needed. Critical function.** Must diff HTML props (style, className, event handlers), update Yoga layout properties, send prop changes to native view via bridge. |
| `commitTextUpdate` | `(textInstance, oldText, newText) => void` | Yes | Updates `textInstance.text` | Calls `UIManager.updateView('RCTRawText', {text})` | **Real logic needed.** Must update native text content via bridge. |
| `commitMount` | `(instance, type, newProps) => void` | Yes | Noop | Noop | Noop initially. Only called if `finalizeInitialChildren` returned `true`. Could be used for auto-focus. |
| `resetTextContent` | `(instance) => void` | Yes | Sets `instance.text = null` | Noop | Noop. Called before children are added to clear direct text content. |
| `clearContainer` | `(container) => void` | Yes | Splices all children | Noop (TODO in RN) | **Real logic needed.** Must remove all children from root container. |
| `hideInstance` | `(instance) => void` | Yes | Sets `instance.hidden = true` | Sets `display: 'none'` via `UIManager.updateView()` | **Real logic needed.** Must hide native view (e.g., set `isHidden = true` on UIView). |
| `hideTextInstance` | `(textInstance) => void` | Yes | Sets `textInstance.hidden = true` | Throws "Not yet implemented" | **Real logic needed.** Must hide text node. |
| `unhideInstance` | `(instance, props) => void` | Yes | Sets `instance.hidden = false` (if not `props.hidden`) | Diffs to remove `display: 'none'` | **Real logic needed.** Must show native view again. |
| `unhideTextInstance` | `(textInstance, text) => void` | Yes | Sets `textInstance.hidden = false` | Throws "Not yet implemented" | **Real logic needed.** Must show text node again. |

### 3. View Transitions (Mutation Mode)

These functions support the View Transitions API. Most can be noops for initial implementation.

| Function | Required | Noop Implementation | Notes for react-dom-native |
|----------|----------|---------------------|---------------------------|
| `applyViewTransitionName` | Yes | Noop | Stub. Not needed initially. |
| `restoreViewTransitionName` | Yes | Noop | Stub. |
| `cancelViewTransitionName` | Yes | Noop | Stub. |
| `cancelRootViewTransitionName` | Yes | Noop | Stub. |
| `restoreRootViewTransitionName` | Yes | Noop | Stub. |
| `cloneRootViewTransitionContainer` | Yes | Throws "Not yet implemented" | Stub. Throw. |
| `removeRootViewTransitionClone` | Yes | Throws "Not implemented" | Stub. Throw. |
| `measureInstance` | Yes | Returns `null` | Return `null`. |
| `measureClonedInstance` | Yes | Returns `null` | Return `null`. |
| `wasInstanceInViewport` | Yes | Returns `true` | Return `true`. |
| `hasInstanceChanged` | Yes | Returns `false` | Return `false`. |
| `hasInstanceAffectedParent` | Yes | Returns `false` | Return `false`. |
| `startViewTransition` | Yes | Calls mutation + layout + spawned callbacks synchronously, returns `null` | **Copy noop pattern.** Call callbacks synchronously, return `null`. |
| `startGestureTransition` | Yes | Calls mutation + animate callbacks, returns `null` | **Copy noop pattern.** |
| `stopViewTransition` | Yes | Noop | Stub. |
| `addViewTransitionFinishedListener` | Yes | Calls callback immediately | Call callback immediately. |
| `createViewTransitionInstance` | Yes | Returns `null` | Return `null`. |
| `getCurrentGestureOffset` | Yes | Returns `0` | Return `0`. |

### 4. Context

These functions manage host context passed down the tree during rendering.

| Function | Signature | Required | Noop Implementation | RN Implementation | Notes for react-dom-native |
|----------|----------|----------|---------------------|-------------------|---------------------------|
| `getRootHostContext` | `() => HostContext` | Yes | Returns `NO_CONTEXT` (empty frozen object) | Returns `{isInAParentText: false}` | **Real logic needed.** Should return context like `{isInTextContext: false}`. Used to track whether we're inside a `<span>`/`<p>` (text context). |
| `getChildHostContext` | `(parentContext, type) => HostContext` | Yes | Returns `UPPERCASE_CONTEXT` for `type === 'uppercase'`, else `NO_CONTEXT` | Sets `isInAParentText: true` for text-like components (RCTText, etc.) | **Real logic needed.** Must switch `isInTextContext` to `true` for `<span>`, `<p>`, `<h1>`, etc. Critical for determining which native views to create. |
| `getPublicInstance` | `(instance) => PublicInstance` | Yes | Returns instance as-is | Returns instance (with Fabric compatibility logic) | Return instance as-is initially. |

### 5. Scheduling & Priority

These functions handle scheduling, timeouts, and event priority.

| Function | Signature | Required | Noop Implementation | RN Implementation | Notes for react-dom-native |
|----------|----------|----------|---------------------|-------------------|---------------------------|
| `scheduleTimeout` | -- | Yes | `setTimeout` | `setTimeout` | Use `setTimeout`. |
| `cancelTimeout` | -- | Yes | `clearTimeout` | `clearTimeout` | Use `clearTimeout`. |
| `noTimeout` | -- | Yes | `-1` | `-1` | Use `-1`. |
| `setCurrentUpdatePriority` | `(priority) => void` | Yes | Sets module-level variable | Sets module-level variable | **Copy noop pattern.** Module-level `currentUpdatePriority` variable. |
| `getCurrentUpdatePriority` | `() => EventPriority` | Yes | Returns module-level variable | Returns module-level variable | **Copy noop pattern.** |
| `resolveUpdatePriority` | `() => EventPriority` | Yes | Returns `currentUpdatePriority` if set, else `currentEventPriority` | Returns `currentUpdatePriority` if set, else `DefaultEventPriority` | **Copy RN pattern.** Return `DefaultEventPriority` as fallback. |
| `trackSchedulerEvent` | `() => void` | Yes | Noop | Noop | Noop. |
| `resolveEventType` | `() => null \| string` | Yes | Returns `null` | Returns `null` | Return `null`. |
| `resolveEventTimeStamp` | `() => number` | Yes | Returns `-1.1` | Returns `-1.1` | Return `-1.1`. |
| `shouldAttemptEagerTransition` | `() => boolean` | Yes | Returns `false` | Returns `false` | Return `false`. |

### 6. Commit Lifecycle

These functions bracket the commit phase.

| Function | Signature | Required | Noop Implementation | RN Implementation | Notes for react-dom-native |
|----------|----------|----------|---------------------|-------------------|---------------------------|
| `prepareForCommit` | `(containerInfo) => null \| Object` | Yes | Returns `null` | Returns `null` | Return `null`. Could be used to batch native calls in the future. |
| `resetAfterCommit` | `(containerInfo) => void` | Yes | Noop | Noop | Noop initially. Could flush batched bridge calls. |
| `requestPostPaintCallback` | `(callback) => void` | Yes | Calls `callback(endTime)` immediately | Noop | Call `callback(Date.now())` or noop. Used for profiling paint timing. |

### 7. Suspense Commit

These functions support Suspense-aware commit (suspending commit while resources load).

| Function | Signature | Required | Noop Implementation | RN Implementation | Notes for react-dom-native |
|----------|----------|----------|---------------------|-------------------|---------------------------|
| `maySuspendCommit` | `(type, props) => boolean` | Yes | Returns `true` for `suspensey-thing` type | Returns `false` | Return `false`. No suspensey resources initially. |
| `maySuspendCommitOnUpdate` | `(type, oldProps, newProps) => boolean` | Yes | Similar to above | Returns `false` | Return `false`. |
| `maySuspendCommitInSyncRender` | `(type, props) => boolean` | Yes | Returns `true` | Returns `false` | Return `false`. |
| `preloadInstance` | `(instance, type, props) => boolean` | Yes | Preloads suspensey-thing resources | Returns `true` (already loaded) | Return `true`. |
| `startSuspendingCommit` | `() => SuspendedState` | Yes | Creates subscription object `{pendingCount, commit}` | Returns `null` | Return `null`. |
| `suspendInstance` | `(state, instance, type, props) => void` | Yes | Attaches listeners to suspensey things | Noop | Noop. |
| `suspendOnActiveViewTransition` | `(state, container) => void` | Yes | Noop | Noop | Noop. |
| `waitForCommitToBeReady` | `(state, timeoutOffset) => ((commit) => cancel) \| null` | Yes | Returns commit wrapper if pending, else `null` | Returns `null` | Return `null`. |
| `getSuspendedCommitReason` | `(state, rootContainer) => null \| string` | Yes | Returns `null` | Returns `null` | Return `null`. |

### 8. Renderer Metadata & Configuration

| Function / Constant | Required | Noop Value | RN Value | Notes |
|---------------------|----------|------------|----------|-------|
| `rendererVersion` | Yes | `ReactVersion` | `ReactVersion` | Use `ReactVersion` from `shared/ReactVersion`. |
| `rendererPackageName` | Yes | `'react-noop'` | `'react-native-renderer'` | Use `'react-dom-native'`. |
| `extraDevToolsConfig` | Yes | Not set (undefined) | Inspector data functions | Set to `null` or `undefined` initially. |
| `isPrimaryRenderer` | Yes | `true` | `true` | Use `true`. Only one renderer in our app. |
| `warnsIfNotActing` | Yes | `true` | `true` | Use `true`. |
| `supportsMutation` | Yes | `true` | `true` | Use `false` (persistent mode). |
| `supportsPersistence` | Yes | `false` | `false` (via WithNoPersistence) | Use `true` (persistent mode). |
| `supportsHydration` | Yes | `false` | `false` (via WithNoHydration) | Use `false`. |
| `NotPendingTransition` | Yes | `null` | `null` | Use `null`. |
| `HostTransitionContext` | Yes | Not set in noop | React context object with `$$typeof: REACT_CONTEXT_TYPE` | **Must provide.** Create a React context for host transition status. Copy RN pattern. |
| `resetFormInstance` | Yes | Noop | Noop | Noop. |
| `bindToConsole` | Yes | Binds console method with args | Same | **Copy noop pattern.** `Function.prototype.bind.apply(console[methodName], [console].concat(args))`. |

### 9. Focus & Instance Lookup

| Function | Required | Noop Implementation | Notes for react-dom-native |
|----------|----------|---------------------|---------------------------|
| `getInstanceFromNode` | Yes | Throws "Not yet implemented" | **Real logic eventually.** Maps DOM/native node back to fiber. Start with throw, implement when event system needs it. |
| `beforeActiveInstanceBlur` | Yes | Noop | Noop. |
| `afterActiveInstanceBlur` | Yes | Noop | Noop. |
| `preparePortalMount` | Yes | Noop | Noop. Portals are unlikely for native. |
| `detachDeletedInstance` | Yes | Noop | Noop. Cleanup hook for deleted instances. |

### 10. Microtasks (Optional)

Enabled by setting `supportsMicrotasks: true`.

| Function | Required | Noop Implementation | Notes for react-dom-native |
|----------|----------|---------------------|---------------------------|
| `supportsMicrotasks` | Opt-in | `true` | Use `true`. Microtasks improve scheduling. |
| `scheduleMicrotask` | If supported | `queueMicrotask` or Promise-based polyfill | Use `queueMicrotask` (available in modern JS engines). |

### 11. Scopes (Optional)

| Function | Required | Notes |
|----------|----------|-------|
| `prepareScopeUpdate` | Yes (but can shim) | Noop/shim. React Scopes are experimental. |
| `getInstanceFromScope` | Yes (but can shim) | Throw/shim. |

### 12. Test Selectors (Optional -- NOT NEEDED)

All 7 functions can use the `WithNoTestSelectors` shim. Set `supportsTestSelectors: false`.

Functions: `findFiberRoot`, `getBoundingRect`, `getTextContent`, `isHiddenSubtree`, `matchAccessibilityRole`, `setFocusIfFocusable`, `setupIntersectionObserver`.

### 13. Persistence (REQUIRED - We Use This)

These functions are required for persistent mode. Set `supportsPersistence: true`.

| Function | Signature | Required | Description | Notes for react-dom-native |
|----------|----------|----------|-------------|---------------------------|
| `cloneInstance` | `(instance, type, oldProps, newProps, keepChildren, recyclableInstance) => Instance` | Yes | Clone instance with new props | **Real logic needed.** Clone shadow node via C++, apply new props. |
| `cloneHiddenInstance` | `(instance, type, props, internalInstanceHandle) => Instance` | Yes | Clone with hidden flag | **Real logic needed.** Clone with visibility hidden. |
| `cloneHiddenTextInstance` | `(instance, text, internalInstanceHandle) => TextInstance` | Yes | Clone hidden text | **Real logic needed.** Clone text node with visibility hidden. |
| `createContainerChildSet` | `(container) => ChildSet` | Yes | Create child set for container | Return empty array. |
| `appendChildToContainerChildSet` | `(childSet, child) => void` | Yes | Add child to set | Push child to array. |
| `finalizeContainerChildren` | `(container, newChildren) => void` | Yes | Prepare for atomic swap | Can be no-op. |
| `replaceContainerChildren` | `(container, newChildren) => void` | Yes | Atomic root replacement | **Real logic needed.** Diff old/new trees, apply mutations to native. |

See `docs/research/persistent-mode-analysis.md` for full implementation details.

### 14. Hydration (Optional -- NOT NEEDED)

All 40 functions can use the `WithNoHydration` shim. Set `supportsHydration: false`.

Functions include: `isSuspenseInstancePending`, `isSuspenseInstanceFallback`, `getSuspenseInstanceFallbackErrorDetails`, `registerSuspenseInstanceRetry`, `canHydrateFormStateMarker`, `isFormStateMarkerMatching`, `getNextHydratableSibling`, `getNextHydratableSiblingAfterSingleton`, `getFirstHydratableChild`, `getFirstHydratableChildWithinContainer`, `getFirstHydratableChildWithinActivityInstance`, `getFirstHydratableChildWithinSuspenseInstance`, `getFirstHydratableChildWithinSingleton`, `canHydrateInstance`, `canHydrateTextInstance`, `canHydrateActivityInstance`, `canHydrateSuspenseInstance`, `hydrateInstance`, `hydrateTextInstance`, `hydrateActivityInstance`, `hydrateSuspenseInstance`, `getNextHydratableInstanceAfterActivityInstance`, `getNextHydratableInstanceAfterSuspenseInstance`, `finalizeHydratedChildren`, `commitHydratedInstance`, `commitHydratedContainer`, `commitHydratedActivityInstance`, `commitHydratedSuspenseInstance`, `flushHydrationEvents`, `clearActivityBoundary`, `clearSuspenseBoundary`, `clearActivityBoundaryFromContainer`, `clearSuspenseBoundaryFromContainer`, `hideDehydratedBoundary`, `unhideDehydratedBoundary`, `shouldDeleteUnhydratedTailInstances`, `diffHydratedPropsForDevWarnings`, `diffHydratedTextForDevWarnings`, `describeHydratableInstanceForDevWarnings`, `validateHydratableInstance`, `validateHydratableTextInstance`.

### 15. Resources (Optional -- NOT NEEDED)

All 14 functions can use the `WithNoResources` shim. Set `supportsResources: false`.

Functions: `isHostHoistableType`, `getHoistableRoot`, `getResource`, `acquireResource`, `releaseResource`, `hydrateHoistable`, `mountHoistable`, `unmountHoistable`, `createHoistableInstance`, `prepareToCommitHoistables`, `mayResourceSuspendCommit`, `preloadResource`, `suspendResource`.

### 16. Singletons (Optional -- NOT NEEDED)

All 5 functions can use the `WithNoSingletons` shim. Set `supportsSingletons: false`.

Functions: `resolveSingletonInstance`, `acquireSingletonInstance`, `releaseSingletonInstance`, `isHostSingletonType`, `isSingletonScope`.

---

## Summary: Implementation Tiers for react-dom-native (Persistent Mode)

### Tier 1: Real Implementation Required (Core)

These functions need real logic that talks to the bridge/Yoga/native:

| Function | Why |
|----------|-----|
| `createInstance` | Creates native UIView via bridge + Yoga layout node |
| `createTextInstance` | Creates native text view |
| `appendInitialChild` | Builds initial Yoga tree |
| `finalizeInitialChildren` | Batch-sends children to native |
| `cloneInstance` | **Critical for persistent mode.** Clones shadow node with new props |
| `cloneHiddenInstance` | Clones instance with hidden visibility |
| `cloneHiddenTextInstance` | Clones text instance with hidden visibility |
| `createContainerChildSet` | Creates child set for atomic root update |
| `appendChildToContainerChildSet` | Adds child to container child set |
| `replaceContainerChildren` | **Critical.** Atomically replaces root children, triggers diff + mutations |
| `getRootHostContext` | Returns initial context (text context tracking) |
| `getChildHostContext` | Switches context for text elements |

**Total: 12 functions** (fewer than mutation mode because tree structure changes happen via cloning)

### Tier 2: Simple Logic (Copy from noop/RN)

These need simple implementations but no bridge calls:

| Function | Implementation |
|----------|---------------|
| `shouldSetTextContent` | Return `false` (like RN) |
| `getPublicInstance` | Return instance as-is |
| `prepareForCommit` | Return `null` |
| `resetAfterCommit` | Noop |
| `commitMount` | Noop |
| `resetTextContent` | Noop |
| `setCurrentUpdatePriority` | Module-level variable |
| `getCurrentUpdatePriority` | Module-level variable |
| `resolveUpdatePriority` | Return currentUpdatePriority or DefaultEventPriority |
| `scheduleTimeout` | `setTimeout` |
| `cancelTimeout` | `clearTimeout` |
| `noTimeout` | `-1` |
| `bindToConsole` | `Function.prototype.bind.apply(...)` |
| `requestPostPaintCallback` | Call callback immediately |
| `HostTransitionContext` | Create React context object |
| `NotPendingTransition` | `null` |
| `scheduleMicrotask` | `queueMicrotask` |

**Total: 17 functions**

### Tier 3: Stubs / Noops (Can use noop or shim implementations)

| Function | Implementation |
|----------|---------------|
| `rendererVersion` | `ReactVersion` |
| `rendererPackageName` | `'react-dom-native'` |
| `extraDevToolsConfig` | `null` |
| `isPrimaryRenderer` | `true` |
| `warnsIfNotActing` | `true` |
| `supportsMutation` | `false` |
| `supportsPersistence` | `true` |
| `supportsHydration` | `false` |
| `supportsMicrotasks` | `true` |
| `supportsSingletons` | `false` |
| `supportsResources` | `false` |
| `supportsTestSelectors` | `false` |
| `trackSchedulerEvent` | Noop |
| `resolveEventType` | Return `null` |
| `resolveEventTimeStamp` | Return `-1.1` |
| `shouldAttemptEagerTransition` | Return `false` |
| `getInstanceFromNode` | Throw initially |
| `beforeActiveInstanceBlur` | Noop |
| `afterActiveInstanceBlur` | Noop |
| `preparePortalMount` | Noop |
| `prepareScopeUpdate` | Noop |
| `getInstanceFromScope` | Throw |
| `detachDeletedInstance` | Noop |
| `resetFormInstance` | Noop |
| `cloneMutableInstance` | Throw |
| `cloneMutableTextInstance` | Throw |
| `createFragmentInstance` | Return `null` |
| `updateFragmentInstanceFiber` | Noop |
| `commitNewChildToFragmentInstance` | Noop |
| `deleteChildFromFragmentInstance` | Noop |
| All `maySuspend*` functions | Return `false` |
| `preloadInstance` | Return `true` |
| `startSuspendingCommit` | Return `null` |
| `suspendInstance` | Noop |
| `suspendOnActiveViewTransition` | Noop |
| `waitForCommitToBeReady` | Return `null` |
| `getSuspendedCommitReason` | Return `null` |
| All View Transition functions (17) | Noop/stub (see section 3) |

**Total: ~50+ functions (many from "WithNo" shims)**

### Tier 4: Feature Shims (Use "WithNo" modules)

These entire feature sets are disabled via shim modules:

| Feature | Functions | Shim Module |
|---------|-----------|-------------|
| Hydration | 40 | `ReactFiberConfigWithNoHydration` |
| Mutation | 17 | `ReactFiberConfigWithNoMutation` |
| Resources | 14 | `ReactFiberConfigWithNoResources` |
| Singletons | 5 | `ReactFiberConfigWithNoSingletons` |
| Test Selectors | 7 | `ReactFiberConfigWithNoTestSelectors` |

**Note:** We use persistent mode, so we shim mutation instead of persistence.

**Total: 83 functions (all auto-shimmed)**

---

## Key Architecture Decisions

### 1. Types

The host config defines these opaque types that flow through the reconciler:

```
Type = string          // HTML element tag name ('div', 'span', 'p', etc.)
Props = Object         // HTML element props (style, className, children, event handlers)
Container = Object     // Root container (wraps the root native view)
Instance = Object      // A native view node (UIView + Yoga node)
TextInstance = Object   // A native text node (UILabel + Yoga node)
HostContext = Object    // Context passed down tree (e.g., {isInTextContext: boolean})
PublicInstance = Object // What refs point to (same as Instance for us)
```

### 2. cloneInstance is the Most Important Function (Persistent Mode)

In persistent mode, `cloneInstance` is called whenever props change on a host instance (instead of `commitUpdate`). For react-dom-native, this function must:

1. Create a new instance (shadow node clone) with the new props
2. Apply new Yoga layout properties to the cloned node
3. Share unchanged children via structural sharing (if `keepChildren` is true)
4. Return the new immutable instance

The actual native view updates happen in `replaceContainerChildren`, which compares old and new trees using a Differentiator and generates mutations to apply to native views.

See `docs/research/persistent-mode-analysis.md` for the full cloning and diffing architecture.

### 3. Host Context for Text Elements

`getChildHostContext` must track when we're inside text elements (`<span>`, `<p>`, `<h1>`, etc.) because:
- Inside text context: `createInstance` should create inline text containers
- Outside text context: `createInstance` should create block-level UIView containers
- `createTextInstance` behavior may differ (e.g., raw text only allowed inside text context, like RN)

### 4. Third-Party Renderer vs Fork

The `$$$config` injection pattern is for the npm `react-reconciler` package (third-party renderers). We will use this approach:

```js
const Reconciler = require('react-reconciler');
const renderer = Reconciler(hostConfig);
```

This is simpler than forking React (which is what React Native and react-dom do via build-time config replacement).

---

## Opaque Types Exported by Host Config

For reference, these are the type exports from `ReactFiberConfig.custom.js`:

| Type | Description | react-dom-native mapping |
|------|-------------|--------------------------|
| `Type` | Element type string | `string` (HTML tag name) |
| `Props` | Element props | `Object` (HTML attributes + style) |
| `Container` | Root container | `{rootTag: number, yogaNode: YogaNode}` |
| `Instance` | Host element instance | `{nativeTag: number, type: string, props: Props, yogaNode: YogaNode, children: Array}` |
| `TextInstance` | Text node instance | `{nativeTag: number, text: string}` |
| `ActivityInstance` | Activity boundary (hydration) | Not needed |
| `SuspenseInstance` | Suspense boundary (hydration) | Not needed |
| `HydratableInstance` | Hydratable node | Not needed |
| `PublicInstance` | Ref target | Same as `Instance` |
| `HostContext` | Tree context | `{isInTextContext: boolean}` |
| `UpdatePayload` | Diff result | Not used (we diff in commitUpdate) |
| `ChildSet` | Persistence child set | Not needed |
| `TimeoutHandle` | setTimeout return | `TimeoutID` |
| `NoTimeout` | Sentinel | `-1` |
| `RendererInspectionConfig` | DevTools config | `null` initially |
| `TransitionStatus` | Transition state | `mixed` |
| `FormInstance` | Form element | Same as `Instance` |
| `SuspendedState` | Commit suspension state | `null` |
| `RunningViewTransition` | View transition handle | `null` |
| `ViewTransitionInstance` | View transition instance | `null` |
| `InstanceMeasurement` | Layout measurement | `null` |
| `GestureTimeline` | Gesture provider | `null` |
| `FragmentInstanceType` | Fragment tracking | `null` |
