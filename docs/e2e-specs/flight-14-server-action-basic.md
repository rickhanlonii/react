# Basic Server Action

## Category
flight

## Description
Validates that functions marked with "use server" can be serialized as server references in the Flight stream, passed to client components, and called from the client to execute on the server. This is the fundamental server action flow: a server function is referenced in the Flight payload, the client calls it, the arguments are encoded as a reply and sent back to the server, and the server executes the function and returns the result.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` ("can submit a passed server action without hydrating it")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("should be able to load a server reference on a consuming server if a mapping exists")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js`

## App Setup
```jsx
// Server Action (marked with "use server")
let receivedValue = null;

const serverAction = serverExports(function action(formData) {
  receivedValue = formData.get('foo');
  return 'hello';
});

// Server Component that renders a form with the server action
function App() {
  return (
    <form action={serverAction}>
      <input type="text" name="foo" defaultValue="bar" />
    </form>
  );
}
```

The server action is registered via `serverExports()` which assigns `$$typeof: Symbol.for('react.server.reference')` and a `$$id` that maps to the actual function via `webpackServerMap`.

## Load Sequence
1. Server renders `<App />` with `renderToReadableStream`.
2. The `serverAction` function is serialized as a server reference (module ID + export name) in the Flight stream.
3. The `<form>` element's `action` attribute is set to a special URL encoding the server reference ID and any bound arguments.
4. Client receives the Flight stream, creates the form. The form's action is a server reference.
5. SSR via Fizz renders the form with a hidden `<input>` containing the server reference ID.
6. When the form is submitted (without JavaScript/hydration), the browser sends a POST with FormData.
7. Server receives the FormData, calls `decodeAction(formData, serverMap)` to resolve the server function.
8. The bound action is executed, receiving the form data as its argument.
9. The return value (`'hello'`) is available as the action result.

## Actions
1. Register the server function as a server export.
2. Render `<App />` on the server via Flight + SSR (Fizz).
3. Submit the form (simulate a POST with FormData).
4. Call `decodeAction(formData, webpackServerMap)` to get the bound function.
5. Execute the bound function.

## Assertions
1. Before submission, `receivedValue` should be `null`.
2. After submission, `receivedValue` should be `'bar'` (the form input value).
3. The return value of the action should be `'hello'`.
4. The server action should work WITHOUT client-side hydration (MPA-compatible).
5. The form should contain a hidden input with the server reference ID for the action.
6. The server reference ID should correctly resolve to the original function via the server map.
