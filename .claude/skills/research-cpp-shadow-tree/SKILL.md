---
name: research-cpp-shadow-tree
description: Research C++ shadow tree architecture and JSI bindings for the reconciler.
---

# Research: C++ Shadow Tree & JSI Bindings

## Objective

Research how the JS reconciler (using `react-reconciler` npm package in mutation mode) can call into a C++ shadow tree through JSI, following Fabric's architecture but simplified for a fixed set of HTML elements.

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/react/renderer/uimanager/UIManagerBinding.h` and `.cpp` — JSI HostObject pattern exposing C++ to JS
2. `packages/react-native/ReactCommon/react/renderer/core/ShadowNode.h` — C++ shadow node structure
3. `packages/react-native/ReactCommon/react/renderer/components/view/YogaLayoutableShadowNode.h` — Embedded Yoga nodes in shadow nodes
4. `packages/react-native/ReactCommon/react/renderer/core/ShadowNodeFamily.h` — Shared data across clones
5. `packages/react-native/ReactCommon/react/renderer/uimanager/primitives.h` — JSI conversion helpers

Also read in `../react/`:

6. `packages/react-native-renderer/src/ReactFiberConfigFabric.js` — How Fabric host config calls into native

## Instructions

1. Understand how Fabric's UIManagerBinding exposes C++ functions to JS via JSI HostObject
2. Trace the call flow from `createNode(tag, viewName, rootTag, props, instanceHandle)` through to ShadowNode creation
3. Analyze the ShadowNode class structure — what members does it have, which are essential
4. Study how YogaLayoutableShadowNode embeds Yoga nodes and syncs children/props
5. Determine minimal shadow node structure for react-dom-native (no ViewConfig, fixed element set)
6. Design the JSI binding API surface for our renderer

## Questions to Answer

1. What is the minimal C++ shadow node structure? Which Fabric fields can we eliminate?
2. Should we use a JSI HostObject (like `nativeFabricUIManager`) or individual global JSI functions?
3. For mutation-mode reconciler, should shadow tree be mutable or clone-on-write?
4. How does `createInstance("div", props)` flow from JS through JSI to C++ shadow node creation to Yoga node allocation?
5. How are shadow node pointers stored in JS (jsi::NativeState)?
6. What JSI functions must C++ expose? (createNode, appendChild, removeChild, insertBefore, commitUpdate, etc.)
7. How does `commitUpdate` work without ViewConfig `validAttributes`?

## Output

Write to: `docs/research/cpp-shadow-tree-jsi.md`

Include:
- Simplified shadow node C++ class design (with embedded Yoga node)
- JSI binding API surface (all exposed functions with signatures)
- JS host config -> JSI -> C++ call flow diagrams
- Prop handling strategy without ViewConfig
- Mutable vs persistent shadow tree decision with justification
- Memory management strategy for shadow nodes referenced from JS

## After Completion

Update `docs/MASTER_PLAN.md` — check off "C++ shadow tree & JSI bindings"
