---
name: impl-js-bridge
description: Implement the JS to Swift bridge for native communication. Can run in parallel with impl-yoga-layout.
---

# Implement: JS ↔ Swift Bridge

## Objective

Build the communication layer between JavaScript (running in JavaScriptCore) and Swift (UIKit). The bridge exposes `$$`-prefixed global functions for persistent-mode shadow node operations and event dispatch, using JSC's native Swift API.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `docs/specs/bridge-protocol.md` must exist
- `docs/specs/adr/002-bridge-approach.md` must exist
- `docs/research/js-engine.md` must exist (confirms JSC choice)

## Reference Files

- `docs/specs/bridge-protocol.md` — Full bridge protocol spec
- `docs/specs/renderer-host-config.md` — Host config that calls these bridge functions
- `docs/specs/adr/002-bridge-approach.md` — JSC Swift API decision

## Instructions

1. Read the bridge protocol spec (`docs/specs/bridge-protocol.md`) and ADR 002
2. Initialize `packages/bridge/`:
   - `package.json` (JS side)
   - `src/types.d.ts` — TypeScript declarations for all `$$` globals
   - `src/index.js` — JS-side bridge utilities and event priority constants
3. Create Swift bridge at `ios/Native/Bridge/NativeBridge.swift`:
   - Register all `$$` bridge functions on the `JSContext` using `context.setObject(_:forKeyedSubscript:)` with `@convention(block)` closures
   - Node creation:
     - `$$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle) → ShadowNodeHandle`
     - `$$createTextNode(text, surfaceId, instanceHandle) → ShadowNodeHandle`
   - Clone operations (persistent mode):
     - `$$cloneNode(node) → ShadowNodeHandle`
     - `$$cloneNodeWithNewProps(node, newProps) → ShadowNodeHandle`
     - `$$cloneNodeWithNewChildren(node, children) → ShadowNodeHandle`
     - `$$cloneNodeWithNewChildrenAndProps(node, children, newProps) → ShadowNodeHandle`
   - Tree construction:
     - `$$appendChild(parentNode, childNode) → void`
   - Container operations:
     - `$$createChildSet() → ChildSetHandle`
     - `$$appendChildToChildSet(childSet, child) → void`
     - `$$completeRoot(surfaceId, childNodes) → void` — triggers layout, diff, and UIKit mutations
   - Measurement:
     - `$$measureNode(node, callback) → void`
   - Event handling:
     - `$$registerEventHandler(handler) → void`
   - Event priority constants:
     - `$$DefaultEventPriority = 32`
     - `$$DiscreteEventPriority = 2`
     - `$$ContinuousEventPriority = 8`
   - Networking (for Flight client):
     - `$$fetch(url, headers, callback) → void` — async HTTP using URLSession
4. Create `ios/Native/Bridge/ShadowNodeWrapper.swift`:
   - `ShadowNodeWrapper: NSObject` — wraps immutable `ShadowNode` and `ShadowNodeFamily`
   - Used as the opaque `ShadowNodeHandle` type passed between JS and Swift
   - `ShadowNodeFamily` provides stable identity across clones
5. Create `ios/Native/Bridge/ViewRegistry.swift`:
   - `familyToView: [ObjectIdentifier: UIView]` — forward map for applying mutations
   - `viewToFamily: [ObjectIdentifier: ShadowNodeFamily]` — reverse map for event hit testing
   - Keyed by `ShadowNodeFamily` (not `ShadowNode`) because node handles change on every clone
6. Implement the Differentiator in `ios/Native/Bridge/Differentiator.swift`:
   - Diff old tree vs new tree → generate mutation instructions (`Create`, `Delete`, `Insert`, `Remove`, `Update`)
   - Called during `$$completeRoot` after Yoga layout calculation
   - Mutations applied atomically within `CATransaction`
7. Implement Native → JS event dispatch:
   - Store the JS handler registered via `$$registerEventHandler`
   - On UIKit events: hit test → look up `ShadowNodeFamily` via `ViewRegistry` → get `InstanceHandle` → call handler with `(instanceHandle, eventType, payload)`
   - Event payloads: click `{ locationX, locationY, ... }`, scroll `{ contentOffset, ... }`, change `{ text, ... }`
8. Write tests:
   - `packages/bridge/src/__tests__/bridge.test.js`
   - Test: `$$createNode` global is callable and returns a handle
   - Test: `$$cloneNodeWithNewProps` returns a new handle with same identity
   - Test: `$$completeRoot` triggers commit pipeline
   - Test: `$$registerEventHandler` stores handler and events dispatch through it
   - Test: event priority constants have correct lane values

## Output

- `packages/bridge/package.json`
- `packages/bridge/src/types.d.ts`
- `packages/bridge/src/index.js`
- `packages/bridge/src/__tests__/bridge.test.js`
- `ios/Native/Bridge/NativeBridge.swift`
- `ios/Native/Bridge/ShadowNodeWrapper.swift`
- `ios/Native/Bridge/ViewRegistry.swift`
- `ios/Native/Bridge/Differentiator.swift`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS ↔ Swift bridge"
