# Streaming in Replies

## Category
flight

## Description
Validates that `ReadableStream` and `AsyncIterable` objects can be sent from the client to the server as part of reply encoding. This enables streaming data uploads, progressive form submissions, and real-time data transfer from client to server. The reply encoder consumes the stream/iterable on the client and sends chunks progressively. The server reconstructs a new stream/iterable that yields the same chunks. This also covers typed array streams, BYOB (Bring Your Own Buffer) binary streams, and partial results when a reply is aborted.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("should supports streaming ReadableStream with objects", "should supports streaming AsyncIterables with objects", "can abort an unresolved model and get the partial result")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReplyEdge-test.js` ("should support ReadableStreams with typed arrays", "should support BYOB binary ReadableStreams", "can stream the decoding using an async iterable", "should abort when parsing an incomplete payload")

## App Setup
```jsx
// Client-side: creating streams and iterables for reply

// ReadableStream with objects
let controller1, controller2;
const s1 = new ReadableStream({
  start(c) { controller1 = c; },
});
const s2 = new ReadableStream({
  start(c) { controller2 = c; },
});

// Enqueue values progressively
controller1.enqueue({ hello: 'world' });
controller2.enqueue({ hi: 'there' });
controller1.enqueue('text1');
controller2.enqueue('text2');
controller1.close();
controller2.close();

const body = await encodeReply({ s1, s2 });

// AsyncIterable in reply
const multiShotIterable = {
  async *[Symbol.asyncIterator]() {
    yield { hello: 'A' };
    yield { hi: 'B' };
    return 'C';
  },
};

const iterableBody = await encodeReply({ multiShotIterable });

// Abort case
const abortController = new AbortController();
const abortBody = await encodeReply(
  { promise: someUnresolvedPromise },
  { signal: abortController.signal }
);
abortController.abort();
```

## Load Sequence
1. Client creates `ReadableStream` and `AsyncIterable` objects.
2. `encodeReply({ s1, s2 })` starts consuming the streams, encoding each chunk as a part in the reply body.
3. The encoded body is progressively sent to the server as chunks arrive.
4. Once all streams close, `encodeReply` resolves.
5. Server calls `decodeReply(body, serverMap)` or `decodeReplyFromAsyncIterable(iterable, serverMap)`.
6. The decoded result contains new `ReadableStream`/`AsyncIterable` instances.
7. Reading from the decoded streams yields the same chunks in the same order.

## Actions
1. Create ReadableStreams with object and binary chunks on the client.
2. Encode them with `encodeReply`.
3. Decode on the server with `decodeReply`.
4. Read from the decoded streams and verify chunks.
5. Test AsyncIterables (multi-shot and single-shot).
6. Test abort: encode a reply with an unresolved promise, then abort.
7. Verify partial results are available before the abort.

## Assertions
1. Decoded `s1` should be a `ReadableStream`. Reading it should yield `{ hello: 'world' }`, `'text1'`, then done.
2. Decoded `s2` should yield `{ hi: 'there' }`, `'text2'`, then done.
3. Chunks should arrive in enqueue order within each stream.
4. Multiple streams in a single reply should be independently readable.
5. AsyncIterable should be decoded as an async iterable with the same yield values.
6. Multi-shot iterables should be re-iterable (second iteration replays cached values synchronously).
7. Single-shot iterators should be consumed only once.
8. ReadableStreams with typed arrays should preserve the typed array type and contents.
9. BYOB binary streams should be supported (the stream can be read as `{ type: 'bytes' }`).
10. When aborting: chunks delivered before the abort should be available on the server.
11. After abort, attempting to read further from the decoded stream should produce an error.
12. `decodeReplyFromAsyncIterable` should support streaming decoding (processing chunks as they arrive, not buffering the entire body).
