# AsyncIterable Support

## Category
flight

## Description
Validates that async iterables (objects with `Symbol.asyncIterator`) and async generators can be passed through the Flight protocol from server to client. The Flight protocol supports both multi-shot iterables (can be iterated multiple times) and single-shot iterators (consumed once). Chunks are streamed progressively as the async generator yields values. This is useful for streaming lists, real-time feeds, or paginated data.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` ("should supports streaming AsyncIterables with objects", "should cancels the underlying AsyncIterable when we are cancelled")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("can pass an async import a AsyncIterable while allowing peaking at future values")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("should supports streaming AsyncIterables with objects")

## App Setup
```jsx
function App() {
  // Multi-shot async iterable (can be iterated multiple times)
  const multiShotIterable = {
    async *[Symbol.asyncIterator]() {
      yield { hello: 'A' };
      await someDelay();
      yield { hi: 'B' };
      return 'C'; // return value
    },
  };

  // Single-shot async iterator (consumed once)
  const singleShotIterator = (async function* () {
    yield { hello: 'D' };
    await someDelay();
    yield { hi: 'E' };
    throw 'F'; // error case
  })();

  return { multiShotIterable, singleShotIterator };
}
```

## Load Sequence
1. Server renders the model with `renderToReadableStream`.
2. The Flight serializer begins consuming each async iterable/iterator.
3. Each `yield`ed value is serialized as a row in the Flight stream.
4. For delayed yields (after `await`), the row is written when the value becomes available.
5. The `return` value is sent as a completion row. Thrown errors are sent as error rows.
6. The Flight protocol distinguishes multi-shot iterables (object with `[Symbol.asyncIterator]`) from single-shot iterators (the iterator itself).
7. Client reconstructs async iterables/iterators. Multi-shot iterables can be iterated again (replaying cached values). Single-shot iterators can only be consumed once.

## Actions
1. Create the model with async iterables on the server.
2. Serialize to a Flight stream.
3. Deserialize on the client.
4. Iterate through `multiShotIterable` using `for await...of` or manual `.next()` calls.
5. Iterate through `singleShotIterator`.
6. Re-iterate `multiShotIterable` a second time to verify multi-shot behavior.

## Assertions
1. `multiShotIterable` should support `Symbol.asyncIterator`.
2. Iterating `multiShotIterable`: first `next()` yields `{ value: { hello: 'A' }, done: false }`.
3. Second `next()` yields `{ value: { hi: 'B' }, done: false }`.
4. Third `next()` yields `{ value: 'C', done: true }` (return value).
5. `singleShotIterator[Symbol.asyncIterator]()` should return itself (single-shot semantics).
6. `multiShotIterable` iterator should NOT be the iterable itself (multi-shot semantics -- new iterator each time).
7. Iterating `multiShotIterable` a second time should replay the same values synchronously (cached).
8. Values cannot be passed to `next()` on client-side async iterables -- this should produce a warning.
9. When the source iterator throws, the client iterator should receive the error.
