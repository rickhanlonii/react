---
name: research-no-viewconfig
description: Research eliminating ViewConfig validation layer for fixed HTML element set.
---

# Research: Eliminating ViewConfig

## Objective

Research removing the ViewConfig validation layer (`validAttributes`, `bubblingEventTypes`, `directEventTypes`). Since all host elements are known HTML elements with a fixed event set, runtime config negotiation is unnecessary. The C++ side can hardcode behavior for each element type based on the string name alone.

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/react/renderer/componentregistry/ComponentDescriptorRegistry.h` — String-based descriptor lookup
2. `packages/react-native/ReactCommon/react/renderer/core/ComponentDescriptor.h` — Descriptor interface

Also read in `../react/`:

3. `packages/react-native-renderer/src/ReactFiberConfigFabric.js` — `getViewConfigForType`, `createAttributePayload`, `diffAttributePayloads`

Search for ViewConfig usage:

4. `packages/react-native/Libraries/NativeComponent/NativeComponentRegistry.js` — Registration entry point
5. `packages/react-native/Libraries/NativeComponent/ViewConfig.js` — ViewConfig creation

## Instructions

1. Trace exactly how ViewConfig flows through the system today
2. Identify every place ViewConfig is consumed (prop validation, event filtering, attribute diffing)
3. Understand `createAttributePayload` and `diffAttributePayloads` — what they filter out
4. Study ComponentDescriptor pattern — can a single universal descriptor handle all HTML elements?
5. Design the replacement: element type string -> C++ handles everything
6. Determine what validation is lost and whether it matters

## Questions to Answer

1. What does ViewConfig actually enforce at runtime? What breaks if we remove it entirely?
2. In `createInstance`, Fabric calls `createAttributePayload(props, viewConfig.validAttributes)`. Without ViewConfig, how do we decide which props to send to C++?
3. Are ComponentDescriptors still needed? Can we use a single "HTMLElementDescriptor" parameterized by type string?
4. How does Fabric register ComponentDescriptors? What is our simplified version?
5. What about `validAttributes` for prop diffing? How do we diff props efficiently without it?
6. How does the string element type ("div") flow from JS to C++? In our system, raw string passed directly — trace this path

## Output

Write to: `docs/research/no-viewconfig.md`

Include:
- Inventory of all ViewConfig usages and what replaces each
- How `createInstance("div", props)` works without ViewConfig (raw string to C++)
- Simplified ComponentDescriptor design (universal vs per-element)
- Prop diffing strategy without `validAttributes`
- Component registration replacement (static table in C++ keyed by element name)
- What validation is lost and whether it matters

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Eliminating ViewConfig"
