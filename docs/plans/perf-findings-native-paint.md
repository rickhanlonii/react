# Performance Findings: Native Paint + Prepare Paint (53.7ms combined)

## Summary

Native Paint (39ms) and Prepare Paint (14.7ms) are the two largest bottlenecks in the Falcon commit pipeline. This report details what happens in each phase, where time is spent, and concrete optimization opportunities.

## Architecture Overview

The commit pipeline flows through `Renderer.commitTree()` in `Renderer.swift`:

```
$$completeRoot (JS) -> Bindings+Registration.swift -> Renderer.commitTree()
    1. Layout (Yoga)
    2. Diff (Differentiator)         } Prepare Paint
    3. Apply Mutations (UIKit)       }
    4. Sync Frames                   }
    5. Attach root children          }
    6. Promote current tree          }
    7. [CATransaction completion]    -> Native Paint
```

## Phase 1: Prepare Paint (14.7ms)

**Source**: `Renderer.swift` lines 106-169

Prepare Paint spans from after layout to when all UIKit mutations are applied. It contains four sub-phases:

### 1a. Diff (Differentiator.diff)

**Source**: `Differentiator.swift`

- Walks both old and new shadow trees in parallel using `ObjectIdentifier(family)` as the matching key
- For each node: checks identity (`oldChild !== newChild`) to detect prop/layout changes
- Generates mutations: CREATE, INSERT, DELETE, REMOVE, UPDATE
- Recursively diffs children of matched nodes
- Time: Proportional to tree size (not just changed nodes)

**Hot path**: The diff always visits every node in the new tree, even unchanged subtrees. The `oldChild !== newChild` check is O(1) per node, but the recursive walk is O(n) where n = total nodes.

### 1b. Apply Mutations (UIKitMutationApplier.applyMutations)

**Source**: `UIKitMutationApplier.swift` lines 61-243

This is the most expensive sub-phase. For each mutation:

**CREATE** (lines 74-116):
1. `createView(for: node)` — instantiates a UIView subclass (UILabel, UIButton, UITextField, UIScrollView, etc.)
2. `applyCommonProps()` — parses style dict for backgroundColor, opacity, overflow, visibility, zIndex, boxShadow, transform
3. Element-specific props: `applyTextProps()`, `applyButtonProps()`, `applyImageProps()`, etc.
4. `view.frame = node.layoutFrame` — sets frame
5. `applyBoundsDependentProps()` — applies borders (sublayer creation) and border-radius (mask creation)
6. `applyBackgroundLayerIfNeeded()` — for position:relative elements, promotes bg to sublayer
7. `viewRegistry.register(view:family:)` — registers in both forward/reverse maps

**INSERT** (lines 128-181):
1. Looks up parent and child views from ViewRegistry
2. Text inheritance cascade — checks/propagates textAlign and color through `inheritedTextAlign`/`inheritedTextColor` dictionaries
3. `parentView.insertSubview(childView, at: clampedIndex)` — the actual UIKit insertion

**UPDATE** (lines 191-235):
1. `updateView()` — re-applies all common props + element-specific props
2. `view.frame = node.layoutFrame` — re-sets frame
3. `applyBoundsDependentProps()` — re-applies borders and border-radius
4. `applyBackgroundLayerIfNeeded()` — re-checks background layer promotion

**Key observations**:
- Every CREATE parses the style dictionary multiple times (once in `applyCommonProps`, once in `applyBoundsDependentProps`, once in `applyBackgroundLayerIfNeeded`)
- Border application (`applyBorderProps`) does `view.layer.sublayers?.filter { $0.name == "__border_edge__" }.forEach { $0.removeFromSuperlayer() }` on every call — scanning all sublayers
- Border radius application similarly scans for `__corner_mask__` named layers
- `parseColor()` is called repeatedly for the same color strings (no caching)
- `print()` statements exist for every mutation (debug logging in production path)

### 1c. Sync Frames (Renderer.syncAllFrames)

**Source**: `Renderer.swift` lines 288-326

- Recursively walks the ENTIRE new tree
- For each node with a registered view: compares `view.frame != node.layoutFrame`, sets if different
- Also syncs UIScrollView.contentSize for scroll containers
- This is redundant with the frame-setting in applyMutations — CREATE already sets `view.frame = node.layoutFrame`

### 1d. Attach + Promote

- Attaches root children to scrollView (checks `superview == nil`)
- Sets scroll contentSize
- Promotes `currentTree = newChildren`

## Phase 2: Native Paint (39ms)

**Source**: `Renderer.swift` lines 171-181, `PerformanceTracer.swift` lines 419-445

Native Paint spans from `preparePaintEnd` to when `CATransaction.setCompletionBlock` fires. This is the time Core Animation takes to:

1. **Commit** (bookkeeping after Prepare Paint, before screenshot)
2. **Screenshot** (captured synchronously during tracing — `onCommitPainted?()`)
3. **CA Commit** — Core Animation traverses the layer tree, calculates final positions, composites layers, and sends the render tree to the render server

The 39ms breaks down into:
- Synchronous work after Prepare Paint (commit bookkeeping + screenshot capture)
- Asynchronous CA layer tree commit (the actual paint)

**What CA must process**:
- All UIView frame changes trigger implicit CALayer property animations (even with no animation block, CA must process the transaction)
- All sublayer additions (border edge layers, background layers, corner masks)
- All backgroundColor changes
- All clipsToBounds/masksToBounds changes
- All layer property changes (shadowOffset, shadowRadius, cornerRadius, etc.)

**Key insight**: Every UIView property change is batched into the current CATransaction. The more views created/modified during Prepare Paint, the longer CA takes to commit.

## Specific Hot Paths and Costs

### 1. View creation is eager, not lazy

```swift
// UIKitMutationApplier.swift line 79
let view = createView(for: node)
```

Every CREATE mutation immediately allocates a UIView. For the initial render of a page with ~100 nodes, this means ~100 UIView allocations in a single synchronous batch. There is no view recycling pool.

### 2. Style dict parsed multiple times per view

During CREATE, the style dictionary is accessed in:
- `createView()` -> `applyCommonProps()` -> parses `style["backgroundColor"]`, `style["opacity"]`, etc.
- `applyBoundsDependentProps()` -> `applyBorderProps()` -> re-reads `style["borderTopWidth"]`, etc.
- `applyBoundsDependentProps()` -> `applyBorderRadius()` -> re-reads `style["borderRadius"]`, etc.
- `applyBackgroundLayerIfNeeded()` -> re-reads `style["position"]`, `style["backgroundColor"]`

### 3. Border sublayer scanning on every create/update

```swift
// UIKitMutationApplier.swift line 525
view.layer.sublayers?.filter { $0.name == "__border_edge__" }
    .forEach { $0.removeFromSuperlayer() }
```

This scans ALL sublayers looking for border edges. For views with many child views (which become sublayers), this is O(children).

### 4. syncAllFrames redundantly re-walks the entire tree

```swift
// Renderer.swift line 288
func syncAllFrames(_ nodes: [ShadowNodeWrapper]) {
    for node in nodes {
        if let view = viewRegistry.view(for: node.family) {
            if view.frame != node.layoutFrame {
                view.frame = node.layoutFrame
            }
```

This walks every node and does a ViewRegistry lookup + frame comparison. For nodes that were just CREATEd, the frame was already set. For nodes that were UPDATEd, the frame was already set. Only unchanged nodes (no mutation) benefit from this pass.

### 5. Debug print statements in the hot path

```swift
// UIKitMutationApplier.swift line 67
print("[\(logPrefix)] Applying \(mutations.count) mutations")
// line 78
print("[\(logPrefix)] [\(index)] CREATE: \(node.family.elementType)")
// line 114
print("[\(logPrefix)]   frame: \(view.frame)")
```

Every mutation generates 2-3 print() calls. For 100 mutations, that's 200-300 print() calls with string interpolation.

### 6. Tracing overhead even when not tracing

```swift
// Differentiator.swift line 44
var unused: [(type: String, start: Double, end: Double)] = []
return diff(..., tracing: false, nodeTimings: &unused)
```

The non-tracing path still allocates an empty array and passes it through. Minor but unnecessary.

## Optimization Ideas

### High Impact (estimated 10-20ms savings)

#### 1. Remove debug print statements from production path
**Files**: `UIKitMutationApplier.swift`
**Estimated savings**: 3-8ms (IO-bound print calls with string interpolation)
**Approach**: Wrap in `#if DEBUG` or remove entirely. The trace system already captures mutation counts.

#### 2. Eliminate redundant syncAllFrames traversal
**Files**: `Renderer.swift`
**Estimated savings**: 2-5ms (eliminates full tree walk + ViewRegistry lookups)
**Approach**: Track which families had their frame set during applyMutations. In syncAllFrames, skip those. Or better: only sync frames for nodes that were NOT touched by a mutation (the diff already identifies unchanged nodes via identity check).

#### 3. Batch CALayer property changes
**Files**: `UIKitMutationApplier.swift`
**Estimated savings**: 5-10ms off Native Paint
**Approach**: Wrap all mutations in `CATransaction.begin()` / `CATransaction.setDisableActions(true)` / `CATransaction.commit()`. This prevents CA from creating implicit animations for every property change. Currently every frame, backgroundColor, etc. change creates an implicit animation that CA must process.

```swift
CATransaction.begin()
CATransaction.setDisableActions(true)
// ... apply all mutations ...
CATransaction.commit()
```

### Medium Impact (estimated 3-8ms savings)

#### 4. Parse style dict once per mutation
**Files**: `UIKitMutationApplier.swift`
**Estimated savings**: 2-4ms
**Approach**: Extract the style dict once at the top of CREATE/UPDATE handling, pass it to all sub-functions instead of re-reading `props["style"] as? [String: Any]` in each.

#### 5. Cache parsed colors
**Files**: `UIKitMutationApplier.swift`
**Estimated savings**: 1-3ms
**Approach**: Add a `[String: UIColor]` cache for `parseColor()`. CSS color strings are typically reused across elements (e.g., `"#333"`, `"white"`, `"rgba(0,0,0,0.5)"`).

#### 6. Use named sublayer tracking instead of filter-scan
**Files**: `UIKitMutationApplier.swift`
**Estimated savings**: 1-2ms
**Approach**: Store border/background sublayer references on the view (via `objc_setAssociatedObject` or a side table) instead of scanning `view.layer.sublayers` by name on every update.

### Low Impact (estimated 1-2ms savings)

#### 7. View recycling pool
**Files**: `UIKitMutationApplier.swift`
**Estimated savings**: 1-2ms (reduces alloc/dealloc pressure)
**Approach**: When DELETE removes a view, return it to a pool keyed by element type. CREATE checks the pool first. This amortizes UIView allocation cost across updates.

#### 8. Skip diff for unchanged subtrees
**Files**: `Differentiator.swift`
**Estimated savings**: 0.5-1ms
**Approach**: If `oldChild === newChild` (same pointer = identical node, not just same family), skip recursing into children. The persistent mode reconciler already produces the same pointer for unchanged subtrees.

**This is already partially done** — the diff checks `oldChild !== newChild` before generating an UPDATE mutation, but it still recurses into children regardless. Adding an early return when `oldChild === newChild` would skip the entire subtree.

```swift
if oldChild === newChild {
    // Identical node — no changes in this subtree
    matchedFamilies.insert(familyKey)
    // Skip recursion entirely
    continue
}
```

## Key Files

| File | Role |
|------|------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift` | Commit pipeline orchestrator |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` | UIView creation, prop application, mutations |
| `packages/react-dom-native/ios/Sources/ShadowTree/Differentiator.swift` | Old vs new tree diffing |
| `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift` | Yoga frame reading |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` | $$completeRoot entry point |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/PerformanceTracer.swift` | Trace event reporting |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/ViewRegistry.swift` | Family-to-UIView mapping |
| `packages/react-dom-native/src/renderer/HostConfig.js` | JS reconciler host config |

## Priority Ranking

1. **CATransaction.setDisableActions(true)** — Highest ROI, single line change, directly reduces Native Paint
2. **Remove print statements** — Easy win, measurable IO savings
3. **Skip diff for identical subtrees** — Small code change, compounds with tree size
4. **Eliminate redundant syncAllFrames** — Requires tracking mutated families, medium effort
5. **Parse style once per mutation** — Refactor, medium effort, consistent savings
6. **Cache parsed colors** — Small change, diminishing returns
