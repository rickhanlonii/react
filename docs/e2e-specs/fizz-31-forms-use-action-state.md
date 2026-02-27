# useActionState with Initial State During SSR

## Category
fizz

## Description
Validates that `useActionState` (formerly `useFormState`) correctly renders its initial state during Fizz server-side rendering. During SSR, the action has not been invoked, so the hook returns the initial state value. The server must also serialize a permalink and action reference so that the form works with progressive enhancement (no-JS form submission that hits the server and returns updated state).

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` (useActionState SSR tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (useActionState integration)

## App Setup
```jsx
async function incrementAction(prevState, formData) {
  'use server';
  return prevState + 1;
}

async function addItemAction(prevState, formData) {
  'use server';
  const item = formData.get('item');
  return [...prevState, item];
}

function CounterForm() {
  const [count, formAction, isPending] = React.useActionState(incrementAction, 0);
  return (
    <form id="counter-form" action={formAction}>
      <p id="counter-value">{count}</p>
      <button type="submit" disabled={isPending}>
        {isPending ? 'Incrementing...' : 'Increment'}
      </button>
    </form>
  );
}

function ItemListForm() {
  const [items, formAction, isPending] = React.useActionState(
    addItemAction,
    ['Initial Item'],
    '/items' // permalink
  );
  return (
    <form id="items-form" action={formAction}>
      <ul id="items-list">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
      <input type="text" name="item" defaultValue="" />
      <button type="submit" disabled={isPending}>Add Item</button>
    </form>
  );
}

function ActionStateApp() {
  return (
    <div id="app">
      <CounterForm />
      <ItemListForm />
    </div>
  );
}
```

Server renders via `renderToReadableStream(<ActionStateApp />)`.

## Load Sequence
1. Server renders the component tree.
2. `useActionState` returns `[initialState, boundFormAction, isPending]`.
3. During SSR, `isPending` is always `false`.
4. The initial state values are rendered: `0` for counter, `['Initial Item']` for items list.
5. The form action is serialized with hidden fields for the action ID and bound state.
6. If a `permalink` is provided, it is used as the form's `action` URL for no-JS fallback.
7. HTML is flushed.
8. Before hydration, form submission via native POST to the permalink triggers the server action.
9. After hydration, form submission is handled client-side.

## Actions
1. Server-render `<ActionStateApp />` and collect HTML output.
2. Parse the HTML and inspect the initial state rendering.
3. Inspect form attributes and hidden fields.
4. Hydrate with `hydrateRoot`.
5. Submit the counter form and verify state updates.

## Assertions
1. `#counter-value` contains `0` (the initial state) in the server HTML.
2. `#counter-form` has hidden input fields encoding the action state reference.
3. The counter form's button shows "Increment" (not "Incrementing...") since `isPending` is false.
4. The button does NOT have the `disabled` attribute in server HTML.
5. `#items-list` contains one `<li>` with text "Initial Item" in the server HTML.
6. `#items-form` has `action="/items"` attribute (the permalink) for progressive enhancement.
7. Hidden fields in the items form encode the initial state and action reference.
8. Hydration completes without warnings.
9. After hydration and form submission, the counter increments to `1` and the UI updates.
10. The items form can add new items, updating the list client-side.
