# Resource Hints: onHeaders Callback, Preload Links, Float

## Category
fizz

## Description
Validates the Float (Fizz + Loading Optimization for Assets and Tags) system in Fizz, including the `onHeaders` callback for early resource hints, preload link emission, and resource priority hints. Float allows React to hoist resource metadata (stylesheets, fonts, scripts) to the `<head>` and emit early hints via the `onHeaders` callback, enabling the browser to start downloading critical resources before the full HTML arrives.

## References
- `packages/react-dom/src/__tests__/ReactDOMFloat-test.js` (comprehensive Float tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzStatic-test.js` (~line 267, onHeaders tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzStaticBrowser-test.js` (~line 499, onHeaders tests)

## App Setup
```jsx
import { preload, preinit, preconnect, prefetchDNS } from 'react-dom';

function ResourceApp() {
  // Imperative preload calls
  preload('https://cdn.example.com/font.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  preload('https://cdn.example.com/hero.jpg', { as: 'image', fetchPriority: 'high' });
  preinit('https://cdn.example.com/critical.css', { as: 'style', precedence: 'high' });
  preinit('https://cdn.example.com/analytics.js', { as: 'script' });
  preconnect('https://api.example.com');
  prefetchDNS('https://tracking.example.com');

  return (
    <html>
      <head>
        <title>Resource Hints Test</title>
        <link rel="stylesheet" href="styles.css" precedence="default" />
        <link rel="stylesheet" href="theme.css" precedence="low" />
      </head>
      <body>
        <div id="root">
          <h1>Hello with Resources</h1>
          <Suspense fallback={<div>Loading...</div>}>
            <AsyncComponent />
          </Suspense>
        </div>
      </body>
    </html>
  );
}

let resolveAsync;
const asyncPromise = new Promise(r => { resolveAsync = r; });

function AsyncComponent() {
  const data = React.use(asyncPromise);
  // Preload discovered during async render
  preload('https://cdn.example.com/lazy-image.jpg', { as: 'image' });
  return <div id="async">{data}</div>;
}
```

### Server setup with onHeaders:
```js
let receivedHeaders = null;

const { prelude } = await prerenderToNodeStream(<ResourceApp />, {
  onHeaders(headers) {
    receivedHeaders = headers;
    // In a real server, you'd send these as HTTP Link headers
    // or 103 Early Hints
  },
});
```

## Load Sequence
1. Server starts rendering `<ResourceApp />`.
2. During rendering, imperative `preload`, `preinit`, `preconnect`, and `prefetchDNS` calls are collected.
3. Declarative `<link>` elements with `precedence` prop are collected as Float resources.
4. The `onHeaders` callback fires with a headers object containing `Link` header values for early hints.
5. These headers can be sent as HTTP `103 Early Hints` or `Link` headers before the HTML body.
6. In the HTML `<head>`, preload links and stylesheet links are emitted in precedence order.
7. Stylesheets with `precedence` are hoisted to `<head>` and ordered by precedence.
8. When the async component resolves, additional preloads discovered during its render are emitted.

## Actions
1. Render `<ResourceApp />` using `prerenderToNodeStream` with `onHeaders`.
2. Inspect the headers object received by `onHeaders`.
3. Collect the HTML output.
4. Parse the `<head>` section for resource links.
5. Resolve the async content.
6. Check for additional resource hints emitted with the async chunk.

## Assertions
1. `onHeaders` is called with a headers object containing `Link` header entries.
2. The Link headers include entries for the font preload, image preload, stylesheet preinit, and script preinit.
3. The `<head>` contains `<link rel="preload" as="font" href="https://cdn.example.com/font.woff2" type="font/woff2" crossorigin="anonymous"/>`.
4. The `<head>` contains `<link rel="preload" as="image" href="https://cdn.example.com/hero.jpg" fetchpriority="high"/>`.
5. The `<head>` contains a `<link rel="stylesheet" href="https://cdn.example.com/critical.css"/>` with high precedence (appears before default/low precedence stylesheets).
6. The `<head>` contains `<link rel="stylesheet" href="styles.css"/>` and `<link rel="stylesheet" href="theme.css"/>` in precedence order (default before low).
7. The `<head>` contains `<link rel="preconnect" href="https://api.example.com"/>`.
8. The `<head>` contains `<link rel="dns-prefetch" href="https://tracking.example.com"/>`.
9. After resolving the async component, a preload for `lazy-image.jpg` is included in the output.
10. Hydration completes without warnings about resource mismatch.
