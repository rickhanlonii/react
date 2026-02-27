# Async Iterables as Children, Async Server Components

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles async iterables used as children of React elements. This is a pattern used in React Server Components where components can be async functions and children can be async generators or async iterables. The renderer must await and iterate through async children, rendering each yielded element in order.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (async iterable children)
- `packages/react-server/src/ReactFizzServer.js` (async iterable rendering logic)

## App Setup
```jsx
// Async iterable that yields children one by one
async function* generateItems() {
  yield <li key="1">First item</li>;
  yield <li key="2">Second item</li>;
  yield <li key="3">Third item</li>;
}

// Async iterable with delays
async function* generateDelayedItems() {
  yield <div key="a">Immediate A</div>;
  await new Promise(r => setTimeout(r, 10));
  yield <div key="b">Delayed B</div>;
  await new Promise(r => setTimeout(r, 10));
  yield <div key="c">Delayed C</div>;
}

// Component that returns async iterable as children
function AsyncListItems() {
  return generateItems();
}

function DelayedListItems() {
  return generateDelayedItems();
}

// Async server component
async function AsyncGreeting({ name }) {
  // Simulating async work
  const greeting = await Promise.resolve(`Hello, ${name}!`);
  return <h2 id="async-greeting">{greeting}</h2>;
}

function AsyncIterableApp() {
  return (
    <div id="app">
      {/* Async iterable as direct children */}
      <ul id="sync-list">
        <AsyncListItems />
      </ul>

      {/* Async iterable with delays */}
      <Suspense fallback={<div>Loading delayed items...</div>}>
        <div id="delayed-list">
          <DelayedListItems />
        </div>
      </Suspense>

      {/* Async server component */}
      <Suspense fallback={<div>Loading greeting...</div>}>
        <AsyncGreeting name="World" />
      </Suspense>

      {/* Array of promises as children */}
      <div id="promise-children">
        {[
          Promise.resolve(<span key="p1">Promise 1</span>),
          Promise.resolve(<span key="p2">Promise 2</span>),
        ]}
      </div>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<AsyncIterableApp />)`.

## Load Sequence
1. Server starts rendering the tree.
2. When it encounters an async iterable as children, it begins iterating through it.
3. Each yielded element is rendered in order as a child.
4. For async iterables with delays, rendering suspends until the next value is yielded.
5. Async server components are awaited and their return value is rendered.
6. Content inside Suspense boundaries that depends on async operations is deferred and streamed.
7. The shell is flushed once synchronous content and resolved async content is ready.

## Actions
1. Server-render `<AsyncIterableApp />` and collect the HTML output.
2. Verify the async iterable children are rendered in order.
3. Verify the async server component's output.
4. Hydrate with `hydrateRoot`.

## Assertions
1. `#sync-list` contains three `<li>` elements: "First item", "Second item", "Third item" in order.
2. `#delayed-list` contains three `<div>` elements: "Immediate A", "Delayed B", "Delayed C" in order.
3. `#async-greeting` contains "Hello, World!".
4. `#promise-children` contains two `<span>` elements: "Promise 1" and "Promise 2".
5. All async iterable children maintain their key props for reconciliation.
6. The order of children matches the yield order of the async iterable.
7. Async iterables that complete synchronously are rendered inline in the shell.
8. Async iterables with delays may cause their parent Suspense boundary to show a fallback until all items are yielded.
9. Hydration completes without mismatch warnings.
