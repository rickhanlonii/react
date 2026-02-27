# SuspenseList with revealOrder: forwards, together, independent

## Category
fizz

## Description
Validates the `SuspenseList` component (currently `React.unstable_SuspenseList`) during Fizz server-side rendering. `SuspenseList` controls the order in which Suspense boundaries reveal their content: `forwards` reveals them in DOM order (even if later items resolve first), `together` waits for all to resolve before revealing any, and the default behavior reveals them independently as they resolve. `SuspenseList` also supports a `tail` prop to control how many pending fallbacks are shown.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzSuspenseList-test.js` (comprehensive SuspenseList streaming tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (SuspenseList integration)

## App Setup
```jsx
const SuspenseList = React.unstable_SuspenseList;

function createAsyncComponent(name) {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  function Component() {
    const data = React.use(promise);
    return <div id={`item-${name}`}>{data}</div>;
  }
  Component.resolve = (value) => resolve(value);
  return Component;
}

const ItemA = createAsyncComponent('a');
const ItemB = createAsyncComponent('b');
const ItemC = createAsyncComponent('c');

// Forwards reveal order
function ForwardsList() {
  return (
    <div id="forwards-list">
      <SuspenseList revealOrder="forwards">
        <Suspense fallback={<div className="fallback">Loading A...</div>}>
          <ItemA />
        </Suspense>
        <Suspense fallback={<div className="fallback">Loading B...</div>}>
          <ItemB />
        </Suspense>
        <Suspense fallback={<div className="fallback">Loading C...</div>}>
          <ItemC />
        </Suspense>
      </SuspenseList>
    </div>
  );
}

// Together reveal order
const ItemD = createAsyncComponent('d');
const ItemE = createAsyncComponent('e');

function TogetherList() {
  return (
    <div id="together-list">
      <SuspenseList revealOrder="together">
        <Suspense fallback={<div className="fallback">Loading D...</div>}>
          <ItemD />
        </Suspense>
        <Suspense fallback={<div className="fallback">Loading E...</div>}>
          <ItemE />
        </Suspense>
      </SuspenseList>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(...)`.

## Load Sequence
1. Server renders the component tree with `SuspenseList` controlling the reveal order.
2. The shell is flushed with fallbacks for all pending items.
3. For `forwards` mode: even if item C resolves before A, it waits for A to reveal first, then B, then C.
4. For `together` mode: even if D resolves before E, neither reveals until both are ready.
5. Streaming chunks arrive but the Fizz runtime respects the reveal order constraints.

## Actions
### Forwards test:
1. Server-render `<ForwardsList />` and capture the shell.
2. Resolve C first: `ItemC.resolve('Content C')`.
3. Verify C's content is not yet revealed (A hasn't resolved).
4. Resolve A: `ItemA.resolve('Content A')`.
5. Verify A reveals. B still shows fallback. C may or may not reveal depending on B.
6. Resolve B: `ItemB.resolve('Content B')`.
7. Verify B and C reveal.

### Together test:
1. Server-render `<TogetherList />` and capture the shell.
2. Resolve D: `ItemD.resolve('Content D')`.
3. Verify D's content is not yet revealed (E hasn't resolved).
4. Resolve E: `ItemE.resolve('Content E')`.
5. Verify both D and E reveal simultaneously.

## Assertions
### Forwards:
1. The shell shows all three fallbacks for A, B, and C.
2. When C resolves before A, C's content is streamed to the client but kept hidden by the Fizz runtime.
3. When A resolves, A's content becomes visible.
4. Items reveal strictly in order: A, then B, then C.
5. After all resolve, `#item-a`, `#item-b`, and `#item-c` are visible with correct content.

### Together:
6. The shell shows fallbacks for both D and E.
7. When only D has resolved, neither D nor E content is visible (both fallbacks remain).
8. When E also resolves, both D and E content become visible simultaneously.
9. `#item-d` and `#item-e` contain their respective content.

### General:
10. The `SuspenseList` component does not add any extra DOM elements to the output.
11. Hydration works correctly with the `SuspenseList` reveal constraints.
