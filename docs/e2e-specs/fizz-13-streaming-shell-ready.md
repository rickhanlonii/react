# onShellReady Callback: Shell Content vs Deferred Content

## Category
fizz

## Description
Validates the `onShellReady` callback in `renderToPipeableStream`, which fires when the initial shell of the document is ready to be flushed. The "shell" is all content outside of any `<Suspense>` boundaries that are still loading. This callback is the primary signal for when to start piping the response, allowing the server to set HTTP status codes and headers before sending the body. Content inside pending Suspense boundaries is deferred and streamed later.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (onShellReady tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (shell vs deferred content)

## App Setup
```jsx
let resolveA, resolveB;
const promiseA = new Promise(r => { resolveA = r; });
const promiseB = new Promise(r => { resolveB = r; });

function AsyncA() {
  const data = React.use(promiseA);
  return <div id="async-a">{data}</div>;
}

function AsyncB() {
  const data = React.use(promiseB);
  return <div id="async-b">{data}</div>;
}

function ShellReadyApp() {
  return (
    <div id="app">
      <header id="header">
        <h1>My App</h1>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
      </header>

      <main>
        {/* This Suspense boundary's content is deferred */}
        <Suspense fallback={<div id="fallback-a">Loading section A...</div>}>
          <AsyncA />
        </Suspense>

        {/* Static content between Suspense boundaries is part of the shell */}
        <aside id="sidebar">
          <p>This is always in the shell</p>
        </aside>

        {/* Another deferred boundary */}
        <Suspense fallback={<div id="fallback-b">Loading section B...</div>}>
          <AsyncB />
        </Suspense>
      </main>

      <footer id="footer">
        <p>Footer content</p>
      </footer>
    </div>
  );
}
```

Server setup:
```js
let shellReady = false;
let shellError = null;

const { pipe } = renderToPipeableStream(<ShellReadyApp />, {
  onShellReady() {
    shellReady = true;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    pipe(response);
  },
  onShellError(error) {
    shellError = error;
    response.statusCode = 500;
    response.end('Server Error');
  },
});
```

## Load Sequence
1. `renderToPipeableStream` starts rendering the component tree.
2. It renders the header, sidebar, and footer synchronously (these are part of the shell).
3. It encounters `<AsyncA>` and `<AsyncB>` which suspend.
4. The Suspense fallbacks are rendered as part of the shell.
5. `onShellReady` fires -- at this point the shell is complete with fallbacks in place.
6. The server pipes the shell to the response (status 200 can be set).
7. When `resolveA` is called later, the content for boundary A is streamed.
8. When `resolveB` is called later, the content for boundary B is streamed.
9. The stream completes when all boundaries are resolved.

## Actions
1. Start rendering with `renderToPipeableStream`.
2. Verify `onShellReady` fires before any async content resolves.
3. Pipe the response and capture the shell HTML.
4. Resolve async content A.
5. Capture the streamed update for boundary A.
6. Resolve async content B.
7. Capture the streamed update for boundary B.

## Assertions
1. `onShellReady` fires before `resolveA` or `resolveB` are called.
2. The shell HTML contains `#header` with navigation links.
3. The shell HTML contains `#sidebar` with "This is always in the shell".
4. The shell HTML contains `#footer` with "Footer content".
5. The shell HTML contains `#fallback-a` with "Loading section A..." inside a pending Suspense boundary marker (`<!--$?-->`).
6. The shell HTML contains `#fallback-b` with "Loading section B..." inside a pending Suspense boundary marker.
7. The shell HTML does NOT contain `#async-a` or `#async-b`.
8. After resolving A, a new chunk arrives that replaces the fallback with `<div id="async-a">...</div>`.
9. After resolving B, a new chunk arrives that replaces the fallback with `<div id="async-b">...</div>`.
10. Boundaries can resolve in any order (B before A is valid).
11. `onShellError` is NOT called when the shell renders successfully.
