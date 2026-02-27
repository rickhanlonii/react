# Stream Abort with AbortSignal, Custom Abort Reasons, Cleanup

## Category
fizz

## Description
Validates that Fizz streaming can be aborted mid-render using the `abort()` method on the pipeable stream or by providing an `AbortSignal` via the `signal` option. When aborted, any pending Suspense boundaries that have not yet resolved should be finalized (either with their fallback content for client rendering or with an error), and the stream should close cleanly. Custom abort reasons can be provided and are surfaced through the `onError` callback.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (abort tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (signal abort tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (abort with reason)

## App Setup
```jsx
let resolveFast, resolveSlow;
const fastPromise = new Promise(r => { resolveFast = r; });
const slowPromise = new Promise(r => { resolveSlow = r; }); // This one we will abort

function FastContent() {
  const data = React.use(fastPromise);
  return <div id="fast">{data}</div>;
}

function SlowContent() {
  const data = React.use(slowPromise);
  return <div id="slow">{data}</div>;
}

function AbortApp() {
  return (
    <div id="app">
      <h1>Abort Test</h1>
      <Suspense fallback={<div id="fast-fallback">Loading fast...</div>}>
        <FastContent />
      </Suspense>
      <Suspense fallback={<div id="slow-fallback">Loading slow...</div>}>
        <SlowContent />
      </Suspense>
      <footer>Footer</footer>
    </div>
  );
}
```

### Node.js abort via `abort()` method:
```js
const errors = [];
const { pipe, abort } = renderToPipeableStream(<AbortApp />, {
  onShellReady() {
    pipe(response);
  },
  onError(error) {
    errors.push(error);
  },
});

// After some time, abort with a reason
setTimeout(() => {
  abort(new Error('Request timed out'));
}, 5000);
```

### Edge abort via AbortSignal:
```js
const controller = new AbortController();

const stream = await renderToReadableStream(<AbortApp />, {
  signal: controller.signal,
  onError(error) {
    errors.push(error);
  },
});

// Later, abort
setTimeout(() => {
  controller.abort(new Error('Request timed out'));
}, 5000);
```

## Load Sequence
1. Server starts rendering `<AbortApp />`.
2. The shell renders with fallbacks for both Suspense boundaries.
3. `onShellReady` fires and the shell is piped/sent.
4. `resolveFast('Fast data')` is called -- the fast boundary resolves and streams.
5. Before `resolveSlow` is called, `abort()` is called with a custom reason.
6. The slow boundary is finalized with a client-render instruction (the client will need to render this boundary).
7. The `onError` callback receives the abort reason.
8. The stream closes.

## Actions
1. Start rendering with `renderToPipeableStream`.
2. Pipe on `onShellReady`.
3. Resolve the fast content.
4. Call `abort(new Error('Request timed out'))` before the slow content resolves.
5. Wait for the stream to finish.
6. Verify the final HTML output and errors.
7. Repeat using `renderToReadableStream` with `AbortController.abort()`.

## Assertions
1. The shell HTML contains both fallbacks initially.
2. After resolving fast content, `<div id="fast">Fast data</div>` replaces `#fast-fallback` in the streamed output.
3. After abort, the slow Suspense boundary receives a client-render instruction (the client will re-render this boundary).
4. The `onError` callback is called with the abort reason (`Error: Request timed out`).
5. The stream closes/finishes after abort without hanging.
6. The slow content's promise rejection does not cause additional errors after abort.
7. The final HTML is well-formed -- no unclosed tags.
8. For `renderToReadableStream`, the stream's reader eventually returns `{ done: true }` after abort.
9. The fast boundary content is preserved (abort only affects unresolved boundaries).
10. When hydrating the aborted output on the client, the slow boundary falls back to client rendering.
