# DevTools Inspector Proxy — Architecture & Internals

## Overview

The CDP inspector proxy (`example/scripts/inspector-proxy.js`) bridges Chrome DevTools and the native iOS app's JavaScriptCore runtime. It implements CDP domains (Page, DOM, CSS, Input, Overlay, Tracing, etc.) and communicates with the app via WebSocket.

```
Chrome DevTools <--CDP WebSocket (8976)--> Inspector Proxy (Node.js)
                                            | messages via WS (8082)
                                       App (JSC on iOS Simulator)
```

## Screencast

The inspector proxy supports CDP `Page.startScreencast` for live device preview inside DevTools. The screencast captures frames **in-app** using `UIGraphicsImageRenderer` (not external `simctl` commands), so it's fast (~10-20ms per frame).

**How it works:**
1. Proxy sends `{type: "capture-screenshot", maxWidth, quality}` to app via WebSocket
2. Swift renders the window to JPEG in-process via `UIGraphicsImageRenderer` and sends back base64 data as `{type: "screenshot-data", data, width, height, scale}`
3. Proxy wraps it as `Page.screencastFrame` for DevTools with metadata (deviceWidth, deviceHeight, pageScaleFactor)

**Reload resilience:** The proxy uses a getter for `sendToApp` (always points to the current WebSocket connection) and has a 2s timeout on `captureInFlight` to auto-retry if the app disconnects mid-capture.

**Files involved:**
- `example/scripts/inspector-proxy.js` — `createPageDomain()`: `captureFrame()`, `handleAppMessage` for `screenshot-data`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — `captureScreenshot(maxWidth:quality:)` renders window via `UIGraphicsImageRenderer`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift` — forwards `capture-screenshot` messages to `onInspectorMessage`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — intercepts `capture-screenshot` and routes to `Bindings.captureScreenshot` on main thread

## Touch Dispatch (Input.dispatchMouseEvent)

Clicking on the screencast in DevTools dispatches touch events to the native app.

**How it works:**
1. DevTools sends `Input.dispatchMouseEvent` with coordinates in device pixels
2. Proxy divides by `deviceScale` to get logical points, sends `{type: "dispatch-touch", x, y}` to app
3. Swift does `window.hitTest(point)` and dispatches to the appropriate view:
   - `UIControl` subclasses (buttons, nav bar items): `sendActions(for: .touchUpInside)`
   - `UITextField`: `becomeFirstResponder()`
   - React-managed views: event bubbling via `dispatchEvent`

**Coordinate system:** DevTools sends coordinates in device pixels when screencast is active (because we report `pageScaleFactor: deviceScale`). The proxy divides by `deviceScale` to get UIKit logical points (window coordinates).

**Files involved:**
- `example/scripts/inspector-proxy.js` — `createInputDomain(pageDomain)` handles `dispatchMouseEvent`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — `dispatchTouchAtWindowPoint(x:y:)` with window-level hit testing
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift` — forwards `dispatch-touch` messages
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` — routes to `Bindings` on main thread

## Elements Tab (DOM/CSS Domains)

The Elements tab shows the native shadow tree as a DOM tree. The proxy forwards `DOM.*` and `CSS.*` CDP requests to the app's JSC runtime, which reads the shadow tree via Swift bridge functions.

**Bridge functions (registered in Swift, called from JS):**
- `$$getDocumentTree(surfaceId)` — walks the shadow tree, returns CDP `DOM.Node` tree
- `$$getOuterHTML(nodeId)` — returns HTML representation of a node
- `$$getBoxModel(nodeId)` — returns box model with window coordinates (`view.convert(view.bounds, to: nil)`)
- `$$getComputedStyle(nodeId)` — returns computed CSS properties
- `$$getInlineStyle(nodeId)` — returns inline style properties

**Files involved:**
- `packages/react-dom-native/src/devtools/DOMAgent.js` — handles DOM/CSS requests in JSC, exports `$$handleDOMRequest` and `$$handleCSSRequest`
- `packages/react-dom-native/src/devtools/RuntimeAgent.js` — `$$handleCDPRequest` routes by domain
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — `registerElementsInspector()` exposes the `$$` bridge functions

## Web Preview Page

A live HTML preview of the native shadow tree, served at `http://localhost:8976/preview`.

**Endpoints:**
- `/preview` — full HTML page with SSE auto-refresh
- `/preview/html` — raw body HTML content (fetched by the page for incremental updates)
- `/preview/events` — SSE stream, pushes `refresh` on `dom-updated`

**How it works:** The preview page connects to `/preview/events` via SSE. On each `refresh` event, it fetches `/preview/html` and swaps the body content. The `/preview/html` endpoint calls `DOM.getPreviewHTML` which walks the document tree and concatenates `$$getOuterHTML` for each body child.

## Highlight Overlay

Element highlighting is handled by the DevTools screencast overlay (not the in-simulator overlay). The DOM and Overlay domains return `{}` for `highlightNode`/`hideHighlight` to avoid duplicate highlights.

The `$$getBoxModel` binding uses window coordinates (`view.convert(view.bounds, to: nil)`) so highlights align with the screencast screenshot (which is a full-window capture).

## Message Flow

### Proxy → App (via WebSocket)
| Message Type | Purpose |
|---|---|
| `start-tracing` | Start performance trace collection |
| `stop-tracing` | Stop tracing, app sends back `trace-data` |
| `cdp-request` | Forward CDP domain request to JSC (DOM, CSS, Runtime) |
| `capture-screenshot` | Request a screencast frame |
| `dispatch-touch` | Forward click from DevTools screencast |
| `reload` | Trigger full JS bundle reload |
| `refresh` | Trigger Fast Refresh with changed chunks |

### App → Proxy (via WebSocket)
| Message Type | Purpose |
|---|---|
| `trace-data` | Performance trace events |
| `cdp-response` | Response to a forwarded CDP request |
| `screenshot-data` | Screencast frame (base64 JPEG + dimensions) |
| `dom-updated` | Shadow tree changed (triggers SSE + screencast refresh) |
| `cdp-event` | Broadcast CDP event (e.g. `Runtime.exceptionThrown`) |
| `console-message` | Console API call from JS |

## Logging

All `log()` calls are gated behind a `verboseLogging` flag (off by default). Toggle at runtime:

```bash
curl http://localhost:8976/debug/verbose   # toggle on/off
curl http://localhost:8976/debug/status    # check current state
```

Startup messages use `logAlways()` and always print regardless of the flag.
