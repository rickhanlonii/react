---
name: devtools
description: Open Chrome DevTools connected to the Falcon app's JSC runtime via the inspector proxy. Use when debugging JS execution, viewing console logs, profiling performance, or inspecting the app's runtime.
---

# DevTools

Opens Chrome DevTools in the MCP-controlled browser, connected to the Falcon app's JavaScriptCore runtime via the CDP inspector proxy.

## Prerequisites

The **dev server** must be running (it starts the inspector proxy on port 8976):
```bash
curl -s http://localhost:8976/json
```

If it's not running, start it:
```
Bash(command: "cd /Users/rickhanlonii/oss/falcon/example && npm run dev", run_in_background: true)
```
Wait 5 seconds, then re-check the endpoint.

## Connect

1. **Get the WebSocket debugger URL** from the inspector proxy:
   ```bash
   curl -s http://localhost:8976/json
   ```
   Extract the `id` field from the response (e.g. `falcon-477b2nad`).

2. **Navigate the MCP browser** to the DevTools inspector with the WebSocket connection:
   ```
   navigate_page(type: "url", url: "devtools://devtools/bundled/inspector.html?remoteFrontend=true&ws=127.0.0.1:8976/<id>")
   ```
   Replace `<id>` with the actual id from step 1.

3. **Verify** by taking a screenshot — you should see the Chrome DevTools UI connected to "Falcon JSC".

## Usage

Once connected, you can control the DevTools UI using Chrome DevTools MCP tools:

- **`take_screenshot`** — see the current DevTools state
- **`take_snapshot`** — get the accessibility tree of the DevTools UI for interaction
- **`click`** — click DevTools tabs (Console, Sources, Performance, Network, etc.)
- **`fill`** — type in the Console or filter inputs

### Common actions

| Action | How |
|--------|-----|
| View console logs | Click the "Console" tab |
| Switch to Performance | Click the "Performance" tab |
| Filter console | Click the filter input, use `fill` to type a filter |
| Run JS in console | Click the console prompt, use `fill` or `type_text` to enter code |

## Features

### Screencast

The inspector proxy supports CDP `Page.startScreencast` for live device preview inside DevTools. The screencast captures frames **in-app** using `UIGraphicsImageRenderer` (not external `simctl` commands), so it's fast (~10-20ms per frame).

**How it works:**
1. Proxy sends `{type: "capture-screenshot"}` to app via WebSocket
2. Swift renders the window to JPEG in-process and sends back base64 data
3. Proxy wraps it as `Page.screencastFrame` for DevTools

**Files involved:**
- `example/scripts/inspector-proxy.js` — Page domain `captureFrame()`, `handleAppMessage` for `screenshot-data`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — `captureScreenshot(maxWidth:quality:)` renders window via `UIGraphicsImageRenderer`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift` — forwards `capture-screenshot` messages
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — routes to `Bindings.captureScreenshot` on main thread

### Touch Dispatch (Input.dispatchMouseEvent)

Clicking on the screencast in DevTools dispatches touch events to the native app.

**How it works:**
1. DevTools sends `Input.dispatchMouseEvent` with coordinates in device pixels
2. Proxy divides by `deviceScale` to get logical points, sends `{type: "dispatch-touch", x, y}` to app
3. Swift does `window.hitTest(point)` and dispatches to the appropriate view:
   - `UIControl` subclasses (buttons, nav bar items): `sendActions(for: .touchUpInside)`
   - `UITextField`: `becomeFirstResponder()`
   - React-managed views: event bubbling via `dispatchEvent`

**Files involved:**
- `example/scripts/inspector-proxy.js` — Input domain, `createInputDomain(pageDomain)`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — `dispatchTouchAtWindowPoint(x:y:)` with window-level hit testing
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift` — forwards `dispatch-touch` messages
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — routes to `Bindings` on main thread

### Elements Tab (DOM/CSS Domains)

The Elements tab shows the native shadow tree as a DOM tree. The proxy forwards `DOM.*` and `CSS.*` CDP requests to the app's JSC runtime, which reads the shadow tree via `$$getDocumentTree`, `$$getOuterHTML`, `$$getComputedStyle`, etc.

**Files involved:**
- `packages/react-dom-native/src/devtools/DOMAgent.js` — handles DOM/CSS requests in JSC
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — `registerElementsInspector()` exposes `$$getDocumentTree`, `$$getBoxModel`, etc.

### Web Preview Page

A live HTML preview of the native shadow tree, served at `http://localhost:8976/preview`.

**Endpoints:**
- `/preview` — full HTML page with SSE auto-refresh
- `/preview/html` — raw body HTML content
- `/preview/events` — SSE stream, pushes `refresh` on `dom-updated`

### Highlight Overlay

Element highlighting is handled by the DevTools screencast overlay (not the in-simulator overlay). The DOM and Overlay domains return `{}` for `highlightNode`/`hideHighlight` to avoid duplicate highlights.

The `$$getBoxModel` binding uses window coordinates (`view.convert(view.bounds, to: nil)`) so highlights align with the screenshot.

## Debugging the Proxy

Logging is **off by default** for performance. To enable verbose logging while the server is running:

```bash
# Toggle verbose logging on/off
curl http://localhost:8976/debug/verbose

# Check current status
curl http://localhost:8976/debug/status
```

This logs all CDP messages, WebSocket traffic, domain routing, and screencast events.

## Important

- Use the **plugin** MCP server (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`), not the user-scoped one (which requires Chrome Beta).
- The `devtools://` URL **must** include `remoteFrontend=true` to load correctly.
- The inspector proxy WebSocket ID changes each time the dev server restarts — always fetch it fresh from `/json`.
- The DevTools page won't appear in `list_pages` results, but you can still take screenshots and interact with it via snapshots.
- Screencast requires an **app rebuild** when Swift files change (proxy-only changes just need a dev server restart).
