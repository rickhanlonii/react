# Plan 3: Replace Flight Client Fork with react-server-dom-webpack/client

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Use the JS instruction support (Plan 2) and ReadableStream polyfill (Plan 1) to deliver Flight data via `["JS", ...]` instructions instead of `["D", ...]` instructions, enabling `react-server-dom-webpack/client`'s `createFromReadableStream` to replace the custom 1400-line flight-client fork.

**Architecture:** The SSR server wraps Flight data rows in JS code that pushes to `self.__next_f` (the Next.js pattern), emits them as `["JS", ...]` instructions, and the JS-side reconstructs a `ReadableStream` that feeds `createFromReadableStream`. The Swift side no longer parses Flight wire protocol or manages module loading — webpack's `__webpack_chunk_load__` handles it (shimmed for JSC). The CSR path uses the same pattern: Swift pushes raw Flight bytes to JS via the `__next_f` array.

**Tech Stack:** react-server-dom-webpack/client, webpack runtime, Express (ssr-server.js)

**Depends on:** Plan 1 (ReadableStream polyfill), Plan 2 (JS instruction support)

---

## Context

### Current flow (what we're replacing)

**Flight data delivery (SSR):**
```
SSR Server: Flight stream → tee → ["D", row] in SSR output
Swift:      ["D", row] → ssrFlightDataBuffer → replay via FlightStreamClient
            → FlightStreamClient parses wire protocol → $$processFlightRow bridge global
            → custom JS flight-client/client.js (1111 lines)
```

**Client module loading (both CSR and SSR hydration):**
```
FlightStreamClient intercepts "I" (module) rows in Swift
  → parses metadata: moduleId, exportName, chunkFilenames
  → URLSession fetches chunk JS files (with static loadedChunks cache)
  → engine.evaluate(code) → webpack JSONP self-registers modules
  → $$webpackRequire(moduleId, exportName) → __webpack_require__
  → $$resolveFlightModule → Flight chunk resolved
```

**Fast Refresh:**
```
FlightStreamClient.refreshChunks(filenames:)
  → clears URLs from loadedChunks cache
  → re-fetches chunk files with reloadIgnoringLocalCacheData
  → re-evaluates in JSC → JSONP push overwrites module factories
  → $$performFastRefresh(moduleIds) → busts __webpack_module_cache__
    → re-requires modules → triggers $RefreshReg$ → performReactRefresh()
```

### Target flow

**Flight data delivery:**
```
SSR Server: Flight stream → tee → ["JS", 'self.__next_f.push([1,"row"])'] in SSR output
Swift:      ["JS", code] → engine.evaluate(code)
            → pushes into self.__next_f global array
            → feeds polyfilled ReadableStream
            → react-server-dom-webpack/client.createFromReadableStream()
```

**Client module loading (handled entirely in JS):**
```
react-server-dom-webpack/client processes "I" row internally
  → calls preloadModule(metadata) → loadChunk(chunkId, filename)
  → __webpack_chunk_load__(chunkId) → __webpack_require__.e(chunkId)
  → shimmed __webpack_require__.f.i: $$fetch(url) → eval(code) → JSONP self-registers
  → requireModule(metadata) → __webpack_require__(moduleId)[exportName]
```

**Fast Refresh (unchanged except chunk fetching):**
```
ReactRuntime.handleFastRefresh(filenames:moduleIds:)
  → clears installedChunks[chunkId] (exposed via webpack plugin)
  → re-fetches chunks via $$fetch + eval (same shim path)
  → $$performFastRefresh(moduleIds) → same as before
```

### Key files to modify

| File | Change |
|------|--------|
| `packages/react-dom-native/src/entry.js` | Replace flight-client usage with createFromReadableStream + __next_f pattern + chunk load shim |
| `example/webpack.config.js` | Add plugin to expose `installedChunks` for Fast Refresh cache busting |
| `example/server/ssr-server.js` | Replace `["D", row]` emission with `["JS", ...]` |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | Remove D-row buffering, simplify hydration |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` | Remove FlightStreamClient usage, update Fast Refresh to use JS-based chunk loading |
| `packages/react-dom-native/src/flight-client/client.js` | DELETE (1111 lines) |
| `packages/react-dom-native/src/flight-client/config.js` | DELETE (84 lines) |
| `packages/react-dom-native/src/flight-client/__tests__/client.test.js` | DELETE (1354 lines) |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamClient.swift` | DELETE (~460 lines) |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamDelegate.swift` | DELETE |
| `packages/react-dom-native/ios/Tests/ReactDomNativeTests/FlightStreamClientTests.swift` | DELETE |

### Key constraint: webpack runtime internals

The webpack bundle (target: `webworker`) has these runtime internals:

```js
// installedChunks — tracks loaded chunks. "1" = loaded, absent = not loaded.
// Scoped inside an IIFE — not accessible from outside without a plugin.
var installedChunks = { "main": 1 };

// __webpack_require__.f.i — the webworker chunk loader.
// Calls importScripts() which doesn't exist in JSC. Must be shimmed.
__webpack_require__.f.i = (chunkId, promises) => {
    if(!installedChunks[chunkId]) {
        importScripts(__webpack_require__.p + __webpack_require__.u(chunkId));
    }
};

// installChunk — JSONP push handler. When a chunk is eval'd, its push call
// triggers this, which registers modules in __webpack_require__.m and marks
// installedChunks[chunkId] = 1. This runs synchronously during eval().
var installChunk = (data) => {
    var [chunkIds, moreModules, runtime] = data;
    for(var moduleId in moreModules) {
        __webpack_require__.m[moduleId] = moreModules[moduleId];
    }
    while(chunkIds.length) installedChunks[chunkIds.pop()] = 1;
};
globalThis["webpackChunkreact_dom_native_example"].push = installChunk;
```

The JSONP self-registration means: after `eval(chunkCode)`, `installedChunks[chunkId]` is already `1` and `__webpack_require__(moduleId)` works. The shim just needs to do the HTTP fetch + eval, then the webpack runtime handles the rest.

---

### Task 1: Add Flight data receiver to entry.js

Set up the `self.__next_f` global array pattern (matching Next.js) that receives Flight data from `["JS", ...]` instructions and feeds it into a `ReadableStream`.

**Files:**
- Modify: `packages/react-dom-native/src/entry.js`

**Step 1: Add the inline Flight data infrastructure**

Add after the existing imports, before the bridge globals:

```js
// --- Inline Flight Data Receiver ---
// Matches the Next.js pattern: server emits JS code that pushes Flight data
// into self.__next_f, which feeds a ReadableStream consumed by
// react-server-dom-webpack/client's createFromReadableStream.

var flightEncoder = new TextEncoder();
var flightDataBuffer = null;   // Array of buffered chunks (before ReadableStream starts)
var flightDataWriter = null;   // ReadableStream controller
var flightDataClosed = false;

function flightDataCallback(seg) {
  if (seg[0] === 0) {
    // Bootstrap — initialize buffer
    flightDataBuffer = [];
  } else if (seg[0] === 1) {
    // String Flight data
    var encoded = flightEncoder.encode(seg[1]);
    if (flightDataWriter) {
      flightDataWriter.enqueue(encoded);
    } else if (flightDataBuffer) {
      flightDataBuffer.push(encoded);
    }
  }
}

function createFlightReadableStream() {
  var savedBuffer = flightDataBuffer || [];
  var savedClosed = flightDataClosed;
  // Reset state for this stream
  flightDataBuffer = null;
  flightDataClosed = false;
  flightDataWriter = null;

  return new ReadableStream({
    start: function(controller) {
      // Flush any data that arrived before the stream was created
      for (var i = 0; i < savedBuffer.length; i++) {
        controller.enqueue(savedBuffer[i]);
      }
      if (savedClosed) {
        controller.close();
      } else {
        flightDataWriter = controller;
      }
    },
  });
}

function closeFlightDataStream() {
  flightDataClosed = true;
  if (flightDataWriter) {
    flightDataWriter.close();
    flightDataWriter = null;
  }
}

// Set up the global receiver
var selfGlobal = typeof self !== 'undefined' ? self : globalThis;
selfGlobal.__next_f = selfGlobal.__next_f || [];
selfGlobal.__next_f.push = flightDataCallback;
```

**Step 2: Expose closeFlightDataStream**

Add to the `__REACT_DOM_NATIVE__` exports:

```js
__closeFlightDataStream__: closeFlightDataStream,
```

**Step 3: Verify existing tests pass**

Run: `npm test`
Expected: PASS (new code is additive, not yet consumed)

**Step 4: Commit**

```
feat: add inline Flight data receiver (Next.js self.__next_f pattern)
```

---

### Task 2: Expose installedChunks via webpack plugin + shim __webpack_chunk_load__

The webpack runtime's `__webpack_require__.f.i` calls `importScripts()` which doesn't exist in JSC. Previously Swift's `FlightStreamClient.loadChunks()` handled this natively. Now `react-server-dom-webpack/client` will call `__webpack_chunk_load__` internally when it encounters "I" (module) rows, so we need to:

1. **Expose `installedChunks`** — it's scoped inside an IIFE and inaccessible from outside. We need it for the dedup guard in the shim AND for Fast Refresh cache busting (clearing entries to force re-fetch).
2. **Replace `__webpack_require__.f.i`** — swap the synchronous `importScripts()` call with an async `$$fetch` + `eval` pattern that pushes a Promise.

**Files:**
- Modify: `example/webpack.config.js` (add plugin)
- Modify: `packages/react-dom-native/src/entry.js` (add shim)

**Step 1: Add ExposeInstalledChunks webpack plugin**

In `webpack.config.js`, add a new plugin alongside the existing `ExposeModuleCache` plugin (lines 68-85). Follow the same pattern:

```js
// Expose installedChunks as __webpack_require__.ic so that:
// 1. The __webpack_chunk_load__ shim can check if a chunk is already loaded
// 2. Fast Refresh can clear entries to force re-fetch of changed chunks
isDev && {
  apply(compiler) {
    compiler.hooks.compilation.tap('ExposeInstalledChunks', (compilation) => {
      compilation.hooks.additionalTreeRuntimeRequirements.tap(
        'ExposeInstalledChunks',
        (chunk) => {
          compilation.addRuntimeModule(
            chunk,
            new (class extends webpack.RuntimeModule {
              constructor() { super('expose installed chunks'); }
              generate() { return '__webpack_require__.ic = installedChunks;'; }
            })()
          );
        }
      );
    });
  },
},
```

Note: This plugin accesses `installedChunks` by name — it works because the RuntimeModule's `generate()` output is injected into the same IIFE scope where `installedChunks` is defined. This is the same technique used by `ExposeModuleCache` for `__webpack_module_cache__`.

**Step 2: Add the __webpack_chunk_load__ shim in entry.js**

Add after the Flight data receiver code, before the bridge globals:

```js
// ---------------------------------------------------------------------------
// Shim __webpack_chunk_load__ for JavaScriptCore
//
// The webpack webworker target uses importScripts() for chunk loading, which
// doesn't exist in JSC. This shim replaces it with $$fetch (Swift bridge) +
// eval. When react-server-dom-webpack/client encounters an 'I' (module) row,
// it calls __webpack_chunk_load__(chunkId) → __webpack_require__.e(chunkId)
// → __webpack_require__.f.i(chunkId, promises).
//
// Flow:
//   1. Check installedChunks[chunkId] — skip if already loaded (value is 1)
//   2. $$fetch the chunk JS file from the dev server
//   3. eval() the response — triggers JSONP push: installChunk([chunkIds, modules])
//   4. installChunk sets installedChunks[chunkId] = 1 and registers module factories
//   5. Promise resolves — react-server-dom-webpack calls __webpack_require__(moduleId)
// ---------------------------------------------------------------------------
if (typeof __webpack_require__ !== 'undefined' && __webpack_require__.f) {
  // installedChunks is exposed by ExposeInstalledChunks webpack plugin as __webpack_require__.ic
  var installedChunks = __webpack_require__.ic || {};

  __webpack_require__.f.i = function(chunkId, promises) {
    // Skip already-loaded chunks. installedChunks is updated by the JSONP
    // push handler (installChunk) when eval'd chunk code self-registers.
    if (installedChunks[chunkId]) {
      return;
    }

    var url = (__webpack_require__.p || '/') + __webpack_require__.u(chunkId);
    var promise = new Promise(function(resolve, reject) {
      $$fetch(url, { method: 'GET' }, function(error, status, body) {
        if (error || status !== 200) {
          reject(new Error('Failed to load chunk ' + chunkId + ': ' + (error || 'status ' + status)));
          return;
        }
        // Evaluate the chunk — this triggers the webpack JSONP push handler:
        //   globalThis["webpackChunkreact_dom_native_example"].push([chunkIds, modules])
        // which calls installChunk(), registering modules in __webpack_require__.m
        // and marking installedChunks[chunkId] = 1.
        try {
          (0, eval)(body);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    promises.push(promise);
  };
}
```

Key differences from the original `importScripts`-based handler:
- **Async**: pushes a Promise into the `promises` array (the original never pushed promises because `importScripts` is synchronous)
- **Dedup guard**: checks `installedChunks[chunkId]` (exposed via plugin) — same semantics as `FlightStreamClient.loadedChunks` but at the webpack level
- **eval trigger**: `(0, eval)(body)` runs the chunk code, which triggers `installChunk` via the JSONP push handler, synchronously registering all modules

**Step 3: Rebuild webpack bundle**

Run: `cd example && npx webpack --env development`
Expected: Builds successfully with the new runtime module

**Step 4: Verify the shim is present**

Run: `grep 'installedChunks' example/build/bundle.js | head -5`
Expected: Should see `__webpack_require__.ic = installedChunks;` in the output

**Step 5: Verify existing tests pass**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```
feat: expose installedChunks + shim __webpack_chunk_load__ for JSC

The webpack webworker target uses importScripts() for chunk loading, which
doesn't exist in JavaScriptCore. This shim replaces it with $$fetch + eval.

- ExposeInstalledChunks webpack plugin: makes installedChunks accessible
  as __webpack_require__.ic (needed for dedup guard + Fast Refresh)
- __webpack_require__.f.i shim: async fetch via $$fetch bridge, eval
  triggers JSONP self-registration, Promise-based (unlike sync importScripts)
```

---

### Task 3: Replace renderFromStream and hydrateFromStream

Replace the custom flight-client usage with `react-server-dom-webpack/client`'s `createFromReadableStream`.

**Files:**
- Modify: `packages/react-dom-native/src/entry.js`

**Step 1: Update imports**

Replace:
```js
var client = require('./flight-client');
```

With:
```js
var ReactFlightClient = require('react-server-dom-webpack/client.browser');
var flightHttp = require('./flight-client/http');
```

**Step 2: Update callServer to use ReactFlightClient**

The `callServer` function needs to return Flight-deserialized data. Update it to pipe server action responses through `createFromReadableStream`:

```js
function callServer(id, args) {
  return flightHttp.callServer(id, args, {
    createFromStream: function(stream) {
      // TODO: Wire server action response through createFromReadableStream
      return ReactFlightClient.createFromReadableStream(stream, {
        callServer: callServer,
      });
    },
  });
}
```

**Step 3: Rewrite renderFromStream**

The function no longer takes a `responseId` — the Flight response is created internally by `createFromReadableStream`:

```js
renderFromStream: function renderFromStream(surfaceId) {
    var stream = createFlightReadableStream();
    var root = createRoot({surfaceId: surfaceId});
    var tree = ReactFlightClient.createFromReadableStream(stream, {
        callServer: callServer,
    });
    tree.then(function(element) {
        root.render(element);
    }, function(error) {
        console.error('[react-dom-native] RSC stream error: ' + error);
    });
    return root;
}
```

**Step 4: Rewrite hydrateFromStream**

```js
hydrateFromStream: function hydrateFromStream(surfaceId) {
    var stream = createFlightReadableStream();
    var tree = ReactFlightClient.createFromReadableStream(stream, {
        callServer: callServer,
    });
    startTransition(function() {
        hydrateRoot(
            {surfaceId: surfaceId},
            createElement(Root, {tree: tree})
        );
    });
}
```

**Step 5: Remove old bridge globals**

Remove these globals that are no longer needed:
- `$$createFlightResponse`
- `$$processFlightRow`
- `$$resolveFlightModule`
- `$$rejectFlightModule`
- `$$closeFlightResponse`
- `$$reportFlightError`
- `responses` map

Keep:
- `$$webpackRequire` — still needed by `$$performFastRefresh` (it calls `__webpack_require__` to re-require modules)
- `$$performFastRefresh` — Fast Refresh logic stays the same

**Step 6: Verify JS tests pass**

Run: `npm test`
Expected: Some flight-client unit tests will fail (they import the old client directly). That's expected — we clean those up in Task 8.

**Step 7: Commit**

```
feat: replace custom flight-client with react-server-dom-webpack/client
```

---

### Task 4: Update SSR server to emit JS instructions

Replace `["D", row]` emission with `["JS", ...]` instructions that push Flight data into `self.__next_f`.

**Files:**
- Modify: `example/server/ssr-server.js`

**Step 1: Replace emitDRow with JS instruction emission**

Replace the `emitDRow` function and related code:

```js
var flightBootstrapEmitted = false;
var pendingJSInstructions = [];

function emitFlightRow(row) {
  if (!flightBootstrapEmitted) {
    emitJS('(self.__next_f=self.__next_f||[]).push(' + JSON.stringify([0]) + ')');
    flightBootstrapEmitted = true;
  }
  // Wrap the Flight row as a push to the __next_f array
  emitJS('self.__next_f.push(' + JSON.stringify([1, row]) + ')');
}

function emitJS(code) {
  if (shellReady) {
    res.write(JSON.stringify(['JS', code]) + '\n');
  } else {
    pendingJSInstructions.push(code);
  }
}
```

**Step 2: Update the Flight stream capture**

In the `flightCapture` Transform stream, replace calls to `emitDRow(row)` with `emitFlightRow(row)`.

**Step 3: Update pending buffer flush at shell ready**

Replace the `pendingDRows` flush:

```js
// Flush pending JS instructions
for (var i = 0; i < pendingJSInstructions.length; i++) {
  res.write(JSON.stringify(['JS', pendingJSInstructions[i]]) + '\n');
}
pendingJSInstructions = [];
```

**Step 4: Emit close instruction when Flight stream ends**

When the Flight stream completes (in the `flightCapture` stream's `flush` or the `passThrough.on('end', ...)` handler), emit:

```js
emitJS('globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()');
```

**Step 5: Update error handling path**

Ensure the error path also uses `emitFlightRow` instead of `emitDRow`.

**Step 6: Verify the server starts**

Run: `cd example && npm run dev`
Expected: Server starts on port 6000/6001 without errors

**Step 7: Commit**

```
feat: emit Flight data as JS instructions in SSR server
```

---

### Task 5: Update Swift — remove FlightStreamClient, update CSR and Fast Refresh

Remove D-row buffering and FlightStreamClient from the Swift side. Flight data now flows through JS instructions (SSR) or direct `self.__next_f.push()` calls (CSR). Module loading is handled by the webpack shim. Fast Refresh chunk reloading moves from Swift to JS.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`
- Modify: `packages/react-dom-native/src/entry.js` (add JS-side chunk refresh)

**Step 1: Remove D-row buffering from Root.swift**

Remove these properties:
- `ssrFlightDataBuffer: [String]`
- `postHydrationFlightBuffer: [String]`
- `flightResponseId: Int?`

Remove the three-phase `onFlightDataReceived` callback wiring in `renderWithSSR()`.

Remove the Flight data replay in `doHydrate()` (the `ssrData` parameter to `hydrateSurface`).

Remove the post-hydration buffer forwarding in `onHydrationCommitted()`.

**Step 2: Simplify ReactRuntime.hydrateSurface**

Remove the `ssrData` parameter and `FlightStreamClient` creation. The method now just calls `hydrateFromStream(surfaceId)`:

```swift
internal func hydrateSurface(surfaceId: Int, serverURL: String) {
    engine?.call("__REACT_DOM_NATIVE__", method: "hydrateFromStream", args: [surfaceId])
}
```

**Step 3: Update CSR path (renderSurface)**

The CSR path should also use the `__next_f` pattern. Instead of creating a `FlightStreamClient`, Swift should:
1. Bootstrap the `__next_f` receiver
2. Call `renderFromStream(surfaceId)` in JS
3. Stream Flight data via URLSession, pushing each chunk as JS evaluation

```swift
internal func renderSurface(surfaceId: Int, serverURL: String) {
    // Bootstrap the Flight data receiver
    engine?.evaluate("(self.__next_f=self.__next_f||[]).push([0])")

    // Start rendering — creates ReadableStream, calls createFromReadableStream
    engine?.call("__REACT_DOM_NATIVE__", method: "renderFromStream", args: [surfaceId])

    // Stream Flight data from server
    startFlightHTTPStream(serverURL: serverURL)
}
```

**Step 4: Create simplified HTTP stream handler for CSR**

Replace `FlightStreamClient`-based streaming with a simpler delegate that pushes raw text chunks to JS:

```swift
private func startFlightHTTPStream(serverURL: String) {
    guard let url = URL(string: serverURL),
          let engine = runtime?.engine else { return }

    let delegate = FlightHTTPStreamDelegate(engine: engine)
    let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: .main)
    var request = URLRequest(url: url)
    request.setValue("text/x-component", forHTTPHeaderField: "Accept")
    let task = session.dataTask(with: request)
    task.resume()
}

/// Simple URLSession delegate that pushes raw Flight text to JS via self.__next_f
class FlightHTTPStreamDelegate: NSObject, URLSessionDataDelegate {
    private weak var engine: JSEngine?

    init(engine: JSEngine) {
        self.engine = engine
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let engine = engine,
              let text = String(data: data, encoding: .utf8) else { return }
        // Escape for JS string literal
        let escaped = text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        engine.evaluate("self.__next_f.push([1,'\(escaped)'])")
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let engine = engine else { return }
        if let error = error {
            engine.evaluate("console.error('Flight stream error: \(error.localizedDescription)')")
        }
        engine.evaluate("globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()")
    }
}
```

**Step 5: Update Fast Refresh to use JS-based chunk reloading**

Currently `ReactRuntime.handleFastRefresh()` calls `FlightStreamClient.refreshChunks()` which does Swift-side HTTP fetch + eval. Replace this with a JS-side approach that:
1. Clears `installedChunks[chunkId]` (exposed as `__webpack_require__.ic`)
2. Clears `__webpack_module_cache__[moduleId]` (exposed as `__webpack_require__.c`)
3. Re-fetches chunks via `$$fetch` + eval (same path as the `__webpack_chunk_load__` shim)

Add `$$refreshChunks` to `entry.js`:

```js
if (__DEV__) {
  // Re-fetches and evaluates changed webpack chunks for Fast Refresh.
  // Clears installedChunks entries so the chunk loader re-fetches them,
  // then loads them via __webpack_chunk_load__ (which uses the $$fetch shim).
  globalThis.$$refreshChunks = function $$refreshChunks(chunkIds) {
    var ic = __webpack_require__.ic;
    if (!ic) return Promise.resolve();

    // Clear installed status so the shim will re-fetch
    for (var i = 0; i < chunkIds.length; i++) {
      delete ic[chunkIds[i]];
    }

    // Re-load all chunks (async via the shim)
    var promises = [];
    for (var i = 0; i < chunkIds.length; i++) {
      promises.push(__webpack_require__.e(chunkIds[i]));
    }
    return Promise.all(promises);
  };
}
```

Update `ReactRuntime.handleFastRefresh()` in Swift — replace `FlightStreamClient.refreshChunks()` with a JS call:

```swift
// 1. Re-fetch changed chunks via JS
// Convert filenames to chunkIds by removing .js extension
let chunkIds = filenames.map { $0.replacingOccurrences(of: ".js", with: "") }
let jsChunkIds = chunkIds.map { engine.makeString($0) }
let jsArray = engine.makeArray(jsChunkIds)

guard let refreshFn = engine.getGlobalProperty("$$refreshChunks") else {
    reload(fullReset: true)
    return
}

// $$refreshChunks returns a Promise
guard let promise = engine.callFunction(refreshFn, args: [jsArray]) else {
    reload(fullReset: true)
    return
}

// Wait for chunks to load, then call $$performFastRefresh
engine.callMethod(promise, "then", args: [
    engine.makeFunction { [weak self] _ in
        // 2. Call $$performFastRefresh(moduleIds) — same as before
        // ... existing $$performFastRefresh logic ...
    }
])
```

**Step 6: Update performFullReset**

Replace `FlightStreamClient.clearModuleCache(engine:)` with clearing `__webpack_require__.ic`:

```swift
// Clear installed chunks cache
engine?.evaluate("if (__webpack_require__.ic) { for (var k in __webpack_require__.ic) { if (k !== 'main') delete __webpack_require__.ic[k]; } }")
```

**Step 7: Remove FlightStreamClient references from ReactRuntime**

Remove:
- `activeFlightClients` dictionary
- `processFlightRow(responseId:row:)`
- `closeFlightResponse(responseId:)`
- `startFlightStream()` (the old version that used FlightStreamClient)
- `cancelAllFlightStreams()`
- Import of `FlightStreamClient`

**Step 8: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: PASS (some tests may need updating if they reference removed APIs)

**Step 9: Commit**

```
refactor: remove FlightStreamClient, use JS-based chunk loading + Fast Refresh
```

---

### Task 6: Verify E2E tests pass

Run the full E2E test suite to confirm both SSR and CSR paths work.

**Step 1: Run E2E Swift tests**

Run: `npm run test:e2e-swift`
Expected: PASS (both EndToEndSSRTests and EndToEndCSRTests)

**Step 2: Debug and fix any failures**

Likely issues:
- `__webpack_chunk_load__` shim may need tweaking (check with client component fixtures)
- JS string escaping in `FlightHTTPStreamDelegate` may miss edge cases
- Timing: `createFlightReadableStream()` must be called before data arrives
- `renderFromStream`/`hydrateFromStream` JS function signatures changed (no more `responseId` param)

**Step 3: Run Fantom integration tests**

Run: `npm run test:fantom`
Expected: May fail if they use the old flight-client API directly. Fix in Task 7.

**Step 4: Commit any fixes**

---

### Task 7: Update Fantom integration tests

The Fantom tests (`tests/integration/rsc-*-itest.js`) use the custom flight-client directly. Update them to use the new pattern or `react-server-dom-webpack/client`.

**Files:**
- Modify: `tests/integration/rsc-basic-flight-itest.js`
- Modify: `tests/integration/rsc-nested-flight-itest.js`
- Modify: `tests/integration/rsc-props-flight-itest.js`

**Step 1: Identify how tests create Flight responses**

Check what APIs the Fantom tests import from the flight-client. They likely use `createResponse`, `processStringChunk`, `getRoot`, etc.

**Step 2: Update test helpers**

Create a helper that wraps Flight text in a ReadableStream:

```js
function createFlightStream(text) {
  var encoder = new TextEncoder();
  var controller;
  var stream = new ReadableStream({
    start: function(c) { controller = c; },
  });
  controller.enqueue(encoder.encode(text));
  controller.close();
  return stream;
}
```

**Step 3: Update tests to use createFromReadableStream**

Replace `createResponse` + `processStringChunk` + `getRoot` with:

```js
var {createFromReadableStream} = require('react-server-dom-webpack/client.browser');
var tree = createFromReadableStream(createFlightStream(payload));
```

**Step 4: Run Fantom tests**

Run: `npm run test:fantom`
Expected: PASS

**Step 5: Commit**

```
test: update Fantom tests for react-server-dom-webpack/client
```

---

### Task 8: Delete the custom Flight client

Remove the files that are no longer needed.

**Files:**
- Delete: `packages/react-dom-native/src/flight-client/client.js` (1111 lines)
- Delete: `packages/react-dom-native/src/flight-client/config.js` (84 lines)
- Delete: `packages/react-dom-native/src/flight-client/__tests__/client.test.js` (1354 lines)
- Simplify: `packages/react-dom-native/src/flight-client/index.js`

**Step 1: Delete files**

Remove `client.js`, `config.js`, and `__tests__/client.test.js`.

**Step 2: Simplify index.js**

```js
'use strict';

// HTTP utilities for server actions (bridge-based fetch)
var http = require('./http');
exports.fetchWithBridge = http.fetchWithBridge;
exports.callServer = http.callServer;
exports.createStream = http.createStream;
```

**Step 3: Delete Swift Flight files**

Remove:
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamClient.swift` (~460 lines)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamDelegate.swift`
- `packages/react-dom-native/ios/Tests/ReactDomNativeTests/FlightStreamClientTests.swift`

And any remaining references to these files.

**Step 4: Verify all tests pass**

Run: `npm test && npm run test:swift && npm run test:e2e-swift`
Expected: PASS

**Step 5: Commit**

```
refactor: delete custom flight-client fork and FlightStreamClient

Replaced by react-server-dom-webpack/client with ReadableStream polyfill
and JS instruction support in the SSR stream.

Removed:
- flight-client/client.js (1111 lines) — custom Flight wire protocol parser
- flight-client/config.js (84 lines) — custom client reference resolution
- flight-client/__tests__/client.test.js (1354 lines) — tests for above
- Flight/FlightStreamClient.swift (~460 lines) — Swift Flight row parser
- 7 bridge globals ($$processFlightRow, $$resolveFlightModule, etc.)

Added:
- ReadableStream polyfill (~80 lines, Plan 1)
- JS instruction support (~20 lines Swift, Plan 2)
- Flight data receiver (~60 lines JS, Next.js self.__next_f pattern)
- __webpack_chunk_load__ shim (~20 lines)
```

---

### Task 9: Remove D instruction support

Now that nothing emits `["D", ...]` instructions, remove support for them.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift`

**Step 1: Remove D opcode from parser**

In `InstructionStreamParser.swift`:
- Remove `"D"` from the header comment
- Remove the `case "D"` block from `processLine()`
- Remove `didReceiveFlightData(row:)` from the `InstructionStreamDelegate` protocol

**Step 2: Remove from SSRCoordinator**

- Remove `onFlightDataReceived` property
- Remove `didReceiveFlightData` method

**Step 3: Verify all tests pass**

Run: `npm run test:swift && npm run test:e2e-swift`
Expected: PASS

**Step 4: Commit**

```
refactor: remove D instruction type (replaced by JS instructions)
```

---

### Task 10: Full verification

**Step 1: Run all test suites**

```bash
npm test                # JS unit tests
npm run test:swift      # Swift unit tests
npm run test:fantom     # Fantom integration tests
npm run test:e2e-swift  # E2E Swift tests (CSR + SSR)
```

Expected: All PASS

**Step 2: Manual smoke test**

Use `/build-demo` to build and run the Falcon demo app:
- Verify fixtures render correctly
- Verify client components (Counter, Tabs) work
- Verify Suspense boundaries stream and reveal
- Verify Fast Refresh works (modify a component, verify reload)

**Step 3: Final commit with any fixes**

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `__webpack_chunk_load__` shim async timing | The shim pushes a Promise into the `promises` array. `__webpack_require__.e` returns `Promise.all(promises)`. `react-server-dom-webpack/client` chains `.then()` on chunk loads before calling `__webpack_require__`. This is the standard pattern. |
| `installedChunks` not exposed in prod | The `ExposeInstalledChunks` plugin is DEV-only (like `ExposeModuleCache`). In prod, the shim's guard check won't have `__webpack_require__.ic`, so it will skip the dedup check and rely on the JSONP push handler being idempotent (re-registering module factories is a no-op). Fast Refresh is also DEV-only so no issue there. |
| Performance profiling differences | The upstream Flight client has its own `console.timeStamp` profiling for server component timing. Verify DevTools Performance panel still shows server component tracks. The custom profiling code in `client.js` (lines 756-1056) is eliminated — upstream's may differ in format. |
| Fast Refresh chunk reloading | The `$$refreshChunks` function clears `installedChunks` entries and calls `__webpack_require__.e` to re-fetch. The shim's `$$fetch` doesn't use HTTP caching (`reloadIgnoringLocalCacheData`). We may need to add a cache-bust query param (`?t=Date.now()`) to the fetch URL. |
| JS string escaping in CSR stream delegate | Flight data can contain any UTF-8 including quotes, backslashes, and control characters. The escaping in `FlightHTTPStreamDelegate` handles `\`, `'`, `\n`, `\r` but may miss other control chars or emoji edge cases. Consider using `engine.callFunction` with args instead of string interpolation for safety. |
| Server action responses | `callServer` in `http.js` returns data via `$$fetch` which is callback-based. To pipe through `createFromReadableStream`, we'd need to wrap the response in a `ReadableStream`. This may need a follow-up task. |
| `$$webpackRequire` still needed | `$$performFastRefresh` uses `__webpack_require__` directly (not `$$webpackRequire`). However, `$$webpackRequire` is still referenced in the existing code — verify it's truly unused before removing. |

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Custom Flight client code | ~1400 lines JS + ~460 lines Swift | 0 lines |
| New code | 0 | ~200 lines (receiver + shim + stream delegate + $$refreshChunks) |
| Bridge globals | 7 (`$$createFlightResponse`, `$$processFlightRow`, `$$resolveFlightModule`, `$$rejectFlightModule`, `$$closeFlightResponse`, `$$reportFlightError`, `$$webpackRequire`) | 2 (`$$webpackRequire`, `$$refreshChunks`) — both DEV-only for Fast Refresh |
| Upstream Flight features | Manual port required | Automatic (streaming types, cyclic refs, console replay, etc.) |
| Module loading | Swift `FlightStreamClient.loadChunks()` + `URLSession` | webpack `__webpack_chunk_load__` shimmed with `$$fetch` + `eval` |
| Fast Refresh chunks | Swift `FlightStreamClient.refreshChunks()` | JS `$$refreshChunks` clearing `installedChunks` + re-fetching via shim |
| Chunk dedup cache | Swift static `loadedChunks: Set<String>` | webpack `installedChunks` (exposed via plugin) |
