# Network Request Monitoring for Falcon DevTools

## Overview

Add network request visibility to falcon-devtools MCP, capturing all URLSession requests (native fetches like bundle loading and SSR, plus JS `fetch()` calls) and exposing them via `list_network_requests` and `get_network_request` tools.

## Architecture

Three layers, matching the existing console/tracing pattern:

```
URLSession request
    ↓
NetworkInterceptor (URLProtocol subclass, Swift)
    ↓ captures request/response, sends CDP events via Bridge WebSocket
Inspector Proxy Network domain (JS, port 6001)
    ↓ stores requests, emits CDP Network.* events
MCP Server network.ts tools (TS)
    ↓ subscribes to events, exposes list/detail tools
Claude
```

### Layer 1: Swift — `NetworkInterceptor` (URLProtocol subclass)

- Registers with `URLProtocol.registerClass()` on app startup
- Intercepts all `URLSession.shared` requests
- Captures: URL, method, headers, status, response headers, response body, timing, size
- Sends CDP-style `Network.*` events to inspector proxy via Bridge WebSocket
- Forwards requests to real network transparently
- Tags requests with initiator ("native" vs "js-fetch" based on whether `$$fetch` triggered it)

### Layer 2: Inspector Proxy — `Network` domain (upgrade from stub)

- Receives network events from the app via WebSocket messages
- Stores requests in memory (ring buffer, bounded)
- Emits CDP events to connected clients:
  - `Network.requestWillBeSent` — when request starts
  - `Network.responseReceived` — when response headers arrive
  - `Network.loadingFinished` — when response body is complete
  - `Network.loadingFailed` — on error
- Handles `Network.enable` / `Network.disable`
- Handles `Network.getResponseBody` to return stored bodies

### Layer 3: MCP Server — `network.ts` tools (upgrade from stub)

- `list_network_requests` — paginated, filterable list
- `get_network_request` — full details with headers and body
- Subscribes to `Network.*` CDP events on startup (like console messages)

## Data Model

```
NetworkRequest {
  requestId: string            // UUID, generated at intercept time
  url: string
  method: string               // GET, POST, etc.
  requestHeaders: {[key]: string}
  requestBody: string?         // For POST/PUT
  statusCode: number           // 200, 404, etc.
  responseHeaders: {[key]: string}
  responseBody: string         // Full body (base64 for binary)
  mimeType: string             // Content-Type
  startTime: number            // timestamp ms
  endTime: number              // timestamp ms
  duration: number             // endTime - startTime
  size: number                 // response body bytes
  error: string?               // if request failed
  initiator: string            // "native" or "js-fetch"
}
```

## Streaming SSR Handling

SSR responses stream via `URLSessionDataDelegate`. URLProtocol handles this naturally:
- `urlProtocol(_:didLoad:)` called for each chunk → accumulate body
- Send `Network.requestWillBeSent` when request starts
- Send `Network.responseReceived` when first data arrives (with headers)
- Send `Network.loadingFinished` when complete (with total size)

## MCP Tool Output

### `list_network_requests`

```
Network requests (5 total):
[req=0] GET http://localhost:6000/bundle.js → 200 (142ms, 234KB)
[req=1] GET http://localhost:6001/ssr/01-rsc-only → 200 (89ms, 12KB, streaming)
[req=2] GET http://localhost:6000/fixtures → 200 (23ms, 1.2KB)
[req=3] POST http://localhost:6000/ → 200 (45ms, 892B)  [js-fetch]
[req=4] GET http://localhost:6000/image.png → 404 (12ms, 0B)
```

Filters: URL pattern, method, status code range, initiator (native/js-fetch).

### `get_network_request`

```
Request #0: GET http://localhost:6000/bundle.js
Duration: 142ms | Status: 200 | Size: 234KB | Initiator: native

Request Headers:
  Accept: */*
  Cache-Control: no-cache

Response Headers:
  Content-Type: application/javascript
  Content-Length: 239616

Response Body (first 5000 chars):
  // Bundle content...
```

## Verification

After implementation, use the MCP tools to:
1. Navigate to a fixture → `list_network_requests` should show SSR + bundle + RSC requests
2. Use `get_network_request` to inspect a specific request's headers and body
3. Evaluate `fetch('http://localhost:6000/fixtures')` via `evaluate_script` → verify it appears in the list with `[js-fetch]` initiator
