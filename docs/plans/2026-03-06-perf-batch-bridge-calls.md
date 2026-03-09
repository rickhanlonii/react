# Batch Bridge Calls

## Problem

During React reconciliation, each node operation is an individual JS→Swift bridge call via JavaScriptCore:

- `$$createNode(type, props, ...)` — per new node
- `$$cloneNode(node)` / `$$cloneNodeWithNewProps(node, props)` — per cloned node
- `$$appendChild(parent, child)` — per parent-child relationship
- `$$completeRoot(surfaceId, children)` — once at commit

In the stress test "+1 All" scenario with 50 counters, this results in hundreds of individual bridge crossings during a single React render. Each crossing involves:
- JSValue argument unwrapping
- Swift dictionary construction from JS objects (for props)
- Objective-C runtime dispatch
- Return value boxing back to JSValue

## Goal

Reduce bridge crossings by buffering operations on the JS side and sending them as a single batch array to Swift.

## Current Behavior

React's host config calls bridge functions synchronously during render/commit:

```
render phase:
  $$cloneNodeWithNewProps(node1, {text: "1"})
  $$appendChild(parent1, child1)
  $$cloneNodeWithNewProps(node2, {text: "2"})
  $$appendChild(parent2, child2)
  ... (hundreds more)

commit phase:
  $$completeRoot(surfaceId, [root1, root2, ...])
```

Each `$$` call is an immediate JS→Swift function invocation.

## Proposed Changes

### Phase 1: Measure bridge overhead

Before optimizing, quantify how much time is spent in bridge crossing vs actual work:
- Instrument each `$$` function entry/exit in Swift with timestamps
- Measure total time in `$$` functions vs time between them (JS overhead)
- Count total bridge calls per stress test commit
- Compare: wrap all `$$` calls in a single `$$batch([...])` call that does the same work — measure the difference

### Phase 2: Design batch protocol

Define a compact operation format that can be sent as a single JS array:

```javascript
// JS side: buffer operations
const ops = [];
ops.push([OP_CLONE_WITH_PROPS, nodeHandle, propsObject]);
ops.push([OP_APPEND_CHILD, parentHandle, childHandle]);
ops.push([OP_CLONE, nodeHandle]);
// ...
ops.push([OP_COMPLETE_ROOT, surfaceId, rootChildren]);

// Single bridge call
$$executeBatch(ops);
```

Operation codes:
```
0 = CREATE_NODE(type, reactTag, surfaceId, props)
1 = CREATE_TEXT_NODE(text, reactTag, surfaceId)
2 = CLONE_NODE(nodeHandle)
3 = CLONE_WITH_PROPS(nodeHandle, props)
4 = CLONE_WITH_CHILDREN(nodeHandle)
5 = CLONE_WITH_PROPS_AND_CHILDREN(nodeHandle, props)
6 = APPEND_CHILD(parentHandle, childHandle)
7 = COMPLETE_ROOT(surfaceId, children[])
```

### Phase 3: JS-side buffering

Modify the host config to buffer operations instead of calling `$$` functions directly:

```javascript
let pendingOps = [];

exports.cloneInstance = function(instance, type, oldProps, newProps, ...) {
    const handle = nextHandle++;
    pendingOps.push([OP_CLONE_WITH_PROPS, instance._nativeNode, newProps, handle]);
    return { _nativeNode: handle, ... };
};

exports.appendChild = function(parent, child) {
    pendingOps.push([OP_APPEND_CHILD, parent._nativeNode, child._nativeNode]);
};

exports.replaceContainerChildren = function(container, newChildren) {
    const childHandles = newChildren.map(c => c._nativeNode);
    pendingOps.push([OP_COMPLETE_ROOT, container.surfaceId, childHandles]);
    $$executeBatch(pendingOps);  // Single bridge call
    pendingOps = [];
};
```

### Phase 4: Swift-side batch executor

Implement `$$executeBatch` in Swift that processes the operation array:

```swift
func executeBatch(_ operations: JSValue) {
    let count = operations.forProperty("length").toInt32()
    for i in 0..<count {
        let op = operations.atIndex(i)
        let opCode = op.atIndex(0).toInt32()
        switch opCode {
        case OP_CLONE_WITH_PROPS:
            let nodeHandle = op.atIndex(1)
            let props = op.atIndex(2)
            let resultHandle = op.atIndex(3)
            // ... do the clone work, store result by handle
        case OP_APPEND_CHILD:
            // ...
        }
    }
}
```

### Phase 5: Handle return values

The main complexity: `$$createNode` and `$$cloneNode` return opaque node handles that subsequent `$$appendChild` calls reference. In batch mode:

**Option A: Pre-assigned handles** — JS assigns integer handles before batching. Swift maps handles to actual ShadowNodeWrapper objects during batch execution. This is what the Phase 3 design above uses.

**Option B: Index-based references** — Operations reference results of earlier operations by index in the batch. E.g., "append the result of operation 3 as child of result of operation 1."

Option A is simpler and avoids circular reference complexity.

### Phase 6: Preserve speculative layout

Currently, `$$appendChild` triggers speculative background Yoga layout. In batch mode, we need to decide:
- **Option A**: Dispatch speculative layout during batch execution (same as today, just batched)
- **Option B**: Skip speculative layout in batch mode and rely on the final `YGNodeCalculateLayout` in `commitTree` — simpler but loses the render/layout overlap

Option A preserves the current optimization. The batch executor would dispatch speculative layout at the same points as the individual `$$appendChild` calls.

## Expected Impact

Measuring bridge overhead is the critical first step. Expected scenarios:
- If bridge overhead is **>5ms** per commit: batching could save 3-4ms (meaningful)
- If bridge overhead is **<1ms** per commit: batching isn't worth the complexity

The stress test with 50 items likely has ~200-300 bridge calls per "+1 All" commit. Even at ~10μs per crossing, that's only ~2-3ms. The real savings may be in reduced JSValue boxing/unboxing rather than the call overhead itself.

## Risks

- **Complexity**: Batch protocol adds a layer of indirection. Debugging becomes harder — you can't just breakpoint on `$$cloneNode` to see individual operations.
- **Handle management**: Pre-assigned handles need a mapping table. If handles leak or collide, we get silent corruption.
- **Speculative layout interaction**: If batch execution changes the timing of `$$appendChild` relative to speculative layout dispatch, we could lose the render/layout overlap benefit.
- **Error handling**: If operation N fails in the batch, what happens to operations N+1...M? Need a clear error strategy.
- **JSC array overhead**: Creating a large nested JS array of operations has its own allocation cost. Need to verify the array construction on the JS side doesn't offset the bridge savings.

## Recommendation

**Do Phase 1 first.** If bridge overhead is <1ms, skip this optimization entirely and focus on the other three plans (structural sharing, skip unchanged subtrees, lazy prop diffing) which have more predictable impact.
