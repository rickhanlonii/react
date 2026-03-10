# Network Request Monitoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture all URLSession network requests (native + JS fetch) and expose them via `list_network_requests` and `get_network_request` MCP tools.

**Architecture:** URLProtocol interceptor in Swift captures all requests → sends events to inspector proxy via HotReload WebSocket → proxy stores requests and emits CDP Network.* events → MCP server subscribes to events and exposes query tools.

**Tech Stack:** Swift (URLProtocol, URLSession), Node.js (inspector-proxy.js), TypeScript (devtools-mcp)

---

### Task 1: Swift — Create `NetworkInterceptor` URLProtocol subclass

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/NetworkInterceptor.swift`

**Step 1: Create the NetworkInterceptor class**

This file implements a URLProtocol subclass that intercepts all URLSession.shared requests, logs them, and sends CDP-style events to the inspector proxy.

```swift
import Foundation

/// Intercepts all URLSession requests and reports them to DevTools via the inspector proxy.
/// Uses the standard URLProtocol pattern: intercept → log → forward to real network → log response.
final class NetworkInterceptor: URLProtocol {

    // MARK: - Static state

    /// Callback to send messages to the inspector proxy (set by ReactRuntime)
    static var sendToProxy: ((String) -> Void)?

    /// Whether the interceptor is currently active
    private static var isRegistered = false

    /// Track whether $$fetch initiated the current request (thread-local flag)
    static var currentInitiator: String = "native"

    /// Register the interceptor to capture all URLSession.shared requests.
    static func register() {
        guard !isRegistered else { return }
        isRegistered = true
        URLProtocol.registerClass(NetworkInterceptor.self)
        print("[NetworkInterceptor] Registered")
    }

    // MARK: - Request tagging

    /// Key used to mark requests as already-handled (prevent infinite recursion)
    private static let handledKey = "com.falcon.NetworkInterceptor.handled"

    // MARK: - URLProtocol overrides

    override class func canInit(with request: URLRequest) -> Bool {
        // Don't intercept requests we've already handled (prevents infinite loop)
        if URLProtocol.property(forKey: handledKey, in: request) != nil {
            return false
        }
        // Don't intercept WebSocket upgrade requests (HotReload connection)
        if request.value(forHTTPHeaderField: "Upgrade")?.lowercased() == "websocket" {
            return false
        }
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    // MARK: - Instance state

    private var dataTask: URLSessionDataTask?
    private var receivedData = Data()
    private var receivedResponse: HTTPURLResponse?
    private let requestId = UUID().uuidString
    private var startTime: TimeInterval = 0
    private let initiator: String

    override init(request: URLRequest, cachedResponse: CachedURLResponse?, client: URLProtocolClient?) {
        self.initiator = NetworkInterceptor.currentInitiator
        super.init(request: request, cachedResponse: cachedResponse, client: client)
    }

    // MARK: - Loading

    override func startLoading() {
        startTime = ProcessInfo.processInfo.systemUptime * 1000 // ms

        // Send requestWillBeSent event
        sendEvent("network-request-will-be-sent", [
            "requestId": requestId,
            "url": request.url?.absoluteString ?? "",
            "method": request.httpMethod ?? "GET",
            "headers": request.allHTTPHeaderFields ?? [:],
            "body": request.httpBody.flatMap { String(data: $0, encoding: .utf8) } as Any,
            "startTime": startTime,
            "initiator": initiator,
        ])

        // Mark the request as handled and forward to real network
        let mutableRequest = (request as NSURLRequest).mutableCopy() as! NSMutableURLRequest
        URLProtocol.setProperty(true, forKey: NetworkInterceptor.handledKey, in: mutableRequest)

        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        dataTask = session.dataTask(with: mutableRequest as URLRequest)
        dataTask?.resume()
    }

    override func stopLoading() {
        dataTask?.cancel()
    }

    // MARK: - Event sending

    private func sendEvent(_ type: String, _ data: [String: Any]) {
        guard let sendToProxy = NetworkInterceptor.sendToProxy else { return }
        var message = data
        message["type"] = type
        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            sendToProxy(jsonString)
        }
    }
}

// MARK: - URLSessionDataDelegate

extension NetworkInterceptor: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        receivedResponse = response as? HTTPURLResponse

        // Send responseReceived event
        let httpResponse = response as? HTTPURLResponse
        var responseHeaders: [String: String] = [:]
        if let headerFields = httpResponse?.allHeaderFields {
            for (key, value) in headerFields {
                responseHeaders[String(describing: key)] = String(describing: value)
            }
        }

        sendEvent("network-response-received", [
            "requestId": requestId,
            "url": response.url?.absoluteString ?? "",
            "statusCode": httpResponse?.statusCode ?? 0,
            "headers": responseHeaders,
            "mimeType": response.mimeType ?? "",
        ])

        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        client?.urlProtocol(self, didLoad: data)
        receivedData.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let endTime = ProcessInfo.processInfo.systemUptime * 1000
        let duration = endTime - startTime

        if let error = error {
            client?.urlProtocol(self, didFailWithError: error)
            sendEvent("network-loading-failed", [
                "requestId": requestId,
                "errorText": error.localizedDescription,
                "duration": duration,
            ])
        } else {
            client?.urlProtocolDidFinishLoading(self)

            // Encode body: try UTF-8 text first, fall back to base64
            let bodyString: String
            let isBase64: Bool
            if let text = String(data: receivedData, encoding: .utf8) {
                bodyString = text
                isBase64 = false
            } else {
                bodyString = receivedData.base64EncodedString()
                isBase64 = true
            }

            sendEvent("network-loading-finished", [
                "requestId": requestId,
                "duration": duration,
                "size": receivedData.count,
                "body": bodyString,
                "base64Encoded": isBase64,
            ])
        }
    }
}
```

**Step 2: Verify the file compiles**

Build the project to check for compile errors:
```
/build demo
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/NetworkInterceptor.swift
git commit -m "feat: add NetworkInterceptor URLProtocol for capturing network requests"
```

---

### Task 2: Swift — Register interceptor and wire up sendToProxy

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift:133` (after `setupDevToolsConnection()`)
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift:758` (in `setupDevToolsConnection()`, where `sendInspectorMessage` is set)

**Step 1: Wire sendToProxy in setupDevToolsConnection**

In `ReactRuntime.swift`, after line 760 where `sendInspectorMessage` is set, add:

```swift
// Wire network interceptor to send events via the same WebSocket
NetworkInterceptor.sendToProxy = { [weak client] data in
    client?.send(data)
}
NetworkInterceptor.register()
```

This goes right after:
```swift
bindings?.sendInspectorMessage = { [weak client] data in
    client?.send(data)
}
```

**Step 2: Tag JS fetch requests with "js-fetch" initiator**

In `Bindings+Registration.swift`, in the `registerNetworking()` function (line 1037), set the initiator before the URLSession call and reset it after. Add before line 1094 (`let task = URLSession.shared.dataTask...`):

```swift
NetworkInterceptor.currentInitiator = "js-fetch"
```

And after line 1126 (`task.resume()`), add:

```swift
NetworkInterceptor.currentInitiator = "native"
```

**Step 3: Build to verify**

```
/build demo
```

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift
git commit -m "feat: register NetworkInterceptor and tag js-fetch initiator"
```

---

### Task 3: Inspector Proxy — Implement Network domain

**Files:**
- Modify: `example/scripts/inspector-proxy.js:1192-1213` (replace `createNetworkDomain` stub)

**Step 1: Replace the Network domain stub**

Replace the `createNetworkDomain()` function (lines 1192-1213) with a full implementation that stores requests from the app and emits CDP events:

```javascript
function createNetworkDomain() {
  var enabled = false;
  var requests = []; // Ring buffer of captured requests
  var requestMap = {}; // requestId -> request object
  var MAX_REQUESTS = 500;
  var nextReqId = 0;

  function handle(method, params, ctx) {
    log('Network', method);
    switch (method) {
      case 'enable':
        enabled = true;
        return {};
      case 'disable':
        enabled = false;
        return {};
      case 'getResponseBody': {
        var req = requestMap[params.requestId];
        if (!req || !req.body) {
          return {body: '', base64Encoded: false};
        }
        return {body: req.body, base64Encoded: req.base64Encoded || false};
      }
      case 'setCacheDisabled':
      case 'setExtraHTTPHeaders':
        return {};
      default:
        return {};
    }
  }

  function handleAppMessage(message) {
    if (message.type === 'network-request-will-be-sent') {
      var reqId = nextReqId++;
      var entry = {
        reqId: reqId,
        requestId: message.requestId,
        url: message.url,
        method: message.method || 'GET',
        requestHeaders: message.headers || {},
        requestBody: message.body || null,
        startTime: message.startTime || Date.now(),
        initiator: message.initiator || 'native',
        statusCode: 0,
        responseHeaders: {},
        mimeType: '',
        body: null,
        base64Encoded: false,
        duration: 0,
        size: 0,
        error: null,
        finished: false,
      };
      requests.push(entry);
      requestMap[message.requestId] = entry;

      // Evict old entries
      if (requests.length > MAX_REQUESTS) {
        var removed = requests.shift();
        delete requestMap[removed.requestId];
      }
    }

    if (message.type === 'network-response-received') {
      var entry = requestMap[message.requestId];
      if (entry) {
        entry.statusCode = message.statusCode || 0;
        entry.responseHeaders = message.headers || {};
        entry.mimeType = message.mimeType || '';
      }
    }

    if (message.type === 'network-loading-finished') {
      var entry = requestMap[message.requestId];
      if (entry) {
        entry.duration = message.duration || 0;
        entry.size = message.size || 0;
        entry.body = message.body || null;
        entry.base64Encoded = message.base64Encoded || false;
        entry.finished = true;
      }
    }

    if (message.type === 'network-loading-failed') {
      var entry = requestMap[message.requestId];
      if (entry) {
        entry.error = message.errorText || 'Unknown error';
        entry.duration = message.duration || 0;
        entry.finished = true;
      }
    }
  }

  // Query interface used by MCP tools via CDP
  handle.getRequests = function () {
    return requests;
  };

  handle.getRequestByReqId = function (reqId) {
    return requests.find(function (r) { return r.reqId === reqId; }) || null;
  };

  return {
    name: 'Network',
    handle: handle,
    handleAppMessage: handleAppMessage,
  };
}
```

**Step 2: Wire handleAppMessage in the target**

In the `handleAppMessage` function (line 1793), add a line to route network messages to the network domain. After line 1809 (`if (pageDomain.handleAppMessage) pageDomain.handleAppMessage(message);`), add:

```javascript
if (networkDomain.handleAppMessage) networkDomain.handleAppMessage(message);
```

**Step 3: Add CDP methods for MCP tool queries**

We need CDP methods that the MCP tools can call to query stored requests. Add these cases to the Network domain's `handle` function:

```javascript
case 'getRequests':
  return {requests: handle.getRequests()};
case 'getRequestByReqId':
  return {request: handle.getRequestByReqId(params.reqId)};
```

Add these inside the `switch (method)` block, before `default`.

**Step 4: Verify the server starts**

```bash
cd example && npm run dev
```

Check for errors in server startup.

**Step 5: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "feat: implement Network domain in inspector proxy with request storage"
```

---

### Task 4: MCP Server — Implement `list_network_requests` tool

**Files:**
- Modify: `tools/devtools-mcp/src/tools/network.ts` (replace stub implementation)
- Modify: `tools/devtools-mcp/src/tools/tools.ts:7-32` (add network tools to registry)

**Step 1: Rewrite network.ts with real implementations**

Replace the entire contents of `tools/devtools-mcp/src/tools/network.ts`:

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

// ---------------------------------------------------------------------------
// Network request types
// ---------------------------------------------------------------------------

interface StoredNetworkRequest {
  reqId: number;
  requestId: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number;
  responseHeaders: Record<string, string>;
  mimeType: string;
  body: string | null;
  base64Encoded: boolean;
  startTime: number;
  duration: number;
  size: number;
  error: string | null;
  finished: boolean;
  initiator: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ---------------------------------------------------------------------------
// list_network_requests tool
// ---------------------------------------------------------------------------

export const listNetworkRequests = definePageTool({
  name: 'list_network_requests',
  description:
    'List all network requests captured since the app started. Shows URL, method, status, duration, and size for each request.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to return. When omitted, returns all requests.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    urlFilter: zod
      .string()
      .optional()
      .describe(
        'Filter requests by URL substring match (case-insensitive).',
      ),
    methodFilter: zod
      .string()
      .optional()
      .describe(
        'Filter requests by HTTP method (e.g. "GET", "POST").',
      ),
    initiatorFilter: zod
      .enum(['native', 'js-fetch'])
      .optional()
      .describe(
        'Filter by request initiator: "native" for URLSession requests, "js-fetch" for JavaScript fetch() calls.',
      ),
  },
  handler: async (request, response, context) => {
    // Query the proxy for stored requests
    const result = await context.cdpClient.send('Network.getRequests', {});
    let requests = (result.requests as StoredNetworkRequest[]) || [];

    // Apply filters
    const {urlFilter, methodFilter, initiatorFilter} = request.params;
    if (urlFilter) {
      const lower = urlFilter.toLowerCase();
      requests = requests.filter(r => r.url.toLowerCase().includes(lower));
    }
    if (methodFilter) {
      const upper = methodFilter.toUpperCase();
      requests = requests.filter(r => r.method === upper);
    }
    if (initiatorFilter) {
      requests = requests.filter(r => r.initiator === initiatorFilter);
    }

    const total = requests.length;

    if (total === 0) {
      response.appendResponseLine('No network requests captured.');
      return;
    }

    // Apply pagination
    const pageSize = request.params.pageSize;
    const pageIdx = request.params.pageIdx ?? 0;

    let paginatedRequests = requests;
    if (pageSize !== undefined) {
      const start = pageIdx * pageSize;
      paginatedRequests = requests.slice(start, start + pageSize);
    }

    response.appendResponseLine(`Network requests (${total} total):`);
    for (const req of paginatedRequests) {
      const status = req.error
        ? 'FAILED'
        : req.finished
          ? String(req.statusCode)
          : 'pending';
      const timing = req.finished ? formatDuration(req.duration) : '...';
      const size = req.finished ? formatSize(req.size) : '...';
      const initiatorTag = req.initiator === 'js-fetch' ? '  [js-fetch]' : '';
      const errorTag = req.error ? ` (${req.error})` : '';

      response.appendResponseLine(
        `[req=${req.reqId}] ${req.method} ${req.url} → ${status} (${timing}, ${size})${initiatorTag}${errorTag}`,
      );
    }

    if (pageSize !== undefined) {
      const totalPages = Math.ceil(total / pageSize);
      response.appendResponseLine(`\nPage ${pageIdx + 1} of ${totalPages}`);
    }
  },
});

// ---------------------------------------------------------------------------
// get_network_request tool
// ---------------------------------------------------------------------------

export const getNetworkRequest = definePageTool({
  name: 'get_network_request',
  description:
    'Get detailed information about a specific network request including headers and response body.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    reqid: zod
      .number()
      .describe(
        'The reqid of the network request from list_network_requests output.',
      ),
  },
  handler: async (request, response, context) => {
    const reqId = request.params.reqid;

    const result = await context.cdpClient.send('Network.getRequestByReqId', {
      reqId,
    });
    const req = result.request as StoredNetworkRequest | null;

    if (!req) {
      throw new Error(
        `Network request with reqid ${reqId} not found. Use list_network_requests to see available requests.`,
      );
    }

    const status = req.error
      ? 'FAILED'
      : req.finished
        ? String(req.statusCode)
        : 'pending';

    response.appendResponseLine(
      `Request #${req.reqId}: ${req.method} ${req.url}`,
    );
    response.appendResponseLine(
      `Duration: ${req.finished ? formatDuration(req.duration) : 'pending'} | Status: ${status} | Size: ${req.finished ? formatSize(req.size) : 'pending'} | Initiator: ${req.initiator}`,
    );

    // Request headers
    response.appendResponseLine('');
    response.appendResponseLine('Request Headers:');
    const reqHeaders = req.requestHeaders || {};
    if (Object.keys(reqHeaders).length === 0) {
      response.appendResponseLine('  (none)');
    } else {
      for (const [key, value] of Object.entries(reqHeaders)) {
        response.appendResponseLine(`  ${key}: ${value}`);
      }
    }

    // Request body
    if (req.requestBody) {
      response.appendResponseLine('');
      response.appendResponseLine('Request Body:');
      response.appendResponseLine(req.requestBody);
    }

    // Response headers
    response.appendResponseLine('');
    response.appendResponseLine('Response Headers:');
    const resHeaders = req.responseHeaders || {};
    if (Object.keys(resHeaders).length === 0) {
      response.appendResponseLine('  (none)');
    } else {
      for (const [key, value] of Object.entries(resHeaders)) {
        response.appendResponseLine(`  ${key}: ${value}`);
      }
    }

    // Response body
    if (req.body) {
      response.appendResponseLine('');
      if (req.base64Encoded) {
        response.appendResponseLine(
          `Response Body (base64, ${formatSize(req.size)}):`,
        );
        // Show first 200 chars of base64 to avoid flooding
        const preview =
          req.body.length > 200
            ? req.body.substring(0, 200) + '...'
            : req.body;
        response.appendResponseLine(preview);
      } else {
        const MAX_BODY = 5000;
        const truncated = req.body.length > MAX_BODY;
        response.appendResponseLine(
          `Response Body${truncated ? ` (first ${MAX_BODY} chars of ${formatSize(req.size)})` : ''}:`,
        );
        response.appendResponseLine(
          truncated ? req.body.substring(0, MAX_BODY) + '...' : req.body,
        );
      }
    }
  },
});
```

**Step 2: Register network tools in the tool registry**

In `tools/devtools-mcp/src/tools/tools.ts`, add the import and include in `createTools()`.

Add after line 10 (`import * as snapshotTools from './snapshot.js';`):

```typescript
import * as networkTools from './network.js';
```

Add `...Object.values(networkTools),` to the `allValues` array after `...Object.values(snapshotTools),` (after line 31):

```typescript
...Object.values(networkTools),
```

**Step 3: Build the MCP server**

```bash
cd tools/devtools-mcp && npm run build
```

**Step 4: Commit**

```bash
git add tools/devtools-mcp/src/tools/network.ts tools/devtools-mcp/src/tools/tools.ts
git commit -m "feat: implement list_network_requests and get_network_request MCP tools"
```

---

### Task 5: Build, Run, and Verify

**Files:** None (verification only)

**Step 1: Build the full project**

```
/build demo
```

**Step 2: Build the MCP server**

```bash
cd tools/devtools-mcp && npm run build
```

**Step 3: Navigate to a fixture and verify requests are captured**

Use the MCP tools to navigate to a fixture:

```
navigate_fixture({fixture: "01-rsc-only", variant: "hydrated"})
```

Wait a few seconds for the page to load.

**Step 4: List captured network requests**

```
list_network_requests()
```

Expected: Should show SSR request, bundle.js request, and any RSC/Flight requests. Each should have status codes, timing, and sizes.

**Step 5: Get details for a specific request**

```
get_network_request({reqid: 0})
```

Expected: Should show full request/response headers and response body.

**Step 6: Verify JS fetch initiator tagging**

Use `evaluate_script` to make a fetch call:

```javascript
evaluate_script({function: "async () => { const r = await fetch('http://localhost:6000/fixtures'); return await r.text(); }"})
```

Then check `list_network_requests()` — the `/fixtures` request should show `[js-fetch]` tag.

**Step 7: Commit the build output if needed**

```bash
git add -A
git commit -m "feat: network request monitoring for falcon-devtools"
```

---

### Task 6: Move plan to complete

**Files:**
- Move: `docs/plans/2026-03-08-network-devtools-design.md` → `docs/plans/complete/`
- Move: `docs/plans/2026-03-08-network-devtools.md` → `docs/plans/complete/`

```bash
mv docs/plans/2026-03-08-network-devtools-design.md docs/plans/complete/
mv docs/plans/2026-03-08-network-devtools.md docs/plans/complete/
git add docs/plans/
git commit -m "chore: move network devtools plans to complete"
```
