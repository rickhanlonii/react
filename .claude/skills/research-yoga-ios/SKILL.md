---
name: research-yoga-ios
description: Research Yoga layout engine for iOS. Run this to document the C API, integration patterns, and web-like default configuration.
---

# Research: Yoga Layout on iOS

## Objective

Document the Yoga layout engine C API, how to integrate it on iOS, and how to configure it for web-like defaults (flexbox with `<div>` = column/block, `<span>` = inline behavior).

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/yoga/yoga/Yoga.h` — Main Yoga C API header
2. `packages/react-native/ReactCommon/yoga/yoga/YGNode.h` — Node API
3. `packages/react-native/ReactCommon/yoga/yoga/YGNodeStyle.cpp` — Style property setters
4. `packages/react-native/ReactCommon/yoga/yoga/YGEnums.h` — Enum definitions (FlexDirection, Align, Justify, etc.)
5. `packages/react-native/ReactCommon/yoga/yoga/enums/` — Individual enum files

## Instructions

1. Read Yoga.h to catalog the complete C API (node creation, style setting, layout calculation)
2. Document all style properties and their enum values
3. Research how React Native integrates Yoga:
   - How YGNode maps to native views
   - How style props are set during reconciliation
   - How layout results (x, y, width, height) are read and applied to views
4. Define "web-like defaults":
   - `<div>`: `flexDirection: column`, `display: flex` (block-level)
   - `<span>`: inline (Yoga doesn't natively support inline — document workaround)
   - Default box model matching CSS (border-box)
5. Document how to embed Yoga in an iOS project (CocoaPods, SPM, or direct C compilation)

## Output

Write to: `docs/research/yoga-ios.md`

Format:
- C API reference table: Function | Parameters | Purpose
- Style property matrix: Property | Type | Default | CSS Equivalent
- Web-like defaults configuration for each HTML element type
- iOS integration guide (build system, bridging header, Swift interop)
- Inline text limitation and proposed workaround

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Yoga iOS integration"
