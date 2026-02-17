# Hydration for react-dom-native

## Problem

react-dom-native has SSR (Fizz) rendering that produces instant first paint via Swift shadow tree + UIKit views. But after SSR, the app is not interactive — there's no React runtime attached, no event handlers, no state. The `startHydration` path in `Root.swift` is stubbed out (`// TODO: re-enable hydration`).

We need hydration: the process of attaching React's runtime to the pre-rendered SSR content so the app becomes interactive without re-creating all the native views.

## Key Constraint: Persistent Mode + Hydration

The renderer uses persistent mode (`supportsPersistence = true`, `supportsMutation = false`). React's reconciler hydration code is compatible with persistent mode:

- The hydration walk (`ReactFiberHydrationContext.js`) checks only `supportsHydration`, not `supportsMutation`
- The complete phase (`ReactFiberCompleteWork.js:1391-1405`) adopts hydrated nodes as `stateNode` without mutation-mode dependency
- The commit phase has one `supportsMutation && supportsHydration` guard (`ReactFiberCommitWork.js:2319`) for mutation-specific cleanup (`commitHostHydratedContainer`). This is skipped for persistent mode, which uses its own `commitHostRootContainerChildren` → `replaceContainerChildren` path independently.

During hydration, `createInstance` is never called for matched nodes. The reconciler adopts SSR nodes as `stateNode`. In persistent mode, `updateHostContainer` builds the child set from these adopted nodes, and `replaceContainerChildren` swaps them in. Subsequent updates use `cloneInstance` on the adopted nodes.

## Data Flow

```
SSR Phase (existing):
  Server → Fizz instructions → Swift SSR coordinator → shadow tree → UIKit views → first paint

Hydration Phase (new):
  1. Swift calls root.hydrateRoot(serverURL:)
  2. Loads JS bundle, boots JSRuntime
  3. JS calls hydrateFromURL(serverURL, {surfaceId})
  4. Flight client fetches RSC stream → React element tree
  5. hydrateRoot(container, element) → reconciler.createHydrationContainer()
  6. Reconciler walks SSR tree via bridge functions ($$getFirstSSRChild, etc.)
  7. For each fiber, matches against SSR node → adopts it as stateNode
  8. updateHostContainer builds persistent child set from adopted nodes
  9. replaceContainerChildren → $$completeRoot swaps tree
  10. Event handlers attached → app is interactive
```

## JS-Side Changes

### `renderer.js` — new `hydrateRoot` export

```javascript
function hydrateRoot(nativeRootView, initialElement, options) {
  const surfaceId = nativeRootView.surfaceId ?? nextSurfaceId++;
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
    options?.onUncaughtError || noop,
    options?.onCaughtError || noop,
    options?.onRecoverableError || noop,
    noop,           // onDefaultTransitionIndicator
    null,           // transitionCallbacks
    null,           // formState
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
```

`createHydrationContainer` immediately schedules the hydration render — no separate `updateContainer` call needed.

### `HostConfig.js` — enable hydration + implement functions

Set `supportsHydration = true`.

The hydration host config functions walk the SSR tree via bridge globals. The "hydratable instance" is a JS wrapper around the Swift SSR node reference:

```javascript
{ _ssrNodeRef: <opaque ShadowNode pointer>, _ssrFamily: <family ref>, type: 'div'|'#text'|'#suspense', props: {...} }
```

Key functions:

| Function | Implementation |
|----------|---------------|
| `getFirstHydratableChildWithinContainer(container)` | `$$getFirstSSRChild(container.surfaceId)` |
| `getFirstHydratableChild(instance)` | `$$getSSRChildOf(instance._ssrNodeRef)` |
| `getNextHydratableSibling(instance)` | `$$getNextSSRSibling(instance._ssrNodeRef)` |
| `canHydrateInstance(ssrNode, type, props)` | Check `ssrNode.type === type`, return it or null |
| `hydrateInstance(instance, type, props, hostContext, internalHandle)` | Adopt the SSR node, return diff result |
| `canHydrateTextInstance(ssrNode, text)` | Check `ssrNode.type === '#text'` |
| `hydrateTextInstance(textInstance, text, internalHandle)` | Adopt the SSR text node |
| `canHydrateSuspenseInstance(ssrNode)` | Check `ssrNode.type === '#suspense'` |
| `hydrateSuspenseInstance(instance, internalHandle)` | Attach fiber to SSR boundary |

When hydration adopts an SSR node, the resulting instance has the same shape as `createInstance` output:

```javascript
{
  _nativeNode: ssrNode._ssrNodeRef,
  _nativeFamily: ssrNode._ssrFamily,
  _internalInstanceHandle: internalHandle,
  type,
  props,
  children: [],
}
```

This means `cloneInstance`, `appendAllChildrenToContainer`, and `replaceContainerChildren` all work unchanged on hydrated instances.

### Entry point — new `hydrateFromURL`

Alongside the existing `renderFromURL`, a new `hydrateFromURL` function that uses `hydrateRoot` instead of `createRoot`. Exported on `globalThis.__REACT_DOM_NATIVE__`.

## Swift-Side Changes

### New bridge functions (registered in `Bindings.swift`)

- `$$getFirstSSRChild(surfaceId)` → returns the first child of the SSR root for that surface, as `{ _ssrNodeRef, _ssrFamily, type, props }`
- `$$getSSRChildOf(nodeRef)` → returns the first child of a given SSR node
- `$$getNextSSRSibling(nodeRef)` → returns the next sibling of a given SSR node

These return `null` when there are no more nodes. The `_ssrNodeRef` is the opaque ShadowNode pointer (same type as `$$createNode` returns), so it plugs directly into `_nativeNode` on the instance.

### SSR tree retention

The SSR coordinator's shadow tree must be retained until hydration completes. `Root` already holds `ssrTreeBuilder` — keep it alive until hydration finishes, then nil it out in the completion callback.

### `Root.swift` — new `hydrateRoot` method

```swift
public func hydrateRoot(serverURL: String, completion: ((Error?) -> Void)? = nil) {
    // 1. Create runtime if needed (same setup as render())
    // 2. Register SSR tree for traversal via registerSSRTree(surfaceId:treeBuilder:)
    // 3. Load bundle, execute it
    // 4. Call globalThis.__REACT_DOM_NATIVE__.hydrateFromURL(serverURL, {surfaceId})
    // 5. Reconciler hydrates via bridge functions
    // 6. On completion, clean up SSR state
}
```

Usage:

```swift
let root = ReactDomNativeKit.createRoot(container)

// Phase 1: SSR first paint (instant)
root.renderWithSSR(serverURL: "http://localhost:6000") { error in
    guard error == nil else { return }

    // Phase 2: Hydrate (makes interactive)
    root.hydrateRoot(serverURL: "http://localhost:6000") { error in
        if let error { print("Hydration failed: \(error)") }
        else { print("App is interactive") }
    }
}
```

### Cleanup after hydration

When `$$completeRoot` fires after hydration, SSR tree references are released. Bridge traversal functions become no-ops for that surface. `ssrTreeBuilder`, `ssrCoordinator`, and related SSR state are nilled out.

## Mismatch Handling

When `canHydrateInstance`/`canHydrateTextInstance` return `null` (type mismatch, extra/missing nodes), the reconciler sets `ForceClientRender` and falls back to a full client render — `createInstance` for all nodes, `replaceContainerChildren` swaps in the fresh tree. Dev warnings via `diffHydratedPropsForDevWarnings` / `diffHydratedTextForDevWarnings`.

## Suspense Boundary Hydration

SSR Fizz emits boundary instructions (`["B", id]`, `["S", id]`, `["X", id]`). The SSR coordinator tracks these via `BoundaryManager`. For hydration:

- **Resolved boundaries** (streaming completed before hydration): reconciler sees resolved content, hydrates normally
- **Pending boundaries** (still waiting for streaming content): reconciler hydrates the fallback, `registerSuspenseInstanceRetry` registers a callback for when the boundary reveals
- **`clearSuspenseBoundary`**: on hydration failure inside a boundary, removes SSR nodes for that boundary so the persistent path can replace them with client-rendered content

## Testing

- **JS unit tests**: hydration host config function logic (matching, adoption, tree walking, mismatch returns)
- **Fantom integration tests**: end-to-end hydration, mismatches + client fallback, Suspense boundaries, text nodes, post-hydration updates via `cloneInstance`, event handlers fire after hydration
- **Swift unit tests**: bridge traversal functions, returned JS object shape, cleanup after hydration

## Out of Scope

- Activity boundaries (not yet used in SSR output)
- Form state hydration (`formState` stays `null`)
- Singletons / hoistables (not applicable to native)
- Streaming content arriving during hydration (pending boundaries register retry callbacks, but full optimization deferred)
- `ConcurrentRoot` for `createRoot` (only `hydrateRoot` uses it)
