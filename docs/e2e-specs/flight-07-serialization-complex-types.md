# Serialization of Complex Types

## Category
flight

## Description
Validates that the Flight protocol correctly serializes and deserializes complex JavaScript types: plain Objects, Arrays, Maps, Sets, Dates, Errors, and RegExp. These types require special encoding in the Flight protocol since they go beyond JSON's native capabilities. Maps and Sets use a type tag with an array-of-entries representation. Dates are serialized as ISO strings with a type tag. Errors preserve their message (but not stack for security).

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("can pass a Date as a reply", "can pass a Map as a reply", "can pass a Set as a reply")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` (Map serialization with async values)
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js`

## App Setup
```jsx
function App() {
  const objKey = { obj: 'key' };
  return {
    // Plain objects
    simpleObject: { greeting: 'hello', nested: { deep: true } },

    // Arrays
    simpleArray: [1, 'two', { three: 3 }],
    nestedArray: [[1, 2], [3, 4]],

    // Map
    map: new Map([
      ['hi', { greet: 'world' }],
      [objKey, 123],
    ]),

    // Set
    set: new Set(['hi', objKey, 42]),

    // Date (with millisecond precision)
    date: new Date(1234567890123),

    // Error
    error: new Error('Something went wrong'),
  };
}
```

## Load Sequence
1. Server renders the model using `renderToReadableStream`.
2. The Flight serializer encodes each complex type:
   - Plain objects and arrays use standard JSON-like encoding.
   - `Map` is encoded with a special type tag (`$Q`) followed by an array of `[key, value]` pairs.
   - `Set` is encoded with a special type tag (`$W`) followed by an array of values.
   - `Date` is encoded with a type tag and its ISO string representation (preserving milliseconds).
   - `Error` is encoded with a type tag, preserving the `message` property. Stack traces are sanitized for security in production.
3. Client deserializes the stream, reconstructing instances of the original types.

## Actions
1. Create the model with all complex types on the server.
2. Serialize to a Flight stream.
3. Deserialize on the client via `createFromReadableStream`.
4. Verify each value is the correct type and has the correct contents.

## Assertions
1. `simpleObject` should deeply equal `{ greeting: 'hello', nested: { deep: true } }`.
2. `simpleArray` should deeply equal `[1, 'two', { three: 3 }]`.
3. `nestedArray` should deeply equal `[[1, 2], [3, 4]]`.
4. `map` should be an instance of `Map` with `size === 2`.
5. `map.get('hi')` should deeply equal `{ greet: 'world' }`.
6. `map` should support object keys (the object key entry should be preserved).
7. `set` should be an instance of `Set` with `size === 3`.
8. `set.has('hi')` should be `true` and `set.has(42)` should be `true`.
9. `date` should be an instance of `Date`.
10. `date.getTime()` should equal `1234567890123` (millisecond precision preserved).
11. `date % 1000` should equal `123` to verify milliseconds survived the round-trip.
12. `error` should be an instance of `Error` (or a sanitized error digest in production).
13. In development, `error.message` should be `'Something went wrong'`.
