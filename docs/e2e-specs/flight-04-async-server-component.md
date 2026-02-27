# Async Server Components

## Category
flight

## Description
Validates that Server Components declared as `async` functions can `await` data before returning JSX, and that the Flight stream correctly handles the asynchronous resolution. The server waits for the async component to resolve before serializing its output. On the client, the async nature is transparent -- the resolved JSX appears as if it were synchronous. This is critical for data fetching patterns in Server Components.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` (progressive rendering tests with Suspense and delayed resolution)
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("supports async server component debug info as the element owner in DEV")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` ("should resolve the root")

## App Setup
```jsx
// Simulated data fetching
async function fetchGreeting() {
  return new Promise(resolve => setTimeout(() => resolve('Hello from DB'), 100));
}

// Async Server Component
async function AsyncGreeting() {
  const greeting = await fetchGreeting();
  return <p>{greeting}</p>;
}

function App() {
  return (
    <div>
      <h1>Welcome</h1>
      <AsyncGreeting />
    </div>
  );
}
```

The `AsyncGreeting` component is an async function that awaits data before returning its JSX. The Flight server must handle the promise returned by this component.

## Load Sequence
1. Server calls `renderToReadableStream(<App />)` and begins rendering.
2. `App` returns a `<div>` with `<h1>Welcome</h1>` and `<AsyncGreeting />`.
3. The `<h1>` is resolved immediately and can be serialized.
4. `AsyncGreeting` returns a promise (async function). The Flight server registers the pending component.
5. When `fetchGreeting()` resolves, `AsyncGreeting` produces `<p>Hello from DB</p>`.
6. The server serializes the resolved output and writes it to the stream.
7. The stream closes once all async components have resolved.
8. Client receives the full tree: `<div><h1>Welcome</h1><p>Hello from DB</p></div>`.

## Actions
1. Render `<App />` on the server using `renderToReadableStream`.
2. Use `serverAct()` to flush all pending async work on the server.
3. Create the Flight response on the client from the stream.
4. Await the resolved model.

## Assertions
1. The resolved model should include both the synchronous `<h1>Welcome</h1>` and the async `<p>Hello from DB</p>`.
2. The fetched data ("Hello from DB") should appear in the final output.
3. The async component should be fully resolved -- no pending promises in the client model.
4. If the server uses `serverAct()`, all async components should resolve before the stream closes.
5. The rendering order in the DOM should match the component tree order (h1 before p).
