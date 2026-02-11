# JS Engine Comparison: Hermes vs JavaScriptCore (JSC)

## Summary

This document compares Hermes and JavaScriptCore as the JavaScript engine for the react-dom-native iOS client. Both engines are viable, but **JavaScriptCore (JSC) is the recommended choice** for this project's specific requirements.

---

## Comparison Table

| Feature | Hermes | JavaScriptCore (JSC) |
|---|---|---|
| **Bundle size impact** | +3-6 MB (must ship engine binary) | 0 MB (built into iOS) |
| **Startup time** | Faster with bytecode precompilation | Slightly slower (JIT compilation at runtime) |
| **Throughput performance** | Good (interpreter + static hermes compilation) | Excellent (multi-tier JIT: baseline + DFG + FTL) |
| **ES module support** | No native ESM (requires bundler) | No native ESM in C API (requires bundler) |
| **Proxy/Reflect** | Supported | Supported |
| **WeakRef/FinalizationRegistry** | Supported | Supported |
| **Intl support** | Partial (requires polyfill or compile flag) | Full (built into iOS) |
| **Microtask queue** | Configurable (`withMicrotaskQueue`) | Built-in (needs polyfill for host control) |
| **iOS integration** | Build from source or use prebuilt xcframework | System framework, zero config |
| **Swift interop** | Requires C++/ObjC++ bridge layer | Native Swift API (`JavaScriptCore` framework) |
| **Debugging** | Hermes debugger + Chrome DevTools Protocol | Safari Web Inspector (built-in) |
| **JSI compatibility** | Yes (primary JSI target) | Yes (JSCRuntime implements jsi::Runtime) |
| **Memory overhead** | Lower baseline (~10 MB) | Higher baseline (~15-20 MB with JIT) |
| **Bytecode precompilation** | Yes (`hermesc` compiler) | No (JIT at runtime) |
| **React Native default** | Yes (since RN 0.70) | Available as alternative |
| **Build complexity** | High (cmake, hermesc, xcframework) | None (system framework) |
| **App Store compliance** | Allowed (static compilation) | Allowed (system framework) |

---

## Detailed Analysis

### Hermes

Hermes is Meta's JavaScript engine optimized for React Native. It focuses on startup time through ahead-of-time bytecode compilation.

**Architecture:**
- Ahead-of-time bytecode compiler (`hermesc`) converts JS source to Hermes Bytecode (HBC)
- Register-based VM interprets HBC at runtime
- "Static Hermes" (Hermes V1) adds native compilation (SHUnit) for even faster execution
- JSI (JavaScript Interface) provides the C++ bridge layer

**How React Native uses it (from source analysis):**
```
JS Source → hermesc → HBC bytecode → shipped in app bundle
→ HermesRuntime loads HBC → jsi::Runtime interface → React Native
```

The `HermesInstance.cpp` shows the runtime creation:
- Creates `HermesRuntime` via `hermes::makeHermesRuntime()`
- Configures GC (3 GB max heap, old-gen allocation for TTI optimization)
- Wraps in `JSRuntime` adapter for React Native's runtime abstraction
- Optionally wraps in `DecoratedRuntime` for Chrome DevTools debugging

**iOS integration complexity (from `hermes-engine.podspec`):**
- Requires building `hermesc` (host compiler) as a build phase
- Requires building hermes engine as xcframework via cmake
- Two-phase Xcode script phases: `[1] Build Hermesc` then `[2] Build Hermes`
- Prebuilt binaries available but versioned to React Native releases
- Substantial CocoaPods/cmake configuration

**Pros for our use case:**
- Bytecode precompilation eliminates parse time at startup
- Lower memory baseline useful for resource-constrained scenarios
- JSI gives synchronous native calls (no bridge overhead)
- Battle-tested in production React Native apps
- Source map support via `evaluateJavaScriptWithSourceMap()`
- Segment loading for code splitting via `loadSegment()`

**Cons for our use case:**
- Adds 3-6 MB to app binary
- Significant build complexity (cmake, hermesc, xcframework, script phases)
- No direct Swift API; requires ObjC++/C++ bridge layer
- Partial Intl support (dates, numbers may need polyfills)
- JIT-less means lower peak throughput for compute-heavy JS
- We don't benefit from bytecode precompilation initially (Flight stream delivers JS at runtime)
- Build infrastructure is deeply coupled to React Native's build system

### JavaScriptCore (JSC)

JavaScriptCore is Apple's JavaScript engine, built into every iOS device as part of WebKit.

**Architecture:**
- Multi-tier JIT compilation (LLInt → Baseline → DFG → FTL)
- On iOS, JIT is available to system frameworks (unlike third-party engines)
- `JavaScriptCore.framework` provides both C API and ObjC/Swift API

**Swift API surface (system framework):**
```swift
import JavaScriptCore

let context = JSContext()!
context.evaluateScript("var x = 42")
let value: JSValue = context.evaluateScript("x + 1")!
print(value.toInt32()) // 43

// Expose native functions to JS
let nativeLog: @convention(block) (String) -> Void = { msg in
    print("[JS]", msg)
}
context.setObject(nativeLog, forKeyedSubscript: "nativeLog" as NSString)

// JSExport protocol for exposing Swift objects
@objc protocol MyNativeAPIExport: JSExport {
    func createView(_ type: String, _ props: [String: Any]) -> Int
}
```

**C API (lower level, used by React Native's JSCRuntime):**
```c
#include <JavaScriptCore/JavaScript.h>
JSGlobalContextRef ctx = JSGlobalContextCreate(NULL);
JSStringRef script = JSStringCreateWithUTF8CString("1 + 1");
JSValueRef result = JSEvaluateScript(ctx, script, NULL, NULL, 0, NULL);
```

**React Native's JSCRuntime (from source analysis):**
- `JSCRuntime` class implements `jsi::Runtime` interface
- Wraps `JSGlobalContextRef` C API
- Implements all JSI operations: `evaluateJavaScript`, `prepareJavaScript`, `createFromHostFunction`, etc.
- Microtask queue requires polyfilling (JSC's built-in Promise queue is not host-controllable)
- Created via simple `jsc::makeJSCRuntime()` factory function

**Pros for our use case:**
- Zero bundle size impact (system framework)
- Zero build complexity (just `import JavaScriptCore`)
- Native Swift API with `JSContext`, `JSValue`, `JSExport`
- Full JIT compilation on iOS (LLInt + Baseline + DFG + FTL)
- Higher peak throughput for sustained workloads
- Full Intl support (built into iOS)
- Safari Web Inspector debugging built-in
- No cmake, no hermesc, no xcframework builds
- App Review safe (system framework, not custom JIT)
- Simple to prototype with; can switch to Hermes later if needed

**Cons for our use case:**
- No bytecode precompilation (parse + compile at startup)
- Higher memory baseline (~15-20 MB with JIT data structures)
- JIT warmup time before peak performance
- Less control over GC behavior
- `JSContext` is not thread-safe (same as Hermes)
- JSI adapter exists but requires C++ if we want JSI compatibility

---

## Evaluation Against RSC Client Requirements

### 1. Deserialize Flight stream (streaming JSON parsing)

Both engines handle this equally well. The Flight stream is text-based (newline-delimited JSON rows). Both engines support:
- `JSON.parse()` for individual chunks
- String manipulation for stream reassembly
- `TextDecoder` polyfill if needed

**Edge: Tie.** This is pure JS parsing; both engines handle it fine.

### 2. Resolve client references (module loading)

Neither engine has native ES module support usable for our purposes. Both require a bundler to resolve and package modules. Client references in RSC are resolved by a module registry, not native ESM.

**Edge: Tie.** Module resolution is application-level, not engine-level.

### 3. Call into native (create/update/delete views)

This is where the engines differ most:

- **JSC**: Native Swift API (`JSExport`, `JSContext.setObject()`) allows direct Swift-to-JS and JS-to-Swift calls without any C++ layer. This dramatically simplifies the bridge.
- **Hermes**: Requires JSI (C++ `HostFunction`, `HostObject`), which then needs an ObjC++ wrapper to call Swift. The path is: JS → JSI (C++) → ObjC++ → Swift.

**Edge: JSC.** The Swift API eliminates an entire layer of complexity.

### 4. Handle React rendering (reconciler runs in JS)

The reconciler is pure JavaScript. Both engines run it. The key question is throughput for diffing and tree operations during rendering:

- **JSC JIT** will optimize hot reconciler paths (fiber traversal, effect processing)
- **Hermes** interpreter is fast but cannot match JIT for sustained compute

For initial rendering of a Flight stream, the difference is negligible. For complex re-renders with large trees, JIT wins.

**Edge: JSC** (slightly, due to JIT for complex renders).

### 5. Startup time (perceived app launch speed)

- **Hermes** with precompiled bytecode: near-instant parse, immediate execution
- **JSC**: must parse + compile JS on first launch (but JIT cache helps on subsequent launches)

However, in our architecture, the JS bundle is relatively small (reconciler + Flight client + bridge code). The main content comes from the server via Flight stream at runtime. The critical path is:

```
App launch → load JS engine → load small runtime bundle → fetch Flight stream → render
```

The JS bundle for our runtime is small enough (likely <100 KB) that JSC parse time is negligible (sub-50ms on modern iOS devices). The bottleneck is network latency for the Flight stream, not JS parse time.

**Edge: Hermes** (technically, but the practical difference is negligible for our small bundle).

---

## Recommendation: JavaScriptCore

**Use JavaScriptCore** as the JavaScript engine for react-dom-native.

### Rationale

1. **Dramatically simpler integration**: `import JavaScriptCore` in Swift vs. cmake + hermesc + xcframework + ObjC++ bridge. For a new project starting from scratch, this is the single biggest factor.

2. **Native Swift API eliminates the C++ bridge layer**: The `JSContext`/`JSValue`/`JSExport` API lets us write the JS-to-native bridge entirely in Swift. With Hermes, we would need a C++ JSI layer, an ObjC++ adapter, and then Swift. This simplification affects every component: the renderer host config bridge, the Flight client's native calls, view creation/updates, and layout.

3. **Zero bundle size**: Not shipping a JS engine saves 3-6 MB, which matters for App Store downloads.

4. **Our JS bundle is small**: The startup-time advantage of Hermes bytecode precompilation is most impactful for large bundles (React Native apps with 1-5 MB of JS). Our runtime bundle is small (reconciler, Flight client, bridge code). Server-rendered content arrives via Flight stream, not in the JS bundle.

5. **JIT for rendering throughput**: JSC's multi-tier JIT provides better throughput for the reconciler's diffing and tree traversal operations, which run repeatedly.

6. **Full platform integration**: Safari Web Inspector for debugging, full Intl support, consistent behavior with iOS WebView.

7. **Lower risk for a new project**: JSC is the safer choice to get the project working. We can always switch to Hermes later (via JSI abstraction) if startup time becomes an issue at scale.

### When Hermes would be the better choice

- If the JS bundle grows large (>500 KB) and startup time becomes critical
- If we need fine-grained GC control for memory-constrained scenarios
- If we want to align with React Native's ecosystem tooling
- If Static Hermes (native compilation) matures and provides significant performance gains

---

## Integration Steps for JSC

### 1. Swift Bridge Setup

```swift
import JavaScriptCore

class ReactNativeRuntime {
    let context: JSContext

    init() {
        context = JSContext()!
        setupNativeBridge()
        loadRuntimeBundle()
    }

    private func setupNativeBridge() {
        // Expose native view operations to JS
        let createView: @convention(block) (String, [String: Any]) -> Int = { [weak self] type, props in
            return self?.nativeCreateView(type: type, props: props) ?? -1
        }
        context.setObject(createView, forKeyedSubscript: "$$createView" as NSString)

        let updateView: @convention(block) (Int, [String: Any]) -> Void = { [weak self] tag, props in
            self?.nativeUpdateView(tag: tag, props: props)
        }
        context.setObject(updateView, forKeyedSubscript: "$$updateView" as NSString)

        // ... additional bridge functions
    }

    private func loadRuntimeBundle() {
        guard let bundleURL = Bundle.main.url(forResource: "runtime", withExtension: "js"),
              let source = try? String(contentsOf: bundleURL) else {
            fatalError("Failed to load runtime bundle")
        }
        context.evaluateScript(source)
    }

    func feedFlightStream(_ chunk: String) {
        context.evaluateScript("__flightClient.processChunk('\(chunk.escaped())')")
    }
}
```

### 2. Exception Handling

```swift
context.exceptionHandler = { context, exception in
    guard let error = exception else { return }
    let message = error.toString() ?? "Unknown JS error"
    let stack = error.objectForKeyedSubscript("stack")?.toString() ?? ""
    print("[JS Error] \(message)\n\(stack)")
}
```

### 3. Threading

```swift
// JSContext is not thread-safe. Use a serial queue.
let jsQueue = DispatchQueue(label: "com.react-dom-native.js")

jsQueue.async {
    self.context.evaluateScript(script)
}
```

### 4. Memory Management

```swift
// Use JSManagedValue for preventing reference cycles
let managedCallback = JSManagedValue(value: jsCallback)
context.virtualMachine.addManagedReference(managedCallback, withOwner: self)
```

---

## Risk Assessment: Switching to Hermes Later

If we later determine that JSC is insufficient, switching to Hermes is feasible:

### Migration path

1. **Abstract the JS engine interface**: Define a Swift protocol that wraps engine operations. Both JSC and Hermes (via JSI + ObjC++ adapter) can implement it.

```swift
protocol JSEngine {
    func evaluateScript(_ source: String) -> JSEngineValue?
    func setNativeFunction(_ name: String, _ fn: @escaping ([JSEngineValue]) -> JSEngineValue?)
    func global() -> JSEngineValue
}
```

2. **Add Hermes as a CocoaPod**: Use the prebuilt xcframework to avoid cmake complexity.

3. **Write a thin ObjC++ adapter**: Bridge Hermes JSI to the Swift protocol. This is ~200-300 lines of boilerplate.

4. **Precompile with hermesc**: Add a build phase that runs `hermesc` on the runtime bundle to produce HBC.

### Estimated effort: 2-3 days

The JSI abstraction means the actual JS code (reconciler, Flight client, components) doesn't change at all. Only the native bridge layer needs adaptation.

### Risk level: Low

- Both engines implement the same JavaScript semantics
- The JSI adapter for JSCRuntime in React Native proves both engines work behind the same interface
- React Native has shipped with both engines for years
- Our JS code won't use any engine-specific APIs

---

## References

- React Native JSI: `../react-native/packages/react-native/ReactCommon/jsi/jsi/jsi.h`
- JSCRuntime implementation: `../react-native/packages/react-native/ReactCommon/jsc/JSCRuntime.cpp`
- HermesInstance implementation: `../react-native/packages/react-native/ReactCommon/react/runtime/hermes/HermesInstance.cpp`
- Hermes engine podspec: `../react-native/packages/react-native/sdks/hermes-engine/hermes-engine.podspec`
- JS engine selection logic: `../react-native/packages/react-native/scripts/cocoapods/jsengine.rb`
- JSRuntimeFactory interface: `../react-native/packages/react-native/ReactCommon/jsitooling/react/runtime/JSRuntimeFactory.h`
- Hermes-specific interfaces: `../react-native/packages/react-native/ReactCommon/jsi/jsi/hermes-interfaces.h`
