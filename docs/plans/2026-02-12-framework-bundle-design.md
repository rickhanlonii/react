# Framework Bundle + On-Demand Module Loading

## Problem

The app entry point (`example/server/src/entry/index.js`) manually wires together framework code (renderer, flight client, bridge, component registration) with app-specific code (client components, MODULE_MAP, server URL). The framework wiring is identical for every app and belongs in `react-dom-native`. The app-specific code (client components) should load from the server on demand, like a browser fetching scripts.

## Design

### Framework Bundle

`react-dom-native` provides its own entry point built into a static framework bundle:

```
packages/react-dom-native/src/entry.js
```

Contains:
- Renderer setup (reconciler, host config)
- Flight client (with on-demand module resolution)
- Bridge utilities (fetchWithBridge)
- HTML component registration (side effects)
- Global API: `globalThis.__REACT_DOM_NATIVE__` with `renderFromURL(url, rootViewHandle)`

Does NOT contain:
- Client components
- MODULE_MAP
- Server URL
- Auto-boot logic

The native Swift side provides the server URL. After evaluating the framework bundle, Swift calls:

```swift
engine.evaluate("globalThis.__REACT_DOM_NATIVE__.renderFromURL('\(serverURL)', {surfaceId: \(surfaceId)})")
```

### On-Demand Module Loading

When the Flight stream references a client component (e.g., `1:I["Counter",[],"default"]`), the Flight client fetches it from the server.

Three functions change in `packages/react-dom-native/src/flight-client/config.js`:

**`resolveClientReference(bundlerConfig, metadata)`**
- `bundlerConfig` becomes the server base URL (a string), not a module map
- Returns `{url: serverBaseURL + '/modules/' + moduleId + '.js', name: exportName}`

**`preloadModule(clientRef)`**
- Fetches the module JS from the server using `$$fetch`
- Evaluates via `eval()` or `new Function()`
- Caches in a module cache (`Map<string, {status, value, reason}>`)
- Returns a thenable (Flight client handles async resolution via Suspense)

**`requireModule(clientRef)`**
- Returns cached module if loaded
- Throws pending promise if still loading (Suspense catches this)

Fetched modules are self-contained IIFEs:

```js
// GET /modules/Counter.js
(function(){ /* bundled Counter code */ return { default: Counter }; })()
```

### Server Changes

**Serve client component modules individually:**

Each `"use client"` component gets bundled as a standalone IIFE by esbuild. Served at `/modules/<id>.js`:

```
GET /modules/Counter.js   -> IIFE-bundled Counter component
GET /modules/TextInput.js  -> IIFE-bundled TextInput component
```

**Client manifest uses simple IDs:**

The manifest `id` stays as a simple name like `"Counter"`. The client interprets it as a fetchable module path (`/modules/Counter.js`).

### Native App Changes

Swift calls `renderFromURL(serverURL, surfaceId)` after evaluating the framework bundle, instead of the bundle auto-booting with a hardcoded URL.

## Files Changed

| File | Change |
|------|--------|
| `packages/react-dom-native/src/entry.js` | New — framework entry point |
| `packages/react-dom-native/src/flight-client/config.js` | On-demand module resolution |
| `example/server/server.js` | Add `/modules/:id.js` endpoint, build client components as IIFEs |
| `Root.swift` or `FalconApp.swift` | Call `renderFromURL(serverURL, surfaceId)` after bundle eval |
| `example/server/src/entry/index.js` | Delete |
| `example/scripts/build.js` | Build framework bundle from `react-dom-native/src/entry.js` |

## Result

The example app becomes:
- `server/` — RSC server + client components (served on demand)
- `Falcon/` — Xcode project (unchanged except server URL config)
- `scripts/` — simplified build (just framework bundle)

No entry/index.js. No MODULE_MAP. No manual component wiring.
