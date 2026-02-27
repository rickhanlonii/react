# Backpressure Handling When Client Reads Slowly

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles backpressure when the writable stream signals that it cannot accept more data. When the downstream consumer (e.g., a TCP socket) is slow, the Node.js `Writable.write()` method returns `false`, indicating the internal buffer is full. The Fizz renderer should respect this signal, pause rendering work, and resume when the `drain` event fires. This prevents unbounded memory growth on the server.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (backpressure tests)
- `packages/react-server/src/ReactFizzServer.js` (write and backpressure logic)

## App Setup
```jsx
function LargeApp() {
  return (
    <div id="large-app">
      <header>Header</header>

      {/* Generate a large amount of content */}
      {Array.from({ length: 1000 }, (_, i) => (
        <div key={i} className="row">
          <span>Row {i}</span>
          <p>Content for row {i} with some additional text to increase size</p>
        </div>
      ))}

      {/* Suspended content that resolves after some rows are flushed */}
      <Suspense fallback={<div>Loading more...</div>}>
        <AsyncLargeContent />
      </Suspense>

      <footer>Footer</footer>
    </div>
  );
}

let resolveContent;
const contentPromise = new Promise(r => { resolveContent = r; });

function AsyncLargeContent() {
  const data = React.use(contentPromise);
  return (
    <div id="async-large">
      {Array.from({ length: 500 }, (_, i) => (
        <p key={i}>Async row {i}: {data}</p>
      ))}
    </div>
  );
}
```

### Server setup with a slow writable:
```js
const { PassThrough } = require('stream');

// Create a writable that simulates a slow consumer
const slowWritable = new PassThrough({
  highWaterMark: 1024, // Small buffer to trigger backpressure quickly
});

let chunks = [];
slowWritable.on('data', chunk => {
  chunks.push(chunk);
});

const { pipe } = renderToPipeableStream(<LargeApp />, {
  onShellReady() {
    pipe(slowWritable);
  },
});
```

## Load Sequence
1. `renderToPipeableStream` begins rendering the large component tree.
2. The shell is rendered and `onShellReady` fires.
3. The renderer starts writing HTML chunks to the writable.
4. When the writable's internal buffer fills up (highWaterMark exceeded), `write()` returns `false`.
5. The Fizz renderer pauses producing more output.
6. When the consumer drains enough data, the `drain` event fires.
7. The renderer resumes writing.
8. This cycle continues until all content is flushed.
9. The stream ends normally when all content (including resolved Suspense boundaries) is written.

## Actions
1. Create a writable stream with a small `highWaterMark` (e.g., 1024 bytes).
2. Start rendering a large component tree with `renderToPipeableStream`.
3. Pipe to the slow writable on `onShellReady`.
4. Monitor how many times `write()` returns `false` (backpressure signals).
5. Verify that the renderer pauses and resumes correctly.
6. Resolve the async content.
7. Let the stream complete.
8. Concatenate all chunks and verify completeness.

## Assertions
1. The writable's `write()` method returns `false` at least once during rendering of the large content (backpressure is triggered).
2. The renderer does not crash or error when backpressure occurs.
3. All 1000 rows of static content are present in the final HTML output.
4. The content order is preserved (Row 0 appears before Row 999).
5. After resolving the async content, the 500 async rows are also streamed correctly.
6. The final HTML is well-formed (no truncated tags or incomplete attributes).
7. The stream's `finish` event fires, indicating successful completion.
8. Server memory usage does not spike unboundedly during backpressure (the renderer pauses work instead of buffering).
