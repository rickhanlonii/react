---
name: impl-js-bridge
description: Implement the JS to Swift bridge for native communication. Can run in parallel with impl-yoga-layout.
---

# Implement: JS ↔ Swift Bridge

## Objective

Build the communication layer between JavaScript (running in the JS engine) and Swift (UIKit). The bridge must support creating/updating/deleting native views and dispatching events from native back to JS.

## Prerequisites

- `docs/specs/bridge-protocol.md` must exist
- `docs/research/js-engine.md` must exist (for engine choice)

## Instructions

1. Read the bridge protocol spec and JS engine research
2. Initialize `packages/bridge/`:
   - `package.json` (JS side)
   - Swift source files in `ios/Bridge/`
3. Implement JS → Native commands:
   - `createView(id, type, props)` — creates a native view
   - `updateView(id, props)` — updates props on existing view
   - `deleteView(id)` — removes a view
   - `appendChild(parentId, childId)` — adds child view
   - `removeChild(parentId, childId)` — removes child view
   - `setLayout(id, x, y, width, height)` — applies Yoga-computed layout
4. Implement Native → JS events:
   - `onPress(id)`, `onTextChange(id, text)`, etc.
   - Event dispatch mechanism (callback registry or event emitter)
5. Implement the transport:
   - JSC: use `JSContext.evaluateScript` + `JSExport` protocol
   - Or Hermes: use JSI `HostObject` / `HostFunction`
   - Batch commands for performance (send array of operations per frame)
6. Write tests:
   - Mock native side, verify command serialization
   - Test event dispatch round-trip

## Output

- `packages/bridge/package.json`
- `packages/bridge/src/commands.js`
- `packages/bridge/src/events.js`
- `packages/bridge/src/index.js`
- `packages/bridge/src/__tests__/bridge.test.js`
- `ios/Bridge/BridgeModule.swift`
- `ios/Bridge/ViewRegistry.swift`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS ↔ Swift bridge"
