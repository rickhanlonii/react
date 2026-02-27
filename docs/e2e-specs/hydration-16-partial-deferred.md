# Deferred Hydration of Non-Critical Suspense Boundaries

## Category
hydration

## Description
Validates that non-critical Suspense boundaries can have their hydration deferred while critical content hydrates first. When the server sends HTML with multiple Suspense boundaries, React can prioritize hydrating certain boundaries over others. Boundaries whose data is still loading on the client remain in their server-rendered state while other parts of the page become interactive.

## References
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — "hydrates a parent even if a child Suspense boundary is blocked"
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — "can hydrate siblings of a suspended component without errors"

## App Setup
```jsx
let suspendSidebar = true;
let resolveSidebar;
const sidebarPromise = new Promise(resolve => (resolveSidebar = resolve));

function Sidebar() {
  if (suspendSidebar) {
    throw sidebarPromise;
  }
  return (
    <aside id="sidebar">
      <h2>Sidebar</h2>
      <ul>
        <li>Link 1</li>
        <li>Link 2</li>
        <li>Link 3</li>
      </ul>
    </aside>
  );
}

function MainContent() {
  const [count, setCount] = React.useState(0);
  return (
    <main id="main">
      <h1>Main Content</h1>
      <p id="main-counter">Counter: {count}</p>
      <button id="main-btn" onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </main>
  );
}

function App() {
  return (
    <div id="layout">
      <Suspense fallback={<div>Loading sidebar...</div>}>
        <Sidebar />
      </Suspense>
      <Suspense fallback={<div>Loading main...</div>}>
        <MainContent />
      </Suspense>
    </div>
  );
}
```

On the server, `suspendSidebar = false` and all content renders. On the client, `suspendSidebar = true` so the sidebar suspends during hydration.

## Load Sequence
1. Server renders `<App />` with both sidebar and main content fully rendered.
2. Browser paints the complete layout (sidebar and main content visible).
3. Client JS loads. `suspendSidebar = true`.
4. `hydrateRoot(container, <App />)` is called.
5. React begins hydrating. The sidebar boundary suspends; the main content boundary hydrates immediately.
6. Main content becomes interactive while the sidebar remains in its server-rendered (but not hydrated) state.
7. Later, `resolveSidebar()` is called.
8. React hydrates the sidebar boundary.

## Actions
1. Load the server-rendered page.
2. Wait for the main content boundary to hydrate.
3. Click the "Increment" button to verify main content is interactive.
4. Attempt to interact with the sidebar (should be non-interactive since it is not yet hydrated).
5. Resolve the sidebar promise.
6. Wait for sidebar to hydrate.

## Assertions
1. After server render: both sidebar and main content are visible.
2. During partial hydration: the main content is interactive (button click works, counter increments).
3. During partial hydration: the sidebar's server-rendered HTML remains visible (not replaced by a fallback).
4. During partial hydration: the sidebar is not interactive (no JS event handlers).
5. After resolving the sidebar promise: React hydrates the sidebar.
6. After sidebar hydration: the sidebar is fully interactive.
7. The server-rendered HTML for the sidebar is reused (same DOM nodes).
8. No console errors or hydration warnings.
9. The main content's counter state is preserved through the sidebar hydration.
