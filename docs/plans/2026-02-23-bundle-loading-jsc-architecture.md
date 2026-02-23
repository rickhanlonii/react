# Bundle Loading & JSC Architecture Deep Dive

## Overview

Falcon uses a single-bundle, single-JSContext architecture. One framework bundle is
evaluated in one JavaScriptCore context per Root. Client component modules are fetched
on-demand during Flight stream parsing and evaluated in the same global scope.

---

## 1. JSC Instance Architecture

```
┌─────────────────────────────────────────────────────────┐
│  JSVirtualMachine (implicit, Apple-managed)              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  JSContext ("Falcon — react-dom-native")            │  │
│  │                                                     │  │
│  │  globalThis                                         │  │
│  │  ├── React              (from framework bundle)     │  │
│  │  ├── __REACT_DOM_NATIVE__  (public API)             │  │
│  │  ├── __REACT_DEVTOOLS_GLOBAL_HOOK__                 │  │
│  │  ├── __module           (temp, on-demand modules)   │  │
│  │  │                                                  │  │
│  │  │  ── Bridge Functions (registered by Swift) ──    │  │
│  │  ├── $$createNode()                                 │  │
│  │  ├── $$appendChild()                                │  │
│  │  ├── $$completeRoot()                               │  │
│  │  ├── $$fetch()                                      │  │
│  │  ├── $$registerEventHandler()                       │  │
│  │  ├── $$setTimeout / $$setInterval / $$clearTimeout  │  │
│  │  ├── $$sendInspectorMessage()                       │  │
│  │  └── $$reportUncaughtException()                    │  │
│  │                                                     │  │
│  │  ── Surfaces (multiple, shared context) ──          │  │
│  │  Surface 1 (demo app)                               │  │
│  │  Surface 100 (LayoutCompare e2e)                    │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Key constraints:**
- `JSVirtualMachine` is never explicitly created — Apple provides a default one
- One `JSContext` per `Root` (1:1 relationship)
- All surfaces within a Root share the same JSContext — no isolation
- All JS execution is main-thread only (JSContext is not thread-safe)
- Safari Web Inspector available in DEBUG builds (iOS 16.4+)

---

## 2. Object Ownership Hierarchy

```
FalconApp
└── FixtureViewController
    └── Root                        (1 per view controller)
        ├── JSRuntime               (1 per Root, owns the engine)
        │   ├── JavaScriptCoreEngine  (1 per runtime, wraps JSContext)
        │   │   └── JSContext         (the single JS execution environment)
        │   └── Bindings              (bridge functions + surface state)
        │       ├── nodeRegistry      [Int: ShadowNodeWrapper]
        │       ├── currentTrees      [surfaceId: [ShadowNodeWrapper]]
        │       └── rootViews         [surfaceId: UIView]
        └── HotReloadClient         (WebSocket to dev server, DEBUG only)
```

---

## 3. Bundle Types & Build System

There are two distinct bundle types, built at different times:

```
┌──────────────────────────────────────────────────────────────┐
│  FRAMEWORK BUNDLE (built at dev-time by esbuild)             │
│                                                               │
│  Entry: packages/react-dom-native/src/entry.js                │
│  Output: ios/Sources/ReactDomNativeKit/Resources/bundle.js    │
│  Format: IIFE (self-executing closure)                        │
│  Size: ~882KB (dev, with sourcemaps)                          │
│                                                               │
│  Contains:                                                    │
│  ├── DevTools shims & polyfills (must load first)             │
│  ├── React (the react package)                                │
│  ├── react-reconciler (custom host config)                    │
│  ├── Flight client (RSC wire protocol parser)                 │
│  ├── Bridge helpers ($$fetch wrappers, event handling)        │
│  └── Global API (__REACT_DOM_NATIVE__)                        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  CLIENT COMPONENT MODULES (built on-demand by RSC server)    │
│                                                               │
│  Entry: example/server/src/components/*.jsx (each file)       │
│  Output: served at /modules/:file.js (not written to disk)    │
│  Format: IIFE with globalName: '__module'                     │
│                                                               │
│  Built when Flight client encounters an I (import) row:       │
│  ├── esbuild compiles JSX on-the-fly                          │
│  ├── React aliased to globalThis.React (from framework)       │
│  ├── Evaluated via (0, eval)(code) in global scope            │
│  └── Export stored in module cache, keyed by URL              │
│                                                               │
│  Examples: Counter.jsx, TextInput.jsx, FormControls.jsx       │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Initial Load Sequence

```
Time ──────────────────────────────────────────────────────────►

  iOS App Launch
  │
  ▼
  FixtureViewController.viewDidLoad()
  │
  ├─ Root.devBundleURL = "http://localhost:6000/bundle.js"
  │
  ├─ root = createRoot(view)
  │  │
  │  ▼
  │  Root.init()
  │  └─ JSRuntime.init()
  │     ├─ JavaScriptCoreEngine()    ← JSContext created here
  │     │  ├─ context.isInspectable = true (DEBUG, iOS 16.4+)
  │     │  └─ context.name = "Falcon — react-dom-native"
  │     ├─ Register exception handler
  │     ├─ Register console.log/warn/error
  │     └─ Bindings.init(engine)
  │        └─ Register all $$ bridge functions
  │
  ├─ renderAndHydrate()
  │  │
  │  ▼
  │  root.render(serverURL)
  │  │
  │  ├─[1] Resolve bundle URL
  │  │     DEBUG → http://localhost:6000/bundle.js
  │  │     RELEASE → Bundle.module.url("bundle.js")
  │  │
  │  ├─[2] Fetch bundle (URLSession)
  │  │     GET http://localhost:6000/bundle.js
  │  │     ← 882KB JavaScript source
  │  │
  │  ├─[3] Evaluate bundle
  │  │     engine.evaluate(source, sourceURL: bundleURL)
  │  │     │
  │  │     │  ── Inside the IIFE ──────────────────────
  │  │     ├─ DevToolsHookShim (sets global hook)
  │  │     ├─ PerformancePolyfill (performance.now/mark)
  │  │     ├─ ConsoleTimeStamp (console.timeStamp)
  │  │     ├─ ConsoleForwarding
  │  │     ├─ RuntimeAgent, NetworkAgent, ExceptionReporter
  │  │     ├─ ReactDevToolsAgent
  │  │     ├─ InspectorMessageHandler
  │  │     ├─ globalThis.React = React
  │  │     ├─ Create reconciler (react-reconciler + HostConfig)
  │  │     ├─ $$registerEventHandler(dispatcher)
  │  │     └─ globalThis.__REACT_DOM_NATIVE__ = { ... }
  │  │     │  ─────────────────────────────────────────
  │  │
  │  ├─[4] Call into JS to render
  │  │     __REACT_DOM_NATIVE__.hydrateFromURL(fixtureURL, opts)
  │  │     │
  │  │     ├─ $$fetch("/fixtures/06-kitchen-sink", headers)
  │  │     │  └─ Swift URLSession → GET RSC server
  │  │     │     ← Flight wire format (streaming)
  │  │     │
  │  │     ├─ Flight client parses rows:
  │  │     │  ├─ I row → preloadModule() → $$fetch("/modules/Counter.js")
  │  │     │  │  └─ Server builds component IIFE on-the-fly
  │  │     │  │  └─ (0, eval)(code) → globalThis.__module
  │  │     │  ├─ M/D rows → element tree construction
  │  │     │  └─ E row → stream complete
  │  │     │
  │  │     └─ reconciler.createHydrationContainer()
  │  │        └─ React renders → HostConfig calls → $$ bridge → UIKit
  │  │
  │  └─[5] Views appear on screen
  │
  └─ startDevReloadPolling()  (DEBUG only)
     └─ Timer every 2.0s → GET /bundle-version
```

---

## 5. Hot Reload Architecture

Two independent reload detection mechanisms run in parallel:

```
┌─────────────────────────────────────────────────────────┐
│  Developer saves file                                    │
│  (packages/react-dom-native/src/** or example/**)        │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  chokidar file watcher       │
│  (example/scripts/watcher.js)│
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  esbuild rebuild             │
│  (example/scripts/builder.js)│
│  Rebuilds bundle.js (~100ms) │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  ┌──────────┐    ┌──────────────────┐
  │ WebSocket│    │ Version endpoint │
  │ (port    │    │ /bundle-version  │
  │  8082)   │    │ (port 6000)      │
  └────┬─────┘    └────────┬─────────┘
       │                   │
       │ {type: 'reload'}  │ {version: mtimeMs}
       │ (push, immediate) │ (poll, every 2s)
       ▼                   ▼
  ┌──────────┐    ┌──────────────────┐
  │ HotReload│    │ Polling timer in │
  │ Client   │    │ FalconApp.swift  │
  │ (Swift)  │    │ (Swift)          │
  └────┬─────┘    └────────┬─────────┘
       │                   │
       └───────┬───────────┘
               │
               ▼  root.reload(serverURL:)
  ┌──────────────────────────────────────┐
  │  1. Unregister surface               │
  │  2. Remove all subviews              │
  │  3. Disconnect hot reload client     │
  │  4. runtime = nil (old JSContext     │
  │     deallocated, GC'd)               │
  │  5. runtime = JSRuntime() (NEW       │
  │     JSContext created)               │
  │  6. Re-register bridge functions     │
  │  7. Fetch + evaluate new bundle.js   │
  │  8. Call renderFromURL/hydrateFromURL│
  │  9. Reconnect hot reload client      │
  └──────────────────────────────────────┘
```

**Important:** Hot reload is NOT incremental. The old JSContext is fully discarded and a
new one is created. All JS state is lost. This is a full "cold reload" with a fresh
context.

---

## 6. Can Multiple Bundles / JSC Instances Run?

### Current State: No

The current architecture is strictly single-bundle, single-JSContext:

```
┌────────────────────────────────────────────────┐
│  Current: 1 Root = 1 JSRuntime = 1 JSContext   │
│                                                 │
│  Root ──── JSRuntime ──── JSContext              │
│                │                                │
│                └── Bindings (all surfaces)       │
│                    ├── Surface 1                 │
│                    └── Surface 100               │
└────────────────────────────────────────────────┘
```

### Theoretically Possible: Yes, With Constraints

The architecture could support multiple JSC instances because:

1. **JSContext() allocates an implicit JSVirtualMachine.** Each `new JSContext()` call
   creates a new VM. Multiple Roots would get independent VMs with no shared GC or
   object graph.

2. **Surfaces are integer-keyed.** The Bindings layer already supports multiple surfaces
   per context. Multiple contexts would each have their own surface namespace.

3. **Bridge functions are per-context.** Each JSRuntime registers its own `$$createNode`,
   `$$fetch`, etc. on its own JSContext. No globals leak between contexts.

However, there are blocking constraints:

| Constraint | Detail |
|---|---|
| **Main thread only** | All JSC operations must run on the main thread. Multiple contexts would execute serially, not in parallel. |
| **No JSVirtualMachine sharing** | Objects can't be passed between contexts on different VMs. Each context is fully isolated. |
| **Single event handler** | `$$registerEventHandler` sets one global handler. Multiple contexts would need separate event routing. |
| **globalThis.React** | Client component modules reference `globalThis.React`. In a shared context this works; in separate contexts, each would need its own copy of React. |
| **Module cache** | Flight client module cache is per-context (closured in the IIFE). No module sharing between contexts. |

### Multi-Context Diagram (hypothetical)

```
┌──────────────────────────────────────────────────────────┐
│  Hypothetical: N Roots = N JSRuntimes = N JSContexts     │
│                                                           │
│  ┌─────────────────────────┐  ┌────────────────────────┐ │
│  │  Root A                  │  │  Root B                 │ │
│  │  ├── JSRuntime A         │  │  ├── JSRuntime B        │ │
│  │  │   ├── JSContext A     │  │  │   ├── JSContext B    │ │
│  │  │   │   ├── React       │  │  │   │   ├── React     │ │
│  │  │   │   ├── $$fetch     │  │  │   │   ├── $$fetch   │ │
│  │  │   │   └── modules{}   │  │  │   │   └── modules{} │ │
│  │  │   └── Bindings A      │  │  │   └── Bindings B    │ │
│  │  │       └── Surface 1   │  │  │       └── Surface 2 │ │
│  │  └── HotReloadClient A   │  │  └── HotReloadClient B │ │
│  └─────────────────────────┘  └────────────────────────┘ │
│                                                           │
│  ✗ No object sharing between contexts                     │
│  ✗ Serial execution (both on main thread)                 │
│  ✗ Duplicate React copies (~882KB × N)                    │
│  ✗ Duplicate bridge registrations                         │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Data Flow: Server → Screen

```
┌───────────┐     ┌───────────┐     ┌───────────────────┐
│ Developer │     │  esbuild  │     │  RSC Server        │
│ writes    │────►│  watcher  │     │  (Express :6000)   │
│ JSX/Swift │     └─────┬─────┘     │                    │
│           │           │           │  /bundle.js        │
└───────────┘     ┌─────▼─────┐     │  /fixtures/:name   │
                  │ bundle.js │     │  /modules/:file    │
                  │ (882KB)   │     │  /bundle-version   │
                  └─────┬─────┘     └──────┬─────────────┘
                        │                  │
          ┌─────────────┘                  │
          │                                │
          ▼                                ▼
┌─────────────────────────────────────────────────────────┐
│  Native iOS App                                          │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  URLSession                                          │ │
│  │  ├── GET /bundle.js → source string                  │ │
│  │  ├── GET /fixtures/:name → Flight stream (chunked)   │ │
│  │  └── GET /modules/:file → component IIFE             │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │  JSContext                                           │ │
│  │  ├── evaluate(bundle.js)                             │ │
│  │  │   └─ sets up React, reconciler, bridge, Flight    │ │
│  │  ├── Flight client parses RSC stream                 │ │
│  │  │   └─ eval() client component modules              │ │
│  │  ├── React reconciler runs                           │ │
│  │  │   └─ calls HostConfig → $$ bridge functions       │ │
│  │  └── Bridge calls cross into Swift ──────────────┐   │ │
│  └──────────────────────────────────────────────────┼───┘ │
│                                                     │     │
│  ┌──────────────────────────────────────────────────▼───┐ │
│  │  Shadow Tree (Swift)                                  │ │
│  │  ├── ShadowNode tree built from $$ mutations          │ │
│  │  ├── Yoga layout calculated                           │ │
│  │  └── completeRoot() → commit to UIKit ───────────┐   │ │
│  └──────────────────────────────────────────────────┼───┘ │
│                                                     │     │
│  ┌──────────────────────────────────────────────────▼───┐ │
│  │  UIKit View Hierarchy                                 │ │
│  │  ├── UIView (div) with Yoga-computed frames           │ │
│  │  ├── UILabel (#text) with inherited styles            │ │
│  │  └── ... rendered on screen                           │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Client Component Module Loading

When the Flight stream references a client component, the following sequence occurs
within the already-running JSContext:

```
Flight stream:  I:1,"Counter",[],"default"
                │
                ▼
Flight client:  resolveClientReference("http://localhost:6000", metadata)
                → {url: "/modules/Counter.js", name: "default"}
                │
                ▼
                preloadModule(ref)
                │
                ├── Check module cache → miss
                │
                ├── $$fetch("/modules/Counter.js", {}, callback)
                │   │
                │   ▼  (Swift side)
                │   URLSession.shared.dataTask(GET /modules/Counter.js)
                │   │
                │   ▼  (RSC server side)
                │   esbuild.build({
                │     entryPoints: ["components/Counter.jsx"],
                │     format: "iife",
                │     globalName: "__module",
                │     alias: { react: "react-shim.js" }  // → globalThis.React
                │   })
                │   │
                │   ▼  (back in Swift → JS callback)
                │   callback("data", iife_source)
                │   callback("end", "")
                │
                ├── (0, eval)(iife_source)
                │   └── Executes in global scope
                │   └── Sets globalThis.__module = { default: CounterComponent }
                │
                └── Cache: modules[url] = { status: "fulfilled", value: __module }
                │
                ▼
Flight client:  requireModule(ref)
                → modules[url].value["default"]
                → CounterComponent function
                │
                ▼
React:          <CounterComponent /> rendered by reconciler
```

---

## 9. Key Source Files

| File | Purpose |
|---|---|
| `ios/Sources/JSEngine/JavaScriptCoreEngine.swift` | JSContext creation, evaluate(), exception handling |
| `ios/Sources/JSEngine/JSEngine.swift` | Abstract engine protocol |
| `ios/Sources/ReactDomNativeKit/Root.swift` | Bundle resolution, loading, render/reload lifecycle |
| `ios/Sources/ReactDomNativeKit/JSRuntime.swift` | Creates engine + bindings, registers polyfills |
| `ios/Sources/ReactDomNativeKit/CreateRoot.swift` | Public `createRoot()` API |
| `ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` | All $$ bridge functions, surface registry |
| `ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift` | WebSocket reload client |
| `src/entry.js` | Framework bundle entry — DevTools, React, global API |
| `src/renderer/renderer.js` | Reconciler setup, event handler registration |
| `src/bridge/index.js` | Bridge constants (event priorities) |
| `src/flight-client/index.js` | createFromFetch, fetchRSC public API |
| `src/flight-client/http.js` | $$fetch wrapper, stream abstraction |
| `src/flight-client/config.js` | Module loading, caching, eval |
| `example/Falcon/Falcon/FalconApp.swift` | App entry, polling, fixture navigation |
| `example/scripts/dev.js` | Dev orchestrator (builder + watcher + servers) |
| `example/server/server.js` | RSC server, /bundle.js, /modules/:file, /fixtures/:name |
