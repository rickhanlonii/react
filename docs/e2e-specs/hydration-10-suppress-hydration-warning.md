# suppressHydrationWarning Behavior

## Category
hydration

## Description
Validates that the `suppressHydrationWarning` prop suppresses hydration mismatch warnings for intentional differences between server and client content (e.g., timestamps, user-locale-specific formatting). The prop silences warnings but does NOT fix the mismatch — the server-rendered content persists in the DOM. Only direct text content mismatches on the element with the prop are suppressed; structural mismatches (different element types or children count) are not suppressed.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzSuppressHydrationWarning-test.js` — "suppresses but does not fix text mismatches with suppressHydrationWarning"

## App Setup
```jsx
function App({ isServer }) {
  const timestamp = isServer ? '2024-01-01 12:00:00' : '2024-01-01 12:00:05';
  const randomId = isServer ? 'id-server-123' : 'id-client-456';

  return (
    <div id="app">
      {/* Suppressed: text mismatch is silenced */}
      <span id="timestamp" suppressHydrationWarning={true}>
        {timestamp}
      </span>

      {/* Suppressed: numeric mismatch is silenced */}
      <span id="random-id" suppressHydrationWarning={true}>
        {randomId}
      </span>

      {/* NOT suppressed: no prop, should warn */}
      <span id="unsuppressed">
        {isServer ? 'Server text' : 'Client text'}
      </span>

      {/* Suppressed on parent, but structural mismatch is NOT suppressed */}
      <div id="structural" suppressHydrationWarning={true}>
        {isServer ? <div>Server child</div> : <span>Client child</span>}
      </div>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App isServer={true} />` producing server timestamps and IDs.
2. Browser paints server HTML.
3. Client JS loads.
4. `hydrateRoot(container, <App isServer={false} />, { onRecoverableError })` is called.
5. React encounters text mismatches in the suppressed elements but does not warn.
6. React encounters a text mismatch in the unsuppressed element and warns.
7. React encounters a structural mismatch in the `<div id="structural">` and warns despite `suppressHydrationWarning` (structural mismatches are not suppressed).

## Actions
1. Load the server-rendered page.
2. Wait for hydration to complete.
3. Check the console for warnings.
4. Inspect the DOM content of each element.

## Assertions
1. No hydration warning is logged for `<span id="timestamp">` (suppressHydrationWarning is set).
2. No hydration warning is logged for `<span id="random-id">` (suppressHydrationWarning is set).
3. The `<span id="timestamp">` retains the server-rendered text "2024-01-01 12:00:00" (mismatch is suppressed, not fixed).
4. The `<span id="random-id">` retains the server-rendered text "id-server-123".
5. A hydration warning IS logged for `<span id="unsuppressed">` because it lacks the suppress prop.
6. The `onRecoverableError` callback fires for the unsuppressed mismatch.
7. `<div id="structural">` produces a warning because `suppressHydrationWarning` does not suppress element type mismatches (only text content).
8. After recovery of the unsuppressed mismatch: `<span id="unsuppressed">` shows "Client text".
