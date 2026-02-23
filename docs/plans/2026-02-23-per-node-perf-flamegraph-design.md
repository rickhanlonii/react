# Per-Node Performance Flame Graphs

## Goal

Show real per-node timing across Diff, Mutations, and Layout phases as separate flame graph tracks in Chrome DevTools. Enables identification of both expensive element types and hot subtrees.

## Phases to Instrument

| Phase | Function | Visits | Track |
|-------|----------|--------|-------|
| Diff | `Differentiator.diff()` | All nodes (recursive) | Diff Nodes |
| Apply Mutations | `UIKitMutationApplier.applyMutations()` | Changed nodes only (linear) | Mutation Nodes |
| Read Layout Frames | `ShadowTreeLayout.readLayoutFrames()` | All nodes (recursive) | Layout Nodes |
| Sync Frames | `Bindings.syncAllFrames()` | All nodes (recursive) | Layout Nodes |

Yoga's `YGNodeCalculateLayout` is a C black box — no per-node instrumentation possible. Its total time is already shown on the Layout track.

## Data Collection (Swift)

Instrument each phase with `CACurrentMediaTime()` calls per node, guarded by `nativeTracingEnabled` (zero cost when not tracing).

Each phase collects a flat array of triples passed to JS on the timing dictionary:

- `diffNodes: [elementType, startMs, endMs, ...]`
- `mutationNodes: [mutationType, elementType, startMs, endMs, ...]`
- `layoutNodes: [elementType, startMs, endMs, ...]` (readLayoutFrames + syncFrames)

Pre-order traversal order for diff/layout means parents naturally wrap children in time, creating correct nesting.

## Visualization (JS)

Three new tracks in the "Native" track group:

| Track | Source | Content |
|-------|--------|---------|
| Diff Nodes | `diffNodes` | Full tree flame graph with real diff timing |
| Mutation Nodes | `mutationNodes` | Only mutated nodes, labeled `CREATE div`, `UPDATE p` |
| Layout Nodes | `layoutNodes` | Full tree flame graph with real layout timing |

Each node becomes a `reportTimeStamp` call with real start/end times. Overlapping events on the same track stack vertically in Chrome DevTools, creating the flame graph.

## Replaces

The synthetic `treeProfile`/`treeProfileTotal` flame graph (proportional subtree sizing with fake timing) is removed entirely.

## Files

| File | Change |
|------|--------|
| `Differentiator.swift` | Add `tracing` param, collect per-node `[type, start, end]` |
| `ShadowTreeLayout.swift` | Add `tracing` param to `readLayoutFrames`, collect per-node timing |
| `UIKitMutationApplier.swift` | Add `tracing` param to `applyMutations`, collect per-mutation timing |
| `Bindings.swift` | Thread `tracing`, pass node timing arrays to JS, remove `buildTreeProfile` |
| `HostConfig.js` | Read node timing arrays, emit per-node trace events, remove synthetic flame graph |
| `trace-format.test.js` | Update tests for real per-node tracks |
