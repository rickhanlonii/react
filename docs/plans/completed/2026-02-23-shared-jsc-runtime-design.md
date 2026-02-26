# Shared JSC Runtime Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

Each `FixtureViewController` creates its own `Root`, which creates its own `JSRuntime`
and `JSContext`. Navigating between fixtures in the demo app accumulates N independent
JSContexts, WebSocket connections, polling timers, and CDP relay paths — all running
concurrently. This causes:

- Broadcast amplification (reload messages go to all contexts)
- Duplicate polling timers hitting `/bundle-version`
- CDP request fan-out (DevTools commands forwarded to all contexts)
- Trace data from arbitrary contexts
- Interleaved console output with no source identification
- ~882KB of duplicated React runtime per context

## Design

### New Type: `ReactRuntime` (singleton)

A `@MainActor` class in ReactDomNativeKit that owns the single JSContext and all shared
infrastructure.

**Responsibilities:**
- Creates and holds the single `JSRuntime` (engine + bindings)
- Loads and evaluates the framework bundle (once)
- Owns the `HotReloadClient` (one WebSocket to dev server)
- Owns devtools setup (inspector message relay)
- Manages active surfaces (maps surfaceId -> Root)
- Assigns surface IDs (auto-incrementing counter)
- Handles hot reload: in-place re-evaluation for fast refresh, full context reset for fallback
- Provides `updateViewportSize` for the currently visible surface

**Public API:**

```swift
public class ReactRuntime {
    /// Shared singleton instance.
    public static let shared = ReactRuntime()

    /// Optional URL for loading the bundle from a dev server.
    public var devBundleURL: URL?

    /// Whether the bundle has been loaded and evaluated.
    public private(set) var isBundleLoaded: Bool

    /// Boots the runtime: loads bundle, sets up devtools.
    /// Safe to call multiple times (no-op if already booted).
    public func boot(completion: ((Error?) -> Void)? = nil)

    /// Registers a surface for a Root. Returns the assigned surfaceId.
    internal func registerSurface(root: Root, container: UIView) -> Int

    /// Unregisters a surface when a Root is unmounted.
    internal func unregisterSurface(surfaceId: Int)

    /// Triggers rendering for a surface via JS-side renderFromURL.
    internal func renderSurface(surfaceId: Int, serverURL: String)

    /// Triggers hydration for a surface.
    internal func hydrateSurface(surfaceId: Int, serverURL: String, ssrData: [String])

    /// Reloads: in-place re-eval (fast refresh) or full reset (fallback).
    public func reload(fullReset: Bool = false)
}
```

The singleton is created lazily on first access. `boot()` is called explicitly by the
app or implicitly on first `root.render()`. `Root.devBundleURL` moves to
`ReactRuntime.shared.devBundleURL`.

### Redesigned `Root` (lightweight surface handle)

Root no longer owns a JSRuntime or JSContext. It delegates to `ReactRuntime.shared`.

**What moves to ReactRuntime:**
- `private var runtime: JSRuntime?`
- `private var hotReloadClient: HotReloadClient?`
- `setupDevToolsConnection()`
- `reload()`
- `resolveBundleURL()`, `loadBundle()`, `executeBundle()`

**What stays on Root:**
- SSR state (`ssrParser`, `ssrTreeBuilder`, `ssrBoundaryManager`, etc.) — per-fixture
- `container: UIView` and layout observer
- Public API (`render`, `renderWithSSR`, `hydrateRoot`, `unmount`)

**surfaceId** is assigned by ReactRuntime (auto-incrementing), not by RootOptions.

**Public API change:**
```swift
// Before:
Root.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
let root = createRoot(view)
root.render(serverURL: "http://localhost:6000") { ... }

// After:
ReactRuntime.shared.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
let root = createRoot(view)
root.render(serverURL: "http://localhost:6000") { ... }
```

### Hot Reload

Moves entirely to ReactRuntime. One HotReloadClient, one WebSocket, one polling timer.

**Fast refresh (default):** Re-evaluate the bundle in the existing JSContext. React's
fast refresh mechanism handles component updates. All active surfaces stay mounted.

**Full reset (fallback):**
1. Snapshot active surfaces: `[(surfaceId, root, serverURL)]`
2. Disconnect HotReloadClient
3. `runtime = nil` (old JSContext deallocated)
4. `runtime = JSRuntime()` (new JSContext)
5. Load + evaluate bundle
6. Reconnect HotReloadClient
7. For each active surface: re-register and re-render
8. Update viewport size for visible surface

### Viewport

Single active viewport model. `$$onViewportResize` is called with the visible surface's
dimensions. Off-screen surfaces get updated when they become visible.

### Demo App Changes (`FalconApp.swift`)

- Remove polling timer from `FixtureViewController`
- Remove `Root.devBundleURL` — use `ReactRuntime.shared.devBundleURL`
- `viewDidLoad` calls `createRoot(view)` + `root.render()` (ReactRuntime boots lazily)
- `deinit` calls `root.unmount()` (unregisters surface)
- No duplicate WebSockets, timers, or contexts

**Fixture navigation flow:**
```
Navigate to fixture A:
  → createRoot(view) + render(serverURL)
  → ReactRuntime.boot() (first time: load bundle)
  → registerSurface(surfaceId: 1)
  → JS: renderFromURL(url, {surfaceId: 1})

Navigate to fixture B (A in back stack):
  → createRoot(view) + render(serverURL)
  → ReactRuntime.boot() (no-op)
  → registerSurface(surfaceId: 2)
  → JS: renderFromURL(url, {surfaceId: 2})

Pop back to A:
  → FixtureVC(B).deinit → root.unmount() → unregisterSurface(2)
  → A still rendered, no re-render needed
```

## Files Changed

| File | Change |
|------|--------|
| `ios/Sources/ReactDomNativeKit/ReactRuntime.swift` | **New** — singleton, owns JSRuntime, bundle, HotReloadClient, devtools |
| `ios/Sources/ReactDomNativeKit/Root.swift` | Remove JSRuntime/HotReloadClient ownership, delegate to ReactRuntime |
| `ios/Sources/ReactDomNativeKit/CreateRoot.swift` | No change (still creates Root) |
| `ios/Sources/ReactDomNativeKit/JSRuntime.swift` | No change (still wraps JSContext + Bindings) |
| `example/Falcon/Falcon/FalconApp.swift` | Remove polling timer, use ReactRuntime.shared.devBundleURL |

## Future Work: CDP Protocol Issues

See `docs/plans/2026-02-23-cdp-lifecycle-fixes.md` for known issues with the CDP
inspector proxy during JSContext lifecycle transitions (stale requests, missing context
events, object ID invalidation). These are separate from this refactor and can be
addressed independently.
