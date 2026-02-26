# Yoga Incremental Layout for react-dom-native

## Context

Every commit in react-dom-native triggers a **full layout recalculation** of the entire tree. Yoga already has built-in incremental layout — dirty flags, generation counting, and layout caching — that skips unchanged subtrees. But our architecture currently defeats this optimization. This investigation examines what's needed to take advantage of it.

## How Yoga Incremental Layout Works

Yoga tracks changes internally via dirty flags:

1. **Dirty propagation**: When a node's style or children change, it and all ancestors are marked dirty via `markDirtyAndPropagate()`
2. **Layout skip**: On `YGNodeCalculateLayout()`, Yoga skips nodes that aren't dirty and whose parent constraints haven't changed
3. **Layout caching**: Each node maintains cached layout results and measurement caches — if constraints match, cached values are reused
4. **HasNewLayout flag**: After layout, nodes that were recalculated have `hasNewLayout = true`. Consumers check this to avoid re-reading unchanged layout frames, then call `markLayoutSeen()` to reset it

The first layout pass always visits every node. Subsequent passes only visit dirty nodes and their dependents.

## Current Architecture (What Defeats Incremental Layout)

In `Bindings.swift` `$$completeRoot`:

1. A **temporary root** Yoga node is created fresh each commit (`YGNodeNewWithConfig`)
2. All children are inserted into this temporary root
3. `YGNodeCalculateLayout()` is called
4. Layout frames are read from every node unconditionally
5. Children are removed and temporary root is freed

**Problems:**
- **Temporary root**: Creating a new root each time means Yoga has no prior layout state to compare against — every pass is a "first pass"
- **No persistent Yoga tree**: Since the root is recreated, Yoga's dirty tracking across commits is lost
- **Clone = new node**: When cloning shadow nodes, we use `YGNodeNewWithConfig()` + `YGNodeCopyStyle()` instead of `YGNodeClone()`. New nodes start dirty by default, so even unchanged cloned nodes get recalculated
- **Unconditional frame reads**: We read layout frames from every node, not just those with `hasNewLayout`

## What React-Native Fabric Does Differently

- Uses `YGNodeClone()` which **preserves the dirty flag** from the source node — clean nodes stay clean after cloning
- Persists the Yoga tree across commits — dirty flags accumulate naturally
- Checks `isDirty()` before committing layout to avoid unnecessary work
- Asserts nodes are clean before reading results

## Proposed Changes

### 1. Persist the root Yoga node across commits

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

Stop creating a temporary root each commit. Instead, maintain a persistent root Yoga node that survives across commits. Update the child list on the persistent root rather than rebuilding from scratch.

### 2. Use `YGNodeClone()` instead of `YGNodeNewWithConfig()` + `YGNodeCopyStyle()`

**File**: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift`

In the cloning methods (`clone()`, `cloneWithNewChildren()`, `cloneWithNewProps()`, `cloneWithNewChildrenAndProps()`), use Yoga's native clone which preserves the dirty flag. Only nodes with actual style changes will be marked dirty.

### 3. Use `hasNewLayout` / `markLayoutSeen` to skip unchanged frame reads

**File**: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift`

In `readLayoutFrames()`, check `YGNodeGetHasNewLayout()` before reading a node's frame. If false, skip the node and its subtree. Call `YGNodeSetHasNewLayout(false)` after reading.

### 4. Only diff/mutate nodes with new layout frames

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

When generating mutations post-layout, skip nodes whose layout frames haven't changed. This reduces UIView frame updates on the main thread.

## Expected Impact

- **Small updates** (e.g., a counter incrementing): Layout goes from O(n) full tree to O(log n) dirty path — only the changed node and ancestors are recalculated
- **Style changes**: Only the affected subtree is re-laid out
- **No-op commits**: If nothing changed, layout is essentially free (root is clean)
- **Text remeasurement**: The existing second-pass logic (mark dirty + recalculate) would continue working since `YGNodeMarkDirty` feeds into the same system

## Risks & Considerations

1. **Persistent tree + clone-on-write interaction**: The persistent shadow tree model means we clone nodes on the path from root to change. With `YGNodeClone`, cloned-but-unchanged nodes stay clean. But we need to verify that re-inserting cloned children into cloned parents doesn't spuriously dirty them (child insertion marks parent dirty in Yoga)

2. **Temporary root removal complexity**: The temporary root currently serves as a clean isolation boundary. Removing it requires ensuring the persistent root's children list is correctly maintained across commits, including handling of tree replacements (e.g., navigation)

3. **Text measurement caching**: Text measure functions store state in `TextMeasureContext`. Cloned nodes need to correctly share or copy this context

4. **Correctness risk**: Incremental layout bugs are subtle — a node that should be dirty but isn't will silently produce stale layout. Needs thorough testing

## Verification

1. **Unit test**: Create a tree, lay out, change one node's style, lay out again — verify only the dirty subtree was recalculated (check `hasNewLayout` flags)
2. **Integration test**: Run existing Fantom tests to verify no layout regressions
3. **Visual test**: Build demo app with `/build-demo`, verify layouts match before and after the change
4. **Performance test**: Instrument `YGNodeCalculateLayout` duration before/after on a large tree with small updates

## Recommendation

This is a worthwhile optimization but carries moderate complexity, primarily around the interaction between clone-on-write shadow nodes and persistent Yoga trees. The biggest win would come from changes 1 and 2 (persistent root + proper cloning), which enable Yoga's built-in incremental layout without requiring changes to the layout reading or mutation paths.

I'd suggest implementing in phases:
- **Phase 1**: Switch to `YGNodeClone()` — lowest risk, enables dirty flag preservation
- **Phase 2**: Persist the root Yoga node — enables cross-commit incremental layout
- **Phase 3**: Use `hasNewLayout` to skip frame reads — reduces work after layout
- **Phase 4**: Skip mutations for unchanged frames — reduces main thread work
