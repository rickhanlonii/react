# Keyboard Events Trigger Selective Hydration with Appropriate Priority

## Category
hydration

## Description
Validates that keyboard events (such as `keydown`, `keyup`, `input`) on a not-yet-hydrated Suspense boundary trigger selective hydration of that boundary. Discrete keyboard events like `keydown` should be treated with the same high priority as click events for selective hydration. After hydration, the keyboard event handler should fire and the input should be functional.

## References
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates the target boundary synchronously during a click" (same mechanism applies to keyboard)
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "fires capture event handlers and native events if content is hydratable during discrete event"

## App Setup
```jsx
function SearchBox() {
  const [value, setValue] = React.useState('');
  const [keyLog, setKeyLog] = React.useState([]);

  return (
    <div id="search-container">
      <input
        id="search-input"
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          setKeyLog(prev => [...prev, `keydown:${e.key}`]);
        }}
        placeholder="Search..."
      />
      <p id="key-log">{keyLog.join(', ')}</p>
      <p id="search-value">Value: {value}</p>
    </div>
  );
}

function App() {
  return (
    <div>
      <Suspense fallback="Loading header...">
        <header id="header"><h1>Site Header</h1></header>
      </Suspense>
      <Suspense fallback="Loading search...">
        <SearchBox />
      </Suspense>
      <Suspense fallback="Loading content...">
        <main id="main-content"><p>Main content area</p></main>
      </Suspense>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App />` with all three Suspense boundaries resolved.
2. Browser paints: header, search input, and main content are visible but not interactive.
3. Client JS loads.
4. `hydrateRoot(container, <App />)` is called.
5. Hydration starts but boundaries are pending.
6. User focuses the search input and presses a key.
7. React selectively hydrates the Suspense boundary containing `<SearchBox />`.
8. The keyboard event handler fires.
9. Remaining boundaries hydrate at normal priority.

## Actions
1. Load the server-rendered page.
2. Before hydration completes, click on (or tab to) the search input to focus it.
3. Press the "a" key while the search input is focused.
4. Wait for hydration of the search boundary to complete.
5. Type additional characters "bc".
6. Wait for all remaining boundaries to hydrate.

## Assertions
1. Before hydration: the search input, header, and main content are visible.
2. When the user presses a key on the search input: React selectively hydrates the Suspense boundary containing the input.
3. After hydration of the search boundary: the `onKeyDown` handler fires and the key log shows the pressed key.
4. The input accepts typed characters and the value updates reactively.
5. After typing "abc": `<p id="search-value">` shows "Value: abc".
6. The header and main content boundaries hydrate afterward at normal priority.
7. No hydration errors.
