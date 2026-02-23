# CDP Inspector Proxy Lifecycle Fixes

**Date:** 2026-02-23
**Status:** Planned (follow-up to shared JSC runtime refactor)
**Depends on:** `2026-02-23-shared-jsc-runtime-design.md`

## Problem

The CDP inspector proxy (`example/scripts/inspector-proxy.js`) does not handle JSContext
lifecycle transitions correctly. When the JSContext is deallocated (hot reload full
reset) or when multiple contexts exist (current bug, fixed by shared runtime refactor),
several CDP protocol issues arise.

The shared runtime refactor reduces the frequency of these issues (one context instead
of N) but does not eliminate them — full resets still destroy and recreate the context.

## Issues

### 1. Pending CDP requests are leaked

**Location:** `inspector-proxy.js` — Runtime domain (line 296), Profiler domain (line 368)

Both domains maintain `pendingRequests` Maps for async CDP requests forwarded to the
app (`Runtime.evaluate`, `Runtime.getProperties`, `Profiler.stop`, etc.). When the app
WebSocket disconnects (context deallocated), these pending requests are never resolved.
Chrome DevTools shows a spinner forever.

**Fix:** When the dev-server.js `close` event fires for an app WebSocket, notify the
inspector proxy. The proxy should iterate all pending requests and send error responses:
```json
{"id": 42, "error": {"code": -32000, "message": "Target disconnected"}}
```

### 2. No execution context lifecycle events

**Location:** `inspector-proxy.js` — Runtime domain (line 301)

`Runtime.executionContextCreated` is only sent when DevTools calls `Runtime.enable`.
During a hot reload, DevTools doesn't re-call `Runtime.enable`, so it never learns the
old context was destroyed or that a new one exists.

**Fix:** When app disconnects, broadcast:
```json
{"method": "Runtime.executionContextDestroyed", "params": {"executionContextId": 1}}
```

When new app connects, broadcast:
```json
{"method": "Runtime.executionContextCreated", "params": {"context": {"id": 2, ...}}}
```

Increment the context ID on each reconnection.

### 3. Stale remote object references

**Location:** `inspector-proxy.js` — Runtime domain

Chrome DevTools holds remote object IDs from `Runtime.evaluate` responses. After a
context reset, these IDs reference objects in the deallocated context. Calls like
`Runtime.getProperties(objectId)` are forwarded to the new context which doesn't
recognize them.

**Fix:** After sending `executionContextDestroyed`, DevTools should invalidate its
object references. This happens automatically if the context lifecycle events are
correctly emitted (fix #2).

### 4. Hardcoded execution context ID

**Location:** `inspector-proxy.js:307`

Both old and new contexts use `executionContextId: 1`. DevTools can't distinguish them.

**Fix:** Use an incrementing counter. Reset to the current value on reconnection.

### 5. Trace data loss on mid-recording reload

**Location:** `inspector-proxy.js:116-124`

If `Tracing.end` is pending and the app disconnects, the 5-second timeout fires and
resolves with an empty array. All trace events collected before the reload are lost.

**Fix:** When app disconnects during an active trace:
1. Resolve immediately with whatever events were collected so far
2. Or: buffer the pending resolve and re-request trace data from the new context after
   reconnection (append to the existing trace)

### 6. Console output lacks context identification

Console messages from the app are broadcast as `Runtime.consoleAPICalled` without any
indication of which surface or context produced them.

**Fix:** Include a surface identifier in console messages (e.g. fixture name) so
DevTools output can be filtered. This requires changes to the JS-side console
forwarding in `entry.js`.

## Implementation Order

1. **App disconnect notification** — dev-server.js notifies inspector proxy on WebSocket close
2. **Pending request cleanup** — reject all pending CDP requests on disconnect
3. **Context lifecycle events** — emit destroyed/created with incrementing IDs
4. **Trace continuity** — handle mid-recording disconnects gracefully
5. **Console context** — add surface/fixture metadata to console messages

## Files Changed

| File | Change |
|------|--------|
| `example/scripts/dev-server.js` | Notify inspector proxy on app WebSocket disconnect/connect |
| `example/scripts/inspector-proxy.js` | Pending request cleanup, context lifecycle events, trace handling |
| `packages/react-dom-native/src/entry.js` | Add surface context to console forwarding (optional) |
