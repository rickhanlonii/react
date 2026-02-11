# ADR 001: JavaScript Engine — JavaScriptCore

## Status

Accepted

## Context

The react-dom-native iOS client needs a JavaScript engine to run the React reconciler, Flight client, and bridge code. The two viable options are:

1. **Hermes** — Meta's JS engine optimized for React Native, with ahead-of-time bytecode compilation
2. **JavaScriptCore (JSC)** — Apple's system framework, built into every iOS device

## Decision

**Use JavaScriptCore** via the native Swift `JavaScriptCore.framework` API.

## Rationale

### 1. Zero integration complexity

JSC requires only `import JavaScriptCore` in Swift. Hermes requires cmake, hermesc (bytecode compiler), xcframework builds, ObjC++ bridge layers, and significant CocoaPods/build configuration.

### 2. Native Swift API eliminates the C++ bridge layer

JSC's `JSContext`/`JSValue`/`JSExport` API allows the entire JS-to-native bridge to be written in Swift. With Hermes, the path is JS → JSI (C++) → ObjC++ → Swift — three layers instead of one.

### 3. Zero bundle size impact

JSC is a system framework (0 MB added). Hermes adds 3–6 MB to the app binary.

### 4. Our JS bundle is small

The startup-time advantage of Hermes bytecode precompilation matters most for large bundles (1–5 MB). Our runtime bundle is small (~100 KB) — reconciler, Flight client, bridge code. Application content arrives via Flight stream, not in the JS bundle. JSC parse time for a 100 KB bundle is negligible (<50 ms on modern devices).

### 5. JIT for rendering throughput

JSC's multi-tier JIT (LLInt → Baseline → DFG → FTL) provides better sustained throughput for the reconciler's diffing and tree traversal operations, which run repeatedly on every update.

### 6. Full platform integration

Safari Web Inspector for debugging, full Intl support, consistent behavior with iOS WebView.

## Consequences

- All JS-to-native communication uses `JSContext.setObject()` and `@convention(block)` closures
- `JSContext` is not thread-safe — all JS execution must happen on a single serial queue (main thread)
- `JSManagedValue` must be used for preventing reference cycles between JS and Swift
- No bytecode precompilation — JS is parsed at startup (negligible for our bundle size)
- Higher memory baseline (~15–20 MB) compared to Hermes (~10 MB)

## Migration path to Hermes

If startup time or memory becomes an issue:

1. Define a Swift `JSEngine` protocol abstracting engine operations
2. Add Hermes via prebuilt xcframework CocoaPod
3. Write a thin ObjC++ adapter bridging Hermes JSI to the Swift protocol (~200–300 lines)
4. Add `hermesc` build phase for bytecode precompilation

The JS code (reconciler, Flight client, components) does not change — only the native bridge layer.
