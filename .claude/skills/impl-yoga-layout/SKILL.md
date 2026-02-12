---
name: impl-yoga-layout
description: Implement Yoga layout integration with web-like defaults. Can run in parallel with impl-js-bridge.
---

# Implement: Yoga Layout

## Objective

Integrate the Yoga layout engine with web-like defaults so that `<div>` behaves like CSS flexbox column, `<span>` like inline, etc.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `docs/specs/yoga-defaults.md` must exist
- `docs/research/yoga-ios.md` must exist

## Instructions

1. Read the Yoga defaults spec and iOS research
2. Initialize `packages/react-dom-native/src/yoga-layout/`:
   - Swift/C bridge or JS-based Yoga bindings (based on bridge spec)
3. Implement:
   - `createYogaNode(elementType)` — creates a YGNode with web-like defaults for that element
   - `applyStyles(node, styles)` — applies CSS-like style props to a YGNode
   - `calculateLayout(rootNode, width, height)` — runs layout calculation
   - `getLayoutResult(node)` → `{ x, y, width, height }` — reads computed layout
4. Define web-like defaults per element type:
   - `div`: `flexDirection: column`, `display: flex`
   - `span`: `flexDirection: row` (inline approximation)
   - All elements: `boxSizing: border-box` equivalent, `position: relative`
5. Write tests:
   - Test: div with children lays out vertically
   - Test: span children lay out horizontally
   - Test: explicit style overrides defaults
   - Test: nested layout calculates correctly

## Output

- `packages/react-dom-native/src/yoga-layout/node.js`
- `packages/react-dom-native/src/yoga-layout/defaults.js`
- `packages/react-dom-native/src/yoga-layout/index.js`
- `packages/react-dom-native/src/yoga-layout/__tests__/layout.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Yoga layout integration"
