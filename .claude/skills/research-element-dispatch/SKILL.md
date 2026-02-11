---
name: research-element-dispatch
description: Research C++ dispatch on element type strings to create appropriate views.
---

# Research: String-Based Element Dispatch

## Objective

Design how C++ dispatches on element type strings ("div", "span", "p", etc.) to create the right shadow nodes, Yoga configurations, and UIKit views. No JS component registry, no ViewConfig — the string alone determines everything.

## Dependencies

Run `/research-event-system` and `/research-no-viewconfig` first — this research incorporates their findings.

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/react/renderer/componentregistry/ComponentDescriptorRegistry.h` — String-based descriptor lookup pattern
2. `packages/react-native/ReactCommon/react/renderer/core/ComponentDescriptor.h` — Descriptor interface

Also read existing research (already in project):

3. `docs/research/html-mapping.md` — Element -> UIKit class -> Yoga defaults -> props mapping
4. `docs/research/yoga-ios.md` — Per-element Yoga default configurations
5. `docs/research/ios-uikit.md` — UIKit view creation patterns

## Instructions

1. Study ComponentDescriptorRegistry's string dispatch pattern (at(componentName))
2. Design the C++ dispatch table structure for HTML elements
3. Determine ShadowNode class hierarchy: one universal class vs per-category subclasses
4. Handle text context propagation (`<span>` inside `<p>` = virtual node, no UIView)
5. Handle scroll promotion (`overflow: scroll` -> UIScrollView instead of UIView)
6. Determine where Yoga defaults are applied (shadow node creation in C++)
7. Design the view factory (element type string -> UIKit view subclass)

## Questions to Answer

1. What is the C++ dispatch table structure? `std::unordered_map<std::string, ElementDescriptor>` with what fields?
2. How many ShadowNode subclasses are needed? Options:
   - One universal `HTMLShadowNode` parameterized by type string
   - Per-category subclasses (container, text container, virtual text, input, image, scroll)
   - One per element
3. How does text context work in C++? When creating `<span>` inside `<p>`, how does shadow node know it's virtual?
4. How does scroll promotion work? Decided at shadow node creation or mounting time?
5. How do Yoga defaults get applied? In ShadowNode constructor or JS host config?
6. What does `createInstance("div", props)` look like end-to-end? JS -> JSI -> C++ -> ShadowNode + YogaNode

## Output

Write to: `docs/research/element-dispatch.md`

Include:
- C++ element dispatch table design (string -> element descriptor)
- ShadowNode class hierarchy decision with justification
- Element descriptor data structure (Yoga defaults, view type, event set, flags)
- Text context propagation in C++ shadow tree
- Scroll promotion strategy
- Complete `createInstance` flow: JS -> JSI -> C++ -> ShadowNode + YogaNode
- View factory design: element type string -> UIKit view class

## After Completion

Update `docs/MASTER_PLAN.md` — check off "String-based element dispatch"
