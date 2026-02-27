# Error Boundary Wrapping Shell Catches Hydration Errors

## Category
hydration

## Description
Validates that an error boundary wrapping the shell correctly catches errors that occur during hydration. When a component throws during hydration (e.g., due to a data inconsistency or a client-only error), the error boundary catches the error and renders its fallback UI. React reports the error via `onCaughtError` (for errors caught by error boundaries) and `onRecoverableError` (for errors where React retried and succeeded via client render). This also covers the case where the server HTML shows one thing but the client-side error boundary shows a different fallback.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — "client renders when an error is thrown in an error boundary"
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — "client renders when a client error is thrown in an error boundary"
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — "client renders when a hydration pass error is thrown in an error boundary"

## App Setup
```jsx
let isClient = false;

function BrokenComponent() {
  if (isClient) {
    throw new Error('Client-side hydration error');
  }
  return <div id="content">Hello world</div>;
}

class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div id="error-fallback">
          Caught an error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <BrokenComponent />
    </ErrorBoundary>
  );
}
```

On the server, `isClient = false` so `BrokenComponent` renders normally. On the client, `isClient = true` so it throws during hydration.

## Load Sequence
1. Server renders `<App />` with `isClient = false`. The output is `<div id="content">Hello world</div>`.
2. Browser paints "Hello world".
3. Client JS loads. `isClient = true`.
4. `hydrateRoot(container, <App />, { onCaughtError, onRecoverableError })` is called.
5. During hydration, `BrokenComponent` throws `Error('Client-side hydration error')`.
6. React catches the error and falls back to client rendering.
7. On the client re-render, `BrokenComponent` throws again.
8. The `ErrorBoundary` catches the error via `getDerivedStateFromError`.
9. The error boundary renders its fallback: "Caught an error: Client-side hydration error".
10. `onCaughtError` is called with the error.

## Actions
1. Load the server-rendered page.
2. Observe "Hello world" from the server render.
3. Wait for hydration to attempt and fail.
4. Observe the error boundary fallback.
5. Check the error callbacks.

## Assertions
1. Before hydration: the page shows "Hello world" (server-rendered content).
2. After hydration fails and recovery: the page shows "Caught an error: Client-side hydration error".
3. The `<div id="content">` is replaced by `<div id="error-fallback">`.
4. The `onCaughtError` callback is invoked with the error message "Client-side hydration error".
5. The page does not crash — the error boundary provides graceful degradation.
6. The error boundary component remains mounted and functional after catching the error.
7. No uncaught errors propagate to the window error handler.
