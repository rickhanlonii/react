# Serialization of Primitives

## Category
flight

## Description
Validates that the Flight protocol correctly serializes and deserializes all JavaScript primitive types: strings (including edge cases like `$` and `@` prefixes), numbers (including `-0`, `Infinity`, `-Infinity`, `NaN`), BigInt, `undefined`, `null`, booleans, and Symbols (via Symbol.for). These primitives may appear as props, return values, or within nested data structures passed through the Flight stream.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("can pass weird numbers as a reply", "can pass a BigInt as a reply", "can pass undefined as a reply")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` ("should not get confused by $", "should not get confused by @")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` (long string encoding tests)

## App Setup
```jsx
function App() {
  return {
    // Strings
    simpleString: 'hello',
    dollarString: '$1',       // Must not be confused with Flight row reference
    atString: '@div',         // Must not be confused with Flight element reference
    emptyString: '',
    longString: 'x'.repeat(1024), // Tests compact long string serialization

    // Numbers
    integer: 42,
    float: 3.14,
    negativeZero: -0,
    infinity: Infinity,
    negativeInfinity: -Infinity,
    nan: NaN,

    // BigInt
    bigint: 90071992547409910000n,

    // Null and undefined
    nullValue: null,
    undefinedValue: undefined,

    // Booleans
    trueValue: true,
    falseValue: false,

    // Arrays with holes and undefined
    sparseArray: [undefined, null, undefined],
  };
}
```

## Load Sequence
1. Server renders `<App />` using `renderToReadableStream`.
2. The Flight serializer encodes each primitive value using the Flight protocol:
   - Strings starting with `$` or `@` are escaped to avoid protocol ambiguity.
   - Special numbers (`-0`, `Infinity`, `-Infinity`, `NaN`) use special type tags (e.g., `$-0`, `$Infinity`).
   - BigInt values are encoded with a BigInt type tag.
   - `undefined` is encoded with a special sentinel.
   - Long strings (above a threshold) may use a compact binary encoding.
3. The stream is consumed on the client via `createFromReadableStream`.
4. The Flight client parser decodes each value back to its original JavaScript type.

## Actions
1. Render the model on the server.
2. Serialize to a Flight stream.
3. Deserialize on the client.
4. Compare each value for type-correct equality.

## Assertions
1. `simpleString` should equal `'hello'`.
2. `dollarString` should equal `'$1'` (not interpreted as a row reference).
3. `atString` should equal `'@div'` (not interpreted as an element reference).
4. `emptyString` should equal `''`.
5. `longString` should equal `'x'.repeat(1024)` and the stream encoding should be compact.
6. `integer` should equal `42`, `float` should equal `3.14`.
7. `negativeZero` should be `-0` (verified with `Object.is(result, -0)`).
8. `infinity` should be `Infinity`, `negativeInfinity` should be `-Infinity`.
9. `nan` should be `NaN` (verified with `Number.isNaN(result)`).
10. `bigint` should equal `90071992547409910000n` and `typeof result` should be `'bigint'`.
11. `nullValue` should be `null`.
12. `undefinedValue` should be `undefined`.
13. `trueValue` should be `true`, `falseValue` should be `false`.
14. `sparseArray` should have length 3 with `[undefined, null, undefined]`.
