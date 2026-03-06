# Perf 05: Skip Unchanged Subtrees in Diff and syncAllFrames

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 1-3ms by skipping recursion into identical subtrees during diff and frame sync.

**Architecture:** In persistent mode, when React's reconciler produces `oldChild === newChild` (same pointer), the entire subtree is unchanged. Currently, the diff still recurses into children and `syncAllFrames` walks every node. Both can short-circuit for identical nodes.

**Tech Stack:** Swift

---

### Task 1: Short-circuit diff for identical nodes

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/Differentiator.swift`

**Step 1: Add identity check before recursion**

In the diff method, find the recursion into children (around line 95). Before the recursive `diff()` call, add an identity check:

```swift
// If the node is the exact same object (not just same family),
// the entire subtree is unchanged — skip recursion.
if oldChild === newChild {
    matchedFamilies.insert(familyKey)
    continue
}
```

This should be placed after the `familyKey` match is found but before the `oldChild !== newChild` prop check and recursive call.

**Step 2: Build and verify**

Run: `/build demo`
Expected: App renders identically. Unchanged subtrees produce no mutations.

---

### Task 2: Skip unchanged subtrees in syncAllFrames

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift:288`

**Step 1: Add dirty tracking to skip clean subtrees**

In `syncAllFrames`, only recurse into children if the node was cloned (not the same pointer as current tree). Since we already have `currentTree`, we can track this via the diff's mutation output — but a simpler approach is to check `YGNodeGetHasNewLayout`:

```swift
func syncAllFrames(_ nodes: [ShadowNodeWrapper]) {
    for node in nodes {
        // Yoga already tracks whether this subtree has new layout.
        // If hasNewLayout was already consumed by readLayoutFrames,
        // we can skip nodes whose frame hasn't changed.
        if let view = viewRegistry.view(for: node.family) {
            if view.frame != node.layoutFrame {
                view.frame = node.layoutFrame
            }
            // Sync scroll content size
            if let scrollView = view as? UIScrollView,
               let scrollHeight = node.scrollContentHeight {
                let newSize = CGSize(width: scrollView.bounds.width, height: scrollHeight)
                if scrollView.contentSize != newSize {
                    scrollView.contentSize = newSize
                }
            }
        }
        syncAllFrames(node.children)
    }
}
```

The key optimization is actually that nodes untouched by the diff already have correct frames from the previous commit. A clean approach: only call `syncAllFrames` on nodes that were CREATE'd or UPDATE'd, since those are the only ones whose frames might need sync. But this requires passing mutation info. For now, the diff short-circuit in Task 1 is the higher-value change.

**Step 2: Build and verify**

Run: `/build demo`
Expected: App renders identically.

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/Differentiator.swift \
        packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift
git commit -m "perf: skip unchanged subtrees in diff and frame sync"
```
