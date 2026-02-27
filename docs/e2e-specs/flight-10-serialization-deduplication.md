# Object Deduplication

## Category
flight

## Description
Validates that the Flight protocol deduplicates objects that appear multiple times in the serialized tree. When the same object reference is used in multiple places, the Flight serializer should encode it once and use back-references for subsequent occurrences. This reduces payload size significantly for trees with shared data. Additionally, the same Server Component element rendered multiple times should only execute once, with its result shared across all occurrences.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("should encode repeated objects in a compact format by deduping", "should execute repeated server components only once")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` ("should resolve deduped objects within the same model root when it is blocked", "should resolve deduped objects that are themselves blocked")

## App Setup
```jsx
// Shared object referenced multiple times
const sharedObj = {
  this: { is: 'a large object' },
  with: { many: 'properties in it' },
};

function App() {
  // The same object instance appears 30 times
  const items = new Array(30).fill(sharedObj);
  return <div>{items}</div>;
}

// Server Component deduplication
function ServerComponent() {
  timesRendered++;
  return 'this is a long return value';
}

function AppWithDedupedComponents() {
  const element = <ServerComponent />;
  // Same element instance used 30 times
  return (
    <>
      {element}{element}{element}{element}{element}
      {element}{element}{element}{element}{element}
      {/* ... 30 total */}
    </>
  );
}
```

## Load Sequence
1. Server renders the model with `renderToReadableStream`.
2. The Flight serializer encounters `sharedObj` the first time and assigns it a reference ID, serializing it fully.
3. For the remaining 29 occurrences, the serializer detects the same reference and emits only the reference ID.
4. The total stream size should be significantly less than 30x the size of one object.
5. For Server Component deduplication: the element `<ServerComponent />` is the same instance used 30 times, so the server renders it only once.
6. Client deserializes the stream, resolving all references to the same object instance.

## Actions
1. Create a model with the same object referenced 30 times.
2. Serialize to a Flight stream.
3. Measure the serialized content length (should be compact).
4. Deserialize on the client.
5. Verify referential identity of deduplicated items.

## Assertions
1. The serialized stream length should be significantly less than encoding the object 30 times independently (e.g., less than ~1075 bytes for the test case).
2. After deserialization, `result[5]` should be referentially identical to `result[10]` (same object instance).
3. All 30 items should deeply equal the original `sharedObj`.
4. For Server Component deduplication: the component function should execute only once, not 30 times.
5. The result should still contain 30 entries, each containing the rendered output.
6. Deduplication should work correctly even when the deduplicated object is blocked on a pending async chunk.
7. Deduplication should work when objects appear inside nested blocked models.
