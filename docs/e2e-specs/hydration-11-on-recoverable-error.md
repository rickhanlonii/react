# onRecoverableError Callback for Hydration Mismatches

## Category
hydration

## Description
Validates that the `onRecoverableError` callback passed to `hydrateRoot` is called when hydration mismatches occur. The callback receives an `Error` object with a descriptive message about the hydration failure. This allows applications to log hydration mismatches to error reporting services. The callback should not be called for successful hydrations or for mismatches suppressed by `suppressHydrationWarning`.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — `onRecoverableError` usage throughout
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — `onRecoverableError` with mismatch messages
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — `onRecoverableError` for shell errors

## App Setup
```jsx
const errors = [];

function App({ isServer }) {
  return (
    <div>
      {/* Text mismatch */}
      <p id="text-mismatch">
        {isServer ? 'Server text' : 'Client text'}
      </p>

      {/* Element mismatch */}
      {isServer ? (
        <div id="element-mismatch">Server div</div>
      ) : (
        <span id="element-mismatch">Client span</span>
      )}

      {/* Suppressed mismatch - should NOT trigger onRecoverableError */}
      <p id="suppressed" suppressHydrationWarning={true}>
        {isServer ? 'Suppressed server' : 'Suppressed client'}
      </p>

      {/* Clean section */}
      <p id="clean">No mismatch</p>
    </div>
  );
}

// Hydration call:
hydrateRoot(container, <App isServer={false} />, {
  onRecoverableError(error, errorInfo) {
    errors.push({
      message: error.message,
      cause: error.cause?.message,
      componentStack: errorInfo.componentStack,
    });
  },
});
```

## Load Sequence
1. Server renders `<App isServer={true} />`.
2. Browser paints server HTML.
3. Client JS loads.
4. `hydrateRoot` is called with `<App isServer={false} />` and an `onRecoverableError` callback.
5. React detects mismatches and invokes the callback for each recoverable error.
6. React falls back to client rendering for mismatched subtrees.

## Actions
1. Load the server-rendered page.
2. Wait for hydration to complete.
3. Inspect the `errors` array to verify callback invocations.
4. Verify the error objects contain useful information.

## Assertions
1. The `onRecoverableError` callback is called at least once for the text and element mismatches.
2. Each error object has a `message` property containing a description like "Hydration failed because the server rendered HTML didn't match the client" or similar.
3. The error may have a `cause` property with more specific mismatch details.
4. The `onRecoverableError` callback is NOT called for the suppressed mismatch (`<p id="suppressed">`).
5. The `onRecoverableError` callback is NOT called for the clean section (`<p id="clean">`).
6. After recovery: `<p id="text-mismatch">` shows "Client text".
7. After recovery: the element mismatch is resolved to the client-expected `<span>`.
8. The `<p id="suppressed">` retains "Suppressed server" (server content persists when suppressed).
9. The `<p id="clean">` shows "No mismatch" and is the same DOM node as server-rendered.
