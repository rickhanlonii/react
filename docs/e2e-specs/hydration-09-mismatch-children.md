# Extra or Missing Children Mismatch Detection and Recovery

## Category
hydration

## Description
Validates that React detects structural mismatches where the server renders extra children that the client does not expect, or the client expects children that the server did not render. React should detect these mismatches, log warnings in development, invoke `onRecoverableError`, and fall back to client rendering for the affected subtree.

## References
- `packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js` — extra/missing node tests
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — "recovers with client render when server rendered additional nodes at suspense root"

## App Setup
```jsx
function App({ isServer }) {
  return (
    <div id="app">
      {/* Extra children on server */}
      <div id="extra-server-children">
        <span>Always here</span>
        {isServer && <span id="server-only">Server only child</span>}
        {isServer && <span id="server-only-2">Another server only</span>}
      </div>

      {/* Extra children on client */}
      <div id="extra-client-children">
        <span>Always here too</span>
        {!isServer && <span id="client-only">Client only child</span>}
      </div>

      {/* Different number of list items */}
      <ul id="list-mismatch">
        <li>Item 1</li>
        <li>Item 2</li>
        {isServer && <li id="extra-li">Item 3 (server only)</li>}
      </ul>

      <div id="stable-section">
        <p>This section is identical</p>
      </div>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App isServer={true} />` with extra `<span>` children and an extra `<li>`.
2. Browser paints server HTML showing all server-only children.
3. Client JS loads.
4. `hydrateRoot(container, <App isServer={false} />, { onRecoverableError })` is called.
5. React detects that the server HTML has nodes the client does not expect, and the client expects a node the server did not render.
6. React logs mismatch warnings and falls back to client rendering for affected subtrees.

## Actions
1. Load the server-rendered page.
2. Observe the server-rendered content including "Server only child" and "Item 3 (server only)".
3. Wait for hydration to complete.
4. Check the console for mismatch warnings.
5. Check `onRecoverableError` invocations.
6. Inspect the final DOM.

## Assertions
1. Before hydration: `<div id="extra-server-children">` contains "Always here", "Server only child", and "Another server only".
2. Before hydration: `<div id="extra-client-children">` contains only "Always here too" (no client-only child yet).
3. Before hydration: the `<ul>` has 3 `<li>` elements.
4. After hydration/recovery: `<div id="extra-server-children">` contains only "Always here" (server-only spans removed).
5. After hydration/recovery: `<div id="extra-client-children">` contains "Always here too" and "Client only child".
6. After hydration/recovery: the `<ul>` has 2 `<li>` elements ("Item 1" and "Item 2").
7. The `onRecoverableError` callback is invoked for the structural mismatches.
8. In development mode: warnings indicate the extra/missing nodes.
9. `<div id="stable-section">` is unchanged and uses the same DOM node.
10. The app is interactive after recovery.
