# MPA Refetch Reconciliation

## Problem

`reloadFromSSRResponse` tears down the entire UIKit view hierarchy and rebuilds from scratch on every MPA form POST response. This causes a full visual flash — all views are removed and re-created even when most of the tree is identical (e.g., only a todo item's `checked` state changed).

Root cause: new SSR instructions build a new shadow tree with new `ShadowNodeFamily` objects. The `Differentiator` diffs by family identity (`ObjectIdentifier`), so it sees the entire new tree as "new" and the entire old tree as "deleted."

## Context

This applies to **server-only MPA mode** — forms with string actions submitted before hydration (no JS thread). The native side handles the form POST directly, receives a new SSR instruction stream, and needs to update the existing tree.

The interactive server action path (function actions with `callServer` → `refetchCurrentFixture`) already goes through React's reconciler and is not affected.

## Approach: Clone-or-Create During Instruction Processing

Walk the old committed tree and new instructions in parallel during tree construction. Reuse the old `ShadowNodeFamily` when the element type matches at the same position. Create fresh families for mismatches.

This is analogous to React's persistent mode reconciler: clone nodes until you hit a difference, then create new subtrees.

### Flow

1. `reloadFromSSRResponse` passes the old committed root children into the SSR processing pipeline
2. `ShadowTreeBuilder` maintains a parallel cursor into the old tree alongside its normal instruction stack
3. On each instruction:
   - **Open element (type, props):** Compare `oldCursor.children[index].type == newType`
     - Match: create `ShadowNodeWrapper` reusing `oldNode.family`, set new props. Push old node's children as new old cursor.
     - Mismatch: create fresh `ShadowNodeWrapper` with new family. Push `nil` for old cursor (all descendants are new).
   - **Text node (text):** Same — if old tree has `#text` at this position, reuse its family.
   - **Close element:** Pop both stacks. Advance sibling index in old cursor.
   - **Suspense boundary:** When both old and new have `#suspense` at the same position, reuse the boundary's family. Children get the same treatment recursively.
4. Yoga layout runs on the resulting tree
5. `commitTree` → `Differentiator.diff(old, new)` → mutations → `UIKitMutationApplier`

### Result

The `Differentiator` sees:
- **Same family** (type matched) → UPDATE mutation (reuses UIKit view, updates only changed props)
- **New family** (type mismatched or extra node) → CREATE + INSERT
- **Missing old family** (node removed) → REMOVE + DELETE

The Differentiator and UIKitMutationApplier stay completely unchanged.

### Edge Cases

- **List reordering:** Positional matching means reordered items get fresh families (full teardown/rebuild for that subtree). Acceptable for MPA — no key-based reconciliation without React.
- **List length changes:** Extra new children → CREATE. Extra old children → DELETE (handled naturally by Differentiator).
- **Type changes at a position:** Entire old subtree deleted, entire new subtree created. No partial reuse.

## Files to Change

1. **`ShadowTreeBuilder.swift`** — Add old tree cursor support. Accept optional `oldRootChildren: [ShadowNodeWrapper]?`. Maintain `oldStack` alongside the existing node stack.
2. **`Root+SSR.swift`** (`reloadFromSSRResponse`) — Pass current committed root children to the new `ShadowTreeBuilder`. Remove the view teardown (`removeFromSuperview` loop). Let the diff pipeline handle mutations.
3. **`SSRCoordinator.swift`** — May need minor changes to pass old tree reference through to tree builder.

Files that should NOT change:
- `Differentiator.swift` — family-based diffing works as-is
- `UIKitMutationApplier.swift` — mutation application works as-is
- `ShadowNodeFamily.swift` — no changes needed
