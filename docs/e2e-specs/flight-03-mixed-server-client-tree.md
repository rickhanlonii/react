# Mixed Server + Client Component Trees

## Category
flight

## Description
Validates that a component tree containing both server components and client components renders correctly. Server components are fully resolved on the server, while client components appear as module references in the Flight stream. Props flow seamlessly from server components to client components, including complex objects, React elements, and children. This tests the interleaving of server and client rendering boundaries.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` ("should resolve client components (with async chunks) when referenced in props", "should resolve deduped objects within the same model root when it is blocked")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` ("should be able to render a module split named component export")

## App Setup
```jsx
// Client Components
function ClientOuter({ Component, children }) {
  // "use client"
  return <Component>{children}</Component>;
}

function ClientInner({ children }) {
  // "use client"
  return <span>{children}</span>;
}

// Server Components
function ServerHeader() {
  return <h1>Server Rendered Header</h1>;
}

function App() {
  return (
    <div>
      <ServerHeader />
      <ClientOuter Component={ClientInner}>
        Hello, World!
      </ClientOuter>
    </div>
  );
}
```

This creates a tree where:
- `App` (server) renders a `<div>` containing both server and client subtrees.
- `ServerHeader` (server) renders directly to `<h1>`.
- `ClientOuter` (client) receives `ClientInner` as a prop (component reference passing).
- `ClientInner` (client) receives "Hello, World!" as children.

## Load Sequence
1. Server renders `<App />` -- `ServerHeader` is resolved immediately to `<h1>Server Rendered Header</h1>`.
2. `ClientOuter` is serialized as a client reference with props `{ Component: ClientInner, children: "Hello, World!" }`.
3. `ClientInner` is also a client reference, serialized as a module reference within the props of `ClientOuter`.
4. The Flight stream contains: the resolved `<div>` and `<h1>` elements, plus module references for `ClientOuter` and `ClientInner`.
5. Client receives the stream, loads both client component chunks.
6. `ClientOuter` renders, calling `ClientInner` as `Component`, passing "Hello, World!" as children.
7. Final DOM: `<div><h1>Server Rendered Header</h1><span>Hello, World!</span></div>`.

## Actions
1. Register both `ClientOuter` and `ClientInner` as client exports.
2. Render `<App />` on the server with the webpack map.
3. Create the Flight response on the client.
4. Mount the response in a React root with a Suspense boundary.
5. Resolve client component chunk promises (if async).

## Assertions
1. Server-rendered content (`<h1>Server Rendered Header</h1>`) should appear in the final DOM.
2. Client-rendered content (`<span>Hello, World!</span>`) should appear after client chunks load.
3. The full DOM should be `<div><h1>Server Rendered Header</h1><span>Hello, World!</span></div>`.
4. Passing a client component as a prop to another client component (component-as-prop pattern) should work correctly.
5. Children should pass through the server-client boundary without corruption.
6. Server components should NOT appear in the client-side component tree -- they should be fully resolved.
