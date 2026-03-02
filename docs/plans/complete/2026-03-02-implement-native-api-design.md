# Native API Design — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the ReactDomNativeKit Swift public API to mirror react-dom's four-tier surface — `createRoot + render(url:)`, `hydrateRoot(view, url:)`, `prerender()`, `resume()`.

**Architecture:** The package keeps URLSession internally — the app decides *what URL*, the package handles *how to fetch*. `hydrateRoot(view, url:)` replaces the two-call `renderWithSSR + hydrateRoot` with a single free function. The SSR stream already contains everything (view instructions, embedded Flight data, bootstrap script URL). `render(url:)` is a cosmetic rename of `render(serverURL:)`. `prerender` and `resume` are stubs. Hot reload works unchanged because stored URLs can be re-fetched.

**Tech Stack:** Swift (ReactDomNativeKit/UIKit/JSC), JavaScript (NativeFizzConfig.js, ssr-server.js)

**Design spec:** `docs/plans/2026-03-02-native-api-design.md`

---

## Task 1: Verify Current Functionality

Confirm the demo app works correctly before making any changes.

**Step 1: Build and run the demo app**

Run: Use `/build demo` skill to build and run the Falcon Demo app.

**Step 2: Load the Nested Suspense fixture**

Navigate to Suspense → Nested Suspense in the fixture list. Wait for all 4 Suspense boundaries to resolve (Fast 500ms, Medium 1000ms, Slow 2000ms, Slowest 3000ms).

**Step 3: Verify counter interactivity**

Tap the `+` button (counter-increment) and `-` button (counter-decrement) to verify the count changes. Confirm no hydration mismatch errors appear in the console.

Run: `npm run app:log-start` then interact with buttons, then `npm run app:log-read` and check for any "hydration" or "mismatch" errors.

**Step 4: Verify DevTools inspector**

Run: Use `/devtools` skill to open Chrome DevTools. Verify the component tree is visible in the React tab and you can inspect elements.

**Step 5: Verify profiling**

In Chrome DevTools, start a profiling session. Interact with the counter buttons. Stop profiling. Verify that profiling data appears with commit information.

**Step 6: Verify profiling tracks**

Verify the performance timeline shows Shadow Tree and Layout tracks with timing data for SSR First Paint, SSR Reveals, and React commits.

**Step 7: Commit checkpoint**

No code changes — this is verification only. If anything fails, fix it before proceeding.

---

## Task 2: Add New Supporting Types

Add `PrerenderResult` and update `RootError` to match the spec. No behavior changes.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Add PrerenderResult struct**

Add after the `RootOptions` struct in `Root.swift`:

```swift
/// Result of a prerender operation.
public struct PrerenderResult {
    /// Serialized SSR instruction stream — replayable without JS.
    public let prelude: Data

    /// Opaque deferred state — send to server for resume.
    public let postponed: Data
}
```

**Step 2: Update RootError enum**

Add `hydrationFailed`, `prerenderFailed`, `resumeFailed`. Remove `downloadFailed`, `invalidBundleData`, `hydrationDataMissing`, `hydrationDataSerializationFailed` (no longer needed with the unified API).

```swift
public enum RootError: Error, CustomStringConvertible {
    case bundleLoadFailed(Error)
    case jsException(String)
    case alreadyUnmounted
    case runtimeNotInitialized
    case hydrationFailed(Error)
    case prerenderFailed(Error)
    case resumeFailed(Error)

    public var description: String {
        switch self {
        case .bundleLoadFailed(let error):
            return "Failed to load bundle: \(error.localizedDescription)"
        case .jsException(let message):
            return "JavaScript exception: \(message)"
        case .alreadyUnmounted:
            return "Cannot render to an unmounted root"
        case .runtimeNotInitialized:
            return "Runtime not initialized — call render() first"
        case .hydrationFailed(let error):
            return "Hydration failed: \(error.localizedDescription)"
        case .prerenderFailed(let error):
            return "Prerender failed: \(error.localizedDescription)"
        case .resumeFailed(let error):
            return "Resume failed: \(error.localizedDescription)"
        }
    }
}
```

**Step 3: Fix any compile errors from RootError changes**

Search for usages of removed error cases and update them.

Run: `npm run test:swift` to verify compilation.

**Step 4: Commit**

```
feat: add PrerenderResult type and update RootError for new API surface
```

---

## Task 3: Add `prerender()` and `resume()` Stubs

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Prerender.swift`
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Resume.swift`

**Step 1: Create Prerender.swift**

```swift
import UIKit

public func prerender(_ container: UIView, bundle: String) async throws -> PrerenderResult {
    throw RootError.prerenderFailed(
        NSError(domain: "ReactDomNativeKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "prerender(bundle:) is not yet implemented"])
    )
}

public func prerender(_ container: UIView, url: URL) async throws -> PrerenderResult {
    throw RootError.prerenderFailed(
        NSError(domain: "ReactDomNativeKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "prerender(url:) is not yet implemented"])
    )
}
```

**Step 2: Create Resume.swift**

```swift
import UIKit

public func resume(_ container: UIView, postponed: Data, url: URL) throws -> Root {
    throw RootError.resumeFailed(
        NSError(domain: "ReactDomNativeKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "resume() is not yet implemented"])
    )
}
```

**Step 3: Verify compilation**

Run: `npm run test:swift`

**Step 4: Commit**

```
feat: add prerender() and resume() stubs (not yet implemented)
```

---

## Task 4: Add Bootstrap Script Instruction to SSR Stream

The SSR stream needs to tell the native side which JS bundle to load for hydration. Currently this comes from `ReactRuntime.shared.devBundleURL` which the app sets manually. Moving it into the stream means `hydrateRoot(url:)` is self-contained.

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzConfig.js` — emit `["BOOT", url]`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/InstructionStreamParser.swift` — parse it
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` — forward via callback
- Modify: `example/server/ssr-server.js` — pass `bootstrapScripts` option

**Step 1: Read NativeFizzConfig.js**

Read: `packages/react-dom-native/src/server/NativeFizzConfig.js`

Find where bootstrap scripts / preamble is handled. In react-dom HTML, `bootstrapScripts` emits `<script>` tags. In the native format, this is currently a no-op.

**Step 2: Emit `["BOOT", url]` in NativeFizzConfig.js**

When `bootstrapScripts` is provided in `renderToPipeableStream` options, emit a `["BOOT", url]` instruction for each script URL. Emit it during the preamble/bootstrap phase so it arrives early in the stream (before the shell completes).

**Step 3: Parse `"BOOT"` in InstructionStreamParser.swift**

Add a case for `"BOOT"` in the instruction type switch. Extract the URL string and call a new delegate method:

```swift
func didReceiveBootstrapURL(_ url: String)
```

**Step 4: Forward in SSRCoordinator**

Add `onBootstrapURLReceived: ((String) -> Void)?` callback. Implement the delegate method to call it.

**Step 5: Pass `bootstrapScripts` in ssr-server.js**

Add to the `renderToPipeableStream` call:

```javascript
const { pipe } = renderToPipeableStream(rootElement, {
  bootstrapScripts: ['/bundle.js'],
  // ... existing options
});
```

**Step 6: Verify the instruction appears in the stream**

Start the dev servers and `curl` the SSR endpoint. Verify `["BOOT","/bundle.js"]` appears early in the output.

Run: `curl -s http://localhost:6001/ssr/01-rsc-only | head -5`

**Step 7: Run tests**

Run: `npm test && npm run test:swift`

**Step 8: Commit**

```
feat: add bootstrap script instruction ["BOOT", url] to SSR stream
```

---

## Task 5: Implement `hydrateRoot(view, url:)` Free Function

The core change — a single free function that replaces `renderWithSSR(serverURL:)` + `hydrateRoot(serverURL:)`. Accepts a URL, manages all streaming/fetching internally.

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/HydrateRoot.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` — add `startHydration(url:)` method

**Step 1: Create HydrateRoot.swift**

```swift
import UIKit

/// Hydrates server-rendered content for instant display + interactivity.
///
/// The SSR stream at the given URL contains everything needed:
/// 1. View instructions — parsed incrementally, build shadow tree, create UIKit views
/// 2. Suspense boundary instructions — fallback/reveal pairs, progressively revealed
/// 3. Flight data — embedded as JS instructions, extracted and buffered for hydration
/// 4. Bootstrap script URL — tells the package what JS bundle to load
///
/// The package manages all streaming and fetching internally.
///
/// - Parameters:
///   - container: The UIView to render into.
///   - url: URL of the SSR endpoint (e.g. "http://localhost:6001/ssr/page").
///   - options: Optional configuration (error callbacks).
/// - Returns: A Root that will become interactive after hydration completes.
public func hydrateRoot(
    _ container: UIView,
    url: String,
    options: RootOptions = RootOptions()
) -> Root {
    let root = Root(container: container, options: options)
    root.startHydration(url: url)
    return root
}
```

**Step 2: Add `startHydration(url:)` to Root+SSR.swift**

This combines `renderWithSSR` + `hydrateRoot` into a single internal method. It:

1. Reserves a surfaceId
2. Sets up SSR infrastructure (parser, coordinator, tree builder) — reuse existing setup from `renderWithSSR`
3. Wires the `onBootstrapURLReceived` callback to boot the runtime and load the bundle from the URL in the stream (instead of `devBundleURL`)
4. Starts a URLSession data task to the SSR URL (same mechanism as current `renderWithSSR`)
5. Wires root completion (first paint) + hydration orchestration — same as current
6. Stores the URL for hot reload recovery

The key difference from current code: instead of a separate `hydrateRoot(serverURL:)` call that boots the runtime from `devBundleURL`, the bootstrap URL comes from the SSR stream's `["BOOT", url]` instruction. When that instruction arrives, the method:
- Calls `ReactRuntime.shared.boot()` (which still downloads the bundle from `devBundleURL` or the bootstrap URL)
- Wires hydration callbacks
- Sets up `doHydrate` closure (same as current `hydrateRoot`)
- Queues hydration until shell is complete

**Implementation approach:** Extract the common SSR setup code from `renderWithSSR` and the hydration orchestration from `hydrateRoot(serverURL:)` into `startHydration(url:)`. Wire the bootstrap callback to trigger the hydration flow that currently lives in `hydrateRoot(serverURL:)`.

**Step 3: Update ReactRuntime bundle loading to use bootstrap URL**

When `startHydration` receives a bootstrap URL from the stream, resolve the full bundle URL using the SSR URL's origin:
- Bootstrap URL: `/bundle.js`
- SSR URL: `http://localhost:6001/ssr/page`
- Resolved: `http://localhost:6001/bundle.js`

Wait — the bundle is served from the Flight server (port 6000), not the SSR server (port 6001). The bootstrap URL in the stream should be a full URL or resolvable against the Flight server origin. Since the `ssr-server.js` knows the Flight server's origin (it fetches Flight data from it), it can emit the full URL.

Update `ssr-server.js` to emit `["BOOT", "http://localhost:6000/bundle.js"]` or make the bootstrap URL relative to the Flight server origin. Alternatively, set `ReactRuntime.shared.devBundleURL` from the bootstrap URL when it arrives.

For simplicity: when `startHydration` receives the bootstrap URL, set `ReactRuntime.shared.devBundleURL` to the resolved URL, then call `boot()`. This reuses the existing bundle-loading infrastructure with zero changes to `ReactRuntime`.

**Step 4: Store URL in RenderMode for hot reload**

```swift
self.renderMode = .ssr(url: url)
```

Update the `RenderMode` enum:
```swift
enum RenderMode {
    case csr(serverURL: String)
    case ssr(url: String)
}
```

**Step 5: Verify compilation**

Run: `npm run test:swift`

**Step 6: Commit**

```
feat: add hydrateRoot(view, url:) free function combining SSR + hydration
```

---

## Task 6: Rename `render(serverURL:)` → `render(url:)`

Cosmetic rename of the CSR parameter for consistency with the spec.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Rename the parameter**

```swift
// Before:
public func render(serverURL: String, completion: ((Error?) -> Void)? = nil)

// After:
public func render(url: String, completion: ((Error?) -> Void)? = nil)
```

Update the method body: replace `serverURL` with `url` throughout.

**Step 2: Update RenderMode**

```swift
case .csr(let serverURL) → case .csr(let url)
```

Keep `renderMode = .csr(url: url)`.

**Step 3: Fix all callers**

Search for `render(serverURL:` and update to `render(url:`. This includes:
- `Root+HotReload.swift` rerender()
- E2E tests
- FalconApp.swift

**Step 4: Verify compilation**

Run: `npm run test:swift`

**Step 5: Commit**

```
refactor: rename render(serverURL:) to render(url:) for API consistency
```

---

## Task 7: Update FalconApp to Use New APIs

Migrate the demo app from the three-line pattern to one line.

**Files:**
- Modify: `example/Falcon/Falcon/FalconApp.swift`

**Step 1: Replace renderAndHydrate() with hydrateRoot()**

In `FixtureViewController`, replace:
```swift
#if DEBUG
ReactRuntime.shared.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
#endif

root = createRoot(view)
renderAndHydrate()

// where renderAndHydrate() does:
root?.renderWithSSR(serverURL: ssrURL) { ... }
root?.hydrateRoot(serverURL: flightURL) { ... }
```

With:
```swift
let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
root = hydrateRoot(view, url: ssrURL)
```

**Step 2: Remove the `renderAndHydrate()` method**

No longer needed — `hydrateRoot(view, url:)` handles everything.

**Step 3: Remove `ReactRuntime.shared.devBundleURL` from FalconApp**

The bootstrap URL now comes from the SSR stream. This line can be removed:
```swift
ReactRuntime.shared.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
```

Note: `devBundleURL` stays in `ReactRuntime` for backward compatibility / CSR path. It's just no longer set by the demo app for SSR.

**Step 4: Verify compilation**

Run: Build the app with `/build demo`.

**Step 5: Commit**

```
feat: migrate FalconApp to hydrateRoot(view, url:) — one call instead of three
```

---

## Task 8: Verify New SSR API Works

Same verification as Task 1, but now using the new `hydrateRoot(view, url:)` API.

**Step 1: Build and run the demo app**

Use `/build demo` to rebuild and run.

**Step 2: Load Nested Suspense fixture**

Navigate to Suspense → Nested Suspense. Verify all 4 boundaries resolve.

**Step 3: Verify counter interactivity**

Tap `+` and `-` buttons. Verify count changes with no hydration mismatch errors.

Run: `npm run app:log-start`, interact, `npm run app:log-read`.

**Step 4: Verify DevTools**

Use `/devtools` to verify inspector, profiling, and profiling tracks still work.

**Step 5: Verify hot reload**

1. Start the dev server: `cd example && npm run dev`
2. Modify a fixture file (e.g. change text in `05-nested-suspense.js`)
3. Verify the app reloads and shows the updated content
4. Verify Cmd+Shift+R full reset works

**Step 6: If anything fails, debug and fix before proceeding**

---

## Task 9: Update Root+HotReload for New APIs

Update the hot reload path to use `startHydration(url:)` for SSR surfaces.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+HotReload.swift`

**Step 1: Update `rerender()` for SSR case**

Replace:
```swift
case .ssr(let ssrURL, let flightURL):
    renderWithSSR(serverURL: ssrURL) { ... }
    hydrateRoot(serverURL: flightURL) { ... }
```

With:
```swift
case .ssr(let url):
    print("[Root] Re-rendering (SSR + hydration) — \(url)")
    startHydration(url: url)
```

**Step 2: Test hot reload**

1. Run the demo app with dev server
2. Modify a server component
3. Verify full reset reload works (shows ReloadBanner, re-renders correctly)
4. Modify a client component
5. Verify fast refresh works (state preserved)

**Step 3: Commit**

```
feat: update hot reload rerender() to use startHydration(url:) for SSR
```

---

## Task 10: Remove Old APIs

Remove the deprecated methods now that everything uses the new APIs.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/CreateRoot.swift`

**Step 1: Remove `renderWithSSR(serverURL:, completion:)`**

Delete the public method from Root+SSR.swift. `startHydration(url:)` replaces it.

**Step 2: Remove old `hydrateRoot(serverURL:, completion:)` method on Root**

Delete the public method from Root+SSR.swift. The free function `hydrateRoot(view, url:)` replaces it.

**Step 3: Update doc comments in CreateRoot.swift**

Update example code to show the new API:
```swift
/// // SSR + Hydration (recommended):
/// let root = hydrateRoot(view, url: "http://localhost:6001/ssr/page")
///
/// // Client-side rendering:
/// let root = createRoot(view)
/// root.render(url: "http://localhost:6000/fixtures/page")
```

**Step 4: Fix compile errors**

Search for all references to `renderWithSSR` and old `hydrateRoot(serverURL:)` and update.

**Step 5: Verify compilation**

Run: `npm run test:swift`

**Step 6: Commit**

```
refactor: remove renderWithSSR and old hydrateRoot(serverURL:) methods
```

---

## Task 11: Update Tests

Update E2E and integration tests for the new API surface.

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift`
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndCSRTests.swift`
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ProgressiveHydrationTests.swift`

**Step 1: Update EndToEndSSRTests**

Replace the two-call pattern:
```swift
root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/fixture") { ... }
root.hydrateRoot(serverURL: "\(Self.flightBaseURL)/fixtures/fixture") { ... }
```

With:
```swift
let ssrURL = "\(Self.ssrBaseURL)/ssr/fixture"
root = hydrateRoot(container, url: ssrURL)
```

Note: Tests need to wait for hydration to complete. The existing poll/wait mechanisms should work since they check for UIKit views in the container.

**Step 2: Update EndToEndCSRTests**

Rename `render(serverURL:)` → `render(url:)`:
```swift
root.render(url: "\(Self.flightBaseURL)/fixtures/01-rsc-only") { ... }
```

**Step 3: Update ProgressiveHydrationTests**

These use `feedSSRData()` (internal test hooks). Verify they still compile and pass. The internal test hooks don't change — they bypass the public API.

**Step 4: Run all tests**

Run: `npm run test:swift && npm run test:e2e-swift`

**Step 5: Fix any failures**

**Step 6: Commit**

```
test: update E2E and integration tests for new API surface
```

---

## Task 12: Final Verification

Complete the same verification as Task 1 to confirm nothing regressed.

**Step 1: Build and run demo app**

Use `/build demo`.

**Step 2: Verify Nested Suspense fixture**

- All 4 boundaries resolve
- Counter buttons work (increment/decrement)
- No hydration mismatch errors in console

**Step 3: Verify DevTools**

- Inspector works (component tree visible)
- Profiling works (commit data appears)
- Profiling tracks (Shadow Tree, Layout) show timing data

**Step 4: Verify hot reload**

- Fast refresh preserves state
- Full reload re-renders correctly
- Cmd+Shift+R works

**Step 5: Run all tests**

```bash
npm test                # JS unit tests
npm run test:swift      # Swift unit tests
npm run test:e2e-swift  # E2E tests
```

**Step 6: Commit completed plan**

```bash
mv docs/plans/2026-03-02-implement-native-api-design.md docs/plans/complete/
git add docs/plans/complete/2026-03-02-implement-native-api-design.md
git commit -m "docs: move native API design implementation plan to complete"
```

---

## Summary of API Changes

| Before | After |
|--------|-------|
| `ReactRuntime.shared.devBundleURL = url` | Removed (bootstrap URL comes from SSR stream) |
| `root = createRoot(view)` | `root = createRoot(view)` (unchanged) |
| `root.render(serverURL: url)` | `root.render(url: url)` (renamed param) |
| `root.renderWithSSR(serverURL: ssrURL)` | Removed |
| `root.hydrateRoot(serverURL: flightURL)` | Removed |
| *(3 lines for SSR)* | `root = hydrateRoot(view, url: ssrURL)` **(1 line)** |
| *(no prerender)* | `prerender(view, url:)` (stub) |
| *(no resume)* | `resume(view, postponed:, url:)` (stub) |

## What Stays the Same

- Package owns URLSession (fetches SSR stream, downloads bundles)
- `FlightHTTPStreamDelegate` stays (CSR still pushes Flight data from native)
- `ReactRuntime.shared` singleton pattern
- Hot reload via stored URLs (`rerender()` re-fetches from stored URL)
- Inspector proxy WebSocket architecture
- All internal SSR infrastructure (parser, coordinator, tree builder, boundary manager)
