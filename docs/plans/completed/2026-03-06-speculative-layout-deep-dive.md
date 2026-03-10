# Speculative Layout During Render: Deep Dive

## How It Works Today

### The Core Insight

In persistent mode, when React calls `$$appendChild(parent, child)`, the child subtree is **fully built and immutable** — any future changes create new clones, not mutations to this subtree. This gives us an exclusive ownership guarantee: the child's Yoga nodes are safe to layout on any thread without races.

Additionally, the parent node is a **clone of the previous commit's node**, so its Yoga node carries **cached layout** from the last frame. The parent's resolved width is a valid constraint for the child's layout — and if it hasn't changed, the speculative result will exactly match what the root-level layout would compute.

### Pipeline

```
React render (JS, main thread)
  │
  ├─ $$cloneWithNewChildren(node) → YGNodeClone (preserves layout cache)
  ├─ $$appendChild(parent, child₁) → dispatch speculative layout(child₁)  ──→ [background]
  ├─ $$appendChild(parent, child₂) → dispatch speculative layout(child₂)  ──→ [background]
  ├─ $$appendChild(parent, child₃) → unchanged child → YGNodeSwapChild (skip layout)
  │   ...
  ├─ $$appendChild(grandparent, parent) → barrier dispatch layout(parent)  ──→ [background, waits]
  │
  ▼
$$completeRoot (JS, main thread)
  │
  ├─ cleanupTrailingYogaChildren()
  ├─ speculativeLayoutGroup.wait()  ← blocks until all background work done
  ├─ calculateLayout()  ← root YGNodeCalculateLayout (validates speculative work)
  │   └─ Yoga skips clean subtrees (cache hit from speculative layout)
  ├─ readLayoutFrames()
  ├─ diff → mutations → sync → CATransaction.commit()
  ▼
Pixels on screen
```

### Concurrency Model

**Queue**: Concurrent `DispatchQueue` (GCD). Sibling subtrees compute in parallel. Parent-child ordering uses barrier dispatch.

**Synchronization**: Three sets protected by `os_unfair_lock`:
- `pendingSpeculativeNodes` — queued but not started
- `inflightSpeculativeNodes` — currently computing
- `completedSpeculativeNodes` — finished this commit

**Deduplication**: When a parent is scheduled, its pending descendants are removed (parent's layout encompasses them). When a work item starts, it checks if an ancestor is inflight — if so, it skips.

**Barrier dispatch**: If any of a node's Yoga children are pending or inflight, the node is dispatched with `.barrier` flag. This makes GCD drain all prior work items before executing the barrier block — ensuring children finish writing to Yoga before the parent reads their cached results.

**Completed-child skip**: If any of a node's Yoga children are in the `completedSpeculativeNodes` set, the parent is **not scheduled at all**. The root layout at `$$completeRoot` will pick up the children's cached results directly.

### The Swap Optimization

In `$$appendChild`, unchanged children (pointer-identical Yoga node at the same index as `previousYogaChildren`) use `YGNodeSwapChild` instead of `YGNodeInsertChild`:

- `YGNodeSwapChild` only updates the child's owner pointer. Does NOT mark the parent dirty.
- `YGNodeInsertChild` marks the parent dirty and triggers `markDirtyAndPropagate`.
- Result: For a 50-item list with 1 change, only ~1 Yoga operation marks dirty (the changed child's swap + manual `YGNodeMarkDirtyNonLeaf`). The other 49 are no-ops.

This is critical for speculative layout — when Yoga runs on the parent subtree, it skips all 49 unchanged children because they're clean. Only the changed subtree is actually computed.

---

## How Fabric Does It (Comparison)

React Native Fabric does **not** do speculative background layout. Layout is synchronous during commit:

```cpp
// ShadowTree.cpp:tryCommit()
telemetry.willLayout();
newRootShadowNode->layoutIfNeeded(&affectedLayoutableNodes);
telemetry.didLayout(static_cast<int>(affectedLayoutableNodes.size()));
```

Fabric relies entirely on Yoga's incremental layout:
1. `YogaLayoutableShadowNode::updateYogaChildren()` detects clean subtrees by comparing old vs new Yoga children's styles and dirty flags
2. If all children are clean and styles match, the parent stays clean
3. `YGNodeCalculateLayout` skips clean subtrees

Fabric's thread safety is simpler: `ShadowTree::tryCommit()` holds a mutex during layout. No concurrent layout. The tradeoff is that all layout work is on the commit thread (main thread on iOS).

### What We Do That Fabric Doesn't

1. **Background layout during render** — Our speculative layout overlaps with React's JS reconciliation. Fabric waits until commit.
2. **Concurrent sibling layout** — Multiple siblings compute in parallel on GCD's thread pool. Fabric is single-threaded.
3. **Swap-based child handling** — We use `YGNodeSwapChild` to avoid dirtying unchanged children. Fabric rebuilds the Yoga children list via `updateYogaChildren` which does a full comparison.

### What Fabric Does That We Don't

1. **No barrier dispatch overhead** — Single-threaded layout has no synchronization cost.
2. **C++ Yoga integration** — Fabric's Yoga nodes are stack-allocated or arena-allocated C++ objects. Our Yoga nodes cross the Swift-C boundary with pointer indirection.
3. **Style comparison in updateYogaChildren** — Fabric compares Yoga style structs directly (`newYogaChildNode.style() == oldYogaChildNode.style()`) which is a fast memcmp. We compare dictionary keys.

---

## Yoga Thread Safety Analysis

### What's Safe

| Operation | Thread Safety | Why |
|-----------|--------------|-----|
| `YGNodeLayoutGetWidth/Height/Left/Top` | Safe | Read-only, no mutations |
| `YGNodeGetChildCount/GetChild` | Safe | Read-only traversal |
| `YGNodeGetOwner` | Safe | Read-only reference |
| `YGNodeClone` | Safe | Creates independent copy |
| `YGNodeCalculateLayout` on disjoint subtrees | Safe | Each subtree writes only to its own nodes |

### What's NOT Safe

| Operation | Thread Safety | Why |
|-----------|--------------|-----|
| `YGNodeInsertChild` | Unsafe | Mutates parent's children vector + `markDirtyAndPropagate` |
| `YGNodeRemoveChild` | Unsafe | Mutates parent's children vector + `markDirtyAndPropagate` |
| `YGNodeSwapChild` | Unsafe if concurrent | Updates child's owner pointer |
| `YGNodeCalculateLayout` on overlapping trees | Unsafe | Writes layout cache to shared nodes |
| `YGNodeStyleSet*` + concurrent layout | Unsafe | Style write races with layout read |

### Why Our Model Is Safe

The key safety property: **each background work item owns its subtree exclusively**. No two concurrent work items share any Yoga nodes because:

1. Persistent mode guarantees child subtrees are immutable after `$$appendChild`
2. The child's Yoga subtree was built during render (main thread) and is now handed off
3. Ancestor dedup ensures no two inflight items overlap
4. Barrier dispatch ensures parent waits for children to finish

The one subtlety: `$$appendChild` (main thread) calls `YGNodeSwapChild` / `YGNodeInsertChild` on the **parent's** Yoga node, while a background task might be computing layout on a **sibling** subtree. This is safe because:
- Swapping/inserting modifies the parent's children array, not the sibling's
- The sibling's `YGNodeCalculateLayout` only reads from nodes within its subtree
- The parent's layout is dispatched later (after all children are appended)

### One Risk: Text Measurement

`YogaTextMeasure.setupMeasureFunc` sets a measure callback that uses `NSAttributedString` sizing. This runs during `YGNodeCalculateLayout` on background threads. `NSAttributedString.boundingRect(with:options:context:)` is *generally* thread-safe on iOS, but:
- It accesses font caches which may contend
- UIKit font resolution historically had thread-safety caveats before iOS 13
- Our target is iOS 17+ so this is fine, but worth noting

---

## Current Limitations and Opportunities

### Limitation 1: Bottom-Up Reconciliation Timing

React completes work bottom-up (post-order DFS). This means:
- Leaf nodes complete first → their parents → grandparents → root
- The **outermost parent** is built last, right before `$$completeRoot`
- Speculative layout for the outermost parent has minimal overlap with JS work

**Current mitigation**: The completed-child skip (commit 80f6da9) avoids scheduling the outermost parent entirely if its children already completed. Root layout picks up their cached results. But this only works when children completed — if children were deduped into a grandparent, the outermost parent still gets scheduled.

**Opportunity**: If we could dispatch speculative layout **during React's render phase** (before completeWork), we'd have more overlap time. But React's persistent mode doesn't expose a "subtree finalized" signal until `$$appendChild`.

### Limitation 2: Width-Only Constraint

Speculative layout uses the parent's cached **width** as the constraint:
```swift
let availableWidth = parentInnerWidth - childMarginRow
YGNodeCalculateLayout(childYogaNode, availableWidth, .nan, .LTR)
```

The height is NaN (unbounded). This is correct for column-direction flex layouts (most common), but:
- **Row-direction parents with `alignItems: stretch`**: Children need the parent's cross-axis (height) to resolve `alignSelf: stretch`. Speculative layout computes with NaN height → cache miss at root layout → re-computation.
- **Percentage heights**: `height: 50%` resolves against parent height. With NaN, it resolves to auto → cache miss.
- **Aspect ratio**: `aspectRatio` with one dimension undefined may compute differently.

**Opportunity**: Cache both width and height from previous commit. Use both as constraints:
```swift
let parentHeight = Float(parent.layoutFrame.size.height)
let availableHeight = parentHeight - totalVerticalPad - totalVerticalBor - childMarginCol
YGNodeCalculateLayout(childYogaNode, availableWidth, availableHeight, .LTR)
```

Risk: Height constraints are less stable across renders (content changes affect height). More cache misses, but never incorrect (Yoga re-computes on mismatch).

### Limitation 3: No Speculative Layout for New Elements

First render (no cached layout on parent, `parentWidth == 0`) skips speculative layout entirely. This is correct — we have no constraint to speculate with. But initial renders are often the slowest.

**Opportunity**: For SSR hydration, the SSR tree has already been laid out. When hydration clones nodes, the cloned Yoga node carries the SSR layout. We could use SSR constraints for speculative layout during hydration commits.

### Limitation 4: Two-Pass Text Re-measurement

`calculateLayout` in `Renderer.swift` does two Yoga passes when text nodes need re-measurement:
1. First `YGNodeCalculateLayout` — text measures at natural width
2. Check for flex-shrunk text (resolved width < measured width) → `YGNodeMarkDirty`
3. Second `YGNodeCalculateLayout` — text measures at constrained width

Speculative layout on background threads only does one pass. If a speculatively-laid-out subtree has text that needs re-measurement, the root layout's second pass re-computes it — but the first pass is wasted.

**Opportunity**: Run the two-pass logic in the speculative layout work item itself:
```swift
YGNodeCalculateLayout(childYogaNode, availableWidth, .nan, .LTR)
if ShadowTreeLayout.markTextNodesNeedingRemeasure(childNode) {
    YGNodeCalculateLayout(childYogaNode, availableWidth, .nan, .LTR)
}
```

This would make the speculative result match the root layout exactly, improving cache hit rate. Risk: text re-measurement uses UIKit font APIs on background threads (safe on iOS 17+ but more thread contention).

### Limitation 5: Barrier Dispatch Serializes Parent

When a parent has inflight children, it's dispatched with `.barrier` — meaning it waits for ALL prior queue items, not just its children. If other unrelated siblings are also computing, the parent waits for them too.

**Opportunity**: Use `DispatchGroup` per-subtree instead of a global barrier. Each parent waits only for its own children's group, not all concurrent work:
```swift
let childGroup = DispatchGroup()
// ... when dispatching children, enter/leave childGroup ...
// When dispatching parent:
childGroup.notify(queue: speculativeLayoutQueue) {
    // Parent runs only after ITS children finish
}
```

This allows sibling subtrees to compute in parallel even while a parent waits for its children.

### Limitation 6: GCD Thread Pool Overhead

GCD manages its own thread pool. For small subtrees, the dispatch overhead (queue scheduling, thread wakeup, context switch) may exceed the layout cost. Currently, leaf nodes are skipped, but small non-leaf subtrees (e.g., a `<div>` with one `<span>` child) still dispatch.

**Opportunity**: Add a minimum subtree size threshold:
```swift
guard child.yogaNodeCount > THRESHOLD else { return }
```

Where `yogaNodeCount` is either pre-computed or estimated from `children.count`. A threshold of ~5-10 nodes would eliminate dispatch overhead for trivial subtrees while still parallelizing meaningful work.

---

## Comparison: What Browsers Do

Browsers don't do "speculative layout during render" — they do something different:

1. **Layout is incremental with boundaries**: Changing one element doesn't re-layout the whole page. Layout boundaries (overflow:hidden, fixed dimensions, CSS containment) prevent dirty propagation. Our speculative layout achieves a similar effect through Yoga's dirty flags, but without explicit boundaries.

2. **Layout is single-threaded but amortized**: Browsers batch DOM mutations and compute layout once per frame. The layout itself is O(dirty nodes), not O(all nodes). Our speculative layout adds parallelism but at the cost of synchronization overhead.

3. **Compositing separates layout from paint**: Many visual changes (transform, opacity) bypass layout entirely. We don't have a compositor — every visual change goes through Yoga.

4. **Style recalculation is incremental**: Browsers cache computed styles and only recompute dirty elements. We re-apply the full style dictionary on every clone.

The browser's approach is fundamentally different: minimize the amount of work, rather than parallelize the work. Both matter, but **doing less work** is usually more impactful than **doing the same work on more threads**. This is where the other optimization plans (structural sharing, skip unchanged subtrees, lazy prop diffing) would compound with speculative layout.

---

## Recommendations

### High-confidence improvements (do these)

1. **Add height constraint to speculative layout** — Use cached parent height alongside width. Reduces cache misses for stretch/percentage-height children. Low risk (Yoga re-computes on mismatch).

2. **Two-pass text re-measurement in speculative work items** — Run the mark-dirty-and-relayout sequence in the background, not just first-pass layout. Higher cache hit rate at root layout. Low risk (font measurement is thread-safe on iOS 17+).

3. **Per-subtree groups instead of global barrier** — Replace `.barrier` dispatch with per-parent DispatchGroup.notify. Prevents unrelated sibling work from blocking parent computation.

4. **Subtree size threshold** — Skip dispatch for subtrees with fewer than ~5-10 nodes. Eliminates GCD overhead for trivial subtrees.

### Medium-confidence improvements (investigate first)

5. **Speculative layout during SSR hydration** — Use SSR layout constraints for the first speculative pass during hydration. Need to verify SSR Yoga nodes carry valid layout cache after tree handoff.

6. **Speculative readLayoutFrames** — After speculative `YGNodeCalculateLayout`, also read the layout frames into `layoutFrame` on the background thread. Currently `readLayoutFrames` happens on the main thread in `calculateLayout`. This would reduce main-thread work after `group.wait()`. Risk: writing to `layoutFrame` on background while main thread might read it during diff.

### Low-confidence improvements (probably not worth it)

7. **Work-stealing from main thread** — If speculative work isn't done when `$$completeRoot` fires, the main thread could steal pending work items and compute them locally instead of waiting. Complex to implement, marginal benefit if wait times are already low.

8. **Speculative layout before $$appendChild** — Trigger speculative layout from the JS side during React's render phase, before completeWork calls the host config. Would require React reconciler changes and breaks the host config abstraction.
