# Diagnosis: SSR Suspense Boundaries Stuck + Counter Non-Interactive

## Symptom

1. **Boundaries 2+ never reveal:** Boundary 0 (Counter) and Boundary 1 (Search) reveal successfully. Boundary 2 logs `[BoundaryManager] Boundary 2 will be client-rendered. Digest: none` but nothing happens -- the fallback skeleton stays visible permanently. Boundaries 3+ (Tabs, Accordion, Todo) never appear at all.

2. **Counter button non-interactive:** After hydration, tapping the Counter "+" or "-" buttons does not change the count.

## Repro Steps

1. Start the Flight server: `cd example && npm run dev` (port 6000)
2. Start the SSR server: `node example/server/ssr-server.js` (port 6001)
3. Build and run the Falcon app in the simulator
4. Observe: Counter and Search cards reveal. Tabs, Accordion, and Todo cards stay as skeleton placeholders forever.
5. Tap the Counter "+" button -- count does not change.

```jsx
// App.js -- the Suspense boundaries that reproduce the issue
// (already in example/server/src/App.js)
<Suspense fallback={<TabsSkeleton />}>
  <TabsSection delay={1500} />
</Suspense>

<Suspense fallback={<AccordionSkeleton />}>
  <AccordionSection delay={2500} />
</Suspense>

<Suspense fallback={<TodoSkeleton />}>
  <TodoSection delay={3000} />
</Suspense>
```

## Root Cause Analysis

### Bug 1: Missing client components in server manifests

#### Data flow trace

1. The Flight server (`example/server/server.js:32`) builds a `clientManifest` that only includes `Counter` and `TextInput`:
   ```js
   var components = ['Counter', 'TextInput'];
   ```

2. The SSR server (`example/server/ssr-server.js:42-43`) builds an `ssrModuleMap` that also only includes `Counter` and `TextInput`:
   ```js
   var components = ['Counter', 'TextInput'];
   ```

3. `Tabs`, `Accordion`, and `TodoList` are `'use client'` components that are imported by server components (`TabsSection`, `AccordionSection`, `TodoSection`). When the Flight server serializes these, it cannot find them in `clientManifest`, so they are **not emitted as client references (I rows)**.

4. Without proper client references, when the SSR server's Flight client tries to resolve these components, it fails. The Fizz renderer treats the Suspense boundary as a client-rendered error boundary and emits an `["E", boundaryId, null]` instruction instead of `["S", id]...["X", id]` (segment + reveal).

5. On the native side, `SSRCoordinator.didReceiveClientRenderBoundary` (`:205-207`) calls `BoundaryManager.clientRenderBoundary` (`:151-154`), which is a **no-op** -- it just logs and does nothing. The fallback stays visible permanently.

#### The bug (manifests)

`example/server/server.js:32` and `example/server/ssr-server.js:42` both hardcode `['Counter', 'TextInput']` as the only client components. `Tabs`, `Accordion`, and `TodoList` are missing. The Flight server cannot serialize references to these components, causing the SSR server to error on the corresponding Suspense boundaries.

#### The bug (clientRenderBoundary no-op)

Even if some boundaries legitimately need client rendering (e.g., because the server errored), `BoundaryManager.clientRenderBoundary` at `BoundaryManager.swift:151-154` does nothing:

```swift
public func clientRenderBoundary(id: Int, errorDigest: String?) {
    // The fallback stays visible; React will handle this boundary client-side
    print("[BoundaryManager] Boundary \(id) will be client-rendered. Digest: \(errorDigest ?? "none")")
}
```

This is supposed to mark the `#suspense` node so that during hydration, React's reconciler sees it as a "fallback" boundary (via `isSuspenseInstanceFallback`) and triggers client-side rendering. But the `#suspense` node's `fallback` prop is never set to `true`, so React sees it as a normal pending boundary and waits for a reveal that never comes.

#### Relevant source locations

- `example/server/server.js:32` -- Flight server client manifest, missing Tabs/Accordion/TodoList
- `example/server/ssr-server.js:42-43` -- SSR server module map, missing Tabs/Accordion/TodoList
- `packages/react-dom-native/ios/Sources/ShadowTree/BoundaryManager.swift:151-154` -- `clientRenderBoundary` is a no-op, never sets `fallback: true`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift:205-207` -- delegates to the no-op
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift:99` -- creates `#suspense` node with `pending: true, fallback: false`
- `packages/react-dom-native/src/renderer/HostConfig.js:426-431` -- `isSuspenseInstancePending` and `isSuspenseInstanceFallback` read these props

### Bug 2: Counter button non-interactive after hydration

#### Data flow trace

1. Counter renders `<button onClick={...}><span>+</span></button>`
2. During SSR, the `<button>` element is rendered as a native view via `UIKitMutationApplier`
3. During hydration, `hydrateInstance` at `HostConfig.js:516-526` reuses the SSR node and calls `$$setInstanceHandle` to attach the React fiber
4. The event handler (`onClick`) is part of the React fiber's props, dispatched through `dispatchEvent` in `Bindings.swift:896-924`
5. `dispatchEvent` looks up the view in `viewRegistry`, gets the `family`, gets the `instanceHandle`, and calls the JS event handler

6. **The problem:** The `<button>` view was created by the SSR `UIKitMutationApplier` (stored in `ssrViewRegistry`). During hydration, `registerSurfaceForHydration` at `Bindings.swift:148-176` calls `viewRegistry.merge(from: ssrViewRegistry)` to transfer SSR views into the main registry. But the SSR `UIKitMutationApplier` created the button with a tap gesture recognizer whose target is the **SSR** `UIKitMutationApplier` instance (which has its own `dispatchEvent` closure).

7. In `Root.hydrateRoot()` at `Root.swift:543-546`, the SSR applier's `dispatchEvent` is rewired to point to `Bindings.dispatchEvent`:
   ```swift
   self.ssrMutationApplier?.dispatchEvent = { view, eventType, payload in
       bindings.dispatchEvent(from: view, eventType: eventType, payload: payload)
   }
   ```

8. However, the `instanceHandle` on the SSR-created family is set during hydration via `$$setInstanceHandle` at `Bindings.swift:1062-1070`. This sets `node.family.instanceHandle = instanceHandle`. But `dispatchEvent` in `Bindings.swift:901` calls `viewRegistry.family(for: view)` -- it looks up the family through the **view registry**, not the node registry.

9. The SSR-created button's tap gesture recognizer calls the SSR applier's `dispatchEvent` closure, which was rewired to call `bindings.dispatchEvent(from: view, ...)`. This looks up `viewRegistry.family(for: view)`. The SSR views were merged into `viewRegistry` via `merge(from:)`, so the family lookup should succeed. Then it gets `family.instanceHandle`.

10. **Possible issue:** The `$$setInstanceHandle` call at `Bindings.swift:1062-1070` sets the handle on the **nodeRegistry** node's family, but during hydration the SSR node was registered into `nodeRegistry` via `registerSSRSubtree`. The SSR `ShadowNodeWrapper` shares the same `ShadowNodeFamily` object with the view registry entry, so `family.instanceHandle` should be the same object. This means event dispatch should work IF the event handler has been registered.

11. **Actual root cause:** The event handler is registered via `$$registerEventHandler` which is called when the JS bundle boots. If hydration hasn't completed its first commit yet (the reconciler hasn't called `replaceContainerChildren` / `$$completeRoot`), the event handler might not be registered yet. But more likely, the issue is that `hydrateInstance` returns `true` but doesn't actually update the native node's props -- the SSR node was created without `onClick` (event handlers are stripped by NativeFizzConfig), and hydration doesn't re-apply props. The button's tap gesture was set up by the SSR `UIKitMutationApplier` for all `<button>` elements, but the SSR applier was pointing at a different dispatch closure initially. After rewiring at `Root.swift:543-546`, the dispatch should work.

12. **Most likely cause:** After investigating further, the issue is timing. The `$$setInstanceHandle` is called during hydration traversal, but `$$completeRoot` (which finalizes everything) may happen BEFORE the event handler is fully wired. Actually, looking more carefully at `cleanupSSRState` at `Root.swift:686-703`: it sets `ssrMutationApplier` to nil ONLY if `onHydrationComplete` fires... but wait, the comment at line 695-697 says the `ssrMutationApplier` is kept alive. So that should be fine.

13. **Re-investigation:** The Counter button renders as `<button>` which contains `<span>+</span>`. The tap gesture is on the `<button>`'s UIView. When tapped, the SSR applier's `dispatchEvent` fires, which calls `bindings.dispatchEvent(from: view, eventType: "click", payload: [:])`. This calls `viewRegistry.family(for: view)` to find the family, then `family.instanceHandle` to get the fiber reference, then `engine.callFunction(handler, ...)` to invoke the JS event handler. This chain should work after hydration. The Counter's `onClick` handler calls `setCount(c => c + 1)`, which triggers a re-render through the reconciler.

14. **Persistent mode re-render:** The reconciler calls `cloneInstance` / `cloneNodeWithNewProps` to create new nodes, then `replaceContainerChildren` / `$$completeRoot`. The `$$completeRoot` diffs old vs new tree and applies mutations. The text "0" changes to "1" via an UPDATE mutation. This should work if the cloned node has the right props.

15. **The actual issue may be simpler:** After re-reading the symptom ("Counter '+' button taps don't change the count"), this could be that the button's `onClick` fires but the re-render doesn't produce visible changes. Or the event is not reaching React at all. Without runtime logs this is harder to pinpoint, but the most likely culprit is that `family.instanceHandle` is nil or stale after the `flattenSuspenseFromCurrentTree` step, which creates structural clones that may lose the family/instanceHandle connection.

#### The bug (Counter interactivity -- most likely)

Looking at `flattenSuspenseFromCurrentTree` at `Bindings.swift:678-683` and `flattenSuspenseNodes` at `Bindings.swift:687-724`: when a node has children that contain `#suspense` wrappers, a **structural clone** is created at line 708:

```swift
let clone = ShadowNodeWrapper(
    props: node.props,
    children: flattenedChildren,
    family: node.family,  // shares family
    text: node.text
)
```

This clone shares the same `family` as the original, so `viewRegistry.family(for: view)` should still return the correct family. However, the `currentTrees[surfaceId]` is updated to the flattened clone tree. When the reconciler runs its second commit (after hydration), it diffs against this flattened tree. The flattened clones are **new objects** (different identity from the SSR originals), so the differentiator may emit DELETE + CREATE mutations instead of UPDATE, replacing UIViews and losing tap gesture recognizers.

Actually, the flattened clone shares the same `family` object, and the `Differentiator` uses family identity (not object identity) to match nodes. So it should recognize them as the same and emit UPDATE instead of DELETE+CREATE.

**Most likely root cause for Counter non-interactivity:** The `flattenSuspenseFromCurrentTree` runs AFTER the first `$$completeRoot`. It creates structural clones with the same `family` but **new Yoga nodes**. When the second `$$completeRoot` runs (the actual hydrated render), it diffs against these clones. The differentiator matches by family, so it emits UPDATE mutations. The mutation applier updates the existing views' properties. But here is the key: the **second commit from the reconciler** passes nodes that were created via `$$createNode` (new nodes, not the SSR originals). These new nodes have a **different family** from the SSR originals, because `createInstance` at `HostConfig.js:107-113` creates a new node via `$$createNode` which creates a new `ShadowNodeFamily`. So the differ sees the old tree (SSR families) vs new tree (reconciler families) and emits DELETE for the old + CREATE for the new. The new views are created by `UIKitMutationApplier` with fresh tap gesture recognizers that call `bindings.mutationApplier.dispatchEvent`. But `bindings.mutationApplier.dispatchEvent` is properly wired in `Bindings.init` at line 110-112. So the NEW buttons should be interactive.

**Wait -- re-reading hydrateInstance at HostConfig.js:516-526:**
```js
instance._nativeNode = instance._ssrNodeRef;
instance._nativeFamily = instance._ssrFamily;
```
This reuses the SSR node! The reconciler's instance now points to the SSR native node. When `cloneInstance` is called for updates, it calls `$$cloneNodeWithNewProps(instance._nativeNode, ...)` which clones the SSR node. The clone inherits the SSR family. So subsequent diffs should match correctly. The views created during SSR should be reused.

**Conclusion on Counter:** The most likely cause is that the event handler (`$$registerEventHandler`) is called, but after the Counter's `onClick` fires, `setCount` triggers a re-render, and the reconciler's second commit (with the actual state update) tries to do `$$completeRoot` with new nodes. If the `flattenSuspenseFromCurrentTree` step caused `currentTrees` to be in an inconsistent state, the diff could produce incorrect mutations. However, this is hard to confirm without runtime debugging.

A simpler explanation: the SSR applier's `dispatchEvent` closure captures `[weak self]` where `self` is the `UIKitMutationApplier`. After `cleanupSSRState` runs... but the comment at `Root.swift:695-697` says the applier is kept alive. Let me check if the closure itself might be nil.

Actually, looking at `Root.swift:544`:
```swift
self.ssrMutationApplier?.dispatchEvent = { view, eventType, payload in
    bindings.dispatchEvent(from: view, eventType: eventType, payload: payload)
}
```

This closure captures `bindings` strongly. `bindings` is `self.runtime?.bindings`. Since `runtime` is non-optional after initialization and `bindings` is a `let` property, this should be fine.

The Counter non-interactivity likely has a different, subtler cause that would require runtime debugging to confirm. But the SSR boundary issue is clear-cut.

## Suggested Fix Direction

### Fix 1: Add missing client components to server manifests (PRIMARY FIX)

In `example/server/server.js:32` and `example/server/ssr-server.js:42`, add `Tabs`, `Accordion`, and `TodoList` to the components arrays:

```js
var components = ['Counter', 'TextInput', 'Tabs', 'Accordion', 'TodoList'];
```

This must be done in BOTH files:
- `server.js` -- so the Flight server emits I rows for these components
- `ssr-server.js` -- so the SSR server's Flight client can resolve them

This is the root cause for boundaries 2+ never resolving. Without these entries, the Flight server cannot serialize client references for these components, causing the SSR pipeline to error and emit E (client-render) instructions.

### Fix 2: Implement clientRenderBoundary properly

In `BoundaryManager.swift:151-154`, `clientRenderBoundary` needs to mark the `#suspense` wrapper node's `fallback` prop as `true` so that during hydration, `isSuspenseInstanceFallback` returns `true` and React's reconciler knows to client-render this boundary instead of waiting for a reveal.

The implementation should:
1. Find the boundary's `#suspense` wrapper node
2. Set its `fallback` prop to `true` and `pending` to `false`
3. This way, during hydration, `makeSSRNodeRef` will return `{pending: false, fallback: true}` and React will know to client-render the content

This requires `BoundaryManager` to either store a reference to the wrapper node or communicate back to the coordinator. The `SSRCoordinator` already stores `boundaryWrappers[id]`, so the fix could be in `SSRCoordinator.didReceiveClientRenderBoundary` instead.

### Fix 3: Counter interactivity (needs runtime debugging)

The Counter non-interactivity issue needs runtime debugging to isolate. Potential areas to investigate:
- Verify `$$registerEventHandler` is called before any user interaction
- Add logging to `Bindings.dispatchEvent` to confirm events reach the JS side
- Check if the reconciler's commit after state update produces correct mutations
- Verify the `flattenSuspenseFromCurrentTree` step doesn't break the diff chain

## Related Context

- React's Fizz renderer uses `clientRenderedBoundaries` queue (react-server.development.js:1113) to track boundaries that errored. These get flushed as `writeClientRenderBoundaryInstruction` calls (line 4857), which produce `["E", id, digest]` instructions via NativeFizzConfig.js:330-342.
- In react-dom's HTML Fizz config, client-rendered boundaries emit a `<template data-msg="...">` marker that React's hydration code reads to trigger client rendering. The native equivalent needs the `#suspense` node to have `fallback: true`.
- The `writeStartClientRenderedSuspenseBoundary` at NativeFizzConfig.js:257-267 returns `true` without emitting any instruction -- this means the Fizz shell for client-rendered boundaries contains NO structural markers. The only signal is the `["E", id, digest]` instruction that arrives later. This is why `clientRenderBoundary` is the critical handler.
