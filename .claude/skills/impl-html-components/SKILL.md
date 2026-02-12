---
name: impl-html-components
description: Implement the HTML element registry and component definitions. Depends on renderer and yoga.
---

# Implement: HTML Components

## Objective

Build the component registry that maps HTML element types (`div`, `span`, `p`, etc.) to native view configurations — UIKit class, Yoga defaults, prop mappings.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `docs/specs/html-element-registry.md` must exist
- `docs/research/html-mapping.md` must exist
- `packages/react-dom-native/src/renderer/` must be implemented

## Instructions

1. Read the HTML element registry spec and mapping research
2. Initialize `packages/react-dom-native/src/components/`:
   - `src/registry.js` — component registration and lookup
   - `src/elements/` — one file per element category
3. Implement registry:
   - `registerElement(type, config)` — registers an HTML element type
   - `getElementConfig(type)` — returns config for a type
   - Config shape: `{ nativeView, yogaDefaults, propMapping, defaultStyles }`
4. Implement P0 elements first:
   - `div` → UIView, flexDirection: column
   - `span` → UIView, flexDirection: row (inline approximation)
   - `p` → UILabel, flexDirection: column, with text handling
   - `img` → UIImageView
   - `button` → UIButton
5. Write tests for registry lookup and config correctness
6. Integrate with renderer — renderer's `createInstance` calls `getElementConfig(type)`

## Output

- `packages/react-dom-native/src/components/registry.js`
- `packages/react-dom-native/src/components/elements/layout.js` (div, span, section, etc.)
- `packages/react-dom-native/src/components/elements/text.js` (p, h1-h6, strong, em, a)
- `packages/react-dom-native/src/components/elements/media.js` (img, video)
- `packages/react-dom-native/src/components/elements/input.js` (input, button, textarea, select)
- `packages/react-dom-native/src/components/index.js`
- `packages/react-dom-native/src/components/__tests__/registry.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "HTML element registry + components"
