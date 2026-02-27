# Form Action Serialization in SSR Output

## Category
fizz

## Description
Validates that form actions (function references passed to `<form action>`, `<input formAction>`, and `<button formAction>`) are correctly serialized during Fizz server-side rendering. When a function is passed as a form action, React serializes it using a special protocol: the form's `action` attribute is set to a special URL (or omitted), and hidden input fields may be inserted to carry the action identifier. This enables progressive enhancement where forms can work before JavaScript loads.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` (form action SSR tests, ~line 93)
- `packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js` (form action serialization)

## App Setup
```jsx
async function handleSubmit(formData) {
  'use server';
  const name = formData.get('name');
  // Server action logic
}

async function handleSave(formData) {
  'use server';
  const title = formData.get('title');
}

async function handleDelete(formData) {
  'use server';
  const id = formData.get('id');
}

function FormActionApp() {
  return (
    <div id="app">
      {/* Basic form with function action */}
      <form id="basic-form" action={handleSubmit}>
        <input type="text" name="name" defaultValue="Alice" />
        <button type="submit">Submit</button>
      </form>

      {/* Form with button formAction */}
      <form id="multi-action-form" action={handleSubmit}>
        <input type="text" name="title" defaultValue="My Post" />
        <input type="hidden" name="id" value="123" />
        <button type="submit" formAction={handleSave}>Save</button>
        <button type="submit" formAction={handleDelete}>Delete</button>
      </form>

      {/* Form with input type="submit" formAction */}
      <form id="input-action-form" action={handleSubmit}>
        <input type="text" name="query" defaultValue="search" />
        <input type="submit" formAction={handleSave} value="Save Search" />
      </form>
    </div>
  );
}
```

Server renders via `renderToReadableStream(<FormActionApp />)`.

## Load Sequence
1. Server renders the forms.
2. Function actions are serialized: the `action` attribute is set to a URL that the server can handle (e.g., the current page URL or a special action endpoint).
3. Hidden input fields may be injected to identify which action to invoke.
4. The `method` is set to `POST` and `encType` may be set for `multipart/form-data`.
5. HTML is flushed.
6. Before hydration, forms are functional via native HTML form submission (progressive enhancement).
7. After hydration, React intercepts form submissions and calls the action functions directly.

## Actions
1. Server-render `<FormActionApp />` and collect HTML output.
2. Parse the HTML and inspect form attributes.
3. Inspect hidden input fields.
4. Before hydrating, submit the form natively and verify it posts correctly.
5. Hydrate with `hydrateRoot`.
6. After hydration, submit the form and verify the action function is called.

## Assertions
1. `#basic-form` has an `action` attribute (not a JavaScript function reference in HTML).
2. `#basic-form` has `method="POST"` (server actions use POST).
3. The form contains the `<input name="name" value="Alice">` field.
4. `#multi-action-form` has separate action identifiers for the Save and Delete buttons.
5. Each button with a `formAction` has a `formaction` attribute in the HTML output.
6. Hidden input fields are present to identify the action (e.g., `<input type="hidden" name="$ACTION_ID_..." />`).
7. `#input-action-form` has a submit input with a `formaction` attribute.
8. Before hydration, submitting the form causes a standard HTML form POST (progressive enhancement works).
9. After hydration, submitting the form calls the JavaScript action function without a page reload.
10. Form data (name, title, id, query) is correctly accessible in the action function via `formData.get()`.
