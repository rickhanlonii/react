# Performance Findings: Yoga Layout + Node Creation

**Date:** 2026-03-05
**Focus:** Yoga layout (6.6ms total) and CREATE+INSERT operations (12.6ms across 123 ops)

## Architecture Overview

### How Yoga is Integrated

The Yoga integration follows a persistent-mode shadow tree pattern:

1. **Node lifecycle:** Every `ShadowNodeWrapper` owns a `YGNodeRef`, created in `init` and freed in `deinit` (`ShadowNodeWrapper.swift:67, 99`).

2. **Persistent root:** `Renderer` keeps a persistent `rootYogaNode` per surface (`Renderer.swift:41`). This survives across commits so Yoga's incremental layout can skip unchanged subtrees.

3. **Commit pipeline** (`Renderer.commitTree`, line 94):
   ```
   calculateLayout() -> diff() -> applyMutations() -> syncAllFrames() -> promote tree
   ```

4. **Layout calculation** (`Renderer.calculateLayout`, line 331):
   ```
   1. Get/create persistent root yoga node
   2. Set children via YGNodeSetChildren (bulk)
   3. YGNodeCalculateLayout (first pass)
   4. markTextNodesNeedingRemeasure -> optional second pass
   5. readLayoutFrames (walk tree, extract results)
   6. adjustMarginCollapseThrough
   7. computeActualContentHeight
   8. computeScrollContentSizes
   ```

### Where Layout Runs

Layout runs synchronously on the main thread inside `$$completeRoot` -> `Renderer.commitTree` -> `calculateLayout`. There is no async layout scheduling.

## Key Finding: Incremental Layout IS Used

**Yoga's `hasNewLayout` flag is checked** during `readLayoutFrames` (`ShadowTreeLayout.swift:77`):

```swift
guard YGNodeGetHasNewLayout(node.yogaNode) else { return }
YGNodeSetHasNewLayout(node.yogaNode, false)
```

Nodes where Yoga didn't recalculate are skipped entirely (including their subtrees). This means `readLayoutFrames` is already incremental.

**Clone-based dirty tracking is also used.** The `cloneWithNewProps` method uses `YGNodeClone` which preserves the source node's layout cache and dirty flag (`ShadowNodeWrapper.swift:235`). Children's ownership is transferred via `YGNodeSwapChild` which does NOT dirty the parent. So if new props don't change any style, the clone stays clean and Yoga skips the entire subtree.

**However, `YGNodeCalculateLayout` is still called on the root.** Yoga internally walks from the root but skips clean subtrees. The cost is proportional to dirty nodes + ancestors, not total tree size.

## The "Second Pass" Problem

The trace shows a "second pass" field. Here's what causes it (`Renderer.swift:364-374`):

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

Text nodes that were flex-shrunk narrower than their measured width need remeasurement. When `lastMeasuredWidth - layoutWidth > 0.5` (the epsilon), the node is marked dirty and the entire layout is recalculated. This second pass makes text-heavy trees pay ~2x the Yoga cost.

**Impact:** For the traced commit (37 nodes, 2.6ms Yoga), if the second pass fires, that's potentially ~5ms just for Yoga calculation.

## Per-Node Creation Cost Breakdown

When the trace shows CREATE #text taking 1.96ms, here's the allocation chain:

### `$$createTextNode` (Bindings+Registration.swift:73-99)
1. `ShadowNodeFamily` allocation (class, heap) — `elementType`, `surfaceId`, `instanceHandle`
2. `ShadowNodeWrapper` allocation (class, inherits NSObject, heap):
   - `props: [String: Any]` dict allocation
   - `children: [ShadowNodeWrapper]` empty array
   - **`YGNodeNewWithConfig(YogaConfig.shared)`** — Yoga C++ node allocation
3. `YogaTextMeasure.setupMeasureFunc`:
   - `TextMeasureContext` class allocation (retains text string, font info)
   - `Unmanaged.passRetained` — retain count management
   - `YGNodeSetContext` / `YGNodeSetMeasureFunc` / `YGNodeSetBaselineFunc`
   - `YGNodeSetNodeType(.text)`
   - `YGNodeMarkDirty` — marks for measurement
4. `engine.wrapNativeObject(node)` — JSC opaque handle wrapping

### `$$createNode` (element nodes, Bindings+Registration.swift:50-70)
1. `ShadowNodeWrapper.createElementNode` (`ShadowNodeWrapper.swift:115-224`):
   - `ElementDefaults.mergedStyle()` — dictionary merge (alloc new dict)
   - `ShadowNodeFamily` allocation
   - `ShadowNodeWrapper` allocation + `YGNodeNewWithConfig`
   - **`YogaStyleApplier.apply(mergedStyle, to:)`** — ~30+ string comparisons per call
   - Optional `YGNodeStyleSetMinHeight`, display overrides, table overrides
2. `engine.wrapNativeObject(node)`

### `$$appendChild` (Bindings+Registration.swift:186-427)
This is surprisingly expensive per call:
- `YGNodeGetOwner` + `YGNodeRemoveChild` (if re-parented)
- `YGNodeInsertChild`
- `applyFlexContextOverride` — checks parent display, potentially cascades to grandchildren
- `applyNestedListOverride`
- Font-size inheritance for em-relative margins (string comparisons, dict lookups)
- For `#text` children: **full `setupMeasureFunc` re-invocation** with font property extraction from parent

## Concrete Optimization Ideas

### 1. Pool Yoga Nodes (Estimated: -2-3ms on initial render)

**Current:** Every `ShadowNodeWrapper` creates a fresh `YGNodeRef` via `YGNodeNewWithConfig`. On deinit, `YGNodeFree` is called.

**Proposed:** Maintain a pool of freed YGNodeRefs. On deinit, return to pool instead of freeing. On init, dequeue from pool and reset style.

```swift
enum YogaNodePool {
    static var pool: [YGNodeRef] = []

    static func acquire() -> YGNodeRef {
        if let node = pool.popLast() {
            // Reset to defaults — cheaper than alloc
            YGNodeStyleSetDefaults(node)
            return node
        }
        return YGNodeNewWithConfig(YogaConfig.shared)
    }

    static func release(_ node: YGNodeRef) {
        YGNodeRemoveAllChildren(node)
        pool.append(node)
    }
}
```

**Challenge:** Yoga doesn't have a `YGNodeStyleSetDefaults` — you'd need to manually reset all properties. Alternative: just use `YGNodeNewWithConfig` but batch-free at end of commit rather than per-deinit.

**Impact:** Medium. The C++ allocation is fast (~1-2us per node), but ARC overhead on NSObject + class allocations compound. The bigger win is reducing Swift class allocations.

### 2. Avoid YogaNode for Virtual Text (#text) Nodes (Estimated: -1-2ms)

**Current:** Every `#text` node gets a full `YGNodeRef` + `TextMeasureContext` + measure func.

**Proposed:** Consider whether `#text` nodes can be measured inline during their parent's measure func. Instead of creating a separate Yoga node for each text child, the parent text container (span, p, h1) could directly measure its concatenated text content.

**Challenge:** This only works for simple cases (single text child). When a `<p>` has mixed `<span>` and text children with different styles, each child needs its own measurement. The current approach is correct for the general case.

**Practical alternative:** Skip `YGNodeSetBaselineFunc` for text nodes that aren't in a `baseline`-aligned container (most aren't). Also, defer `UIFont.systemFont()` resolution — it's called during `setupMeasureFunc` setup, but the font is only needed when Yoga actually measures. The font resolution happens inside the measure callback anyway, so the setup-time resolution is potentially wasted.

**Wait — the font is NOT resolved during setup.** The `TextMeasureContext` just stores string properties. Font resolution happens lazily inside `textMeasureFunc` when Yoga calls it. So the main cost is the `Unmanaged.passRetained` + `YGNodeSetContext` + `YGNodeSetMeasureFunc` + `YGNodeSetBaselineFunc` + `YGNodeMarkDirty`. This is relatively cheap.

### 3. Reduce YogaStyleApplier String Comparisons (Estimated: -0.5-1ms)

**Current:** `YogaStyleApplier.apply()` does ~30+ `if let ... as? String` + `switch` comparisons for every style dict, even when most keys aren't present.

**Proposed:** Check dict count first and use early exits:
```swift
public static func apply(_ style: [String: Any], to node: YGNodeRef) {
    guard !style.isEmpty else { return }
    YGNodeStyleSetBoxSizing(node, .contentBox)  // CSS default

    // Only check keys that exist
    for key in style.keys {
        switch key {
        case "flexDirection": applyFlexDirection(style[key], to: node)
        case "alignItems": applyAlignItems(style[key], to: node)
        // ... etc
        default: break
        }
    }
}
```

This avoids ~25 failed `as? String` casts for a typical div with only `flexDirection` + `display`.

### 4. Eliminate Redundant setupMeasureFunc Calls (Estimated: -0.5ms)

**Current:** In `$$appendChild`, when a `#text` child is appended to a parent, the measure func is **always** re-set up with the parent's font properties (`Bindings+Registration.swift:395-425`). This replaces the initial setup from `$$createTextNode` which used default 16pt.

**Proposed:** If the parent uses default 16pt with no fontWeight/fontFamily/fontStyle/lineHeight overrides, skip the re-setup since `$$createTextNode` already configured it correctly.

```swift
if child.family.elementType == "#text" {
    let style = parent.props["style"] as? [String: Any] ?? [:]
    let hasCustomFont = style["fontSize"] != nil || style["fontWeight"] != nil
        || style["fontFamily"] != nil || style["fontStyle"] != nil || style["lineHeight"] != nil
    if hasCustomFont || ElementDefaults.textLineHeight(for: parent.family.elementType) != nil {
        // Re-setup with inherited font properties
        YogaTextMeasure.cleanupMeasureContext(for: child.yogaNode)
        YogaTextMeasure.setupMeasureFunc(on: child, ...)
    }
}
```

### 5. Avoid Second Layout Pass for Non-Shrunk Text (Estimated: -1-2ms when applicable)

**Current:** After Yoga's first pass, ALL text nodes are checked for remeasure need, and if ANY need it, the entire tree is relaid out.

**Proposed:** Track whether any text node's parent is a flex container with shrink. If the tree has no flex-shrinking text containers, skip the check entirely.

```swift
// During $$appendChild, track if this tree has any shrinkable text
var hasFlexShrinkableText = false

// In calculateLayout, skip remeasure check if no shrinkable text
if hasFlexShrinkableText {
    for child in children {
        if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
            needsSecondPass = true
        }
    }
}
```

### 6. Batch YGNodeSetChildren Instead of Individual Inserts (Estimated: -0.3ms)

**Current:** `$$appendChild` calls `YGNodeInsertChild` one at a time. Each insert may shift the children vector.

**Note:** The Renderer already uses `YGNodeSetChildren` for root children (`Renderer.swift:354`). But the reconciler's `$$appendChild` path inserts one at a time during tree construction. This is inherent to persistent mode — children are added incrementally as the reconciler builds the new tree.

### 7. Reduce NSObject Overhead (Estimated: -1-2ms on initial render)

**Current:** `ShadowNodeWrapper` inherits from `NSObject` for JSC opaque bridging. This adds Objective-C runtime overhead (isa pointer, retain/release, message dispatch).

**Proposed:** If the JSC engine can wrap Swift objects without NSObject inheritance (e.g., using `UnsafeMutableRawPointer`), switching to a plain Swift class would reduce per-node allocation cost.

**Note:** The recent commit `08cc67b` explicitly added NSObject inheritance for JSC opaque bridging, so this constraint is intentional. The alternative would be to use `Unmanaged<ShadowNodeWrapper>` pointers as the bridge handle, avoiding NSObject entirely.

### 8. Enable Point Scale Factor Rounding (Estimated: minimal perf, visual improvement)

**Current:** `YogaConfig.swift:17` sets `YGConfigSetPointScaleFactor(config, 0)` which disables layout rounding.

**Note:** This is intentional for layout comparison accuracy. Enabling it (e.g., `3.0` for 3x screens) would round layout values to pixel boundaries, which is slightly cheaper (fewer float operations downstream) but the impact is negligible.

## Summary of Hottest Paths

| Phase | Time | Root Cause |
|-------|------|-----------|
| CREATE ops (123) | 12.6ms | Per-node: YGNodeNew + ShadowNodeWrapper alloc + YogaStyleApplier + wrapNativeObject |
| Yoga Calculate | 2.6ms | Full-tree walk from root (skips clean subtrees) |
| Second Pass | ~2.6ms | Text remeasure triggers full relayout |
| Read Frames | ~1.4ms | Tree walk reading YG layout results |

## Files Referenced

- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift` — Node lifecycle, Yoga node ownership, cloning
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift` — Layout pipeline, readLayoutFrames, text remeasure, scroll sizing
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift` — SSR tree construction path
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree/YogaConfig.swift` — Shared Yoga config, web defaults, point scale factor
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` — CSS-to-Yoga style mapping
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree/YogaTextMeasure.swift` — Text measurement, measure func, baseline func
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift` — Commit pipeline, calculateLayout, persistent root
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` — $$createNode, $$appendChild, $$completeRoot
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — createView, mutation application
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/src/renderer/HostConfig.js` — JS-side reconciler host config
