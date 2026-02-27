# Cyclic Reference Handling

## Category
flight

## Description
Validates that the Flight protocol correctly handles objects and arrays that contain cyclic (self-referencing) references. Cyclic data structures are common in graph-like models and must be serialized without infinite recursion. The Flight protocol uses reference IDs to represent back-references, allowing the client to reconstruct the same cyclic structure. This also covers cyclic references that survive multiple rounds of serialization/deserialization (e.g., through an intermediate consuming server).

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("should resolve cyclic references in client component props after two rounds of serialization and deserialization")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js`

## App Setup
```jsx
// Client Component that verifies cyclic references
function ClientComponent({ data }) {
  // "use client"
  return (
    <div>{data.self === data ? 'Cycle resolved' : 'Cycle broken'}</div>
  );
}

function App() {
  // Create a cyclic object
  const cyclic = { self: null, name: 'root' };
  cyclic.self = cyclic; // self-reference

  // Create a cyclic array
  const cyclicArray = [1, 2];
  cyclicArray.push(cyclicArray); // array references itself

  return <ClientComponent data={cyclic} />;
}
```

The key challenge: when the Flight serializer encounters `cyclic.self`, it must recognize that this is the same object it is currently serializing and emit a back-reference instead of re-serializing the object (which would loop forever).

## Load Sequence
1. Server renders `<App />` with `renderToReadableStream`.
2. The Flight serializer encounters the `cyclic` object and assigns it a reference ID (e.g., `$1`).
3. When serializing the `self` property, it detects the object has already been seen and emits a reference (`$1`) instead of re-serializing.
4. The stream contains the object once, with the `self` property pointing back to its own reference ID.
5. Client deserializes the stream. When it encounters the back-reference, it resolves it to the already-constructed object.
6. The resulting `data.self === data` should be `true` -- referential identity is preserved.

## Actions
1. Create a cyclic object and cyclic array on the server.
2. Pass them as props to a client component.
3. Serialize to a Flight stream.
4. Deserialize on the client.
5. Verify referential identity of cyclic references.

## Assertions
1. `data.self` should be referentially identical to `data` (`data.self === data` is `true`).
2. The rendered output should show "Cycle resolved", not "Cycle broken".
3. No infinite loop or stack overflow should occur during serialization.
4. No infinite loop or stack overflow should occur during deserialization.
5. Cyclic references should survive multiple rounds of serialization/deserialization (e.g., RSC -> consuming SSR server -> client).
6. Cyclic arrays (array containing itself) should also be correctly reconstructed.
7. Nested cyclic structures (e.g., `a.b.c.a === a`) should work correctly.
