# Progressive SSR Streaming

## Problem

The `/ssr` endpoint blocks on full Flight stream deserialization before Fizz starts rendering. The server waits for all async server components (e.g. `SlowSection` with 1–2.5s delays) to resolve before sending any native instructions to iOS. This causes a blank screen for the duration of the slowest async component.

## Root Cause

In `example/server/server.js:305`:

```javascript
Promise.resolve(rootPromise).then(function (rootElement) {
  var nativeStream = renderToPipeableStream(rootElement, { ... });
});
```

`rootPromise` is the Thenable returned by `createFromNodeStream`. Wrapping it in `Promise.resolve().then()` forces a full await — Fizz doesn't start until the entire Flight stream is deserialized, including all async server components.

The Flight client already returns lazy references (`$L` chunks) that Fizz can suspend on. The `createFromNodeStream` Thenable resolves to an element tree where async components are represented as pending Thenables. Fizz natively supports rendering Thenables as children — when it encounters a pending one, it calls `unwrapThenable()` which throws `SuspenseException` at the nearest `<Suspense>` boundary, renders the fallback, and resumes when the Thenable resolves via `pingTask()`.

## Solution

Remove the `Promise.resolve(rootPromise).then()` wrapper and pass the Flight Thenable directly as `children` to `renderToPipeableStream`.

Fizz's `renderNodeDestructive` (react-server/src/ReactFizzServer.js:3546) already handles Thenable children — it calls `unwrapThenable(thenable)` which suspends if pending. No wrapper component or `React.use()` call is needed.

### Before

```javascript
var rootPromise = createFromNodeStream(passThrough, ssrManifest);

Promise.resolve(rootPromise).then(function (rootElement) {
  var nativeSSR = require('react-dom-native/server');
  var renderToNativeStream = nativeSSR.renderToPipeableStream;
  var nativeStream = renderToNativeStream(rootElement, {
    onShellReady: function () { ... nativeStream.pipe(res); },
    onShellError: function (error) { ... },
    onError: function (error) { ... },
  });
}).catch(function (error) { ... });
```

### After

```javascript
var rootThenable = createFromNodeStream(passThrough, ssrManifest);

var nativeSSR = require('react-dom-native/server');
var renderToNativeStream = nativeSSR.renderToPipeableStream;
var nativeStream = renderToNativeStream(rootThenable, {
  onShellReady: function () { ... nativeStream.pipe(res); },
  onShellError: function (error) { ... },
  onError: function (error) { ... },
});
```

The only change: remove the `Promise.resolve().then()` wrapper and pass `rootThenable` directly.

## How It Works

1. `createFromNodeStream` returns a Thenable immediately (root chunk in PENDING state)
2. Fizz starts rendering synchronously via `startWork(request)`
3. Fizz encounters the Thenable as children in `renderNodeDestructive`, calls `unwrapThenable()`
4. The Thenable is pending → throws `SuspenseException` at the nearest `<Suspense>` boundary
5. Fizz renders the boundary's fallback content
6. `onShellReady` fires — the shell with fallback content starts streaming to iOS
7. As Flight chunks arrive, the Thenable resolves → `pingTask()` resumes rendering
8. Completed boundaries emit `["X", id]` reveal instructions
9. iOS `BoundaryManager` swaps fallback nodes for real content

## Scope

**Modified file:** `example/server/server.js` — the `/ssr` endpoint handler only (~5 lines changed).

Everything else already works:

- **NativeFizzConfig.js** — already emits streaming Suspense instructions (`B`, `/B`, `S`, `/S`, `X`, `R`)
- **NativeFizzServerNode.js** — `renderToPipeableStream` already calls `startWork` + `startFlowing`
- **iOS InstructionStreamParser** — already handles incremental JSON line parsing
- **iOS SSRCoordinator / BoundaryManager** — already handles boundary reveals and view updates
- **App.js** — `<Suspense>` boundaries already wrap the `SlowSection` components

## Expected Result

### Before (blank screen during async resolution)

```
T=0ms      iOS: GET /ssr
T=0ms      Server: starts Flight rendering
T=1000ms+  Server: async components resolve, Flight completes
T=1000ms+  Server: Fizz starts, onShellReady fires
T=1000ms+  iOS: receives first instructions, paints content
```

### After (immediate shell, progressive reveals)

```
T=0ms      iOS: GET /ssr
T=0ms      Server: starts Flight rendering + Fizz rendering
T=~0ms     Server: Fizz hits pending Thenable, renders Suspense fallbacks
T=~0ms     Server: onShellReady fires, streams shell + fallbacks to iOS
T=~0ms     iOS: paints shell with "Loading..." fallbacks
T=1000ms   Server: SlowSection(1s) resolves, streams ["X", id] reveal
T=1000ms   iOS: swaps fallback for table content
T=2500ms   Server: SlowSection(2.5s) resolves, streams final reveal
T=2500ms   iOS: all content visible
```

## Hydration Compatibility

No hydration impact. The native instruction output is identical — the same element tree produces the same `["O"...]`, `["T"...]`, `["C"]` instructions regardless of whether Fizz received the tree as a resolved value or as a Thenable. The iOS shadow tree and UIKit views are unchanged.

## References

- Fizz Thenable handling: `react-server/src/ReactFizzServer.js:3546-3556` (`unwrapThenable`)
- Fizz Thenable suspension: `react-server/src/ReactFizzThenable.js:90-131` (`trackUsedThenable`)
- React Flight fixture SSR: `react/fixtures/flight/server/global.js:89-200`
- Flight client chunk resolution: `react-client/src/ReactFlightClient.js:863-891`
