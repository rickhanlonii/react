# Spec: Flight Client for Native

## Overview

The Flight client consumes the RSC (React Server Components) wire protocol stream from a Next.js server and produces a React element tree for the native renderer. It uses a custom Flight client config with a pre-bundled module registry (per ADR 003).

> **Note:** This Flight client runs in standalone JavaScriptCore on iOS, not in a browser. Standard browser APIs (`fetch`, `ReadableStream`, `TextDecoder`) are not available. Networking and string decoding are provided via bridge functions. A custom `react-server-dom-native` package must be built, similar to how `react-server-dom-esm` provides an ESM-specific Flight integration in the React monorepo.

## Module

`packages/flight-client/src/index.js`

## Dependencies

- Custom `react-server-dom-native` Flight client config (built from `react-client/flight` internals — see [Package Structure](#package-structure) below)
- `packages/renderer/` — Custom renderer's `createRoot().render()`
- `packages/bridge/` — Network bridge (`$$fetch`) and string decoding

## Native Environment Constraints

JavaScriptCore on iOS (without a WebView) does **not** provide:

| Browser API | Status in JSC | Bridge Replacement |
|-------------|--------------|-------------------|
| `fetch()` | Not available | `$$fetch(url, headers, callback)` |
| `ReadableStream` | Not available | Callback-based chunked delivery |
| `TextDecoder` | Not available | `$$decodeUTF8(buffer)` or bundled polyfill |
| `Response` | Not available | N/A (not used directly) |

All networking goes through the `$$fetch` bridge function, which uses `URLSession` on the native side and delivers response chunks via callbacks.

## Package Structure

Since `react-client/flight` is internal to the React monorepo and not published as a standalone package, a custom `react-server-dom-native` package must be created:

```
packages/react-server-dom-native/
  src/
    ReactFlightClientConfigNative.js   — Flight client config (string decoding, module resolution)
    ReactFlightDOMClientNative.js      — createFromStream, createFromFetch entry points
  package.json
```

This mirrors the pattern used by `react-server-dom-esm` in the React monorepo. The client config implements the interface defined in `react-client/src/forks/ReactFlightClientConfig.custom.js`.

## Flight Client Config

```js
// ReactFlightClientConfigNative.js

export function createStringDecoder() {
  // TextDecoder is not available in standalone JSC.
  // Use bridge-provided UTF-8 decoding or a bundled polyfill.
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder();
  }
  // Fallback: bridge-provided decoder
  return { _isNative: true };
}

export function readPartialStringChunk(decoder, buffer) {
  if (decoder._isNative) {
    return $$decodeUTF8(buffer, /* stream */ true);
  }
  return decoder.decode(buffer, { stream: true });
}

export function readFinalStringChunk(decoder, buffer) {
  if (decoder._isNative) {
    return $$decodeUTF8(buffer, /* stream */ false);
  }
  return decoder.decode(buffer);
}

export function resolveClientReference(bundlerConfig, metadata) {
  // metadata format from Next.js webpack: [moduleId, chunks, exportName]
  const moduleId = metadata[0];
  const exportName = metadata[2];
  const entry = bundlerConfig.modules[moduleId];
  if (!entry) {
    if (__DEV__) {
      console.warn(`Unknown client module: ${moduleId}`);
    }
    return null;
  }
  return { module: entry, name: exportName };
}

export function resolveServerReference(config, id) {
  // Parse server reference ID: "url#exportName"
  const [url, exportName] = id.split('#');
  return { url, name: exportName || 'default' };
}

export function preloadModule(clientRef) {
  // No-op: all modules are pre-bundled
  return null;
}

export function requireModule(clientRef) {
  if (!clientRef) return null;
  const mod = clientRef.module;
  if (clientRef.name === 'default' || clientRef.name === '') {
    return mod.default || mod;
  }
  return mod[clientRef.name];
}

export function prepareDestinationForModule(moduleLoading, nonce, metadata) {
  // No-op: no script injection needed in native
}

export function dispatchHint(code, model) {
  // No-op: resource hints (preload, prefetch) are DOM-specific
}

export function bindToConsole(methodName, args, badgeName) {
  return Function.prototype.bind.apply(
    console[methodName],
    [console].concat(args)
  );
}
```

## Types

```ts
type ModuleLoading = null;
type ServerConsumerModuleMap = {
  modules: Record<string, any>;  // moduleId → module object
};
type ServerManifest = null;
type ServerReferenceId = string;
type ClientReferenceMetadata = [string, string[], string]; // [moduleId, chunks, exportName]
type ClientReference<T> = { module: any; name: string } | null;
type StringDecoder = TextDecoder | { _isNative: true };
```

## Public API

### `createFromStream(stream, options)`

Creates a Flight response from a bridge-provided stream. Primary entry point for consuming RSC data on native.

```js
export function createFromStream(stream, options = {}) {
  const { moduleMap, callServer } = options;
  const bundlerConfig = { modules: moduleMap || {} };

  const response = FlightClient.createResponse(
    bundlerConfig,
    null,       // serverReferenceConfig
    null,       // moduleLoading
    callServer, // callServer callback for server actions
    undefined,  // encodeFormAction
    undefined,  // nonce
    undefined,  // temporaryReferences
    __DEV__ ? undefined : undefined, // findSourceMapURL
    __DEV__,    // replayConsole
    __DEV__,    // environmentName
  );

  const streamState = FlightClient.createStreamState(response, null);

  // stream is a bridge-provided object with onChunk/onDone/onError callbacks
  stream.onChunk((chunk) => {
    FlightClient.processBinaryChunk(response, streamState, chunk, 0);
  });
  stream.onDone(() => {
    FlightClient.close(response);
  });
  stream.onError((error) => {
    FlightClient.reportGlobalError(response, error);
  });

  return FlightClient.getRoot(response);
}
```

### `createFromFetch(bridgeFetchPromise, options)`

Creates a Flight response from a bridge fetch. Wraps the bridge's callback-based `$$fetch` in a stream interface.

```js
export function createFromFetch(bridgeFetchPromise, options = {}) {
  const { moduleMap, callServer } = options;
  const bundlerConfig = { modules: moduleMap || {} };

  const response = FlightClient.createResponse(
    bundlerConfig,
    null,       // serverReferenceConfig
    null,       // moduleLoading
    callServer, // callServer callback for server actions
    undefined,  // encodeFormAction
    undefined,  // nonce
    undefined,  // temporaryReferences
    __DEV__ ? undefined : undefined, // findSourceMapURL
    __DEV__,    // replayConsole
    __DEV__,    // environmentName
  );

  const streamState = FlightClient.createStreamState(response, null);

  bridgeFetchPromise.then(
    (stream) => {
      stream.onChunk((chunk) => {
        FlightClient.processBinaryChunk(response, streamState, chunk, 0);
      });
      stream.onDone(() => {
        FlightClient.close(response);
      });
      stream.onError((error) => {
        FlightClient.reportGlobalError(response, error);
      });
    },
    (error) => {
      FlightClient.reportGlobalError(response, error);
    }
  );

  return FlightClient.getRoot(response);
}
```

## Network Layer

### Native Networking Bridge

Since `fetch()` is not available in standalone JSC, all HTTP requests go through the `$$fetch` bridge function, which uses `URLSession` on the native side.

#### `$$fetch(url, method, headers, body, callbacks)`

Bridge function registered on `JSContext` (see bridge-protocol spec). Performs an HTTP request via `URLSession` and delivers the response as streamed chunks.

**Parameters:**
- `url: string` — Request URL
- `method: string` — HTTP method ("GET" or "POST")
- `headers: object` — Request headers
- `body: string | null` — Request body (for POST)
- `callbacks: object` — `{ onResponse, onChunk, onDone, onError }`

**Callback signatures:**
- `onResponse(statusCode, headers)` — Called when response headers arrive
- `onChunk(data)` — Called for each chunk of response body (Uint8Array)
- `onDone()` — Called when response completes
- `onError(message)` — Called on network error

### Fetching RSC from Next.js

```js
export function fetchRSC(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'RSC': '1',
      'Next-Router-State-Tree': JSON.stringify(options.routerStateTree || ['']),
      'Next-URL': url,
      ...options.headers,
    };

    let statusCode;
    let responseHeaders;
    const chunkCallbacks = [];
    let doneCallback = null;
    let errorCallback = null;

    const stream = {
      onChunk(cb) { chunkCallbacks.push(cb); },
      onDone(cb) { doneCallback = cb; },
      onError(cb) { errorCallback = cb; },
    };

    $$fetch(url, 'GET', headers, null, {
      onResponse(status, hdrs) {
        statusCode = status;
        responseHeaders = hdrs;

        if (status < 200 || status >= 300) {
          reject(new Error(`RSC fetch failed: ${status}`));
          return;
        }

        const contentType = hdrs['Content-Type'] || hdrs['content-type'] || '';
        if (!contentType.startsWith('text/x-component')) {
          reject(new Error(`Expected text/x-component, got ${contentType}`));
          return;
        }

        resolve(stream);
      },
      onChunk(data) {
        for (const cb of chunkCallbacks) {
          cb(data);
        }
      },
      onDone() {
        if (doneCallback) doneCallback();
      },
      onError(message) {
        const err = new Error(message);
        if (errorCallback) errorCallback(err);
        else reject(err);
      },
    });
  });
}
```

### Server Actions

```js
export async function callServer(actionId, args) {
  const body = await encodeReply(args);

  const responseStream = await fetchWithBridge(currentURL, {
    method: 'POST',
    headers: {
      'Accept': 'text/x-component',
      'Next-Action': actionId,
      'Next-Router-State-Tree': JSON.stringify(routerStateTree),
      'Next-URL': currentURL,
    },
    body,
  });

  // Parse Flight response for action result
  const result = await createFromStream(responseStream, {
    moduleMap,
    callServer,
  });

  return result;
}

// Helper: bridge-based fetch returning a stream
function fetchWithBridge(url, options = {}) {
  return new Promise((resolve, reject) => {
    const chunkCallbacks = [];
    let doneCallback = null;
    let errorCallback = null;

    const stream = {
      onChunk(cb) { chunkCallbacks.push(cb); },
      onDone(cb) { doneCallback = cb; },
      onError(cb) { errorCallback = cb; },
    };

    $$fetch(url, options.method || 'GET', options.headers || {}, options.body || null, {
      onResponse(status, hdrs) {
        if (status < 200 || status >= 300) {
          reject(new Error(`Fetch failed: ${status}`));
          return;
        }
        resolve(stream);
      },
      onChunk(data) {
        for (const cb of chunkCallbacks) cb(data);
      },
      onDone() {
        if (doneCallback) doneCallback();
      },
      onError(message) {
        const err = new Error(message);
        if (errorCallback) errorCallback(err);
        else reject(err);
      },
    });
  });
}
```

## Next.js Response Envelope

Next.js wraps Flight data in a response envelope:

```js
{
  b: "build-id",     // Build ID for cache validation
  f: <flight-data>,  // Actual RSC tree
  q: "?params",      // Rendered search params
  i: true/false,     // Route interception flag
  S: true/false,     // Static/prerendered flag
}
```

The Flight client returns this envelope as the root value. The native app extracts the `f` field for the React element tree.

## Module Map

The module map is a build-time artifact mapping Next.js webpack module IDs to pre-registered component modules:

```js
// Generated or maintained alongside the client component source
const moduleMap = {
  "(app-pages-browser)/./components/Counter.tsx": CounterModule,
  "(app-pages-browser)/./components/SearchInput.tsx": SearchInputModule,
  // ...
};
```

## Integration Points

- **Renderer**: `createFromFetch`/`createFromStream` return a Thenable that renders via `createRoot().render()`
- **Bridge**: `fetchRSC` and `callServer` use `$$fetch` bridge function for networking; `$$decodeUTF8` for string decoding
- **Components**: Module map references all client component modules

## Error Handling

- Transport errors (network failure): `reportGlobalError` propagates to React error boundary
- Flight protocol errors (`E` rows): Resolve as rejected chunks, React handles via Suspense/error boundary
- Unknown module references: Log warning in DEV, return `null` (renders as empty)
- Bridge `$$fetch` errors: `onError` callback triggers `reportGlobalError`
