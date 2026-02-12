# C++-Ready Architecture: Isolating Platform Boundaries

## Goal

Restructure the Swift codebase so that the shadow tree, JS engine interface, and bindings layer are cleanly isolated behind protocols and target boundaries. No C++ yet — but each piece can be swapped to a C++ implementation independently when the time comes.

## Motivation

We want to eventually share core runtime logic across iOS and Android via C++. Rather than doing a big C++ rewrite now, we isolate the three components that would move to C++ behind clean interfaces. This lets us:

- Ship and iterate in Swift today
- Port one component at a time to C++ later
- Keep the app working at every step
- Avoid C++ ergonomic costs until they're justified by actual cross-platform needs

## What Stays in Swift Permanently

These require platform APIs (UIKit) and have no cross-platform benefit:

| Component | Why |
|---|---|
| `createRoot(UIView) -> Root` | Public API for Swift consumers |
| View factory (div → UIView, p → UILabel, etc.) | UIKit class instantiation |
| Prop application (color, font, image loading) | UIKit property setters |
| Gesture recognizer setup + event dispatch | UIGestureRecognizer |
| View hierarchy manipulation (insertSubview, removeFromSuperview) | UIKit |
| DevTools (hot reload, error overlay) | UIKit |

## What Gets Isolated for Future C++ Porting

### 1. ShadowTree (already isolated)

Pure data structures + diffing algorithm. No UIKit, no JS engine dependencies.

- `ShadowNodeFamily` — stable identity across clones
- `ShadowNodeWrapper` — immutable node with props, children, layout frame
- `Differentiator` — tree diffing, produces mutation list
- `Mutation` — enum of tree operations (create, delete, insert, remove, update)

**Current status:** Already its own Swift Package target. Needs one fix — remove JSC protocol conformance from ShadowNodeWrapper (decouple from JS engine).

**Future C++ port:** Write C++ shadow tree, expose via C header, replace Swift target. Bindings layer doesn't change.

### 2. JSEngine (new protocol)

Abstracts the JavaScript engine behind a protocol. Today's implementation wraps JavaScriptCore's Swift API. Later, could wrap a C++ JSI layer.

```swift
protocol JSEngine {
    // Lifecycle
    func evaluate(_ script: String, sourceURL: String?) throws

    // Global property access
    func setGlobalFunction(_ name: String, paramCount: Int, _ body: @escaping ([JSValueRef]) -> JSValueRef?)
    func setGlobalProperty(_ name: String, value: Any)
    func getGlobalProperty(_ name: String) -> JSValueRef?

    // Value conversion
    func toString(_ ref: JSValueRef) -> String?
    func toInt(_ ref: JSValueRef) -> Int?
    func toDouble(_ ref: JSValueRef) -> Double?
    func toBool(_ ref: JSValueRef) -> Bool?
    func toDictionary(_ ref: JSValueRef) -> [String: Any]?
    func toArray(_ ref: JSValueRef) -> [Any]?

    // Value creation
    func makeString(_ value: String) -> JSValueRef
    func makeNumber(_ value: Double) -> JSValueRef
    func makeObject(_ dict: [String: Any]) -> JSValueRef
    func makeArray(_ values: [Any]) -> JSValueRef
    func makeNull() -> JSValueRef

    // Object ref management (prevent GC / allow GC)
    func protect(_ ref: JSValueRef)
    func unprotect(_ ref: JSValueRef)
}
```

**Implementation:** `JavaScriptCoreEngine: JSEngine` — each method is a one-liner calling JSC's Swift API. This is the only file in the project that imports JavaScriptCore.

**Future C++ port:** Build minimal JSI layer in C++ over JSC's C API (`<JavaScriptCore/JavaScript.h>`). Create `JSIEngine: JSEngine` in Swift that calls through a C bridge. Swap in JSRuntime. Nothing else changes.

### 3. Bindings (renamed from Bridge)

The layer that registers `$$` functions callable from JS and orchestrates the commit pipeline. Named after Chromium's "bindings" — the code that connects JS calls to native implementation.

**Current coupling:** Directly calls `JSContext.setObject(_:forKeyedSubscript:)` and reads `JSValue` arguments.

**After refactor:** Registers functions via `JSEngine` protocol. Reads arguments via `engine.toString()`, `engine.toInt()`, etc. Same logic, different plumbing.

## Architecture After Refactor

```
┌─────────────────────────────────────────────────┐
│                  JavaScript                      │
│  (React reconciler, HostConfig, Flight client)   │
└──────────────────────┬──────────────────────────┘
                       │ calls $$createNode, $$completeRoot, etc.
┌──────────────────────▼──────────────────────────┐
│              JSEngine Protocol                    │
│  ┌────────────────────────────────────────────┐  │
│  │ JavaScriptCoreEngine (today)               │  │
│  │ JSIEngine (future C++ backend)             │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                   Bindings                        │
│  • Registers $$ functions via JSEngine            │
│  • Translates JS values ↔ Swift types             │
│  • Orchestrates commit pipeline:                  │
│    layout → diff → mutations → apply              │
└────────┬─────────────────────────┬──────────────┘
         │                         │
┌────────▼────────┐  ┌────────────▼───────────────┐
│   ShadowTree    │  │   UIKit Mutation Applier    │
│  (pure Swift,   │  │  (view factory, props,      │
│   no deps)      │  │   gesture recognizers)      │
└─────────────────┘  └────────────────────────────┘
```

## File Structure

```
packages/react-dom-native/ios/Sources/
├── ShadowTree/                         # Target 1: zero framework deps
│   ├── ShadowNodeFamily.swift
│   ├── ShadowNodeWrapper.swift
│   ├── Differentiator.swift
│   └── Mutation.swift
│
├── JSEngine/                           # Target 2: imports JavaScriptCore
│   ├── JSEngine.swift                  # Protocol definition + JSValueRef typealias
│   └── JavaScriptCoreEngine.swift      # JSC implementation (only JSC import in project)
│
├── ReactDomNativeKit/                  # Target 3: imports UIKit, depends on 1 & 2
│   ├── Root.swift
│   ├── CreateRoot.swift
│   ├── JSRuntime.swift                 # Creates engine, passes to Bindings
│   ├── Exports.swift
│   ├── Bindings/
│   │   ├── Bindings.swift              # $$ registration via JSEngine protocol
│   │   ├── ViewRegistry.swift
│   │   └── UIKitMutationApplier.swift
│   └── DevTools/
│       ├── HotReloadClient.swift
│       └── ErrorOverlay.swift
```

Three Swift Package targets:
- **ShadowTree** — no dependencies
- **JSEngine** — imports JavaScriptCore only
- **ReactDomNativeKit** — depends on ShadowTree + JSEngine, imports UIKit

## Migration Plan

Four phases, each ending with a working app.

### Phase 1: Introduce JSEngine protocol

- Create the `JSEngine` target with protocol and `JavaScriptCoreEngine` implementation
- Add the target to Package.swift
- No other changes — new code added alongside existing code
- **Verify:** App builds and runs, no behavior change

### Phase 2: Migrate JSRuntime and Bindings to use JSEngine

- Rename `Bridge/` → `Bindings/`, `NativeBridge.swift` → `Bindings.swift`
- Change `JSRuntime.swift` to create `JavaScriptCoreEngine` and pass to Bindings
- Change `Bindings.swift` to register `$$` functions via `JSEngine` protocol
- Remove `import JavaScriptCore` from every file except `JavaScriptCoreEngine.swift`
- **Verify:** App builds and runs identically — rendering, events, hot reload all work

### Phase 3: Decouple ShadowTree from JSC

- Remove JSC protocol conformance from `ShadowNodeWrapper`
- Bindings maintains `[Int: ShadowNodeWrapper]` lookup table:
  - Returning node to JS: return integer ID via `engine.makeNumber()`
  - Receiving node from JS: extract ID via `engine.toInt()`, look up wrapper
- ShadowTree target ends up with zero framework imports
- **Verify:** App builds and runs identically

### Phase 4: Verify boundaries and clean up

- Verify import graph:
  - `ShadowTree` — no Foundation, no UIKit, no JavaScriptCore
  - `JSEngine` — only JavaScriptCore (in implementation file)
  - `ReactDomNativeKit` — UIKit + ShadowTree + JSEngine
- Confirm ShadowTree compiles in isolation
- **Verify:** Full app works, all existing tests pass

## Future: Porting to C++

Each component can be ported independently:

| Component | Port strategy |
|---|---|
| ShadowTree | Write C++ shadow tree, expose via C header, create Swift wrapper target that replaces the Swift ShadowTree target |
| JSEngine | Write C++ JSI layer over JSC's C API, create `JSIEngine: JSEngine` that calls through C bridge, swap in JSRuntime |
| Bindings | Move `$$` registration into C++ HostFunctions, Swift only receives mutation callbacks via C function pointers |

The C++ JSI layer would be minimal — ~500 lines wrapping JSC's C API:

- `Runtime` — owns JSGlobalContextRef
- `Value` — tagged union wrapping JSValueRef
- `Object` — wraps JSObjectRef with property access
- `HostFunction` — C++ lambda callable from JS
- `HostObject` — C++ object with get/set for JS

No `PropNameID`, no `WeakObject`, no `PreparedJavaScript`, no engine abstraction. Direct JSC C API calls, add Hermes/V8 backends later if needed.

## Key Design Decisions

1. **Swift now, C++ later** — avoid C++ ergonomic costs until cross-platform is needed. The shadow tree is ~400 lines; rewriting in Kotlin for Android may be less work than maintaining C++ interop glue.

2. **Protocol-based abstraction** — JSEngine protocol enforces the boundary at the type system level. You can't accidentally call JSC from Bindings.

3. **Integer node IDs** — ShadowNodeWrapper identity crosses the JS↔Swift boundary as integers, not opaque JSC objects. This makes the future C++ port trivial — same integers, different backing store.

4. **Bindings stays in ReactDomNativeKit** — it's glue code that depends on everything (JSEngine, ShadowTree, UIKit). A separate target would add build complexity for minimal isolation benefit. Revisit if it grows beyond 2-3 files.

5. **No premature C++ JSI** — the JSEngine protocol is the abstraction layer. If we never need C++, we never pay for it. If we do, the protocol tells us exactly what the C++ layer needs to implement.
