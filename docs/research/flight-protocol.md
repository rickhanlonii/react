# Research: RSC Flight Wire Protocol

## Overview

The React Server Components (RSC) Flight protocol is a streaming wire format that serializes React component trees from a server to a client. It encodes React elements, module references, errors, resource hints, streams, and typed arrays into a binary/text stream of rows. The client parses these rows incrementally, resolving them into a React element tree that can be rendered.

## Wire Format Specification

### Row Structure

Each row in the Flight stream follows one of two formats depending on the row type:

**Newline-delimited rows** (most row types):
```
<id>:<tag><payload>\n
```

**Length-prefixed rows** (binary data and text):
```
<id>:<tag><length>,<binary payload>
```

- **`<id>`**: Row ID encoded as a hexadecimal number. IDs are used to reference data from other rows (e.g., a model row can reference another row by its ID). Row 0 is the root.
- **`:`**: Literal colon separator between ID and tag.
- **`<tag>`**: A single ASCII character identifying the row type.
- **`<payload>`**: Row-type-specific content (usually JSON for model rows).
- **`\n`**: Newline delimiter (0x0A) for newline-delimited rows.
- **`<length>`**: For length-prefixed rows, the byte length of the binary payload encoded as hexadecimal, followed by a comma.

### Row ID Encoding

Row IDs are encoded in hexadecimal (base 16). The parser reads hex digits character by character until it encounters the `:` separator. The parsing uses: `rowID = (rowID << 4) | (byte > 96 ? byte - 87 : byte - 48)`, which handles both lowercase hex letters (a-f) and digits (0-9).

### Row Types

#### Production Row Types

| Tag | Name | Delimiter | Description |
|-----|------|-----------|-------------|
| _(none)_ | Model | `\n` | Default row type. JSON-encoded React element tree or value. When no tag byte is recognized as a known tag, the row is treated as a model. Starts with `"`, `{`, `[`, `t` (true), `f` (false), `n` (null), or `0`-`9`. |
| `I` | Module/Import | `\n` | Client module reference (ClientReferenceMetadata). Tells the client to load a client component module. |
| `H` | Hint | `\n` | Resource hint (preload, prefetch DNS, preconnect, etc.). The first character after `H` is the hint code (e.g., `D` = prefetchDNS, `C` = preconnect, `L` = preload, `m` = preloadModule, `X` = preinitScript, `S` = preinitStyle, `M` = preinitModuleScript). No row ID is used (always `:H`). |
| `E` | Error | `\n` | Error that occurred during server rendering. JSON with `{digest}` in production, `{digest, name, message, stack, env, owner}` in development. |
| `T` | Text | length | Plain text string. Length-prefixed binary format. |
| `R` | ReadableStream (start) | `\n` | Starts a ReadableStream. Subsequent model rows with the same ID add chunks to the stream. |
| `r` | ReadableStream bytes (start) | `\n` | Starts a byte-mode ReadableStream (BYOB). Binary chunks with tag `b` are sent for data. |
| `X` | AsyncIterable (start) | `\n` | Starts a multi-shot async iterable (can be iterated multiple times). |
| `x` | AsyncIterator (start) | `\n` | Starts a single-shot async iterator. |
| `C` | Close stream | `\n` | Closes a previously started stream/iterable by ID. Payload is the final value (or empty for undefined). |
| `A` | ArrayBuffer | length | ArrayBuffer binary data. |
| `O` | Int8Array | length | Typed array: Int8Array. |
| `o` | Uint8Array | length | Typed array: Uint8Array (also used for byte stream chunks). |
| `b` | Byte stream chunk | length | Uint8Array chunk for a byte-mode ReadableStream. |
| `U` | Uint8ClampedArray | length | Typed array: Uint8ClampedArray. |
| `S` | Int16Array | length | Typed array: Int16Array. |
| `s` | Uint16Array | length | Typed array: Uint16Array. |
| `L` | Int32Array | length | Typed array: Int32Array. |
| `l` | Uint32Array | length | Typed array: Uint32Array. |
| `G` | Float32Array | length | Typed array: Float32Array. |
| `g` | Float64Array | length | Typed array: Float64Array. |
| `M` | BigInt64Array | length | Typed array: BigInt64Array. |
| `m` | BigUint64Array | length | Typed array: BigUint64Array. |
| `V` | DataView | length | DataView over an ArrayBuffer. |

#### Development-Only Row Types

| Tag | Name | Delimiter | Description |
|-----|------|-----------|-------------|
| `D` | Debug | `\n` | Debug info (ReactComponentInfo, stack traces, environment info). DEV-only. |
| `W` | Console | `\n` | Console log replay entry. DEV-only. |
| `N` | Time origin | `\n` | Performance time origin for profiling. Row payload is a numeric timestamp. |
| `J` | IO Info | `\n` | Async I/O information for the profiler/debugger. |
| _(empty)_ | Halt | `\n` | Empty payload signals that this chunk will never resolve (DEV-only). |

### Model JSON Encoding

Model rows contain JSON with a custom reviver. Within JSON values, strings starting with `$` have special meanings:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `$` (alone) | `REACT_ELEMENT_TYPE` symbol | Used as the first element of a React element tuple |
| `$$` | Escaped `$` in a string literal | `"$$hello"` becomes `"$hello"` |
| `$L<hex>` | Lazy reference to chunk by ID | `"$L1a"` = lazy wrapper around chunk 0x1a |
| `$@<hex>` | Promise reference to chunk by ID | `"$@3"` = promise for chunk 3 |
| `$S<name>` | Symbol (`Symbol.for(name)`) | `"$Sreact.fragment"` |
| `$h<ref>` | Server reference | Points to a server function |
| `$T<ref>` | Temporary reference | For round-tripping references |
| `$Q<ref>` | Map | Reference to a Map's entries |
| `$W<ref>` | Set | Reference to a Set's entries |
| `$B<ref>` | Blob | Reference to blob data |
| `$K<ref>` | FormData | Reference to FormData entries |
| `$Z<ref>` | Error object | DEV-only, inline error reference |
| `$i<ref>` | Iterator | Extracts iterator from an iterable |
| `$I` | `Infinity` | |
| `$-0` | Negative zero | |
| `$-Infinity` | `-Infinity` | |
| `$N` | `NaN` | |
| `$u` | `undefined` | |
| `$D<isodate>` | Date | `"$D2024-01-01T00:00:00.000Z"` |
| `$n<digits>` | BigInt | `"$n12345"` |
| `$E<code>` | Eval (DEV-only) | Code to eval for debug functions |
| `$P<ref>` | Constructor (DEV-only) | Apply constructor to value |
| `$Y` | Omitted (DEV-only) | Omitted prop placeholder |
| `$<hex>` | Outlined model reference | Default: reference to another chunk by hex ID |

### React Element Encoding

React elements are encoded as JSON arrays (tuples):
```
[$$typeof, type, key, props]
```
In development builds, two additional entries are appended:
```
[$$typeof, type, key, props, owner, debugStack]
```

Where:
- `$$typeof` is `"$"` (which resolves to `REACT_ELEMENT_TYPE`)
- `type` is either a string (intrinsic like `"div"`) or a reference (client component module `"$L<id>"`, lazy `"$L<id>"`, etc.)
- `key` is the element key or `null`
- `props` is an object of props

### Server-Side Row Emission

The server emits rows with this format from `serializeRowHeader`:
```javascript
function serializeRowHeader(tag, id) {
  return id.toString(16) + ':' + tag;
}
```

So the final row for a model chunk is: `<hex-id>:<json>\n`
For a tagged row: `<hex-id>:<tag><json>\n`
For a hint (no ID): `:H<code><json>\n`

### Stream Lifecycle

Streams (ReadableStream and AsyncIterable) follow a lifecycle:

1. **Start**: A row with tag `R`/`r`/`X`/`x` begins the stream for a given ID.
2. **Data**: Subsequent rows with the *same ID* provide data chunks. For regular streams, these are model rows. For byte streams, these are `b`-tagged binary rows.
3. **Close**: A `C`-tagged row with the stream's ID signals completion. The payload is the final value (or empty string for `undefined`).
4. **Error**: An `E`-tagged row with the stream's ID signals an error.

## Client Config Interface

The Flight client is initialized by passing a config object. The following table shows every function the config must provide.

### Required Config Functions

| Function | Noop Implementation | Purpose |
|----------|-------------------|---------|
| `createStringDecoder()` | `return new TextDecoder()` | Creates a decoder for converting binary chunks to strings. |
| `readPartialStringChunk(decoder, buffer)` | `decoder.decode(buffer, {stream: true})` | Decodes a partial binary chunk to string (more data coming). |
| `readFinalStringChunk(decoder, buffer)` | `decoder.decode(buffer)` | Decodes the final binary chunk to string (stream complete). |
| `resolveClientReference(bundlerConfig, metadata)` | `return metadata` (noop: `return idx`) | Resolves client reference metadata (from `I` rows) into a client reference that can be preloaded/required. ESM: creates `{specifier, name}` from base URL + metadata. |
| `resolveServerReference(config, id)` | _(not in noop, but required)_ | Resolves a server reference ID into a callable reference. ESM: parses `url#export` format. |
| `preloadModule(clientRef)` | `return undefined` (noop: no-op) | Starts async loading of a client module. Returns a Thenable if async, null if already loaded. ESM: uses dynamic `import()`. |
| `requireModule(clientRef)` | `return readModule(idx)` | Synchronously requires an already-loaded module. Must return the module export. ESM: reads from cache. |
| `prepareDestinationForModule(moduleLoading, nonce, metadata)` | No-op | Prepares the environment for a module (e.g., inject script tags in browser). ESM browser: no-op. |
| `dispatchHint(code, model)` | _(not in noop config)_ | Handles resource hints (`H` rows). DOM: dispatches to ReactDOM dispatcher (prefetchDNS, preconnect, preload, etc.). For native: can be a no-op. |
| `bindToConsole(methodName, args, badgeName)` | `Function.prototype.bind.apply(console[methodName], [console].concat(args))` | Creates a bound console method for replaying server console logs. |
| `checkEvalAvailabilityOnceDev()` | Tries `(0, eval)('null')`, warns if unavailable | DEV-only: checks if eval is available for stack reconstruction. |

### Config Type Declarations

| Type | Noop Type | Purpose |
|------|-----------|---------|
| `ModuleLoading` | `null` | Configuration for module loading system. |
| `ServerConsumerModuleMap` | `null` | Bundler config passed to `createResponse`. Maps module references. ESM: string (base URL). |
| `ServerManifest` | `null` | Server reference config. ESM: string (base URL). |
| `ServerReferenceId` | `string` | ID format for server references. |
| `ClientReferenceMetadata` | `string` (noop) / `[path, exportName]` (ESM) | Metadata from `I` rows identifying a client component. |
| `ClientReference<T>` | `string` (noop) / `{specifier, name}` (ESM) | Resolved reference to a client component module. |
| `StringDecoder` | `TextDecoder` | Decoder instance for binary-to-string conversion. |

### Additional Exports Referenced

| Export | Purpose |
|--------|---------|
| `getModuleDebugInfo(clientRef)` | DEV-only: Returns debug info (ReactDebugInfo) for a client module reference. |
| `rendererVersion` | Version string of the renderer. |
| `rendererPackageName` | Package name of the renderer. |
| `usedWithSSR` | Boolean, always `true` for custom configs. |

## Data Flow

```
                         Network (HTTP/WebSocket)
                                |
                                v
                    Raw bytes (Uint8Array chunks)
                                |
                                v
                  +---------------------------+
                  | processBinaryChunk()      |
                  |   State machine parser    |
                  |   Parses: ID : Tag Data   |
                  +---------------------------+
                                |
                    +-----------+-----------+
                    |           |           |
                    v           v           v
              Text rows    Binary rows   Tag dispatch
           (newline-delim) (length-prefix)
                    |           |           |
                    v           v           v
           +----------------+  |  +------------------+
           | processFullStr |  |  | processFullBinary|
           | ingRow()       |  |  | Row()            |
           +----------------+  |  +------------------+
                    |          |
                    v          v
         +---------------------------------------------+
         | Row type dispatch (switch on tag byte)       |
         |                                              |
         | (none) -> resolveModel()     -- JSON data    |
         | I      -> resolveModule()    -- client ref   |
         | H      -> resolveHint()      -- resource     |
         | E      -> resolveErrorModel()-- error        |
         | T      -> resolveText()      -- text string  |
         | R/r    -> startReadableStream()              |
         | X/x    -> startAsyncIterable()               |
         | C      -> stopStream()       -- close stream |
         | D      -> resolveDebugModel()-- DEV debug    |
         | W      -> resolveConsoleEntry()-- DEV logs   |
         | A,O,o..-> resolveBuffer/TypedArray()         |
         +---------------------------------------------+
                    |
                    v
         +---------------------------------------------+
         | Chunk resolution                             |
         |                                              |
         | Model chunks: JSON.parse with custom reviver |
         |   - $-prefixed strings resolve references    |
         |   - Arrays become React elements             |
         |   - References to other chunks create lazy   |
         |     wrappers or promises                     |
         |                                              |
         | Module chunks: resolveClientReference() ->   |
         |   preloadModule() -> requireModule()         |
         +---------------------------------------------+
                    |
                    v
         +---------------------------------------------+
         | React element tree                           |
         |   Chunks become Thenable/Promise-like        |
         |   objects. Root chunk (ID 0) returned via    |
         |   getRoot(). React renders using             |
         |   Suspense to wait for pending chunks.       |
         +---------------------------------------------+
                    |
                    v
            Custom React Renderer
```

### Detailed Parse Flow

1. **Binary input**: `processBinaryChunk()` receives `Uint8Array` chunks from the network. It maintains a state machine (`ROW_ID`, `ROW_TAG`, `ROW_LENGTH`, `ROW_CHUNK_BY_NEWLINE`, `ROW_CHUNK_BY_LENGTH`) across calls.

2. **Row parsing**: The state machine reads hex digits for the row ID until `:`, then determines the tag. Tags that indicate binary content (`T`, `A`, `O`, `o`, `b`, `U`, `S`, `s`, `L`, `l`, `G`, `g`, `M`, `m`, `V`) switch to length-prefixed mode. All others use newline-delimited mode.

3. **String conversion**: For non-binary rows, accumulated `Uint8Array` buffers are decoded to strings via `readPartialStringChunk`/`readFinalStringChunk` (TextDecoder).

4. **Tag dispatch**: `processFullStringRow()` dispatches to the appropriate resolver based on the tag byte.

5. **Model resolution**: `resolveModel()` stores the JSON string in a chunk. When the chunk is read (lazily), `initializeModelChunk()` calls `JSON.parse()` with a custom reviver (`_fromJSON`) that interprets `$`-prefixed strings as references to other chunks, special values, or React elements.

6. **Module resolution**: `resolveModule()` parses the JSON metadata, calls `resolveClientReference()` to get a client reference, then `preloadModule()` to start async loading. When the module is needed, `requireModule()` returns the export.

7. **Chunk lifecycle**: Chunks progress through states: `pending` -> `resolved_model`/`resolved_module` -> `blocked` (during initialization, may have dependencies) -> `fulfilled` (initialized with value) or `rejected` (errored).

## Key Considerations for Native

### No DOM
- `dispatchHint()` is DOM-specific (prefetchDNS, preconnect, preload stylesheets/scripts). For native, this should be a no-op or could be adapted for native resource prefetching.
- `prepareDestinationForModule()` is used for DOM script injection. For native, this should be a no-op.

### No Bundler
- `resolveClientReference()` needs a native-appropriate strategy. Since there is no webpack/turbopack, the simplest approach (like ESM) maps metadata to module specifiers.
- `preloadModule()` and `requireModule()` must work with whatever module system the native JS engine uses. Options include: pre-bundled modules, dynamic `import()` (if supported by the JS engine), or a custom module registry.
- `ClientReferenceMetadata` format depends on the server's Flight server config. When using Next.js as the server, the metadata format will match whatever Next.js emits (webpack or turbopack format).

### String Decoding
- `TextDecoder` is available in JavaScriptCore and Hermes, so the noop implementation works directly.
- The binary parsing (`processBinaryChunk`) works with raw `Uint8Array` and does not depend on any browser APIs.

### Module Resolution Strategy for Native
Since we control both the server (Next.js) and client (native app), we have options:

1. **Pre-bundle all client components**: Ship a single JS bundle containing all client components. The module map on the server maps component IDs to exports within this bundle. `resolveClientReference` maps IDs to the pre-registered exports. `preloadModule` is a no-op (already loaded). `requireModule` does a synchronous lookup.

2. **Dynamic loading**: Fetch client component bundles on demand. `resolveClientReference` builds a URL. `preloadModule` fetches the bundle. `requireModule` returns the loaded module.

Option 1 is simpler and recommended for the initial implementation.

### Server Reference Handling
Server references (`$h` prefix in JSON) represent server functions that can be called from the client (Server Actions). For native:
- `resolveServerReference(config, id)` parses the ID to get the server function endpoint.
- Calling the reference sends a request back to the server with serialized arguments.
- The `callServer` callback passed to `createResponse` handles the actual network request.

### Entry Points

The Flight client exposes these key functions:
- `createResponse(bundlerConfig, serverReferenceConfig, moduleLoading, callServer, ...)` - creates a response state object
- `createStreamState(response, debugValue)` - creates parser state for a stream
- `processBinaryChunk(response, streamState, chunk)` - feeds binary data into the parser
- `processStringChunk(response, streamState, chunk)` - feeds string data (must match original server chunking)
- `getRoot(response)` - returns a Thenable for the root element (chunk 0)
- `close(response)` - signals the stream is complete
- `reportGlobalError(response, error)` - signals a transport-level error

### Usage Pattern (from noop renderer)

```javascript
const {createResponse, createStreamState, processBinaryChunk, getRoot, close} =
  ReactFlightClient({
    createStringDecoder() { return new TextDecoder(); },
    readPartialStringChunk(decoder, buffer) {
      return decoder.decode(buffer, {stream: true});
    },
    readFinalStringChunk(decoder, buffer) {
      return decoder.decode(buffer);
    },
    resolveClientReference(bundlerConfig, idx) { return idx; },
    prepareDestinationForModule(moduleLoading, metadata) {},
    preloadModule(idx) {},
    requireModule(idx) { return readModule(idx); },
    bindToConsole(methodName, args, badgeName) {
      return Function.prototype.bind.apply(
        console[methodName], [console].concat(args)
      );
    },
    checkEvalAvailabilityOnceDev,
  });

// Usage:
const response = createResponse(source, null, null, ...);
const streamState = createStreamState(response, source);
for (const chunk of binaryChunks) {
  processBinaryChunk(response, streamState, chunk, 0);
}
close(response);
const root = getRoot(response); // Thenable<ReactElement>
```

### Example Wire Format

A simple server-rendered `<div><span>Hello</span></div>`:

```
0:["$","div",null,{"children":["$","span",null,{"children":"Hello"}]}]
```

With a client component reference:
```
1:I["./components/Button.js","Button"]
0:["$","div",null,{"children":["$L1",null,{"label":"Click me"}]}]
```

Row 1 defines a module import. Row 0's model references it via `$L1` (lazy chunk 1). When chunk 1 is initialized, it loads the `Button` component from `./components/Button.js`.

With streaming:
```
0:["$","div",null,{"children":"$L1"}]
2:R
2:["$","p",null,{"children":"Loading..."}]
2:["$","p",null,{"children":"More data"}]
2:C
1:["$","section",null,{"children":"$@2"}]
```

With an error:
```
1:E{"digest":"SOME_DIGEST","message":"Something went wrong","stack":[]}
```

## Source Files Studied

- `/Users/rickhanlonii/oss/react/packages/react-client/src/forks/ReactFlightClientConfig.custom.js` - Client config interface (13 exports + types)
- `/Users/rickhanlonii/oss/react/packages/react-noop-renderer/src/ReactNoopFlightClient.js` - Minimal Flight client implementation
- `/Users/rickhanlonii/oss/react/packages/react-client/src/ReactFlightClient.js` - Full Flight client (5263 lines): parser, chunk management, JSON reviver
- `/Users/rickhanlonii/oss/react/packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` - ESM bundler config reference
- `/Users/rickhanlonii/oss/react/packages/react-server-dom-esm/src/client/ReactFlightDOMClientBrowser.js` - ESM browser entry point (createFromFetch, createFromReadableStream)
- `/Users/rickhanlonii/oss/react/packages/react-server/src/ReactFlightServer.js` - Server-side row emission
- `/Users/rickhanlonii/oss/react/packages/react-dom-bindings/src/shared/ReactFlightClientConfigDOM.js` - DOM dispatchHint implementation
