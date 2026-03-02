# Spec: react-dom-native Export Surface

## Goal

Restructure `react-dom-native` exports to mirror `react-dom`'s four-tier API surface, providing a familiar API for React developers while mapping to native iOS rendering.

## Current State

```
react-dom-native
├── "."         → src/index.js        (re-exports renderer + bridge)
├── "./server"  → src/server/index.js  (renderToPipeableStream)
└── (internal)  → src/renderer, src/flight-client
```

`src/index.js` exports everything (renderer APIs + bridge internals). The example app bypasses the package exports entirely, importing from deep paths like `../../packages/react-dom-native/src/renderer/index`.

## Target State

Mirror react-dom's four entry points with environment-specific server variants:

```
react-dom-native              → shared APIs (flushSync, version)
react-dom-native/client       → createRoot, hydrateRoot
react-dom-native/server       → conditional: resolves to server.node.js by default
react-dom-native/server.node    → renderToPipeableStream (real implementation)
react-dom-native/server.browser → stub (throws)
react-dom-native/server.edge    → stub (throws)
react-dom-native/server.bun     → stub (throws)
react-dom-native/server.native  → stub (throws) — native client environment
react-dom-native/static       → prerender, prerenderToNodeStream (stubs)
```

### Environment Variants

Mirrors react-dom's pattern of `server.node.js`, `server.browser.js`, `server.edge.js`, `server.bun.js`. Each file is both a conditional export target (resolved automatically by `"./server"` based on runtime conditions) and a direct import path (e.g. `react-dom-native/server.node`).

| File | Status | APIs |
|------|--------|------|
| `server.node.js` | Real | `renderToPipeableStream` — Node.js pipeable streams (existing Fizz implementation) |
| `server.browser.js` | Stub | Throws "not yet implemented" |
| `server.edge.js` | Stub | Throws "not yet implemented" |
| `server.bun.js` | Stub | Throws "not yet implemented" |
| `server.native.js` | Stub | Throws "not yet implemented" — for on-device rendering in the JSC runtime |

`server.native.js` is new to react-dom-native (no react-dom equivalent). It's the entry point when server APIs are imported from the native iOS client context.

## Detailed Export Map

### `react-dom-native` (root)

Shared APIs available in both client and server contexts.

```js
// react-dom-native
export { flushSync } from './client/ReactDOMNativeClient';
export { version } from './shared/version';
```

**Rationale**: react-dom's root entry exports `flushSync`, `createPortal`, resource hints (`prefetchDNS`, `preconnect`, `preload`, `preinit`, etc.), and `useFormStatus`/`useFormState`. For native:
- `flushSync` — useful, forward from reconciler
- `createPortal` — skip for now (no portal target in native)
- Resource hints (`prefetchDNS`, `preconnect`, `preload`, `preinit`) — skip (no document head)
- `useFormStatus`/`useFormState` — skip for now (no native form actions yet)
- `requestFormReset` — skip (no native forms)
- `unstable_batchedUpdates` — skip (legacy, no-op in React 18+)
- `__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` — skip (we have `$$` bridge globals)

### `react-dom-native/client`

Client-side rendering APIs, used in the native app's JS runtime.

```js
// react-dom-native/client
export { createRoot, hydrateRoot } from './ReactDOMNativeClient';
export { version } from '../shared/version';
```

| API | Description |
|-----|-------------|
| `createRoot(nativeRootView)` | Creates a concurrent root for client-side rendering |
| `hydrateRoot(nativeRootView, initialElement, options?)` | Hydrates SSR-rendered native tree |
| `version` | Package version string |

### `react-dom-native/server`

Bare `react-dom-native/server` resolves via conditional exports to the right environment file. Consumers can also import a specific variant directly (e.g. `react-dom-native/server.node`).

#### `react-dom-native/server.node` (real implementation)

Streaming SSR API used by the Express SSR server.

```js
// react-dom-native/server.node
export { renderToPipeableStream } from './server/NativeFizzServerNode';
export { version } from './shared/version';
```

| API | Description |
|-----|-------------|
| `renderToPipeableStream(children, options?)` | Streaming SSR to Node.js Writable (Fizz) |
| `version` | Package version string |

**Options** (same shape as react-dom):
```ts
{
  onShellReady?: () => void,
  onShellError?: (error: mixed) => void,
  onAllReady?: () => void,
  onError?: (error: mixed) => ?string,
  progressiveChunkSize?: number,
}
```

#### `react-dom-native/server.browser` (stub)

Throws: `'react-dom-native/server.browser is not yet implemented.'`

#### `react-dom-native/server.edge` (stub)

Throws: `'react-dom-native/server.edge is not yet implemented.'`

#### `react-dom-native/server.bun` (stub)

Throws: `'react-dom-native/server.bun is not yet implemented.'`

#### `react-dom-native/server.native` (stub)

Throws: `'react-dom-native/server.native is not yet implemented.'`

For on-device rendering in the native JSC runtime. No react-dom equivalent.

### `react-dom-native/static`

Stubs for react-dom's static prerendering APIs. All functions throw "not yet implemented" errors. The entry point exists so the API surface matches react-dom and consumers get a clear error instead of a missing module.

```js
// react-dom-native/static
export { prerender, prerenderToNodeStream } from './NativeFizzStaticNode';
export { version } from '../shared/version';
```

| API | Status |
|-----|--------|
| `prerender(children, options?)` | Stub — throws "not yet implemented" |
| `prerenderToNodeStream(children, options?)` | Stub — throws "not yet implemented" |
| `version` | Package version string |

## File Structure

```
packages/react-dom-native/
├── package.json                          # exports map with conditional server resolution
├── src/
│   ├── index.js                          # root entry: "react-dom-native"
│   ├── client.js                         # client entry: "react-dom-native/client"
│   ├── server.js                         # server entry: "react-dom-native/server" (re-exports server.node)
│   ├── server.node.js                    # "react-dom-native/server.node" — real implementation
│   ├── server.browser.js                 # "react-dom-native/server.browser" — stub
│   ├── server.edge.js                    # "react-dom-native/server.edge" — stub
│   ├── server.bun.js                     # "react-dom-native/server.bun" — stub
│   ├── server.native.js                  # "react-dom-native/server.native" — stub
│   ├── static.js                         # static entry: "react-dom-native/static" — stub
│   ├── shared/
│   │   └── version.js                    # exports { version }
│   ├── client/
│   │   └── ReactDOMNativeClient.js       # createRoot, hydrateRoot, flushSync
│   ├── server/
│   │   ├── NativeFizzServerNode.js       # renderToPipeableStream (existing)
│   │   ├── NativeFizzStaticNode.js       # stubs: prerender, prerenderToNodeStream
│   │   └── NativeFizzConfig.js           # Fizz host config (existing)
│   ├── bridge/
│   │   └── index.js                      # bridge internals (not exported from package)
│   ├── renderer/
│   │   ├── HostConfig.js                 # reconciler host config (not exported)
│   │   └── renderer.js                   # reconciler instance (internal)
│   └── devtools/
│       └── ...                           # devtools setup (not exported)
```

## package.json Exports Map

```json
{
  "name": "react-dom-native",
  "version": "0.0.1",
  "exports": {
    ".": "./src/index.js",
    "./client": "./src/client.js",
    "./server": {
      "workerd": "./src/server.edge.js",
      "bun": "./src/server.bun.js",
      "worker": "./src/server.browser.js",
      "node": "./src/server.node.js",
      "edge-light": "./src/server.edge.js",
      "browser": "./src/server.browser.js",
      "default": "./src/server.node.js"
    },
    "./server.node": "./src/server.node.js",
    "./server.browser": "./src/server.browser.js",
    "./server.edge": "./src/server.edge.js",
    "./server.bun": "./src/server.bun.js",
    "./server.native": "./src/server.native.js",
    "./static": "./src/static.js",
    "./package.json": "./package.json"
  }
}
```

The `"./server"` entry uses conditional exports matching react-dom's pattern — bundlers/runtimes resolve to the correct environment file automatically. Each variant is also available as a direct import (e.g. `react-dom-native/server.node`).

`server.native` is not in the `"./server"` conditionals because there's no standard `"native"` condition in Node.js/bundlers — it must be imported explicitly.

## Migration Steps

### 1. Create `src/shared/version.js`

```js
exports.version = '0.0.1';
```

### 2. Create `src/client/ReactDOMNativeClient.js`

Move `createRoot` and `hydrateRoot` from `src/renderer/renderer.js` into this file. Add `flushSync` forwarded from the reconciler. Keep `src/renderer/renderer.js` as an internal module that creates and configures the reconciler instance — `ReactDOMNativeClient.js` imports from it.

### 3. Create `src/client.js`

```js
'use strict';
exports.createRoot = require('./client/ReactDOMNativeClient').createRoot;
exports.hydrateRoot = require('./client/ReactDOMNativeClient').hydrateRoot;
exports.version = require('./shared/version').version;
```

### 4. Create server entry points

**`src/server.js`** — default entry, re-exports `server.node`:

```js
'use strict';
module.exports = require('./server.node');
```

**`src/server.node.js`** — real implementation:

```js
'use strict';
exports.renderToPipeableStream = require('./server/NativeFizzServerNode').renderToPipeableStream;
exports.version = require('./shared/version').version;
```

**`src/server.browser.js`**, **`src/server.edge.js`**, **`src/server.bun.js`**, **`src/server.native.js`** — stubs:

Each follows the same pattern (with the appropriate name in the error message):

```js
'use strict';
throw new Error('react-dom-native/server.browser is not yet implemented.');
```

### 5. Create `src/server/NativeFizzStaticNode.js`

Stub file exporting `prerender` and `prerenderToNodeStream`. Each function throws an error:

```js
'use strict';

function prerender() {
  throw new Error('react-dom-native/static prerender is not yet implemented.');
}

function prerenderToNodeStream() {
  throw new Error('react-dom-native/static prerenderToNodeStream is not yet implemented.');
}

exports.prerender = prerender;
exports.prerenderToNodeStream = prerenderToNodeStream;
```

### 6. Create `src/static.js`

```js
'use strict';
exports.prerender = require('./server/NativeFizzStaticNode').prerender;
exports.prerenderToNodeStream = require('./server/NativeFizzStaticNode').prerenderToNodeStream;
exports.version = require('./shared/version').version;
```

### 7. Update `src/index.js` (root entry)

```js
'use strict';
// react-dom-native — shared APIs
exports.flushSync = require('./client/ReactDOMNativeClient').flushSync;
exports.version = require('./shared/version').version;
```

Stop re-exporting bridge internals from the root. Bridge constants are internal implementation details.

### 8. Update `package.json` exports

Replace the current exports map with the four-tier map above. Remove the internal `./src/renderer/renderer` and `./src/flight-client/client` exports.

### 9. Update consumers

- `example/src/entry.js` — change `require('../../packages/react-dom-native/src/renderer/index')` to `require('react-dom-native/client')` (or relative path equivalent)
- `example/server/ssr-server.js` — already uses `require('react-dom-native/server')`, no change needed
- Internal imports within the package (bridge, renderer, host config) continue using relative paths — they're not public API

## What This Does NOT Change

- **Existing APIs unchanged** — `createRoot`, `hydrateRoot`, `renderToPipeableStream` keep same behavior
- **Internal modules stay internal** — bridge, host config, devtools, flight-client remain importable via relative paths within the package but are not in the exports map
- **Server component restrictions** — not needed yet (no `react-server` conditional export). Can add error-throwing stubs later when RSC bundler integration matures

## What's New

- **Server environment variants** — `server.node.js` (real), `server.browser.js`, `server.edge.js`, `server.bun.js` (stubs) matching react-dom's pattern, plus `server.native.js` (stub) for the native client
- **`react-dom-native/static`** — new entry point with `prerender` and `prerenderToNodeStream` stubs
