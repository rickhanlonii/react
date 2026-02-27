# Client Component References ("use client")

## Category
flight

## Description
Validates that components marked with "use client" are serialized as client references in the Flight payload rather than being rendered on the server. The Flight stream contains a module reference (ID, chunk URL, export name) that the client uses to load and render the actual component. This tests the core boundary between server and client rendering in React Server Components.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` ("should resolve client components (with async chunks) when referenced in props")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` ("should be able to render a named component export", "should be able to esm compat test module references")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("should allow an alternative module mapping to be used for SSR")

## App Setup
```jsx
// Client Component (marked with "use client")
// This module is registered via clientExports() which assigns $$typeof and $$id
function ClientGreeting({ name }) {
  return <span>Hello, {name}!</span>;
}

// Server Component
function App() {
  // ClientGreeting is a client reference, not executed on the server
  return <ClientGreeting name="World" />;
}
```

The bundler (webpack/turbopack) creates a manifest (`webpackMap`) mapping client component IDs to their chunk URLs and export names. On the server, `clientExports(ClientGreeting)` creates a reference object with `$$typeof: Symbol.for('react.client.reference')` and `$$id` pointing to the module.

## Load Sequence
1. Server calls `renderToReadableStream(<App />, webpackMap)` -- note the manifest is required for client references.
2. The Flight server renders `App`, encounters `<ClientGreeting>` which has `$$typeof === Symbol.for('react.client.reference')`.
3. Instead of calling `ClientGreeting`, the server serializes a module reference row containing the module ID, chunk URLs, and export name.
4. The props `{ name: "World" }` are serialized alongside the module reference.
5. Client calls `createFromReadableStream(stream)` and resolves the response.
6. The Flight client encounters the module reference, loads the client module chunk.
7. Once the chunk is loaded, the client component renders with the deserialized props.

## Actions
1. Register `ClientGreeting` as a client export using the bundler mock.
2. Render `<App />` on the server with the webpack map.
3. Create the Flight response on the client from the stream.
4. Mount the response into a React root using `use(response)` inside a Suspense boundary.
5. If the client chunk is async, resolve the chunk promise to simulate module loading.

## Assertions
1. Before the client chunk loads, the component should be suspended (Suspense fallback visible or empty).
2. After the client chunk loads, the DOM should contain `<span>Hello, World!</span>`.
3. The Flight payload should contain a module reference row (not the rendered output of `ClientGreeting`).
4. The props (`name: "World"`) should be correctly passed through the Flight boundary.
5. Named exports (e.g., `Module.Component`) should resolve correctly through the module map.
6. ESM-compatible modules with `__esModule: true` should interop correctly.
