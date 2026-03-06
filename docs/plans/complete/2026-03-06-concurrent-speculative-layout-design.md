# Concurrent Speculative Layout with Leaf Skipping

## Problem

Speculative layout dispatches individual `YGNodeCalculateLayout` calls per `$$appendChild` onto a **serial** background queue. In renders with many nodes:

1. The serial queue backs up — many small tasks queue behind each other
2. Redundant work — computing a child's layout is wasted when the parent is queued shortly after (parent re-computes the entire subtree)
3. Long "Wait Speculative Layout" at commit time — the serial queue hasn't drained by `$$completeRoot`

## Design

Two changes: skip leaf nodes (eliminate trivial tasks) and switch to a concurrent queue with ancestor deduplication (parallelize independent subtrees, eliminate redundant computation).

### 1. Skip Leaf Nodes

Leaf nodes (no children — `#text`, empty elements, `<img>`, etc.) are trivially fast for Yoga. The GCD dispatch overhead exceeds the layout cost, and any non-leaf ancestor's layout will compute the leaf anyway.

**Change:** Guard the speculative dispatch with `!child.children.isEmpty`.

### 2. Concurrent Queue with Ancestor Dedup

**Goal:** Independent subtrees (siblings) compute in parallel. When a parent is queued, its already-queued children are skipped since the parent's layout encompasses them.

#### Data Structures

```swift
/// Concurrent queue — independent subtrees compute in parallel.
let speculativeLayoutQueue = DispatchQueue(
    label: "com.react-dom-native.speculative-layout",
    attributes: .concurrent
)

/// Nodes scheduled for speculative layout but not yet started.
/// Protected by speculativeLock.
var pendingSpeculativeNodes: Set<UnsafeRawPointer> = []

/// Nodes currently mid-computation on the concurrent queue.
/// Protected by speculativeLock. Used to prevent parent/child overlap.
var inflightSpeculativeNodes: Set<UnsafeRawPointer> = []

/// Lock protecting pendingSpeculativeNodes and inflightSpeculativeNodes.
var speculativeLock = os_unfair_lock()
```

#### Main Thread (in $$appendChild)

After all existing appendChild work, before `return nil`:

```
1. Skip if child.children.isEmpty (leaf)
2. Skip if !speculativeLayoutEnabled or parentWidth <= 0 or !YGNodeIsDirty
3. Lock:
   a. Add child.yogaNode to pendingSpeculativeNodes
   b. Walk child's immediate Yoga children — remove any found in
      pendingSpeculativeNodes (descendants superseded by this node)
4. Dispatch to concurrent queue
```

Step 3b walks the child's Yoga subtree recursively to remove descendants. Since the child subtree is complete (persistent mode guarantee), its structure won't change. The walk happens on the main thread and is fast (just pointer comparisons against a Set).

#### Background Task (on concurrent queue)

```
1. Lock: check if this node is still in pendingSpeculativeNodes
   - If removed (superseded by ancestor): unlock, leave group, return
   - If present: remove from pending, add to inflightSpeculativeNodes, unlock
2. Lock: check if any Yoga ancestor (via YGNodeGetOwner walk) is in
   inflightSpeculativeNodes
   - If yes: remove self from inflight, leave group, return
     (ancestor is currently computing and will cover this subtree)
   - If no: unlock, proceed
3. YGNodeCalculateLayout(childYogaNode, availableWidth, .nan, .LTR)
4. Lock: remove from inflightSpeculativeNodes
5. Report tracing (if enabled)
6. Leave group
```

Step 2 closes the race window where a child task starts before its parent is added to pendingSet. If the parent is already computing (inflight), the child skips.

#### Thread Safety Argument

- **Disjoint subtrees are safe:** Siblings dispatched to the concurrent queue operate on non-overlapping Yoga nodes. Concurrent computation is safe.
- **Parent/child overlap prevented by dedup:** When parent P is added to pending, children C1/C2 are removed. Their tasks check pending and skip. If a child task has already started (inflight), the parent task checks inflightSpeculativeNodes via ancestor walk and waits/skips.
- **Yoga nodes exclusively owned:** Persistent mode guarantees the child subtree won't be mutated after appendChild. The main thread doesn't touch these Yoga nodes until `$$completeRoot`, which waits on the DispatchGroup.
- **Text measurement:** `NSAttributedString` sizing is thread-safe on iOS. Already validated in the serial queue implementation.

### Edge Cases

1. **First render:** `parentWidth <= 0`, speculative layout skipped. Root layout in `$$completeRoot` handles it.
2. **All nodes coalesce to root:** If the entire tree is rebuilt, all descendants get removed from pendingSet and only the root-level node computes. This is correct — one large computation instead of many redundant small ones.
3. **Shallow trees:** Few non-leaf nodes means few tasks. Concurrent queue overhead is negligible.
4. **Deep narrow trees:** Each level supersedes the one below. Effectively one task for the deepest complete subtree. Same as serial but no queue backup.

### Tracing Updates

- "Speculative Layout (type)" events continue to appear on the background track, now potentially overlapping (concurrent)
- "Wait Speculative Layout" should shrink significantly — fewer tasks, parallel execution, less redundant work
- Add node count to tracing label when available for debugging

## Scope

All updates (not just transitions). No priority filtering.
