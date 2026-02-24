# react-dom-native Architecture

## Public API

react-dom-native exposes four entry points:

```
react-dom-native           → createRoot, hydrateRoot, bridge globals, Flight client
react-dom-native/server    → renderToPipeableStream (Fizz)
```

### Client API (`react-dom-native`)

| Export | Description |
|--------|-------------|
| `createRoot({surfaceId})` | Create a concurrent React root for client-side rendering |
| `hydrateRoot({surfaceId}, element, options)` | Create a hydration root to attach React to SSR-rendered native views |
| `createResponse(origin)` | Create a Flight response parser |
| `getRoot(response)` | Get the root promise from a parsed response |
| `processRow(response, id, tag, data)` | Process a single parsed row |
| `getOrCreateChunk(response, id)` | Get or create a chunk in a response |
| `resolveChunk(chunk, value)` | Resolve a pending chunk with a value |
| `rejectChunk(chunk, error)` | Reject a pending chunk with an error |
| `close(response)` | Signal stream end |
| `reportGlobalError(response, error)` | Signal a stream error |
| `fetchWithBridge(url, options)` | Generic HTTP fetch via the native bridge |
| `callServer(actionId, args, options)` | Invoke a server action |

Bridge globals (called by Swift, registered on `globalThis`):

| Global | Description |
|--------|-------------|
| `$$createFlightResponse(serverURL)` | Create a Flight response, return integer responseId |
| `$$processFlightRow(responseId, id, tag, data)` | Dispatch a parsed row to the JS Flight client |
| `$$resolveFlightModule(responseId, chunkId, exports, exportName)` | Resolve a module chunk with evaluated exports |
| `$$rejectFlightModule(responseId, chunkId, errorMessage)` | Reject a module chunk on fetch/eval failure |
| `$$closeFlightResponse(responseId)` | Signal stream complete |
| `$$reportFlightError(responseId, errorMessage)` | Report transport-level error |

Native API (called by Swift via `globalThis.__REACT_DOM_NATIVE__`):

| Method | Description |
|--------|-------------|
| `renderFromStream(surfaceId, responseId)` | CSR: create root, subscribe to Flight response, render when resolved |
| `hydrateFromStream(surfaceId, responseId)` | SSR: subscribe to Flight response, hydrateRoot in startTransition |
| `render(element, rootViewHandle)` | Direct element render (no Flight) |

### Server API (`react-dom-native/server`)

| Export | Description |
|--------|-------------|
| `renderToPipeableStream(children, options)` | Render React elements to a native instruction stream via Fizz |

Options: `onShellReady`, `onShellError`, `onAllReady`, `onError` — same shape as `ReactDOMServer.renderToPipeableStream`.

Returns: `{pipe(destination), abort(reason)}`

---

## Comparison to react-dom

```
┌─────────────────────────┬──────────────────────────┬──────────────────────────┐
│                         │ react-dom                │ react-dom-native         │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Reconciler mode         │ Mutation                 │ Persistent (clone-on-    │
│                         │                          │ write, like Fabric)      │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Render target           │ Browser DOM              │ UIKit via Yoga layout    │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ createRoot              │ createRoot(domNode)      │ createRoot({surfaceId})  │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ hydrateRoot             │ hydrateRoot(domNode, el) │ hydrateRoot({surfaceId}, │
│                         │                          │ el, options)             │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ SSR output              │ HTML string/stream       │ JSON-line native         │
│                         │                          │ instruction stream       │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Flight bundler          │ react-server-dom-webpack  │ Swift parser +          │
│ integration             │ react-server-dom-esm     │ JSEngine.evaluate()      │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Module loading          │ Webpack chunks / ESM     │ Swift URLSession fetch   │
│                         │ imports                  │ + JSEngine.evaluate()    │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Stream parsing          │ Browser fetch() +        │ Swift URLSession         │
│                         │ ReadableStream           │ delegate + native parser │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Event dispatch          │ Synthetic events +       │ Bridge callback with     │
│                         │ event delegation         │ discrete updates         │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ JS engine               │ Browser engine (V8, JSC) │ JavaScriptCore (native   │
│                         │                          │ Swift API)               │
├─────────────────────────┼──────────────────────────┼──────────────────────────┤
│ Platform                │ Browser                  │ iOS (UIKit)              │
└─────────────────────────┴──────────────────────────┴──────────────────────────┘
```

### API surface differences

**Same:** `createRoot`, `hydrateRoot`, `renderToPipeableStream` — the top-level API shapes are intentionally identical to react-dom so the mental model transfers.

**Different:**
- Root container is `{surfaceId: number}` instead of a DOM node
- No `createPortal`, `flushSync`, `findDOMNode`, `unmountComponentAtNode`
- No synthetic event system — events dispatch directly from Swift through the bridge
- No `react-dom/client` or `react-dom/server` sub-paths (uses `react-dom-native` and `react-dom-native/server`)
- SSR produces native instructions instead of HTML
- Flight stream parsing and module loading happen in Swift, not JS

---

## How Flight (RSC) is Consumed

```
                    ┌───────────────────────────────┐
                    │        RSC Server (6000)       │
                    │                                │
                    │  react-server-dom-webpack      │
                    │  renderToPipeableStream()      │
                    │                                │
                    │  'use client' → client refs    │
                    │  Server components → elements  │
                    └──────────┬────────────────────┘
                               │
                     Flight wire protocol
                     (text/x-component)
                               │
                    ┌──────────▼────────────────────┐
                    │     Native iOS Client          │
                    │                                │
                    │  Swift: FlightStreamClient      │
                    │  (row parser state machine)    │
                    │         │                      │
                    │         ▼                      │
                    │  Row dispatch:                  │
                    │  • 'I' (module) → Swift handles │
                    │    natively (fetch + evaluate)  │
                    │  • All others → JS via bridge   │
                    │    $$processFlightRow()         │
                    │                                │
                    │  JS: Flight client (client.js)  │
                    │  Row types (handled in JS):     │
                    │  • Model (no tag) → JSON        │
                    │  • T → Text                    │
                    │  • H → Hint (no-op)            │
                    │  • E → Error                   │
                    │  • N → Time origin             │
                    │  • D → Debug info              │
                    │                                │
                    │  JSON reviver handles:          │
                    │  $  → react.element symbol      │
                    │  $L → react.lazy wrapper        │
                    │  $@ → promise ref               │
                    │  $S → Symbol.for()              │
                    │                                │
                    │         │                      │
                    │         ▼                      │
                    │  Module Resolution (Swift)      │
                    │                                │
                    │  URLSession.shared.dataTask     │
                    │  GET /modules/Counter.js        │
                    │  → IIFE bundle (esbuild)        │
                    │  → engine.evaluate(code,        │
                    │    sourceURL: url)              │
                    │  → globalThis.__module          │
                    │  → $$resolveFlightModule()      │
                    │                                │
                    │         │                      │
                    │         ▼                      │
                    │  React Element Tree             │
                    │  → createRoot().render()        │
                    │  → reconciler → bridge          │
                    │  → UIKit views                  │
                    └───────────────────────────────┘
```

### What runs in Swift vs JS

| Concern | Swift | JS |
|---------|-------|-----|
| HTTP streaming | URLSession data delegate | — |
| Row parsing | FlightStreamClient state machine | — |
| Module fetch + eval | URLSession + engine.evaluate(code, sourceURL:) | — |
| Module cache | Static `[String: ModuleCacheEntry]` | — |
| Row dispatch (module) | processModuleRow → $$resolveFlightModule | resolveChunk |
| Row dispatch (other) | $$processFlightRow → | processRow (JSON reviver, chunks, lazy wrappers) |
| Chunk management | — | Thenables, Suspense integration, lazy wrappers |
| JSON reviver | — | `$L`, `$@`, `$S` → JS objects |
| Performance profiling | — | console.timeStamp |
| Server actions | — | callServer via fetchWithBridge |

### Why Swift parses the stream

The Flight wire protocol is a character-by-character state machine: `ROW_ID` → `ROW_TAG` → `ROW_DATA` (or `ROW_LENGTH` → `ROW_BINARY` for binary tags). Each row is `<hex-id>:<tag><payload>\n`. Moving the parser to Swift provides:

1. **Native module evaluation** — `engine.evaluate(code, sourceURL: url)` instead of `(0, eval)(code)`. This matches how browsers handle `<script>` tags, giving proper source URLs in stack traces and debugger breakpoints.
2. **Native HTTP streaming** — URLSession data delegate processes chunks as they arrive, eliminating the JS `$$fetch` → callback bridge overhead.
3. **Module cache with GC protection** — Swift manages `JSValueRef` lifetimes with `protect()`/`unprotect()`, preventing client component exports from being garbage collected.

### Comparison to react-server-dom-webpack

| Aspect | react-server-dom-webpack | react-dom-native Flight client |
|--------|--------------------------|-------------------------------|
| Flight parser | Internal `react-client/flight` (unpublished) | Swift `FlightStreamClient` (native) |
| Module manifest | Webpack client manifest with chunk IDs | Server URL string |
| Module loading | `__webpack_require__` + chunk loading | Swift `URLSession` fetch + `engine.evaluate()` |
| Transport | Browser `fetch()` / `Response` | Swift `URLSession` data delegate |
| Resource hints | DOM `<link rel="preload">` | No-ops |
| Bundler coupling | Tight (webpack plugin generates manifest) | Loose (any server that serves IIFEs) |

### Response registry and lifecycle

The JS side maintains a `responses` map keyed by integer responseId. Lifecycle:

1. **Create:** Swift calls `$$createFlightResponse(serverURL)` → JS creates a Flight response object, stores in `responses[id]`, returns `id`
2. **Feed rows:** Swift parser calls `$$processFlightRow(id, rowId, tag, data)` for each parsed row (except module rows, handled natively)
3. **Resolve modules:** After fetching + evaluating a module, Swift calls `$$resolveFlightModule(id, chunkId, exports, exportName)` → JS resolves the chunk thenable
4. **Close:** Swift calls `$$closeFlightResponse(id)` when the HTTP stream ends. The response stays in the registry — module fetches may still be in-flight and need the response to resolve chunks.
5. **Error:** Swift calls `$$reportFlightError(id, message)` on transport errors. All pending chunks are rejected and the response is deleted from the registry.
6. **Cleanup:** On full reset, the entire JS context is destroyed, clearing the registry.

### Module loading flow

```
Flight stream contains: 3:I["Counter",[],"*"]

  1. Swift FlightStreamClient parses row → tag="I", id=3

  2. processModuleRow() parses JSON metadata:
     - Array format:  ["Counter", [], "*"]  → moduleId="Counter", exportName="*"
     - Object format: {"id":"Counter","chunks":[],"name":"*"} → same

  3. Build URL: serverOrigin + "/modules/Counter.js"

  4. Check module cache:
     ┌─────────────────────────────────────────────────┐
     │ Module Cache (static, shared across instances)  │
     │                                                 │
     │ .pending(callbacks)  → append callback, wait    │
     │ .resolved(exports)   → resolve immediately      │
     │ .rejected(error)     → reject immediately       │
     │ (not in cache)       → start fetch below        │
     └─────────────────────────────────────────────────┘

  5. URLSession.shared.dataTask(with: url):
     - Fetch /modules/Counter.js from RSC server
     - Server builds IIFE on-demand via esbuild:
       globalThis.__module = (function() { ... })()

  6. DispatchQueue.main.async:
     - engine.evaluate(code, sourceURL: url)
       (proper source URL → debugger breakpoints work)
     - engine.getGlobalProperty("__module")
     - engine.evaluate("delete globalThis.__module")
     - engine.protect(exports)  // prevent GC
     - Cache as .resolved(exports)

  7. Call $$resolveFlightModule(responseId, 3, exports, "*")
     → JS: getOrCreateChunk(response, 3)
     → JS: resolveChunk(chunk, exports.default || exports)
     → React renders the client component
```

---

## How Fizz (SSR) is Consumed

```
                    ┌───────────────────────────────┐
                    │        RSC Server (6000)       │
                    │                                │
                    │  Flight stream                 │
                    └──────────┬────────────────────┘
                               │
                    ┌──────────▼────────────────────┐
                    │       SSR Server (6001)        │
                    │                                │
                    │  1. Fetch Flight stream        │
                    │  2. Deserialize → React tree   │
                    │     (react-server-dom-webpack   │
                    │      /client.node)             │
                    │  3. Render through Fizz        │
                    │     (react-dom-native/server   │
                    │      .renderToPipeableStream)  │
                    │  4. Interleave Flight data     │
                    │     rows as ["D", row]         │
                    │                                │
                    │  Content-Type:                 │
                    │  application/x-native-ssr      │
                    └──────────┬────────────────────┘
                               │
                     JSON-line instruction stream
                               │
                    ┌──────────▼────────────────────┐
                    │     Native iOS Client          │
                    │                                │
                    │  Parse instructions:           │
                    │  ["O","div",{...}] → open elem │
                    │  ["T","hello"]     → text node │
                    │  ["C"]            → close elem │
                    │  ["B",id]    → suspense begin  │
                    │  ["/B"]      → suspense end    │
                    │  ["S",id]    → segment begin   │
                    │  ["/S"]      → segment end     │
                    │  ["X",id]    → reveal boundary │
                    │  ["R"]       → shell complete   │
                    │  ["P",id]    → placeholder     │
                    │  ["D",row]   → flight data     │
                    │  ["E",id,msg] → error boundary │
                    │                                │
                    │  Build UIKit tree from          │
                    │  instructions (before JS loads) │
                    │                                │
                    │  Buffer "D" rows for hydration  │
                    │                                │
                    │         │                      │
                    │         ▼                      │
                    │  Swift: hydrateSurface()        │
                    │  1. $$createFlightResponse()    │
                    │  2. hydrateFromStream()         │
                    │  3. FlightStreamClient replays  │
                    │     buffered "D" rows           │
                    │  4. client.close()              │
                    │  5. Module fetches complete     │
                    │     asynchronously              │
                    │                                │
                    │  JS: hydrateRoot() walks        │
                    │  existing native tree           │
                    │  $$setInstanceHandle() links    │
                    │  fibers ↔ ShadowNodes           │
                    │                                │
                    │  → App is interactive           │
                    └───────────────────────────────┘
```

### Fizz output format

Unlike react-dom's Fizz which produces HTML, react-dom-native's Fizz produces a JSON-line instruction stream. Each line is a JSON array with an instruction tag.

The Fizz config (`NativeFizzConfig.js`) implements the `ReactFizzConfig` + `ReactServerStreamConfig` interfaces. It uses a vendored copy of `react-server` (the Fizz core) since that package isn't published standalone.

Key differences from react-dom's Fizz:

| Aspect | react-dom Fizz | react-dom-native Fizz |
|--------|---------------|----------------------|
| Output format | HTML string stream | JSON-line instruction stream |
| Suspense fallbacks | Inline HTML + `<template>` | `["B",id]` / `["X",id]` instructions |
| Client JS | Inlined `<script>` for reveals | Swift processes instructions natively |
| Streaming | Chunked HTML | Chunked JSON lines |
| Hydration | Match against DOM | Match against ShadowNode tree |

### SSR → Hydration timeline

```
Time ──────────────────────────────────────────────────────►

Swift app starts
  │
  ├── Fetch SSR stream from :6001
  │     │
  │     ├── Process instructions → build UIKit views immediately
  │     │   (user sees content before JS loads)
  │     │
  │     └── Buffer "D" (Flight data) rows
  │
  ├── Evaluate bundle.js
  │     │
  │     └── React + reconciler + Flight client + bridge globals ready
  │
  └── hydrateSurface(surfaceId, serverURL, ssrData)
        │
        ├── $$createFlightResponse(serverURL) → responseId
        │
        ├── hydrateFromStream(surfaceId, responseId)
        │   └── hydrateRoot() subscribes to root chunk thenable
        │
        ├── FlightStreamClient replays buffered "D" rows
        │   (Swift parser → $$processFlightRow for each row)
        │   (Module 'I' rows trigger async URLSession fetches)
        │
        ├── client.close() signals stream end
        │
        ├── Module fetches complete asynchronously
        │   → engine.evaluate(code, sourceURL:)
        │   → $$resolveFlightModule() resolves chunks
        │   → React renders client components
        │
        ├── hydrateRoot() walks existing native tree
        │   $$getFirstSSRChild / $$getNextSSRSibling
        │
        ├── canHydrateInstance() matches types
        │
        ├── $$setInstanceHandle() links fibers ↔ ShadowNodes
        │   (enables event dispatch)
        │
        └── App is interactive
```

---

## Bundle Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Build Time (esbuild)                  │
│                                                         │
│  entry.js ──bundle──► bundle.js                         │
│    │                    │                               │
│    ├── DevTools polyfills                               │
│    │   (PerformanceTracer, ConsoleForwarding, CDP agents)│
│    ├── React (globalThis.React = React)                 │
│    ├── react-reconciler (persistent mode)               │
│    ├── Flight client (chunk management, JSON reviver)   │
│    ├── Bridge globals ($$createFlightResponse, etc.)    │
│    └── Render API (globalThis.__REACT_DOM_NATIVE__)     │
│         • renderFromStream(surfaceId, responseId)       │
│         • hydrateFromStream(surfaceId, responseId)      │
│         • render(element, rootViewHandle)               │
│                                                         │
│  Output: packages/.../ios/.../Resources/bundle.js       │
│  Format: IIFE, es2020, platform: neutral                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               Runtime (on-demand, per request)          │
│                                                         │
│  Server: GET /modules/Counter.js                        │
│    │                                                    │
│    └── esbuild.build({                                  │
│          entryPoints: [Counter.js],                     │
│          format: 'iife',                                │
│          globalName: '__module',                         │
│          alias: { react: 'react-shim.js' }              │
│            └── module.exports = globalThis.React         │
│        })                                               │
│                                                         │
│  Client: Flight "I" row triggers native module load     │
│    │                                                    │
│    ├── Swift: URLSession.shared.dataTask(with: url)     │
│    ├── Swift: engine.evaluate(code, sourceURL: url)     │
│    ├── Swift: engine.getGlobalProperty("__module")      │
│    ├── Swift: engine.protect(exports)  // prevent GC    │
│    ├── JS:   $$resolveFlightModule(id, chunk, exports)  │
│    └── Swift: delete globalThis.__module                │
│                                                         │
│  Why native evaluate? JSC has no ESM import(). Unlike   │
│  eval(), engine.evaluate(code, sourceURL:) provides     │
│  proper source URLs for debugger breakpoints and        │
│  stack traces — matching browser <script> behavior.     │
└─────────────────────────────────────────────────────────┘
```

### Why two bundle strategies?

**Framework bundle (build-time):** React, the reconciler, and the Flight client must be loaded synchronously before any rendering can happen. A single IIFE evaluated at startup is the simplest approach — no async loading, no module system.

**Client component modules (runtime):** Client components referenced by RSC are not known at build time. The server builds each on-demand as a self-contained IIFE that references `globalThis.React` (set by the framework bundle). This avoids:
- A bundler plugin or manifest (webpack/turbopack coupling)
- Pre-bundling all possible client components
- An ESM loader (JSC doesn't support `import()`)

---

## Bridge (JS ↔ Swift)

All communication uses `$$`-prefixed globals registered on the JSContext by `NativeBridge.swift`.

```
┌──────────────────────┐         ┌──────────────────────┐
│     JavaScript       │         │        Swift          │
│                      │         │                       │
│  Renderer bridge:    │         │                       │
│  $$createNode()  ────┼────►    │  ShadowNode.create()  │
│  $$createTextNode()──┼────►    │  ShadowNode(text:)    │
│  $$cloneNode*()  ────┼────►    │  ShadowNode.clone()   │
│  $$appendChild() ────┼────►    │  node.appendChild()   │
│  $$completeRoot()────┼────►    │  ShadowTree.commit()  │
│                      │         │  → Yoga layout        │
│                      │         │  → UIKit mutations     │
│                      │         │  → returns timings     │
│                      │         │                       │
│  Flight bridge:      │         │                       │
│  $$createFlight      │         │                       │
│    Response()  ◄─────┼────     │  FlightStreamClient   │
│  $$processFlightRow  │         │  parses stream, calls │
│    ()          ◄─────┼────     │  bridge globals       │
│  $$resolveFlightModule         │                       │
│    ()          ◄─────┼────     │  URLSession fetch +   │
│  $$rejectFlightModule          │  engine.evaluate()    │
│    ()          ◄─────┼────     │                       │
│  $$closeFlightResponse         │                       │
│    ()          ◄─────┼────     │                       │
│  $$reportFlightError │         │                       │
│    ()          ◄─────┼────     │                       │
│                      │         │                       │
│  Event bridge:       │         │                       │
│  $$registerEvent     │         │                       │
│    Handler(fn) ──────┼────►    │  stores handler ref   │
│                      │         │                       │
│  handler(handle,     │         │                       │
│    type, payload)  ◄─┼────     │  UIControl action     │
│                      │         │  → dispatch to JS     │
│                      │         │                       │
│  SSR bridge:         │         │                       │
│  $$setInstanceHandle ┼────►    │  links fiber to node  │
│  $$getFirstSSRChild  ┼────►    │  SSR tree traversal   │
│  $$getNextSSRSibling ┼────►    │                       │
│  $$getSSRChildOf     ┼────►    │                       │
└──────────────────────┘         └──────────────────────┘

Renderer calls are synchronous (JSC native API).
Flight calls are initiated by Swift (Swift → JS direction).
Event calls are initiated by Swift UIControl actions.
```

### Event handling

Events flow from Swift to JS through a single registered handler:

```
UIControl action fires (main thread)
  → Swift calls JS event handler via JSC
  → Handler looks up React fiber from instanceHandle
  → Maps event type ('click' → 'onClick')
  → Wraps in reconciler.discreteUpdates() (SyncLane)
  → Calls handler function from fiber props
  → reconciler.flushSyncWork()
  → Passive effects flush
```

Event handlers cannot cross the JSC bridge directly (functions are dropped by `toDictionary()`), so props sent to native replace handler functions with `true` canary values. The actual handler functions are retrieved from the React fiber during event dispatch.

---

## Full Data Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Developer   │    │  RSC Server │    │  SSR Server │
│  writes JSX  │    │  (6000)     │    │  (6001)     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │   Server         │                  │
       │   Components     │                  │
       │ ─────────────►   │                  │
       │                  │                  │
       │   'use client'   │  Flight stream   │
       │   Components     │ ────────────────►│
       │ ─────────────►   │                  │
       │                  │                  │ Deserialize
       │                  │                  │ Flight → elements
       │                  │                  │
       │                  │                  │ Fizz render
       │                  │                  │ → native instructions
       │                  │                  │
       │                  │                  │ Interleave Flight
       │                  │                  │ data as ["D", row]
       │                  │                  │
       ▼                  ▼                  ▼

 ┌──────────────────────────────────────────────────────┐
 │                    iOS App (Swift)                    │
 │                                                      │
 │  ┌─── Path A: Client Rendering ───────────────────┐ │
 │  │                                                 │ │
 │  │  1. Load bundle.js (framework + reconciler)     │ │
 │  │  2. renderSurface(surfaceId, serverURL)         │ │
 │  │  3. $$createFlightResponse(serverURL) → id      │ │
 │  │  4. renderFromStream(surfaceId, id)             │ │
 │  │  5. URLSession streams Flight from :6000        │ │
 │  │  6. Swift FlightStreamClient parses rows        │ │
 │  │     • Module rows: fetch + evaluate natively    │ │
 │  │     • Other rows: $$processFlightRow → JS       │ │
 │  │  7. React renders from resolved tree            │ │
 │  │  8. Reconciler → $$createNode → $$completeRoot  │ │
 │  │  9. Yoga layout → UIKit views → screen          │ │
 │  │                                                 │ │
 │  └─────────────────────────────────────────────────┘ │
 │                                                      │
 │  ┌─── Path B: SSR + Hydration ────────────────────┐ │
 │  │                                                 │ │
 │  │  1. Fetch SSR stream from :6001                 │ │
 │  │  2. Process instructions → UIKit tree           │ │
 │  │     (user sees content immediately)             │ │
 │  │  3. Buffer Flight data ("D") rows               │ │
 │  │  4. Load bundle.js                              │ │
 │  │  5. hydrateSurface(surfaceId, url, ssrData)     │ │
 │  │  6. $$createFlightResponse(url) → id            │ │
 │  │  7. hydrateFromStream(surfaceId, id)            │ │
 │  │  8. FlightStreamClient replays buffered rows    │ │
 │  │     • Module rows: fetch + evaluate natively    │ │
 │  │     • Other rows: $$processFlightRow → JS       │ │
 │  │  9. hydrateRoot() walks existing native views   │ │
 │  │ 10. $$setInstanceHandle links fibers to nodes   │ │
 │  │ 11. App is interactive                          │ │
 │  │                                                 │ │
 │  └─────────────────────────────────────────────────┘ │
 │                                                      │
 │  ┌─── Swift Flight Infrastructure ────────────────┐ │
 │  │                                                 │ │
 │  │  FlightStreamClient                             │ │
 │  │  • Row parser state machine (Swift)             │ │
 │  │  • Module fetch + evaluate (URLSession + JSC)   │ │
 │  │  • Static module cache with GC protection       │ │
 │  │                                                 │ │
 │  │  FlightStreamDelegate                           │ │
 │  │  • URLSession data delegate                     │ │
 │  │  • Feeds chunks to FlightStreamClient           │ │
 │  │  • Runs on main thread (JS must be main thread) │ │
 │  │                                                 │ │
 │  │  ReactRuntime                                   │ │
 │  │  • activeFlightClients tracking                 │ │
 │  │  • Module cache cleared on full reset           │ │
 │  │  • Flight streams cancelled on unmount/reset    │ │
 │  │                                                 │ │
 │  └─────────────────────────────────────────────────┘ │
 │                                                      │
 └──────────────────────────────────────────────────────┘
```

### Key files

| File | Purpose |
|------|---------|
| `src/entry.js` | JS entry point: response registry, bridge globals, renderFromStream/hydrateFromStream |
| `src/flight-client/client.js` | JS Flight client: chunk management, JSON reviver, processRow |
| `src/flight-client/config.js` | Flight client config: resolveClientReference, resolveServerReference |
| `src/flight-client/http.js` | HTTP utilities: fetchWithBridge, callServer |
| `ios/.../Flight/FlightStreamClient.swift` | Swift row parser + module loader |
| `ios/.../Flight/FlightStreamDelegate.swift` | URLSession data delegate for Flight streams |
| `ios/.../ReactRuntime.swift` | Runtime singleton: boot, surface management, render/hydrate orchestration |
