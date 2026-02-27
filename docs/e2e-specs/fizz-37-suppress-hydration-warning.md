# suppressHydrationWarning Attribute on Elements

## Category
fizz

## Description
Validates the `suppressHydrationWarning` prop, which tells React to silence warnings when the server-rendered HTML does not match the client-rendered output for a specific element. This is intentionally used for content that is expected to differ between server and client (e.g., timestamps, random IDs, locale-specific formatting). The prop suppresses warnings but does NOT fix mismatches -- the server content remains in the DOM until React re-renders.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzSuppressHydrationWarning-test.js` (comprehensive tests)

## App Setup
```jsx
function SuppressWarningApp({ isClient }) {
  return (
    <div id="app">
      {/* Text content mismatch -- suppressed */}
      <span id="text-suppress" suppressHydrationWarning={true}>
        {isClient ? 'Client Text' : 'Server Text'}
      </span>

      {/* Number content mismatch -- suppressed */}
      <span id="number-suppress" suppressHydrationWarning={true}>
        {isClient ? 2 : 1}
      </span>

      {/* Attribute mismatch -- suppressed */}
      <div
        id="attr-suppress"
        suppressHydrationWarning={true}
        className={isClient ? 'client-class' : 'server-class'}
      >
        Attribute test
      </div>

      {/* Element with matching content -- no warning expected */}
      <div id="matching" suppressHydrationWarning={true}>
        Same on both
      </div>

      {/* Without suppressHydrationWarning -- would warn on mismatch */}
      <span id="no-suppress">
        {isClient ? 'Client Only Shown' : 'Server Only Shown'}
      </span>

      {/* Nested content mismatch */}
      <div id="nested-suppress" suppressHydrationWarning={true}>
        <span>{isClient ? 'Client Nested' : 'Server Nested'}</span>
      </div>

      {/* Timestamp example (realistic use case) */}
      <time
        id="timestamp"
        suppressHydrationWarning={true}
        dateTime={new Date().toISOString()}
      >
        {isClient
          ? new Date().toLocaleString()
          : new Date('2024-01-01').toLocaleString()
        }
      </time>
    </div>
  );
}
```

### Server renders:
```js
renderToPipeableStream(<SuppressWarningApp isClient={false} />, {
  onShellReady() { pipe(writable); },
});
```

### Client hydrates:
```js
hydrateRoot(container, <SuppressWarningApp isClient={true} />);
```

## Load Sequence
1. Server renders with `isClient={false}`, producing server-specific content.
2. HTML is flushed with server values ("Server Text", 1, "server-class", etc.).
3. Client hydrates with `isClient={true}`.
4. React detects mismatches but suppresses warnings for elements with `suppressHydrationWarning={true}`.
5. The server content remains in the DOM until React re-renders the component.
6. For `#no-suppress`, React warns about the mismatch (no suppression).

## Actions
1. Server-render `<SuppressWarningApp isClient={false} />` and collect HTML.
2. Verify server HTML contains server-specific values.
3. Hydrate with `isClient={true}`.
4. Check for hydration warnings in the console.
5. Inspect DOM content after hydration.

## Assertions
1. Server HTML has `#text-suppress` containing "Server Text".
2. Server HTML has `#number-suppress` containing "1".
3. Server HTML has `#attr-suppress` with `class="server-class"`.
4. Server HTML has `#timestamp` with the server-formatted date.
5. During hydration, NO warning is logged for `#text-suppress` (suppressed).
6. During hydration, NO warning is logged for `#number-suppress` (suppressed).
7. During hydration, NO warning is logged for `#attr-suppress` (suppressed).
8. During hydration, a mismatch warning IS logged for `#no-suppress` (not suppressed).
9. After hydration, the text content of `#text-suppress` remains "Server Text" initially (React does not patch text mismatches even when suppressed).
10. The `suppressHydrationWarning` attribute does NOT appear in the rendered HTML output (it is a React-only prop).
11. `#matching` hydrates without any issue (content is the same on both sides).
12. `suppressHydrationWarning` only applies to the direct element, not deeply nested children (for `#nested-suppress`, the outer div suppresses but nested span behavior depends on React version).
