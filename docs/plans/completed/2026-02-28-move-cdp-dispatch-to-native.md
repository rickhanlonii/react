# Move CDP Dispatch to Native Swift

## Problem

CDP requests (Runtime, DOM, CSS, Profiler) arrive in Swift via `$$onInspectorMessage`, cross into JS just to dispatch, JS calls back into Swift `$$` bridge functions, then sends the response back through Swift. That's 4 Swift↔JS boundary crossings for what could be 0 (for DOM/CSS/Profiler) or 1 (for Runtime.evaluate).

## Current Flow

```
Swift receives cdp-request
  → Swift calls JS $$handleCDPRequest(json)        // crossing 1
    → JS dispatches to RuntimeAgent/DOMAgent
      → JS calls $$getDocumentTree() etc.           // crossing 2 (back to Swift)
      → Swift returns result to JS                   // crossing 3 (back to JS)
    → JS calls $$sendInspectorMessage(response)      // crossing 4 (back to Swift)
  → Swift sends response via WebSocket
```

## Target Flow

```
Swift receives cdp-request
  → Swift switches on domain/method
  → For DOM/CSS/Profiler: Swift calls Bindings methods directly, responds immediately (0 crossings)
  → For Runtime.evaluate: Swift calls engine.evaluate(), then JS $$toRemoteObject() (1 crossing)
  → For Runtime.getProperties/callFunctionOn: Swift calls JS helper (1 crossing)
  → Swift sends response via WebSocket
```

## Plan

### Step 1: Extract RemoteObject to a minimal JS helper

Strip `RemoteObject.js` down to just what Swift needs to call:

- `$$toRemoteObject(value)` — serialize any JS value to CDP RemoteObject format
- `$$getStoredObject(objectId)` — retrieve a stored object by ID
- `$$releaseObject(objectId)` — release a stored object
- `$$releaseAllObjects()` — release all stored objects
- `$$getOwnProperties(objectId, ownOnly)` — return CDP-formatted property list for a stored object
- `$$callFunctionOn(objectId, fnDecl, argsJson)` — eval function, apply to stored object, return RemoteObject

Register these as `$$` globals in the bundle (like existing `$$` functions). This keeps all JS-value introspection in JS where it belongs, but eliminates the dispatch/routing layer.

### Step 2: Handle CDP dispatch in Swift's `$$onInspectorMessage`

Expand the existing `case "cdp-request"` in JSRuntime.swift to switch on `domain` and `method`:

```swift
case "cdp-request":
    let domain = message["domain"] as? String ?? ""
    let method = message["method"] as? String ?? ""
    let params = message["params"] as? [String: Any] ?? [:]
    let requestId = message["requestId"] as? String ?? ""

    let result: [String: Any]

    switch (domain, method) {
    // --- DOM domain (direct Swift, no JS crossing) ---
    case ("DOM", "enable"), ("DOM", "disable"):
        result = [:]
    case ("DOM", "getDocument"):
        result = bindings.getDocumentTree(surfaceId: 0)
    case ("DOM", "getOuterHTML"):
        result = bindings.getOuterHTML(nodeId: params["nodeId"])
    case ("DOM", "getBoxModel"):
        result = bindings.getBoxModel(nodeId: params["nodeId"])
    case ("DOM", "highlightNode"):
        bindings.highlightNode(nodeId: params["nodeId"])
        result = [:]
    case ("DOM", "hideHighlight"):
        bindings.hideHighlight()
        result = [:]
    // ... other DOM methods

    // --- CSS domain (direct Swift, no JS crossing) ---
    case ("CSS", "getComputedStyleForNode"):
        result = bindings.getComputedStyle(nodeId: params["nodeId"])
    case ("CSS", "getInlineStylesForNode"):
        result = bindings.getInlineStyle(nodeId: params["nodeId"])
    // ... other CSS methods

    // --- Profiler domain (direct Swift, no JS crossing) ---
    case ("Profiler", "start"):
        profilerStartTime = CACurrentMediaTime() * 1_000_000
        result = [:]
    case ("Profiler", "stop"):
        let endTime = CACurrentMediaTime() * 1_000_000
        result = ["profile": ["nodes": [...], "startTime": profilerStartTime, "endTime": endTime, ...]]
    case ("Profiler", "setSamplingInterval"):
        result = [:]

    // --- Runtime domain ---
    case ("Runtime", "evaluate"):
        // 1 JS crossing: evaluate + serialize result
        let jsResult = engine.evaluate(params["expression"])
        let remoteObj = engine.callFunction("$$toRemoteObject", args: [jsResult])
        result = ["result": remoteObj]
    case ("Runtime", "getProperties"):
        // 1 JS crossing: get properties from stored object
        let props = engine.callFunction("$$getOwnProperties", args: [objectId, ownOnly])
        result = ["result": props]
    case ("Runtime", "callFunctionOn"):
        // 1 JS crossing: call function on stored object
        let callResult = engine.callFunction("$$callFunctionOn", args: [objectId, fnDecl, argsJson])
        result = ["result": callResult]
    case ("Runtime", "releaseObject"):
        engine.callFunction("$$releaseObject", args: [objectId])
        result = [:]
    case ("Runtime", "releaseObjectGroup"):
        engine.callFunction("$$releaseAllObjects", args: [])
        result = [:]
    case ("Runtime", "getHeapUsage"):
        result = bindings.getMemoryUsage()  // direct Swift
    case ("Runtime", "globalLexicalScopeNames"):
        result = ["names": []]
    case ("Runtime", "compileScript"):
        result = [:]

    default:
        result = [:]
    }

    // Send response directly — no JS $$sendInspectorMessage needed
    let response: [String: Any] = ["type": "cdp-response", "requestId": requestId, "result": result]
    sendInspectorMessage(response)
```

### Step 3: Expose Bindings methods for direct Swift access

The `$$` bridge functions are currently registered as JS globals. Refactor Bindings.swift to expose the underlying logic as Swift methods that return `[String: Any]` dictionaries, so JSRuntime can call them directly:

- `bindings.getDocumentTree(surfaceId:) -> [String: Any]`
- `bindings.getOuterHTML(nodeId:) -> [String: Any]`
- `bindings.getBoxModel(nodeId:) -> [String: Any]`
- `bindings.getComputedStyle(nodeId:) -> [String: Any]`
- `bindings.getInlineStyle(nodeId:) -> [String: Any]`
- `bindings.highlightNode(nodeId:)`
- `bindings.hideHighlight()`
- `bindings.getMemoryUsage() -> [String: Any]`

The existing `$$` JS globals can either be removed (if nothing else calls them from JS) or kept as thin wrappers that call these same Swift methods.

### Step 4: Handle Runtime.evaluate error wrapping in Swift

Move the try/catch + exceptionDetails formatting to Swift:

```swift
case ("Runtime", "evaluate"):
    // Call a JS helper that evals and serializes in one shot,
    // including try/catch for error handling
    let evalResult = engine.callFunction("$$evaluateForCDP", args: [expression, returnByValue])
    result = evalResult  // already has {result: RemoteObject} or {result, exceptionDetails}
```

The `$$evaluateForCDP` helper combines eval + RemoteObject serialization + error handling in a single JS call, keeping it to exactly 1 crossing.

### Step 5: Delete JS dispatch files

Remove:
- `src/devtools/RuntimeAgent.js` — dispatch logic moved to Swift, eval/properties/callFunctionOn handled by `$$` helpers
- `src/devtools/DOMAgent.js` — fully replaced by direct Swift calls
- `src/devtools/RemoteObject.js` — replaced by `$$toRemoteObject` and friends registered in the bundle

Keep:
- `src/devtools/DevToolsHookShim.js` — React hook shim (unrelated)
- `src/devtools/ReactDevToolsAgent.js` — `$$getComponentTree` console helper (unrelated)
- `src/devtools/ReactDevToolsSetup.js` — DevTools backend connection (unrelated)

### Step 6: Update tests

- `__tests__/runtime-agent.test.js` — rewrite to test the new `$$evaluateForCDP`, `$$toRemoteObject`, `$$getOwnProperties`, `$$callFunctionOn` helpers directly
- `__tests__/trace-format.test.js` — unchanged (tests trace event format, not CDP dispatch)

## Result

| Domain | Before | After |
|--------|--------|-------|
| DOM (all methods) | 4 crossings | 0 crossings |
| CSS (all methods) | 4 crossings | 0 crossings |
| Profiler (start/stop) | 4 crossings | 0 crossings |
| Runtime.getHeapUsage | 4 crossings | 0 crossings |
| Runtime.evaluate | 4 crossings | 1 crossing |
| Runtime.getProperties | 4 crossings | 1 crossing |
| Runtime.callFunctionOn | 4 crossings | 1 crossing |
| Runtime.releaseObject | 4 crossings | 1 crossing |

3 JS files deleted, CDP dispatch fully in Swift, JS only used for what requires live JS value introspection.
