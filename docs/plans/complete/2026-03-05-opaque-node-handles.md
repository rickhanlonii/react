# Opaque Node Handles: Replace Integer IDs with Direct Pointer Passing

## Goal

Replace the `nodeRegistry` integer ID pattern with opaque JS objects that wrap direct Swift pointers. This eliminates dictionary lookups on every `$$cloneNode*`, `$$appendChild`, and `$$completeRoot` call.

## Current Architecture

JS holds integer IDs as `_nativeNode`. Every bridge call goes through:

```
JS: $$cloneNodeWithNewProps(instance._nativeNode, props)
     ↓ (integer ID)
Swift: engine.toInt(args[0]) → nodeRegistry[id] → ShadowNodeWrapper
     ↓ (clone, register new node)
Swift: engine.makeNumber(Double(newId)) → return integer ID
```

The `nodeRegistry` (`[Int: ShadowNodeWrapper]`) is the central bottleneck:
- **Write**: every `$$createNode` / `$$cloneNode*` registers a new entry
- **Read**: every `$$cloneNode*` / `$$appendChild` / `$$completeRoot` looks up by ID
- **Cleanup**: after every `$$completeRoot`, walks entire tree doing O(n²) reverse lookups to find stale entries

## Proposed Architecture

Use `engine.wrapNativeObject()` / `engine.unwrapNativeObject()` (already implemented in JSEngine protocol) to pass `ShadowNodeWrapper` directly as opaque JS objects:

```
JS: $$cloneNodeWithNewProps(instance._nativeNode, props)
     ↓ (opaque JS object wrapping Swift pointer)
Swift: engine.unwrapNativeObject(args[0], as: ShadowNodeWrapper.self) → direct pointer
     ↓ (clone)
Swift: engine.wrapNativeObject(cloned) → return opaque JS object
```

No dictionary. No integer IDs. O(1) access.

## Changes

### 1. Node Creation — return opaque objects instead of integer IDs

**Files:** `Bindings+Registration.swift` (registerNodeCreation, registerCloneOperations)

For each `$$createNode`, `$$createTextNode`, `$$cloneNode`, `$$cloneNodeWithNewProps`, `$$cloneNodeWithNewChildren`, `$$cloneNodeWithNewChildrenAndProps`:

```swift
// Before:
let nodeId = self.registerNode(node)
return engine.makeNumber(Double(nodeId))

// After:
return engine.wrapNativeObject(node)
```

For each function that receives a node reference:

```swift
// Before:
guard let node = self.lookupNode(args[0]) else { return nil }

// After:
guard let node = engine.unwrapNativeObject(args[0], as: ShadowNodeWrapper.self) else { return nil }
```

### 2. `$$appendChild` — unwrap directly

**File:** `Bindings+Registration.swift` (registerTreeOperations)

```swift
// Before:
guard let parentId = engine.toInt(args[0]),
      let parent = nodeRegistry[parentId],
      let childId = engine.toInt(args[1]),
      let child = nodeRegistry[childId] else { return nil }

// After:
guard let parent = engine.unwrapNativeObject(args[0], as: ShadowNodeWrapper.self),
      let child = engine.unwrapNativeObject(args[1], as: ShadowNodeWrapper.self) else { return nil }
```

### 3. `$$completeRoot` — unwrap children array directly

**File:** `Bindings+Registration.swift` ($$completeRoot)

```swift
// Before:
let childRefs = engine.toArray(args[1]) ?? []
let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
    guard let id = engine.toInt(ref) else { return nil }
    return self.nodeRegistry[id]
}

// After:
let childRefs = engine.toArray(args[1]) ?? []
let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
    engine.unwrapNativeObject(ref, as: ShadowNodeWrapper.self)
}
```

### 4. Remove `nodeRegistry` and related infrastructure

**File:** `Bindings.swift`, `Bindings+Registration.swift`

- Remove `var nodeRegistry: [Int: ShadowNodeWrapper]`
- Remove `var nextNodeId: Int`
- Remove `func registerNode(_ node:) -> Int`
- Remove `func lookupNode(_ ref:) -> ShadowNodeWrapper?`
- Remove the stale node cleanup in `$$completeRoot` (step 4b: `collectNodeIds`, `staleIds` loop) — JS GC now owns the lifecycle

### 5. Fix stale node cleanup — rely on JS GC instead

**Current:** After each `$$completeRoot`, walks the entire committed tree doing O(n²) reverse lookups to find and remove stale `nodeRegistry` entries.

**After:** No cleanup needed. When JS drops a reference to an opaque node object (e.g., an old cloned node replaced by a newer clone), JSC's garbage collector releases the `JSValue`, which releases the strong reference to the `ShadowNodeWrapper`. The Swift object is deallocated automatically.

**Caveat:** Verify that `wrapNativeObject` retains the Swift object (via `JSValue(object:in:)`) and that GC releases it. If `JSValue(object:in:)` uses `@convention(block)` or autorelease semantics that don't prevent collection, we may need to add `protect`/`unprotect` calls around long-lived nodes.

### 6. JS-side cleanup

**File:** `HostConfig.js`

- `_nativeNode._family` is already dead code — `$$createNode` returns an integer today so `_family` is always `undefined`. After this change, the opaque object still won't have a `._family` property. Keep the `|| nativeNode` fallback or remove the dead `_family` access.
- The `console.log` calls that stringify `_nativeNode` (lines 150, 172, 236) will now print `[object Object]` instead of an integer. Update to use a debug identifier or remove.
- `_ssrNodeRef` assignment to `_nativeNode` (lines 614, 629, 640, 643) — SSR hydration sets `_nativeNode = _ssrNodeRef` (an integer from the SSR stream). These nodes go through `$$cloneNode*` during hydration which will look up by the SSR ref. **This is the trickiest part** — SSR nodes use integer refs that map to SSR-created nodes. Need to handle the SSR→hydration transition where `_nativeNode` changes from an SSR integer ref to an opaque wrapped object.

### 7. DevTools — update node lookups

**File:** `Bindings+DevTools.swift`

Several DevTools functions look up nodes by integer ID from `nodeRegistry`:
- `inspectNode(nodeId:)`
- `getBoxModelForNode(nodeId:)`
- `highlightNode(nodeId:)`
- `scrollIntoView(nodeId:)`

These receive integer IDs from the DevTools inspector protocol (not from JS). Options:
- Keep a parallel `[Int: ShadowNodeWrapper]` map just for DevTools (populated during create/clone)
- Or use the committed tree to find nodes by walking `currentTrees`

### 8. SSR node registration

**File:** `Bindings+SSR.swift`

SSR creates nodes outside of JS (from the instruction stream parser) and registers them in `nodeRegistry` so that hydration can reference them via integer IDs. This path needs to either:
- Continue using integer IDs for SSR-created nodes (hybrid approach)
- Or wrap SSR nodes as opaque objects and pass them to JS during hydration setup

## Risk Areas

1. **SSR ↔ Hydration bridge** — SSR nodes are created in Swift and referenced by integer IDs in JS. The transition from SSR integer refs to opaque handles during hydration needs careful handling.
2. **Memory management** — Must verify JSC's `JSValue(object:in:)` properly retains/releases Swift objects. A retain cycle or premature release would cause crashes.
3. **DevTools** — The inspector protocol sends integer node IDs. Need an alternative lookup path.
4. **`collectNodeIds` O(n²) removal** — Currently does reverse lookups. With opaque handles this goes away entirely, but verify no other code depends on node→ID mapping.

## Verification

1. Run integration tests (`npm run test:integration`)
2. Run e2e layout tests (`npm run test:e2e`)
3. Capture a performance trace and compare Resolve Tree duration before/after
4. Test SSR → hydration flow (load Staggered Loading page, verify all boundaries reveal)
5. Test React commits (click counter, verify updates render)
6. Test DevTools inspection (inspect node, highlight, box model)
7. Memory: run Activity Monitor during repeated navigations, verify no leaks

## Open Questions

- Should this be done incrementally (e.g., clone operations first, then create, then SSR) or all at once?
- Is the `wrapNativeObject` / `JSValue(object:in:)` path fast enough, or should we use the lower-level `JSObjectMake` with `JSClassDefinition` for zero-overhead pointer extraction?
- Should DevTools keep a parallel integer ID registry, or walk the tree?
