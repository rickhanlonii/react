# Step 1a: Bridge POST Support

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the bridge's `$$fetch` to support POST requests with a request body — the foundation for all server action communication.

**Architecture:** The current `$$fetch` signature is `$$fetch(url, headers, callback)`. Extend to `$$fetch(url, options, callback)` where `options` is a dictionary with `headers`, `method`, and `body` keys. Keep backward compatibility so existing callers (which pass a flat headers dict) continue to work.

**Tech Stack:** Swift (URLSession), JavaScriptCore bridge, JavaScript

---

### Task 1: Extend `$$fetch` to support POST with body

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` — `registerNetworking()` function at line 769
- Modify: `packages/react-dom-native/src/bridge/index.js` — `fetch` export at line 93
- Modify: `packages/react-dom-native/src/bridge/types.d.ts` — `$$fetch` declaration at line 119
- Modify: `packages/react-dom-native/src/bridge/__tests__/bridge.test.js` — add POST test case

**Step 1: Update Swift `$$fetch` to accept method and body parameters**

The current signature is `$$fetch(url, headers, callback)`. Extend to `$$fetch(url, options, callback)` where `options` is a dictionary with `headers`, `method`, and `body` keys. Keep backward compatibility — if `options` is a dictionary without `method`, default to GET. The existing callers pass `(url, headersDict, callback)` and the backward compat logic treats any dict without `method`/`body`/`headers` keys as a flat headers dict.

In `Bindings+Registration.swift`, replace the body of `registerNetworking()` (lines 769-836):

```swift
func registerNetworking() {
    // $$fetch(url, options, callback) -> void
    // options: { headers?: {}, method?: string, body?: string }
    // Backward compat: options can also be a flat headers dict (old API)
    // Asynchronous - URLSession runs on background thread, callbacks
    // dispatched to main thread.
    engine.setGlobalFunction("$$fetch") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }

        let urlString = engine.toString(args[0]) ?? ""
        let optionsDict = engine.toDictionary(args[1]) ?? [:]
        let callback = args[2]

        guard let url = URL(string: urlString) else {
            DispatchQueue.main.async { [weak engine] in
                guard let engine = engine else { return }
                _ = engine.callFunction(callback, args: [
                    engine.makeString("error"),
                    engine.makeString("Invalid URL: \(urlString)")
                ])
            }
            return nil
        }

        var request = URLRequest(url: url)

        // Method (default GET)
        if let method = optionsDict["method"] as? String {
            request.httpMethod = method.uppercased()
        }

        // Headers — check for nested headers dict first, fall back to flat dict
        if let headersDict = optionsDict["headers"] as? [String: Any] {
            for (key, value) in headersDict {
                if let stringValue = value as? String {
                    request.setValue(stringValue, forHTTPHeaderField: key)
                }
            }
        } else {
            // Backward compat: if options IS the headers dict (old API)
            // Treat any key that isn't a known option key as a header
            for (key, value) in optionsDict {
                if key != "method" && key != "body" && key != "headers",
                   let stringValue = value as? String {
                    request.setValue(stringValue, forHTTPHeaderField: key)
                }
            }
        }

        // Body (string or Data)
        if let body = optionsDict["body"] as? String {
            request.httpBody = body.data(using: .utf8)
        }

        // Protect callback from GC during async work
        engine.protect(callback)

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async { [weak engine] in
                guard let engine = engine else { return }

                if let error = error {
                    _ = engine.callFunction(callback, args: [
                        engine.makeString("error"),
                        engine.makeString(error.localizedDescription)
                    ])
                    engine.unprotect(callback)
                    return
                }

                if let httpResponse = response as? HTTPURLResponse,
                   httpResponse.statusCode >= 400 {
                    print("[react-dom-native] Fetch error: HTTP \(httpResponse.statusCode) for \(urlString)")
                }

                if let data = data, let text = String(data: data, encoding: .utf8) {
                    _ = engine.callFunction(callback, args: [
                        engine.makeString("data"),
                        engine.makeString(text)
                    ])
                }

                _ = engine.callFunction(callback, args: [
                    engine.makeString("end"),
                    engine.makeString("")
                ])
                engine.unprotect(callback)
            }
        }
        task.resume()
        return nil
    }
}
```

**Step 2: Update JS bridge wrapper**

In `packages/react-dom-native/src/bridge/index.js`, update the fetch export (line 93-95):

```js
exports.fetch = function fetch(url, options, callback) {
  return $$fetch(url, options, callback);
};
```

**Note:** The parameter rename from `headers` to `options` is purely cosmetic on the JS side — both are passed through as-is to the Swift `$$fetch` global. Existing callers still pass `(url, headersDict, callback)` and the Swift backward compat handles it.

**Step 3: Update type declaration**

In `packages/react-dom-native/src/bridge/types.d.ts` (line 119), update the `$$fetch` signature to document the new options format.

**Step 4: Update existing bridge test**

The existing test at `packages/react-dom-native/src/bridge/__tests__/bridge.test.js:378-391` tests `fetch` with `(url, headers, callback)`. Add a new test case for POST with options:

```js
it('calls the bridge global with options dict for POST', () => {
  const callback = jest.fn();
  const options = {
    method: 'POST',
    headers: {'Content-Type': 'text/x-component'},
    body: 'action data',
  };

  Bridge.fetch('https://example.com/action', options, callback);

  expect(mockFetch).toHaveBeenCalledWith(
    'https://example.com/action',
    options,
    callback,
  );
});
```

**Step 5: Verify existing callers still work**

Search for all callers of `$$fetch` and `bridge.fetch` — currently only `bridge/index.js:94` calls `$$fetch` directly. The backward compat handling in the Swift code ensures the old API still works (headers dict without method/body keys defaults to GET with those headers).

Run: `npm test`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift
git add packages/react-dom-native/src/bridge/index.js
git add packages/react-dom-native/src/bridge/types.d.ts
git add packages/react-dom-native/src/bridge/__tests__/bridge.test.js
git commit -m "feat: extend $$fetch bridge to support POST method and request body"
```

---

### Key codebase references
- **$$fetch registration:** `Bindings+Registration.swift:769-836` — the `registerNetworking()` function
- **Bridge fetch wrapper:** `bridge/index.js:93-95` — JS wrapper for `$$fetch` global
- **Bridge test:** `bridge/__tests__/bridge.test.js:378-391` — existing fetch test
- **Type declarations:** `bridge/types.d.ts:119` — `$$fetch` global declaration

---

## Testing & Verification

### Automated Tests

**Unit tests (`bridge.test.js`)**

The plan already adds a POST test case. The following additional test cases should also be added or verified in `packages/react-dom-native/src/bridge/__tests__/bridge.test.js`:

- **POST with options dict** (already in plan) — verify `$$fetch` is called with `{ method: 'POST', headers: {...}, body: 'action data' }`
- **Backward compat with old `(url, headers, callback)` signature** — verify that existing callers passing a flat headers dict (e.g., `{ Accept: 'text/x-component' }`) still work. The Swift backward compat logic should treat any dict without `method`/`body`/`headers` keys as a flat headers dict.
- **Error callback on invalid URL** — verify that passing an invalid URL (e.g., empty string or malformed URL) invokes the callback with `("error", "Invalid URL: ...")` rather than crashing
- **POST body forwarded correctly** — verify the options dict is passed through to the Swift `$$fetch` global exactly as provided, including the `body` string

**Fantom integration test (`tests/integration/fetch-post-itest.js`)**

Create a new integration test `tests/integration/fetch-post-itest.js` that tests the actual Swift URLSession POST path via the Fantom harness:

- POST to a local test server — verify the request reaches the server
- Verify the request method is POST (not GET)
- Verify the request body content is received correctly on the server side
- Verify custom headers (e.g., `Content-Type: text/x-component`) are set on the request
- Verify backward compat — call `$$fetch(url, flatHeadersDict, callback)` with the old API signature and confirm it defaults to GET with those headers

**Regression**

- Run `npm test` — all existing bridge tests must pass. The backward compat logic ensures no regressions for existing `$$fetch` callers (the Flight client's `createFromFetch` calls).
- Run `npm run test:fantom` — all existing integration tests must pass

### Manual Testing

1. Build the demo app using `/build demo`
2. Open the Falcon Demo simulator
3. Navigate to any existing fixture (e.g., Kitchen Sink or Staggered Loading)
4. Verify the app loads and renders correctly — existing GET fetches for RSC Flight data still work
5. Check Xcode console for any errors related to networking (there should be none)
6. Use `npm run app:log-start` followed by `npm run app:log-read` to capture logs during fixture navigation — verify no `[react-dom-native] Fetch error` messages appear
7. Navigate through multiple fixtures to confirm no regressions in data loading

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly (navigate through fixture list)
- [ ] Staggered Loading fixture loads with partial prerender — hydration starts in parallel to SSR stream
- [ ] Counter in Staggered Loading fixture can be incremented after hydration
- [ ] Kitchen Sink fixture renders all elements correctly
- [ ] No console errors during normal operation
- [ ] `npm test` passes all existing test suites
- [ ] `npm run test:fantom` passes all integration tests

### Smoke Test: Staggered Loading

This smoke test verifies existing networking functionality is preserved after the `$$fetch` changes:

1. Start the dev server: `cd example && npm run dev`
2. Load the Staggered Loading fixture via prerender endpoint (`/prerender/05-nested-suspense`)
3. Verify the shell renders immediately (skeleton placeholders visible)
4. Verify sections stream in progressively (500ms, 1000ms, 2000ms, 3000ms intervals)
5. Verify hydration starts while SSR stream is still in progress:
   - Use `npm run app:log-start` before loading
   - After loading, `npm run app:log-read` should show hydration messages interleaved with SSR boundary reveals
   - The Counter component in Section 1 should become interactive before Section 4 finishes loading
6. Tap the Counter increment button (use `npm run app:snapshot-ui -- --filter Counter` to find it, then `npm run app:tap`)
7. Verify the counter value increases from 0 to 1
8. Take a screenshot: `npm run app:screenshot` to verify visual rendering
