# useDeferredValue with initialValue for SSR

## Category
fizz

## Description
Validates that `useDeferredValue` with an `initialValue` argument renders the initial value during SSR and then upgrades to the final value during client hydration. This is useful for showing a simpler or cheaper version of content on initial page load, then upgrading to the full version once JavaScript is interactive. During SSR, the initial value is always used to avoid expensive computations on the server.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzDeferredValue-test.js` (comprehensive useDeferredValue SSR tests)

## App Setup
```jsx
function DeferredValueApp() {
  return (
    <div id="app">
      <SimpleDeferred />
      <DeferredWithSuspense />
      <DeferredList />
    </div>
  );
}

function SimpleDeferred() {
  const value = React.useDeferredValue('Final Value', 'Initial Value');
  return <div id="simple-deferred">{value}</div>;
}

function DeferredWithSuspense() {
  const query = React.useDeferredValue('complex-query', '');
  return (
    <div id="deferred-suspense">
      <Suspense fallback={<div>Loading search...</div>}>
        <SearchResults query={query} />
      </Suspense>
    </div>
  );
}

function SearchResults({ query }) {
  if (!query) {
    return <div id="no-results">No search query</div>;
  }
  return <div id="search-results">Results for: {query}</div>;
}

function DeferredList() {
  const count = React.useDeferredValue(100, 10);
  return (
    <div id="deferred-list">
      <span id="item-count">{count}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="list-item">Item {i}</div>
      ))}
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<DeferredValueApp />)`.

## Load Sequence
1. Server renders the component tree.
2. For `SimpleDeferred`, `useDeferredValue('Final Value', 'Initial Value')` returns `'Initial Value'` during SSR.
3. For `DeferredWithSuspense`, `useDeferredValue('complex-query', '')` returns `''` during SSR, so `SearchResults` receives an empty query.
4. For `DeferredList`, `useDeferredValue(100, 10)` returns `10` during SSR, so only 10 items are rendered.
5. HTML is flushed with the initial values.
6. During hydration, the client first hydrates with the initial values, then transitions to the final values.

## Actions
1. Server-render `<DeferredValueApp />` and collect HTML output.
2. Parse the HTML and verify the server-rendered content uses initial values.
3. Hydrate with `hydrateRoot`.
4. After hydration completes and React processes updates, verify the final values.

## Assertions
1. `#simple-deferred` contains `Initial Value` in the server HTML (not `Final Value`).
2. `#no-results` is present in the server HTML (empty query shows "No search query").
3. `#search-results` is NOT present in the server HTML.
4. `#item-count` contains `10` in the server HTML.
5. The server HTML contains exactly 10 `.list-item` divs (not 100).
6. After hydration, `#simple-deferred` initially shows `Initial Value`, then updates to `Final Value`.
7. After hydration, `#no-results` is replaced by `#search-results` containing "Results for: complex-query".
8. After hydration, `#item-count` updates to `100` and 100 `.list-item` divs are rendered.
9. The transition from initial to final values does not cause hydration mismatch warnings (React expects this pattern).
10. The initial render matches the server HTML, preventing layout shift for the initial content.
