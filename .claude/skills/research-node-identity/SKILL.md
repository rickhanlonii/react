---
name: research-node-identity
description: Research node identity mechanisms without using reactTag.
---

# Research: Node Identity Without reactTag

## Objective

Research how to identify nodes without `Tag = int32_t`. Fabric uses tags extensively — we need an alternative identity mechanism, likely using `InstanceHandle` (JSI weak object references) or direct `ShadowNode*` pointers.

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/react/renderer/core/InstanceHandle.h` — JSI-based identity mechanism
2. `packages/react-native/ReactCommon/react/renderer/core/EventTarget.h` — Event targeting with InstanceHandle
3. `packages/react-native/ReactCommon/react/renderer/core/ReactPrimitives.h` — Tag/SurfaceId definitions
4. `packages/react-native/ReactCommon/react/renderer/core/ShadowNodeFamily.h` — Tag storage (deprecated)
5. `packages/react-native/ReactCommon/react/renderer/mounting/ShadowViewMutation.h` — Tag usage in mutations
6. `packages/react-native/ReactCommon/react/renderer/uimanager/UIManagerBinding.cpp` — `dispatchEventToJS` tag usage

Also read in `../react/`:

7. `packages/react-native-renderer/src/ReactFiberConfigFabric.js` — `nextReactTag` counter, canonical nativeTag

## Instructions

1. Catalog every place Fabric uses `Tag` (int32_t) — mutations, events, mounting, debugging
2. Study how `InstanceHandle` works as an alternative identity (JSI WeakObject)
3. Understand how event dispatch currently uses tags and how it could use InstanceHandle instead
4. Analyze the Differentiator and mounting layer tag usage
5. Determine what `SurfaceId` is needed for (likely still needed for multiple React roots)
6. Design a tag-free identity scheme

## Questions to Answer

1. Can `InstanceHandle` fully replace `Tag` for all purposes? What are the limitations?
2. For mounting (C++ -> UIKit), what identity maps shadow nodes to UIViews? Options: ShadowNode* pointer, internal auto-increment ID, UIView references in shadow nodes
3. For event dispatch (UIKit -> C++ -> JS), how is target identified without tag?
4. How does the Differentiator use tags? Can it work with pointer-based identity?
5. What is the performance implication of JSI WeakObject vs int32_t for identity?
6. Is SurfaceId still needed?

## Output

Write to: `docs/research/node-identity.md`

Include:
- Inventory of all tag usages in Fabric and which ones we need
- Proposed identity scheme (likely: ShadowNode* for C++ layer, InstanceHandle for JS<->C++ crossing)
- Impact on event dispatch
- Impact on mounting/diffing
- Impact on debugging and DevTools
- Migration notes (what Fabric patterns change for tag removal)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Node identity without reactTag"
