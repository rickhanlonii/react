# Progressive Hydration: Dehydrated Suspense Boundary Reveals

## Overview

Progressive hydration allows the app to become interactive before all Suspense boundary content has arrived from the server. The SSR stream delivers the shell (skeleton/fallback views) first, then streams boundary content as it resolves on the server. React hydrates the shell immediately, creating dehydrated Suspense fibers for pending boundaries. When boundary content arrives later, it reveals progressively — swapping skeleton placeholders for real content and hydrating the new subtree.

### The Persistent Mode Constraint

react-dom-native uses **persistent mode** (clone-on-write), not mutation mode. In persistent mode, React never calls mutation operations like `appendChild`, `removeChild`, or `commitUpdate`. Instead, React clones nodes with new props/children and replaces the entire root child set atomically via `replaceContainerChildren`.

This has a critical implication for dehydrated Suspense reveals: **React's hydration retry for a dehydrated boundary reuses the existing tree via `hydrateInstance` — it does not produce new clone operations or call `replaceContainerChildren` with new children.** The hydration commit is a no-op from the UIKit perspective. This means the native side must handle the visual update (swapping skeleton views for content views) independently of React's hydration.

## Architecture

### Two-Phase Reveal

Every dehydrated Suspense boundary reveal has two phases that must execute in a specific order:

```
Phase 1: Native Visual Update (processReveal)
  SSR shadow tree → immutable clone with content → diff old vs new → UIKit mutations
  Result: Skeleton views deleted, content views created and inserted

Phase 2: React Hydration ($$notifyBoundaryRevealed)
  SSR reference tree in-place mutation → React retry callback → hydrateInstance
  Result: React fibers attached to content views, event handlers wired up
```

Phase 1 produces the visible change. Phase 2 makes it interactive.

### Data Flow

```
Next.js RSC Server
  │
  ├─── SSR stream (HTML-like instructions)
  │     │
  │     ├── Shell content (B...B boundary markers + fallback nodes)
  │     ├── Segment content (S...S boundary content nodes)
  │     ├── Reveal instructions (X boundary ID)
  │     └── Flight data rows (D row data)
  │
  ▼
SSRCoordinator (Swift)
  │
  ├── treeBuilder: builds shadow tree from instructions
  ├── segmentBuilders[id]: separate builders per boundary segment
  ├── boundaryWrappers[id]: #suspense wrapper nodes
  └── segmentContentNodes[id]: content nodes per boundary
  │
  ▼
Root.swift (orchestrator)
  │
  ├── First paint: rootComplete → createViews → UIKit hierarchy
  │
  ├── Hydration: boot React → register SSR tree → hydrateSurface
  │     │
  │     └── Flight data routing:
  │           Pre-hydration  → ssrFlightDataBuffer (replay later)
  │           During render  → postHydrationFlightBuffer (defer)
  │           After commit   → forward to JS Flight client
  │
  └── Boundary reveal (via throttled queue):
        │
        ├── processReveal()          ← Phase 1: visual update
        ├── revealBoundaryInSSRTree() ← SSR tree identity preservation
        └── $$notifyBoundaryRevealed  ← Phase 2: React retry + hydration
```

## SSR Stream to Boundary Reveal Flow

### 1. SSR First Paint (Skeleton Views)

The SSR stream delivers shell content first. `ShadowTreeBuilder` constructs a shadow tree with Yoga layout nodes. For each Suspense boundary, the coordinator:

1. Creates a `#suspense` wrapper node with `pending: true` (`SSRCoordinator.swift:102`)
2. Builds fallback content (skeleton) as children of the `#suspense` node
3. Stores the wrapper reference in `boundaryWrappers[id]`

When `rootComplete` fires, `Root.swift` creates UIKit views from the shadow tree and displays them immediately — the user sees the skeleton.

### 2. Segment Content Arrival

As boundary content resolves on the server, the SSR stream delivers segment instructions (`S...S`). The coordinator:

1. Creates a separate `ShadowTreeBuilder` per segment (`SSRCoordinator.swift:135-140`)
2. Builds content nodes in isolation from the main tree
3. Stores completed content in `segmentContentNodes[id]`

### 3. Reveal Instruction

When the SSR stream sends an `X` (reveal) instruction, the coordinator queues the reveal via `onBoundaryRevealQueued`. Root.swift throttles reveals to avoid flashing fallbacks (300ms throttle within 2300ms LCP window).

### 4. processReveal — Immutable Clone + Diff + UIKit Mutations

`SSRCoordinator.processReveal()` (`SSRCoordinator.swift:173-192`) handles the visual update:

1. **Immutable clone**: `ShadowTreeBuilder.revealBoundaryImmutable()` creates a new root children array where the `#suspense` node's children are replaced with content nodes and `pending` is set to `false`. All ancestors up to root are cloned (structural sharing — unaffected subtrees are shared by reference).

2. **Layout**: Yoga calculates layout on the new tree.

3. **Diff**: `Differentiator.diff()` compares old root children vs new root children, producing mutations: UPDATE the `#suspense` node, DELETE skeleton child views, CREATE + INSERT content child views.

4. **Apply mutations**: `UIKitMutationApplier` executes UIKit operations — removes skeleton `UIView`s, creates and inserts content `UIView`s with correct frames.

5. **Update current root children**: `SSRCoordinator.currentRootChildren` is set to the new tree for the next reveal's diff baseline.

### 5. revealBoundaryInSSRTree — In-Place SSR Tree Mutation

`Bindings.revealBoundaryInSSRTree()` (`Bindings.swift:222-239`) mutates the SSR reference tree **in place**:

1. Finds the `#suspense` node by boundary ID
2. Replaces its children with content nodes
3. Sets `pending = false`
4. Rebuilds the parent map for navigation
5. Registers new node IDs for bridge traversal

This is an **in-place mutation**, not a replacement. The `ShadowNodeWrapper` object identity is preserved. This is critical — see Key Design Decisions below.

### 6. $$notifyBoundaryRevealed — React Retry + Hydration

`$$notifyBoundaryRevealed` (`HostConfig.js:710-739`) fires React's retry callbacks:

1. Marks the suspense instance as `pending = false` (so `isSuspenseInstancePending` returns false)
2. Syncs the state to Swift via `$$markBoundaryRevealed`
3. Fires all registered retry callbacks (from `registerSuspenseInstanceRetry`)

React then re-renders the boundary subtree. Because the SSR reference tree now has content nodes (from step 5), React's hydration traversal finds matching nodes and calls `hydrateInstance` — successfully hydrating the content and attaching event handlers. The hydration commit produces no visual changes (persistent mode constraint), but the subtree is now interactive.

## Key Design Decisions

### Why the native side handles the visual update (not React)

In persistent mode, React's hydration of a dehydrated Suspense boundary calls `hydrateInstance` on each node, which reuses the existing `_ssrNodeRef` and `_nativeFamily`. It does NOT call `createInstance` or produce clone operations. The hydration commit's `replaceContainerChildren` receives `null` children (the hydration-commit path in `HostConfig.js:280-283`), signaling that React reused the existing tree.

This means React's hydration retry produces zero UIKit operations. Without the native-side `processReveal`, the skeleton views would remain on screen indefinitely after hydration — the boundary would be "hydrated" (interactive) but still showing the fallback.

### Why updateSSRTree must NOT be called (node identity)

`Bindings.updateSSRTree()` replaces `ssrTrees[surfaceId]` with a new array of cloned nodes (from `revealBoundaryImmutable`). This breaks React's hydration because:

1. During hydration, React stores `_ssrNodeRef` pointers to specific `ShadowNodeWrapper` instances
2. `getFirstHydratableChildWithinSuspenseInstance` and `getNextHydratableSibling` traverse via these pointers
3. If the SSR tree is replaced with clones, the pointers reference stale (old) nodes
4. React can't find matching nodes during hydration traversal
5. React falls back to client-side render (`createInstance` instead of `hydrateInstance`)
6. Client-side render creates duplicate views alongside the existing ones

The fix: use `revealBoundaryInSSRTree` (in-place mutation) which preserves `ShadowNodeWrapper` object identity. React's `_ssrNodeRef` pointers remain valid, and hydration succeeds.

### Ordering: processReveal -> revealBoundaryInSSRTree -> $$notifyBoundaryRevealed

The three operations must execute in this order:

1. **`processReveal`** first — creates the new visual tree and applies UIKit mutations. Must happen before React retries, because the retry's hydration traversal needs content nodes to exist in the tree.

2. **`revealBoundaryInSSRTree`** second — mutates the SSR reference tree in place so React's hydration traversal (via `$$getSSRChildOf`, `$$getNextSSRSibling`) sees content nodes instead of skeleton nodes.

3. **`$$notifyBoundaryRevealed`** last — fires React's retry callbacks. React re-renders the boundary, traverses the (now-updated) SSR tree, and hydrates the content nodes that `processReveal` already made visible.

If `$$notifyBoundaryRevealed` fired before `revealBoundaryInSSRTree`, React would traverse the old tree (still showing skeleton nodes) and either fail to hydrate or hydrate against stale content.

### Race condition: reveal before retry registration

Progressive hydration has a timing race: boundary content may arrive from the SSR stream before React finishes setting up dehydrated Suspense fibers. Two mechanisms handle this:

1. **`preRevealedBoundaries` Set** (`HostConfig.js:48`): If `$$notifyBoundaryRevealed` fires before `registerSuspenseInstanceRetry`, the boundary ID is stored. When `registerSuspenseInstanceRetry` later registers the retry callback, it checks this set and fires the reveal immediately.

2. **`pendingSuspenseByBoundary` Map** (`HostConfig.js:41`): Maps boundary IDs to suspense instances so `$$notifyBoundaryRevealed` can find the right instance to mark as revealed.

### Flight data routing during hydration

Flight data rows (RSC payload) arrive interleaved with SSR instructions. Routing depends on hydration state:

| State | Routing | Reason |
|-------|---------|--------|
| Pre-hydration | `ssrFlightDataBuffer` | Replayed during `hydrateSurface()` |
| During render (pre-commit) | `postHydrationFlightBuffer` | Deferred to avoid resolving lazy chunks mid-render, which would restart React's render and prevent commit |
| After commit | Forward to JS Flight client | Safe — React has committed and can handle async chunk resolution |

## Files

| File | Role |
|------|------|
| `Root.swift` | Orchestrator — manages SSR lifecycle, hydration timing, throttled reveals, Flight data routing |
| `SSRCoordinator.swift` | SSR instruction stream delegate — builds trees, manages boundary state, executes `processReveal` |
| `Bindings.swift` | JS-Swift bridge — SSR tree registration, `revealBoundaryInSSRTree` (in-place mutation), `updateCurrentTree` (visual diff), hydration traversal globals |
| `HostConfig.js` | React reconciler host config — hydration functions, `$$notifyBoundaryRevealed`, suspense instance tracking |
| `ReactRuntime.swift` | Singleton runtime — `hydrateSurface()`, Flight row forwarding, `closeFlightResponse()` |
| `ShadowTreeBuilder.swift` | Shadow tree construction — `revealBoundaryImmutable()` (clone-on-write reveal) |
| `Differentiator.swift` | Tree diff algorithm — produces mutations from old vs new children arrays |
| `UIKitMutationApplier.swift` | Applies mutations to UIKit views (create, insert, delete, update) |

## Fixes Applied

### Fix 1: Call processReveal in the post-hydration path

**File:** `Root.swift` — `flushPendingReveals()`

**Before:** The post-hydration branch skipped `processReveal()`, assuming React's dehydrated boundary retry would handle the UIKit view swap. It only called `revealBoundaryInSSRTree` and `$$notifyBoundaryRevealed`.

**After:** Added `ssrCoordinator?.processReveal(id: reveal.id)` before the SSR tree mutation and React notification. This triggers `onViewsNeedUpdate` → `Bindings.updateCurrentTree()` → layout → diff → UIKit mutations, correctly swapping skeleton views for content views.

**Why needed:** React's persistent-mode hydration produces no visual operations. Without `processReveal`, skeleton views remained on screen indefinitely after the boundary was "hydrated."

### Fix 2: Remove updateSSRTree from onViewsNeedUpdate

**File:** `Root.swift` — `hydrateRoot()` → `onViewsNeedUpdate` rewiring

**Before:** The rewired `onViewsNeedUpdate` callback called both `updateCurrentTree` (visual diff) and `updateSSRTree` (SSR tree replacement).

**After:** Removed the `updateSSRTree` call. Only `updateCurrentTree` is called. The SSR reference tree is updated in-place by `revealBoundaryInSSRTree` (called separately in `flushPendingReveals`).

**Why needed:** `updateSSRTree` replaced `ssrTrees[surfaceId]` with cloned nodes from `revealBoundaryImmutable`. This broke React's `_ssrNodeRef` pointers, causing hydration to fail and fall back to client-side render. The fallback created duplicate views (skeleton + content) because React's `createInstance` added new views without removing the existing ones.
