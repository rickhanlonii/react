# onAllReady Callback: Waiting for All Content Including Suspense

## Category
fizz

## Description
Validates the `onAllReady` callback in `renderToPipeableStream`, which fires when ALL content has been generated, including content inside Suspense boundaries. This is useful for static generation (crawlers, bots) where you want the complete HTML before sending the response, rather than streaming partial content. For `renderToReadableStream`, the equivalent is the `stream.allReady` promise.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (onAllReady tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (stream.allReady tests)

## App Setup
```jsx
let resolveData;
const dataPromise = new Promise(r => { resolveData = r; });

function AsyncSection() {
  const data = React.use(dataPromise);
  return <section id="async-section">{data}</section>;
}

function AllReadyApp() {
  return (
    <div id="app">
      <h1>Static Generation Test</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncSection />
      </Suspense>
      <footer>Footer</footer>
    </div>
  );
}
```

### Node.js setup using onAllReady (for bots/crawlers):
```js
const { pipe } = renderToPipeableStream(<AllReadyApp />, {
  onAllReady() {
    // All content is ready. Send the complete page.
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    pipe(response);
  },
  onShellReady() {
    // Do NOT pipe here for static generation
  },
});
```

### Browser/Edge setup using stream.allReady:
```js
const stream = await renderToReadableStream(<AllReadyApp />);
await stream.allReady; // Wait for all Suspense boundaries
return new Response(stream, { headers: { 'Content-Type': 'text/html' } });
```

## Load Sequence
1. `renderToPipeableStream` starts rendering.
2. The shell (h1, Suspense fallback, footer) is ready -- `onShellReady` fires.
3. If piping is deferred until `onAllReady`, no HTML is sent yet.
4. `AsyncSection` is still pending.
5. When `resolveData('Full content')` is called, the async content resolves.
6. `onAllReady` fires once ALL content is ready.
7. Now piping begins, and the entire page is sent as one complete HTML document.
8. Because all content was ready before piping, the Suspense boundary content is inlined directly (no fallback or streaming script needed).

## Actions
1. Start rendering with `renderToPipeableStream`, only piping in `onAllReady` (not `onShellReady`).
2. Verify that no output is produced before `onAllReady`.
3. Resolve the async data.
4. Verify `onAllReady` fires.
5. Pipe and capture the complete HTML.
6. Repeat using `renderToReadableStream` and `stream.allReady`.

## Assertions
1. `onShellReady` fires before `onAllReady`.
2. No HTML is written to the response before `onAllReady` when piping is deferred.
3. `onAllReady` fires only after `resolveData` is called.
4. The HTML output after piping in `onAllReady` contains the resolved content `<section id="async-section">Full content</section>` directly in the output (inlined, not as a separate streaming chunk).
5. The output does NOT contain the fallback text "Loading..." as visible content (the Suspense boundary resolved before flush).
6. The output does NOT contain the streaming `<script>` instructions for DOM swapping (content was already complete).
7. For `renderToReadableStream`, `await stream.allReady` resolves after all Suspense boundaries complete.
8. The final HTML from both approaches is identical in visible content.
