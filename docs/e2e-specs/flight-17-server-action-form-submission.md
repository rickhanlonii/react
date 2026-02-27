# Server Action Form Submission

## Category
flight

## Description
Validates that server actions integrated with HTML forms work correctly for both JavaScript-enhanced and no-JavaScript (MPA) form submissions. When a form's `action` is a server function, React serializes the server reference into the form. On submission, the FormData is sent to the server, the action executes, and the result is returned. This must work WITHOUT client-side hydration, enabling progressive enhancement.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` ("can submit a passed server action without hydrating it", "can submit an imported server action without hydrating it", "can bind a server action on the client without hydrating it")

## App Setup
```jsx
// Server Action
let submittedData = null;

const serverAction = serverExports(function action(formData) {
  submittedData = {
    name: formData.get('name'),
    email: formData.get('email'),
  };
  return 'submitted';
});

// Server Component
function App() {
  return (
    <form action={serverAction}>
      <input type="text" name="name" defaultValue="Alice" />
      <input type="email" name="email" defaultValue="alice@example.com" />
      <button type="submit">Submit</button>
    </form>
  );
}
```

The form is rendered through RSC (Flight) then SSR (Fizz). The server action reference is embedded in the HTML as hidden inputs.

## Load Sequence
1. Server renders `<App />` via `renderToReadableStream` (Flight).
2. The Flight stream contains the form with `serverAction` as a server reference in the `action` prop.
3. The Flight response is consumed for SSR via `renderToReadableStream` (Fizz).
4. Fizz renders the `<form>` with:
   - A hidden `<input>` containing the serialized server action reference ID.
   - Standard form inputs for name and email.
5. The HTML is sent to the browser. No JavaScript is required.
6. User clicks "Submit". The browser sends a POST request with `multipart/form-data`.
7. Server receives the FormData, which includes both the user inputs and the hidden action reference.
8. `decodeAction(formData, webpackServerMap)` extracts the action reference and resolves it to the original function.
9. The function is called with the remaining FormData.
10. Optionally, `decodeFormState(returnValue, formData, webpackServerMap)` creates form state for the response.

## Actions
1. Render `<App />` through Flight + SSR pipeline.
2. Inspect the rendered HTML for hidden inputs containing the server reference.
3. Simulate form submission by creating FormData and dispatching a submit event.
4. Call `decodeAction` on the server to resolve the action.
5. Execute the resolved action.
6. Verify the submission result.

## Assertions
1. Before submission, `submittedData` should be `null`.
2. The rendered HTML should contain a `<form>` with `method="POST"` and `enctype="multipart/form-data"` (or equivalent).
3. The form should contain hidden inputs with the server action reference data.
4. After submission, `submittedData` should be `{ name: 'Alice', email: 'alice@example.com' }`.
5. The action return value should be `'submitted'`.
6. The form should work WITHOUT any client-side JavaScript or hydration.
7. `decodeAction` should correctly separate the action reference data from the user-submitted FormData.
8. Multiple forms on the same page with different actions should each resolve to the correct action.
