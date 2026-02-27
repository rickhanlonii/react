# Element Type Mismatch Detection and Recovery

## Category
hydration

## Description
Validates that React detects element type mismatches between server-rendered HTML and the client tree (e.g., server renders a `<div>` but client expects a `<span>`, or server renders `<article>` but client expects `<section>`). React should log a warning in development, invoke `onRecoverableError`, and fall back to client rendering for the mismatched Suspense boundary or subtree.

## References
- `packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js` — "warns when client and server render different html"
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — "falls back to client rendering boundary on mismatch"

## App Setup
```jsx
function App({ isServer }) {
  return (
    <div id="app">
      {isServer ? (
        <div id="mismatch-1" className="content">Content A</div>
      ) : (
        <span id="mismatch-1" className="content">Content A</span>
      )}

      {isServer ? (
        <article id="mismatch-2">Article content</article>
      ) : (
        <section id="mismatch-2">Article content</section>
      )}

      <p id="stable">Stable paragraph</p>
    </div>
  );
}
```

Server renders with `isServer=true`, producing `<div>` and `<article>`. Client hydrates with `isServer=false`, expecting `<span>` and `<section>`.

## Load Sequence
1. Server renders `<App isServer={true} />` producing HTML with `<div>` and `<article>` elements.
2. Browser paints server HTML.
3. Client JS loads.
4. `hydrateRoot(container, <App isServer={false} />, { onRecoverableError })` is called.
5. React detects that the server-rendered `<div>` does not match the expected `<span>`, and `<article>` does not match `<section>`.
6. React falls back to client rendering for the entire subtree, replacing mismatched elements.

## Actions
1. Load the server-rendered page.
2. Wait for hydration to complete (with mismatch recovery).
3. Inspect the console for mismatch warnings.
4. Inspect the final DOM.

## Assertions
1. Before hydration: the page contains a `<div id="mismatch-1">` and an `<article id="mismatch-2">`.
2. In development mode: console errors are logged indicating the element type mismatch (e.g., expected `<span>` but found `<div>`).
3. The `onRecoverableError` callback is invoked with an error describing the hydration mismatch.
4. After recovery: the DOM contains `<span id="mismatch-1">` instead of `<div>`.
5. After recovery: the DOM contains `<section id="mismatch-2">` instead of `<article>`.
6. The text content inside the replaced elements is preserved ("Content A" and "Article content").
7. The stable `<p id="stable">` is unaffected and retains the same DOM node.
8. The app is interactive after recovery.
