# Design: react-dom-native Swift Public API

## Goal

Redesign the ReactDomNativeKit Swift public API to mirror react-dom's four-tier surface, adapted for native iOS. The package should feel like a natural native extension of react-dom — how react-dom would write it if it owned the browser instead of needing to work with HTML.

## Core Principle

react-dom takes React elements because JS is already running in the browser. react-dom-native takes the thing that *produces* a React element (bundle, stream, cached state) because it owns the JS runtime. In each case, the native API accepts the native equivalent of what react-dom accepts.

The package is the browser. It owns the rendering target (UIKit), the JS runtime (JSC), the streaming pipeline, and the SSR instruction format. It does NOT own transport — the app decides where data comes from.

## API Surface

### `createRoot` + `render` — Client-Side Rendering

```swift
import ReactDomNativeKit

let root = createRoot(view)
root.render(bundle: jsSource)
```

The app provides a JS bundle string. The package boots a JSC runtime, evaluates the bundle, and the JS handles everything from there — data fetching (via `fetch` polyfill), Flight deserialization, React rendering. The package provides the environment (JSC + polyfills + bridge), the JS decides what to render.

**react-dom equivalent:**
```js
import { createRoot } from 'react-dom/client';
createRoot(container).render(<App />);
```

### `hydrateRoot` — SSR + Progressive Hydration

```swift
import ReactDomNativeKit

let root = hydrateRoot(view, stream: ssrStream)
```

The app provides an SSR instruction stream (as streaming `Data` chunks). The stream contains everything:

1. **View instructions** (`["I", "div", {...}]`) — parsed incrementally, build shadow tree, create UIKit views for instant first paint
2. **Suspense boundary instructions** — fallback/reveal pairs, progressively revealed with throttling as boundaries resolve
3. **Flight data** (`["JS", "self.__next_f.push([1, ...])"]`) — embedded in the stream, extracted and buffered for hydration
4. **Bootstrap script** (`bootstrapScripts` option from `renderToPipeableStream`) — tells the package what JS bundle to load for hydration

The package orchestrates the full pipeline:
- Streams SSR instructions → shadow tree → UIKit views (immediate display)
- Extracts and buffers Flight data from embedded JS instructions
- Loads the bootstrap bundle in parallel (URL provided by the stream)
- When both shell is painted AND bundle is booted → hydration starts automatically
- Progressive boundary reveals continue during and after hydration

The app only provides the stream. The package handles everything else.

**Server side:**
```js
import { renderToPipeableStream } from 'react-dom-native/server';

const { pipe } = renderToPipeableStream(<App />, {
  bootstrapScripts: ['/bundle.js'],
  onShellReady() { pipe(res); },
});
```

**react-dom equivalent:**
```js
import { hydrateRoot } from 'react-dom/client';
hydrateRoot(container, <App />);
```

### `prerender` — Pre-render + Cache

```swift
import ReactDomNativeKit

let (prelude, postponed) = try await prerender(view, bundle: jsSource)
// or
let (prelude, postponed) = try await prerender(view, url: serverURL)

// Cache to device for instant launch
cache.store(prelude)
cache.store(postponed)
```

Renders the app ahead of time — at build time, on first launch, or in the background. Components that call `postpone()` are deferred. Returns:

- **`prelude`** — serialized SSR instruction stream (the same format `hydrateRoot` consumes). Can be replayed into UIKit views without JS, giving instant first paint on next launch.
- **`postponed`** — opaque state blob representing the deferred parts. Sent to a server for `resume`.

The prelude is the native equivalent of HTML — a static representation of the rendered UI that the package can display without JavaScript.

**react-dom equivalent:**
```js
import { prerender } from 'react-dom/static';
const { prelude } = await prerender(<App />);
```

### `resume` — Resume from Cached Pre-render

```swift
import ReactDomNativeKit

let root = resume(view, postponed: cachedPostponed, url: resumeServerURL)
```

Shows the cached prelude instantly (from the prerender), then sends the postponed state to a server. The server resumes rendering the deferred parts and streams back results. The package hydrates the cached views and progressively fills in the dynamic content.

Flow:
1. Replay cached prelude → instant UIKit views (no network, no JS)
2. Send postponed state to resume server
3. Server renders deferred parts → streams back instructions
4. Package hydrates cached tree + fills in resumed content
5. App is interactive

**react-dom equivalent (server-side):**
```js
import { resumeToPipeableStream } from 'react-dom/server';
const { pipe } = resumeToPipeableStream(postponed, <App />);
```

## API Summary

| Swift API | Purpose | Input | react-dom equivalent |
|-----------|---------|-------|---------------------|
| `createRoot(view).render(bundle:)` | CSR | JS bundle string | `createRoot(el).render(<App/>)` |
| `hydrateRoot(view, stream:)` | SSR + hydration | SSR instruction stream | `hydrateRoot(el, <App/>)` |
| `prerender(view, bundle: \| url:)` | Pre-render + cache | JS bundle or server URL | `prerender(<App/>)` |
| `resume(view, postponed:, url:)` | Resume cached prerender | Cached state + server URL | `resumeToPipeableStream(postponed)` |

## Supporting Types

### Root

```swift
public class Root {
    public let container: UIView
    public private(set) var isUnmounted: Bool

    public func render(bundle: String)
    public func unmount()
}
```

### RootOptions

```swift
public struct RootOptions {
    public var onRecoverableError: ((Error) -> Void)?
    public var onUncaughtError: ((Error) -> Void)?
}
```

### PrerenderResult

```swift
public struct PrerenderResult {
    /// Serialized SSR instruction stream — replayable without JS.
    public let prelude: Data

    /// Opaque deferred state — send to server for resume.
    public let postponed: Data
}
```

### RootError

```swift
public enum RootError: Error {
    case bundleLoadFailed(Error)
    case alreadyUnmounted
    case hydrationFailed(Error)
    case prerenderFailed(Error)
    case resumeFailed(Error)
}
```

## What the Package Owns

- **JS runtime** — JSC context, polyfills (`fetch`, `document`, `performance`, `TextEncoder`, `ReadableStream`), bridge globals (`$$createNode`, etc.)
- **SSR instruction parsing** — streaming parser for the native instruction format
- **Shadow tree** — Yoga layout, shadow nodes, differentiator
- **UIKit rendering** — mutation applier, view registry, scroll views
- **Hydration orchestration** — shell + bundle timing, Flight extraction, boundary reveals
- **DevTools** (DEBUG) — hot reload, inspector, LogBox

## What the App Owns

- **Transport** — how/where to fetch bundles, SSR streams, Flight data
- **Caching** — storing prerender results to disk
- **Navigation** — which URL to load, when to render/unmount
- **JS bundle content** — entry point, Flight client setup, `__REACT_DOM_NATIVE__` global

## What Changes from Current API

| Current | New |
|---------|-----|
| `root.render(serverURL:)` | `root.render(bundle:)` |
| `root.renderWithSSR(serverURL:)` + `root.hydrateRoot(serverURL:)` | `hydrateRoot(view, stream:)` |
| Package fetches via URLSession | App provides data, package renders |
| `ReactRuntime.shared.devBundleURL` | Bootstrap script URL in SSR stream |
| `FlightHTTPStreamDelegate` in package | Flight fetching in JS (via `fetch` polyfill) or embedded in SSR stream |
| No prerender/resume | `prerender()` + `resume()` stubs |

## Implementation Status

- `createRoot` + `render(bundle:)` — needs refactoring (remove URL fetching)
- `hydrateRoot(view, stream:)` — needs refactoring (accept stream, remove URL params)
- `prerender` — stub (throws "not yet implemented")
- `resume` — stub (throws "not yet implemented")
- `fetch` polyfill — needed for CSR path (JS-side data fetching)
