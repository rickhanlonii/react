# Research: Next.js Flight Format

## Overview

Next.js App Router uses React's Flight protocol (RSC wire format) to stream server-rendered component trees to the client. This document covers the HTTP conventions, wire format, streaming behavior, client reference encoding, and server action invocation as implemented by Next.js, along with what differs from raw React Flight.

---

## 1. HTTP Request Format (Client to Server)

### RSC Navigation Request

When the Next.js client-side router navigates to a new page, it sends a `GET` request to the same URL with special headers:

```http
GET /some-page?_rsc=xxxxx HTTP/1.1
Host: localhost:3000
RSC: 1
Next-Router-State-Tree: <JSON-encoded router state>
Next-URL: /some-page
Accept: */*
```

**Required headers:**

| Header | Value | Purpose |
|--------|-------|---------|
| `RSC` (lowercase: `rsc`) | `1` | Tells Next.js to return a Flight response instead of HTML |
| `Next-Router-State-Tree` | JSON string | Current client-side router tree state, used for diffing |
| `Next-URL` | URL path | Current URL for interception route matching |

**Optional headers:**

| Header | Value | Purpose |
|--------|-------|---------|
| `Next-Router-Prefetch` | `1` | Indicates this is a prefetch request (partial response) |
| `Next-Router-Segment-Prefetch` | segment path | Per-segment prefetching |
| `Next-HMR-Refresh` | `1` | Dev-only: HMR refresh request |
| `x-deployment-id` | deployment ID | For deployment-specific routing |

**Cache busting:** Next.js appends a `_rsc` query parameter (value of `NEXT_RSC_UNION_QUERY`) to the URL as a cache buster. This parameter is stripped from the response URL before being used internally.

### Server Action Request

Server actions are invoked via `POST` to the current page URL:

```http
POST /some-page HTTP/1.1
Host: localhost:3000
Accept: text/x-component
Next-Action: <action-id>
Next-Router-State-Tree: <JSON-encoded router state>
Next-URL: /some-page
Content-Type: multipart/form-data; boundary=...
```

**Headers specific to server actions:**

| Header | Value | Purpose |
|--------|-------|---------|
| `Accept` | `text/x-component` | Expects Flight response back |
| `Next-Action` | action ID string | Identifies which server action to invoke |

**Request body:** The action arguments are encoded using React's `encodeReply()` function from `react-server-dom-webpack/client`. This produces either:
- A `string` (for simple arguments)
- A `FormData` (for complex arguments including files)

The body includes temporary references for objects that can't be serialized (like DOM elements, functions passed as props).

---

## 2. HTTP Response Format (Server to Client)

### Content-Type

```
Content-Type: text/x-component
```

This is defined as `RSC_CONTENT_TYPE_HEADER` in Next.js source. The client checks that the response starts with this content type to determine if it's a valid Flight response.

### Response Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Type` | `text/x-component` | Flight response identifier |
| `Transfer-Encoding` | `chunked` | Streaming response |
| `Vary` | includes `Next-URL` | If the route was intercepted |
| `x-nextjs-stale-time` | seconds | Cache staleness duration |
| `x-nextjs-postponed` | `1` | PPR: indicates postponed content |
| `x-nextjs-prerender` | `1` | Indicates this was a prerendered response |

**Server action response headers (additional):**

| Header | Value | Purpose |
|--------|-------|---------|
| `x-action-redirect` | `url;type` | Redirect location and type (push/replace) |
| `x-action-revalidated` | JSON number | Revalidation kind (0=none, 1=dynamic, 2=static+dynamic) |
| `x-nextjs-action-not-found` | `1` | Action ID was not found on the server |

### Streaming

Flight responses use **chunked transfer encoding**. The response is a `ReadableStream` of `Uint8Array` chunks. The client reads chunks progressively using the ReadableStream API:

```js
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  processBinaryChunk(response, streamState, value);
}
```

---

## 3. Flight Wire Format (Row Protocol)

The Flight response is a sequence of **rows**, where each row is a self-contained instruction. Rows are delimited by newlines (`\n`) for text-based rows, or by a length prefix for binary rows.

### Row Structure

```
<id>:<tag><payload>\n
```

- **id**: Hex-encoded integer (the chunk ID), parsed with `(rowID << 4) | hexDigit`
- **`:` separator**: Separates the ID from the tag
- **tag**: Single ASCII character indicating the row type
- **payload**: JSON or binary data
- **`\n` terminator**: For text-based rows; binary rows use length-prefixed format instead

### Row Format Details

**Text-delimited rows** (terminated by `\n`):
```
<hex-id>:<tag><json-payload>\n
```

**Length-delimited rows** (for binary data like typed arrays):
```
<hex-id>:<tag><hex-length>,<binary-data>
```

The parser reads the hex ID, then checks the tag byte:
- Tags `T`, `A`, `O`, `o`, `b`, `U`, `S`, `s`, `L`, `l`, `G`, `g`, `M`, `m`, `V` use **length-prefix** format
- Tags `A`-`Z` (uppercase), `#`, `r`, `x` use **newline-delimited** format
- Anything else (digits, `[`, `{`, `"`, `t`, `f`, `n`) is treated as a **model row** (JSON) with no explicit tag

### Row Types

#### Production Row Types

| Tag | Name | Payload | Description |
|-----|------|---------|-------------|
| (none) | Model | JSON | The primary data row. Contains serialized React elements, props, arrays, objects. Row `0` is the root. |
| `I` | Import/Module | `[id, chunks, name]` or `[id, chunks, name, 1]` | Client component reference. Tells client to load a JS module. The `1` flag means async import. |
| `H` | Hint | `<code><json>` | Resource hints (preload stylesheets, scripts, fonts). Code is a single char: `S`=stylesheet, `X`=script, etc. |
| `E` | Error | `{"digest": "..."}` (prod) or `{"digest","name","message","stack","env","owner"}` (dev) | Error for a chunk that failed to resolve. |
| `T` | Text | string (length-prefixed) | A large text value, stored separately. |
| `R` | ReadableStream | (empty) | Starts a ReadableStream. Subsequent model/text/buffer rows with same ID feed the stream. |
| `r` | ReadableStream (bytes) | (empty) | Starts a byte-mode ReadableStream. |
| `X` | AsyncIterable | (empty) | Starts an async iterable. |
| `x` | AsyncIterable (return) | (empty) | Starts an async iterable that supports return. |
| `C` | Close/Complete | JSON | Closes a stream or async iterable. |
| `b` | Binary buffer | binary (length-prefixed) | Raw binary data chunk for a stream. |
| `A` | ArrayBuffer | binary (length-prefixed) | ArrayBuffer value. |
| `o` | Uint8Array | binary (length-prefixed) | Uint8Array value. |
| `O`, `U`, `S`, `s`, `L`, `l`, `G`, `g`, `M`, `m`, `V` | TypedArrays | binary (length-prefixed) | Int8Array, Uint8ClampedArray, Int16/Uint16, Int32/Uint32, Float32/Float64, BigInt64/BigUint64, DataView |

#### Dev-Only Row Types

| Tag | Name | Payload | Description |
|-----|------|---------|-------------|
| `D` | Debug | JSON | Debug information (component info, stack traces, environment names) |
| `W` | Console | JSON | Replayed console.log/warn/error from server |
| `N` | TimeOrigin | number | Time origin for performance tracking |
| `J` | IOInfo | JSON | I/O timing information for profiler |

### Example: Model Row

```
0:["$","div",null,{"children":["$","p",null,{"children":"Hello World"}]}]
```

Breakdown:
- `0` = chunk ID 0 (the root)
- `:` = separator
- (no tag letter) = this is a model row (JSON)
- `["$","div",null,{...}]` = a React element tuple

### Example: Import Row

```
1:I["(app-pages-browser)/./components/SearchInput.tsx",["static/chunks/app/page-abc123.js","static/chunks/123-def456.js"],"SearchInput"]
```

Breakdown:
- `1` = chunk ID
- `I` = Import row
- `["module-id", ["chunk-file-1", "chunk-file-2"], "export-name"]` = client reference metadata

### Example: Hint Row

```
0:HS["/_next/static/css/app/layout.css","crossOrigin",""]
```

Breakdown:
- `0` = chunk ID (always 0 for hints, since they go to the global `id:0` bucket)
- `H` = Hint row
- `S` = Stylesheet hint code
- `["/_next/static/css/app/layout.css","crossOrigin",""]` = hint data

---

## 4. JSON Model Value Encoding

Within model rows, React uses a custom JSON encoding with `$` prefixes for special values:

### Reference Types (in JSON string values)

| Pattern | Meaning | Example |
|---------|---------|---------|
| `"$"` | `REACT_ELEMENT_TYPE` marker | Used as first element in element tuples |
| `"$$..."` | Escaped `$` string | Literal string starting with `$` |
| `"$L<hex>"` | Lazy reference | `"$L3"` = lazy chunk #3 |
| `"$<hex>"` | Outline reference | `"$5"` = reference to chunk #5 |
| `"$@<hex>"` | Promise reference | `"$@2"` = promise from chunk #2 |
| `"$S<name>"` | Symbol | `"$Sreact.fragment"` = `Symbol.for('react.fragment')` |
| `"$h<hex>"` | Server reference | `"$h4"` = server function bound at chunk #4 |
| `"$T<id>"` | Temporary reference | Back-reference to client-held object |
| `"$Q<hex>"` | Map | `"$Q3"` = Map from chunk #3 |
| `"$W<hex>"` | Set | `"$W3"` = Set from chunk #3 |
| `"$B<hex>"` | Blob | `"$B3"` = Blob from chunk #3 |
| `"$K<hex>"` | FormData | `"$K3"` = FormData from chunk #3 |
| `"$Z<hex>"` | Error (dev) | `"$Z3"` = Error from chunk #3 |
| `"$i<hex>"` | Iterator | `"$i3"` = iterator from chunk #3 |

### Special Value Types

| Pattern | Meaning |
|---------|---------|
| `"$undefined"` | `undefined` |
| `"$Infinity"` | `Infinity` |
| `"$-Infinity"` | `-Infinity` |
| `"$NaN"` | `NaN` |
| `"$-0"` | `-0` |
| `"$D<iso>"` | Date | `"$D2024-01-15T00:00:00.000Z"` |
| `"$n<digits>"` | BigInt | `"$n12345"` |

### React Element Tuple Format

Elements are encoded as arrays where the first element is `"$"` (the REACT_ELEMENT_TYPE symbol):

```json
["$", "div", null, {"className": "foo", "children": "Hello"}]
```

Format: `[$$type, type, key, props]`
- In dev mode, two additional entries: `[$$type, type, key, props, owner, debugStack]`

---

## 5. Next.js-Specific Response Envelope

Next.js wraps the Flight payload in a response object with specific keys:

### Navigation Response

```js
{
  b: "build-id-string",           // Build ID for cache validation
  f: <flight-data>,               // The actual RSC tree diff data
  q: "?search=params",            // Rendered search params (or null)
  i: true/false,                  // Whether the route could be intercepted
  S: true/false                   // Whether this was a static/prerendered response
}
```

### Server Action Response

```js
{
  a: <action-result>,             // The return value of the server action
  f: <flight-data>,               // Updated RSC tree (for revalidation)
  b: "build-id-string",           // Build ID
  q: "?search=params",            // Rendered search params
  i: true/false                   // Interception flag
}
```

### Flight Data Structure

The `f` field (flight data) is either:
- An empty string `""` (no tree update needed)
- An array of flight data entries, each describing a segment update
- A string URL (signals an MPA redirect)

Each flight data entry contains the tree path, the router state diff, and the rendered RSC subtree for that segment.

---

## 6. Client Reference Format (Webpack / Turbopack)

### Webpack (production)

Client references are encoded as tuples in Import (`I`) rows:

```json
["<module-id>", ["<chunk-id-1>", "<chunk-filename-1>", "<chunk-id-2>", "<chunk-filename-2>"], "<export-name>"]
```

Or with async flag:
```json
["<module-id>", ["<chunk-id-1>", "<chunk-filename-1>"], "<export-name>", 1]
```

- **module-id**: Webpack module ID (string, e.g. `"(app-pages-browser)/./components/Button.tsx"`)
- **chunks**: Double-indexed array of `[chunkId, chunkFilename]` pairs
- **export-name**: The named export (e.g. `"default"`, `"SearchInput"`, `"*"` for namespace, `""` for default with ESM interop)
- **async flag**: `1` if this is an async import

### Turbopack (development)

Same tuple format, but:
- **module-id**: Turbopack module ID (path-based, e.g. `"[project]/components/Button.tsx [app-client] (ecmascript)"`)
- **chunks**: Array of chunk filenames (single-indexed, not double-indexed like Webpack)

### Module Loading

When the client receives an Import row:
1. `prepareDestinationForModule()` is called to start loading the chunk files
2. `preloadModule()` downloads and caches all required chunks
3. `requireModule()` synchronously accesses the loaded module and returns the named export

---

## 7. HTML-Inlined Flight (Initial Page Load)

On the initial page load, Next.js renders HTML and embeds the Flight payload inline using `<script>` tags:

```html
<script>
(self.__next_f=self.__next_f||[]).push([0])
</script>
<script>
self.__next_f.push([1,"0:[\"$\",\"div\",null,...]\n"])
</script>
<script>
self.__next_f.push([1,"1:I[\"module-id\",[\"chunk\"],\"name\"]\n"])
</script>
```

The `__next_f` array uses a type code for each entry:
- `[0]` = Bootstrap (initialize the Flight reader)
- `[1, "<flight-row-data>"]` = Flight row data (text string, may contain multiple rows)
- `[2, <form-state>]` = Form state (for server action progressive enhancement)
- `[3, "<base64>"]` = Binary Flight data encoded as base64 (for non-UTF8 data)

For subsequent navigations, the client sends a `GET` request with the `RSC: 1` header and receives a pure Flight stream (no HTML wrapping).

---

## 8. Streaming Behavior

### Chunked Response

The server uses `ReadableStream` with `type: 'bytes'` and `highWaterMark: 0`:

```js
const stream = new ReadableStream({
  type: 'bytes',
  start(controller) { startWork(request); },
  pull(controller) { startFlowing(request, controller); },
  cancel(reason) { stopFlowing(request); abort(request, reason); },
}, { highWaterMark: 0 });
```

The `highWaterMark: 0` means the server only produces data when the client pulls, implementing backpressure.

### Progressive Resolution

Rows arrive progressively. For example, a page with Suspense boundaries:

```
0:["$","html",null,{"children":["$","body",null,{"children":"$L1"}]}]
1:["$","div",null,{"children":["$L2","$L3"]}]
2:["$","header",null,{"children":"Loaded immediately"}]
```

Then, after an async operation completes:
```
3:["$","main",null,{"children":"Loaded after async"}]
```

Chunk ID `3` was referenced as `"$L3"` in row `1` (a lazy reference). When row `3` arrives, the lazy wrapper resolves and React re-renders to show the content.

---

## 9. Differences from Raw React Flight

| Aspect | Raw React Flight | Next.js Flight |
|--------|-----------------|----------------|
| **Triggering** | Custom (you call `renderToReadableStream()` directly) | `RSC: 1` header on any App Router URL |
| **Response wrapper** | None; the stream IS the Flight data | Wraps in `{b, f, q, i, S}` envelope |
| **Content-Type** | None specified (up to you) | `text/x-component` |
| **Router state** | Not applicable | `Next-Router-State-Tree` header enables tree diffing |
| **Client references** | Bundler-specific (webpack, turbopack, ESM) | Always webpack or turbopack format |
| **HTML inlining** | Not built-in | `self.__next_f.push()` script injection on initial load |
| **Server actions** | Via `decodeReply()` / `decodeAction()` | Via `Next-Action` header + `encodeReply()` body |
| **Cache busting** | Not built-in | `_rsc` query parameter |
| **Prefetching** | Not built-in | `Next-Router-Prefetch` header, partial responses, unclosing streams |
| **Build ID** | Not applicable | `b` field for cache invalidation across deployments |
| **Debug channel** | Optional WebSocket/stream | Dev-only `x-nextjs-request-id` header + WebSocket debug channel |
| **Segment prefetch** | Not built-in | `Next-Router-Segment-Prefetch` header for per-segment data |

---

## 10. What Our Native Client Needs

### To Fetch RSC Data from Next.js

**Request requirements:**
1. Send `GET` to the page URL with header `RSC: 1`
2. Include `Next-Router-State-Tree` header (can start with empty/minimal tree)
3. Optionally include `Next-URL` for interception route support
4. Read the response as a byte stream

**Response handling:**
1. Check `Content-Type` starts with `text/x-component`
2. Feed the response body bytes into a Flight client's `processBinaryChunk()`
3. Extract the root value, which is the Next.js envelope `{b, f, q, i, S}`
4. Use the `f` (flight data) field to get the actual React element tree
5. Compare `b` (build ID) to detect stale deployments

### To Invoke Server Actions

1. Encode arguments with `encodeReply()` (produces string or FormData)
2. Send `POST` to the current page URL
3. Include headers: `Accept: text/x-component`, `Next-Action: <action-id>`, `Next-Router-State-Tree`
4. Parse response as Flight stream
5. Extract `a` field for action return value, `f` field for tree updates

### Client Reference Resolution (Key Decision)

Our native client will NOT use webpack/turbopack module loading. Instead, we need a custom `resolveClientReference` and `requireModule` implementation that maps module IDs to pre-bundled native-compatible modules. Options:

1. **Pre-register all client components** in a manifest that maps module IDs to already-loaded modules
2. **Use the ESM approach** (like `react-server-dom-esm`) where module IDs are URLs that get `import()`-ed
3. **Custom bridge** that maps webpack module IDs to native-side component registrations

The Flight client config functions we must implement:

```js
createStringDecoder()           // TextDecoder for streaming
readPartialStringChunk()        // Decode partial UTF-8
readFinalStringChunk()          // Decode final UTF-8
resolveClientReference(config, metadata)  // Map module ID to reference
prepareDestinationForModule()   // Preload module (can be no-op)
preloadModule(ref)              // Start loading module
requireModule(ref)              // Synchronously get module export
dispatchHint(code, model)       // Handle resource hints (can be no-op for native)
bindToConsole()                 // Console replay
```

### Minimal Flight Client Setup

```js
import ReactFlightClient from 'react-client/flight';

const { createResponse, createStreamState, processBinaryChunk, getRoot, close } =
  ReactFlightClient({
    createStringDecoder: () => new TextDecoder(),
    readPartialStringChunk: (decoder, buffer) => decoder.decode(buffer, { stream: true }),
    readFinalStringChunk: (decoder, buffer) => decoder.decode(buffer),
    resolveClientReference: (config, metadata) => {
      // Map Next.js module ID to our registered component
      return config.modules[metadata[0] /* ID */];
    },
    prepareDestinationForModule: () => {},
    preloadModule: () => null,
    requireModule: (ref) => ref,  // Return the pre-registered component
    dispatchHint: () => {},
    bindToConsole: (methodName, args) =>
      Function.prototype.bind.apply(console[methodName], [console, ...args]),
  });
```

---

## 11. Source File References

| File | Purpose |
|------|---------|
| `react/packages/react-client/src/ReactFlightClient.js` | Core Flight client: row parsing, model resolution, chunk management |
| `react/packages/react-server/src/ReactFlightServer.js` | Core Flight server: row emission, serialization |
| `react/packages/react-server-dom-webpack/src/shared/ReactFlightImportMetadata.js` | Webpack import metadata format (tuple shape) |
| `react/packages/react-server-dom-turbopack/src/shared/ReactFlightImportMetadata.js` | Turbopack import metadata format |
| `react/packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` | ESM bundler config (simplest reference) |
| `react/packages/react-noop-renderer/src/ReactNoopFlightClient.js` | Minimal Flight client example |
| `react/packages/react-noop-renderer/src/ReactNoopFlightServer.js` | Minimal Flight server example |
| `next/dist/client/components/app-router-headers.js` | All Next.js header constants |
| `next/dist/client/components/router-reducer/fetch-server-response.js` | Client-side RSC fetch logic |
| `next/dist/client/components/router-reducer/reducers/server-action-reducer.js` | Server action invocation |
| `next/dist/server/app-render/use-flight-response.js` | Server-side Flight response handling + HTML inlining |
| `next/dist/server/app-render/flight-render-result.js` | FlightRenderResult with `text/x-component` content type |
| `next/dist/server/app-render/app-render.js` | Main app rendering: RSC payload generation |
