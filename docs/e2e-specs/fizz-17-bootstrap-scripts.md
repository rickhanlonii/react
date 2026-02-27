# Bootstrap Scripts and Modules Injection into HTML Output

## Category
fizz

## Description
Validates that `bootstrapScripts`, `bootstrapModules`, and `bootstrapScriptContent` options in the Fizz streaming APIs correctly inject `<script>` tags into the HTML output. Bootstrap scripts are the entry point for client-side JavaScript (hydration). The renderer emits preload hints in the `<head>` and the actual script tags at the end of the output, ensuring the page loads efficiently.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (bootstrap script tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (bootstrap tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (bootstrap with integrity)

## App Setup
```jsx
function BootstrapApp() {
  return (
    <html>
      <head>
        <title>Bootstrap Test</title>
      </head>
      <body>
        <div id="root">
          <h1>Hello World</h1>
          <p>This page has bootstrap scripts.</p>
        </div>
      </body>
    </html>
  );
}
```

### Server setup with all bootstrap options:
```js
const { pipe } = renderToPipeableStream(<BootstrapApp />, {
  bootstrapScriptContent: 'window.__INIT__ = true;',
  bootstrapScripts: [
    'main.js',
    { src: 'vendor.js', integrity: 'sha384-abc123' },
  ],
  bootstrapModules: [
    'app.mjs',
    { src: 'utils.mjs', integrity: 'sha384-def456' },
  ],
  onShellReady() {
    pipe(writable);
  },
});
```

## Load Sequence
1. Server renders the HTML document.
2. In the `<head>`, preload hints are emitted for each bootstrap script:
   - `<link rel="preload" as="script" href="main.js" />` for regular scripts
   - `<link rel="modulepreload" href="app.mjs" />` for modules
3. In the `<body>` (after the content), the actual scripts are emitted:
   - `<script>window.__INIT__ = true;</script>` for inline content
   - `<script src="main.js" async=""></script>` for regular scripts
   - `<script type="module" src="app.mjs" async=""></script>` for modules
4. Scripts with integrity hashes include the `integrity` attribute on both the preload link and the script tag.

## Actions
1. Server-render `<BootstrapApp />` with all bootstrap options.
2. Collect the complete HTML output.
3. Parse and inspect the `<head>` for preload links.
4. Parse and inspect the `<body>` for script tags.

## Assertions
1. The `<head>` contains `<link rel="preload" as="script" fetchpriority="low" href="main.js"/>` for the main script.
2. The `<head>` contains `<link rel="preload" as="script" fetchpriority="low" href="vendor.js" integrity="sha384-abc123"/>` for the vendor script with integrity.
3. The `<head>` contains `<link rel="modulepreload" fetchpriority="low" href="app.mjs"/>` for the module.
4. The `<head>` contains `<link rel="modulepreload" fetchpriority="low" href="utils.mjs" integrity="sha384-def456"/>` for the module with integrity.
5. The output contains an inline `<script>` with content `window.__INIT__ = true;`.
6. The output contains `<script src="main.js" async=""></script>`.
7. The output contains `<script src="vendor.js" async="" integrity="sha384-abc123"></script>`.
8. The output contains `<script type="module" src="app.mjs" async=""></script>`.
9. The output contains `<script type="module" src="utils.mjs" async="" integrity="sha384-def456"></script>`.
10. Preload links appear before the body content (they are in the head).
11. Script tags appear after the body content.
12. The preload links have `fetchpriority="low"` to avoid competing with critical resources.
