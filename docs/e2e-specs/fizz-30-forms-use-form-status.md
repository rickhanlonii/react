# useFormStatus During Server Render

## Category
fizz

## Description
Validates the behavior of `useFormStatus` (from `react-dom`) during Fizz server-side rendering. On the server, no form is actively being submitted, so `useFormStatus` should return the idle/default state: `{ pending: false, data: null, method: null, action: null }`. Components that conditionally render based on form status should show their non-pending state in the server HTML.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` (useFormStatus SSR tests)

## App Setup
```jsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button
      id="submit-btn"
      type="submit"
      disabled={status.pending}
      data-pending={String(status.pending)}
    >
      {status.pending ? 'Submitting...' : 'Submit'}
    </button>
  );
}

function FormStatusDisplay() {
  const { pending, data, method, action } = useFormStatus();
  return (
    <div id="status-display">
      <span id="status-pending">{String(pending)}</span>
      <span id="status-data">{String(data)}</span>
      <span id="status-method">{String(method)}</span>
      <span id="status-action">{String(action)}</span>
    </div>
  );
}

function FormStatusApp() {
  async function handleSubmit(formData) {
    'use server';
    // Server action
  }

  return (
    <div id="app">
      <form id="status-form" action={handleSubmit}>
        <input type="text" name="query" defaultValue="test" />
        <SubmitButton />
        <FormStatusDisplay />
      </form>

      {/* useFormStatus outside a form */}
      <div id="outside-form">
        <FormStatusDisplay />
      </div>
    </div>
  );
}
```

Server renders via `renderToReadableStream(<FormStatusApp />)`.

## Load Sequence
1. Server renders the form and its children.
2. `useFormStatus` is called during server rendering.
3. Since no form submission is in progress on the server, it returns the default idle state.
4. Components render their non-pending state.
5. HTML is flushed with idle form status.
6. Client hydrates.
7. After hydration, `useFormStatus` is connected to the form and will reflect submission state when a form is submitted.

## Actions
1. Server-render `<FormStatusApp />` and collect HTML output.
2. Parse the HTML and inspect the rendered form status values.
3. Hydrate with `hydrateRoot`.
4. After hydration, submit the form and verify that `useFormStatus` updates.

## Assertions
1. `#submit-btn` has text content `Submit` (not "Submitting...") in the server HTML.
2. `#submit-btn` does NOT have the `disabled` attribute (pending is false).
3. `#submit-btn` has `data-pending="false"`.
4. `#status-pending` contains `false`.
5. `#status-data` contains `null`.
6. `#status-method` contains `null`.
7. `#status-action` contains `null`.
8. The `useFormStatus` outside the form (in `#outside-form`) also returns the default idle state.
9. Hydration completes without warnings.
10. After hydration and form submission, `useFormStatus` returns `{ pending: true, data: FormData, method: 'POST', action: ... }`.
