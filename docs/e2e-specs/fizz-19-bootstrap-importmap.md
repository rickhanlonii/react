# importMap Generation in HTML Output

## Category
fizz

## Description
Validates that the Fizz renderer correctly emits an `<script type="importmap">` tag in the `<head>` when the `importMap` option is provided. Import maps allow the browser to resolve bare module specifiers (e.g., `import React from 'react'`) to actual URLs. The import map JSON must be correctly serialized and escaped to prevent XSS via malicious import map keys or values.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (~line 3604, importMap tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (~line 4398, importMap escaping tests)

## App Setup
```jsx
function ImportMapApp() {
  return (
    <html>
      <head>
        <title>Import Map Test</title>
      </head>
      <body>
        <div id="root">
          <h1>Import Map Page</h1>
        </div>
      </body>
    </html>
  );
}

const importMap = {
  imports: {
    'react': 'https://cdn.example.com/react.js',
    'react-dom': 'https://cdn.example.com/react-dom.js',
    'lodash/': 'https://cdn.example.com/lodash/',
  },
  scopes: {
    '/app/': {
      'react': 'https://cdn.example.com/react-canary.js',
    },
  },
};
```

### Server setup:
```js
const { pipe } = renderToPipeableStream(<ImportMapApp />, {
  importMap,
  bootstrapModules: ['app.mjs'],
  onShellReady() {
    pipe(writable);
  },
});
```

### Escaping test with malicious import map:
```js
const maliciousImportMap = {
  "key</script><script>alert('xss')</script><script>": "value",
};

const { pipe: pipe2 } = renderToPipeableStream(<ImportMapApp />, {
  importMap: maliciousImportMap,
  onShellReady() {
    pipe2(writable2);
  },
});
```

## Load Sequence
1. Server starts rendering the HTML document.
2. In the `<head>`, an `<script type="importmap">` tag is emitted containing the JSON-serialized import map.
3. The import map script appears before bootstrap scripts.
4. Bootstrap module scripts follow, which can now use bare specifiers resolved by the import map.
5. The body content is rendered normally.

## Actions
1. Server-render `<ImportMapApp />` with the `importMap` option.
2. Collect the HTML output.
3. Parse the `<head>` and find the import map script.
4. Verify the JSON content of the import map.
5. Test with a malicious import map containing `</script>` in keys/values.
6. Verify that the malicious content is properly escaped.

## Assertions
1. The `<head>` contains a `<script type="importmap">` element.
2. The import map script content is valid JSON matching the provided `importMap` object.
3. The JSON contains the `imports` section with `react`, `react-dom`, and `lodash/` mappings.
4. The JSON contains the `scopes` section with the `/app/` scope.
5. The import map `<script>` appears before any bootstrap `<script>` or `<script type="module">` tags.
6. Bootstrap modules (`<script type="module" src="app.mjs">`) appear after the import map.
7. For the malicious import map, the `</script>` string in the key is escaped (the `S` or `s` is replaced with a unicode escape) so it does not break out of the script tag.
8. The malicious import map does NOT cause XSS -- `window.__test_outlet` is not set.
9. The escaped import map can still be parsed by `JSON.parse` to recover the original keys/values.
