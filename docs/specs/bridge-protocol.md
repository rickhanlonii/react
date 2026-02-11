# Spec: Bridge Protocol

## Overview

The bridge protocol defines the JavaScript-to-Swift communication interface for react-dom-native. All bridge functions are registered as global functions on the JSContext, prefixed with `$$`. Communication is synchronous (same thread, same process).

## Module

- Swift: `ios/Native/Bridge/NativeBridge.swift`
- JS declarations: `packages/bridge/src/types.d.ts`

## Threading Model

All shadow node bridge calls execute synchronously on the **main thread**. The JSContext, Yoga layout, shadow tree, and UIKit all share the main thread.

```
Main Thread:
  JS evaluateScript → $$createNode → Swift handler → return to JS
  (no async, no thread hops, no message queuing)
```

> **Exception: Networking.** The `$$fetch` bridge function (used by the Flight client for RSC streaming) is asynchronous. The `$$fetch` call itself returns immediately, and `URLSession` performs the HTTP request on a background thread. Response chunks are delivered back to JS via callbacks dispatched to the main thread. All other `$$` bridge functions (shadow node operations, event handling) remain synchronous.

## Bridge Functions

### Node Creation

#### `$$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle) → ShadowNodeHandle`

Creates an immutable shadow node with its Yoga layout node.

**Parameters:**
- `type: string` — HTML element name ("div", "span", "p", etc.)
- `surfaceId: number` — Root surface identifier
- `props: object` — Element props including style, event handlers, etc.
- `isInsideTextContext: boolean` — Whether parent is a text container
- `instanceHandle: object` — React fiber reference for event dispatch

**Returns:** Opaque `JSValue` wrapping the immutable `ShadowNode`

**Native behavior:**
1. Look up `ElementDescriptor` from `HTMLElementRegistry`
2. Create `ShadowNodeFamily` (stable identity)
3. Create immutable `ShadowNode` with props and Yoga defaults
4. Apply style props to Yoga node
5. Set up text measure function if text container
6. Wrap in JSValue and return

#### `$$createTextNode(text, surfaceId, instanceHandle) → ShadowNodeHandle`

Creates a text shadow node.

**Parameters:**
- `text: string` — Text content
- `surfaceId: number` — Root surface identifier
- `instanceHandle: object` — React fiber reference

**Returns:** Opaque `JSValue` wrapping the text `ShadowNode`

### Clone Operations (Persistent Mode)

#### `$$cloneNode(node) → ShadowNodeHandle`

Clones a shadow node with same props and children.

#### `$$cloneNodeWithNewProps(node, newProps) → ShadowNodeHandle`

Clones a shadow node with new props, keeping existing children.

**Parameters:**
- `node: ShadowNodeHandle` — Source node to clone
- `newProps: object` — New props to apply

**Native behavior:**
1. Unwrap source `ShadowNode`
2. Create new immutable `Props` from `newProps`
3. Clone `ShadowNode` — shares `ShadowNodeFamily` (identity preserved)
4. Clone Yoga node, apply new style props
5. Return new opaque handle

#### `$$cloneNodeWithNewChildren(node, children?) → ShadowNodeHandle`

Clones a shadow node with new children list, keeping existing props.

#### `$$cloneNodeWithNewChildrenAndProps(node, children?, newProps) → ShadowNodeHandle`

Clones a shadow node with both new children and new props.

### Tree Construction

#### `$$appendChild(parentNode, childNode) → void`

Appends a child to a parent's children list during tree construction.

**Parameters:**
- `parentNode: ShadowNodeHandle` — Parent shadow node
- `childNode: ShadowNodeHandle` — Child to append

**Native behavior:**
1. Unwrap both nodes
2. Add child's Yoga node to parent's Yoga node
3. Add child to parent's children list

### Container Operations

#### `$$createChildSet() → ChildSetHandle`

Creates an empty child set for collecting root children.

**Returns:** Opaque handle wrapping an empty array

#### `$$appendChildToChildSet(childSet, child) → void`

Adds a child to the child set.

#### `$$completeRoot(surfaceId, childNodes) → void`

Atomically commits the new tree. This is the core commit function.

**Parameters:**
- `surfaceId: number` — Surface to commit to
- `childNodes: ShadowNodeHandle[]` — New root children

**Native behavior (commit pipeline):**
1. Build new shadow tree from child nodes
2. Calculate Yoga layout: `YGNodeCalculateLayout(newRoot, width, height, YGDirectionLTR)`
3. Diff old tree vs new tree via Differentiator → generate mutations
4. Apply mutations to UIViews atomically within `CATransaction`
5. Promote new tree to current tree

```
$$completeRoot pipeline:
  ┌─ Build new tree from childNodes
  ├─ YGNodeCalculateLayout(newRoot)
  ├─ Differentiator.diff(oldTree, newTree) → [Mutation]
  ├─ CATransaction.begin()
  ├─ Apply mutations (Create, Delete, Insert, Remove, Update)
  ├─ CATransaction.commit()
  └─ Promote newTree → currentTree
```

### Measurement

#### `$$measureNode(node, callback) → void`

Measures a node's layout position and size.

**Parameters:**
- `node: ShadowNodeHandle` — Node to measure
- `callback: (x, y, width, height) → void` — Result callback

### Event Handling

#### `$$registerEventHandler(handler) → void`

Registers the global event dispatch function. Called once during initialization.

**Parameters:**
- `handler: (instanceHandle, eventType, payload) → void`

**Native behavior:**
Stores the handler function. When UIKit events occur:
1. Hit test determines touched view
2. Look up `ShadowNodeFamily` from view
3. Get `InstanceHandle` from family
4. Call handler with `(instanceHandle, "click", { locationX, locationY, ... })`

### Event Priority Constants

```
$$DefaultEventPriority: number    = 32  (DefaultLane)
$$DiscreteEventPriority: number   = 2   (SyncLane)
$$ContinuousEventPriority: number = 8   (InputContinuousLane)
```

## Data Encoding

### Props → Swift

JSC auto-converts JS objects to Swift dictionaries:

| JS Type | Swift Type |
|---------|------------|
| `string` | `String` |
| `number` | `NSNumber` (Double) |
| `boolean` | `NSNumber` (Bool) |
| `null` | `NSNull` |
| `object` | `[String: Any]` |
| `array` | `[Any]` |
| `function` | Stripped (event handlers sent as `true` flags) |

### Event Payloads → JS

Events are dispatched as JS objects:

```js
// Click event
{ locationX: 150, locationY: 200, pageX: 150, pageY: 400, timestamp: 1234567890 }

// Scroll event
{
  contentOffset: { x: 0, y: 120 },
  contentSize: { width: 375, height: 2000 },
  layoutMeasurement: { width: 375, height: 667 },
}

// Change event (input/textarea)
{ text: "current value", target: { value: "current value" } }

// Layout event
{ layout: { x: 0, y: 100, width: 375, height: 44 } }
```

## ShadowNodeHandle

Opaque `JSValue` wrapping a Swift `ShadowNodeWrapper` object:

```swift
class ShadowNodeWrapper: NSObject {
    let shadowNode: ShadowNode  // Immutable shadow node reference
    let family: ShadowNodeFamily  // Stable identity

    init(node: ShadowNode, family: ShadowNodeFamily) {
        self.shadowNode = node
        self.family = family
    }
}
```

The `JSContext` retains the `JSValue`, preventing deallocation while JS holds the reference. When JS GC collects the value, the Swift wrapper is released.

## Mutation Types

Generated by the Differentiator during `$$completeRoot`:

| Type | Description | UIKit Operation |
|------|-------------|-----------------|
| `Create` | New node needs a view | Dequeue from pool or `UIView()` |
| `Delete` | Node removed | Return view to pool |
| `Insert` | Attach child at index | `parent.insertSubview(child, at: index)` |
| `Remove` | Detach child | `child.removeFromSuperview()` |
| `Update` | Props or layout changed | Set view properties + `center`/`bounds` |

## View Registry

Maps `ShadowNodeFamily` (stable identity) to UIView:

```swift
class ViewRegistry {
    // Forward: family → view (for applying mutations)
    var familyToView: [ObjectIdentifier: UIView]

    // Reverse: view → family (for event dispatch hit testing)
    var viewToFamily: [ObjectIdentifier: ShadowNodeFamily]
}
```

Keyed by `ShadowNodeFamily` (not `ShadowNode`) because node pointers change on every clone in persistent mode, but family pointers remain stable.

## Error Handling

- Unknown element type in `$$createNode`: throw with message "Unknown HTML element type: {type}"
- Null node handle passed to clone/measure: throw with descriptive error
- Layout with NaN/Inf values: skip applying frame to UIView, log warning
- Event dispatch to unmounted node: silently drop (InstanceHandle is weak ref)

## Integration Points

- **Renderer Host Config**: Calls all `$$` functions from persistent mode host config
- **Event System**: Dispatches via registered event handler
- **Yoga Layout**: Embedded in shadow nodes, calculated during `$$completeRoot`
- **UIKit**: View mutations applied during `$$completeRoot` commit
