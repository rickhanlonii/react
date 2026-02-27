# MPA Form Submission State Preservation

## Category
flight

## Description
Validates that `useActionState` correctly preserves and matches state during Multi-Page Application (MPA) form submissions, where the page is fully re-rendered after each form submit (no client-side navigation). After a form submission, the server re-renders the page and uses `decodeFormState` to match the action result to the correct `useActionState` instance using permalink-based state matching. Only the form that was submitted should have its state updated; other forms using the same action should retain their initial state.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` ("useActionState can reuse state during MPA form submission", "useActionState preserves state if arity is the same, but different arguments are bound")

## App Setup
```jsx
// Server Action
const serverAction = serverExports(
  async function action(prevState, formData) {
    return prevState + 1;
  }
);

// Client Component with multiple forms
function Form({ action }) {
  // "use client"
  const [count, dispatch, isPending] = useActionState(action, 1);
  return (
    <form action={dispatch}>
      {isPending ? 'Pending...' : ''}
      {count}
    </form>
  );
}

function Client({ action }) {
  // "use client"
  return (
    <div>
      <Form action={action} />
      <Form action={action} />
      <Form action={action} />
    </div>
  );
}

function App() {
  return <Client action={serverAction} />;
}
```

Three identical forms each use `useActionState` with the same action and initial state of `1`.

## Load Sequence
1. Server renders `<App />` via Flight + SSR. All three forms show "1".
2. User submits the SECOND form (without JavaScript -- full page reload).
3. Server receives the FormData via POST. Calls `decodeAction` to resolve the action.
4. Executes the action: `action(1, formData)` returns `2`.
5. Calls `decodeFormState(2, formData, webpackServerMap)` to create `formState`.
6. Server re-renders `<App />` via Flight + SSR, passing `formState` to `renderToReadableStream`.
7. During SSR, React matches the `formState` to the correct `useActionState` instance (the second form).
8. The second form renders with state `2`, while the first and third forms retain state `1`.
9. The page displays "1 2 1".

## Actions
1. Render the initial page (three forms, all showing "1").
2. Submit the second form.
3. Re-render the page on the server with the `formState` from the submission.
4. Verify the state matching: only the second form should be updated.
5. Optionally, hydrate the result and verify the state persists.

## Assertions
1. Initial render should show "1 1 1" (all three forms with initial state).
2. After submitting the second form and re-rendering, the page should show "1 2 1".
3. The `formState` returned by `decodeFormState` should correctly identify which form was submitted.
4. The first and third forms should retain their initial state of `1`.
5. The second form should show the updated state of `2`.
6. After hydration (if JavaScript is available), the state should be preserved (still "1 2 1").
7. Submitting a different form in a subsequent request should update only that form's state.
8. The state matching should work even when the same action is used by multiple forms (based on form identity/permalink, not action identity).
