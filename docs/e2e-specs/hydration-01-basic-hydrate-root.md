# Basic hydrateRoot Attaching to Server-Rendered HTML

## Category
hydration

## Description
Validates that `hydrateRoot` correctly attaches a React tree to server-rendered HTML without re-creating DOM nodes. After hydration completes, the app should be fully interactive with the same DOM elements that the server produced. This is the foundational hydration behavior that all other hydration features build upon.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — "should have the correct mounting behavior"

## App Setup
```jsx
function App() {
  const [count, setCount] = React.useState(0);
  return (
    <div id="app">
      <h1>Hello World</h1>
      <p id="counter">Count: {count}</p>
      <button id="increment" onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}
```

Server renders the app using `renderToPipeableStream` (or `renderToString`) and sends complete HTML to the browser. The HTML contains `<div id="app"><h1>Hello World</h1><p id="counter">Count: 0</p><button id="increment">Increment</button></div>`.

## Load Sequence
1. Server renders `<App />` to HTML and sends it as the initial document.
2. Browser displays the server-rendered HTML immediately (static, non-interactive).
3. Client JavaScript bundle loads.
4. `hydrateRoot(document.getElementById('root'), <App />)` is called.
5. React walks the existing DOM and attaches event listeners, refs, and state without replacing DOM nodes.
6. The app becomes interactive.

## Actions
1. Observe the page after server HTML arrives but before JS loads — static content is visible.
2. Wait for client JavaScript to load and hydration to begin.
3. Wait for hydration to complete.
4. Click the "Increment" button.
5. Click the "Increment" button a second time.

## Assertions
1. Before hydration: the page displays "Hello World", "Count: 0", and a button labeled "Increment".
2. Before hydration: clicking the button has no effect (no JS attached).
3. After hydration: the DOM elements (`<h1>`, `<p>`, `<button>`) are the exact same DOM nodes that were server-rendered (not re-created).
4. After hydration: no console errors or warnings are produced.
5. After clicking "Increment" once: the `<p>` text updates to "Count: 1".
6. After clicking "Increment" twice: the `<p>` text updates to "Count: 2".
7. The `<button>` DOM node reference remains the same before and after hydration (React reuses the server-rendered node).
