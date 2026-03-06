# Unify Dev Ports: 4 → 2

## Context

Currently `npm run dev` launches 4 processes across 4 ports:

| Port | Process | Role |
|------|---------|------|
| 6000 | `server.js` | RSC Flight streams + static files |
| 6001 | `ssr-server.js` | SSR (Fizz) |
| 8082 | `start-inspector.js` | WS relay: app ↔ build tool ↔ inspector |
| 8976 | `start-inspector.js` | CDP: Chrome DevTools |

Ports 8082/8976 are a single process (`start-inspector.js`) that acts as a message bus. The package (`HotReload.swift`) hardcodes `localhost:8082`.

**Goal:** Collapse to 2 ports (6000 RSC+dev, 6001 SSR). Derive all dev connections from the server URL passed to `root.render(url:)` or `hydrateRoot(view, url:)` — no hardcoded ports in the package.

## How the URL flows today

- **SSR:** `hydrateRoot(view, url: "http://localhost:6001/ssr/page")` → SSR stream emits `["BOOT", "http://localhost:6000/bundle.js"]` → `ReactRuntime.devBundleURL` set to `http://localhost:6000/bundle.js` → `boot()` → `setupDevToolsConnection()` (currently hardcodes `ws://localhost:8082`)
- **CSR:** App sets `ReactRuntime.shared.devBundleURL` manually, then calls `root.render(url: "http://localhost:6000/...")`

Key insight: `devBundleURL` is always set before `setupDevToolsConnection()` runs. We can derive the dev WS URL from it: `http://localhost:6000/bundle.js` → `ws://localhost:6000/__dev`.

## Implementation Plan

### Step 1: Refactor `inspector-proxy.js` to accept an external server

**File:** `example/scripts/inspector-proxy.js`

Currently `createInspectorProxy` creates its own `http.createServer()` + `WebSocketServer({server})` + `listen()`.

Refactor to:
- Accept options: `{app, wssHandler}` — Express app for HTTP routes, and a callback to register the CDP WS upgrade handler
- Export route-mounting function for Express: `/json`, `/json/version`, `/json/list`, `/preview`, `/preview/html`, `/preview/events`, `/debug/verbose`, `/debug/status`
- Export WS upgrade handler for CDP connections (called when WS upgrade path matches `/__cdp/<targetId>`)
- Remove self-managed `httpServer.listen()`
- Keep ALL domain handler logic untouched (Tracing, Runtime, DOM, CSS, Page, etc.)

### Step 2: Add dev WS + CDP + inspector routes to `server.js`

**File:** `example/server/server.js`

Add after existing Express routes:

1. **Mount inspector proxy HTTP routes** on the Express app (via Step 1's refactored API)
2. **Change `app.listen()` to `http.createServer(app).listen()`** for access to the raw HTTP server
3. **Handle WS upgrades** on the HTTP server:
   - Path `/__dev` → dev WS (app connections + build tool connections)
   - Path starting with `/__cdp/` → CDP WS (Chrome DevTools)
4. **Dev WS connection handler** (logic from `start-inspector.js` lines 32-123):
   - App sends `{type: "connect"}` → `proxy.addTarget(info, sendFn)`, track target ID per WS
   - Build tool sends `{type: "notify-reload"}` / `{type: "notify-refresh"}` → broadcast to app clients
   - App sends `{type: "cdp-response|cdp-event|trace-data|console-message|screenshot-data|..."}` → `proxy.handleAppMessage(targetId, data)`
   - App sends `{type: "open-devtools"}` → open Chrome with DevTools URL
   - On disconnect → `proxy.disconnectTarget(targetId)`
   - Track tracing state, re-send `start-tracing` to reconnecting apps

Use `WebSocketServer({noServer: true})` for both dev and CDP, with manual upgrade handling.

### Step 3: Update `HotReload.swift` — take URL, remove hardcoded port

**File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift`

Change init from:
```swift
public init(host: String = "localhost", port: Int = 8082, ...)
```
To:
```swift
public init(url: URL, appName: String = "Falcon", ...)
```

The caller provides the full WS URL (e.g., `ws://localhost:6000/__dev`). No defaults for host/port.

### Step 4: Update `ReactRuntime.setupDevToolsConnection()` — derive WS URL from `devBundleURL`

**File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`

In `setupDevToolsConnection()`, derive the WS URL from `devBundleURL`:
```swift
guard let devURL = devBundleURL else { return } // No dev server → no devtools
let wsScheme = devURL.scheme == "https" ? "wss" : "ws"
let host = devURL.host ?? "localhost"
let port = devURL.port.map { ":\($0)" } ?? ""
let wsURL = URL(string: "\(wsScheme)://\(host)\(port)/__dev")!

let client = HotReloadClient(url: wsURL, appName: ..., ...)
```

This means: if there's no `devBundleURL` (production, using package resource bundle), devtools simply doesn't connect. Clean.

### Step 5: Update `build.js --watch` — connect to RSC server

**File:** `example/scripts/build.js`

Change WS connection from:
```js
ws = new WebSocket('ws://localhost:8082');
```
To:
```js
ws = new WebSocket('ws://localhost:' + (process.env.PORT || 6000) + '/__dev');
```

### Step 6: Simplify `dev.sh`

**File:** `example/scripts/dev.sh`

Remove `start-inspector.js` process. Only 3 processes:
```bash
node scripts/build.js --watch &     # webpack watcher
node --conditions react-server server.js &  # RSC + dev (Flight, WS, CDP)
node ssr-server.js &                # SSR (Fizz)
```

Remove `wait_for_server 8976` check. Update status output to show 2 ports.

### Step 7: Delete dead code

- **Delete** `example/scripts/dev.js` — dead code, never called, API mismatch with current inspector-proxy
- **Delete** `example/scripts/dev-server.js` — dead code, only used by dead `dev.js`
- **Delete or repurpose** `example/scripts/start-inspector.js` — functionality moved to `server.js`

### Step 8: Update test/debug scripts that reference ports

**Files to update** (port 8082 → `ws://localhost:6000/__dev`, port 8976 → `http://localhost:6000`):
- `example/scripts/test-cdp.js`
- `example/scripts/test-proxy.js`
- `example/scripts/cdp-monitor.js`
- `example/scripts/__tests__/devtools.test.js`
- Any other test scripts referencing 8082 or 8976
- `.claude/skills/devtools/SKILL.md` — update port references

## Key Design Decisions

1. **WS path `/__dev`** for app+build tool connections — double underscore prefix avoids conflicts with Express routes and static files
2. **WS path `/__cdp/<targetId>`** for Chrome DevTools — also prefixed to avoid conflicts; `webSocketDebuggerUrl` in `/json/list` returns this path
3. **Derive from `devBundleURL`** not from render URL — `devBundleURL` is always set before devtools setup runs (from SSR bootstrap or manual CSR config), and directly points at the RSC server origin
4. **No devtools in production** — if `devBundleURL` is nil (using package resource bundle), skip devtools entirely. Clean separation.
5. **inspector-proxy.js domain handlers untouched** — only the server lifecycle (create/listen/close) changes. All 1500+ lines of CDP domain logic remain as-is.

## Verification

1. `npm run dev` starts successfully with 3 processes (was 4)
2. App connects to `ws://localhost:6000/__dev` — verify hot reload works (edit a server component, see reload)
3. `curl http://localhost:6000/json` returns target list
4. Chrome DevTools connects via `chrome://inspect` — Performance trace works
5. `npm test` passes (JS unit tests)
6. `npm run test:swift` passes (Swift unit tests)
7. Fantom integration tests pass
8. E2E tests pass
