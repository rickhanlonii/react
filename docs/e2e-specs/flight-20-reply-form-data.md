# FormData in Replies

## Category
flight

## Description
Validates that `FormData` objects (including those containing Blob and File entries) can be sent from the client to the server as part of reply encoding. When a server action receives a form submission, the FormData is encoded by `encodeReply` and decoded by `decodeReply`. This covers plain text fields, multiple values for the same key, Blob entries with filenames, and multiple File entries in a single FormData. Unlike server-to-client transfers, file names ARE preserved in the client-to-server direction.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` ("can pass FormData as a reply", "can pass multiple Files in FormData", "can pass two independent FormData with same keys")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReplyEdge-test.js` ("can transport FormData (blobs)")

## App Setup
```jsx
// Client-side: building FormData with various entries
const formData = new FormData();
formData.set('hello', 'world');
formData.append('list', '1');
formData.append('list', '2');
formData.append('list', '3');

const typedArray = new Uint8Array([0, 1, 2, 3]);
const blob = new Blob([typedArray]);
formData.append('blob', blob, 'filename.blob');

// Multiple files case
const fileFormData = new FormData();
const blobA = new Blob([new Uint8Array([0, 1, 2, 3])]);
const blobB = new Blob([new Uint8Array([4, 5])]);
fileFormData.append('filelist', 'string');
fileFormData.append('filelist', blobA);
fileFormData.append('filelist', blobB);

// Two independent FormData with same keys
const formDataA = new FormData();
formDataA.set('greeting', 'hello');
const formDataB = new FormData();
formDataB.set('greeting', 'hi');

// Send as a structured object
const body = await encodeReply({ a: formDataA, b: formDataB });
```

## Load Sequence
1. Client creates `FormData` objects with various entry types.
2. `encodeReply(formData)` serializes the FormData, including binary entries as multipart segments.
3. The encoded body is sent to the server.
4. `decodeReply(body, webpackServerMap)` reconstructs the `FormData` instance on the server.
5. All entries (text, blob, file) are preserved with their keys and values.

## Actions
1. Create FormData with text entries, multiple values per key, and blob/file entries.
2. Encode with `encodeReply`.
3. Decode with `decodeReply`.
4. Verify all entries are preserved.
5. Test with multiple independent FormData objects in a single reply.

## Assertions
1. The decoded FormData should be a new `FormData` instance (not the same reference).
2. `formData2.get('hello')` should equal `'world'`.
3. `formData2.getAll('list')` should equal `['1', '2', '3']`.
4. The blob entry should have `size === 4` and `name === 'filename.blob'`.
5. Reading the blob's `arrayBuffer` should match the original `Uint8Array([0, 1, 2, 3])`.
6. For multiple files: `filelist` should have 3 entries (1 string + 2 blobs).
7. Each blob entry should have the correct size (4 and 2 bytes respectively).
8. For two independent FormData with same keys: each should maintain separate entries.
9. `formDataA2.get('greeting')` should be `'hello'` and `formDataB2.get('greeting')` should be `'hi'`.
10. File names SHOULD pass through in the client-to-server direction (unlike server-to-client where they are stripped for security).
11. `Array.from(formData2).length` should match the total number of entries.
