# useEffect and useLayoutEffect Firing After Hydration

## Category
hydration

## Description
Validates that `useEffect` and `useLayoutEffect` fire after hydration completes, in the correct order. `useLayoutEffect` fires synchronously after DOM mutations (hydration attachment), and `useEffect` fires after the browser has had a chance to paint. This test also verifies that effects fire only once during hydration (not during server render) and that cleanup functions work correctly on unmount.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — "should have the correct mounting behavior" (componentDidMount equivalent)

## App Setup
```jsx
const effectLog = [];

function Child({ label }) {
  React.useLayoutEffect(() => {
    effectLog.push(`layoutEffect:${label}`);
    return () => effectLog.push(`layoutCleanup:${label}`);
  }, []);

  React.useEffect(() => {
    effectLog.push(`effect:${label}`);
    return () => effectLog.push(`cleanup:${label}`);
  }, []);

  return <div id={`child-${label}`}>{label}</div>;
}

function App() {
  const [hydrated, setHydrated] = React.useState(false);

  React.useLayoutEffect(() => {
    effectLog.push('layoutEffect:App');
    return () => effectLog.push('layoutCleanup:App');
  }, []);

  React.useEffect(() => {
    effectLog.push('effect:App');
    setHydrated(true);
    return () => effectLog.push('cleanup:App');
  }, []);

  return (
    <div id="app">
      <Child label="A" />
      <Child label="B" />
      <p id="hydration-status">{hydrated ? 'Hydrated' : 'Server'}</p>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App />`. No effects fire on the server — `effectLog` stays empty server-side.
2. HTML is sent to browser: shows "A", "B", and "Server".
3. Client JS loads and `hydrateRoot(container, <App />)` is called.
4. React walks the DOM, attaches to existing nodes.
5. `useLayoutEffect` callbacks fire synchronously (bottom-up: Child A, Child B, App).
6. Browser paints.
7. `useEffect` callbacks fire (bottom-up: Child A, Child B, App).
8. The App effect calls `setHydrated(true)`, triggering a re-render that updates "Server" to "Hydrated".

## Actions
1. Load the server-rendered page.
2. Wait for hydration to complete.
3. Wait for all effects to fire.
4. Observe the effect execution log and the DOM state.

## Assertions
1. Before hydration: the status text shows "Server".
2. Effects do not fire on the server (effectLog is empty before hydration on the client).
3. After hydration, `useLayoutEffect` fires before `useEffect` for each component.
4. The effect firing order is: `layoutEffect:A`, `layoutEffect:B`, `layoutEffect:App`, then `effect:A`, `effect:B`, `effect:App`.
5. After effects fire: the status text updates from "Server" to "Hydrated".
6. Each effect fires exactly once (not doubled due to hydration).
7. No hydration warnings or errors.
8. DOM nodes are the same as the server-rendered ones.
