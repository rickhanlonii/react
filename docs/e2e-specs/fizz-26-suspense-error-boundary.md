# Error in Suspense Boundary Triggers Client Render Fallback

## Category
fizz

## Description
Validates that when a component inside a Suspense boundary throws an error during server rendering, the boundary emits a client-render instruction instead of the component's content. The error is reported through the `onError` callback with a digest hash, and the Suspense fallback is shown. On the client, this boundary will be retried with client-side rendering, giving the app a chance to recover. This is distinct from shell-level errors which abort the entire render.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (error in Suspense boundary)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (error escaping, client render fallback)

## App Setup
```jsx
function ThrowingComponent() {
  throw new Error('Component render failed');
}

function AsyncThrowingComponent() {
  // Suspends first, then throws when resolved
  const data = React.use(Promise.reject(new Error('Async load failed')));
  return <div>{data}</div>;
}

function WorkingComponent() {
  return <div id="working">This works fine</div>;
}

class ClientErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.message };
  }
  render() {
    if (this.state.hasError) {
      return <div id="client-error-boundary">{this.state.errorMessage}</div>;
    }
    return this.props.children;
  }
}

function ErrorBoundaryApp() {
  return (
    <div id="app">
      <h1>Error Handling Test</h1>

      {/* Error inside Suspense boundary -- triggers client render */}
      <Suspense fallback={<div id="error-fallback">Loading (error section)...</div>}>
        <ThrowingComponent />
      </Suspense>

      {/* Working Suspense boundary -- should render fine */}
      <Suspense fallback={<div>Loading working...</div>}>
        <WorkingComponent />
      </Suspense>

      <footer>Footer</footer>
    </div>
  );
}
```

### Server setup:
```js
const errors = [];
const { pipe } = renderToPipeableStream(<ErrorBoundaryApp />, {
  onError(error, errorInfo) {
    errors.push({
      message: error.message,
      digest: error.digest,
      componentStack: errorInfo?.componentStack,
    });
    return 'error-hash-' + errors.length; // Return a digest
  },
  onShellReady() {
    pipe(writable);
  },
});
```

## Load Sequence
1. Server starts rendering the component tree.
2. `ThrowingComponent` throws an error.
3. The error is caught by the Suspense boundary (not the shell, since it's inside a Suspense).
4. The `onError` callback is called with the error and component stack.
5. The Suspense boundary emits a client-render instruction with the error digest.
6. The fallback content is shown for this boundary.
7. The working Suspense boundary renders its content normally.
8. The shell is flushed.
9. On the client, the errored boundary triggers client-side rendering.

## Actions
1. Server-render `<ErrorBoundaryApp />` with an `onError` callback.
2. Collect the HTML output and the errors array.
3. Verify the shell HTML.
4. Hydrate on the client with error boundary wrapping.

## Assertions
1. The `onError` callback is called once with the message "Component render failed".
2. The error object includes a `componentStack` containing "ThrowingComponent".
3. The digest returned by `onError` is included in the HTML output.
4. The shell HTML contains `<div id="error-fallback">Loading (error section)...</div>` for the errored boundary.
5. The errored boundary is marked with a client-render instruction (the Fizz runtime knows to trigger client rendering for this boundary).
6. The working Suspense boundary renders `<div id="working">This works fine</div>` normally (not affected by the sibling error).
7. The `<h1>` and `<footer>` render normally (shell content is not affected).
8. The `onShellReady` callback still fires (the error was inside a boundary, not at the shell level).
9. When hydrating on the client, the errored boundary attempts client rendering.
10. If a `ClientErrorBoundary` wraps the component on the client, it can catch the error and display a recovery UI.
