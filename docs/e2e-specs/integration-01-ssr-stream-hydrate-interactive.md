# SSR Stream to Hydration to Interactive

## Category
integration

## Description
Validates the complete server-side rendering lifecycle: the server renders a React component tree using `renderToPipeableStream`, streams HTML chunks to the client over HTTP, the client receives the streamed HTML and displays it progressively, and finally `hydrateRoot` attaches event handlers and state to make the page fully interactive. This is the foundational integration test for any Fiber + Fizz renderer -- if this flow does not work, nothing else will.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` - Core Fizz server tests including streaming and hydration
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` - Shell hydration specific tests
- `fixtures/fizz/server/render-to-stream.js` - Fizz fixture server rendering with `renderToPipeableStream`
- `fixtures/fizz/src/index.js` - Client-side hydration entry point using `hydrateRoot`
- `fixtures/ssr2/server/render.js` - SSR2 fixture with streaming, Suspense boundaries, and abort timeout
- `fixtures/ssr2/src/index.js` - SSR2 client hydration entry

## App Setup
```jsx
// Server: server.js
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

function handleRequest(req, res) {
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
      res.send('<!doctype html><p>Server Error</p>');
    },
    onError(error) {
      didError = true;
      console.error(error);
    },
  });
  setTimeout(() => abort(), 10000);
}

// Client: client.js
import { hydrateRoot } from 'react-dom/client';
import App from './App';

hydrateRoot(document, <App />);

// Shared: App.js
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p id="count">Count: {count}</p>
      <button id="increment" onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}

function Header() {
  return <h1>My App</h1>;
}

export default function App() {
  return (
    <html>
      <head><title>SSR Test</title></head>
      <body>
        <Header />
        <Counter />
      </body>
    </html>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request to the server.
2. Server calls `renderToPipeableStream(<App />)` with `bootstrapScripts: ['/client.js']`.
3. The `onShellReady` callback fires, setting status 200 and piping the HTML stream to the response.
4. The server streams the initial HTML shell containing `<h1>My App</h1>`, `<p id="count">Count: 0</p>`, and the `<button>` element.
5. The server also injects a `<script src="/client.js" async="">` tag via the bootstrapScripts option.
6. The stream completes and the connection closes.
7. The browser parses the streamed HTML and renders the static content immediately.
8. The browser downloads and executes `/client.js`.
9. The client code calls `hydrateRoot(document, <App />)`.
10. React walks the existing DOM, attaches event listeners to the button, and initializes the `useState(0)` hook with the matching server-rendered state.
11. The page is now fully interactive.

## Actions
1. Navigate to the page URL and wait for the initial HTML to load.
2. Verify the static HTML is visible before JavaScript has executed (check that `<h1>My App</h1>` and `<p>Count: 0</p>` are in the DOM).
3. Wait for the client bundle to download and hydration to complete (no console errors about hydration mismatches).
4. Click the "Increment" button once.
5. Click the "Increment" button two more times.
6. Verify the counter state updates correctly after each click.

## Assertions
1. Before hydration: the document contains server-rendered HTML including `<h1>My App</h1>` and `<p id="count">Count: 0</p>`.
2. Before hydration: the `<script src="/client.js" async="">` tag is present in the document.
3. After hydration: no hydration mismatch warnings or errors appear in the console.
4. After hydration: the DOM structure is identical to the server-rendered HTML (React reused the existing DOM nodes, did not re-create them).
5. After clicking "Increment" once: the `<p id="count">` element displays "Count: 1".
6. After clicking "Increment" two more times: the `<p id="count">` element displays "Count: 3".
7. Event handlers are functional: clicks on the button cause state transitions and re-renders.
8. The response Content-Type header is `text/html`.
9. The HTTP status code is 200.
