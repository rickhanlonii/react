# Error Recovery: Server Error Triggers Client-Side Re-Render

## Category
fizz

## Description
Validates the full error recovery flow from server to client. When a component inside a Suspense boundary throws during server rendering, Fizz marks that boundary for client rendering and includes an error digest in the HTML. During hydration, the client detects this marker and re-renders the boundary entirely on the client side. If the client render succeeds (because the error was server-specific, like a missing environment variable), the user sees the content. If it also fails, an error boundary can catch it.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (error recovery, client render fallback)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (error digest in stream)
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` (hydration with errors)

## App Setup
```jsx
// This component fails on the server but works on the client
function ServerOnlyError({ isServer }) {
  if (isServer) {
    throw new Error('Server-only failure: missing env var');
  }
  return <div id="recovered">Client rendered successfully!</div>;
}

// This component always fails
function AlwaysBroken() {
  throw new Error('Always broken');
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div id={this.props.id} className="error-caught">{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function ErrorRecoveryApp({ isServer }) {
  return (
    <div id="app">
      <h1>Error Recovery Test</h1>

      {/* This boundary fails on server, recovers on client */}
      <Suspense fallback={<div id="recoverable-fallback">Loading recoverable...</div>}>
        <ServerOnlyError isServer={isServer} />
      </Suspense>

      {/* This boundary always fails, caught by error boundary */}
      <ErrorBoundary id="always-broken-error">
        <Suspense fallback={<div id="broken-fallback">Loading broken...</div>}>
          <AlwaysBroken />
        </Suspense>
      </ErrorBoundary>

      <footer id="footer">Footer is fine</footer>
    </div>
  );
}
```

### Server setup:
```js
const errors = [];
const { pipe } = renderToPipeableStream(
  <ErrorRecoveryApp isServer={true} />,
  {
    onError(error) {
      errors.push(error);
      return error.message; // digest
    },
    onShellReady() {
      pipe(writable);
    },
  }
);
```

### Client setup:
```js
hydrateRoot(
  document,
  <ErrorRecoveryApp isServer={false} />
);
```

## Load Sequence
1. Server renders the app. `ServerOnlyError` throws inside its Suspense boundary.
2. `AlwaysBroken` also throws inside its Suspense boundary.
3. Both boundaries are marked for client rendering in the HTML.
4. `onShellReady` fires (errors are boundary-level).
5. The shell is sent with fallback content for both errored boundaries.
6. Client receives the HTML and begins hydration.
7. For the "recoverable" boundary: React detects the client-render marker and re-renders `ServerOnlyError` with `isServer={false}`. It succeeds, showing "Client rendered successfully!".
8. For the "always broken" boundary: React re-renders `AlwaysBroken` on the client, it throws again. The `ErrorBoundary` catches it.

## Actions
1. Server-render with `isServer={true}` and collect HTML output.
2. Verify both boundaries show fallback/error markers.
3. Hydrate with `isServer={false}`.
4. Wait for client rendering to complete.
5. Inspect the DOM for recovery results.

## Assertions
1. The server HTML contains fallback content for the "recoverable" boundary.
2. The server HTML contains the error digest for both errored boundaries.
3. The server HTML contains `#footer` (shell content rendered normally).
4. `onError` was called twice on the server (once for each boundary error).
5. After hydration, `#recovered` appears with text "Client rendered successfully!" (recovery succeeded).
6. The recoverable fallback is no longer visible after client rendering.
7. For `AlwaysBroken`, the `ErrorBoundary` catches the error on the client.
8. `#always-broken-error` contains "Always broken" (error boundary rendered).
9. The footer remains intact throughout the recovery process.
10. No unhandled errors are thrown during hydration (errors are caught by boundaries).
11. Console warnings indicate that client rendering was triggered for the errored boundaries.
