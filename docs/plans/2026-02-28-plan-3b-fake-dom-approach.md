# Plan 3b: Replace Flight Client Fork via Fake DOM (Script Tag Polyfill)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Same as Plan 3 — replace the custom flight-client fork with `react-server-dom-webpack/client` — but instead of shimming `__webpack_require__.f.i` directly, polyfill the minimal DOM APIs that webpack's browser-target JSONP loader needs (`document.createElement('script')`, `document.head.appendChild`, `script.onload/onerror`). This lets webpack's standard chunk loading code work unmodified.

**Architecture:** A minimal fake DOM layer in Swift (injected like console/performance polyfills) provides `document`, `document.head`, and script elements. When `document.head.appendChild(script)` is called, Swift intercepts it, fetches the URL via `URLSession`, evaluates the code via `engine.evaluate()` (with source URL for proper source maps), and fires `script.onload`. Webpack's `target` changes from `'webworker'` to a custom target (or `'web'`) so it emits the JSONP/script-tag loader instead of `importScripts`.

**Tech Stack:** Swift (JSRuntime.swift), JavaScriptCore, webpack (target change + config), react-server-dom-webpack/client

**Depends on:** Plan 1 (ReadableStream polyfill), Plan 2 (JS instruction support)

**Trade-offs vs Plan 3:**

| | Plan 3 (shim `__webpack_require__.f.i`) | Plan 3b (fake DOM) |
|---|---|---|
| Webpack target | `webworker` (unchanged) | `web` (browser target) |
| Chunk loading mechanism | Custom shim replacing `importScripts` handler | Webpack's standard JSONP script-tag loader, unmodified |
| DOM polyfill needed | None | Minimal: `document`, `document.head`, script elements |
| Webpack plugin needed | `ExposeInstalledChunks` for Fast Refresh | None — `installedChunks` already accessible via script-tag dedup |
| Source maps | `eval()` in JS (no source URL) | `engine.evaluate(code, sourceURL:)` in Swift (proper source maps) |
| Code eval | JS-side `(0, eval)(body)` | Swift-side `engine.evaluate(code, sourceURL: url)` — same as current `FlightStreamClient` |
| Coupling to webpack internals | Directly replaces `__webpack_require__.f.i` — breaks if webpack changes the handler signature | Uses webpack's public contract (`<script>` tags) — stable across versions |
| Complexity | ~20 lines shim + webpack plugin | ~80 lines fake DOM + Swift bridge function |
| Auto public path | Must set `publicPath: '/'` explicitly | Needs `document.currentScript` or explicit `publicPath` |

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

The key insight: `appendChild(script)` is the trigger point. In a browser, the browser engine fetches `script.src` and evaluates it. In JSC, we intercept `appendChild` in Swift, fetch via `URLSession`, and call `engine.evaluate()`.

### DOM APIs webpack's loader actually uses

From `LoadScriptRuntimeModule.js` and `JsonpChunkLoadingRuntimeModule.js`:

| API | Used For | How We Handle |
|-----|----------|---------------|
| `document.createElement('script')` | Create script element | Return a fake JS object |
| `document.head.appendChild(script)` | **Trigger fetch + execute** | Swift bridge: URLSession fetch → `engine.evaluate()` → fire `onload` |
| `script.src` (setter/getter) | Set URL to load | Plain JS property |
| `script.onload` (setter) | Success callback | Plain JS property, called by Swift after eval |
| `script.onerror` (setter) | Error callback | Plain JS property, called by Swift on fetch failure |
| `script.setAttribute(name, value)` | Set nonce, data-webpack, fetchpriority | Store in a Map (only `data-webpack` matters for dedup) |
| `script.getAttribute(name)` | Read attributes for dedup check | Read from Map |
| `script.parentNode` | Check parent before removeChild | Return fake head ref |
| `script.parentNode.removeChild(script)` | Cleanup after load | No-op |
| `document.getElementsByTagName('script')` | Find existing scripts for dedup | Return array of created scripts |
| `document.head` (getter) | Where to append | Return fake head object |
| `document.baseURI` | Public path fallback | Return server origin string |
| `document.createElement('link')` | Prefetch/preload hints | Return a no-op fake element |

Most of these are trivial getters/setters. The only one with real behavior is `appendChild`.

---

### Task 1: Add Flight data receiver to entry.js

*Identical to Plan 3, Task 1.* Set up the `self.__next_f` global array pattern.

**Files:**
- Modify: `packages/react-dom-native/src/entry.js`

*(See Plan 3, Task 1 for full details — the Flight data receiver code is the same regardless of chunk loading approach.)*

**Commit:**
```
feat: add inline Flight data receiver (Next.js self.__next_f pattern)
```

---

### Task 2: Implement native fake DOM for webpack script loading

Create a minimal fake DOM as **native Swift objects** registered in JSC via `engine.makeObject()`, `engine.setProperty()`, and `engine.makeFunction()` — the same pattern used for `console` (JSRuntime.swift lines 43-114). No JS polyfill strings. The `appendChild` function is a native Swift closure that directly calls `URLSession` and `engine.evaluate(code, sourceURL:)`.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`

**Step 1: Add `setupDOMPolyfill()` method**

Add a new private method to `JSRuntime`, following the same pattern as `setupPerformancePolyfill()` and `setupTimerPolyfills()`:

```swift
private func setupDOMPolyfill() {
    let eng = engine

    // Track created script elements for getElementsByTagName dedup
    var createdScripts: [JSValueRef] = []

    // --- Helper: create a fake element object ---
    func makeFakeElement(_ tag: String) -> JSValueRef {
        let element = eng.makeObject()
        let attrs = eng.makeObject()

        eng.setProperty(element, "_tag", eng.makeString(tag))
        eng.setProperty(element, "_attrs", attrs)
        eng.setProperty(element, "parentNode", eng.makeNull())

        // element.setAttribute(name, value)
        let setAttributeFn = eng.makeFunction { [weak eng] args in
            guard let eng = eng, args.count >= 2 else { return nil }
            let name = eng.toString(args[0]) ?? ""
            eng.setProperty(attrs, name, args[1])
            return nil
        }
        eng.setProperty(element, "setAttribute", setAttributeFn)

        // element.getAttribute(name)
        let getAttributeFn = eng.makeFunction { [weak eng] args in
            guard let eng = eng, args.count >= 1 else { return nil }
            let name = eng.toString(args[0]) ?? ""
            if name == "src" {
                return eng.getProperty(element, "src")
            }
            return eng.getProperty(attrs, name)
        }
        eng.setProperty(element, "getAttribute", getAttributeFn)

        // element.removeChild() — no-op
        let removeChildFn = eng.makeFunction { _ in nil }
        eng.setProperty(element, "removeChild", removeChildFn)

        return element
    }

    // --- document.head ---
    let fakeHead = makeFakeElement("head")

    // document.head.appendChild(script) — the core: fetches + evaluates script.src
    let appendChildFn = eng.makeFunction { [weak self, weak eng] args in
        guard let self = self, let eng = eng, args.count >= 1 else { return nil }
        let element = args[0]

        let tag = eng.toString(eng.getProperty(element, "_tag") ?? eng.makeString("")) ?? ""
        guard tag == "script" else { return nil }
        guard let srcRef = eng.getProperty(element, "src"),
              !eng.isUndefined(srcRef) && !eng.isNull(srcRef),
              let src = eng.toString(srcRef),
              !src.isEmpty else { return nil }

        // Set parentNode for cleanup (script.parentNode.removeChild)
        eng.setProperty(element, "parentNode", fakeHead)
        createdScripts.append(element)
        eng.protect(element)

        // Fetch the script URL via URLSession and evaluate in JSC
        guard let url = URL(string: src) else {
            // Fire onerror
            if let onerror = eng.getProperty(element, "onerror") {
                let event = eng.makeObject()
                eng.setProperty(event, "type", eng.makeString("error"))
                eng.setProperty(event, "target", element)
                _ = eng.callFunction(onerror, args: [event])
            }
            eng.unprotect(element)
            return nil
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak eng] data, _, error in
            DispatchQueue.main.async {
                guard let eng = eng else { return }
                defer { eng.unprotect(element) }

                if error != nil || data == nil {
                    // Fire onerror
                    if let onerror = eng.getProperty(element, "onerror") {
                        let event = eng.makeObject()
                        eng.setProperty(event, "type", eng.makeString("error"))
                        eng.setProperty(event, "target", element)
                        _ = eng.callFunction(onerror, args: [event])
                    }
                    return
                }

                guard let code = String(data: data!, encoding: .utf8) else { return }

                // Evaluate with sourceURL for proper source maps + debugger
                eng.evaluate(code, sourceURL: url)

                // Fire onload
                if let onload = eng.getProperty(element, "onload") {
                    let event = eng.makeObject()
                    eng.setProperty(event, "type", eng.makeString("load"))
                    eng.setProperty(event, "target", element)
                    _ = eng.callFunction(onload, args: [event])
                }
            }
        }.resume()

        return nil
    }
    eng.setProperty(fakeHead, "appendChild", appendChildFn)

    // --- document object ---
    let doc = eng.makeObject()
    eng.setProperty(doc, "head", fakeHead)
    eng.setProperty(doc, "baseURI", eng.makeString(""))
    eng.setProperty(doc, "currentScript", eng.makeNull())

    // document.createElement(tag) — returns a fake element
    let createElementFn = eng.makeFunction { [weak eng] args in
        guard let eng = eng, args.count >= 1 else { return nil }
        let tag = eng.toString(args[0]) ?? ""
        return makeFakeElement(tag)
    }
    eng.setProperty(doc, "createElement", createElementFn)

    // document.getElementsByTagName(tag) — returns tracked scripts for dedup
    let getElementsByTagNameFn = eng.makeFunction { [weak eng] args in
        guard let eng = eng, args.count >= 1 else { return nil }
        let tag = eng.toString(args[0]) ?? ""
        if tag == "script" {
            return eng.makeArray(createdScripts)
        }
        return eng.makeArray([])
    }
    eng.setProperty(doc, "getElementsByTagName", getElementsByTagNameFn)

    engine.setGlobalProperty("document", doc)
}
```

**Step 2: Call from init()**

In `JSRuntime.init()`, add the call after `setupTimerPolyfills()` and before any bundle loading:

```swift
// Fake DOM for webpack browser-target chunk loading
setupDOMPolyfill()
```

**Step 3: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: PASS

**Step 4: Commit**

```
feat: add native fake DOM for webpack browser-target chunk loading

Registers minimal document/head/script objects in JSC as native Swift
objects (same pattern as console). document.head.appendChild(script)
is a native Swift closure that fetches via URLSession and evaluates
with engine.evaluate(code, sourceURL:) for proper source map support.
No JS polyfill strings — all DOM objects are Swift-backed.
```

---

### Task 3: Switch webpack target from webworker to web

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
// 'web' target uses script tags for chunk loading, which we polyfill
// in JSRuntime.setupDOMPolyfill(). This gives us webpack's standard
// JSONP chunk loader with proper async loading and dedup.
target: 'web',
```

**Step 2: Keep explicit publicPath**

The `publicPath: '/'` is already set explicitly (line 27), which is important — the `'web'` target's auto public path detection uses `document.currentScript` which our fake DOM returns `null` for. Explicit publicPath bypasses this.

**Step 3: Verify globalObject is still correct**

Keep `globalObject: 'globalThis'` — this ensures the JSONP push handler uses `globalThis["webpackChunk..."]` instead of `window["webpackChunk..."]` (which would fail since there's no `window` in JSC). Check the webpack docs — `target: 'web'` may force `globalObject` to `self` or `window`. If so, we need to ensure `globalThis.self = globalThis` is set (the polyfill in Task 2 doesn't set `window`).

**Step 4: Remove the importScripts comment**

The comments about `importScripts` on lines 30-33 are no longer relevant.

**Step 5: Check if ExposeInstalledChunks plugin is still needed**

With `target: 'web'`, the JSONP loader uses a different `installedChunks` state model:
- `0` = loaded
- `undefined` = not loaded
- `[resolve, reject, promise]` = currently loading

The script dedup in `__webpack_require__.l` checks existing `<script>` tags via `document.getElementsByTagName('script')`, so webpack's standard dedup works with the fake DOM. For Fast Refresh, we still need to clear `installedChunks` — check if the variable is accessible. If not, keep the `ExposeInstalledChunks` plugin from Plan 3.

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

### Task 4: Replace renderFromStream and hydrateFromStream

*Identical to Plan 3, Task 3.* Replace custom flight-client with `createFromReadableStream`.

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

### Task 5: Update SSR server to emit JS instructions

*Identical to Plan 3, Task 4.* Replace `["D", row]` with `["JS", ...]` instructions.

**Files:**
- Modify: `example/server/ssr-server.js`

**Commit:**
```
feat: emit Flight data as JS instructions in SSR server
```

---

### Task 6: Update Swift — remove FlightStreamClient, update CSR and Fast Refresh

*Similar to Plan 3, Task 5, but Fast Refresh chunk reloading is simpler.*

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`
- Modify: `packages/react-dom-native/src/entry.js`

**Steps 1-4: Same as Plan 3, Task 5**

Remove D-row buffering, simplify `hydrateSurface`, update CSR path, create `FlightHTTPStreamDelegate`.

**Step 5: Update Fast Refresh**

With the fake DOM approach, Fast Refresh chunk reloading can use `__webpack_require__.l` directly (webpack's standard loadScript), since the fake DOM handles the actual fetch+eval. Add `$$refreshChunks` to `entry.js`:

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
    // fake DOM's tracking so getElementsByTagName doesn't find them.
    // The fake DOM tracks scripts internally — add a $$clearScriptCache
    // helper if needed.

    // Re-load via webpack's standard loadScript (uses fake DOM)
    var promises = [];
    for (var i = 0; i < chunkIds.length; i++) {
      promises.push(__webpack_require__.e(chunkIds[i]));
    }
    return Promise.all(promises);
  };
}
```

Note: The script dedup in `__webpack_require__.l` checks `document.getElementsByTagName('script')` for existing scripts with matching `data-webpack` attributes. For Fast Refresh to re-fetch, we need to either:
- Remove the matching entry from `createdScripts` array (add `$$clearScriptCache(key)` to the fake DOM)
- Or clear `installedChunks[chunkId]` (which short-circuits before `__webpack_require__.l` is called)

The `ExposeInstalledChunks` plugin approach from Plan 3 works here too and is simpler.

**Step 6: Update performFullReset**

Same as Plan 3 — clear `__webpack_require__.ic` (or clear `createdScripts` in the fake DOM).

**Step 7-9: Same as Plan 3**

Remove FlightStreamClient references, verify Swift tests pass, commit.

**Commit:**
```
refactor: remove FlightStreamClient, use fake DOM for chunk loading
```

---

### Task 7-11: Identical to Plan 3, Tasks 6-10

- Task 7: Verify E2E tests pass
- Task 8: Update Fantom integration tests
- Task 9: Delete custom Flight client + FlightStreamClient.swift + FlightStreamDelegate.swift + FlightStreamClientTests.swift
- Task 10: Remove D instruction support
- Task 11: Full verification

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `target: 'web'` may set `globalObject` to `window` or `self` | Verify after build. If needed, set `globalThis.window = globalThis` or keep explicit `globalObject: 'globalThis'` in webpack config. |
| Auto public path (`document.currentScript`) | Already using explicit `publicPath: '/'`. No issue. |
| `document.createElement('link')` for prefetch/preload | Returns a fake element with no-op appendChild. Prefetch hints are irrelevant in native. |
| Script dedup via `getElementsByTagName` | Fake DOM tracks `createdScripts` array. Works as long as webpack's `data-webpack` attribute matching logic is satisfied. |
| `installedChunks` state model differs between web and webworker targets | Web target uses `0`/`undefined`/`[resolve,reject,promise]` (3 states) vs webworker's `1`/`undefined` (2 states). The JSONP loader handles all states correctly since it's the standard web path. |
| `window` global expected by some webpack runtime code | Set `globalThis.self = globalThis` in fake DOM. Don't set `globalThis.window` unless needed — keep the surface minimal. |
| Existing code that checks `typeof document !== 'undefined'` | May accidentally detect a browser environment. Audit for any code that branches on `document` existence. |
| Third-party code detecting browser via `document` | Unlikely in this codebase (no DOM rendering), but worth checking if any dependency behaves differently with `document` present. |

## Summary

| Metric | Plan 3 (shim) | Plan 3b (fake DOM) |
|--------|---------------|-------------------|
| Lines added | ~200 | ~250 |
| Lines deleted | ~1860 | ~1860 |
| Webpack internals coupling | High (replaces `__webpack_require__.f.i`) | Low (uses standard script-tag contract) |
| Source map support | No (JS `eval`) | Yes (`engine.evaluate(code, sourceURL:)`) |
| Webpack target change | None (`webworker`) | `webworker` → `web` |
| DOM polyfill surface | None | ~80 lines (document, head, script elements) |
| Webpack plugin needed | `ExposeInstalledChunks` | Same (for Fast Refresh) |
| Future webpack upgrades | May break if handler signature changes | Stable — script tag loading is a public contract |
