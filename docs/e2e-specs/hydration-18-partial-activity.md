# Activity Component Based Hydration Prioritization

## Category
hydration

## Description
Validates that the `Activity` component (formerly known as `Offscreen` / `LegacyHidden`) can be used to control hydration priority. Content wrapped in `<Activity>` can have its hydration deferred, allowing React to prioritize hydrating visible, critical content first. When a child inside an Activity boundary suspends during hydration, React continues hydrating siblings. Once the suspended data resolves, the Activity boundary hydrates.

## References
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydrationActivity-test.internal.js` — "hydrates a parent even if a child Activity boundary is blocked"
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydrationActivity-test.internal.js` — "can hydrate siblings of a suspended component without errors"
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydrationActivity-test.internal.js`

## App Setup
```jsx
let suspendHeavyWidget = true;
let resolveHeavyWidget;
const widgetPromise = new Promise(resolve => (resolveHeavyWidget = resolve));

function HeavyWidget() {
  if (suspendHeavyWidget) {
    throw widgetPromise;
  }
  return (
    <div id="heavy-widget">
      <h3>Heavy Widget</h3>
      <p>Complex analytics dashboard content</p>
      <button
        id="widget-btn"
        onClick={() => {
          document.getElementById('widget-status').textContent = 'Widget clicked';
        }}
      >
        Refresh Data
      </button>
    </div>
  );
}

function CriticalContent() {
  const [count, setCount] = React.useState(0);
  return (
    <div id="critical">
      <h1>Welcome</h1>
      <p id="critical-counter">Views: {count}</p>
      <button id="critical-btn" onClick={() => setCount(c => c + 1)}>
        Increment Views
      </button>
    </div>
  );
}

function App() {
  return (
    <div>
      <CriticalContent />
      <Activity>
        <Suspense fallback={<div>Loading widget...</div>}>
          <HeavyWidget />
        </Suspense>
      </Activity>
      <p id="widget-status">Idle</p>
    </div>
  );
}
```

## Load Sequence
1. Server renders everything including the Activity-wrapped content. Both critical content and the heavy widget are in the HTML.
2. Browser paints all content.
3. Client JS loads. `suspendHeavyWidget = true`.
4. `hydrateRoot(container, <App />)` is called.
5. React hydrates `CriticalContent` first (it is not inside Activity and not suspended).
6. The Activity boundary containing the heavy widget is deferred; its child suspends.
7. Critical content becomes interactive.
8. `resolveHeavyWidget()` is called later.
9. React hydrates the Activity boundary.

## Actions
1. Load the server-rendered page.
2. Wait for critical content to hydrate.
3. Click "Increment Views" to confirm critical content is interactive.
4. Observe that the heavy widget is visible (server-rendered) but not interactive.
5. Resolve the widget promise.
6. Wait for the Activity boundary to hydrate.
7. Click "Refresh Data" on the heavy widget.

## Assertions
1. After server render: both critical content and heavy widget are visible.
2. Critical content hydrates first and becomes interactive.
3. Clicking "Increment Views" updates the counter to "Views: 1".
4. While the Activity boundary is deferred: the heavy widget's server-rendered HTML remains visible (no fallback shown).
5. While the Activity boundary is deferred: clicking the widget button has no effect.
6. After resolving the promise: the Activity boundary hydrates.
7. After hydration: clicking "Refresh Data" updates widget status to "Widget clicked".
8. The heavy widget DOM nodes are the same server-rendered nodes.
9. No hydration errors or warnings.
