# Server Action with bind()

## Category
flight

## Description
Validates that server actions can be partially applied using `.bind()` to create closure-like behavior with bound arguments. When a server function is called with `.bind(null, boundArg)`, the bound arguments are serialized into the Flight stream alongside the server reference. On form submission, the bound arguments are prepended to the function's argument list. This enables patterns like passing server-side context (IDs, configuration) to an action without exposing it in the client.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` ("can submit a complex closure server action without hydrating it", "can submit a multiple complex closure server action without hydrating it", "can bind an imported server action on the client without hydrating it")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("should be able to load a server reference on a consuming server if a mapping exists" -- tests `bind`)

## App Setup
```jsx
// Server Action that accepts bound + form arguments
const serverAction = serverExports(function action(bound, formData) {
  return formData.get('foo') + bound.complex;
});

// Server Component: form action uses .bind() to attach server-side data
function App() {
  return (
    <form action={serverAction.bind(null, { complex: 'object' })}>
      <input type="text" name="foo" defaultValue="bar" />
    </form>
  );
}

// Multiple bound actions in the same form
function AppMultiple() {
  return (
    <form action={serverAction.bind(null, { complex: 'a' })}>
      <input type="text" name="foo" defaultValue="bar" />
      <button formAction={serverAction.bind(null, { complex: 'b' })} />
      <button formAction={serverAction.bind(null, { complex: 'c' })} />
      <input type="submit" formAction={serverAction.bind(null, { complex: 'd' })} />
    </form>
  );
}
```

## Load Sequence
1. Server renders `<App />`. The `serverAction.bind(null, { complex: 'object' })` creates a bound server reference.
2. The Flight serializer encodes both the server reference ID and the bound arguments (`{ complex: 'object' }`) into the form's action.
3. SSR renders hidden inputs containing both the server reference ID and the serialized bound arguments.
4. On form submission, the browser sends the FormData plus the hidden bound argument data.
5. `decodeAction(formData, serverMap)` reconstructs the bound function with its arguments.
6. The function is called as `action({ complex: 'object' }, formData)` -- bound args prepended.

## Actions
1. Render `<App />` through Flight + SSR.
2. Submit the form.
3. Verify the function received both bound and form arguments.
4. For `AppMultiple`: submit via different buttons to verify each button's `formAction` uses its own bound arguments.

## Assertions
1. Submitting the form should call `action` with `bound = { complex: 'object' }` and `formData` containing `foo: 'bar'`.
2. The return value should be `'barobject'` (formData.get('foo') + bound.complex).
3. For multiple buttons: submitting the third button should use `{ complex: 'c' }`, returning `'helloc'`.
4. Each button's `formAction` should have independently bound arguments.
5. Bound arguments should support complex objects (not just primitives).
6. The bound arguments should NOT be visible in the client-side DOM (they are in hidden inputs, not exposed).
7. Binding should work both on server-passed actions and on `createServerReference`-imported actions.
