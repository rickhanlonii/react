# Progressive Rendering

## Category
flight

## Description
Validates that the Flight stream supports progressive rendering, where parts of the component tree that are ready are sent to the client immediately while other parts (blocked on async data) are sent later as they resolve. This enables the client to start rendering available content while waiting for slower parts. Combined with Suspense boundaries, this creates a smooth loading experience.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` (tests using `makeDelayedText` and progressive resolution patterns)
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` ("should resolve the root" with Suspense)
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` (`dripStream` helper for controlled chunk delivery)

## App Setup
```jsx
// Client Component
function ClientDisplay({ children }) {
  // "use client"
  return <section>{children}</section>;
}

// Async Server Components with different resolution times
async function FastData() {
  await shortDelay(); // resolves quickly
  return <p>Fast content loaded</p>;
}

async function SlowData() {
  await longDelay(); // resolves after a significant delay
  return <p>Slow content loaded</p>;
}

function App() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading fast...</p>}>
        <FastData />
      </Suspense>
      <Suspense fallback={<p>Loading slow...</p>}>
        <SlowData />
      </Suspense>
    </div>
  );
}
```

The Flight stream is consumed on the client using `createFromReadableStream`. The stream is intentionally not fully buffered -- chunks arrive over time as components resolve.

## Load Sequence
1. Server calls `renderToReadableStream(<App />)` and begins rendering.
2. The `<h1>Dashboard</h1>` is immediately available and serialized.
3. `FastData` begins its async work. `SlowData` begins its async work.
4. The Flight stream sends the initial frame with the `<h1>` and Suspense fallback placeholders.
5. `FastData` resolves. The server writes a new row to the stream with the resolved content for that Suspense boundary.
6. The client updates: the fast Suspense boundary reveals `<p>Fast content loaded</p>` while the slow one still shows its fallback.
7. `SlowData` resolves. The server writes the final row and closes the stream.
8. The client updates: the slow Suspense boundary reveals `<p>Slow content loaded</p>`.

## Actions
1. Render `<App />` on the server using `renderToReadableStream`.
2. On the client, create the response from the stream and mount it in a React root with Suspense boundaries.
3. Allow the fast async component to resolve (e.g., advance timers or resolve the fast promise).
4. Observe the intermediate state.
5. Allow the slow async component to resolve.
6. Observe the final state.

## Assertions
1. Initially, the client should show `<h1>Dashboard</h1>` with both Suspense fallbacks visible.
2. After the fast component resolves, the first Suspense boundary should reveal its content while the second still shows its fallback.
3. After the slow component resolves, both Suspense boundaries should show their resolved content.
4. The Flight stream should NOT close until all async components have resolved.
5. The stream should contain multiple rows -- initial content plus progressive updates for each resolved Suspense boundary.
6. The final DOM should be `<div><h1>Dashboard</h1><p>Fast content loaded</p><p>Slow content loaded</p></div>`.
