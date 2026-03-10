# Concurrent Speculative Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch speculative layout from a serial queue with per-node dispatch to a concurrent queue with leaf skipping and ancestor deduplication, eliminating redundant computation and enabling parallel layout of independent subtrees.

**Architecture:** In `$$appendChild`, skip leaf nodes (no children) and add non-leaf nodes to a lock-protected pending set while removing any descendants already pending. Dispatch to a concurrent queue where each task checks if it's been superseded (removed from pending by an ancestor) or if an ancestor is currently computing (inflight set), skipping if so. Only disjoint subtrees compute concurrently.

**Tech Stack:** Swift, Yoga (C), DispatchQueue (.concurrent), os_unfair_lock, DispatchGroup

**Design doc:** `docs/plans/2026-03-06-concurrent-speculative-layout-design.md`

---

### Task 1: Add concurrent queue and thread-safe tracking sets to Bindings

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:59-64`

**Step 1: Replace serial queue with concurrent queue and add tracking sets**

Replace the existing `speculativeLayoutQueue` (line 59-60) and add new properties after `speculativeLayoutGroup` (line 64). The final block should read:

```swift
/// Concurrent background queue for speculative Yoga layout during reconciliation.
/// Independent subtrees compute in parallel; ancestor dedup prevents overlap.
let speculativeLayoutQueue = DispatchQueue(
    label: "com.react-dom-native.speculative-layout",
    attributes: .concurrent
)

/// Tracks in-flight speculative layout tasks. $$completeRoot waits on this
/// before running root layout to ensure all speculative work is complete.
let speculativeLayoutGroup = DispatchGroup()

/// Yoga nodes scheduled for speculative layout but not yet started.
/// Protected by speculativeLock. When a parent is scheduled, its
/// descendants are removed — the parent's layout encompasses them.
var pendingSpeculativeNodes: Set<UnsafeRawPointer> = []

/// Yoga nodes currently mid-computation on the concurrent queue.
/// Protected by speculativeLock. Parent tasks check this to avoid
/// computing a subtree while a child task is still writing to it.
var inflightSpeculativeNodes: Set<UnsafeRawPointer> = []

/// Lock protecting pendingSpeculativeNodes and inflightSpeculativeNodes.
/// os_unfair_lock is the fastest option — no syscall in the uncontended case.
var speculativeLock = os_unfair_lock()
```

**Step 2: Add import for os_unfair_lock**

Add `import os` at line 1 of `Bindings.swift` (after `import Foundation`). `os_unfair_lock` is in the `os` module.

Actually — `os_unfair_lock` is in `Darwin`/`Foundation` on Apple platforms. It's already available via `import Foundation`. No additional import needed. Skip this step.

**Step 3: Commit**

```
git commit -m "feat: add concurrent queue and thread-safe tracking sets for speculative layout"
```

---

### Task 2: Add helper to remove descendants from pending set

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` (add method at end of class, before closing `}` at line 183)

**Step 1: Add removeDescendantsFromPending method**

Add this method at the end of the `Bindings` class (before the closing `}`). This walks a Yoga node's children recursively and removes them from `pendingSpeculativeNodes`. Called from the main thread with the lock already held.

```swift
// MARK: - Speculative Layout Helpers

/// Recursively removes all Yoga descendants of `yogaNode` from
/// pendingSpeculativeNodes. Called with speculativeLock held.
func removeDescendantsFromPending(_ yogaNode: YGNodeRef) {
    let childCount = YGNodeGetChildCount(yogaNode)
    for i in 0..<childCount {
        guard let child = YGNodeGetChild(yogaNode, i) else { continue }
        let key = UnsafeRawPointer(child)
        pendingSpeculativeNodes.remove(key)
        removeDescendantsFromPending(child)
    }
}
```

**Step 2: Commit**

```
git commit -m "feat: add helper to remove descendants from speculative pending set"
```

---

### Task 3: Replace speculative layout dispatch in $$appendChild

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift:427-490`

**Step 1: Replace the speculative layout block**

Replace the entire block from `// --- Speculative background layout ---` (line 427) through the closing `}` of the `if self.speculativeLayoutEnabled` block (line 490) with the new concurrent implementation:

```swift
// --- Speculative background layout ---
// The child subtree is fully built (persistent mode guarantee).
// Speculatively compute its layout on a concurrent background queue.
// Leaf nodes are skipped (trivial for Yoga, parent computes them).
// When a parent is scheduled, its pending descendants are removed
// since the parent's layout encompasses them.

// Skip leaf nodes — dispatch overhead exceeds layout cost,
// and any non-leaf ancestor will compute them.
guard !child.children.isEmpty else { return nil }

let parentWidth = Float(parent.layoutFrame.size.width)
if self.speculativeLayoutEnabled, parentWidth > 0, YGNodeIsDirty(child.yogaNode) {
    // Compute parent inner width (content box): width minus padding and border.
    let parentYoga = parent.yogaNode
    let padL = YGNodeStyleGetPadding(parentYoga, .left)
    let padR = YGNodeStyleGetPadding(parentYoga, .right)
    let padAll = YGNodeStyleGetPadding(parentYoga, .all)
    let borL = YGNodeStyleGetBorder(parentYoga, .left)
    let borR = YGNodeStyleGetBorder(parentYoga, .right)
    let borAll = YGNodeStyleGetBorder(parentYoga, .all)
    let totalPad = (padL.unit == .point ? padL.value : (padAll.unit == .point ? padAll.value : 0))
                 + (padR.unit == .point ? padR.value : (padAll.unit == .point ? padAll.value : 0))
    let totalBor = (!borL.isNaN ? borL : (!borAll.isNaN ? borAll : 0))
                 + (!borR.isNaN ? borR : (!borAll.isNaN ? borAll : 0))
    let parentInnerWidth = parentWidth - totalPad - totalBor

    // Subtract child's horizontal margins — Yoga's flex algorithm
    // deducts margins from the available width before laying out each child.
    let childYoga = child.yogaNode
    let cMarL = YGNodeStyleGetMargin(childYoga, .left)
    let cMarR = YGNodeStyleGetMargin(childYoga, .right)
    let cMarAll = YGNodeStyleGetMargin(childYoga, .all)
    let childMarginRow = (cMarL.unit == .point ? cMarL.value : (cMarAll.unit == .point ? cMarAll.value : 0))
                       + (cMarR.unit == .point ? cMarR.value : (cMarAll.unit == .point ? cMarAll.value : 0))
    let availableWidth = parentInnerWidth - childMarginRow

    let childYogaNode = child.yogaNode
    let childYogaKey = UnsafeRawPointer(childYogaNode)
    let tracing = self.nativeTracingEnabled
    let childType = child.family.elementType

    // Add to pending set, removing any descendants already pending
    // (this node's layout encompasses them).
    os_unfair_lock_lock(&self.speculativeLock)
    self.pendingSpeculativeNodes.insert(childYogaKey)
    self.removeDescendantsFromPending(childYogaNode)
    os_unfair_lock_unlock(&self.speculativeLock)

    self.speculativeLayoutGroup.enter()
    self.speculativeLayoutQueue.async {
        // Check if this node was superseded by an ancestor
        os_unfair_lock_lock(&self.speculativeLock)
        let stillPending = self.pendingSpeculativeNodes.contains(childYogaKey)
        if stillPending {
            self.pendingSpeculativeNodes.remove(childYogaKey)
            self.inflightSpeculativeNodes.insert(childYogaKey)
        }
        os_unfair_lock_unlock(&self.speculativeLock)

        guard stillPending else {
            self.speculativeLayoutGroup.leave()
            return
        }

        // Check if any ancestor is currently computing (inflight).
        // If so, skip — the ancestor's layout covers this subtree.
        var ancestor = YGNodeGetOwner(childYogaNode)
        var ancestorInflight = false
        os_unfair_lock_lock(&self.speculativeLock)
        while let a = ancestor {
            if self.inflightSpeculativeNodes.contains(UnsafeRawPointer(a)) {
                ancestorInflight = true
                break
            }
            ancestor = YGNodeGetOwner(a)
        }
        if ancestorInflight {
            self.inflightSpeculativeNodes.remove(childYogaKey)
        }
        os_unfair_lock_unlock(&self.speculativeLock)

        guard !ancestorInflight else {
            self.speculativeLayoutGroup.leave()
            return
        }

        // Compute layout — this subtree is disjoint from all other
        // inflight computations.
        let start = tracing ? performanceNow() : 0
        YGNodeCalculateLayout(childYogaNode, availableWidth, .nan, .LTR)
        let end = tracing ? performanceNow() : 0

        // Remove from inflight
        os_unfair_lock_lock(&self.speculativeLock)
        self.inflightSpeculativeNodes.remove(childYogaKey)
        os_unfair_lock_unlock(&self.speculativeLock)

        if tracing {
            DispatchQueue.main.async {
                self.tracer?.reportTimeStamp(
                    label: "Speculative Layout (\(childType))",
                    start: start, end: end,
                    track: "Speculative Layout", trackGroup: "Native ⚛",
                    color: "tertiary-light"
                )
            }
        }
        self.speculativeLayoutGroup.leave()
    }
}

return nil
```

Note: The `guard !child.children.isEmpty else { return nil }` at the top means leaf nodes return immediately without reaching the speculative layout block. The existing `return nil` at line 492 is replaced by the `return nil` inside the guard and at the end of the new block.

**Step 2: Commit**

```
git commit -m "feat: concurrent speculative layout with leaf skipping and ancestor dedup"
```

---

### Task 4: Clear tracking sets in $$completeRoot after wait

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift:563-575` (the wait block in $$completeRoot)

**Step 1: Clear sets after group.wait()**

After `self.speculativeLayoutGroup.wait()` (line 565), clear both tracking sets. They should already be empty if all tasks completed, but clearing ensures no stale pointers persist across commits.

Replace lines 563-575 with:

```swift
// Wait for any in-flight speculative layouts to complete
let waitStart = tracing ? performanceNow() : 0
self.speculativeLayoutGroup.wait()
let waitEnd = tracing ? performanceNow() : 0

// Clear tracking sets (should already be empty, but defensive)
os_unfair_lock_lock(&self.speculativeLock)
self.pendingSpeculativeNodes.removeAll()
self.inflightSpeculativeNodes.removeAll()
os_unfair_lock_unlock(&self.speculativeLock)

if tracing, waitEnd > waitStart + 0.001 {
    self.tracer?.reportTimeStamp(
        label: "Wait Speculative Layout",
        start: waitStart, end: waitEnd,
        track: "Shadow Tree", trackGroup: "Native ⚛",
        color: "warning"
    )
}
```

**Step 2: Commit**

```
git commit -m "feat: clear speculative layout tracking sets after commit wait"
```

---

### Task 5: Update threading comment

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:17-28`

**Step 1: Update the threading header comment**

Replace lines 17-28 with:

```swift
//
// Threading: All calls are synchronous on the main thread. The engine,
// shadow tree, Yoga layout, and UIKit all share the main thread.
//
// Exception: $$appendChild dispatches speculative Yoga layout on a
// concurrent background queue for completed subtrees. Leaf nodes are
// skipped. Ancestor deduplication ensures only disjoint subtrees compute
// concurrently — when a parent is scheduled, pending children are removed,
// and inflight children cause the parent to skip. $$completeRoot waits
// for all speculative layouts before running root layout.
//
// Exception: $$fetch is asynchronous. The call returns immediately, and
// URLSession performs the HTTP request on a background thread. Response
// chunks are delivered via callbacks dispatched to the main thread.
// ---------------------------------------------------------------------------
```

**Step 2: Commit**

```
git commit -m "docs: update threading comment for concurrent speculative layout"
```

---

### Task 6: Run integration tests

**Step 1: Run tests**

Run: `/test`

All existing layout and integration tests should pass unchanged. The concurrent speculative layout is a pure optimization — root layout at `$$completeRoot` validates or re-computes any speculative results.

**Step 2: If tests fail, debug**

Likely causes:
- Lock ordering issue (deadlock) — check that `speculativeLock` is never held while calling functions that also acquire it (except `removeDescendantsFromPending` which is designed to be called with lock held)
- `UnsafeRawPointer` from freed Yoga node — check that Yoga nodes outlive the speculative task (they should, since persistent mode keeps them alive until the next clone)

---

### Task 7: Build and performance validate

**Step 1: Build the demo app**

Run: `/build demo`

**Step 2: Capture a performance trace**

Use falcon-devtools MCP to start a trace, trigger a stress test update, stop the trace.

**Step 3: Verify in trace**

Look for:
- Fewer "Speculative Layout" events (leaves skipped, descendants deduplicated)
- "Speculative Layout" events potentially overlapping in time (concurrent execution of sibling subtrees)
- "Wait Speculative Layout" (yellow) significantly reduced or absent
- Overall commit time reduced

**Step 4: Squash and final commit**

```
git commit -m "perf: concurrent speculative layout with leaf skipping and ancestor dedup

Switch speculative layout from serial per-node dispatch to concurrent
queue with two optimizations:

1. Skip leaf nodes — dispatch overhead exceeds layout cost for nodes
   with no children, and any ancestor will compute them.

2. Ancestor deduplication — when a parent is scheduled, pending
   descendants are removed (parent's layout encompasses them).
   Inflight ancestor check prevents concurrent access to overlapping
   Yoga subtrees.

Independent subtrees (siblings) now compute in parallel on the
concurrent queue, while overlapping subtrees are safely deduplicated."
```
