# Text Content Mismatch Detection and Recovery

## Category
hydration

## Description
Validates that React detects text content mismatches between server-rendered HTML and the client-side tree, logs a warning in development, and recovers by client-rendering the mismatched subtree. The recovery replaces the server-rendered text with the client text. The `onRecoverableError` callback on the root should be invoked for these mismatches.

## References
- `packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js` — "warns when client and server render different text"
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — mismatch scenario with `name="y"` vs `name="x"`

## App Setup
```jsx
function App({ isServer }) {
  return (
    <div id="app">
      <h1 id="title">{isServer ? 'Server Title' : 'Client Title'}</h1>
      <p id="content">
        {isServer ? 'Server content paragraph' : 'Client content paragraph'}
      </p>
      <span id="number">{isServer ? 100 : 200}</span>
      <div id="stable">This text is the same on both</div>
    </div>
  );
}
```

Server renders with `isServer=true`, producing "Server Title", "Server content paragraph", and "100". Client hydrates with `isServer=false`, expecting "Client Title", "Client content paragraph", and "200".

## Load Sequence
1. Server renders `<App isServer={true} />` and sends HTML.
2. Browser paints: "Server Title", "Server content paragraph", "100", and "This text is the same on both".
3. Client JS loads.
4. `hydrateRoot(container, <App isServer={false} />, { onRecoverableError })` is called.
5. React detects text mismatches in `<h1>`, `<p>`, and `<span>`.
6. React logs development warnings and invokes `onRecoverableError`.
7. React falls back to client rendering for the mismatched subtree, replacing the server text with client text.

## Actions
1. Load the server-rendered page.
2. Wait for hydration to begin and complete.
3. Observe the console for mismatch warnings.
4. Check the `onRecoverableError` callback invocations.
5. Inspect the final DOM content.

## Assertions
1. Before hydration: the page shows "Server Title", "Server content paragraph", and "100".
2. In development mode: console errors are logged indicating text content mismatches, with a diff showing the server vs client text (e.g., `+ Client Title` / `- Server Title`).
3. The `onRecoverableError` callback is called with an error whose message indicates a hydration mismatch.
4. After recovery: `<h1 id="title">` contains "Client Title".
5. After recovery: `<p id="content">` contains "Client content paragraph".
6. After recovery: `<span id="number">` contains "200".
7. The stable `<div id="stable">` retains "This text is the same on both" and is the same DOM node.
8. The app is fully interactive after recovery.
