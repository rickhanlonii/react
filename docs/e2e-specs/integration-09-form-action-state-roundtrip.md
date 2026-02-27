# useActionState with Server Action and Initial State Roundtrip

## Category
integration

## Description
Validates the full `useActionState` lifecycle with server actions: the hook is initialized with an initial state and a server action, the form renders with the initial state, the user submits the form, the server action processes the submission and returns new state, and the updated state is reflected in the UI. This also tests the MPA (multi-page application) form state continuity: after a form POST, `decodeFormState` on the server produces a `formState` object that is passed to Fizz's `renderToPipeableStream`, allowing `useActionState` to display the action's return value immediately on the server-rendered response page without a client-side round-trip. On hydration, the client picks up the form state seamlessly.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` - "useActionState's dispatch binds the initial state to the provided action", "useActionState can reuse state during MPA form submission", "useActionState preserves state if arity is the same"
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` - useActionState rendering in Fizz
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` - Form state propagation through Fizz

## App Setup
```jsx
// RSC Server: rsc-server.js
import {
  renderToPipeableStream,
  decodeAction,
  decodeFormState,
} from 'react-server-dom-webpack/server';

// Server Action: processes a step counter
const incrementAction = serverExports(
  async function increment(prevState, formData) {
    const step = parseInt(formData.get('step'), 10) || 1;
    return {
      count: prevState.count + step,
      lastAction: 'increment',
      timestamp: Date.now(),
    };
  }
);

const decrementAction = serverExports(
  async function decrement(prevState, formData) {
    const step = parseInt(formData.get('step'), 10) || 1;
    return {
      count: prevState.count - step,
      lastAction: 'decrement',
      timestamp: Date.now(),
    };
  }
);

// Server Component
function App({ incrementAction, decrementAction }) {
  return (
    <div id="counter-app">
      <h1>Action State Counter</h1>
      <CounterForm
        incrementAction={incrementAction}
        decrementAction={decrementAction}
      />
    </div>
  );
}

// Initial render
function handleGET(req, res) {
  const rscStream = renderToPipeableStream(
    <App incrementAction={incrementAction} decrementAction={decrementAction} />,
    webpackMap
  );
  // ... Fizz SSR pipeline
  const { pipe } = fizzRenderToPipeableStream(response, {
    bootstrapScripts: ['/client.js'],
    onShellReady() {
      res.statusCode = 200;
      pipe(res);
    },
  });
}

// Handle form POST
async function handlePOST(req, res) {
  const formData = await parseFormData(req);
  const action = await decodeAction(formData, webpackServerMap);
  const returnValue = await action();
  const formState = await decodeFormState(returnValue, formData, webpackServerMap);

  const rscStream = renderToPipeableStream(
    <App incrementAction={incrementAction} decrementAction={decrementAction} />,
    webpackMap
  );
  // ... Fizz SSR with formState
  const { pipe } = fizzRenderToPipeableStream(response, {
    bootstrapScripts: ['/client.js'],
    formState: formState,
    onShellReady() {
      res.statusCode = 200;
      pipe(res);
    },
  });
}

// ClientComponents.js ('use client')
'use client';
import { useActionState } from 'react';

const initialState = { count: 0, lastAction: null, timestamp: null };

export function CounterForm({ incrementAction, decrementAction }) {
  const [incState, incDispatch, incPending] = useActionState(
    incrementAction,
    initialState
  );
  const [decState, decDispatch, decPending] = useActionState(
    decrementAction,
    initialState
  );

  // Use whichever state was last updated
  const currentCount = incState.timestamp > (decState.timestamp || 0)
    ? incState.count
    : decState.timestamp
    ? decState.count
    : initialState.count;

  const isPending = incPending || decPending;

  return (
    <div id="counter-forms">
      <p id="count-display">
        Count: {currentCount}
        {isPending && <span className="pending"> (updating...)</span>}
      </p>

      <form id="increment-form" action={incDispatch}>
        <label htmlFor="inc-step">Step:</label>
        <input id="inc-step" type="number" name="step" defaultValue="1" min="1" />
        <button id="inc-btn" type="submit" disabled={isPending}>
          + Increment
        </button>
      </form>

      <form id="decrement-form" action={decDispatch}>
        <label htmlFor="dec-step">Step:</label>
        <input id="dec-step" type="number" name="step" defaultValue="1" min="1" />
        <button id="dec-btn" type="submit" disabled={isPending}>
          - Decrement
        </button>
      </form>

      {(incState.lastAction || decState.lastAction) && (
        <p id="last-action">
          Last action: {incState.timestamp > (decState.timestamp || 0)
            ? incState.lastAction
            : decState.lastAction}
        </p>
      )}
    </div>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request.
2. RSC server renders `<App />` with server action references for increment and decrement.
3. Fizz SSR renders the `CounterForm`. `useActionState` initializes with `initialState` (`count: 0`). The dispatch functions are serialized as form actions.
4. The HTML is streamed with forms containing: `action` attributes pointing to the server, hidden inputs encoding the Flight action references, visible inputs for step values, and the count display showing "Count: 0".
5. The browser displays the page. Without JS, the forms work as native HTML form submissions.
6. If JavaScript loads, `hydrateRoot` attaches event handlers. `useActionState` re-initializes with the same initial state.
7. If the page was the result of a POST (MPA submission), `formState` from the server ensures `useActionState` reflects the action's return value immediately.

## Actions
1. Navigate to the page and verify initial state: "Count: 0", no "Last action" text.
2. Wait for hydration to complete.
3. Set the increment step to 5.
4. Click "+ Increment".
5. Observe the pending state (button disabled, "updating..." text).
6. Wait for the server action to complete.
7. Verify the count is now 5.
8. Click "+ Increment" again with step still at 5.
9. Verify the count is now 10.
10. Set the decrement step to 3.
11. Click "- Decrement".
12. Wait for the action to complete.
13. Verify the count is now 7.
14. Test the MPA flow: disable JavaScript, submit the increment form.
15. Verify the new page shows the updated count.

## Assertions
1. Initial render: `<p id="count-display">` shows "Count: 0".
2. Initial render: no `<p id="last-action">` is present (no action has been performed).
3. Initial render: both forms have correct `action` attributes and hidden inputs for Flight action encoding.
4. `useActionState` returns `isPending: false` on initial render: buttons are not disabled.
5. After clicking "+ Increment" with step=5: during the action, `isPending` is true, buttons are disabled, "(updating...)" text appears.
6. After the increment action completes: `<p id="count-display">` shows "Count: 5".
7. After the increment action completes: `<p id="last-action">` shows "Last action: increment".
8. After the second increment: count shows "Count: 10".
9. After clicking "- Decrement" with step=3: count shows "Count: 7" and last action shows "decrement".
10. MPA flow (without JS): submitting the increment form triggers a full page POST. The server processes the action via `decodeAction`, returns `formState` to Fizz, and the new page shows the updated count immediately in the server-rendered HTML.
11. MPA flow: after the POST response, `useActionState` on the server-rendered page reflects the action's return value (not the initial state).
12. Hydration after MPA POST: `hydrateRoot` receives `formState` and `useActionState` on the client matches the server-rendered state without flicker.
