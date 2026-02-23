# Chrome DevTools Protocol (CDP) Support via JSC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Chrome DevTools to debug, profile, and inspect a react-dom-native app running on JSC by implementing CDP domain handlers across the inspector proxy (Node.js), the in-app JS runtime (JSC), and the native Swift bridge.

**Architecture:** A three-layer CDP implementation: (1) the Node.js inspector proxy translates CDP WebSocket messages into an internal message protocol, (2) JS-side handlers inside JSC implement domain logic (Runtime.evaluate, object inspection, console), (3) the Swift bridge provides native capabilities (memory stats, source maps). Breakpoint debugging is delegated to Safari Web Inspector via `JSContext.isInspectable = true` since JSC's native debugger speaks the WebKit Inspector Protocol (not CDP) over XPC, making translation impractical without private APIs.

**Tech Stack:** Node.js (inspector proxy), JavaScript (JSC runtime handlers), Swift (native bridge), WebSocket (transport), Chrome Trace Format (tracing)

---

## Research Summary

### What CDP Is

The Chrome DevTools Protocol is a JSON-RPC protocol over WebSocket organized into ~50 **domains** (Runtime, Debugger, Profiler, Network, etc.). Each domain has **methods** (request/response), **events** (server-push), and **types** (shared schemas). Chrome DevTools connects to `ws://host:port/targetId` and exchanges messages like:

```json
{"id": 1, "method": "Runtime.evaluate", "params": {"expression": "1+1"}}
{"id": 1, "result": {"result": {"type": "number", "value": 2, "description": "2"}}}
{"method": "Runtime.consoleAPICalled", "params": {"type": "log", "args": [...]}}
```

Discovery happens via HTTP endpoints (`/json/version`, `/json/list`) that return inspectable targets with their WebSocket URLs.

### What Exists Today

Falcon already has a working CDP infrastructure for **performance tracing** and **console forwarding**:

```
Chrome DevTools ←—CDP WS (9222)—→ Inspector Proxy (Node.js)
                                       ↕ internal WS (8082)
                                  Dev Server (Node.js)
                                       ↕ WebSocket
                                  Falcon App (iOS/JSC)
```

| Component | File | What It Does |
|-----------|------|--------------|
| Inspector Proxy | `example/scripts/inspector-proxy.js` | CDP server on port 9222. Handles `Tracing.start/end`, stubs for `Runtime.enable`, `Page.*`, `DOM.*`. Routes app messages to CDP clients. |
| Dev Server | `example/scripts/dev-server.js` | WS server on port 8082. Bridges inspector proxy ↔ app. Tracks tracing state for reconnects. |
| PerformanceTracer | `packages/react-dom-native/src/devtools/PerformanceTracer.js` | In-JSC event buffer. Collects Chrome Trace Format events (blink.user_timing async b/e pairs) during recording. |
| ConsoleForwarding | `packages/react-dom-native/src/devtools/ConsoleForwarding.js` | Wraps `console.log/warn/error/info/debug` to serialize args as CDP RemoteObjects and send via `$$sendInspectorMessage`. |
| InspectorMessageHandler | `packages/react-dom-native/src/devtools/InspectorMessageHandler.js` | Global `$$onInspectorMessage` dispatcher. Routes `start-tracing`/`stop-tracing` to PerformanceTracer. |
| PerformancePolyfill | `packages/react-dom-native/src/devtools/PerformancePolyfill.js` | W3C Performance API polyfill (now/mark/measure) backed by `CACurrentMediaTime`. |
| DevToolsHookShim | `packages/react-dom-native/src/devtools/DevToolsHookShim.js` | Minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` to enable React ProfileMode. |
| Swift Bridge | `Bindings.swift:1357-1380` | Registers `$$performanceNow` (high-res timer) and `$$sendInspectorMessage` (JS→Native→DevServer). `deliverInspectorMessage` goes DevServer→Native→JS. |

### Internal Message Protocol (App ↔ Dev Server)

**JS → Native → Dev Server** (via `$$sendInspectorMessage`):
- `{type: 'trace-data', events: [...]}` — buffered trace events
- `{type: 'console-message', cdpType, args, timestamp}` — console forwarding

**Dev Server → Native → JS** (via `$$onInspectorMessage`):
- `{type: 'start-tracing'}` / `{type: 'stop-tracing'}` — tracing control
- `{type: 'reload'}` — hot reload trigger

### JSC's Built-in Inspector vs CDP

JSC has a full debugger (breakpoints, stepping, scopes, heap snapshots) but it speaks the **WebKit Inspector Protocol**, not CDP. Key differences:

| Aspect | WebKit (JSC) | CDP (Chrome) |
|--------|-------------|--------------|
| Transport | XPC on Apple platforms | WebSocket |
| Console | `Console.messageAdded` event | `Runtime.consoleAPICalled` event |
| Profiling | `ScriptProfiler` domain | `Profiler` domain |
| Heap | `Heap` domain (single snapshot) | `HeapProfiler` (streaming chunks) |
| Scopes | 7 types incl. `globalLexicalEnvironment` | Different set with `block`, `module` |
| Breakpoints | `BreakpointOptions` with actions/probes | Simpler `condition` string |

On Apple platforms, JSC's inspector uses **XPC** (inter-process communication to `webinspectord`), not WebSocket. There is no public API to intercept or redirect these messages. The public Swift API only exposes:
- `JSContext.isInspectable = true` — register with Safari Web Inspector
- `JSContext.name = "..."` — label shown in Safari's inspector

**React Native's approach**: Hermes has native CDP support built-in. For JSC, RN falls back to a minimal `FallbackRuntimeAgentDelegate` that only supports `Runtime.evaluate` and shows a "not debuggable" warning. Breakpoint debugging on JSC goes through Safari.

### Chosen Architecture

Given these constraints, the plan implements CDP support in three tiers:

1. **Tier 1 — JS-level instrumentation** (no JSC internals needed): Runtime.evaluate, Runtime.getProperties, Console domain, enhanced object inspection. All implemented in JS running inside JSC, communicating via the existing `$$sendInspectorMessage`/`$$onInspectorMessage` bridge.

2. **Tier 2 — Native-assisted features** (Swift bridge extensions): Memory stats via `mach_task_basic_info`, source map support for stack traces, JS heap size via JSC's `vm.heapSize` (if accessible).

3. **Tier 3 — Safari Web Inspector passthrough**: For breakpoint debugging, stepping, and scope inspection, users connect Safari Web Inspector directly to the JSC context. This works with zero additional code by setting `isInspectable = true` (already done in debug builds).

This mirrors React Native's pragmatic split: Chrome DevTools for console/profiling/tracing, Safari for breakpoint debugging.

---

## Implementation Plan

### Phase 1: Refactor Inspector Proxy into Domain Handlers

The current `inspector-proxy.js` is a single `handleCDPMessage` switch statement. Before adding domains, refactor it into a modular domain-handler architecture.

### Task 1: Extract CDP domain handler architecture

**Files:**
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Refactor handleCDPMessage into a domain-dispatch pattern**

Replace the monolithic switch with a domain registry. Each domain is an object with a `handle(method, params)` function that returns a result or null.

```js
// Domain handler interface:
// {
//   name: 'Runtime',
//   handle(method, params, context) → {result} | null | Promise<{result}>
// }

// context = {sendToApp, sendCDP, broadcastCDP, targetId, pendingRequests}

function createDomainRouter(domains, context) {
  const handlers = {};
  for (const domain of domains) {
    handlers[domain.name] = domain;
  }
  return function route(ws, message) {
    const {method, id, params} = message;
    const dotIdx = method.indexOf('.');
    if (dotIdx === -1) {
      if (id !== undefined) context.sendCDP(ws, {id, result: {}});
      return;
    }
    const domainName = method.slice(0, dotIdx);
    const methodName = method.slice(dotIdx + 1);
    const domain = handlers[domainName];
    if (!domain) {
      if (id !== undefined) context.sendCDP(ws, {id, result: {}});
      return;
    }
    const result = domain.handle(methodName, params || {}, context);
    if (result && typeof result.then === 'function') {
      result.then(function (r) {
        if (id !== undefined) context.sendCDP(ws, {id, result: r || {}});
      });
    } else {
      if (id !== undefined) context.sendCDP(ws, {id, result: result || {}});
    }
  };
}
```

**Step 2: Extract existing handlers into domain objects**

Move the Tracing, Runtime, Profiler, Page, and DOM switch cases into separate domain objects in the same file:

```js
function createTracingDomain() {
  let pendingTraceResolve = null;
  return {
    name: 'Tracing',
    handle(method, params, ctx) { /* existing Tracing.start/end logic */ },
    handleAppMessage(message) { /* existing trace-data handling */ },
  };
}

function createRuntimeDomain() {
  return {
    name: 'Runtime',
    handle(method, params, ctx) {
      switch (method) {
        case 'enable': /* existing */ break;
        case 'getIsolateId': /* existing */ break;
        // ...
      }
    },
  };
}
// ... same for Page, DOM, Profiler, NodeTracing
```

**Step 3: Wire domains into createInspectorProxy**

```js
function createInspectorProxy(options) {
  // ... existing setup ...

  const tracingDomain = createTracingDomain();
  const runtimeDomain = createRuntimeDomain();
  const pageDomain = createPageDomain(targetId);
  const domDomain = createDOMDomain();
  const profilerDomain = createProfilerDomain();

  const context = { sendCDP, broadcastCDP, targetId };
  const route = createDomainRouter(
    [tracingDomain, runtimeDomain, pageDomain, domDomain, profilerDomain],
    context,
  );

  // In handleCDPMessage:
  function handleCDPMessage(ws, message) {
    route(ws, message);
  }

  // In handleAppMessage:
  function handleAppMessage(data) {
    let message;
    try { message = JSON.parse(data); } catch (e) { return; }
    tracingDomain.handleAppMessage(message);
    runtimeDomain.handleAppMessage?.(message);
  }
}
```

**Step 4: Run existing test to verify nothing broke**

Run: `node example/scripts/test-trace.js`
Expected: Tracing round-trip passes (TracingStartedInBrowser, metadata, events).

**Step 5: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "refactor(devtools): extract CDP domain handlers from inspector proxy"
```

---

### Phase 2: Runtime.evaluate — Execute JS in JSC from DevTools Console

This is the most valuable single feature: type expressions in the Chrome DevTools Console panel and see results from JSC.

### Task 2: Add evaluate handler in JSC

**Files:**
- Create: `packages/react-dom-native/src/devtools/RuntimeAgent.js`
- Modify: `packages/react-dom-native/src/devtools/InspectorMessageHandler.js`

**Step 1: Write the failing test**

Create: `packages/react-dom-native/src/devtools/__tests__/runtime-agent.test.js`

```js
'use strict';

// Mock the bridge globals before requiring the module
global.$$sendInspectorMessage = jest.fn();
global.$$performanceNow = () => Date.now();

describe('RuntimeAgent', () => {
  beforeEach(() => {
    global.$$sendInspectorMessage.mockClear();
    // Re-require to get fresh state
    jest.resetModules();
    require('../RuntimeAgent');
  });

  test('evaluate returns primitive result', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-1',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '2 + 2'},
    }));

    expect(global.$$sendInspectorMessage).toHaveBeenCalledTimes(1);
    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.type).toBe('cdp-response');
    expect(response.requestId).toBe('req-1');
    expect(response.result.result.type).toBe('number');
    expect(response.result.result.value).toBe(4);
  });

  test('evaluate returns string result', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-2',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '"hello"'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('string');
    expect(response.result.result.value).toBe('hello');
  });

  test('evaluate returns object with objectId', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-3',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '({a: 1, b: 2})'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('object');
    expect(response.result.result.objectId).toBeDefined();
    expect(response.result.result.className).toBe('Object');
  });

  test('evaluate catches errors and returns exceptionDetails', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-4',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: 'undefinedVar.foo'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.exceptionDetails).toBeDefined();
    expect(response.result.exceptionDetails.text).toContain('undefinedVar');
  });

  test('getProperties returns own properties of stored object', () => {
    // First, evaluate to get an objectId
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-5a',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '({x: 10, y: "hi"})'},
    }));

    const evalResponse = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    const objectId = evalResponse.result.result.objectId;

    global.$$sendInspectorMessage.mockClear();

    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-5b',
      domain: 'Runtime',
      method: 'getProperties',
      params: {objectId, ownProperties: true},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'x', value: expect.objectContaining({type: 'number', value: 10})}),
        expect.objectContaining({name: 'y', value: expect.objectContaining({type: 'string', value: 'hi'})}),
      ]),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=runtime-agent`
Expected: FAIL — module not found

**Step 3: Implement RuntimeAgent.js**

Create: `packages/react-dom-native/src/devtools/RuntimeAgent.js`

```js
'use strict';

// ---------------------------------------------------------------------------
// Runtime Agent (in-JSC)
//
// Handles CDP Runtime domain requests forwarded from the inspector proxy.
// Runs inside JSC — uses eval() for expression evaluation and maintains
// an object store for getProperties/releaseObject/releaseObjectGroup.
//
// Incoming messages (via $$handleCDPRequest):
//   {requestId, domain: 'Runtime', method, params}
//
// Outgoing messages (via $$sendInspectorMessage):
//   {type: 'cdp-response', requestId, result}
// ---------------------------------------------------------------------------

// Object store — maps objectId → JS value for getProperties
var objectStore = {};
var nextObjectId = 1;

function storeObject(value) {
  var id = 'obj-' + nextObjectId++;
  objectStore[id] = value;
  return id;
}

// Convert a JS value to a CDP RemoteObject
function toRemoteObject(value) {
  if (value === null) {
    return {type: 'object', subtype: 'null', value: null};
  }
  if (value === undefined) {
    return {type: 'undefined'};
  }

  var t = typeof value;

  if (t === 'boolean' || t === 'string') {
    return {type: t, value: value};
  }
  if (t === 'number') {
    // Handle special numbers
    if (value !== value) return {type: 'number', unserializableValue: 'NaN', description: 'NaN'};
    if (value === Infinity) return {type: 'number', unserializableValue: 'Infinity', description: 'Infinity'};
    if (value === -Infinity) return {type: 'number', unserializableValue: '-Infinity', description: '-Infinity'};
    if (Object.is(value, -0)) return {type: 'number', unserializableValue: '-0', description: '-0'};
    return {type: 'number', value: value, description: String(value)};
  }
  if (t === 'bigint') {
    return {type: 'bigint', unserializableValue: String(value) + 'n', description: String(value) + 'n'};
  }
  if (t === 'symbol') {
    return {type: 'symbol', description: String(value)};
  }
  if (t === 'function') {
    var objectId = storeObject(value);
    return {
      type: 'function',
      className: 'Function',
      description: String(value),
      objectId: objectId,
    };
  }

  // Objects (including arrays, errors, dates, regexps, etc.)
  var objectId = storeObject(value);
  var subtype;
  var className = 'Object';
  var description;

  if (Array.isArray(value)) {
    subtype = 'array';
    className = 'Array';
    description = 'Array(' + value.length + ')';
  } else if (value instanceof RegExp) {
    subtype = 'regexp';
    className = 'RegExp';
    description = String(value);
  } else if (value instanceof Date) {
    subtype = 'date';
    className = 'Date';
    description = String(value);
  } else if (value instanceof Error) {
    subtype = 'error';
    className = value.constructor ? value.constructor.name : 'Error';
    description = String(value);
  } else if (value instanceof Map) {
    subtype = 'map';
    className = 'Map';
    description = 'Map(' + value.size + ')';
  } else if (value instanceof Set) {
    subtype = 'set';
    className = 'Set';
    description = 'Set(' + value.size + ')';
  } else if (value instanceof WeakMap) {
    subtype = 'weakmap';
    className = 'WeakMap';
    description = 'WeakMap';
  } else if (value instanceof WeakSet) {
    subtype = 'weakset';
    className = 'WeakSet';
    description = 'WeakSet';
  } else if (value instanceof Promise) {
    subtype = 'promise';
    className = 'Promise';
    description = 'Promise';
  } else if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    subtype = 'arraybuffer';
    className = 'ArrayBuffer';
    description = 'ArrayBuffer(' + value.byteLength + ')';
  } else {
    className = value.constructor ? value.constructor.name : 'Object';
    try {
      var keys = Object.keys(value);
      description = className === 'Object'
        ? '{' + keys.slice(0, 5).join(', ') + (keys.length > 5 ? ', ...' : '') + '}'
        : className;
    } catch (e) {
      description = className;
    }
  }

  var result = {
    type: 'object',
    className: className,
    description: description,
    objectId: objectId,
  };
  if (subtype) result.subtype = subtype;
  return result;
}

function handleEvaluate(params) {
  var expression = params.expression;
  try {
    // (0, eval) is indirect eval — executes in global scope
    var value = (0, eval)(expression);
    var result = {result: toRemoteObject(value)};
    if (params.returnByValue && typeof value === 'object' && value !== null) {
      try {
        result.result = {type: typeof value, value: JSON.parse(JSON.stringify(value))};
      } catch (e) {
        // Fall through to objectId-based result
      }
    }
    return result;
  } catch (e) {
    return {
      result: toRemoteObject(undefined),
      exceptionDetails: {
        exceptionId: nextObjectId++,
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: toRemoteObject(e),
      },
    };
  }
}

function handleGetProperties(params) {
  var objectId = params.objectId;
  var obj = objectStore[objectId];
  if (obj === undefined && !(objectId in objectStore)) {
    return {result: []};
  }

  var properties = [];
  var ownOnly = params.ownProperties !== false;

  try {
    var names = Object.getOwnPropertyNames(obj);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      try {
        var descriptor = Object.getOwnPropertyDescriptor(obj, name);
        var prop = {
          name: name,
          configurable: !!descriptor.configurable,
          enumerable: !!descriptor.enumerable,
          isOwn: true,
        };
        if ('value' in descriptor) {
          prop.value = toRemoteObject(descriptor.value);
          prop.writable = !!descriptor.writable;
        }
        if (descriptor.get) {
          prop.get = toRemoteObject(descriptor.get);
        }
        if (descriptor.set) {
          prop.set = toRemoteObject(descriptor.set);
        }
        properties.push(prop);
      } catch (e) {
        properties.push({
          name: name,
          value: toRemoteObject(undefined),
          configurable: false,
          enumerable: false,
          isOwn: true,
        });
      }
    }
  } catch (e) {
    // Non-inspectable object
  }

  // Add prototype if not ownProperties-only (or if DevTools requests it)
  if (!ownOnly) {
    try {
      var proto = Object.getPrototypeOf(obj);
      if (proto !== null) {
        properties.push({
          name: '__proto__',
          value: toRemoteObject(proto),
          configurable: true,
          enumerable: false,
          isOwn: true,
        });
      }
    } catch (e) {}
  }

  return {result: properties};
}

function handleCallFunctionOn(params) {
  var objectId = params.objectId;
  var obj = objectStore[objectId];
  if (obj === undefined && !(objectId in objectStore)) {
    return {result: toRemoteObject(undefined)};
  }

  try {
    var fn = (0, eval)('(' + params.functionDeclaration + ')');
    var args = [];
    if (params.arguments) {
      for (var i = 0; i < params.arguments.length; i++) {
        var arg = params.arguments[i];
        if ('objectId' in arg) {
          args.push(objectStore[arg.objectId]);
        } else if ('value' in arg) {
          args.push(arg.value);
        } else if ('unserializableValue' in arg) {
          args.push((0, eval)(arg.unserializableValue));
        } else {
          args.push(undefined);
        }
      }
    }
    var result = fn.apply(obj, args);
    return {result: toRemoteObject(result)};
  } catch (e) {
    return {
      result: toRemoteObject(undefined),
      exceptionDetails: {
        exceptionId: nextObjectId++,
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: toRemoteObject(e),
      },
    };
  }
}

function handleReleaseObject(params) {
  delete objectStore[params.objectId];
  return {};
}

function handleReleaseObjectGroup() {
  // We don't track groups; clear everything
  objectStore = {};
  return {};
}

// Main dispatcher — called by InspectorMessageHandler
function handleRuntimeRequest(requestId, method, params) {
  var result;

  switch (method) {
    case 'evaluate':
      result = handleEvaluate(params);
      break;
    case 'getProperties':
      result = handleGetProperties(params);
      break;
    case 'callFunctionOn':
      result = handleCallFunctionOn(params);
      break;
    case 'releaseObject':
      result = handleReleaseObject(params);
      break;
    case 'releaseObjectGroup':
      result = handleReleaseObjectGroup(params);
      break;
    case 'globalLexicalScopeNames':
      result = {names: []};
      break;
    case 'compileScript':
      result = {};
      break;
    default:
      result = {};
      break;
  }

  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-response',
      requestId: requestId,
      result: result,
    }));
  }
}

// Register as a global handler
globalThis.$$handleCDPRequest = function (jsonString) {
  var request;
  try {
    request = JSON.parse(jsonString);
  } catch (e) {
    return;
  }

  if (request.domain === 'Runtime') {
    handleRuntimeRequest(request.requestId, request.method, request.params || {});
  }
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=runtime-agent`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/react-dom-native/src/devtools/RuntimeAgent.js \
       packages/react-dom-native/src/devtools/__tests__/runtime-agent.test.js
git commit -m "feat(devtools): add Runtime agent for CDP evaluate/getProperties in JSC"
```

---

### Task 3: Wire CDP requests through the proxy to JSC and back

**Files:**
- Modify: `example/scripts/inspector-proxy.js` (Runtime domain handler)
- Modify: `example/scripts/dev-server.js` (forward cdp-request/cdp-response messages)
- Modify: `packages/react-dom-native/src/devtools/InspectorMessageHandler.js` (route cdp-request to $$handleCDPRequest)

**Step 1: Update InspectorMessageHandler to route CDP requests**

Add a new message type to `$$onInspectorMessage`:

```js
// In InspectorMessageHandler.js, add after the stop-tracing handler:
} else if (type === 'cdp-request') {
  // Forward CDP request to the in-JSC handler
  if (typeof $$handleCDPRequest === 'function') {
    $$handleCDPRequest(jsonString);
  }
}
```

The `cdp-request` message format is:
```json
{
  "type": "cdp-request",
  "requestId": "1",
  "domain": "Runtime",
  "method": "evaluate",
  "params": {"expression": "1+1"}
}
```

**Step 2: Update dev-server.js to forward cdp-response messages**

In the `ws.on('message')` handler, forward `cdp-response` messages to the inspector proxy:

```js
// In dev-server.js, after the trace-data forwarding:
if (message.type === 'cdp-response' && inspectorProxy) {
  inspectorProxy.handleAppMessage(text);
}
```

Also forward `console-message` type (already forwarded in inspector-proxy but not by dev-server):

```js
if (message.type === 'console-message' && inspectorProxy) {
  inspectorProxy.handleAppMessage(text);
}
```

**Step 3: Update inspector proxy Runtime domain to forward evaluate to JSC**

In the Runtime domain handler within `inspector-proxy.js`, change `Runtime.evaluate` to forward to the app instead of ignoring it:

```js
// In the Runtime domain handler:
case 'evaluate': {
  // Forward to JSC for real evaluation
  const requestId = 'cdp-' + id;
  pendingCDPRequests.set(requestId, {ws, id});
  ctx.sendToApp(JSON.stringify({
    type: 'cdp-request',
    requestId: requestId,
    domain: 'Runtime',
    method: 'evaluate',
    params: params,
  }));
  return null; // Don't send response yet — wait for app
}
```

Add request tracking state:

```js
const pendingCDPRequests = new Map(); // requestId → {ws, id}
```

Handle cdp-response in `handleAppMessage`:

```js
if (message.type === 'cdp-response') {
  const pending = pendingCDPRequests.get(message.requestId);
  if (pending) {
    pendingCDPRequests.delete(message.requestId);
    sendCDP(pending.ws, {id: pending.id, result: message.result});
  }
}
```

**Step 4: Also forward getProperties, callFunctionOn, releaseObject**

Same pattern — forward to app, wait for response:

```js
case 'getProperties':
case 'callFunctionOn':
case 'releaseObject':
case 'releaseObjectGroup':
case 'globalLexicalScopeNames': {
  const requestId = 'cdp-' + id;
  pendingCDPRequests.set(requestId, {ws, id});
  ctx.sendToApp(JSON.stringify({
    type: 'cdp-request',
    requestId,
    domain: 'Runtime',
    method: methodName,
    params,
  }));
  return null;
}
```

**Step 5: Manual integration test**

1. Start dev server: `cd example && npm run dev`
2. Build and run app with `/build-demo`
3. Open `chrome://inspect` in Chrome
4. Click "inspect" on the Falcon target
5. In the Console panel, type `2 + 2` and press Enter
6. Expected: Shows `4` as the result
7. Type `({a: 1, b: [2, 3]})` — should show expandable object
8. Type `undefinedVar` — should show ReferenceError

**Step 6: Commit**

```bash
git add example/scripts/inspector-proxy.js \
       example/scripts/dev-server.js \
       packages/react-dom-native/src/devtools/InspectorMessageHandler.js
git commit -m "feat(devtools): wire Runtime.evaluate through CDP proxy to JSC"
```

---

### Phase 3: Enhanced Console Domain

### Task 4: Improve console forwarding with stack traces and object previews

**Files:**
- Modify: `packages/react-dom-native/src/devtools/ConsoleForwarding.js`
- Modify: `packages/react-dom-native/src/devtools/RuntimeAgent.js` (reuse `toRemoteObject`)

**Step 1: Write the failing test**

Create: `packages/react-dom-native/src/devtools/__tests__/console-forwarding.test.js`

```js
'use strict';

let messages = [];
global.$$sendInspectorMessage = jest.fn(function (json) {
  messages.push(JSON.parse(json));
});
global.$$performanceNow = () => 1234;

describe('ConsoleForwarding', () => {
  beforeEach(() => {
    messages = [];
    global.$$sendInspectorMessage.mockClear();
    jest.resetModules();
    require('../ConsoleForwarding');
  });

  test('console.log with object sends object RemoteObject with objectId', () => {
    console.log({foo: 'bar'});
    expect(messages.length).toBe(1);
    const msg = messages[0];
    expect(msg.args[0].type).toBe('object');
    expect(msg.args[0].objectId).toBeDefined();
  });

  test('console.error includes stack trace', () => {
    console.error('test error');
    expect(messages.length).toBe(1);
    const msg = messages[0];
    expect(msg.stackTrace).toBeDefined();
    expect(msg.stackTrace.callFrames).toBeDefined();
    expect(Array.isArray(msg.stackTrace.callFrames)).toBe(true);
  });

  test('console.log with array sends array subtype', () => {
    console.log([1, 2, 3]);
    expect(messages.length).toBe(1);
    expect(messages[0].args[0].subtype).toBe('array');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=console-forwarding`
Expected: FAIL — objects are currently stringified, not sent as RemoteObjects

**Step 3: Upgrade ConsoleForwarding.js**

Extract `toRemoteObject` from RuntimeAgent into a shared module (`packages/react-dom-native/src/devtools/RemoteObject.js`) and use it in ConsoleForwarding. Also add stack trace capture for `console.error` and `console.warn`:

Create: `packages/react-dom-native/src/devtools/RemoteObject.js`

```js
'use strict';

// ---------------------------------------------------------------------------
// CDP RemoteObject serialization
//
// Converts JS values to CDP Runtime.RemoteObject format.
// Shared by RuntimeAgent (evaluate/getProperties) and ConsoleForwarding.
// ---------------------------------------------------------------------------

var objectStore = {};
var nextObjectId = 1;

function storeObject(value) {
  var id = 'obj-' + nextObjectId++;
  objectStore[id] = value;
  return id;
}

function getStoredObject(id) {
  return objectStore[id];
}

function releaseObject(id) {
  delete objectStore[id];
}

function releaseAll() {
  objectStore = {};
}

function toRemoteObject(value) {
  // ... (move the full toRemoteObject implementation from RuntimeAgent.js here)
}

// Parse a JSC Error().stack string into CDP CallFrame array
function parseStackTrace(stack) {
  if (!stack) return {callFrames: []};
  var lines = stack.split('\n');
  var frames = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // JSC stack format: "functionName@file:line:col" or "@file:line:col"
    var match = line.match(/^(.*)@(.*):(\d+):(\d+)$/);
    if (match) {
      frames.push({
        functionName: match[1] || '',
        scriptId: '0',
        url: match[2] || '',
        lineNumber: parseInt(match[3], 10) - 1, // CDP is 0-based
        columnNumber: parseInt(match[4], 10) - 1,
      });
    }
  }
  return {callFrames: frames};
}

module.exports = {toRemoteObject, storeObject, getStoredObject, releaseObject, releaseAll, parseStackTrace};
```

Update `ConsoleForwarding.js` to use `toRemoteObject` and add stack traces:

```js
'use strict';

var RemoteObject = require('./RemoteObject');

var METHODS = ['log', 'warn', 'error', 'info', 'debug'];
var originals = {};

for (var i = 0; i < METHODS.length; i++) {
  (function (method) {
    originals[method] = console[method];

    console[method] = function () {
      if (originals[method]) {
        originals[method].apply(console, arguments);
      }

      if (typeof $$sendInspectorMessage !== 'function') {
        return;
      }

      var args = [];
      for (var j = 0; j < arguments.length; j++) {
        args.push(RemoteObject.toRemoteObject(arguments[j]));
      }

      var cdpType = method;
      if (method === 'warn') cdpType = 'warning';

      var msg = {
        type: 'console-message',
        cdpType: cdpType,
        args: args,
        timestamp: typeof $$performanceNow === 'function' ? $$performanceNow() : Date.now(),
      };

      // Include stack trace for errors and warnings
      if (method === 'error' || method === 'warn') {
        try {
          msg.stackTrace = RemoteObject.parseStackTrace(new Error().stack);
          // Remove the first frame (this wrapper function)
          if (msg.stackTrace.callFrames.length > 0) {
            msg.stackTrace.callFrames.shift();
          }
        } catch (e) {}
      }

      $$sendInspectorMessage(JSON.stringify(msg));
    };
  })(METHODS[i]);
}
```

Update `RuntimeAgent.js` to import from `RemoteObject.js` instead of having its own copy.

**Step 4: Run tests**

Run: `npm test -- --testPathPattern="(console-forwarding|runtime-agent)"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/react-dom-native/src/devtools/RemoteObject.js \
       packages/react-dom-native/src/devtools/ConsoleForwarding.js \
       packages/react-dom-native/src/devtools/RuntimeAgent.js \
       packages/react-dom-native/src/devtools/__tests__/console-forwarding.test.js
git commit -m "feat(devtools): enhanced console forwarding with object previews and stack traces"
```

---

### Phase 4: Log Domain

### Task 5: Implement CDP Log domain for structured log entries

The Log domain complements console — it provides structured log entries with source/level/timestamp that appear in the DevTools "Issues" panel.

**Files:**
- Modify: `example/scripts/inspector-proxy.js` (add Log domain handler)

**Step 1: Add Log domain to inspector proxy**

```js
function createLogDomain() {
  let enabled = false;
  return {
    name: 'Log',
    handle(method, params, ctx) {
      switch (method) {
        case 'enable':
          enabled = true;
          return {};
        case 'disable':
          enabled = false;
          return {};
        case 'clear':
          return {};
        case 'startViolationsReport':
          return {};
        case 'stopViolationsReport':
          return {};
        default:
          return {};
      }
    },
    isEnabled() { return enabled; },
  };
}
```

Wire error messages from the app as `Log.entryAdded` events:

```js
// In handleAppMessage, when message.type === 'console-message' and cdpType is 'error':
if (message.cdpType === 'error' && logDomain.isEnabled()) {
  for (const client of cdpClients) {
    sendCDP(client, {
      method: 'Log.entryAdded',
      params: {
        entry: {
          source: 'javascript',
          level: 'error',
          text: message.args.map(a => a.value || a.description || '').join(' '),
          timestamp: message.timestamp || Date.now(),
          stackTrace: message.stackTrace || {callFrames: []},
        },
      },
    });
  }
}
```

**Step 2: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "feat(devtools): add CDP Log domain for structured error entries"
```

---

### Phase 5: Memory & Heap Info

### Task 6: Add memory stats via Swift bridge

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`
- Modify: `packages/react-dom-native/src/devtools/RuntimeAgent.js`
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Add $$getMemoryUsage to Swift bridge**

In `Bindings.swift`, inside `registerDevTools()`:

```swift
// Memory usage via mach_task_basic_info
engine.setGlobalFunction("$$getMemoryUsage") { [weak self] () -> JSValue in
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
        }
    }
    let ctx = self?.engine.context ?? JSContext()
    if result == KERN_SUCCESS {
        let dict = JSValue(newObjectIn: ctx)!
        dict.setValue(info.resident_size, forProperty: "usedSize")
        dict.setValue(info.virtual_size, forProperty: "totalSize")
        return dict
    }
    let dict = JSValue(newObjectIn: ctx)!
    dict.setValue(0, forProperty: "usedSize")
    dict.setValue(0, forProperty: "totalSize")
    return dict
}
```

**Step 2: Handle Runtime.getHeapUsage in RuntimeAgent.js**

```js
// In RuntimeAgent.js, add to the switch:
case 'getHeapUsage': {
  var mem = {usedSize: 0, totalSize: 0};
  if (typeof $$getMemoryUsage === 'function') {
    var info = $$getMemoryUsage();
    if (info) {
      mem.usedSize = info.usedSize || 0;
      mem.totalSize = info.totalSize || 0;
    }
  }
  result = mem;
  break;
}
```

**Step 3: Update proxy to forward getHeapUsage to app**

Add `getHeapUsage` to the list of methods forwarded to JSC in the Runtime domain handler.

**Step 4: Manual test**

In Chrome DevTools Console, check the Memory panel or run:
`chrome.devtools.inspectedWindow.eval("performance.memory")` — should show real memory values instead of zeros.

**Step 5: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift \
       packages/react-dom-native/src/devtools/RuntimeAgent.js \
       example/scripts/inspector-proxy.js
git commit -m "feat(devtools): real memory stats via mach_task_basic_info"
```

---

### Phase 6: Network Domain (Fetch Interception)

### Task 7: Implement Network domain via fetch/XMLHttpRequest interception

**Files:**
- Create: `packages/react-dom-native/src/devtools/NetworkAgent.js`
- Modify: `packages/react-dom-native/src/devtools/InspectorMessageHandler.js`
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Write the failing test**

Create: `packages/react-dom-native/src/devtools/__tests__/network-agent.test.js`

```js
'use strict';

let messages = [];
global.$$sendInspectorMessage = jest.fn(function (json) {
  messages.push(JSON.parse(json));
});
global.$$performanceNow = () => 1234;

// Mock fetch
const originalFetch = global.fetch;
global.fetch = jest.fn(() =>
  Promise.resolve({
    status: 200,
    statusText: 'OK',
    headers: {get: () => 'application/json', entries: () => []},
    text: () => Promise.resolve('{"ok":true}'),
  }),
);

describe('NetworkAgent', () => {
  beforeEach(() => {
    messages = [];
    global.$$sendInspectorMessage.mockClear();
    jest.resetModules();
    require('../NetworkAgent');
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('intercepted fetch emits requestWillBeSent and responseReceived', async () => {
    await fetch('https://example.com/api');

    const requestMsg = messages.find(
      m => m.type === 'cdp-event' && m.method === 'Network.requestWillBeSent',
    );
    expect(requestMsg).toBeDefined();
    expect(requestMsg.params.request.url).toBe('https://example.com/api');

    const responseMsg = messages.find(
      m => m.type === 'cdp-event' && m.method === 'Network.responseReceived',
    );
    expect(responseMsg).toBeDefined();
    expect(responseMsg.params.response.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=network-agent`
Expected: FAIL — module not found

**Step 3: Implement NetworkAgent.js**

```js
'use strict';

// ---------------------------------------------------------------------------
// Network Agent (in-JSC)
//
// Intercepts globalThis.fetch to emit CDP Network domain events:
//   Network.requestWillBeSent — when a request starts
//   Network.responseReceived  — when a response arrives
//   Network.loadingFinished   — when response body is read
//
// Events are sent as {type: 'cdp-event', method, params} via
// $$sendInspectorMessage, and the inspector proxy broadcasts them
// to connected DevTools clients.
// ---------------------------------------------------------------------------

var nextRequestId = 1;
var originalFetch = globalThis.fetch;

function emitCDPEvent(method, params) {
  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-event',
      method: method,
      params: params,
    }));
  }
}

function now() {
  return typeof $$performanceNow === 'function' ? $$performanceNow() / 1000 : Date.now() / 1000;
}

if (typeof originalFetch === 'function') {
  globalThis.fetch = function (input, init) {
    var requestId = String(nextRequestId++);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = (init && init.method) || 'GET';
    var timestamp = now();

    emitCDPEvent('Network.requestWillBeSent', {
      requestId: requestId,
      loaderId: requestId,
      documentURL: '',
      request: {
        url: url,
        method: method.toUpperCase(),
        headers: (init && init.headers) || {},
        postData: (init && init.body) ? String(init.body) : undefined,
      },
      timestamp: timestamp,
      wallTime: Date.now() / 1000,
      initiator: {type: 'script'},
      type: 'Fetch',
    });

    return originalFetch.apply(globalThis, arguments).then(function (response) {
      var responseTimestamp = now();

      // Collect response headers
      var headers = {};
      try {
        if (response.headers && typeof response.headers.entries === 'function') {
          var entries = response.headers.entries();
          var entry = entries.next();
          while (!entry.done) {
            headers[entry.value[0]] = entry.value[1];
            entry = entries.next();
          }
        }
      } catch (e) {}

      emitCDPEvent('Network.responseReceived', {
        requestId: requestId,
        loaderId: requestId,
        timestamp: responseTimestamp,
        type: 'Fetch',
        response: {
          url: url,
          status: response.status,
          statusText: response.statusText || '',
          headers: headers,
          mimeType: headers['content-type'] || '',
        },
      });

      emitCDPEvent('Network.loadingFinished', {
        requestId: requestId,
        timestamp: responseTimestamp,
        encodedDataLength: 0,
      });

      return response;
    }).catch(function (error) {
      emitCDPEvent('Network.loadingFailed', {
        requestId: requestId,
        timestamp: now(),
        type: 'Fetch',
        errorText: String(error),
      });
      throw error;
    });
  };
}
```

**Step 4: Run test**

Run: `npm test -- --testPathPattern=network-agent`
Expected: PASS

**Step 5: Wire CDP events through the proxy**

In `inspector-proxy.js`, add handling for `cdp-event` messages in `handleAppMessage`:

```js
if (message.type === 'cdp-event') {
  // Broadcast CDP event from app to all connected DevTools clients
  for (const client of cdpClients) {
    sendCDP(client, {
      method: message.method,
      params: message.params,
    });
  }
}
```

In `dev-server.js`, forward `cdp-event` messages to the proxy:

```js
if (message.type === 'cdp-event' && inspectorProxy) {
  inspectorProxy.handleAppMessage(text);
}
```

Add a Network domain handler to the proxy:

```js
function createNetworkDomain() {
  return {
    name: 'Network',
    handle(method, params, ctx) {
      switch (method) {
        case 'enable': return {};
        case 'disable': return {};
        case 'setCacheDisabled': return {};
        case 'setExtraHTTPHeaders': return {};
        default: return {};
      }
    },
  };
}
```

**Step 6: Commit**

```bash
git add packages/react-dom-native/src/devtools/NetworkAgent.js \
       packages/react-dom-native/src/devtools/__tests__/network-agent.test.js \
       example/scripts/inspector-proxy.js \
       example/scripts/dev-server.js
git commit -m "feat(devtools): Network domain via fetch interception"
```

---

### Phase 7: Safari Web Inspector Integration (Breakpoint Debugging)

### Task 8: Enable JSContext.isInspectable for Safari debugging

This is the simplest and most powerful debugging feature — full breakpoint debugging via Safari Web Inspector.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Enable inspectable context**

In `Bindings.swift`, in the JSRuntime initialization code (or in `registerDevTools()`):

```swift
#if DEBUG
engine.context.isInspectable = true
engine.context.name = "Falcon — react-dom-native"
#endif
```

This is likely already partially done. Verify and ensure:
1. The `isInspectable` property is set to `true` in debug builds
2. The `name` property is set to something descriptive
3. The `JSContext` is the one used for the React runtime (not a throwaway context)

**Step 2: Document how to connect Safari**

Add instructions to the dev server console output:

```js
// In dev.js, after the CDP proxy info:
console.log('  [safari] Safari Web Inspector: Develop → Simulator → Falcon JSC');
console.log('           (Breakpoints, stepping, scope inspection)');
```

**Step 3: Manual test**

1. Build and run with `/build-demo`
2. Open Safari → Develop menu → Simulator → find "Falcon — react-dom-native"
3. Click to open Web Inspector
4. Go to Sources tab — should see the bundled JS
5. Set a breakpoint in a component render function
6. Trigger a render (tap a counter)
7. Execution should pause at the breakpoint

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift \
       example/scripts/dev.js
git commit -m "feat(devtools): enable Safari Web Inspector for breakpoint debugging"
```

---

### Phase 8: Source Maps

### Task 9: Source map support for stack traces

Stack traces from JSC reference the bundled `bundle.js` with bundled line numbers. Source maps let DevTools show original source locations.

**Files:**
- Modify: `example/scripts/builder.js` (ensure source maps are generated)
- Modify: `example/scripts/inspector-proxy.js` (serve source maps, rewrite URLs)

**Step 1: Verify esbuild generates source maps**

Check that the builder already creates a `.map` file. If not, add `sourcemap: true` to the esbuild config.

**Step 2: Serve source maps from the inspector proxy**

Add an HTTP endpoint to serve the source map:

```js
// In the HTTP server handler:
if (url === '/bundle.js.map') {
  try {
    const fs = require('fs');
    const mapPath = path.join(exampleDir, 'build', 'bundle.js.map');
    const content = fs.readFileSync(mapPath, 'utf8');
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Source map not found');
  }
  return;
}
```

**Step 3: Add Debugger.getScriptSource support**

When DevTools requests source for a script, serve it from the build output:

```js
function createDebuggerDomain() {
  return {
    name: 'Debugger',
    handle(method, params, ctx) {
      switch (method) {
        case 'enable':
          return {debuggerId: 'falcon-debugger-1'};
        case 'disable':
          return {};
        case 'getScriptSource':
          // Return source from build output
          // In a real implementation, read from the build directory
          return {scriptSource: ''};
        case 'setPauseOnExceptions':
          return {};
        case 'setAsyncCallStackDepth':
          return {};
        case 'setBlackboxPatterns':
          return {};
        default:
          return {};
      }
    },
  };
}
```

**Step 4: Emit Debugger.scriptParsed on connect**

When a DevTools client connects and sends `Debugger.enable`, emit a `scriptParsed` event for the bundle:

```js
case 'enable':
  // Emit scriptParsed for the main bundle
  ctx.sendCDPEvent(ws, {
    method: 'Debugger.scriptParsed',
    params: {
      scriptId: '1',
      url: 'http://localhost:6000/bundle.js',
      startLine: 0,
      startColumn: 0,
      endLine: 999999,
      endColumn: 0,
      hash: '',
      sourceMapURL: 'http://localhost:6000/bundle.js.map',
    },
  });
  return {debuggerId: 'falcon-debugger-1'};
```

**Step 5: Commit**

```bash
git add example/scripts/inspector-proxy.js example/scripts/builder.js
git commit -m "feat(devtools): source map support for stack trace resolution"
```

---

### Phase 9: React DevTools Integration

### Task 10: Bridge React DevTools Fiber inspection to CDP

Expand the `__REACT_DEVTOOLS_GLOBAL_HOOK__` shim to capture Fiber tree data and expose it via CDP.

**Files:**
- Modify: `packages/react-dom-native/src/devtools/DevToolsHookShim.js`
- Create: `packages/react-dom-native/src/devtools/ReactDevToolsAgent.js`

**Step 1: Expand the hook to capture Fiber commits**

```js
'use strict';

// React DevTools global hook — captures Fiber tree commits for inspection.
// Must load before React.

var renderers = new Map();
var fiberRoots = new Map(); // rendererId → Set of FiberRoot

globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true,
  isDisabled: false,
  inject: function (renderer) {
    var id = renderers.size + 1;
    renderers.set(id, renderer);
    fiberRoots.set(id, new Set());
    return id;
  },
  onCommitFiberRoot: function (rendererId, fiberRoot, priorityLevel) {
    var roots = fiberRoots.get(rendererId);
    if (roots) {
      roots.add(fiberRoot);
    }
  },
  onCommitFiberUnmount: function (rendererId, fiber) {},
  onScheduleFiberRoot: function (rendererId, root) {},

  // Expose for ReactDevToolsAgent
  _renderers: renderers,
  _fiberRoots: fiberRoots,
};
```

**Step 2: Create ReactDevToolsAgent.js**

This agent exposes React component tree data via CDP custom domain methods (e.g., `Runtime.evaluate` with React-specific expressions). It doesn't implement a full React DevTools backend — that would require the `react-devtools-shared` package. Instead, it provides a lightweight way to inspect the component tree from the Console panel.

```js
'use strict';

// ---------------------------------------------------------------------------
// React DevTools Agent
//
// Exposes $$getComponentTree() in the JSC global scope, allowing
// Chrome DevTools Console users to inspect the React component tree.
// ---------------------------------------------------------------------------

globalThis.$$getComponentTree = function () {
  var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || !hook._fiberRoots) return null;

  var trees = [];
  hook._fiberRoots.forEach(function (roots) {
    roots.forEach(function (root) {
      if (root.current) {
        trees.push(fiberToTree(root.current, 0));
      }
    });
  });
  return trees;
};

function fiberToTree(fiber, depth) {
  if (!fiber || depth > 20) return null; // Prevent infinite recursion

  var name = null;
  if (typeof fiber.type === 'function') {
    name = fiber.type.displayName || fiber.type.name || 'Anonymous';
  } else if (typeof fiber.type === 'string') {
    name = fiber.type;
  }

  var node = {
    name: name,
    tag: fiber.tag,
    key: fiber.key,
  };

  // Include props for host elements (tag 5) and function components (tag 0)
  if (fiber.memoizedProps && (fiber.tag === 5 || fiber.tag === 0)) {
    try {
      var propKeys = Object.keys(fiber.memoizedProps);
      node.props = {};
      for (var i = 0; i < propKeys.length && i < 10; i++) {
        var k = propKeys[i];
        var v = fiber.memoizedProps[k];
        if (typeof v !== 'function' && typeof v !== 'object') {
          node.props[k] = v;
        }
      }
    } catch (e) {}
  }

  // Recurse into children
  var children = [];
  var child = fiber.child;
  while (child) {
    var childNode = fiberToTree(child, depth + 1);
    if (childNode) children.push(childNode);
    child = child.sibling;
  }
  if (children.length > 0) node.children = children;

  return node;
}
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/DevToolsHookShim.js \
       packages/react-dom-native/src/devtools/ReactDevToolsAgent.js
git commit -m "feat(devtools): React component tree inspection via $$getComponentTree()"
```

---

### Phase 10: Error Overlay Integration

### Task 11: Forward uncaught exceptions as CDP events

**Files:**
- Create: `packages/react-dom-native/src/devtools/ExceptionReporter.js`
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Implement ExceptionReporter.js**

```js
'use strict';

// ---------------------------------------------------------------------------
// Exception Reporter
//
// Captures unhandled exceptions and promise rejections, forwarding them
// as Runtime.exceptionThrown CDP events to Chrome DevTools.
// ---------------------------------------------------------------------------

var RemoteObject = require('./RemoteObject');

function reportException(error, context) {
  if (typeof $$sendInspectorMessage !== 'function') return;

  var stackTrace = RemoteObject.parseStackTrace(error && error.stack);
  var text = String(error);

  $$sendInspectorMessage(JSON.stringify({
    type: 'cdp-event',
    method: 'Runtime.exceptionThrown',
    params: {
      timestamp: typeof $$performanceNow === 'function' ? $$performanceNow() : Date.now(),
      exceptionDetails: {
        exceptionId: Date.now(),
        text: 'Uncaught ' + text,
        lineNumber: stackTrace.callFrames.length > 0 ? stackTrace.callFrames[0].lineNumber : 0,
        columnNumber: stackTrace.callFrames.length > 0 ? stackTrace.callFrames[0].columnNumber : 0,
        scriptId: '0',
        url: stackTrace.callFrames.length > 0 ? stackTrace.callFrames[0].url : '',
        stackTrace: stackTrace,
        exception: RemoteObject.toRemoteObject(error),
        executionContextId: 1,
      },
    },
  }));
}

// JSC global error handler
if (typeof globalThis.$$setUncaughtExceptionHandler === 'function') {
  globalThis.$$setUncaughtExceptionHandler(function (error) {
    reportException(error, 'uncaught');
  });
}

// Fallback: override ErrorUtils if available (React Native pattern)
if (typeof globalThis.ErrorUtils !== 'undefined') {
  var originalHandler = globalThis.ErrorUtils.getGlobalHandler();
  globalThis.ErrorUtils.setGlobalHandler(function (error, isFatal) {
    reportException(error);
    if (originalHandler) originalHandler(error, isFatal);
  });
}
```

**Step 2: Add $$setUncaughtExceptionHandler to Swift bridge**

In `Bindings.swift`:

```swift
// Exception handler — called by ExceptionReporter.js
engine.context.exceptionHandler = { [weak self] context, exception in
    guard let exception = exception,
          let handler = context?.globalObject.forProperty("$$uncaughtExceptionHandler") else { return }
    if !handler.isUndefined {
        handler.call(withArguments: [exception])
    }
}

engine.setGlobalFunction("$$setUncaughtExceptionHandler") { (handler: JSValue) -> Void in
    self.engine.context.globalObject.setValue(handler, forProperty: "$$uncaughtExceptionHandler")
}
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/src/devtools/ExceptionReporter.js \
       packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "feat(devtools): forward uncaught exceptions as Runtime.exceptionThrown"
```

---

### Phase 11: Load devtools modules in entry point

### Task 12: Ensure all devtools modules are loaded in order

**Files:**
- Modify: `example/entry/entry.js` (or wherever devtools polyfills are loaded)

**Step 1: Verify load order**

The devtools modules must load in this order (some depend on globals from earlier modules):

```js
// 1. DevToolsHookShim — must load before React
require('react-dom-native/src/devtools/DevToolsHookShim');
// 2. PerformancePolyfill — provides performance.now/mark/measure
require('react-dom-native/src/devtools/PerformancePolyfill');
// 3. PerformanceTracer — provides __PERFORMANCE_TRACER__
require('react-dom-native/src/devtools/PerformanceTracer');
// 4. ConsoleTimeStamp — overrides console.timeStamp (depends on tracer)
require('react-dom-native/src/devtools/ConsoleTimeStamp');
// 5. RemoteObject — shared CDP serialization (loaded as dependency)
// 6. ConsoleForwarding — wraps console methods (depends on RemoteObject)
require('react-dom-native/src/devtools/ConsoleForwarding');
// 7. RuntimeAgent — handles evaluate/getProperties
require('react-dom-native/src/devtools/RuntimeAgent');
// 8. NetworkAgent — intercepts fetch
require('react-dom-native/src/devtools/NetworkAgent');
// 9. ExceptionReporter — uncaught exception forwarding
require('react-dom-native/src/devtools/ExceptionReporter');
// 10. ReactDevToolsAgent — component tree inspection
require('react-dom-native/src/devtools/ReactDevToolsAgent');
// 11. InspectorMessageHandler — must load last (dispatches to all above)
require('react-dom-native/src/devtools/InspectorMessageHandler');
```

**Step 2: Update InspectorMessageHandler to route all message types**

```js
// Updated $$onInspectorMessage:
globalThis.$$onInspectorMessage = function (jsonString) {
  var message;
  try { message = JSON.parse(jsonString); } catch (e) { return; }

  var type = message && message.type;
  if (!type) return;

  if (type === 'start-tracing') {
    if (typeof __PERFORMANCE_TRACER__ !== 'undefined' && !__PERFORMANCE_TRACER__.isTracing()) {
      __PERFORMANCE_TRACER__.startTracing();
    }
  } else if (type === 'stop-tracing') {
    if (typeof __PERFORMANCE_TRACER__ !== 'undefined' && __PERFORMANCE_TRACER__.isTracing()) {
      var events = __PERFORMANCE_TRACER__.stopTracing();
      if (typeof $$sendInspectorMessage === 'function') {
        $$sendInspectorMessage(JSON.stringify({type: 'trace-data', events: events}));
      }
    }
  } else if (type === 'cdp-request') {
    if (typeof $$handleCDPRequest === 'function') {
      $$handleCDPRequest(jsonString);
    }
  }
};
```

**Step 3: Commit**

```bash
git add example/entry/entry.js \
       packages/react-dom-native/src/devtools/InspectorMessageHandler.js
git commit -m "feat(devtools): load all CDP agent modules in entry point"
```

---

## Domain Coverage Summary

After all phases, here's what each CDP domain supports:

| CDP Domain | Support Level | How |
|-----------|---------------|-----|
| **Runtime** | ✅ Full | JS-side agent: evaluate, getProperties, callFunctionOn, consoleAPICalled, exceptionThrown, executionContextCreated, getHeapUsage |
| **Console** | ✅ Full | Console method interception → Runtime.consoleAPICalled events with RemoteObjects and stack traces |
| **Tracing** | ✅ Full | Existing implementation: start/end → Chrome Trace Format events with custom React tracks |
| **Network** | ✅ Basic | fetch() interception: requestWillBeSent, responseReceived, loadingFinished/Failed |
| **Log** | ✅ Basic | Error-level console messages → Log.entryAdded events |
| **Page** | ✅ Stub | getFrameTree, getResourceTree, getNavigationHistory (static responses) |
| **Debugger** | ⚠️ Passthrough | enable/disable, scriptParsed, getScriptSource. **Real debugging via Safari Web Inspector** |
| **Profiler** | ⚠️ Stub | Returns empty profile (real CPU profiling via Safari or Tracing) |
| **HeapProfiler** | ❌ Not implemented | Would need JSC private API access |
| **DOM** | ✅ Stub | getDocument (empty, since this is a native app not a web page) |

## Architecture Diagram (Final State)

```
┌─────────────────────────────────────────────────────────┐
│  Chrome DevTools (chrome://inspect)                      │
│  ├── Console panel ──→ Runtime.evaluate ──→ JSC eval()   │
│  ├── Performance panel ──→ Tracing.start/end ──→ Tracer  │
│  ├── Network panel ──→ Network events ←── fetch hook     │
│  └── Sources panel ──→ source maps ──→ original files    │
└────────────────────┬────────────────────────────────────┘
                     │ CDP WebSocket (9222)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Inspector Proxy (Node.js)                               │
│  ├── Domain Router → Tracing, Runtime, Network, Page,    │
│  │                   DOM, Debugger, Log, Profiler         │
│  ├── Request Tracker (pending CDP ↔ app requests)        │
│  └── HTTP: /json/version, /json/list, /bundle.js.map     │
└────────────────────┬────────────────────────────────────┘
                     │ Internal WS (8082)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Dev Server (Node.js)                                    │
│  ├── Bridges proxy ↔ app messages                        │
│  ├── Hot reload (file watcher → rebuild → reload)        │
│  └── Tracing state tracking (for reconnects)             │
└────────────────────┬────────────────────────────────────┘
                     │ WebSocket
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Falcon App (iOS Simulator / Device)                     │
│  ├── HotReload.swift (WebSocket client)                  │
│  ├── Bindings.swift ($$sendInspectorMessage,             │
│  │   $$performanceNow, $$getMemoryUsage,                 │
│  │   $$setUncaughtExceptionHandler, isInspectable)       │
│  └── JSC Runtime                                         │
│      ├── RuntimeAgent.js (evaluate, getProperties)       │
│      ├── NetworkAgent.js (fetch interception)            │
│      ├── ConsoleForwarding.js (console → CDP events)     │
│      ├── ExceptionReporter.js (uncaught → CDP events)    │
│      ├── PerformanceTracer.js (Chrome Trace Format)      │
│      ├── PerformancePolyfill.js (W3C Performance API)    │
│      ├── DevToolsHookShim.js (Fiber tree capture)        │
│      ├── ReactDevToolsAgent.js ($$getComponentTree)      │
│      ├── RemoteObject.js (CDP type serialization)        │
│      └── InspectorMessageHandler.js (message router)     │
└─────────────────────────────────────────────────────────┘

Safari Web Inspector ←──XPC──→ JSContext (isInspectable=true)
  ├── Full breakpoint debugging
  ├── Step through code
  ├── Scope/variable inspection
  └── Live expression evaluation
```

## What This Plan Does NOT Cover (Future Work)

1. **CDP Debugger domain with breakpoints** — Would require intercepting JSC's WebKit Inspector Protocol messages or reimplementing a JS-level debugger. Safari Web Inspector covers this use case.

2. **HeapProfiler.takeHeapSnapshot** — JSC's heap snapshot API is not exposed through the public C/Swift API. Would need private API access.

3. **CPU Profiler** — JSC has a sampling profiler (`ScriptProfiler` domain) but it speaks WebKit protocol. A WebKit→CDP translation layer for profiling data would be a separate project.

4. **React DevTools full integration** — The `react-devtools-shared` package provides a complete React DevTools backend. Integrating it would give full component tree inspection, prop/state editing, and profiling in the React DevTools standalone app. This is a significant separate effort.

5. **Source map stack trace rewriting** — Currently stack traces show bundled line numbers. A `source-map` npm package integration in the proxy could rewrite them to original source locations before forwarding.

6. **Multi-target support** — If the app creates multiple JSC contexts (e.g., for web workers), each would need its own target in the proxy's `/json/list` response.
