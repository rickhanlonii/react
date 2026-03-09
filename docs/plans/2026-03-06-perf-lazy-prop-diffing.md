# Lazy Prop Diffing

## Problem

Every `$$cloneNodeWithNewProps` call constructs a full props dictionary by merging element defaults with the new props from React. Then `YogaStyleApplier.apply()` iterates every property in the dictionary and sets it on the Yoga node, even when only one property changed (e.g., text content updated but no style changes).

This is wasteful because:
- Element defaults are the same every time — re-merging them is redundant
- Most style properties don't change between renders — re-applying them to Yoga is redundant
- Dictionary construction involves hashing and allocation

## Goal

Only apply style properties to Yoga that actually changed between the old and new node.

## Current Behavior

1. `$$cloneNodeWithNewProps(node, newRawProps)` is called
2. `ElementDefaults.defaults(for: elementType)` returns the base style dictionary
3. Base is merged with `newRawProps` to produce the full `mergedProps`
4. New `ShadowNodeWrapper` is created with `mergedProps`
5. `YogaStyleApplier.apply(mergedProps, to: yogaNode)` iterates all keys:
   - `display`, `flexDirection`, `justifyContent`, `alignItems`, `alignSelf`...
   - Each key lookup → switch/case → Yoga C API call (`YGNodeStyleSetFlexDirection`, etc.)
   - ~30+ potential Yoga API calls per node

## Proposed Changes

### Phase 1: Cache element defaults on ShadowNodeFamily

The family is created once per element instance and survives across clones. Store the merged base props there:

```swift
class ShadowNodeFamily {
    let elementType: String
    let baseProps: [String: Any]  // element defaults, computed once
    // ...
}
```

On clone, only overlay the changed props without re-merging defaults:
```swift
// Before: merge defaults + new props into fresh dict every time
// After: family.baseProps is already computed, just overlay new props
let mergedProps = family.baseProps.merging(newRawProps) { _, new in new }
```

This eliminates the `ElementDefaults.defaults(for:)` lookup and base merge on every clone.

### Phase 2: Diff props before applying to Yoga

Instead of applying all props to Yoga, diff old vs new and only apply changed properties:

```swift
static func applyDiff(oldProps: [String: Any], newProps: [String: Any], to node: YGNodeRef) {
    // Only iterate keys that differ
    for (key, newValue) in newProps {
        let oldValue = oldProps[key]
        if !propsEqual(oldValue, newValue) {
            applySingleProp(key: key, value: newValue, to: node)
        }
    }
    // Handle removed keys (in old but not in new)
    for key in oldProps.keys where newProps[key] == nil {
        resetProp(key: key, to: node)
    }
}
```

This requires:
- A `propsEqual` function that compares `Any` values (strings, numbers, dictionaries for nested styles like `borderWidth`)
- A `resetProp` function that sets Yoga properties back to defaults
- Keeping a reference to `oldProps` on the node (already available via the old node in the clone chain)

### Phase 3: Fast path for style-unchanged clones

Many clones only change `children` or `text` content, not style props. Detect this:

```swift
// If only text/children changed and no style props differ, skip YogaStyleApplier entirely
let styleProps = newRawProps.filter { isStyleProp($0.key) }
if styleProps.isEmpty {
    // Clone Yoga node as-is, no style reapplication needed
}
```

This would be the biggest win — most counter updates in the stress test only change text content, not styles.

### Phase 4: Optimize prop diffing in UIKitMutationApplier

The mutation applier also re-applies all props on UPDATE mutations. Apply the same diffing strategy:
- `applyCommonProps` should diff old vs new backgroundColor, opacity, etc.
- `applyTextProps` should diff old vs new font, color, textAlign, etc.
- `applyBoundsDependentProps` should diff old vs new border properties

### Phase 5: Benchmark prop operations

Measure in the stress test:
- Number of `YogaStyleApplier.apply()` calls per commit
- Number of individual Yoga API calls per commit
- Time spent in `YogaStyleApplier.apply()` vs total commit time
- After optimization: number of Yoga API calls eliminated

## Expected Impact

In the stress test "+1 All" scenario with 50 counter text updates:
- **Current**: ~50 nodes × ~30 Yoga API calls = ~1500 Yoga calls
- **After**: ~50 nodes × ~1 Yoga call (text measure dirty) = ~50 Yoga calls
- Expected YogaStyleApplier time reduction: ~90%

For single counter update:
- **Current**: ~5 spine nodes × ~30 Yoga calls = ~150 Yoga calls
- **After**: ~1 node × ~1 Yoga call = ~1 Yoga call

## Risks

- `propsEqual` for `Any` values requires type checking — could be slow if not careful. Use `switch` on known types (String, NSNumber, Dictionary) rather than reflection.
- `resetProp` needs to know the Yoga default for each property — must stay in sync with Yoga defaults
- Skipping YogaStyleApplier entirely for style-unchanged clones requires confidence that no implicit Yoga state was lost during `YGNodeClone` — verify clone preserves all style state
