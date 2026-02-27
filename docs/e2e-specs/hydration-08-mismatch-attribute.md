# Attribute Mismatch Detection and Recovery

## Category
hydration

## Description
Validates that React detects attribute mismatches between server-rendered HTML and the client tree, including differences in `className`, `style`, `id`, and other HTML attributes. In development, React logs a detailed diff showing the mismatched attributes. Certain attribute mismatches produce warnings but may not cause a full client re-render; the server-rendered attribute values may persist.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — "should warn when the style property differs"
- `packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js` — attribute mismatch diffs

## App Setup
```jsx
function App({ isServer }) {
  return (
    <div id="app">
      <div
        id="class-mismatch"
        className={isServer ? 'server-class' : 'client-class'}
      >
        Class mismatch
      </div>

      <div
        id="style-mismatch"
        style={
          isServer
            ? { color: 'black', textDecoration: 'none', height: '10px' }
            : { color: 'white', textDecoration: 'none', height: '10px' }
        }
      >
        Style mismatch
      </div>

      <div
        id="multi-attr-mismatch"
        title={isServer ? 'Server tooltip' : 'Client tooltip'}
        data-value={isServer ? 'server-data' : 'client-data'}
        aria-label={isServer ? 'server label' : 'client label'}
      >
        Multiple attribute mismatches
      </div>

      <div id="no-mismatch" className="stable" title="same">
        No mismatch here
      </div>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App isServer={true} />` with server-side attribute values.
2. Browser paints server HTML.
3. Client JS loads.
4. `hydrateRoot(container, <App isServer={false} />)` is called.
5. React detects attribute differences during hydration.
6. React logs warnings showing the diff between server and client attributes.

## Actions
1. Load the server-rendered page.
2. Wait for hydration to complete.
3. Inspect the console for attribute mismatch warnings.
4. Inspect each element's attributes in the DOM.

## Assertions
1. Before hydration: `<div id="class-mismatch">` has `class="server-class"`.
2. Before hydration: `<div id="style-mismatch">` has `color: black` in its style.
3. In development mode: console errors are produced showing the attribute diff, e.g., `+ color: "white"` / `- color: "black"`.
4. The warning message references `https://react.dev/link/hydration-mismatch`.
5. After hydration: React logs attribute mismatches for `className`, `style.color`, `title`, `data-value`, and `aria-label`.
6. The `<div id="no-mismatch">` produces no warnings and retains `class="stable"` and `title="same"`.
7. The attribute mismatch warning includes the component tree path (e.g., `in div (at ...)` / `in App (at ...)`).
8. Despite warnings, the app remains functional after hydration.
