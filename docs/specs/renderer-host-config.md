# Spec: Renderer Host Config

## Overview

The renderer is a custom React reconciler built with the `react-reconciler` npm package, operating in **persistent mode** (`supportsPersistence: true`). It maps React element operations to native shadow node operations via the JS-to-Swift bridge.

## Module

`packages/renderer/src/HostConfig.js`

## Reconciler Mode

- `supportsPersistence: true` — immutable shadow nodes, clone-on-write updates
- `supportsMutation: false` — no direct DOM-style mutations
- `supportsHydration: false` — no SSR hydration
- `supportsMicrotasks: true` — use `queueMicrotask`

## Opaque Types

```ts
type Type = string;                    // HTML tag name: "div", "span", "p", etc.
type Props = Record<string, any>;      // HTML props: style, className, event handlers
type Container = {
  surfaceId: number;
  rootView: NativeRootView;
  width: number;
  height: number;
  currentTree: ShadowNodeHandle | null;
  pendingTree: ShadowNodeHandle | null;
};
type Instance = {
  _nativeNode: ShadowNodeHandle;       // Opaque handle wrapping immutable ShadowNode
  _nativeFamily: NativeFamilyHandle;   // Stable identity across clones
  _internalInstanceHandle: object;     // React fiber reference
  type: string;
  props: Props;
  children: Array<Instance | TextInstance>;
};
type TextInstance = {
  _nativeNode: ShadowNodeHandle;
  _nativeFamily: NativeFamilyHandle;
  _internalInstanceHandle: object;
  text: string;
};
type HostContext = {
  isInsideTextContext: boolean;
};
type ChildSet = Array<Instance | TextInstance>;
type PublicInstance = Instance;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type SuspendedState = null;
```

## Tier 1: Core Functions (Real Implementation)

### Instance Creation

#### `createInstance(type, props, rootContainer, hostContext, internalHandle) → Instance`

Creates an immutable shadow node via the bridge.

1. Call `$$createNode(type, surfaceId, props, hostContext.isInsideTextContext, internalHandle)`
2. Receive opaque node handle and family handle
3. Return `Instance` object with handles, type, props, empty children array

#### `createTextInstance(text, rootContainer, hostContext, internalHandle) → TextInstance`

Creates a text shadow node.

1. Call `$$createTextNode(text, surfaceId, internalHandle)`
2. Return `TextInstance` with handles and text

#### `appendInitialChild(parentInstance, child) → void`

Adds child to parent's shadow node during initial tree construction.

1. Call `$$appendChild(parentInstance._nativeNode, child._nativeNode)`
2. Push child to `parentInstance.children`

#### `finalizeInitialChildren(instance, type, props, hostContext) → boolean`

Called after all initial children are appended. Returns `false` (no commitMount needed).

#### `shouldSetTextContent(type, props) → boolean`

Returns `false` for all elements. Text content always creates separate TextInstance nodes.

### Persistent Mode Functions

#### `cloneInstance(instance, type, oldProps, newProps, keepChildren, recyclable) → Instance`

The most important function in persistent mode. Creates a new immutable instance with updated props.

```js
export function cloneInstance(instance, type, oldProps, newProps, keepChildren, recyclable) {
  let newNativeNode;
  if (keepChildren) {
    newNativeNode = $$cloneNodeWithNewProps(instance._nativeNode, newProps);
  } else {
    newNativeNode = $$cloneNodeWithNewChildrenAndProps(instance._nativeNode, undefined, newProps);
  }
  return {
    _nativeNode: newNativeNode,
    _nativeFamily: instance._nativeFamily,  // Same family — identity preserved
    _internalInstanceHandle: instance._internalInstanceHandle,
    type,
    props: newProps,
    children: keepChildren ? instance.children : [],
  };
}
```

#### `cloneHiddenInstance(instance, type, props, internalHandle) → Instance`

Clones an instance with hidden visibility (for Suspense).

#### `cloneHiddenTextInstance(instance, text, internalHandle) → TextInstance`

Clones a text instance with hidden visibility.

#### `createContainerChildSet(container) → ChildSet`

Returns an empty array. Used to collect new root children.

#### `appendChildToContainerChildSet(childSet, child) → void`

Pushes child to the child set array.

#### `finalizeContainerChildren(container, newChildren) → void`

No-op. Preparation happens in `replaceContainerChildren`.

#### `replaceContainerChildren(container, newChildren) → void`

The commit entry point. Atomically replaces the root's children.

```js
export function replaceContainerChildren(container, newChildren) {
  // 1. Build new tree from children
  const childNodes = newChildren.map(c => c._nativeNode);

  // 2. Commit: triggers layout calculation, tree diff, and mutation application
  $$completeRoot(container.surfaceId, childNodes);

  // 3. Update container's current tree reference
  container.currentTree = container.pendingTree;
  container.pendingTree = null;
}
```

### Context

#### `getRootHostContext() → HostContext`

Returns `{ isInsideTextContext: false }`.

#### `getChildHostContext(parentContext, type) → HostContext`

Determines whether children are in a text context:

- `<p>`, `<h1>`–`<h6>` → set `isInsideTextContext: true`
- `<span>`, `<strong>`, `<em>`, `<a>` inside text → propagate `isInsideTextContext: true`
- `<div>` and other block elements → set `isInsideTextContext: false`

#### `getPublicInstance(instance) → PublicInstance`

Returns `instance` as-is.

## Tier 2: Simple Logic (17 functions)

| Function | Implementation |
|----------|---------------|
| `prepareForCommit(container)` | Return `null` |
| `resetAfterCommit(container)` | No-op |
| `commitMount(instance, type, props)` | No-op |
| `resetTextContent(instance)` | No-op |
| `setCurrentUpdatePriority(priority)` | Set module-level variable |
| `getCurrentUpdatePriority()` | Return module-level variable |
| `resolveUpdatePriority()` | Return `currentUpdatePriority \|\| DefaultEventPriority` |
| `scheduleTimeout` | `setTimeout` |
| `cancelTimeout` | `clearTimeout` |
| `noTimeout` | `-1` |
| `bindToConsole(method, args)` | `Function.prototype.bind.apply(console[method], [console, ...args])` |
| `requestPostPaintCallback(cb)` | `cb(Date.now())` |
| `HostTransitionContext` | React context object (`{ $$typeof: REACT_CONTEXT_TYPE }`) |
| `NotPendingTransition` | `null` |
| `scheduleMicrotask` | `queueMicrotask` |
| `supportsMicrotasks` | `true` |
| `resetFormInstance` | No-op |

## Tier 3: Stubs / No-ops (~50 functions)

All view transition, suspense commit, fragment instance, and measurement functions return stubs:
- View transition functions: no-op or return `null`
- `maySuspendCommit*`: return `false`
- `preloadInstance`: return `true`
- `startSuspendingCommit`: return `null`
- `waitForCommitToBeReady`: return `null`
- `getInstanceFromNode`: throw (implement when event system needs it)
- `createFragmentInstance`: return `null`
- Fragment/portal/scope functions: no-op

## Tier 4: Feature Shims

These entire feature sets are disabled:

| Feature | Shim Module | Functions |
|---------|-------------|-----------|
| Hydration | `WithNoHydration` | 40 |
| Mutation | `WithNoMutation` | 17 |
| Resources | `WithNoResources` | 14 |
| Singletons | `WithNoSingletons` | 5 |
| Test Selectors | `WithNoTestSelectors` | 7 |

## Renderer Metadata

```js
export const rendererVersion = ReactVersion;
export const rendererPackageName = 'react-dom-native';
export const isPrimaryRenderer = true;
export const warnsIfNotActing = true;
export const extraDevToolsConfig = null;
```

## Public API

```js
// packages/renderer/src/index.js
import Reconciler from 'react-reconciler';
import * as HostConfig from './HostConfig';

const reconciler = Reconciler(HostConfig);

export function createRoot(nativeRootView) {
  const surfaceId = nextSurfaceId++;
  const container = {
    surfaceId,
    rootView: nativeRootView,
    width: nativeRootView.width,
    height: nativeRootView.height,
    currentTree: null,
    pendingTree: null,
  };
  const root = reconciler.createContainer(container, 0, null, false, null, '', null, null);
  return {
    render(element) {
      reconciler.updateContainer(element, root, null, null);
    },
    unmount() {
      reconciler.updateContainer(null, root, null, null);
    },
  };
}
```

## Integration Points

- **Bridge** (`packages/bridge/`): All `$$` prefixed functions
- **Yoga** (`packages/yoga-layout/`): Layout defaults applied in C++ during `$$createNode`
- **Components** (`packages/components/`): Element type → config mapping used in `getChildHostContext`
- **Flight Client** (`packages/flight-client/`): Feeds element tree to `createRoot().render()`
