# Inspector Proxy: Multi-Target Identity Handshake

## Problem

The inspector proxy generates a random target ID on startup (`falcon-<random>`), meaning:
- The DevTools URL changes every time the dev server restarts
- No way to distinguish multiple connected devices/simulators
- `chrome://inspect` shows generic "Falcon JSC" for all connections

## Design

### Identity handshake

When the app connects via WebSocket (port 8082), it immediately sends a `connect` message:

```json
{
  "type": "connect",
  "appName": "Falcon",
  "deviceName": "Falcon Demo",
  "deviceModel": "iPhone 16 Pro",
  "simulatorUDID": "61F83D8B-36DF-474F-9AAD-61DC6D60FFED",
  "platform": "iOS Simulator"
}
```

Swift sources:
- `appName`: `Bundle.main.infoDictionary?["CFBundleName"]`
- `deviceName`: `UIDevice.current.name`
- `deviceModel`: `ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"]` (simulator) or `UIDevice.current.model` (device)
- `simulatorUDID`: `ProcessInfo.processInfo.environment["SIMULATOR_UDID"]`
- `platform`: `"iOS Simulator"` or `"iOS"` based on `SIMULATOR_UDID` presence

### Target ID derivation

- Simulator: `falcon-<simulatorUDID>` (stable across restarts, unique per simulator)
- Physical device: `falcon-<sanitized-deviceName>` (fallback)

### Multi-target proxy

The proxy manages a `Map<targetId, Target>` instead of a single target. Each target has its own:
- Domain handlers (tracing, runtime, page, etc.)
- `sendToApp` function (routes to the correct app WebSocket)
- CDP client set (DevTools windows connected to this target)

### `/json` response

Returns one entry per connected app:

```json
[
  {
    "description": "Falcon",
    "id": "falcon-61F83D8B-...",
    "title": "Falcon — Falcon Demo",
    "url": "iPhone 16 Pro (Simulator)",
    "type": "page",
    "webSocketDebuggerUrl": "ws://127.0.0.1:8976/falcon-61F83D8B-..."
  }
]
```

`chrome://inspect` displays:
```
Falcon — Falcon Demo          [inspect]
iPhone 16 Pro (Simulator)
```

### Files changed

| File | Change |
|------|--------|
| `HotReloadClient.swift` | Accept identity params, send `connect` message on WebSocket open |
| `ReactRuntime.swift` | Read device info, pass to HotReloadClient |
| `start-inspector.js` | Parse `connect` message, register/unregister targets with proxy |
| `inspector-proxy.js` | Multi-target: Map of targets, per-target domain handlers, dynamic `/json` |

### Edge cases

- App connects before sending `connect` → messages queued until identity received
- App disconnects → target removed from `/json`, CDP clients disconnected
- Same simulator reconnects (reload) → same targetId, target state reset
- No apps connected → `/json` returns `[]`
