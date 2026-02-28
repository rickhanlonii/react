# Plan 3b Part 2: Switch to react-server-dom-webpack/client

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the custom flight-client fork with `react-server-dom-webpack/client`, using the document polyfill infrastructure from Plan 3b Part 1. This is the breaking change — webpack target switches, SSR output changes, Swift FlightStreamClient is removed.

**Depends on:** Plan 1 (ReadableStream polyfill), Plan 2 (JS instruction support), **Plan 3b Part 1** (document polyfill + `<html>`/`<head>`/`<body>` elements + Flight data receiver)

**Tech Stack:** Swift (Root.swift, ReactRuntime.swift), JavaScriptCore, webpack (target change), react-server-dom-webpack/client, Express (SSR server)

---

## Context

### How webpack's browser JSONP loader works

When `target: 'web'`, webpack generates `__webpack_require__.l` (loadScript) which:

```js
// 1. Creates a script element
var script = document.createElement('script');
script.src = __webpack_require__.p + __webpack_require__.u(chunkId);  // e.g. "/client0.js"

// 2. Sets completion callbacks
script.onload = function() { /* resolve chunk promise */ };
script.onerror = function() { /* reject chunk promise */ };

// 3. Appending triggers browser fetch + execute
document.head.appendChild(script);

// 4. After load, cleanup
script.parentNode.removeChild(script);
```

The key insight: `appendChild(script)` is the trigger point. In a browser, the browser engine fetches `script.src` and evaluates it. In JSC, the `<head>` shadow node (from Part 1) intercepts `appendChild`, fetches via `URLSession`, and calls `engine.evaluate()`.

### DOM APIs webpack's loader actually uses

From `LoadScriptRuntimeModule.js` and `JsonpChunkLoadingRuntimeModule.js`:

| API | Used For | How We Handle (Part 1) |
|-----|----------|------------------------|
| `document.createElement('script')` | Create script element | Return a fake JS object |
| `document.head.appendChild(script)` | **Trigger fetch + execute** | `<head>` shadow node: URLSession fetch → `engine.evaluate()` → fire `onload` |
| `script.src` (setter/getter) | Set URL to load | Plain JS property |
| `script.onload` (setter) | Success callback | Plain JS property, called by Swift after eval |
| `script.onerror` (setter) | Error callback | Plain JS property, called by Swift on fetch failure |
| `script.setAttribute(name, value)` | Set nonce, data-webpack, fetchpriority | Store in a Map (only `data-webpack` matters for dedup) |
| `script.getAttribute(name)` | Read attributes for dedup check | Read from Map |
| `script.parentNode` | Check parent before removeChild | Return head node ref |
| `script.parentNode.removeChild(script)` | Cleanup after load | No-op |
| `document.getElementsByTagName('script')` | Find existing scripts for dedup | Return array of created scripts |
| `document.head` (getter) | Where to append | Real `<head>` shadow node |
| `document.baseURI` | Public path fallback | Return server origin string |
| `document.createElement('link')` | Prefetch/preload hints | Return a no-op fake element |

Most of these are trivial getters/setters. The only one with real behavior is `appendChild`.

---

### Task 1: Switch webpack target from webworker to web

Change the webpack target so it emits the JSONP/script-tag chunk loader instead of the `importScripts` loader.

**Files:**
- Modify: `example/webpack.config.js`

**Step 1: Change target**

Replace:
```js
target: 'webworker',
```

With:
```js
// 'web' target uses script tags for chunk loading, handled by the
// <head> shadow node's appendChild (document polyfill).
target: 'web',
```

**Step 2: Keep explicit publicPath**

The `publicPath: '/'` is already set explicitly (line 27), which is important — the `'web'` target's auto public path detection uses `document.currentScript` which our polyfill returns `null` for. Explicit publicPath bypasses this.

**Step 3: Verify globalObject is still correct**

Keep `globalObject: 'globalThis'` — this ensures the JSONP push handler uses `globalThis["webpackChunk..."]` instead of `window["webpackChunk..."]` (which would fail since there's no `window` in JSC). Check the webpack docs — `target: 'web'` may force `globalObject` to `self` or `window`. If so, we need to ensure `globalThis.self = globalThis` is set.

**Step 4: Remove the importScripts comment**

The comments about `importScripts` on lines 30-33 are no longer relevant.

**Step 5: Check if ExposeInstalledChunks plugin is still needed**

With `target: 'web'`, the JSONP loader uses a different `installedChunks` state model:
- `0` = loaded
- `undefined` = not loaded
- `[resolve, reject, promise]` = currently loading

The script dedup in `__webpack_require__.l` checks existing `<script>` tags via `document.getElementsByTagName('script')`, so webpack's standard dedup works with the document polyfill. For Fast Refresh, we still need to clear `installedChunks` — check if the variable is accessible. If not, keep the `ExposeInstalledChunks` plugin from Plan 3.

**Step 6: Rebuild and verify**

Run: `cd example && npx webpack --env development`
Expected: Builds successfully. Check `example/build/bundle.js` for:
- `document.createElement('script')` in the runtime (not `importScripts`)
- `__webpack_require__.l` function present
- JSONP push handler still using `globalThis["webpackChunk..."]`

**Step 7: Commit**

```
feat: switch webpack target to 'web' for standard JSONP chunk loading
```

---

### Task 2: Replace renderFromStream and hydrateFromStream

Replace custom flight-client with `createFromReadableStream` from `react-server-dom-webpack/client`.

**Files:**
- Modify: `packages/react-dom-native/src/entry.js`

**Step 1: Update imports**

Replace `var client = require('./flight-client/client')` with `var ReactFlightClient = require('react-server-dom-webpack/client.browser')`.

**Step 2: Rewrite renderFromStream and hydrateFromStream**

Use `createFlightReadableStream()` + `ReactFlightClient.createFromReadableStream()`.

**Step 3: Remove old bridge globals**

Remove `$$createFlightResponse`, `$$processFlightRow`, `$$resolveFlightModule`, `$$rejectFlightModule`, `$$closeFlightResponse`, `$$reportFlightError`, and the `responses` map.

Keep `$$webpackRequire` (still used by `$$performFastRefresh`).

**Step 4: Commit**

```
feat: replace custom flight-client with react-server-dom-webpack/client
```

---

### Task 3: Update SSR server to emit JS instructions

Replace `["D", row]` with `["JS", ...]` instructions. Wrap SSR HTML response in `<html><head></head><body>...</body></html>`.

**Files:**
- Modify: `example/server/ssr-server.js`

The SSR HTML response should wrap content in `<html><head></head><body>...</body></html>` so that these structural elements exist as real shadow tree nodes. The `<head>` node enables `document.head` to be wired to a real node (from Part 1's polyfill), and `<body>` becomes the visible content container.

**Commit:**
```
feat: emit Flight data as JS instructions in SSR server
```

---

### Task 4: Update Swift — remove FlightStreamClient, update CSR and Fast Refresh

*Similar to Plan 3, Task 5, but Fast Refresh chunk reloading is simpler.*

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`
- Modify: `packages/react-dom-native/src/entry.js`

**Steps 1-4: Same as Plan 3, Task 5**

Remove D-row buffering, simplify `hydrateSurface`, update CSR path, create `FlightHTTPStreamDelegate`.

**Step 5: Update Fast Refresh**

With the document polyfill approach, Fast Refresh chunk reloading can use `__webpack_require__.l` directly (webpack's standard loadScript), since the `<head>` shadow node handles the actual fetch+eval. Add `$$refreshChunks` to `entry.js`:

```js
if (__DEV__) {
  globalThis.$$refreshChunks = function $$refreshChunks(chunkIds) {
    // Clear installed status so webpack will re-load
    // (installedChunks may need to be exposed — check if accessible)
    var ic = __webpack_require__.ic;
    if (ic) {
      for (var i = 0; i < chunkIds.length; i++) {
        delete ic[chunkIds[i]];
      }
    }

    // Also clear the script dedup: remove matching scripts from the
    // document polyfill's tracking so getElementsByTagName doesn't find them.
    // Add a $$clearScriptCache helper if needed.

    // Re-load via webpack's standard loadScript (uses document polyfill)
    var promises = [];
    for (var i = 0; i < chunkIds.length; i++) {
      promises.push(__webpack_require__.e(chunkIds[i]));
    }
    return Promise.all(promises);
  };
}
```

Note: The script dedup in `__webpack_require__.l` checks `document.getElementsByTagName('script')` for existing scripts with matching `data-webpack` attributes. For Fast Refresh to re-fetch, we need to either:
- Remove the matching entry from `createdScripts` array (add `$$clearScriptCache(key)` to the document polyfill)
- Or clear `installedChunks[chunkId]` (which short-circuits before `__webpack_require__.l` is called)

The `ExposeInstalledChunks` plugin approach from Plan 3 works here too and is simpler.

**Step 6: Update performFullReset**

Same as Plan 3 — clear `__webpack_require__.ic` (or clear `createdScripts` in the document polyfill).

**Step 7-9: Same as Plan 3**

Remove FlightStreamClient references, verify Swift tests pass, commit.

**Commit:**
```
refactor: remove FlightStreamClient, use document polyfill for chunk loading
```

---

### Task 5: Verify E2E tests pass

Run: `npm run test:e2e-swift`
Expected: PASS

---

### Task 6: Update Fantom integration tests

Update any Fantom tests that depend on the old Flight client APIs or D-row protocol.

---

### Task 7: Delete old code

Delete custom Flight client + FlightStreamClient.swift + FlightStreamDelegate.swift + FlightStreamClientTests.swift.

**Commit:**
```
refactor: delete custom Flight client and FlightStreamClient
```

---

### Task 8: Remove D instruction support

Remove D instruction handling from Swift and JS now that everything uses JS instructions.

**Commit:**
```
refactor: remove D instruction support
```

---

### Task 9: Full verification

- Run: `npm test` — JS unit tests
- Run: `npm run test:swift` — Swift unit tests
- Run: `npm run test:fantom` — Fantom integration tests
- Run: `npm run test:e2e-swift` — E2E Swift tests
- Build and run the app — verify full RSC + SSR + hydration pipeline works

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `target: 'web'` may set `globalObject` to `window` or `self` | Verify after build. If needed, set `globalThis.window = globalThis` or keep explicit `globalObject: 'globalThis'` in webpack config. |
| Auto public path (`document.currentScript`) | Already using explicit `publicPath: '/'`. No issue. |
| `document.createElement('link')` for prefetch/preload | Returns a fake element with no-op appendChild. Prefetch hints are irrelevant in native. |
| Script dedup via `getElementsByTagName` | Document polyfill tracks `createdScripts` array. Works as long as webpack's `data-webpack` attribute matching logic is satisfied. |
| `installedChunks` state model differs between web and webworker targets | Web target uses `0`/`undefined`/`[resolve,reject,promise]` (3 states) vs webworker's `1`/`undefined` (2 states). The JSONP loader handles all states correctly since it's the standard web path. |
| `window` global expected by some webpack runtime code | Set `globalThis.self = globalThis` in polyfill setup. Don't set `globalThis.window` unless needed — keep the surface minimal. |
| `document.head` timing | `document.head` is null until `<head>` shadow node is created. Webpack chunk loading only happens after initial bundle loads (SSR: after tree creation; CSR: during rendering), so `<head>` exists by then. Verify this ordering. |

## Summary

| Metric | Value |
|--------|-------|
| Lines added | ~200 |
| Lines deleted | ~1860 |
| Webpack internals coupling | Low (uses standard script-tag contract via Part 1 polyfill) |
| Source map support | Yes (`engine.evaluate(code, sourceURL:)`) |
| Webpack target change | `webworker` → `web` |
| Webpack plugin needed | `ExposeInstalledChunks` (for Fast Refresh) |
| Future webpack upgrades | Stable — script tag loading is a public contract |
