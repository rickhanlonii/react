# ReadableStream Support

## Category
flight

## Description
Validates that a W3C `ReadableStream` can be passed as a value through the Flight protocol from server to client. The stream is transported as a series of chunks in the Flight payload, and the client receives a new `ReadableStream` that yields the same chunks. This enables streaming large datasets, files, or real-time data from server to client without buffering everything in memory. The test covers both object streams and binary (typed array) streams.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("can pass an async import to a ReadableStream while enqueuing in order")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` (ReadableStream abort tests)
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("should supports streaming ReadableStream with objects")

## App Setup
```jsx
function App() {
  // Object stream
  const objectStream = new ReadableStream({
    start(controller) {
      controller.enqueue({ message: 'first' });
      controller.enqueue({ message: 'second' });
      controller.enqueue('text chunk');
      controller.close();
    },
  });

  // Binary stream
  const binaryStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    },
  });

  return { objectStream, binaryStream };
}
```

## Load Sequence
1. Server renders the model with `renderToReadableStream`.
2. The Flight serializer detects `ReadableStream` values and begins consuming them.
3. Each chunk from the source stream is serialized as a separate row in the Flight stream, tagged with the stream's reference ID.
4. When the source stream closes, a completion row is written to the Flight stream.
5. Client deserializes the Flight stream and creates new `ReadableStream` instances.
6. As the Flight stream delivers chunk rows, they are enqueued into the client-side `ReadableStream`.
7. When the completion row arrives, the client-side stream is closed.

## Actions
1. Create a model containing ReadableStream instances on the server.
2. Serialize to a Flight stream.
3. Deserialize on the client via `createFromReadableStream`.
4. Read from the deserialized streams using `stream.getReader()`.
5. Consume all chunks and verify their contents.

## Assertions
1. The deserialized `objectStream` should be a `ReadableStream` instance.
2. Reading from `objectStream` should yield: `{ message: 'first' }`, `{ message: 'second' }`, `'text chunk'`, then done.
3. The deserialized `binaryStream` should yield `Uint8Array([1, 2, 3])`, then `Uint8Array([4, 5, 6])`, then done.
4. The chunks should arrive in the correct order (matching enqueue order).
5. After the last chunk, `reader.read()` should return `{ value: undefined, done: true }`.
6. Async chunks (where the source stream enqueues with delays) should still be delivered correctly and in order.
7. If the source stream contains values that depend on async module loading, chunks should be delivered in the correct order after resolution.
