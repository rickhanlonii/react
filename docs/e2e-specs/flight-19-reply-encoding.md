# Reply Encoding/Decoding

## Category
flight

## Description
Validates the reply protocol used to send data from the client back to the server (the reverse direction of the Flight stream). When a server action is called from the client, its arguments are encoded using `encodeReply` on the client and decoded using `decodeReply` on the server. The reply protocol supports the same rich types as the Flight protocol: primitives (including special numbers and BigInt), Dates, Maps, Sets, promises, React.lazy, iterables, and iterators. It also supports temporary references for round-tripping opaque values (like JSX elements) that cannot be serialized.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("can pass undefined as a reply", "can pass weird numbers as a reply", "can pass a BigInt as a reply", "can pass a Date as a reply", "can pass a Map as a reply", "can pass a Set as a reply", "can pass an iterable as a reply", "can pass an iterator as a reply", "resolves a promise and includes its value")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReplyEdge-test.js` ("can encode a reply")

## App Setup
```jsx
// Client-side: encoding various types as reply arguments
async function testReplyEncoding() {
  // Primitives
  const undefinedReply = await encodeReply(undefined);
  const numbersReply = await encodeReply([0, -0, Infinity, -Infinity, NaN]);
  const bigintReply = await encodeReply(90071992547409910000n);

  // Complex types
  const dateReply = await encodeReply(new Date(1234567890123));
  const mapReply = await encodeReply(new Map([['hi', { greet: 'world' }]]));
  const setReply = await encodeReply(new Set(['hi', { obj: 'key' }]));

  // Iterable
  const iterableReply = await encodeReply({
    [Symbol.iterator]: function* () {
      yield 'A';
      yield 'B';
      yield 'C';
    },
  });

  // Iterator (single-shot)
  const iterator = (function* () { yield 'A'; yield 'B'; })();
  const iteratorReply = await encodeReply(iterator);

  // Promise
  const promiseReply = await encodeReply({ promise: Promise.resolve('Hi') });

  // Object with undefined properties
  const sparseReply = await encodeReply({
    array: [undefined, null, undefined],
    prop: undefined,
  });
}
```

## Load Sequence
1. Client calls `encodeReply(value)` which serializes the argument(s) into a `FormData` or body suitable for sending to the server.
2. The reply encoder handles each type with appropriate encoding:
   - Special numbers use type tags.
   - Maps and Sets are encoded as arrays of entries/values.
   - Dates are encoded as ISO strings.
   - Iterables are consumed and their values are encoded as an array.
   - Promises are awaited and their resolved values are encoded.
3. The encoded body is sent to the server (typically as part of a server action call).
4. Server calls `decodeReply(body, webpackServerMap)` to reconstruct the original values.
5. The decoded values should match the original types and values.

## Actions
1. Encode various types on the client using `encodeReply`.
2. Decode them on the server using `decodeReply`.
3. Compare the decoded values to the originals.

## Assertions
1. `undefined` should round-trip correctly (decoded as `undefined`).
2. Special numbers should preserve identity: `Object.is(-0, decoded)`, `Infinity`, `-Infinity`, `NaN`.
3. BigInt should round-trip: `decoded === 90071992547409910000n`.
4. Date should round-trip with millisecond precision: `decoded.getTime() === 1234567890123`.
5. Map should round-trip: `decoded instanceof Map`, correct size, correct entries.
6. Set should round-trip: `decoded instanceof Set`, correct size, correct members.
7. Iterables should round-trip as multi-pass iterables (can iterate multiple times).
8. Iterators should round-trip as single-shot (second iteration yields empty).
9. Promises should resolve and their values should be included.
10. `React.lazy` should be unwrapped and its resolved value included.
11. Objects with `undefined` properties should preserve the `undefined` values.
12. Calling `encodeReply` with JSX (without temporary references) should throw an error.
