# Serialization of Special Objects

## Category
flight

## Description
Validates that the Flight protocol correctly serializes and deserializes special browser/platform objects: FormData (including Blob and File entries), Blob, File, TypedArrays (Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array), DataView, and ArrayBuffer. These types are commonly used in file uploads, binary data processing, and form handling.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("should be able to serialize any kind of typed array", "should be able to serialize a blob", "can transport FormData (blobs)")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReplyEdge-test.js` ("should be able to serialize any kind of typed array", "should be able to serialize a blob", "can transport FormData (blobs)")

## App Setup
```jsx
function App() {
  const buffer = new Uint8Array([
    123, 4, 10, 5, 100, 255, 244, 45, 56, 67, 43, 124, 67, 89, 100, 20,
  ]).buffer;

  const typedArrays = {
    arrayBuffer: buffer,
    int8: new Int8Array(buffer, 1),
    uint8: new Uint8Array(buffer, 2),
    uint8Clamped: new Uint8ClampedArray(buffer, 2),
    int16: new Int16Array(buffer, 2),
    uint16: new Uint16Array(buffer, 2),
    int32: new Int32Array(buffer, 4),
    uint32: new Uint32Array(buffer, 4),
    float32: new Float32Array(buffer, 4),
    float64: new Float64Array(buffer, 0),
    bigInt64: new BigInt64Array(buffer, 0),
    bigUint64: new BigUint64Array(buffer, 0),
    dataView: new DataView(buffer, 3),
  };

  const bytes = new Uint8Array([123, 4, 10, 5, 100, 255, 244, 45]);
  const blob = new Blob([bytes, bytes], { type: 'application/x-test' });

  const formData = new FormData();
  formData.append('greeting', 'hello');
  formData.append('file', blob, 'filename.test');

  return { typedArrays, blob, formData };
}
```

## Load Sequence
1. Server renders the model using `renderToReadableStream`.
2. The Flight serializer encodes binary data:
   - `ArrayBuffer` and TypedArrays are encoded as binary chunks with type tags identifying the specific typed array type and byte offset.
   - `Blob` is streamed as binary data with its MIME type preserved.
   - `FormData` entries are serialized, with string values as-is and Blob/File entries as binary chunks.
   - `DataView` is encoded similarly to typed arrays with its byte offset.
3. Binary data is embedded in the Flight stream as separate binary row entries.
4. Client deserializes the stream, reconstructing typed array views, Blobs, and FormData objects.

## Actions
1. Create the model with all special object types on the server.
2. Serialize to a Flight stream.
3. Deserialize on the client.
4. Verify each object type, size, and contents.

## Assertions
1. Each typed array should be the correct type (e.g., `result.int8 instanceof Int8Array`).
2. Each typed array should have the same byte contents as the original.
3. Byte offsets should be preserved (e.g., `Int8Array(buffer, 1)` starts at offset 1).
4. `blob` should be an instance of `Blob` with `size === 16` (8 bytes * 2).
5. `await blob.arrayBuffer()` should match the original blob's contents.
6. `formData` should be an instance of `FormData`.
7. `formData.get('greeting')` should equal `'hello'`.
8. The file entry in `formData` should be a `Blob` with the correct size.
9. For security, file names should NOT pass through from server to client (the name becomes `'blob'`).
10. `DataView` should be an instance of `DataView` with the correct byte offset.
