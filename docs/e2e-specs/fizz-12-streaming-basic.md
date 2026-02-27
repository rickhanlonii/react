# Basic Streaming: renderToPipeableStream and renderToReadableStream

## Category
fizz

## Description
Validates the two primary Fizz streaming APIs: `renderToPipeableStream` (Node.js streams) and `renderToReadableStream` (Web Streams / Edge runtime). Both APIs should produce identical HTML output for the same component tree. This test covers basic usage, streaming HTML delivery in chunks, and the fundamental streaming contract.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (renderToPipeableStream tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (renderToReadableStream tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (comprehensive streaming tests)

## App Setup
```jsx
function StreamingApp() {
  return (
    <html>
      <head>
        <title>Streaming Test</title>
      </head>
      <body>
        <div id="root">
          <h1>Hello Streaming</h1>
          <p>This content is server rendered.</p>
          <Suspense fallback={<div>Loading...</div>}>
            <AsyncContent />
          </Suspense>
        </div>
      </body>
    </html>
  );
}

// A component that suspends and resolves later
let resolveContent;
const contentPromise = new Promise(r => { resolveContent = r; });

function AsyncContent() {
  const data = React.use(contentPromise);
  return <div id="async-content">{data}</div>;
}
```

### Node.js server setup (renderToPipeableStream):
```js
const { renderToPipeableStream } = require('react-dom/server');
const { pipe } = renderToPipeableStream(<StreamingApp />, {
  onShellReady() {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    pipe(response);
  },
});
```

### Edge/Browser server setup (renderToReadableStream):
```js
import { renderToReadableStream } from 'react-dom/server.browser';
const stream = await renderToReadableStream(<StreamingApp />);
return new Response(stream, {
  headers: { 'Content-Type': 'text/html' },
});
```

## Load Sequence
1. The server begins rendering the component tree.
2. It encounters the `<Suspense>` boundary with a suspended `<AsyncContent>`.
3. The shell (everything outside the suspended boundary) is rendered and flushed as the first chunk.
4. The fallback `<div>Loading...</div>` is included in the shell HTML.
5. When `resolveContent` is called, the async content resolves.
6. The resolved content is streamed as a subsequent chunk containing an inline `<script>` that swaps the fallback with the real content.
7. The stream completes.

## Actions
1. Start server render with `renderToPipeableStream` and pipe to a writable stream on `onShellReady`.
2. Capture the first chunk of HTML (the shell).
3. Resolve the async content by calling `resolveContent('Async data loaded')`.
4. Capture subsequent chunks.
5. Repeat the same test using `renderToReadableStream`.
6. Compare the HTML output from both APIs.

## Assertions
1. The first chunk (shell) contains `<!DOCTYPE html>`, `<html>`, `<head>`, `<title>`, and `<body>` elements.
2. The shell contains `<h1>Hello Streaming</h1>` and the paragraph.
3. The shell contains the Suspense fallback `Loading...` wrapped in Suspense boundary markers (`<!--$?-->` and `<!--/$-->`).
4. After resolving, a second chunk arrives containing the async content and a `<script>` tag that performs the DOM swap.
5. The final DOM shows `<div id="async-content">Async data loaded</div>` in place of the fallback.
6. `renderToReadableStream` produces the same visible content as `renderToPipeableStream`.
7. Both APIs emit `<!DOCTYPE html>` when rendering an `<html>` root element.
8. The stream eventually closes/completes after all content is flushed.
