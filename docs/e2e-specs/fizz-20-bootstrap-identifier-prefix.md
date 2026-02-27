# identifierPrefix for Multiple React Roots on Same Page

## Category
fizz

## Description
Validates the `identifierPrefix` option for `renderToPipeableStream` and `renderToReadableStream`, which allows multiple independent React roots to coexist on the same page without ID collisions. When set, all internally generated IDs (e.g., from `useId`, Suspense boundary IDs, streaming script IDs) are prefixed with the given string, ensuring uniqueness across roots.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (identifierPrefix tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` (identifierPrefix with forms)

## App Setup
```jsx
function WidgetA() {
  const id = React.useId();
  return (
    <div id="widget-a">
      <label htmlFor={id}>Widget A Label</label>
      <input id={id} type="text" />
      <Suspense fallback={<div>Loading A content...</div>}>
        <AsyncContentA />
      </Suspense>
    </div>
  );
}

function WidgetB() {
  const id = React.useId();
  return (
    <div id="widget-b">
      <label htmlFor={id}>Widget B Label</label>
      <input id={id} type="text" />
      <Suspense fallback={<div>Loading B content...</div>}>
        <AsyncContentB />
      </Suspense>
    </div>
  );
}

let resolveA, resolveB;
const promiseA = new Promise(r => { resolveA = r; });
const promiseB = new Promise(r => { resolveB = r; });

function AsyncContentA() {
  const data = React.use(promiseA);
  return <span>{data}</span>;
}

function AsyncContentB() {
  const data = React.use(promiseB);
  return <span>{data}</span>;
}
```

### Server setup with two separate renders:
```js
// Render Widget A with prefix "left"
const streamA = renderToPipeableStream(<WidgetA />, {
  identifierPrefix: 'left',
  onShellReady() { pipeA(writableA); },
});

// Render Widget B with prefix "right"
const streamB = renderToPipeableStream(<WidgetB />, {
  identifierPrefix: 'right',
  onShellReady() { pipeB(writableB); },
});
```

### Combined page:
```html
<html>
<body>
  <div id="container-a"><!-- HTML from streamA --></div>
  <div id="container-b"><!-- HTML from streamB --></div>
</body>
</html>
```

## Load Sequence
1. Two independent `renderToPipeableStream` calls render Widget A and Widget B.
2. Widget A uses `identifierPrefix: 'left'`, Widget B uses `identifierPrefix: 'right'`.
3. All generated IDs for Widget A start with `left`, all for Widget B start with `right`.
4. Both shells are flushed independently.
5. When streaming scripts arrive for each widget, they use the prefixed IDs to find the correct DOM elements.
6. Hydration for each widget uses the matching prefix.

## Actions
1. Server-render `<WidgetA />` with `identifierPrefix: 'left'`.
2. Server-render `<WidgetB />` with `identifierPrefix: 'right'`.
3. Combine both HTML outputs into a single page.
4. Inspect all generated IDs in both outputs.
5. Resolve async content for both widgets.
6. Hydrate each widget with the matching prefix.

## Assertions
1. The `useId` value in Widget A starts with `:left` (e.g., `:leftR1:`).
2. The `useId` value in Widget B starts with `:right` (e.g., `:rightR1:`).
3. The IDs from Widget A and Widget B do not collide, even though the components have the same structure.
4. Suspense boundary template IDs in Widget A use the `left` prefix (e.g., `id="leftS:0"`).
5. Suspense boundary template IDs in Widget B use the `right` prefix (e.g., `id="rightS:0"`).
6. Streaming `<script>` elements reference the correct prefixed IDs for their respective widget.
7. Both widgets can be hydrated on the same page without interference: `hydrateRoot(containerA, <WidgetA />, { identifierPrefix: 'left' })` and `hydrateRoot(containerB, <WidgetB />, { identifierPrefix: 'right' })`.
8. Hydration completes without warnings for either widget.
9. After hydration, label-input associations work correctly within each widget.
