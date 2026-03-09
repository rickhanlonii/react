# Skip Unchanged Subtrees in Diff and Sync

## Problem

The Differentiator and `syncAllFrames` walk the full tree on every commit, even when most subtrees are completely unchanged. In the stress test "+1 All" scenario (50 counters updated), every node in the tree is visited during diff and sync, but only ~50 leaf text nodes actually changed. For single-counter updates, the waste is even more extreme — one leaf changes but hundreds of nodes are visited.

## Goal

Make diff and sync time proportional to the number of **changed** nodes, not the total tree size.

## Current Behavior

### Differentiator (`diff()`)
1. Receives `oldChildren` and `newChildren` arrays
2. Builds `oldByFamily: [ObjectIdentifier: ShadowNodeWrapper]` map from all old children
3. Iterates all new children, looking up by family
4. For matched pairs, checks if node pointer changed (`old !== new`) → generates UPDATE mutation
5. Recurses into children of matched pairs
6. Collects unmatched old children as DELETE/REMOVE

The `old !== new` check exists but the function still **enters** every matched pair to recurse, even when the entire subtree is unchanged.

### syncAllFrames
1. Walks the new tree depth-first
2. For each node with a view, sets `view.frame = node.layoutFrame`
3. Has a pointer equality check that skips children recursion when `old === new`
4. But still visits every top-level child to check

## Proposed Changes

### Phase 1: Add pointer-equal fast path to Differentiator

In `Differentiator.diff(oldChildren:newChildren:parent:)`:
```swift
// Before building any maps, check if arrays are identical
if oldChildren.count == newChildren.count {
    var allSame = true
    for i in 0..<oldChildren.count {
        if oldChildren[i] !== newChildren[i] {
            allSame = false
            break
        }
    }
    if allSame {
        return [] // Zero mutations, zero allocations
    }
}
```

For individual matched pairs, skip recursion when pointers match:
```swift
if oldNode === newNode {
    continue // Skip — entire subtree unchanged
}
```

### Phase 2: Skip map construction when possible

The `oldByFamily` dictionary is allocated on every diff call, even for small or identical arrays. Optimize:
- If arrays are identical (Phase 1), skip entirely
- If arrays are small (≤4 elements), use linear scan instead of dictionary
- Pre-size dictionary with `minimumCapacity` to avoid rehashing

### Phase 3: Tighten syncAllFrames skip logic

Verify that `syncAllFrames` correctly skips entire subtrees when `old === new`. The current implementation should already do this, but audit:
- Does it skip the `view.frame = layoutFrame` assignment for the node itself?
- Does it skip recursion into children?
- Are there edge cases where the pointer check is bypassed (e.g., root nodes, scroll containers)?

### Phase 4: Propagate "unchanged" signal from React

React already knows which subtrees changed during reconciliation. In persistent mode, unchanged children are the same object references. Verify that:
- `cloneInstance` only clones nodes React actually modified
- Unchanged children passed to `appendChildToContainer`/`appendChild` retain their original pointer
- The `finalizeContainerChildren`/`replaceContainerChildren` path preserves pointer identity for unchanged subtrees

### Phase 5: Measure and validate

- Add per-node counters to Differentiator: `nodesVisited`, `nodesSkipped`, `mutationsGenerated`
- Report in trace timing properties
- Validate on stress test: single counter tap should visit ~5 nodes (the spine), not ~500

## Expected Impact

For a single counter update in the 50-item stress test:
- **Current**: diff visits ~500 nodes, sync visits ~500 nodes
- **After**: diff visits ~5 nodes (spine from root to changed leaf), sync visits ~5 nodes
- Expected diff+sync time reduction: ~90% for single-item updates

For "+1 All" (all 50 counters):
- Less dramatic improvement since most nodes genuinely changed
- But still saves on non-counter nodes (container divs, header, etc.)

## Risks

- Must ensure pointer equality is a correct proxy for "unchanged" — if any code path clones without modifying, we'd miss real updates (unlikely in persistent mode but worth auditing)
- Linear scan for small arrays may not be faster than dictionary if the constant factor is high — benchmark both
