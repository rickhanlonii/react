---
name: impl-renderer
description: Implement the custom React reconciler host config. Run this first among all impl skills — others depend on it.
---

# Implement: React Renderer

## Objective

Build the react-reconciler host config (persistent mode) for react-dom-native. This is the core that lets React manage an immutable shadow tree of native views via clone-on-write semantics.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `docs/specs/renderer-host-config.md` must exist
- `docs/research/reconciler.md` must exist

## Reference Files

- `../react/packages/react-noop-renderer/src/createReactNoop.js` — Base implementation to adapt
- `../react/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` — Interface contract
- `docs/specs/renderer-host-config.md` — Full spec for persistent mode host config

## Instructions

1. Read the renderer host config spec (`docs/specs/renderer-host-config.md`)
2. Initialize `packages/react-dom-native/src/renderer/`:
   - `HostConfig.js` — host config implementation (persistent mode)
   - `renderer.js` — creates the reconciler instance, exports `createRoot()` function
   - `index.js` — public API
3. Set reconciler mode flags:
   - `supportsPersistence: true`
   - `supportsMutation: false`
   - `supportsHydration: false`
   - `supportsMicrotasks: true`
4. Define the `Instance` type using `ShadowNodeHandle`:
   ```js
   // Instance returned by createInstance
   {
     _nativeNode: ShadowNodeHandle,       // Opaque handle wrapping immutable ShadowNode
     _nativeFamily: NativeFamilyHandle,   // Stable identity across clones
     _internalInstanceHandle: object,     // React fiber reference
     type: string,
     props: Props,
     children: Array<Instance | TextInstance>,
   }
   ```
5. Implement Tier 1 core functions:
   - `createInstance(type, props, rootContainer, hostContext, internalHandle)` — call `$$createNode(type, surfaceId, props, hostContext.isInsideTextContext, internalHandle)`, return `Instance` with handles
   - `createTextInstance(text, rootContainer, hostContext, internalHandle)` — call `$$createTextNode(text, surfaceId, internalHandle)`, return `TextInstance`
   - `appendInitialChild(parent, child)` — call `$$appendChild(parent._nativeNode, child._nativeNode)`, push child to parent.children
   - `finalizeInitialChildren(instance, type, props, hostContext)` — return `false`
   - `shouldSetTextContent(type, props)` — return `false`
6. Implement persistent mode functions:
   - `cloneInstance(instance, type, oldProps, newProps, keepChildren, recyclable)` — call `$$cloneNodeWithNewProps` or `$$cloneNodeWithNewChildrenAndProps` depending on `keepChildren`, return new `Instance` with same `_nativeFamily`
   - `cloneHiddenInstance(instance, type, props, internalHandle)` — clone with hidden visibility
   - `cloneHiddenTextInstance(instance, text, internalHandle)` — clone text with hidden visibility
   - `createContainerChildSet(container)` — return empty array `[]`
   - `appendChildToContainerChildSet(childSet, child)` — push child to array
   - `finalizeContainerChildren(container, newChildren)` — no-op
   - `replaceContainerChildren(container, newChildren)` — call `$$completeRoot(container.surfaceId, childNodes)` to atomically commit the tree
7. Implement context functions:
   - `getRootHostContext()` — return `{ isInsideTextContext: false }`
   - `getChildHostContext(parentContext, type)` — return text context for `<p>`, `<h1>`–`<h6>`, `<span>`, etc.
8. Implement Tier 2 simple logic functions (see spec for full list)
9. Stub out Tier 3 no-ops and Tier 4 feature shims (WithNoMutation, WithNoHydration, WithNoResources, etc.)
10. Write tests:
    - `__tests__/renderer.test.js`
    - Test: `createInstance` calls `$$createNode` and returns correct `Instance` shape
    - Test: `cloneInstance` with `keepChildren=true` calls `$$cloneNodeWithNewProps`, preserves `_nativeFamily`
    - Test: `cloneInstance` with `keepChildren=false` calls `$$cloneNodeWithNewChildrenAndProps`, returns empty children
    - Test: `replaceContainerChildren` calls `$$completeRoot` with child node handles
    - Test: `appendInitialChild` calls `$$appendChild` and updates children array
    - Test: context functions return correct `isInsideTextContext` for text elements
11. Export `createRoot(nativeRootView)` as the main API (returns `{ render, unmount }`)

## Output

- `packages/react-dom-native/src/renderer/HostConfig.js`
- `packages/react-dom-native/src/renderer/renderer.js`
- `packages/react-dom-native/src/renderer/index.js`
- `packages/react-dom-native/src/renderer/__tests__/renderer.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "React reconciler host config"
