# Basic Server Component Rendering

## Category
flight

## Description
Validates that a Server Component can be serialized into a Flight stream on the server and deserialized on the client to produce the correct React element tree. This is the foundational behavior of React Server Components -- the server renders a component tree into a serialized payload (the Flight protocol), and the client reconstructs the element tree from that payload without re-executing the server component functions.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` ("should resolve HTML using Node streams")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` ("should resolve HTML using W3C streams")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js`

## App Setup
```jsx
// Server Components (executed on the server only)
function Text({ children }) {
  return <span>{children}</span>;
}

function HTML() {
  return (
    <div>
      <Text>hello</Text>
      <Text>world</Text>
    </div>
  );
}

function App() {
  return { html: <HTML /> };
}
```

The server renders `<App />` using `ReactServerDOMServer.renderToReadableStream()` (or `renderToPipeableStream()` for Node.js streams). The resulting Flight stream is a text-based protocol encoding the component tree as serialized rows.

## Load Sequence
1. Server calls `renderToReadableStream(<App />)` which begins rendering the Server Component tree.
2. The Flight server traverses `App`, discovers it returns an object `{ html: <HTML /> }`.
3. It traverses `HTML`, then `Text` components, producing serialized JSX elements (`<div>`, `<span>`).
4. The serialized rows are written to the Flight stream as newline-delimited entries.
5. Client calls `createFromReadableStream(stream)` which returns a thenable/promise for the model.
6. As the stream is consumed, the client Flight parser reconstructs the element tree.
7. The resolved model is an object `{ html: <div><span>hello</span><span>world</span></div> }`.

## Actions
1. Start the Flight server and render `<App />` into a Flight stream.
2. Pipe/read the stream on the client side using `createFromReadableStream`.
3. Await the resolved model from the response.

## Assertions
1. The resolved model should be an object with an `html` property.
2. The `html` property should be a React element equivalent to `<div><span>hello</span><span>world</span></div>`.
3. The `Text` server component should NOT appear in the output -- it should have been fully resolved to its `<span>` output.
4. The Flight stream should have completed (closed) after all components are resolved.
5. No errors should be reported during serialization or deserialization.
