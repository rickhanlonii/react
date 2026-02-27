# useActionState with Server Action

## Category
flight

## Description
Validates the integration of `useActionState` (React's action state hook) with server actions. `useActionState` manages state that is updated by an action function -- when used with a server action, the previous state is sent to the server along with the form data, and the server returns the new state. The hook tracks pending status and preserves state across form submissions. This combines client-side state management with server-side execution.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` ("useActionState's dispatch binds the initial state to the provided action")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` ("useActionState can reuse state during MPA form submission")

## App Setup
```jsx
// Server Action that increments a counter
const serverAction = serverExports(
  async function action(prevState, formData) {
    return {
      count: prevState.count + parseInt(formData.get('incrementAmount'), 10),
    };
  }
);

// Client Component using useActionState
function Client({ action }) {
  // "use client"
  const [state, dispatch, isPending] = useActionState(action, { count: 1 });
  return (
    <form action={dispatch}>
      <span>{isPending ? 'Pending...' : ''}</span>
      <span>Count: {state.count}</span>
      <input type="text" name="incrementAmount" defaultValue="5" />
    </form>
  );
}

function App() {
  return <Client action={serverAction} />;
}
```

## Load Sequence
1. Server renders `<App />` via Flight. The `serverAction` is serialized as a server reference.
2. The Flight stream is consumed on the client to create the RSC response.
3. SSR via Fizz renders the `Client` component with initial state `{ count: 1 }`.
4. The form is rendered with `action={dispatch}` where dispatch is the `useActionState` dispatch function.
5. The initial render shows "Count: 1" with an empty pending span.
6. On form submission, `dispatch` is called, which:
   a. Sends the previous state (`{ count: 1 }`) and the form data to the server.
   b. Sets `isPending` to `true`.
7. The server action receives `prevState = { count: 1 }` and `formData` with `incrementAmount: '5'`.
8. It returns `{ count: 6 }`.
9. `useActionState` updates the state to `{ count: 6 }` and sets `isPending` back to `false`.

## Actions
1. Render `<App />` through Flight + SSR.
2. Verify initial state renders "Count: 1".
3. Submit the form.
4. Verify the server action receives the correct previous state and form data.
5. Verify the returned state updates the UI.

## Assertions
1. Initial render should show "Count: 1" with no pending indicator.
2. After form submission, the server action should receive `prevState = { count: 1 }`.
3. The server action should receive `formData.get('incrementAmount') === '5'`.
4. The return value should be `{ count: 6 }` (1 + 5).
5. After the action completes, the UI should show "Count: 6".
6. The `isPending` state should be `true` during the action and `false` after.
7. The initial state (`{ count: 1 }`) should be correctly bound to the action via `useActionState`.
