# Refactor: Minor Cleanups

Two smaller refactors that don't warrant their own plan files.

## 1. Consolidate Duplicated `readLayoutFrames`

**File:** `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift:64-170`

**Problem:** Two nearly identical methods — one without tracing (lines 64-112) and one with tracing (lines 118-170). The position-relative offset logic (~40 lines of `isBlock`/`isInWrappingFlex` handling) is copy-pasted between them. Any bugfix to the offset logic must be applied in both places.

**Fix:** Consolidate into a single method with tracing as an optional parameter:

```swift
public static func readLayoutFrames(
    node: ShadowNodeWrapper,
    tracing: Bool = false,
    nodeTimings: inout [(type: String, start: Double, end: Double)]
) {
    // ... single implementation
}
```

Callers that don't need tracing pass a discarded `inout` variable. Alternatively, use an optional `inout` wrapper or keep a convenience overload that calls the main implementation:

```swift
// Convenience — no tracing
public static func readLayoutFrames(node: ShadowNodeWrapper) {
    var ignored: [(type: String, start: Double, end: Double)] = []
    readLayoutFrames(node: node, tracing: false, nodeTimings: &ignored)
}
```

This keeps the call sites clean while eliminating the code duplication.

## 2. Gate DevTools Code Behind `#if DEBUG`

**Files:**
- `DevTools/LogBox/LogBox.swift`
- `DevTools/LogBox/LogBoxStore.swift`
- `DevTools/LogBox/LogBoxBadge.swift`
- `DevTools/LogBox/LogBoxListView.swift`
- `DevTools/LogBox/LogBoxDetailView.swift`
- `DevTools/DebugMenu.swift`
- `DevTools/DevKeyCommands.swift`
- `DevTools/ReloadBanner.swift`
- `DevTools/HotReload.swift`

**Problem:** These files compile unconditionally. The LogBox UI (~800 lines across 4 files), DebugMenu, DevKeyCommands, and HotReloadClient are dev-only features that ship in release builds.

**Fix:** Wrap each file's contents in `#if DEBUG ... #endif`. For types referenced from non-DEBUG code, provide stub implementations:

```swift
#if DEBUG
public class LogBox {
    // ... full implementation
}
#else
public class LogBox {
    public static let shared = LogBox()
    public func addEntry(...) {}
    public func clearAll() {}
    // minimal no-op stubs
}
#endif
```

**Key call sites to audit:**
- `JSRuntime.swift` — already gates `LogBox.shared.addEntry` in `#if DEBUG`
- `Root.swift` — `ReloadBanner.shared.show/dismiss` calls — need gating or stubs
- `Root.swift` — `HotReloadClient` setup — needs gating or stubs
- `ReactRuntime.swift` — `DevKeyCommands.install()` and `DebugMenu.shared` — need gating

**Approach:** Prefer `#if DEBUG` at call sites over stub classes, since stubs add maintenance burden. Wrap entire DevTools file contents in `#if DEBUG` and add `#if DEBUG` guards at all call sites.

## Verification

1. `npm run test:swift` — Swift unit tests pass
2. `npm run test:fantom` — Integration tests pass
3. Build Falcon Demo app in both Debug and Release configurations
