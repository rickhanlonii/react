# Performance Findings: Apply Mutations + Bridge Overhead

## Executive Summary

The "Apply Mutations" phase (13.8ms total, max 4.3ms for 44 mutations) is dominated by **UIKit view creation** in `UIKitMutationApplier.createView()`, NOT by bridge overhead. The bridge itself (JSC opaque handles) is already O(1) per call. The real costs are:

1. **UIView/UILabel allocation and configuration** (~1-2ms per CREATE)
2. **Excessive `print()` / `console.log()` calls** in hot paths (13+ prints in mutation applier, 9+ console.logs in HostConfig)
3. **String-keyed dictionary lookups and style parsing** repeated per node
4. **No view recycling** -- deleted views are thrown away, new views always freshly allocated

## Architecture: How the Bridge Works

### Bridge Mechanism: JSC Opaque Handles (O(1))

The JS-to-Swift bridge uses JavaScriptCore's native object wrapping, **NOT** JSON serialization:

```
JS side:  $$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle)
          calls a global function registered by Swift

Swift:    engine.setGlobalFunction("$$createNode") { args in
            let type = engine.toString(args[0])     // JSValue.toString()
            let props = engine.toDictionary(args[2]) // JSValue.toDictionary()
            let node = ShadowNodeWrapper.createElementNode(...)
            return engine.wrapNativeObject(node)     // JSValue(object:in:)
          }

JS side:  receives opaque JSValue wrapping the Swift ShadowNodeWrapper
          stores it as instance._nativeNode
```

Key insight: **Node identity crosses the bridge as opaque JS objects** wrapping direct Swift pointers via `wrapNativeObject`/`unwrapNativeObject` (which maps to `JSValue(object:in:)` / `jsValue.toObjectOf(type)`). No dictionary lookups, no integer ID maps -- O(1) on every bridge call.

**Files:**
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/JSEngine/JavaScriptCoreEngine.swift` (lines 248-257)
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` (lines 48-99)

### Persistent Mode (Not Mutation Mode)

The renderer operates in **persistent mode** (`supportsPersistence = true`, `supportsMutation = false`). React's reconciler never calls `appendChild`/`removeChild`/`commitUpdate` during the commit phase. Instead:

1. **Render phase (JS):** React calls `$$createNode`, `$$cloneNodeWithNewProps`, `$$cloneNodeWithNewChildrenAndProps`, `$$appendChild` to build an immutable shadow tree
2. **Commit phase (Swift `$$completeRoot`):**
   - Yoga layout calculation
   - `Differentiator.diff()` compares old tree vs new tree by `ShadowNodeFamily` identity
   - Produces `[Mutation]` array (CREATE, INSERT, DELETE, REMOVE, UPDATE)
   - `UIKitMutationApplier.applyMutations()` applies to UIKit views
   - `syncAllFrames()` updates all view frames

**Files:**
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/src/renderer/HostConfig.js` (lines 95-97, 113-158)
- `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift` (lines 94-268)

## Where Per-Mutation Overhead Comes From

### 1. UIView Allocation in CREATE (~1-2ms each)

The most expensive single operation. Each CREATE mutation calls `createView(for:)` which:

```swift
case "#text":
    let label = UILabel()           // UIKit alloc
    label.numberOfLines = 0         // layout config
    label.text = text               // text rendering prep
    label.font = UIFont.systemFont(ofSize: 16)  // font lookup
    label.textColor = .black
    return label

case "span", "p", "h1"...:
    let label = UILabel()
    label.numberOfLines = 0
    applyTextProps(to: label, ...)  // font, color, decoration
    applyCommonProps(to: label, ...) // backgroundColor, opacity, etc.
    return label
```

Then after creation:
```swift
view.frame = node.layoutFrame
applyBoundsDependentProps(to: view, props: node.props)  // borders, radius
applyBackgroundLayerIfNeeded(to: view, props: node.props)  // CALayer
viewRegistry.register(view: view, family: node.family)
```

This explains why CREATE #text (1.96ms) and CREATE span (1.44ms) are expensive: `UILabel()` allocation + font configuration + frame setting + border/radius application.

**File:** `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` (lines 249-350)

### 2. Excessive Logging in Hot Paths

**JS side (HostConfig.js):** 9 `console.log()` calls fire during tree construction:
```javascript
console.log('[HostConfig] createInstance <' + type + '>');          // per element
console.log('[HostConfig] createTextInstance "' + text + '"');       // per text node
console.log('[HostConfig] appendInitialChild ...');                  // per child
console.log('[HostConfig] cloneInstance ...');                       // per clone
console.log('[HostConfig] replaceContainerChildren: ...');           // per commit
```

**Swift side (UIKitMutationApplier):** 13+ `print()` calls during mutation application:
```swift
print("[\(logPrefix)] Applying \(mutations.count) mutations")       // per commit
print("[\(logPrefix)] [\(index)] CREATE: \(node.family.elementType)") // per mutation
print("[\(logPrefix)]   frame: \(view.frame)")                      // per CREATE
print("[\(logPrefix)]   inserted OK")                               // per INSERT
```

Each `print()` call in Swift involves string interpolation + I/O. With 44 mutations, that's ~60+ print calls per commit.

### 3. Props Dictionary Overhead in $$appendChild

`$$appendChild` in `Bindings+Registration.swift` does massive work per call:

```swift
// Line 240-313: For EVERY appendChild call:
let parentStyle = parent.props["style"] as? [String: Any] ?? [:]  // dict lookup
let childStyle = child.props["style"] as? [String: Any] ?? [:]    // dict lookup
YogaStyleApplier.applyFlexContextOverride(...)  // yoga calculation
// Cascade check for grandchildren
for grandchild in child.children { ... }  // O(n) loop
YogaStyleApplier.collapseBlockMargins(...)
YogaStyleApplier.applyNestedListOverride(...)
// Font inheritance for #text nodes
YogaTextMeasure.cleanupMeasureContext(...)
YogaTextMeasure.setupMeasureFunc(...)  // font/text measurement setup
```

**File:** `/Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` (lines 184-427)

### 4. toDictionary() Conversion on Props

Every `$$createNode` and `$$cloneNodeWithNewProps` call converts props via `engine.toDictionary(args[2])`, which calls JSValue's `toDictionary()` -- this deep-copies the entire props object from JS to Swift `[String: Any]`, converting every value recursively. For nodes with complex style objects, this is non-trivial.

```swift
// In $$createNode:
let props = engine.toDictionary(args[2]) ?? [:]  // Deep copy JS -> Swift dict

// In $$cloneNodeWithNewProps:
var newProps = engine.toDictionary(args[1]) ?? [:]  // Another deep copy
let mergedStyle = ElementDefaults.mergedStyle(for: elementType, userStyle: userStyle)
YogaStyleApplier.apply(style, to: cloned.yogaNode)  // Parse string keys again
```

### 5. INSERT Mutation Overhead

Each INSERT does CSS inheritance cascade work:
```swift
case .insert(let parent, let child, let index):
    // Text style inheritance
    applyInheritedTextStyle(to: childLabel, parentType: ..., parentProps: ...)
    // textAlign cascade
    let childStyle = child.props["style"] as? [String: Any] ?? [:]
    // ... multiple dictionary lookups ...
    // color cascade
    // ... more dictionary lookups ...
    parentView.insertSubview(childView, at: clampedIndex)  // UIKit hierarchy change
```

## Concrete Optimization Ideas

### Optimization 1: Remove Debug Logging from Hot Paths
**Estimated impact: 2-4ms saved per commit (44 mutations)**

Remove or gate behind `#if DEBUG` all `console.log` calls in HostConfig.js and all `print()` calls in UIKitMutationApplier.swift. String interpolation + I/O for 60+ log lines per commit is pure waste in production.

```javascript
// HostConfig.js: Remove these (or wrap in __DEV__ check)
// console.log('[HostConfig] createInstance <' + type + '>');
// console.log('[HostConfig] appendInitialChild ...');
```

```swift
// UIKitMutationApplier.swift: Remove these
// print("[\(logPrefix)] [\(index)] CREATE: \(node.family.elementType)")
// print("[\(logPrefix)]   frame: \(view.frame)")
```

### Optimization 2: View Recycling Pool
**Estimated impact: 3-5ms saved per commit with many CREATEs**

Instead of `UILabel()` allocation per CREATE and dealloc per DELETE, maintain a pool:

```swift
class ViewPool {
    private var pools: [String: [UIView]] = [:]  // keyed by element type

    func dequeue(elementType: String) -> UIView? {
        return pools[elementType]?.popLast()
    }

    func recycle(view: UIView, elementType: String) {
        // Reset view state
        view.removeFromSuperview()
        pools[elementType, default: []].append(view)
    }
}
```

UILabel allocation is the biggest cost for #text and span creates. Recycling avoids both the alloc and the dealloc overhead.

### Optimization 3: Batch Props Conversion -- Avoid Redundant toDictionary()
**Estimated impact: 1-2ms saved per commit**

Currently, `$$createNode` calls `toDictionary()` which deep-copies the entire props object. Then `ElementDefaults.mergedStyle()` and `YogaStyleApplier.apply()` re-parse the style sub-dictionary. Consider:

- Cache the style dictionary on the ShadowNodeWrapper rather than re-extracting from props on every access
- Pre-compute Yoga style values at creation time instead of string-parsing on every `apply()` call
- Use typed style structs instead of `[String: Any]` dictionaries

### Optimization 4: Reduce $$appendChild Work
**Estimated impact: 1-2ms saved per tree construction**

The `$$appendChild` binding does excessive per-call work that could be deferred or batched:
- CSS flex context override checks could be done once during layout, not per-append
- Block margin collapsing could be a single pass after tree construction
- Font inheritance for #text nodes could use a cached parent font instead of re-extracting from style dict

### Optimization 5: Pre-allocate Mutation Array
**Estimated impact: 0.5ms saved per commit**

The Differentiator builds mutations by appending to a `[Mutation]` array. For large trees, this causes repeated array resizing. Pre-allocating based on tree size would reduce allocation pressure:

```swift
var mutations: [Mutation] = []
mutations.reserveCapacity(oldChildren.count + newChildren.count)
```

### Optimization 6: Skip syncAllFrames for Unchanged Subtrees
**Estimated impact: 1-3ms saved per commit**

`syncAllFrames` walks the ENTIRE tree every commit to sync frames. In persistent mode, unchanged subtrees have the same `layoutFrame` values. Track a "dirty" flag on cloned nodes and skip clean subtrees:

```swift
func syncAllFrames(_ nodes: [ShadowNodeWrapper]) {
    for node in nodes {
        guard node.isDirty else { continue }  // Skip unchanged subtrees
        if let view = viewRegistry.view(for: node.family) {
            if view.frame != node.layoutFrame {
                view.frame = node.layoutFrame
            }
        }
        syncAllFrames(node.children)
    }
}
```

### Optimization 7: Move to JSI (C++ Bridge) for Hot Path Operations
**Estimated impact: 30-50% reduction in bridge call overhead**

The current bridge uses JSC's Objective-C API (`JSValue`, `toDictionary()`, `JSValue(object:in:)`). Each call goes through:
1. Objective-C message dispatch
2. JSC internal type conversion
3. ARC retain/release

A JSI (JavaScript Interface) backend using JSC's C API would eliminate Obj-C overhead. The `JSEngine` protocol already anticipates this:

```swift
// JSEngine.swift line 8-9:
//   - JSIEngine (future) -- wraps a C++ JSI layer over JSC's C API
```

This is the highest-effort but highest-reward optimization for the bridge layer specifically.

## Priority Ranking

| Priority | Optimization | Effort | Impact |
|----------|-------------|--------|--------|
| 1 | Remove debug logging | 30 min | 2-4ms |
| 2 | View recycling pool | 2-3 hrs | 3-5ms |
| 3 | Skip unchanged frames in syncAllFrames | 1-2 hrs | 1-3ms |
| 4 | Reduce $$appendChild work | 2-3 hrs | 1-2ms |
| 5 | Batch/cache props conversion | 3-4 hrs | 1-2ms |
| 6 | Pre-allocate mutation arrays | 15 min | 0.5ms |
| 7 | JSI C++ bridge | 2-3 weeks | 30-50% bridge |

## Key Insight: Bridge is NOT the Bottleneck

The bridge architecture is already well-optimized:
- **Opaque handles** (no ID lookups, no serialization)
- **Synchronous calls** on the main thread (no async overhead)
- **Direct Swift pointer access** via `JSValue(object:in:)` / `toObjectOf(type)`

The real bottleneck is **UIKit work** (view allocation, frame setting, style application) and **unnecessary computation** (logging, redundant style parsing, full-tree frame sync). The per-mutation cost comes from the CREATE mutations materializing UIKit views, not from crossing the JS/Swift boundary.

The mutations themselves are also NOT bridge calls -- they happen entirely in Swift (Differentiator produces them, UIKitMutationApplier consumes them). The bridge is only involved during tree construction ($$createNode, $$appendChild, $$cloneNodeWithNewProps, $$completeRoot), which happens BEFORE the mutation phase.
