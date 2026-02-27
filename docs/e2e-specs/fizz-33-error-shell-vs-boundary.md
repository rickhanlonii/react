# Shell-Level Errors vs Boundary-Level Errors

## Category
fizz

## Description
Validates the distinction between shell-level errors and boundary-level errors in Fizz rendering. A shell-level error occurs when something outside any Suspense boundary throws -- this triggers `onShellError`, the stream is not sent (or gets a 500 status), and the server falls back to client-side rendering entirely. A boundary-level error occurs inside a Suspense boundary -- this triggers `onError`, but `onShellReady` still fires, allowing the shell to be sent with the errored boundary marked for client rendering. This distinction is critical for deciding HTTP status codes and error recovery strategies.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (~line 3960, shell vs boundary errors)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (onShellError tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (promise rejection for shell errors)

## App Setup
### Scenario A: Shell-level error
```jsx
function BrokenLayout() {
  throw new Error('Layout component crashed');
}

function ShellErrorApp() {
  return (
    <div>
      <BrokenLayout />
      <Suspense fallback={<div>Loading...</div>}>
        <div>Content</div>
      </Suspense>
    </div>
  );
}
```

### Scenario B: Boundary-level error
```jsx
function BrokenWidget() {
  throw new Error('Widget component crashed');
}

function BoundaryErrorApp() {
  return (
    <div id="app">
      <h1>Page Title</h1>
      <Suspense fallback={<div id="widget-fallback">Loading widget...</div>}>
        <BrokenWidget />
      </Suspense>
      <Suspense fallback={<div>Loading sidebar...</div>}>
        <div id="sidebar">Sidebar content</div>
      </Suspense>
      <footer id="footer">Footer</footer>
    </div>
  );
}
```

### Scenario C: Error in fallback (shell-level)
```jsx
function BrokenFallback() {
  throw new Error('Fallback crashed');
}

function FallbackErrorApp() {
  return (
    <div>
      <Suspense fallback={<BrokenFallback />}>
        <SuspendingComponent />
      </Suspense>
    </div>
  );
}
```

## Load Sequence
### Shell-level error (Scenario A):
1. Server starts rendering.
2. `BrokenLayout` throws during render.
3. The error is NOT inside any Suspense boundary.
4. `onError` is called with the error.
5. `onShellError` is called -- the shell failed to render.
6. `onShellReady` is NOT called.
7. The server should respond with 500 and fall back to client-side rendering.

### Boundary-level error (Scenario B):
1. Server starts rendering.
2. `BrokenWidget` throws inside a Suspense boundary.
3. `onError` is called.
4. The boundary is marked for client-side rendering.
5. `onShellReady` fires -- the shell rendered successfully.
6. The server responds with 200 and streams the shell.
7. Other Suspense boundaries (sidebar) render normally.

### Fallback error (Scenario C):
1. `SuspendingComponent` suspends, so the fallback is rendered.
2. `BrokenFallback` throws during fallback render.
3. Since the fallback is part of the shell, this is a shell-level error.
4. `onShellError` is called.

## Actions
### Scenario A:
1. Render `<ShellErrorApp />` with `onShellReady`, `onShellError`, and `onError` callbacks.
2. Verify which callbacks are called.
3. Do not pipe the response (shell failed).

### Scenario B:
1. Render `<BoundaryErrorApp />` with callbacks.
2. Verify `onShellReady` fires (shell is okay).
3. Pipe and capture the HTML.
4. Verify the boundary-level error handling.

### Scenario C:
1. Render `<FallbackErrorApp />` with callbacks.
2. Verify `onShellError` fires.

## Assertions
### Shell-level error (Scenario A):
1. `onError` is called with the error "Layout component crashed".
2. `onShellError` is called with the same error.
3. `onShellReady` is NOT called.
4. No HTML should be sent to the client (the server should return 500 or fall back to CSR).

### Boundary-level error (Scenario B):
5. `onError` is called with "Widget component crashed".
6. `onShellError` is NOT called.
7. `onShellReady` IS called.
8. The shell HTML contains `<h1>Page Title</h1>`, the widget fallback, the sidebar content, and the footer.
9. The widget Suspense boundary is marked with a client-render instruction.
10. `#sidebar` renders normally with "Sidebar content".
11. `#footer` renders normally with "Footer".
12. The server can respond with 200 (the page is partially renderable).

### Fallback error (Scenario C):
13. `onShellError` is called because the fallback is part of the shell and it threw.
14. `onShellReady` is NOT called.

### For `renderToReadableStream`:
15. Shell errors cause the returned promise to reject (the stream cannot be created).
16. Boundary errors do NOT reject the promise; the stream is created with the boundary marked for client rendering.
