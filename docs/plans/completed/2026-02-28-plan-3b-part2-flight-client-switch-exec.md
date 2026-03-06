# Plan 3b Part 2: Switch to react-server-dom-webpack/client

## Context

Currently, react-dom-native uses a custom Flight client fork (`packages/react-dom-native/src/flight-client/`) and a Swift-side Flight wire protocol parser (`FlightStreamClient.swift`). This was necessary before the document polyfill existed, because webpack's standard `react-server-dom-webpack/client` expects browser DOM APIs (`document.createElement('script')`, `document.head.appendChild(script)`, etc.) for chunk loading.

Plan 3b Part 1 built the document polyfill infrastructure: `<html>`, `<head>`, `<body>` shadow nodes, a `document` global with `createElement`, `head.appendChild` (fetches via URLSession + evaluates in JSC), and the inline Flight data receiver (`self.__next_f` pattern). This means we can now switch to the standard `react-server-dom-webpack/client`, eliminating ~1860 lines of custom code.

**Intended outcome:** The custom flight-client fork and Swift FlightStreamClient are deleted. The standard `createFromReadableStream` handles Flight parsing, and webpack's standard JSONP/script-tag chunk loader (target: 'web') handles module loading via the document polyfill.

---

## Task 1: Switch webpack target from `webworker` to `web`

**File:** `example/webpack.config.js`

**Changes:**
1. Change `target: 'webworker'` → `target: 'web'` (line 34)
2. Remove the `importScripts` comment block (lines 30-33)
3. Keep `globalObject: 'globalThis'` and `publicPath: '/'` — both remain essential
4. After build, verify the output contains `document.createElement('script')` and `__webpack_require__.l` (not `importScripts`)
5. Check if `target: 'web'` overrides `globalObject` — if the built bundle uses `self["webpackChunk..."]` instead of `globalThis["webpackChunk..."]`, we need to add `globalThis.self = globalThis` to the polyfill setup in `JSRuntime.swift:setupDocumentPolyfill()`

**Commit:** `feat: switch webpack target to 'web' for standard JSONP chunk loading`

---

## Task 2: Replace custom flight-client with `react-server-dom-webpack/client`

**File:** `packages/react-dom-native/src/entry.js`

**Changes:**

### 2a. Update imports (line 41)
Replace:
```js
var client = require('./flight-client/client');
```
With:
```js
var ReactFlightClient = require('react-server-dom-webpack/client.browser');
```

Remove the comment block on lines 43-48 (the `require('react-server-dom-webpack/client.browser')` that was only for the webpack plugin). The new import above serves both purposes.

### 2b. Rewrite `renderFromStream` (lines 241-257)
Replace the function body to use `createFlightDataStream()` + `ReactFlightClient.createFromReadableStream()`:
```js
renderFromStream: function renderFromStream(surfaceId) {
  var stream = createFlightDataStream();
  var tree = ReactFlightClient.createFromReadableStream(stream);
  var root = createRoot({surfaceId: surfaceId});

  tree.then(function(element) {
    root.render(element);
  }, function(error) {
    console.error('[react-dom-native] RSC stream error: ' + error);
  });

  return root;
},
```

Note: `renderFromStream` no longer takes a `responseId` — the Flight response is created internally by `createFromReadableStream`. The function still takes `surfaceId`.

### 2c. Rewrite `hydrateFromStream` (lines 262-276)
```js
hydrateFromStream: function hydrateFromStream(surfaceId) {
  var stream = createFlightDataStream();
  var tree = ReactFlightClient.createFromReadableStream(stream);

  startTransition(function() {
    hydrateRoot(
      {surfaceId: surfaceId},
      createElement(Root, {tree: tree})
    );
  });
},
```

### 2d. Remove bridge globals (lines 120-195)
Delete the entire block:
- `responses` map and `nextResponseId`
- `$$createFlightResponse`
- `$$processFlightRow`
- `$$resolveFlightModule`
- `$$webpackRequire` — **Keep this one!** It's still used by `$$performFastRefresh`
- `$$rejectFlightModule`
- `$$closeFlightResponse`
- `$$reportFlightError`

### 2e. Update the header comment (lines 10-11)
Remove references to `$$createFlightResponse` etc.

**Commit:** `feat: replace custom flight-client with react-server-dom-webpack/client`

---

## Task 3: Update SSR server to emit Flight data as JS instructions

**File:** `example/server/ssr-server.js`

**Changes:**

### 3a. Replace D-row emission with JS instructions
Change `emitDRow` (lines 100-106) to emit `["JS", ...]` instructions that push data to `self.__next_f`:
```js
function emitFlightRow(row) {
  // Emit as JS instruction that pushes Flight data into the inline receiver
  var jsCode = 'self.__next_f.push([1,' + JSON.stringify(row + '\n') + '])';
  var instruction = JSON.stringify(['JS', jsCode]) + '\n';
  if (shellReady) {
    res.write(instruction);
  } else {
    pendingRows.push(instruction);
  }
}
```

Replace all `emitDRow(...)` calls with `emitFlightRow(...)` throughout the function.

### 3b. Emit bootstrap instruction at start
Before the Flight stream starts, emit a bootstrap `["JS", ...]` that initializes the receiver:
```js
var bootstrap = JSON.stringify(['JS', 'self.__next_f.push([0])']) + '\n';
pendingRows.push(bootstrap);
```

### 3c. Emit close instruction when Flight stream ends
After the Flight stream completes (in both `flightCapture.flush` and the error path), emit:
```js
var closeJS = JSON.stringify(['JS', 'globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()']) + '\n';
res.write(closeJS);
```

### 3d. Update `pendingDRows` → `pendingRows` naming for clarity

### 3e. Wrap SSR HTML in structural elements
The SSR HTML response should wrap content in `<html><head></head><body>...</body></html>` so the document polyfill's `document.head` gets wired to a real `<head>` shadow node. This means the Fizz output needs wrapping.

Verify if the Fizz renderer already wraps in structural elements or if we need to explicitly render `<html><head/><body><Root/></body></html>` in the SSR server's Root component.

**Commit:** `feat: emit Flight data as JS instructions in SSR server`

---

## Task 4: Update Swift — remove FlightStreamClient usage, update CSR and hydration

**Files:**
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+HotReload.swift`

### 4a. ReactRuntime.swift — Remove Flight stream infrastructure

1. **Remove `activeFlightClients` dictionary** (line 50) and its type annotation
2. **Rewrite `renderSurface`** (lines 198-215): Instead of calling `$$createFlightResponse` and starting a FlightStreamClient, fetch the Flight stream via URLSession and pipe it through JS instructions (same pattern as SSR: push data into `self.__next_f`, then call `renderFromStream(surfaceId)`):
   - Create a bootstrap JS instruction: `self.__next_f.push([0])`
   - Evaluate `renderFromStream(surfaceId)` (no responseId)
   - Start URLSession to fetch the Flight stream from `serverURL`
   - On each data chunk, evaluate `self.__next_f.push([1, <data>])` in JSC
   - On completion, evaluate `__REACT_DOM_NATIVE__.__closeFlightDataStream__()`

   This creates a new delegate class (or reuse a simple pattern) — call it `FlightHTTPStreamDelegate`:
   ```swift
   private class FlightHTTPStreamDelegate: NSObject, URLSessionDataDelegate {
       private weak var engine: JSEngine?

       init(engine: JSEngine) { self.engine = engine }

       func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
           guard let engine = engine, let text = String(data: data, encoding: .utf8) else { return }
           let escaped = text.replacingOccurrences(of: "\\", with: "\\\\")
                             .replacingOccurrences(of: "'", with: "\\'")
                             .replacingOccurrences(of: "\n", with: "\\n")
                             .replacingOccurrences(of: "\r", with: "\\r")
           engine.evaluate("self.__next_f.push([1,'\(escaped)'])")
       }

       func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
           guard let engine = engine else { return }
           if let error = error {
               print("[Flight] Stream error: \(error)")
           }
           engine.evaluate("globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()")
       }
   }
   ```

3. **Rewrite `hydrateSurface`** (lines 226-262): Instead of creating a FlightStreamClient and replaying buffered rows, push them into the `self.__next_f` receiver:
   - Bootstrap: `self.__next_f.push([0])`
   - Replay each buffered row: `self.__next_f.push([1, <row + "\\n">])`
   - Call `hydrateFromStream(surfaceId)` (no responseId)
   - If `!keepOpen`, close: `__REACT_DOM_NATIVE__.__closeFlightDataStream__()`
   - Return value changes: no longer returns responseId. Change to `Void` return.

4. **Remove `processFlightRow`** (lines 265-268)
5. **Remove `closeFlightResponse`** (lines 271-274)
6. **Remove `startFlightStream`** (lines 277-293)
7. **Remove `cancelAllFlightStreams`** (lines 296-301)
8. **Update `resetForTesting`** (line 350): Remove `FlightStreamClient.clearModuleCache(engine:)` — webpack module cache is cleared by the document polyfill's script tracking. Also remove `cancelAllFlightStreams()`.
9. **Update `performFullReset`** (line 553): Remove `FlightStreamClient.clearModuleCache(engine:)` and `cancelAllFlightStreams()`.
10. **Update `performChunkRefresh`** (lines 493-497): Remove `FlightStreamClient.refreshChunks(...)`. Replace with a JS-based approach using `$$refreshChunks` (see Task 4f below).

### 4b. Root.swift — Remove Flight response tracking

Remove `ssrFlightDataBuffer`, `hydrationStarted`, `hydrationCommitted`, `postHydrationFlightBuffer`, `flightResponseId` properties (lines 92, 103-111) — **Wait, these are still needed!** The D→JS instruction change means Flight data arrives as JS evaluation (`self.__next_f.push(...)`) instead of buffered Swift strings. But the SSR pipeline still needs to know when hydration has started/committed for buffering behavior.

Actually, with the JS instruction approach, the SSR server emits `["JS", "self.__next_f.push([1, ...])"]` instructions. The SSR coordinator's `onJavaScriptReceived` callback handles these — it either evaluates immediately (if hydration started) or buffers (if not). This means:
- `ssrFlightDataBuffer` is **no longer needed** — Flight data is pushed via JS instructions, not Swift-buffered strings
- `ssrJavaScriptBuffer` **stays** — it buffers JS instructions until the engine boots
- `hydrationStarted`, `hydrationCommitted` **stay** — they control JS instruction buffering behavior
- `postHydrationFlightBuffer` is **no longer needed** — the Flight data receiver + ReadableStream handle backpressure
- `flightResponseId` is **no longer needed** — no Swift-side Flight response tracking

Remove: `ssrFlightDataBuffer`, `postHydrationFlightBuffer`, `flightResponseId`
Keep: `hydrationStarted`, `hydrationCommitted`, `ssrJavaScriptBuffer`

### 4c. Root+SSR.swift — Update D-row handling

1. **Remove `onFlightDataReceived` callback wiring** (lines 66-78 in renderWithSSR, lines 389-397 in feedSSRData): The SSR server no longer emits D instructions — all Flight data comes via JS instructions. The `onJavaScriptReceived` callback already handles this correctly.

2. **Remove D-row references in `hydrateRoot`** (line 662-668): No longer replays `ssrFlightDataBuffer` through `hydrateSurface`. Instead, the JS instructions were already evaluated (or buffered in `ssrJavaScriptBuffer`) and the Flight data stream is already populated.

3. **Update `hydrateRoot` hydration call**: Instead of calling `rt.hydrateSurface(surfaceId:serverURL:ssrData:keepOpen:)`, just evaluate `hydrateFromStream(surfaceId)` in JS. The Flight data is already in the ReadableStream from the JS instructions that were replayed.

4. **Remove `postHydrationFlightBuffer` forwarding** in `onHydrationCommitted()` (lines 831-837)

5. **Remove `processFlightRow` calls** and `closeFlightResponse` calls throughout

### 4d. Root+HotReload.swift — Remove Flight state cleanup
Remove `ssrFlightDataBuffer.removeAll()`, `flightResponseId = nil`, `postHydrationFlightBuffer.removeAll()` from `rerender()` (lines 29, 38-39)

### 4e. Add `$$refreshChunks` to entry.js for Fast Refresh

Add a new bridge global in entry.js (DEV-only) that clears webpack's installed chunks and reloads them via `__webpack_require__.e`:
```js
if (__DEV__) {
  globalThis.$$refreshChunks = function $$refreshChunks(chunkIds) {
    // Clear installed status so webpack re-loads
    // __webpack_require__.ic is exposed by ExposeInstalledChunks plugin
    // (we need to add this plugin or use a different approach)

    // Re-load via webpack's standard chunk loader (uses document polyfill)
    var promises = [];
    for (var i = 0; i < chunkIds.length; i++) {
      promises.push(__webpack_require__.e(chunkIds[i]));
    }
    return Promise.all(promises);
  };
}
```

**Note:** We need to also expose `installedChunks` in the webpack config via a new runtime plugin (similar to `ExposeModuleCache`). Add an `ExposeInstalledChunks` plugin that exposes `installedChunks` as `__webpack_require__.ic`.

### 4f. Update `performChunkRefresh` in ReactRuntime.swift

Replace `FlightStreamClient.refreshChunks(...)` with calling `$$refreshChunks` in JS:
```swift
// Call $$refreshChunks(chunkIds) to reload chunks via webpack
guard let refreshFn = engine.getGlobalProperty("$$refreshChunks") else {
    reload(fullReset: true)
    return
}
let jsChunkIds = filenames.map { engine.makeString($0) }
let jsArray = engine.makeArray(jsChunkIds)
// $$refreshChunks returns a Promise — use callFunction and handle async
let resultPromise = engine.callFunction(refreshFn, args: [jsArray])
// ... then call $$performFastRefresh(moduleIds)
```

Actually, since `$$refreshChunks` returns a Promise and we need to chain `$$performFastRefresh`, it may be simpler to do this entirely in JS with a single `engine.evaluate()` call that chains the promise.

**Commit:** `refactor: remove FlightStreamClient, use document polyfill for chunk loading`

---

## Task 5: Update Fantom integration tests

**File:** `tools/fantom/src/index.js`

The Fantom test helper's `createFromFlight` function (lines 222-238) currently uses `require('react-dom-native/src/flight-client/client')` directly. Since we're deleting that module, we need to update it to use `react-server-dom-webpack/client.browser`'s `createFromReadableStream`.

Replace `createFromFlight`:
```js
function createFromFlight(payload) {
  // Create a ReadableStream from the payload string
  var encoder = new TextEncoder();
  var stream = new ReadableStream({
    start: function(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    }
  });
  var result = ReactFlightClient.createFromReadableStream(stream);
  // Need to flush microtasks to resolve the stream
  // ... or use a synchronous approach
}
```

**Challenge:** `createFromReadableStream` is async (returns a thenable). The Fantom tests currently use `createFromFlight` synchronously. We need either:
1. Make Fantom tests async
2. Use `$$flushWork()` to drain microtask queues after creating the stream
3. Keep a minimal synchronous Flight parser just for tests

Option 2 is the simplest — the test helper already uses `$$flushWork()`. We can create the stream, get the thenable, flush work, and the thenable should resolve.

**Commit:** `test: update Fantom flight tests to use react-server-dom-webpack/client`

---

## Task 6: Delete old code

**Files to delete:**
- `packages/react-dom-native/src/flight-client/client.js` (1,110 lines)
- `packages/react-dom-native/src/flight-client/config.js` (84 lines)
- `packages/react-dom-native/src/flight-client/http.js` (163 lines)
- `packages/react-dom-native/src/flight-client/index.js` (41 lines)
- `packages/react-dom-native/src/flight-client/__tests__/client.test.js`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamClient.swift` (458 lines)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamDelegate.swift` (37 lines)
- `packages/react-dom-native/ios/Tests/ReactDomNativeTests/FlightStreamClientTests.swift`

**Commit:** `refactor: delete custom Flight client and FlightStreamClient`

---

## Task 7: Remove D instruction support

**Files:**
- `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift` — Remove `"D"` case and `didReceiveFlightData` from delegate protocol
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` — Remove `didReceiveFlightData(row:)` method and `onFlightDataReceived` property

**Commit:** `refactor: remove D instruction support`

---

## Task 8: End-to-end app verification (Nested Suspense fixture)

This is the critical test that confirms the full pipeline works. Must be done before declaring success.

1. **Start the servers** — run `cd example && npm run dev` to start esbuild watcher + RSC server (:6000) + SSR server (:6001)
2. **Build and run the demo app** — use `/build demo` to build and launch on the Falcon Demo simulator
3. **Navigate to Nested Suspense fixture** — use `npm run app:snapshot-ui` to find and tap the Nested Suspense fixture entry
4. **Verify correct rendering** — use `npm run app:screenshot` and `npm run app:snapshot-ui` to confirm:
   - No hydration errors in logs (`npm run app:log-start` / `npm run app:log-read`)
   - Correct UI structure (all Suspense boundaries resolved, content visible)
   - Counter element visible with initial count
5. **Verify interactivity** — tap the counter button and confirm count increments:
   - `npm run app:snapshot-ui -- --filter counter` to find the counter button coordinates
   - `npm run app:tap -- <x> <y>` to tap
   - `npm run app:snapshot-ui -- --filter counter` to confirm count incremented
6. **Check for console errors** — use `/devtools` or log capture to verify no JS errors

---

## Task 9: Full test suite verification

Run all test suites:
- `npm test` — JS unit tests
- `npm run test:swift` — Swift unit tests
- `npm run test:fantom` — Fantom integration tests
- `npm run test:e2e-swift` — E2E Swift tests

---

## Critical files summary

| File | Action |
|------|--------|
| `example/webpack.config.js` | Modify: target webworker→web, add ExposeInstalledChunks plugin |
| `packages/react-dom-native/src/entry.js` | Modify: replace flight-client, rewrite render/hydrate, remove bridge globals |
| `example/server/ssr-server.js` | Modify: D→JS instructions, add bootstrap/close |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` | Modify: remove FlightStreamClient usage, add FlightHTTPStreamDelegate, rewrite CSR/hydration |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | Modify: remove Flight state properties |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` | Modify: remove D-row handling, update hydration path |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+HotReload.swift` | Modify: remove Flight state cleanup |
| `tools/fantom/src/index.js` | Modify: update createFromFlight to use webpack client |
| `packages/react-dom-native/src/flight-client/` | Delete: entire directory |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamClient.swift` | Delete |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamDelegate.swift` | Delete |
| `packages/react-dom-native/ios/Tests/ReactDomNativeTests/FlightStreamClientTests.swift` | Delete |
| `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift` | Modify: remove D instruction |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` | Modify: remove onFlightDataReceived |
