# useId: Deterministic IDs Matching Between Server and Client

## Category
fizz

## Description
Validates that `useId` generates deterministic, unique IDs during Fizz server-side rendering that exactly match the IDs generated during client-side hydration. This is critical for accessibility patterns (label-input associations, aria-describedby, etc.) where the ID must be consistent between server HTML and the hydrated client DOM.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (useId tests)
- `packages/react-server/src/ReactFizzHooks.js` (server-side useId implementation)

## App Setup
```jsx
function UseIdApp() {
  return (
    <div>
      <SimpleId />
      <FormWithId />
      <MultipleIds />
      <ConditionalId show={true} />
      <ListWithIds items={['apple', 'banana', 'cherry']} />
      <NestedIds />
    </div>
  );
}

function SimpleId() {
  const id = React.useId();
  return (
    <div id="simple-id">
      <label htmlFor={id}>Name</label>
      <input id={id} type="text" />
    </div>
  );
}

function FormWithId() {
  const nameId = React.useId();
  const emailId = React.useId();
  return (
    <form id="form-ids">
      <label htmlFor={nameId}>Name</label>
      <input id={nameId} type="text" />
      <label htmlFor={emailId}>Email</label>
      <input id={emailId} type="email" />
    </form>
  );
}

function MultipleIds() {
  const id = React.useId();
  return (
    <div id="multi-ids">
      <input id={`${id}-input`} aria-describedby={`${id}-help`} />
      <span id={`${id}-help`}>Help text</span>
    </div>
  );
}

function ConditionalId({ show }) {
  const id = React.useId();
  return (
    <div id="conditional-id">
      {show && <span id={id}>Conditional content</span>}
    </div>
  );
}

function ListWithIds({ items }) {
  return (
    <ul id="list-ids">
      {items.map(item => (
        <ListItem key={item} item={item} />
      ))}
    </ul>
  );
}

function ListItem({ item }) {
  const id = React.useId();
  return (
    <li>
      <label htmlFor={id}>{item}</label>
      <input id={id} type="checkbox" />
    </li>
  );
}

function NestedIds() {
  const outerId = React.useId();
  return (
    <div id="nested-ids" data-outer-id={outerId}>
      <InnerIds />
    </div>
  );
}

function InnerIds() {
  const innerId = React.useId();
  return <span data-inner-id={innerId}>Inner</span>;
}
```

Server renders via `renderToPipeableStream(<UseIdApp />)`.

## Load Sequence
1. Server renders the tree, generating IDs using React's deterministic ID algorithm based on the component tree structure.
2. IDs follow the format `:R....:` (or with the identifierPrefix if specified).
3. HTML is flushed containing these IDs in element attributes.
4. Client hydrates, generating the same IDs in the same order.
5. Hydration succeeds because server and client IDs match.

## Actions
1. Server-render `<UseIdApp />` and collect HTML output.
2. Extract all generated IDs from the HTML.
3. Hydrate with `hydrateRoot`.
4. After hydration, extract IDs again from the live DOM.
5. Compare server and client IDs.

## Assertions
1. In `#simple-id`, the `<label>`'s `for` attribute matches the `<input>`'s `id` attribute.
2. In `#form-ids`, each label's `for` matches its corresponding input's `id`, and the two inputs have different IDs.
3. In `#multi-ids`, the input's `id` is `{id}-input` and the span's `id` is `{id}-help`, and the input's `aria-describedby` matches the span's `id`.
4. All generated IDs contain the `:` character (React's ID format uses colons).
5. No two `useId` calls in the tree produce the same ID value.
6. Each list item in `#list-ids` has a unique ID for its input.
7. In `#nested-ids`, the outer ID (on the div) differs from the inner ID (on the span).
8. After hydration, every ID in the DOM is identical to the ID in the server-rendered HTML.
9. Hydration completes without any ID mismatch warnings.
10. The label-input associations work correctly (clicking a label focuses its input).
