# Fix: DevTools WebSocket not connecting in Server Only mode

## Problem

When the demo app renders a fixture in **Server Only** mode, the DevTools WebSocket never connects. This means no fast refresh, no DevTools inspector, no screencast, etc.

## Root Cause

Two issues prevent the connection:

### 1. `devServerURL` is never set

In `startHydration()` and `startResume()`, the dev server URL is derived from the SSR URL and stored on the runtime singleton:

```swift
// Root+SSR.swift:94-101 (hydration) and Root+Prerender.swift:96-102 (prerender)
if let ssrURLObj = URL(string: url) {
    var components = URLComponents()
    components.scheme = ssrURLObj.scheme
    components.host = ssrURLObj.host
    components.port = ssrURLObj.port
    rt.devServerURL = components.url
}
```

`startServerOnly()` (Root+SSR.swift:286) **does not do this**. So `devServerURL` remains nil.

### 2. `setupDevToolsConnection()` is only called during boot

The DevTools WebSocket setup happens inside `boot()` completion (ReactRuntime.swift:133). Server Only mode intentionally never boots the JS runtime (no bundle to load, no client components). So `setupDevToolsConnection()` is never called.

### 3. `setupDevToolsConnection()` requires JS bindings

Even if we called it, the method guards on `runtime?.bindings` (ReactRuntime.swift:677). Without a booted runtime, this is nil. However, many DevTools features (reload, clear, navigate-fixture, screencast dispatch-touch, capture-screenshot) don't actually need JS bindings — they work through `NotificationCenter`, surface clearing, or UI automation.

## Fix

### Step 1: Set `devServerURL` in `startServerOnly()`

**File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`

After line 295 (`renderMode = .serverOnly(url: url)`), add:

```swift
// Derive the dev server URL so DevTools can connect
let rt = ReactRuntime.shared  // already accessed on line 299
if let ssrURLObj = URL(string: url) {
    var components = URLComponents()
    components.scheme = ssrURLObj.scheme
    components.host = ssrURLObj.host
    components.port = ssrURLObj.port
    rt.devServerURL = components.url
}
```

Note: `rt` is already used on line 299 — just move the `let rt = ReactRuntime.shared` up before this block.

### Step 2: Refactor `setupDevToolsConnection()` to work without bindings

**File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`

Change the method so that:
- The `devServerURL` guard stays (we need the URL)
- The `bindings` guard is removed from the top; instead, bindings-dependent wiring is conditional
- The HotReloadClient is created and connected regardless
- Inspector message forwarding (`sendInspectorMessage`, `onInspectorMessage`) is only wired when bindings exist
- Features that don't need bindings still work: `onClear`, `onReload`, `onRefresh`, `navigate-fixture`, `dispatch-touch`, `capture-screenshot`

Specifically:
1. Remove `guard let bindings = runtime?.bindings else { return }` from the top
2. Keep all the client creation and `onClear`/`onReload`/`onRefresh` handlers
3. Wrap the bindings-dependent code in `if let bindings = runtime?.bindings { ... }`:
   - `bindings.sendInspectorMessage = ...` (line 723)
   - `bindings.deliverInspectorMessage(json)` (line 797)
   - `bindings.eventDispatcher.dispatchTouchAtWindowPoint(...)` — can also use UI automation fallback
   - `bindings.captureScreenshot(...)` and commit screenshot config
4. For `onInspectorMessage`, keep the handler but only forward to bindings if available. DevTools-level messages like `navigate-fixture`, `dispatch-touch`, `capture-screenshot`, `start-tracing`, `stop-tracing` should still be handled.

### Step 3: Call `setupDevToolsConnection()` from Server Only mode

**File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`

In `startServerOnly()`, after setting `devServerURL`, call:

```swift
rt.setupDevToolsConnectionIfNeeded()
```

This needs a new public/internal entry point since `setupDevToolsConnection()` is private. Options:
- **Option A:** Add an internal method `setupDevToolsConnectionIfNeeded()` that calls through if not already connected
- **Option B:** Make `setupDevToolsConnection()` internal instead of private

Option A is better — it adds an idempotency check so double-calling is safe:

```swift
/// Ensures devtools WebSocket is connected. Safe to call multiple times.
internal func setupDevToolsConnectionIfNeeded() {
    #if DEBUG
    guard hotReloadClient == nil || !hotReloadClient!.isConnected else { return }
    setupDevToolsConnection()
    #endif
}
```

### Step 4: Handle `onRefresh` gracefully in Server Only mode

When `onRefresh` fires (fast refresh chunks), Server Only mode can't do JS hot module replacement. Instead, it should do a full server re-fetch — re-stream the SSR response. The existing `onReload` handler already does `reload(fullReset: true)` which should handle this, but verify that `onRefresh` falls back correctly when there's no JS runtime.

## Files to change

1. `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` — Set devServerURL and call setupDevToolsConnectionIfNeeded
2. `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — Refactor setupDevToolsConnection to work without bindings, add setupDevToolsConnectionIfNeeded

## Testing

1. Build demo app, open a fixture in Server Only mode
2. Verify WebSocket connects (check console for `[HotReloadClient] Connected`)
3. Verify DevTools MCP tools work (navigate-fixture, screenshot)
4. Verify fast refresh triggers a server re-fetch (edit a server component, check it updates)
5. Verify Hydrated/Prerender modes still work as before (regression check)
