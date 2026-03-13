# Layout-Driven Commits Design

## Goal

Limit UIKit mutations to only visible components. Scroll containers automatically gate view creation/destruction based on viewport intersection, so a 500-item scrollable list only creates ~30-50 UIViews (visible + buffer) instead of 500.

## Key Decisions

- Applies to **all scroll containers** (`overflow: scroll/auto`), no opt-in/opt-out.
- **Shadow tree stays complete** — React cloning, diffing, and the Differentiator are unchanged. Only UIKit mutation application is gated.
- **First render does full Yoga layout** to get real sizes. Subsequent commits do **partial layout** — visible nodes re-measured, off-screen nodes pinned to cached sizes.
- **Triggers**: commit-driven (filter mutations at commit time) + scroll-driven (mount/unmount between commits).
- **Buffer**: 1 screen-height above and below the viewport (~3 screens total).
- **Off-screen prop changes** update the shadow tree but defer UIKit. When the node scrolls into view, the view is created with latest props.

## Data Model

### ViewportState (per scroll container, on Renderer)

```swift
struct ViewportState {
    var scrollOffset: CGPoint
    var viewportSize: CGSize
    var bufferDistance: CGFloat       // 1 screen-height

    var visibleRect: CGRect {
        CGRect(
            x: scrollOffset.x - bufferDistance,
            y: scrollOffset.y - bufferDistance,
            width: viewportSize.width + 2 * bufferDistance,
            height: viewportSize.height + 2 * bufferDistance
        )
    }
}
```

### ShadowNodeFamily additions

```swift
var isMounted: Bool = false
var cachedLayoutFrame: CGRect?
var parentScrollContainer: ShadowNodeFamily?
```

- `isMounted`: whether a UIKit view/layer exists for this node.
- `cachedLayoutFrame`: preserved across commits for off-screen nodes during partial layout.
- `parentScrollContainer`: which scroll container gates this node's visibility.

## Commit Pipeline (Modified)

```
commitTree(newChildren):
  1. Layout Phase         (full on first render, partial on subsequent)
  2. Diff Phase           (unchanged — Differentiator produces all mutations)
  3. Filter Mutations     ← NEW: cull off-screen mutations
  4. Apply Mutations      (only visible subset)
  5. Sync Frames          (only mounted nodes)
  6. Promote Current Tree
```

### First Render (Full Layout)

1. Yoga calculates layout for the entire tree — every node gets a real `layoutFrame`.
2. Cache every node's `layoutFrame` into `cachedLayoutFrame`.
3. Identify scroll containers (nodes with `overflow: scroll/auto`).
4. For each scroll container, compute `visibleRect` (offset 0,0 + buffer).
5. `filterMutations()` keeps only mutations for nodes whose `layoutFrame` intersects `visibleRect`.
6. Deferred nodes tracked in `pendingNodes: Set<ShadowNodeFamily>`.
7. Apply filtered mutations — only visible nodes get UIKit views.
8. `syncFrames()` skips unmounted nodes.

### Subsequent Commits (Partial Layout)

1. Walk tree from scroll container root.
2. Nodes inside `visibleRect`: run Yoga normally, update `cachedLayoutFrame`.
3. Nodes outside `visibleRect`: pin Yoga node to `cachedLayoutFrame` dimensions (`YGNodeStyleSetWidth/Height`), skip measuring children.
4. Scroll container content size stays correct — off-screen nodes still occupy their cached dimensions.
5. Diff phase runs as normal.
6. `filterMutations()`:
   - Mounted + now off-screen → REMOVE, set `isMounted = false`, add to `pendingNodes`.
   - Mounted + still visible → keep UPDATE mutations.
   - Not mounted + now visible → promote from `pendingNodes`, CREATE + INSERT.
   - Not mounted + still off-screen → update shadow props, skip UIKit, stays in `pendingNodes`.

## Scroll-Driven Viewport Updates

Between React commits, `scrollViewDidScroll` drives view mounting/unmounting:

```swift
func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let newVisibleRect = computeVisibleRect(scrollView)

    // Mount nodes scrolling into view
    let toMount = pendingNodes.filter { family in
        guard let frame = family.cachedLayoutFrame else { return false }
        return newVisibleRect.intersects(frame)
    }

    // Unmount nodes scrolling out of view
    let toUnmount = mountedNodes(in: scrollContainer).filter { family in
        guard let frame = family.cachedLayoutFrame else { return false }
        return !newVisibleRect.intersects(frame)
    }

    // Generate CREATE/INSERT for toMount, REMOVE/DELETE for toUnmount
    // Apply via mutationApplier, sync frames for newly mounted
}
```

**Throttling:** Coalesce viewport checks to once per frame via `DispatchQueue.main.async` or `CADisplayLink`.

**Insert index:** Walk the parent's shadow tree `children` array, count mounted preceding siblings to compute the correct UIKit insert index.

## Edge Cases

**Nested scroll containers:** Inner container's visibility gated by outer container's viewport. If inner is off-screen, none of its children mount. When it scrolls into view, its own viewport logic kicks in for its children.

**Node reordering:** Differentiator produces REMOVE + INSERT. `filterMutations()` keeps only those for visible nodes. Shadow tree child order is authoritative for insert indices.

**Content size:** Scroll container's `contentSize` computed from full Yoga tree (off-screen nodes have cached fixed sizes), so it stays correct.

**View recycling:** Existing `ViewPool` works naturally. Scroll-driven unmounting feeds views back to the pool, mounting dequeues from it.

**Text nodes / `<span>`:** Virtual text nodes don't need viewport gating — their parent text container is gated. When the container mounts, its inline children render as attributed string segments.

**CALayer-backed nodes:** Same treatment as UIView — gate creation on visibility, `isMounted` applies to both.

## Performance Characteristics

**Cheaper:**
- UIView count bounded by viewport + buffer, not total tree size.
- Subsequent commits skip Yoga subtree measurement for off-screen nodes.
- View pool stays warm from scroll recycling.

**Same cost:**
- First render: full Yoga pass (one-time).
- Shadow tree cloning (JS side, cheap).
- Differentiator diffing (pointer comparisons on ShadowNodeFamily).

**Slightly more expensive:**
- `filterMutations()`: rect intersection check per mutation (negligible).
- Scroll listener: one pass over `pendingNodes` per frame.
- Insert index: walk siblings to count mounted predecessors.

**Risk — fast scrolling:** User may see blank space if scrolling faster than view creation. Mitigations: 1-screen buffer provides headroom, view pool recycling makes CREATE cheap. Future optimization: increase buffer during fast flings based on scroll velocity.
