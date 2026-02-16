# Scroll Container Sizing Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the scroll container so users can scroll all the way to the bottom of the content.

**Architecture:** The root scroll view's `contentSize.height` is set from the Yoga temp root's computed height. Diagnostic logs show this height (2423.5) is much smaller than the actual bottom of the last child (3612.8), leaving ~33% of content unreachable. The fix involves understanding why Yoga computes the wrong height for the root `<div>` and correcting the content size computation.

**Tech Stack:** Swift, Yoga layout engine, UIScrollView

---

## Diagnostic Summary

From captured logs (`$completeRoot` diagnostic prints):

| Metric | Value |
|--------|-------|
| Scroll view bounds | 402 x 778 |
| contentSize.height | 2423.5 |
| Root `<div>` Yoga height | 2423.5 |
| Last child (`<p>`) y position | 3590.8 |
| Last child bottom | 3612.8 |
| **Content gap** | **~1189 points (33%)** |

The root `<div>` has `display: block`. Yoga computes its height as 2423.5, but its block-level children extend to y=3612.8. This means Yoga's block display height computation doesn't match the actual child positions.

---

### Task 1: Add detailed child position logging

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:362-373`

**Step 1: Add logging for first pass vs second pass heights and all root div children**

In `calculateYogaLayout()`, add logging to compare first pass vs second pass, and dump all direct children of the root div with their positions.

Replace the existing diagnostic logging block in `$completeRoot` (lines 362-373) with:

```swift
print("[Bindings] Layout bounds: \(bounds), contentSize: \(contentSize)")
if let rootChild = newChildren.first {
    print("[Bindings] Root child (\(rootChild.family.elementType)) layoutFrame: \(rootChild.layoutFrame)")
    // Dump ALL direct children with positions
    for (i, child) in rootChild.children.enumerated() {
        let bottom = child.layoutFrame.origin.y + child.layoutFrame.height
        print("[Bindings] Child[\(i)] (\(child.family.elementType)) y=\(child.layoutFrame.origin.y) h=\(child.layoutFrame.height) bottom=\(bottom)")
    }
}
```

Also in `calculateYogaLayout()`, add logging after first pass and after second pass to compare:

After `YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)` (line ~499), add:
```swift
let firstPassHeight = YGNodeLayoutGetHeight(rootNode)
print("[Bindings] First pass root height: \(firstPassHeight)")
```

After the second pass (line ~512), add:
```swift
let secondPassHeight = YGNodeLayoutGetHeight(rootNode)
print("[Bindings] Second pass root height: \(secondPassHeight), needed second pass: \(needsSecondPass)")
```

**Step 2: Build and capture logs**

1. Build and run: `build_run_sim` MCP tool
2. Wait for app to load
3. Capture screenshot to see the scroll issue
4. Capture logs: `start_sim_log_cap` → wait → `stop_sim_log_cap`
5. Grep logs for `[Bindings]` to get all diagnostics

**Step 3: Analyze findings**

Compare first pass height vs second pass height. Check which children are positioned beyond the root div's height. Determine if the issue is:
- (A) Second pass doesn't update root height despite child positions changing
- (B) First pass already computes wrong height
- (C) Block display mode doesn't correctly accumulate child heights with margins

---

### Task 2: Fix content size computation

Based on Task 1 findings, apply the appropriate fix.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Likely fix: Compute content height from actual child positions**

If Yoga's block display height is wrong (regardless of root cause), the robust fix is to compute the content height by walking children after `readYogaLayout`:

**Step 1: Add a helper to compute actual content height**

After the `readYogaLayout` method, add:

```swift
/// Compute the actual content height by finding the maximum bottom
/// coordinate of all children. This handles cases where Yoga's block
/// display mode computes a height smaller than child positions require.
private func computeActualContentHeight(for nodes: [ShadowNodeWrapper]) -> CGFloat {
    var maxBottom: CGFloat = 0
    for node in nodes {
        let nodeBottom = node.layoutFrame.origin.y + node.layoutFrame.height
        maxBottom = max(maxBottom, nodeBottom)
        // Check children recursively — a node's children might extend
        // beyond the node's own computed height
        let childrenMaxBottom = computeActualContentHeight(for: node.children)
        if childrenMaxBottom > node.layoutFrame.height {
            maxBottom = max(maxBottom, node.layoutFrame.origin.y + childrenMaxBottom)
        }
    }
    return maxBottom
}
```

**Step 2: Use actual content height for scroll view content size**

In `calculateYogaLayout`, replace the content size reading:

```swift
// Before:
let contentSize = CGSize(
    width: CGFloat(YGNodeLayoutGetWidth(rootNode)),
    height: CGFloat(YGNodeLayoutGetHeight(rootNode))
)

// After:
let yogaHeight = CGFloat(YGNodeLayoutGetHeight(rootNode))
let actualHeight = computeActualContentHeight(for: children)
let contentSize = CGSize(
    width: CGFloat(YGNodeLayoutGetWidth(rootNode)),
    height: max(yogaHeight, actualHeight)
)
```

**Step 3: Build and verify**

1. Build and run: `build_run_sim`
2. Take screenshot — verify scroll can reach the bottom
3. Scroll to bottom: use `gesture` preset `scroll-up` several times
4. Take another screenshot at the bottom to confirm all content is visible

---

### Task 3: Investigate root cause in Yoga block display

If Task 2's workaround fixes the scroll issue, investigate whether the Yoga block display height computation is actually incorrect.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` (temp root setup)

**Step 1: Test with block display temp root**

In `calculateYogaLayout`, try changing the temp root from flex column to block display:

```swift
// Instead of:
YGNodeStyleSetFlexDirection(rootNode, .column)

// Try:
YGNodeStyleSetDisplay(rootNode, .block)
```

Build and run. Compare the Yoga-computed height with and without this change. If the block temp root computes the correct height, the issue is specifically with how a flex column parent computes the height of a `display: block` child.

**Step 2: Document findings**

Add a code comment explaining the root cause and why the content height workaround is needed.

---

### Task 4: Remove diagnostic logging

After the fix is verified, remove all `print("[Bindings]")` diagnostic statements from Bindings.swift that were added during investigation, keeping only the actual fix.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Remove all diagnostic prints**

Remove all `print("[Bindings]` calls except for the warning/error ones that are useful long-term.

**Step 2: Build and verify**

1. Build: `build_sim`
2. Verify build succeeds

---

### Task 5: Run tests

**Step 1: Run Fantom tests**

Run: `npm run test:fantom`

Expected: All 42+ tests pass

**Step 2: Build and run final verification**

1. `build_run_sim`
2. Take screenshot at top — content renders correctly
3. Scroll to bottom — all content visible
4. Take screenshot at bottom — last item ("Rendered at ...") is visible

---

## Files to modify

- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — fix content height computation, remove diagnostic logging

## Verification

1. `npm run test:fantom` — all tests pass
2. Build and run in simulator — content scrolls all the way to the bottom
3. All sections visible: Counter, Search, Inline Text, Block Containers, Definition Lists, Tables, Form Controls, Media, timestamp
