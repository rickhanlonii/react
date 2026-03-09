# Structural Sharing in Persistent Mode

## Problem

In persistent mode, React clones nodes along the path from changed leaf to root via `cloneInstance` → `$$cloneNodeWithNewProps`. However, the Differentiator then walks the **entire tree** to diff old vs new, even though most subtrees are pointer-identical (`old === new`). The cloning itself also allocates more than necessary — every `ShadowNodeWrapper` along the spine gets a fresh allocation, fresh props dictionary, and fresh Yoga node even when only a leaf changed.

## Goal

Minimize allocations during tree construction and ensure the diff/layout phases fully exploit pointer equality to skip unchanged subtrees.

## Current Behavior

1. React calls `cloneInstance()` → `$$cloneNodeWithNewProps(node, props)` for each node on the path from changed leaf to root
2. `$$cloneNodeWithNewProps` creates a new `ShadowNodeWrapper`, merges element defaults + new props into a fresh dictionary, creates a new `YGNodeRef` via `YGNodeClone`
3. `$$appendChild` is called to re-attach children (both changed and unchanged) to the cloned parent
4. `$$completeRoot` triggers `Differentiator.diff()` which walks all children building `oldByFamily` maps
5. `syncAllFrames()` walks the entire tree updating view frames

## Proposed Changes

### Phase 1: Audit clone cost

- Instrument `$$cloneNodeWithNewProps` to measure:
  - Number of clones per commit in the stress test
  - Time spent in props dictionary construction (merging element defaults)
  - Time spent in `YGNodeClone`
- Instrument `$$appendChild` to count:
  - How many children are unchanged (same pointer reattached) vs new
  - How many speculative layout dispatches fire for unchanged subtrees

### Phase 2: Optimize props construction on clone

- **Cache element defaults**: Instead of merging `ElementDefaults.defaults(for:)` into a fresh dictionary on every clone, store the merged base props on the `ShadowNodeFamily` (computed once at creation). Clone only needs to overlay changed props onto the cached base.
- **Copy-on-write props**: Use a layered props structure (base + overlay) instead of a flat merged dictionary. `YogaStyleApplier` reads through the overlay first, falls back to base. This avoids dictionary allocation on clones where most props haven't changed.

### Phase 3: Skip unchanged children in appendChild

- In `$$appendChild`, when a child is pointer-identical to the child already at that index in the parent's children array, skip:
  - Yoga child insertion (it's already wired)
  - Speculative layout dispatch (layout is cached)
- This requires tracking the "previous children" on the parent node or comparing against the old tree

### Phase 4: Ensure Differentiator fully skips pointer-equal subtrees

- Verify that when `old === new` (same `ShadowNodeWrapper` pointer), the Differentiator produces zero mutations and does not recurse into children
- If it currently builds `oldByFamily` maps even for pointer-equal subtrees, short-circuit before map construction
- Add a fast path: if `oldChildren.count == newChildren.count` and all pairs are pointer-equal, return empty mutations immediately

### Phase 5: Ensure syncAllFrames skips pointer-equal subtrees

- In `syncAllFrames`, when old and new node are pointer-identical, skip the entire subtree (no frame updates needed since nothing changed)
- Verify this is already happening; if not, add the check

## Measurements

- Before/after clone count per stress test "+1 All" tap
- Before/after allocation count (Instruments Allocations)
- Before/after commit time in trace
- Specific phase timings: yoga, diff, mutations, sync

## Risks

- Copy-on-write props adds indirection to every prop read in `YogaStyleApplier` — measure read overhead
- Skipping appendChild for unchanged children requires correct index tracking when some children are new and some are reused
- Must preserve correctness of Yoga dirty flags — unchanged children must not be marked dirty
