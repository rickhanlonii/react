# Stream Abort

## Category
flight

## Description
Validates that aborting a Flight stream mid-transfer correctly cleans up resources on both the server and client sides. When a Flight stream is aborted (via `AbortController` or calling `.abort()` on the stream), the server should cancel any pending async work, and the client should receive an error for any unresolved chunks. Chunks that were already delivered before the abort should remain usable. This tests the graceful degradation path for scenarios like user navigation, timeouts, or server shutdowns.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` (ReadableStream abort tests with `AbortController`)
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMNode-test.js` ("should cancel the underlying and transported ReadableStreams when we abort", "does not propagate abort reasons errors when aborting a prerender")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("can abort an unresolved model and get the partial result")

## App Setup
```jsx
// Server-side: a stream that enqueues values progressively
let streamController;
const transportedStream = new ReadableStream({
  start(controller) {
    streamController = controller;
  },
  cancel(reason) {
    // Track that cancellation propagated
    cancelReason = reason;
  },
});

// Async Server Component that never resolves (simulating slow work)
async function NeverResolves() {
  await new Promise(() => {}); // hangs forever
  return <p>This should never render</p>;
}

function App() {
  return (
    <div>
      <h1>Before Abort</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NeverResolves />
      </Suspense>
    </div>
  );
}
```

The server creates an `AbortController` and passes its `signal` to `renderToReadableStream`. The test will abort the controller mid-stream.

## Load Sequence
1. Server calls `renderToReadableStream(<App />, webpackMap, { signal: abortController.signal, onError })`.
2. The `<h1>Before Abort</h1>` is serialized immediately.
3. `NeverResolves` suspends -- the stream stays open waiting for it.
4. `abortController.abort(reason)` is called, triggering the abort signal.
5. The server cancels all pending work for `NeverResolves`.
6. Any transported `ReadableStream` in the payload has its cancel callback invoked.
7. The server writes an error row for the aborted Suspense boundary and closes the Flight stream.
8. The `onError` callback receives the abort reason.
9. On the client, already-delivered content (`<h1>Before Abort</h1>`) remains accessible.
10. Attempting to read the aborted Suspense boundary's content yields an error with a digest matching the abort reason.

## Actions
1. Render `<App />` on the server with an `AbortController` signal.
2. Enqueue some data into a transported `ReadableStream` before aborting.
3. Abort the controller with a reason (e.g., `new Error('aborted')`).
4. On the client, attempt to read the already-delivered content.
5. On the client, attempt to read the aborted content.

## Assertions
1. Content delivered before the abort (`<h1>Before Abort</h1>`) should be available on the client.
2. For transported ReadableStreams: chunks enqueued before the abort should be readable.
3. The `cancel` callback on transported ReadableStreams should be called with the abort reason.
4. Attempting to read further from a transported stream after abort should throw an error with `digest` matching the abort reason message.
5. The `onError` callback should receive the abort reason.
6. The Flight stream should close after aborting (not hang indefinitely).
7. The client should NOT receive any data that was pending at the time of abort.
8. The abort reason should propagate correctly through error boundaries on the client.
