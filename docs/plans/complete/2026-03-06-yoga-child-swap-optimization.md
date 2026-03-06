# Yoga Child Swap Optimization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** In `$$appendChild`, skip yoga node removal/insertion for unchanged children, so only the changed child's subtree is traversed during speculative layout.

**Architecture:** After `YGNodeClone` in `cloneWithNewChildren`, preserve the cloned yoga children instead of removing them all. Store the old yoga child pointers for comparison. In `$$appendChild`, compare the incoming child's yoga node against the old child at that position — if identical, use `YGNodeSwapChild` (ownership update only, no dirty); if different, swap and dirty the parent. This reduces yoga operations from O(all_children) to O(changed_children) and ensures Yoga only traverses dirty paths during speculative layout.

**Tech Stack:** Swift, Yoga (C/C++), ShadowNodeWrapper

**Design doc:** `docs/plans/2026-03-06-concurrent-speculative-layout-design.md`

---

### Task 1: Add `YGNodeMarkDirtyNonLeaf` to Yoga's public API

`YGNodeMarkDirty` only works on leaf nodes (asserts `hasMeasureFunc()`). We need a way to mark non-leaf parent nodes dirty after swapping a child via `YGNodeSwapChild`, which doesn't dirty the parent.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/Yoga/include/yoga/YGNode.h`
- Modify: `packages/react-dom-native/ios/Sources/Yoga/yoga/YGNode.cpp`

**Step 1: Add declaration to header**

In `YGNode.h`, after the `YGNodeMarkDirty` declaration (line 103), add:

```c
// Like YGNodeMarkDirty but works on any node (not just leaves with
// measure functions). Used when swapping children via YGNodeSwapChild
// which doesn't propagate dirty state.
YG_EXPORT void YGNodeMarkDirtyNonLeaf(YGNodeRef node);
```

**Step 2: Add implementation**

In `YGNode.cpp`, after the `YGNodeMarkDirty` function (line 118), add:

```cpp
void YGNodeMarkDirtyNonLeaf(const YGNodeRef nodeRef) {
  resolveRef(nodeRef)->markDirtyAndPropagate();
}
```

**Step 3: Commit**

```
git commit -m "feat(yoga): add YGNodeMarkDirtyNonLeaf for non-leaf dirty propagation"
```

---

### Task 2: Add `previousYogaChildren` property to ShadowNodeWrapper

Store the cloned yoga node's children pointers so `$$appendChild` can compare incoming children against old ones.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift`

**Step 1: Add property**

After `oldChildFamilies` (line 53), add:

```swift
/// Yoga child node pointers from the clone source, used by $$appendChild
/// to detect unchanged children and skip yoga operations. Set by
/// cloneWithNewChildren when preserving the cloned yoga children.
/// Nil for non-clones or clones where children are fully rebuilt.
public var previousYogaChildren: [YGNodeRef]? = nil
```

**Step 2: Commit**

```
git commit -m "feat: add previousYogaChildren property for child swap detection"
```

---

### Task 3: Preserve yoga children in `cloneWithNewChildren`

Stop removing all yoga children after cloning. Instead, keep them in place and store pointers for comparison in `$$appendChild`.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift:255-272`

**Step 1: Rewrite `cloneWithNewChildren`**

Replace the current `cloneWithNewChildren` method with:

```swift
/// Clone with new children, keeping existing props.
/// Uses YGNodeClone to preserve the source node's layout cache.
/// Old yoga children are kept in the cloned yoga node for $$appendChild
/// to compare against — unchanged children skip yoga operations entirely.
public func cloneWithNewChildren(_ newChildren: [ShadowNodeWrapper]) -> ShadowNodeWrapper {
    let clonedYoga = YGNodeClone(self.yogaNode)!
    // Capture old yoga children BEFORE any modifications.
    // These are the same pointers as in the original node's yoga tree.
    let oldYogaChildCount = YGNodeGetChildCount(clonedYoga)
    var oldYogaChildren: [YGNodeRef] = []
    oldYogaChildren.reserveCapacity(Int(oldYogaChildCount))
    for i in 0..<oldYogaChildCount {
        if let child = YGNodeGetChild(clonedYoga, i) {
            oldYogaChildren.append(child)
        }
    }

    let cloned = ShadowNodeWrapper(
        props: self.props,
        children: newChildren,
        family: self.family,
        text: self.text,
        yogaNode: clonedYoga
    )
    cloned.layoutFrame = self.layoutFrame

    // Store old yoga children for $$appendChild comparison.
    // If there are no old children (first render), skip — nothing to compare.
    if !oldYogaChildren.isEmpty {
        cloned.previousYogaChildren = oldYogaChildren
    }

    // Insert preserved children (e.g. #suspense) into the yoga tree.
    // These replace old children at their positions.
    for (index, child) in newChildren.enumerated() {
        if index < oldYogaChildren.count {
            // Position occupied by old child — swap it
            if let owner = YGNodeGetOwner(child.yogaNode), owner != clonedYoga {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeSwapChild(clonedYoga, child.yogaNode, index)
        } else {
            // Beyond old children — append
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(clonedYoga, child.yogaNode, index)
        }
    }

    return cloned
}
```

**Step 2: Apply same pattern to `cloneWithNewChildrenAndProps`**

Replace the current `cloneWithNewChildrenAndProps` with the same approach (use `YGNodeClone`, keep old children, store `previousYogaChildren`). Same logic as above but with `newProps` instead of `self.props`.

**Step 3: Commit**

```
git commit -m "feat: preserve yoga children in cloneWithNewChildren for swap optimization"
```

---

### Task 4: Skip yoga operations for unchanged children in `$$appendChild`

The core optimization. In `$$appendChild`, compare the incoming child's yoga node against the old yoga child at the insertion position. Skip yoga insert for matches.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift:229-234`

**Step 1: Replace the yoga insert block**

Replace the current yoga insert block (lines 229-234):

```swift
parent.children.insert(child, at: insertionIndex)
// Wire up Yoga parent-child relationship
if let owner = YGNodeGetOwner(child.yogaNode) {
    YGNodeRemoveChild(owner, child.yogaNode)
}
YGNodeInsertChild(parent.yogaNode, child.yogaNode, insertionIndex)
```

With the swap-aware version:

```swift
parent.children.insert(child, at: insertionIndex)

// Wire up Yoga parent-child relationship.
// When the parent has previousYogaChildren (from cloneWithNewChildren),
// compare against the old child at this position. Unchanged children
// skip yoga operations entirely — their subtrees won't be traversed
// during speculative layout.
if let prevChildren = parent.previousYogaChildren,
   insertionIndex < prevChildren.count,
   child.yogaNode == prevChildren[insertionIndex] {
    // UNCHANGED child — already in yoga tree at correct position.
    // Just update ownership from original parent to clone.
    YGNodeSwapChild(parent.yogaNode, child.yogaNode, insertionIndex)
} else {
    // CHANGED child (or no previousYogaChildren) — full yoga insert.
    if let prevChildren = parent.previousYogaChildren,
       insertionIndex < prevChildren.count {
        // Swap out the old yoga child at this position.
        // Remove old child's owner reference, then swap in new child.
        if let owner = YGNodeGetOwner(child.yogaNode), owner != parent.yogaNode {
            YGNodeRemoveChild(owner, child.yogaNode)
        }
        YGNodeSwapChild(parent.yogaNode, child.yogaNode, insertionIndex)
        // SwapChild doesn't dirty — manually propagate dirty since
        // the child changed.
        YGNodeMarkDirtyNonLeaf(parent.yogaNode)
    } else {
        // No previous children or appending beyond old count — regular insert.
        if let owner = YGNodeGetOwner(child.yogaNode) {
            YGNodeRemoveChild(owner, child.yogaNode)
        }
        YGNodeInsertChild(parent.yogaNode, child.yogaNode, insertionIndex)
    }
}
```

**Step 2: Commit**

```
git commit -m "feat: skip yoga insert for unchanged children in appendChild"
```

---

### Task 5: Clean up trailing old yoga children

When children are removed (new count < old count), trailing old yoga children remain in the cloned yoga node. Clean them up after all `$$appendChild` calls complete.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` (in `$$completeRoot`, before speculative wait)

**Step 1: Add cleanup helper to Bindings**

Add to `Bindings.swift` after `removeDescendantsFromPending`:

```swift
/// Recursively cleans up trailing old yoga children from nodes that
/// used the swap optimization (previousYogaChildren). Called once
/// before speculative layout wait in $$completeRoot.
func cleanupTrailingYogaChildren(_ nodes: [ShadowNodeWrapper]) {
    for node in nodes {
        if let prevChildren = node.previousYogaChildren {
            let expectedCount = UInt32(node.children.count)
            while YGNodeGetChildCount(node.yogaNode) > expectedCount {
                let lastIdx = YGNodeGetChildCount(node.yogaNode) - 1
                if let trailing = YGNodeGetChild(node.yogaNode, lastIdx) {
                    YGNodeRemoveChild(node.yogaNode, trailing)
                }
            }
            node.previousYogaChildren = nil
        }
        cleanupTrailingYogaChildren(node.children)
    }
}
```

**Step 2: Call cleanup in `$$completeRoot`**

In `$$completeRoot`, right after "2b. Unwrap revealed #suspense nodes" and before "Wait for any in-flight speculative layouts", add:

```swift
// Clean up trailing old yoga children from swap optimization.
// Nodes that had more old children than new children still have
// stale yoga children that need removal before layout.
self.cleanupTrailingYogaChildren(newChildren)
```

**Step 3: Commit**

```
git commit -m "feat: clean up trailing yoga children from swap optimization"
```

---

### Task 6: Run tests

**Step 1: Run Swift unit tests**

Run: `/test swift`

All existing tests should pass. The swap optimization preserves behavior — same yoga tree structure, same layout results.

**Step 2: Run JS unit tests**

Run: `/test js`

**Step 3: If tests fail, debug**

Likely causes:
- Yoga child ownership not updated correctly — check `YGNodeSwapChild` calls update owner for unchanged children
- Trailing children not cleaned up — check `cleanupTrailingYogaChildren` runs before layout
- `previousYogaChildren` index mismatch with suspense interleaving — the `insertionIndex` from `findInsertionIndex` may not match old yoga positions when suspense children are interleaved. If tests fail with suspense scenarios, skip the optimization when `parent.oldChildFamilies != nil` (suspense interleaving active)

---

### Task 7: Build and performance validate

**Step 1: Build the demo app**

Run: `/build demo`

**Step 2: Capture single-item trace**

Use falcon-devtools MCP to start a trace. Tap a single item's + button 3 times. Stop the trace.

**Step 3: Compare**

Look for:
- **Fewer speculative layout events** — unchanged siblings should NOT trigger speculative layout
- **Smaller top speculative layout** — the big parent should be <1ms (only traverses the changed path + cache checks for unchanged siblings)
- **Wait Speculative Layout near 0ms** — the fast speculative layout completes during render
- **Yoga root layout <0.5ms** — cache hit from speculative

Expected improvement for single-item update:
- Before: top speculative ~3.6ms, wait ~2.5ms
- After: top speculative <1ms, wait ~0ms

**Step 4: Capture stress test trace**

Tap "+1 All" 3 times. All 50 items change — this is the worst case. Performance should be similar to current (all children changed → all swapped → no savings).

**Step 5: Squash and final commit**

```
git commit -m "perf: swap-only yoga children in appendChild for incremental layout

When a parent is cloned with new children, preserve the old yoga
children from YGNodeClone instead of removing and re-inserting all
of them. In $$appendChild, compare each incoming child's yoga node
against the old child at that position:

- UNCHANGED (same pointer): YGNodeSwapChild for ownership only.
  No dirty propagation, no subtree traversal during speculative layout.

- CHANGED (different pointer): YGNodeSwapChild + YGNodeMarkDirtyNonLeaf.
  Only the changed child's subtree is traversed.

For a 50-item list with 1 item changed: reduces yoga operations from
100 (50 removes + 50 inserts) to 2 (1 swap + 1 dirty). Speculative
layout traverses ~10 nodes instead of ~500."
```
