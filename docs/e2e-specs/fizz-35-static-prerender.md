# prerenderToNodeStream and prerender() APIs for Static Generation

## Category
fizz

## Description
Validates the static prerendering APIs: `prerenderToNodeStream` (from `react-dom/static`) for Node.js environments and `prerender` (from `react-dom/static.browser`) for browser/edge environments. Unlike streaming APIs, these wait for ALL content to be ready (including Suspense boundaries) before returning the complete HTML. They are designed for static site generation (SSG) and crawler/bot rendering where the entire page must be complete before serving.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzStatic-test.js` (prerenderToNodeStream tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzStaticBrowser-test.js` (prerender tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzStaticNode-test.js` (Node static tests)

## App Setup
```jsx
let resolveData;
const dataPromise = new Promise(r => { resolveData = r; });

function AsyncData() {
  const data = React.use(dataPromise);
  return <div id="async-data">{data}</div>;
}

function StaticApp() {
  return (
    <html>
      <head>
        <title>Static Page</title>
        <meta name="description" content="A statically generated page" />
      </head>
      <body>
        <div id="root">
          <h1>Static Page</h1>
          <p>This content is always ready.</p>
          <Suspense fallback={<div>Loading...</div>}>
            <AsyncData />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
```

### Node.js setup (prerenderToNodeStream):
```js
import { prerenderToNodeStream } from 'react-dom/static';

const { prelude } = await prerenderToNodeStream(<StaticApp />, {
  onError(error) {
    console.error(error);
  },
});

// prelude is a Node.js Readable stream containing the complete HTML
prelude.pipe(response);
```

### Browser/Edge setup (prerender):
```js
import { prerender } from 'react-dom/static.browser';

const { prelude } = await prerender(<StaticApp />, {
  onError(error) {
    console.error(error);
  },
});

// prelude is a ReadableStream containing the complete HTML
return new Response(prelude, { headers: { 'Content-Type': 'text/html' } });
```

## Load Sequence
1. `prerenderToNodeStream` or `prerender` is called.
2. The renderer starts processing the component tree.
3. It encounters `<AsyncData />` which suspends.
4. Unlike streaming, the API does NOT return immediately.
5. It waits for ALL Suspense boundaries to resolve.
6. When `resolveData` is called, the async content resolves.
7. The API returns a `{ prelude }` object containing the complete HTML as a stream.
8. The HTML includes the resolved async content inline (no streaming scripts needed).
9. The `DOCTYPE` is emitted at the beginning.

## Actions
1. Start `prerenderToNodeStream(<StaticApp />)`.
2. Verify it does NOT resolve immediately (the promise is pending).
3. Resolve the async data: `resolveData('Loaded content')`.
4. Await the prerender result.
5. Read the prelude stream to get the complete HTML.
6. Verify the HTML contains all content.
7. Repeat with `prerender()` for browser environments.

## Assertions
1. The `prerenderToNodeStream` call returns a Promise that does not resolve until all content is ready.
2. The returned object has a `prelude` property that is a Node.js Readable stream.
3. The HTML starts with `<!DOCTYPE html>`.
4. The `<head>` contains `<title>Static Page</title>` and the meta description.
5. The HTML contains `<div id="async-data">Loaded content</div>` inline (resolved content, not fallback).
6. The HTML does NOT contain "Loading..." fallback text.
7. The HTML does NOT contain any `<script>` tags for streaming DOM manipulation (no Fizz runtime scripts).
8. The `prerender()` browser API returns a Promise that resolves to `{ prelude: ReadableStream }`.
9. Both APIs produce identical HTML content.
10. The returned `postponed` field is `null` when all content resolved (no postponed boundaries).
11. The HTML can be served as a static file and hydrated normally.
