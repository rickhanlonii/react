# Script Nonce Support for CSP

## Category
fizz

## Description
Validates that the Fizz renderer correctly applies a Content Security Policy (CSP) nonce to all inline and injected scripts in the HTML output. When a `nonce` option is provided, every `<script>` tag emitted by React (bootstrap scripts, streaming instruction scripts, inline script content) must include the `nonce` attribute. This is required for pages with strict CSP policies that only allow scripts with a matching nonce.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (nonce support tests, ~line 544)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (nonce tests)

## App Setup
```jsx
let resolveAsync;
const asyncPromise = new Promise(r => { resolveAsync = r; });

function AsyncWidget() {
  const data = React.use(asyncPromise);
  return <div id="async-widget">{data}</div>;
}

function NonceApp() {
  return (
    <div id="app">
      <h1>CSP Nonce Test</h1>
      <Suspense fallback={<div>Loading widget...</div>}>
        <AsyncWidget />
      </Suspense>
    </div>
  );
}
```

### Server setup with nonce:
```js
const CSP_NONCE = 'R4nd0mN0nc3';

const { pipe } = renderToPipeableStream(<NonceApp />, {
  nonce: CSP_NONCE,
  bootstrapScriptContent: 'window.__hydrate();',
  bootstrapScripts: [
    'main.js',
    { src: 'vendor.js', integrity: 'sha384-abc' },
  ],
  bootstrapModules: [
    'app.mjs',
    { src: 'utils.mjs', integrity: 'sha384-def' },
  ],
  onShellReady() {
    pipe(writable);
  },
});
```

## Load Sequence
1. Server renders the component tree with the nonce option.
2. All preload links in `<head>` include the `nonce` attribute.
3. The inline bootstrap script content includes `nonce="R4nd0mN0nc3"`.
4. Bootstrap `<script>` tags include the nonce.
5. Shell HTML is flushed with the nonce on all script elements.
6. When the async content resolves, the streaming `<script>` that swaps the Suspense fallback also includes the nonce.

## Actions
1. Server-render `<NonceApp />` with `nonce: 'R4nd0mN0nc3'`.
2. Capture the shell HTML.
3. Inspect all `<script>` and `<link>` tags for the nonce attribute.
4. Resolve the async content (`resolveAsync('Widget loaded')`).
5. Capture the streaming chunk and inspect its script tag for the nonce.

## Assertions
1. The inline bootstrap script has `nonce="R4nd0mN0nc3"`: `<script nonce="R4nd0mN0nc3">window.__hydrate();</script>`.
2. `<script src="main.js" async="" nonce="R4nd0mN0nc3"></script>` includes the nonce.
3. `<script src="vendor.js" async="" integrity="sha384-abc" nonce="R4nd0mN0nc3"></script>` includes both nonce and integrity.
4. `<script type="module" src="app.mjs" async="" nonce="R4nd0mN0nc3"></script>` includes the nonce.
5. `<script type="module" src="utils.mjs" async="" integrity="sha384-def" nonce="R4nd0mN0nc3"></script>` includes nonce and integrity.
6. Preload links also include the nonce: `<link rel="preload" as="script" href="main.js" nonce="R4nd0mN0nc3"/>`.
7. Module preload links include the nonce: `<link rel="modulepreload" href="app.mjs" nonce="R4nd0mN0nc3"/>`.
8. The streaming instruction `<script>` (emitted when the async Suspense boundary resolves) includes `nonce="R4nd0mN0nc3"`.
9. No `<script>` tag in the entire output is missing the `nonce` attribute.
10. The page would pass a CSP check with the policy `script-src 'nonce-R4nd0mN0nc3'`.
