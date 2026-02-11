---
name: impl-renderer
description: Implement the custom React reconciler host config. Run this first among all impl skills — others depend on it.
---

# Implement: React Renderer

## Objective

Build the react-reconciler host config (mutation mode) for react-dom-native. This is the core that lets React manage a tree of native view descriptors.

## Prerequisites

- `docs/specs/renderer-host-config.md` must exist
- `docs/research/reconciler.md` must exist

## Reference Files

- `../react/packages/react-noop-renderer/src/createReactNoop.js` — Base implementation to adapt
- `../react/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` — Interface contract

## Instructions

1. Read the renderer host config spec
2. Initialize `packages/renderer/`:
   - `package.json` with `react-reconciler` dependency
   - `src/hostConfig.js` — host config implementation
   - `src/renderer.js` — creates the reconciler instance, exports `render()` function
   - `src/index.js` — public API
3. Implement host config functions:
   - Start from noop renderer, replace stubs with view descriptor logic
   - `createInstance(type, props)` → create view descriptor object `{ type, props, children: [] }`
   - `appendChild`, `removeChild`, `insertBefore` → mutate children arrays
   - `commitUpdate(instance, type, oldProps, newProps)` → diff props, queue native update
   - Focus on mutation mode functions only
4. Write tests:
   - `src/__tests__/renderer.test.js`
   - Test: render `<div>` produces correct view descriptor
   - Test: re-render updates props
   - Test: children are ordered correctly
   - Test: removal cleans up
5. Export `render(element, container)` as the main API

## Output

- `packages/renderer/package.json`
- `packages/renderer/src/hostConfig.js`
- `packages/renderer/src/renderer.js`
- `packages/renderer/src/index.js`
- `packages/renderer/src/__tests__/renderer.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "React reconciler host config"
