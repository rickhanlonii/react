# ADR 002: Native Bridge — JavaScriptCore Swift API

## Status

Accepted

## Context

The renderer needs a bridge between JavaScript (where the React reconciler runs) and native Swift/C++ (where shadow nodes, Yoga layout, and UIKit views live). Options considered:

1. **JSI (JavaScript Interface)** — C++ abstraction layer used by React Native Fabric. Engine-agnostic, synchronous, requires C++/ObjC++.
2. **JSC C API** — Low-level `JavaScriptCore/JavaScript.h` C API. Used by React Native's JSCRuntime. Requires C interop.
3. **JavaScriptCore.framework Swift API** — Apple's high-level Swift API (`JSContext`, `JSValue`, `JSExport`). Native Swift, no C++ required.

## Decision

**Use the JavaScriptCore.framework Swift API** for all JS ↔ native communication.

## Rationale

### Simplicity

The Swift API provides direct JS-to-Swift function binding with zero boilerplate:

```swift
let createView: @convention(block) (String, [String: Any]) -> Int = { type, props in
    return self.nativeCreateView(type: type, props: props)
}
context.setObject(createView, forKeyedSubscript: "$$createView" as NSString)
```

With JSI, the equivalent requires a C++ `HostFunction`, `jsi::Value` argument parsing, and an ObjC++ wrapper to call Swift.

### No C++ in the JS↔native bridge layer

The JS-to-Swift bridge itself is pure Swift — no C++ needed for the communication boundary. This eliminates:
- C++ in the bridge layer
- `jsi::Runtime` lifecycle management
- C++ exception handling interop at the bridge boundary

> **Amendment (Phase 1b):** C++ *is* used internally for the shadow tree and Yoga layout engine, accessed from Swift via ObjC++ bridging. The distinction is: the JS↔Swift bridge uses JSC's Swift API (no C++), but the shadow tree internals that the bridge calls into are implemented in C++ for performance. See the bridge-protocol spec for details on the `$$completeRoot` pipeline.

### Synchronous calls

JSC's Swift API supports synchronous calls from JS to Swift and vice versa, matching JSI's synchronous semantics. Functions registered via `setObject` are called synchronously when JS invokes them.

### Alignment with ADR 001

Since we chose JavaScriptCore as the engine, using its native Swift API is the natural choice. JSI would add an unnecessary abstraction layer between the engine and our code.

## Bridge Architecture

### Global functions exposed to JS

All bridge functions are prefixed with `$$` to avoid namespace collisions:

| JS Function | Swift Handler | Purpose |
|-------------|--------------|---------|
| `$$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle)` | `NativeBridge.createNode` | Create shadow node |
| `$$createTextNode(text, surfaceId, instanceHandle)` | `NativeBridge.createTextNode` | Create text shadow node |
| `$$cloneNode(node)` | `NativeBridge.cloneNode` | Clone node (persistent mode) |
| `$$cloneNodeWithNewProps(node, props)` | `NativeBridge.cloneNodeWithNewProps` | Clone with new props |
| `$$cloneNodeWithNewChildren(node, children)` | `NativeBridge.cloneNodeWithNewChildren` | Clone with new children |
| `$$cloneNodeWithNewChildrenAndProps(node, children, props)` | `NativeBridge.cloneNodeWithNewChildrenAndProps` | Clone with both |
| `$$appendChild(parent, child)` | `NativeBridge.appendChild` | Build child list |
| `$$createChildSet()` | `NativeBridge.createChildSet` | Create container child set |
| `$$appendChildToChildSet(set, child)` | `NativeBridge.appendChildToChildSet` | Add to child set |
| `$$completeRoot(surfaceId, childSet)` | `NativeBridge.completeRoot` | Atomic tree commit |
| `$$measureNode(node, callback)` | `NativeBridge.measureNode` | Layout measurement |
| `$$registerEventHandler(handler)` | `NativeBridge.registerEventHandler` | Event dispatch callback |

### Data passing

- **Props**: Passed as `[String: Any]` dictionaries (JSC auto-converts JS objects)
- **Node handles**: Opaque `JSValue` references wrapping Swift `ShadowNode` objects
- **Callbacks**: `JSValue` objects callable via `.call(withArguments:)`
- **Events**: Dispatched via the registered event handler function

## Consequences

- No engine portability (locked to JSC). Acceptable per ADR 001.
- Props conversion from `JSValue` to Swift types happens at the bridge boundary
- Large props objects may have conversion overhead (mitigated by passing only changed props)
- `JSContext` is not thread-safe — bridge calls must be serialized on main thread
- Memory management requires `JSManagedValue` for preventing GC of native-held JS objects

## Threading Model

```
Main Thread:
  - JSContext evaluation
  - Bridge function calls (JS → Swift)
  - Event dispatch (Swift → JS)
  - UIKit operations
  - Yoga layout calculation
```

All operations run on the main thread. This simplifies the bridge (no synchronization needed) and enables synchronous discrete event dispatch (zero-frame response to user taps).

## Amendment: C++ Shadow Tree Internals (Phase 1b)

Phase 1b architecture research concluded that the shadow tree and Yoga layout engine should be implemented in C++ for performance, matching the Fabric architecture. This amends the original ADR as follows:

**What changed:**
- Shadow nodes (`ShadowNode`, `ShadowNodeFamily`) are C++ objects, not Swift structs
- Yoga layout calculation runs in C++
- The Differentiator (tree diff algorithm) is C++
- `ShadowNodeWrapper` (Swift, `NSObject`) wraps C++ shadow nodes for JSC interop

**What didn't change:**
- The JS↔Swift bridge still uses JSC's native Swift API (`JSContext.setObject`, `@convention(block)`)
- All `$$` bridge functions are registered as Swift closures on the `JSContext`
- Props conversion from `JSValue` to Swift types happens at the bridge boundary
- Swift calls into C++ via ObjC++ bridging (not visible to JS)

**Architecture:**
```
JS (JSContext) → Swift bridge (@convention(block)) → ObjC++ bridge → C++ shadow tree
                 ↑ pure Swift, JSC API                               ↑ C++ for performance
```

The bridge approach decision (JSC Swift API over JSI) remains valid — the C++ layer is an implementation detail of the shadow tree, not the bridge.
