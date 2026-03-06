# Speculative Background Layout

## Problem

Layout computation (Yoga) runs synchronously on the main thread during `$$completeRoot`. For complex trees, this blocks the main thread and delays frame delivery.

## Design

Speculatively compute Yoga layout on a background thread for subtrees as they complete during React's reconciliation phase, so layout work is already done (or mostly done) by the time `$$completeRoot` fires.

### Core Insight

In persistent mode, `$$appendChild(parent, child)` is effectively `finalizeSubtree(child)` — the child subtree is fully built and won't be mutated further (new changes create new clones). This means:

1. The child subtree's Yoga nodes are exclusively owned — safe to layout on any thread
2. The parent's cloned Yoga node has cached layout from the previous commit — provides parent constraints
3. Yoga's incremental layout naturally validates speculative work — if parent constraints match, the subtree is skipped at root layout; if they differ, Yoga re-computes (correctness preserved)

### Mechanism

**Trigger:** `$$appendChild(parent, child)` dispatches background Yoga layout on the child subtree using the parent's previous resolved width as the constraint.

**Synchronization:** A `DispatchGroup` tracks in-flight background layouts. `$$completeRoot` calls `group.wait()` before running root-level `YGNodeCalculateLayout`.

**Validation:** Root-level `YGNodeCalculateLayout` runs as normal. Yoga skips subtrees whose speculative layout used correct constraints (cache hit). On constraint mismatch, Yoga re-computes (cache miss — no correctness risk).

### Pseudocode

```
$$appendChild(parent, child):
  YGNodeInsertChild(parent.yogaNode, child.yogaNode, index)  // existing

  let parentWidth = YGNodeLayoutGetWidth(parent.yogaNode)     // cached from previous commit
  if parentWidth > 0:                                         // skip if no previous layout
    dispatchGroup.enter()
    backgroundQueue.async {
      YGNodeCalculateLayout(child.yogaNode, parentWidth, .nan, .LTR)
      dispatchGroup.leave()
    }

$$completeRoot(surfaceId, childNodeIds):
  dispatchGroup.wait()       // wait for in-flight speculative layouts
  calculateLayout()          // root layout — skips clean subtrees
  readLayoutFrames()         // extract frames
  applyMutations()           // UIKit on main thread
```

### Edge Cases

1. **First render (no previous layout):** Parent's Yoga node has no cached layout (width = 0). Skip speculative layout — `$$completeRoot` handles it normally.

2. **Parent constraint changes:** Yoga re-computes the subtree at root layout time. Speculative work is wasted but harmless.

3. **Text measurement:** Text nodes use `NSAttributedString` for measurement. Need to verify this is safe on background threads (iOS `NSAttributedString` sizing is generally thread-safe but worth confirming).

4. **Small subtrees:** Dispatch overhead may exceed layout cost for trivial subtrees. Start without a threshold, measure, optimize later.

### Threading

- **Background queue:** Single serial `DispatchQueue` to avoid contention. Could upgrade to concurrent since each child subtree's Yoga nodes are independent.
- **Main thread:** `group.wait()` at `$$completeRoot` blocks briefly if background work isn't done yet. In the common case, background work finishes during remaining reconciliation, so wait is zero.

## Scope

All updates (not just transitions). Keeps the implementation simple — no priority filtering needed.
