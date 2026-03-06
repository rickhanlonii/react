# Perf 07: Skip Second Yoga Layout Pass When Unnecessary

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save ~2.6ms when no text nodes are flex-shrunk, by skipping the redundant second Yoga layout pass.

**Architecture:** After the first Yoga layout pass, the renderer checks ALL text nodes to see if any were flex-shrunk narrower than their measured width. If ANY were, the entire tree is relaid out. For trees without flex-shrinking text containers, this check and potential second pass are unnecessary. We can track at tree construction time whether shrinkable text exists.

**Tech Stack:** Swift, Yoga

---

### Task 1: Track whether tree has flex-shrinkable text

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift:331`

**Step 1: Optimize the second pass check**

In `calculateLayout()` (line 362-374), the current code walks all children checking for text remeasure need. The quickest win is to skip the walk entirely when the first pass reports `second pass=no`:

Find the second pass logic:
```swift
var needsSecondPass = false
for child in children {
    if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
        needsSecondPass = true
    }
}
if needsSecondPass {
    YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)
}
```

Add an early exit — check if any text node's layout width differs from its measured width. The `markTextNodesNeedingRemeasure` already walks the tree. The optimization is to break early once we know we need a second pass:

```swift
var needsSecondPass = false
for child in children {
    if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
        needsSecondPass = true
        break  // No need to check remaining children
    }
}
```

Wait — the current code already checks all children (no break). But `markTextNodesNeedingRemeasure` marks nodes dirty as a side effect, so we can't break early — we need to mark ALL dirty nodes before the second pass.

The real optimization is: if the tree has no text nodes at all, skip the entire walk. Add a flag during tree construction:

**Step 2: Add hasTextNodes flag to ShadowNodeWrapper**

In `ShadowNodeWrapper.swift`, add a computed property or track during tree construction whether any descendant is a text node. The simplest approach — check in calculateLayout:

```swift
// Quick check: does this tree have any text nodes?
func treeHasTextNodes(_ nodes: [ShadowNodeWrapper]) -> Bool {
    for node in nodes {
        if node.family.elementType == "#text" { return true }
        if treeHasTextNodes(node.children) { return true }
    }
    return false
}

// In calculateLayout, before the second pass check:
if treeHasTextNodes(children) {
    var needsSecondPass = false
    for child in children {
        if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
            needsSecondPass = true
        }
    }
    if needsSecondPass {
        YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)
    }
}
```

This avoids the `markTextNodesNeedingRemeasure` walk (which does Yoga dirty marking) when there are no text nodes. For typical pages that DO have text, a better optimization is caching the `hasTextNodes` flag on the tree during construction rather than walking at layout time.

**Step 3: Build and run**

Run: `/build demo`
Expected: App renders identically. Trees without text skip the second pass check.

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift
git commit -m "perf: skip second Yoga pass check when tree has no text nodes"
```
