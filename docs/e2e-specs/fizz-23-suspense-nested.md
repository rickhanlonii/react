# Nested Suspense Boundaries with Independent Resolution Order

## Category
fizz

## Description
Validates that nested Suspense boundaries resolve independently during Fizz streaming. An outer Suspense boundary can resolve before or after an inner one. Each boundary streams its content independently, and the Fizz runtime on the client correctly handles all resolution orderings. This is critical for real-world applications where data at different levels of the component tree loads at different speeds.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (nested Suspense tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (nested resolution)

## App Setup
```jsx
let resolveOuter, resolveInnerA, resolveInnerB;
const outerPromise = new Promise(r => { resolveOuter = r; });
const innerAPromise = new Promise(r => { resolveInnerA = r; });
const innerBPromise = new Promise(r => { resolveInnerB = r; });

function OuterContent() {
  const data = React.use(outerPromise);
  return (
    <div id="outer-content">
      <h2>{data}</h2>
      {/* Nested Suspense inside the outer content */}
      <Suspense fallback={<div id="inner-a-fallback">Loading inner A...</div>}>
        <InnerContentA />
      </Suspense>
      <Suspense fallback={<div id="inner-b-fallback">Loading inner B...</div>}>
        <InnerContentB />
      </Suspense>
    </div>
  );
}

function InnerContentA() {
  const data = React.use(innerAPromise);
  return <div id="inner-a">{data}</div>;
}

function InnerContentB() {
  const data = React.use(innerBPromise);
  return <div id="inner-b">{data}</div>;
}

function NestedSuspenseApp() {
  return (
    <div id="app">
      <h1>Nested Suspense</h1>
      <Suspense fallback={<div id="outer-fallback">Loading outer...</div>}>
        <OuterContent />
      </Suspense>
      <footer>Footer</footer>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<NestedSuspenseApp />)`.

## Load Sequence
1. Server renders the tree, encountering `<OuterContent />` which suspends.
2. Shell is flushed with the outer fallback ("Loading outer...").
3. When `resolveOuter` is called, the outer boundary resolves.
4. The outer content streams, but it contains two more Suspense boundaries with suspended content.
5. The inner fallbacks ("Loading inner A...", "Loading inner B...") are included in the streamed outer content.
6. Inner A and Inner B can resolve in any order, independent of each other.
7. Each inner resolution triggers an additional streaming chunk.

## Actions
1. Server-render `<NestedSuspenseApp />` and capture the shell.
2. Verify the shell shows the outer fallback.
3. Resolve the outer content (`resolveOuter('Outer Section')`).
4. Capture the streaming chunk for the outer boundary.
5. Verify it contains inner fallbacks.
6. Resolve inner B first (`resolveInnerB('Inner B Data')`) -- out of order.
7. Capture the streaming chunk for inner B.
8. Resolve inner A (`resolveInnerA('Inner A Data')`).
9. Capture the streaming chunk for inner A.
10. Verify the final DOM state.

## Assertions
1. The initial shell contains `<div id="outer-fallback">Loading outer...</div>`.
2. The shell does NOT contain inner fallbacks (they are nested inside the outer boundary which hasn't resolved yet).
3. After resolving outer, a streaming chunk arrives containing `<div id="outer-content">` with `<h2>Outer Section</h2>`.
4. The outer streaming chunk contains inner fallbacks: `<div id="inner-a-fallback">Loading inner A...</div>` and `<div id="inner-b-fallback">Loading inner B...</div>`.
5. After resolving inner B (before inner A), a streaming chunk replaces `#inner-b-fallback` with `<div id="inner-b">Inner B Data</div>`.
6. At this point, `#inner-a-fallback` is still visible.
7. After resolving inner A, a streaming chunk replaces `#inner-a-fallback` with `<div id="inner-a">Inner A Data</div>`.
8. The final DOM shows the complete content with no fallbacks visible.
9. The resolution order (outer -> inner B -> inner A) did not cause any errors.
10. All streaming instruction scripts correctly target the right boundary IDs.
