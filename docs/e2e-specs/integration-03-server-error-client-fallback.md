# Server Error with Client-Side Fallback Recovery

## Category
integration

## Description
Validates the error recovery path when a server-rendered Suspense boundary throws an error during Fizz rendering. The server-side error boundary catches the error and renders a fallback on the server. When the client hydrates, it can either accept the server-rendered error fallback or attempt client-side recovery rendering. This tests the `onRecoverableError` callback, error digest propagation, and the interaction between server error boundaries and client hydration.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` - Error handling in Fizz: shell errors, boundary errors, `onError`, `onShellError`, error recovery
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` - Hydration error recovery
- `fixtures/ssr2/server/render.js` - `onShellError` and `onError` callback wiring
- `fixtures/ssr2/src/App.js` - ErrorBoundary usage with Suspense

## App Setup
```jsx
// Server: server.js
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

function handleRequest(req, res) {
  const errors = [];
  let didError = false;

  const { pipe, abort } = renderToPipeableStream(<App />, {
    bootstrapScripts: ['/client.js'],
    onShellReady() {
      res.statusCode = didError ? 500 : 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },
    onShellError(error) {
      res.statusCode = 500;
      res.send('<!doctype html><p>Critical Server Error</p>');
    },
    onError(error) {
      didError = true;
      errors.push(error);
      // Return a sanitized error digest for the client
      return error.message;
    },
  });
  setTimeout(() => abort(), 10000);
}

// Client: client.js
import { hydrateRoot } from 'react-dom/client';
import App from './App';

hydrateRoot(document, <App />, {
  onRecoverableError(error, errorInfo) {
    console.warn('Recoverable hydration error:', error.message, errorInfo.digest);
  },
});

// Shared: App.js
import { Suspense, Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div id="error-fallback" className="error-boundary">
          <h2>Something went wrong</h2>
          <p id="error-message">{this.state.error.message || 'Unknown error'}</p>
          {this.props.retryable && (
            <button id="retry-btn" onClick={() => this.setState({ hasError: false, error: null })}>
              Retry
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// This component always throws on the server but works on the client
function BrowserOnlyWidget() {
  if (typeof window === 'undefined') {
    throw new Error('Widget requires browser APIs');
  }
  return <div id="widget">Browser Widget Active</div>;
}

function StableContent() {
  return (
    <div id="stable-content">
      <h2>Stable Section</h2>
      <p>This content renders successfully on both server and client.</p>
    </div>
  );
}

function FailingDataSection() {
  // Simulates a server-side data fetch that fails
  if (typeof window === 'undefined') {
    throw new Error('Data fetch failed');
  }
  return (
    <div id="data-section">
      <p>Client-recovered data content</p>
    </div>
  );
}

export default function App() {
  return (
    <html>
      <head><title>Error Recovery Test</title></head>
      <body>
        <h1>Error Recovery App</h1>
        <StableContent />
        <ErrorBoundary retryable={false}>
          <Suspense fallback={<p>Loading widget...</p>}>
            <BrowserOnlyWidget />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary retryable={true}>
          <Suspense fallback={<p>Loading data...</p>}>
            <FailingDataSection />
          </Suspense>
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request to the server.
2. Server calls `renderToPipeableStream(<App />)`.
3. Fizz renders the shell: `<h1>Error Recovery App</h1>` and `<StableContent />` render successfully.
4. Fizz encounters `<BrowserOnlyWidget />` inside a Suspense boundary wrapped in an ErrorBoundary. The component throws "Widget requires browser APIs". The ErrorBoundary catches the error and renders the fallback `<div id="error-fallback">` on the server.
5. Fizz encounters `<FailingDataSection />` in its Suspense boundary. The component throws "Data fetch failed". The ErrorBoundary catches it and renders an error fallback with a "Retry" button on the server.
6. The `onError` callback is called for each error, recording the error digest.
7. `onShellReady` fires (the shell rendered successfully, errors were caught by boundaries).
8. The server streams the complete HTML to the client, including error boundary fallbacks.
9. The browser receives and displays the HTML: stable content plus two error fallback sections.
10. The client JavaScript loads and `hydrateRoot` is called with `onRecoverableError`.
11. React hydrates the page. During hydration, the `BrowserOnlyWidget` no longer throws (since `window` is defined), but React does not automatically retry the error boundary -- it hydrates the server-rendered error fallback as-is.
12. The `FailingDataSection` also no longer throws on the client. The error boundary rendered on the server is hydrated.

## Actions
1. Navigate to the page URL and wait for server-rendered HTML.
2. Verify the stable content section renders correctly.
3. Verify the first error boundary shows the error fallback for the browser-only widget.
4. Verify the second error boundary shows the error fallback for the data section, including the "Retry" button.
5. Wait for hydration to complete.
6. Click the "Retry" button on the second error boundary.
7. Verify the `FailingDataSection` now renders successfully on the client (since it only throws on the server).

## Assertions
1. Server response status code is 200 (errors were caught by boundaries, not the shell).
2. After server render: `<div id="stable-content">` is present with correct heading and paragraph.
3. After server render: `<div id="error-fallback">` is present for the BrowserOnlyWidget boundary, containing "Something went wrong" and "Widget requires browser APIs".
4. After server render: a second error fallback is present for the data section, containing "Data fetch failed" and a "Retry" button.
5. The server's `onError` callback was invoked twice (once for each throwing component).
6. After hydration: no hydration mismatch errors (React hydrates the error fallback that was server-rendered).
7. The `onRecoverableError` callback on the client is called with the error digest from the server.
8. After clicking "Retry": the second ErrorBoundary clears its error state and re-renders its children.
9. After retry: `<div id="data-section">` appears with "Client-recovered data content" since the component succeeds on the client.
10. The first error boundary (non-retryable) continues to display its fallback since there is no retry mechanism.
