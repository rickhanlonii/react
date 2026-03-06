# Step 3: Client callServer Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Client can invoke server actions interactively — when React calls a server action function, callServer POSTs to the RSC server and updates the UI with the response.

**Architecture:** Add `callServer` callback to the Flight client options. Uses `encodeReply` to serialize args, `$$fetch` (extended in Step 1) to POST, and `createFromReadableStream` to consume the response Flight stream.

**Tech Stack:** JavaScript, react-server-dom-webpack/client.browser, `$$fetch` bridge

**Depends on:** Step 1 (bridge POST support — `$$fetch` accepts `{method, headers, body}`), Step 2 (server POST endpoint returns Flight stream)

---

## Background: How callServer Works

### Flow

1. User interacts with UI (e.g., clicks button that triggers a server action)
2. React calls the server reference function created by `createBoundServerReference` during Flight deserialization
3. That function calls `callServer(id, args)` — the callback we provide
4. `callServer` serializes args via `encodeReply(args)`, POSTs to the RSC server with `rsc-action: <id>` header
5. Server executes the action, re-renders the component, returns a Flight stream
6. Client deserializes the response Flight stream via `createFromReadableStream`
7. React transitions to the new tree from the response

### encodeReply behavior

`encodeReply(args)` returns a `Promise<string | FormData>`:
- **string** — When args contain only JSON-serializable values (strings, numbers, objects, arrays)
- **FormData** — When args contain binary data (TypedArrays, Blobs, Files)

For the initial implementation, we only handle the string case. The FormData case would require multipart encoding support in `$$fetch`, which can be added later.

### createFromReadableStream options

```js
createFromReadableStream(stream, {
  callServer: callServer,      // Required: enables nested server action calls
  debugChannel: { readable },  // Optional: debug info stream
})
```

The `callServer` option must be passed to both the initial Flight stream AND any response streams from server actions. This enables chaining — a server action response can contain server references that, when called, invoke callServer again.

### $$fetch after Step 1

After Step 1 extends the bridge, `$$fetch` supports:
```js
$$fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain', ... },
  body: 'serialized args string',
}, callback)
```
Callback receives `(type, data)` where type is `'data'`, `'end'`, or `'error'`.

---

### Task 1: Implement callServer in entry.js

**Files:**
- Modify: `example/src/entry.js`

**Step 1: Track current fixture name**

The client needs to know which fixture is being rendered so callServer can POST to the correct endpoint (`/fixtures/<name>`). Add a module-level variable and setter.

Add after the `debugDataWriter` / `debugDataClosed` declarations (around line 118, before the `createDebugDataStream` function), or in the section after the data stream helpers:

```js
// ---------------------------------------------------------------------------
// Server Action Support
//
// When React calls a server action (function marked with "use server"),
// the Flight client invokes callServer(actionId, args). We serialize the
// args with encodeReply, POST to the RSC server, and return the
// deserialized response tree via createFromReadableStream.
// ---------------------------------------------------------------------------

var FLIGHT_SERVER = 'http://localhost:6000';

// Track the current fixture name for server action routing.
// Set by SSR bootstrap or by the native side when navigating to a fixture.
var currentFixtureName = null;
```

**Step 2: Add encodeReply import**

Add to the existing imports at the top of the file (after line 41: `var ReactFlightClient = ...`):

```js
var encodeReply = ReactFlightClient.encodeReply;
```

Verified: `encodeReply` is exported from `react-server-dom-webpack/client.browser` (confirmed in `client.browser.development.js:5262`).

**Step 3: Implement callServer**

Add the callServer function in the server action support section:

```js
function callServer(id, args) {
  // Encode the arguments using the Flight reply protocol.
  // encodeReply returns Promise<string | FormData>.
  // For now we only handle the string case (no binary blobs in args).
  return encodeReply(args).then(function(body) {
    var fixtureName = currentFixtureName || 'kitchen-sink';
    var url = FLIGHT_SERVER + '/fixtures/' + fixtureName;

    // Create a ReadableStream that will be fed by the $$fetch callback.
    // We create it eagerly so createFromReadableStream can start consuming
    // while data is still arriving (true streaming).
    var streamController = null;
    var encoder = new TextEncoder();

    var responseStream = new ReadableStream({
      start: function(controller) {
        streamController = controller;
      }
    });

    // Start consuming the response stream immediately.
    // createFromReadableStream returns a thenable (React promise) that
    // resolves to the deserialized React element tree.
    var result = ReactFlightClient.createFromReadableStream(
      responseStream,
      { callServer: callServer }
    );

    // POST to the RSC server.
    // After Step 1, $$fetch accepts (url, options, callback).
    $$fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'rsc-action': id,
        'Content-Type': typeof body === 'string' ? 'text/plain' : 'multipart/form-data',
      },
      body: typeof body === 'string' ? body : '',
    }, function(type, data) {
      if (type === 'error') {
        if (streamController) {
          streamController.error(new Error('Server action failed: ' + data));
        }
        return;
      }
      if (type === 'data') {
        if (streamController && data) {
          streamController.enqueue(encoder.encode(data));
        }
        return;
      }
      if (type === 'end') {
        if (streamController) {
          streamController.close();
          streamController = null;
        }
      }
    });

    return result;
  });
}
```

**Key design decisions:**

1. **Streaming response:** We create a ReadableStream and feed it from the `$$fetch` callback. This supports true streaming — `createFromReadableStream` can start processing Flight rows as they arrive, before the full response is received. This is important for Suspense boundaries that resolve progressively.

2. **No debug channel on action responses:** The action response Flight stream does not include a debug channel. Debug rows are only emitted for the initial page render. The `renderFlightWithDebugChannel` function on the server does include debug data, but the action response stream typically doesn't need it. If needed later, we can add it.

3. **Recursive callServer:** We pass `callServer` to the response's `createFromReadableStream`. This enables server references in the action response to be callable — important for actions that return updated server reference functions.

4. **encodeReply FormData fallback:** When `encodeReply` returns FormData (binary args), we currently send an empty body. This is a known limitation — proper support requires multipart encoding in `$$fetch`. For the initial implementation, only string args are supported. Actions with binary arguments will need a future enhancement.

**Step 4: Pass callServer to createFromReadableStream in renderFromStream and hydrateFromStream**

Update the `globalThis.__REACT_DOM_NATIVE__` object. The `callServer` option tells the Flight client how to handle server references encountered during deserialization. Without it, calling a server action from the client would throw.

In `renderFromStream` (line 253), update `createFromReadableStream`:

```js
var tree = ReactFlightClient.createFromReadableStream(stream, {
  callServer: callServer,
  debugChannel: { readable: createDebugDataStream() },
});
```

In `hydrateFromStream` (line 272), update `createFromReadableStream`:

```js
var tree = ReactFlightClient.createFromReadableStream(stream, {
  callServer: callServer,
  debugChannel: { readable: createDebugDataStream() },
});
```

**Step 5: Expose _setFixtureName on the global API**

Add `_setFixtureName` to the `__REACT_DOM_NATIVE__` object so the SSR server and native side can set it:

```js
// Set the current fixture name for callServer routing
_setFixtureName: function _setFixtureName(name) {
  currentFixtureName = name;
},
```

**Step 6: Commit**

```bash
git add example/src/entry.js
git commit -m "feat: add callServer implementation for interactive server actions"
```

---

### Task 2: Wire fixture name from SSR bootstrap

**Files:**
- Modify: `example/server/ssr-server.js`

**Step 1: Emit fixture name in SSR bootstrap**

When the SSR server renders a fixture, it should emit a JS instruction to set the fixture name on the client so callServer knows where to POST action requests.

In `handleSSR` function (line 88), after the debug bootstrap instruction (line 109: `pendingRows.push(debugBootstrap);`), add:

```js
// Set the fixture name so callServer knows where to POST action requests.
// Extract fixture name from the Flight URL.
var fixtureMatch = flightURL.match(/\/fixtures\/([^/]+)$/);
if (fixtureMatch) {
  var setFixtureJS = JSON.stringify(['JS',
    'globalThis.__REACT_DOM_NATIVE__._setFixtureName(' + JSON.stringify(fixtureMatch[1]) + ')'
  ]) + '\n';
  pendingRows.push(setFixtureJS);
}
```

**Why from flightURL:** The `handleSSR` function receives `flightURL` as its first parameter (e.g., `FLIGHT_SERVER + '/fixtures/' + req.params.name`). We extract the fixture name from this URL rather than from `req.params.name` because `handleSSR` is also called from the root route (`/ssr` -> `FLIGHT_SERVER + '/'`) where there's no fixture name. The regex match ensures we only set the name when a fixture is being rendered.

**Step 2: Also set fixture name in the resume path**

In the `POST /resume/:name` handler (line 469), add the same instruction. After the Flight bootstrap rows are set up (inside the `onShellReady` callback), add:

Actually, looking at the code more carefully, the resume path already has `var name = req.params.name;` available. Add the fixture name instruction to `pendingRows` in the resume handler, after the debug row handling setup:

```js
// Set fixture name for callServer routing during resume
var setFixtureResumeJS = JSON.stringify(['JS',
  'globalThis.__REACT_DOM_NATIVE__._setFixtureName(' + JSON.stringify(name) + ')'
]) + '\n';
pendingRows.push(setFixtureResumeJS);
```

**Step 3: Set fixture name in prerender path**

In the `GET /prerender/:name` handler's `serve` function (line 328), when serving a cached prerender with postponed state, the fixture name instruction should be emitted after the Flight bootstrap rows:

```js
// After the bootstrap rows
res.write(JSON.stringify(['JS',
  'globalThis.__REACT_DOM_NATIVE__._setFixtureName(' + JSON.stringify(name) + ')'
]) + '\n');
```

**Step 4: Commit**

```bash
git add example/server/ssr-server.js
git commit -m "feat: emit fixture name in SSR bootstrap for callServer routing"
```

---

### Task 3: Handle server action response in the React tree

**Files:**
- Modify: `example/src/entry.js`

**Step 1: Integrate action response with the current React root**

The `callServer` function returns a thenable that resolves to the new React element tree from the server. React's `startTransition` mechanism handles this automatically when server actions are triggered from event handlers or transitions. However, for the response to actually update the UI, the returned tree needs to be used.

In the standard Next.js flow:
1. The client-side router intercepts the action response
2. It calls `startTransition(() => { setState(newTree) })` to update the tree
3. React transitions to the new UI

For Falcon's simpler architecture (no client router), the callServer response is consumed by React automatically through the Flight client's server reference mechanism. When a server action is called from within a React tree (e.g., from `useActionState` or a form action), React manages the state update internally using the return value of callServer.

**No code change needed for this task.** React's built-in `useActionState` and `<form action={serverAction}>` patterns automatically handle the callServer return value. The Flight client's `createBoundServerReference` wiring ensures that:
- Calling the action returns a Promise (from callServer)
- React waits for the Promise to resolve
- The resolved value (the new Flight tree) updates the component

**Important:** This means the re-rendered Flight tree from the server must match the expected component structure. The server always re-renders the full fixture, so the client receives a complete replacement tree.

**Step 2: Commit** (skip if no changes)

---

## Edge Cases and Considerations

### Concurrent actions

Multiple actions can fire concurrently (e.g., rapid button clicks). Each callServer invocation creates an independent POST request and ReadableStream. React's transition mechanism handles concurrent updates via its priority system — later actions supersede earlier ones if they're in the same transition.

### Error handling

If the server returns an HTTP error (status >= 400), the `$$fetch` callback receives `type: 'error'`. This propagates through the ReadableStream to `createFromReadableStream`, which rejects the result promise. React surfaces this error through the nearest error boundary.

### Action during navigation

If the user navigates to a different fixture while an action is in flight, the in-flight action's response will try to update a now-stale tree. This is generally safe — React's reconciler handles unmounted trees gracefully. The `currentFixtureName` variable ensures new actions route to the correct fixture.

### Memory: protecting $$fetch callback from GC

The Swift side of `$$fetch` already calls `engine.protect(callback)` and `engine.unprotect(callback)` to prevent the callback from being garbage collected during the async URLSession operation. No additional GC protection is needed on the JS side.

### Server URL configuration

`FLIGHT_SERVER` is hardcoded to `http://localhost:6000`. This works for development. In a future step, this could be made configurable via a bootstrap instruction from the server.

---

## Testing & Verification

### Automated Tests

**Unit tests for callServer (`example/src/__tests__/callserver.test.js`)**

Since `entry.js` is a framework bundle evaluated in JavaScriptCore (not a normal Node module), direct unit testing of `callServer` requires extracting testable logic or mocking the bridge. Create focused tests for the behaviors introduced:

- **`callServer` serializes args via `encodeReply` and creates proper POST request:** Mock `$$fetch` and `encodeReply`, call `callServer('action-id', [1, 'two'])`, verify `encodeReply` was called with `[1, 'two']` and `$$fetch` was called with the correct URL (`http://localhost:6000/fixtures/<name>`), method `POST`, `rsc-action` header set to `'action-id'`, and `Content-Type` of `text/plain`.
- **`callServer` creates a ReadableStream and feeds it from `$$fetch` callback:** Mock `$$fetch` to synchronously invoke its callback with `('data', 'chunk1')`, `('data', 'chunk2')`, `('end', null)`. Verify the ReadableStream passed to `createFromReadableStream` receives both chunks and closes.
- **`callServer` passes `callServer` recursively to `createFromReadableStream` options:** Spy on `ReactFlightClient.createFromReadableStream` and verify the second argument includes `{ callServer: callServer }`.
- **Error handling: when `$$fetch` returns `type: 'error'`, the stream controller errors:** Mock `$$fetch` to invoke callback with `('error', 'network failure')`. Verify the ReadableStream errors, which propagates to the `createFromReadableStream` result.
- **`_setFixtureName` correctly updates `currentFixtureName` used in callServer URL:** Call `_setFixtureName('my-fixture')`, then invoke `callServer`. Verify the `$$fetch` URL is `http://localhost:6000/fixtures/my-fixture`. Call `_setFixtureName('other')` and invoke again; verify URL changes.
- **Default fixture name fallback:** When `currentFixtureName` is null (not set), verify `callServer` uses `'kitchen-sink'` as the fallback in the URL.

**Integration test (after Steps 1-3 are all implemented)**

Create an integration test that exercises the full client-server round trip:
- Start the RSC server (port 6000) with a fixture that exports a server action
- Call `callServer` with the action's ID and test arguments
- Verify the response is a valid Flight stream that can be deserialized into a React element tree
- This can live in `tests/integration/` as `server-action-callserver-itest.js` once the Fantom runner supports server action fixtures

**SSR server tests (`example/server/__tests__/ssr-fixture-name.test.js`)**

- **Fixture name instruction emitted in SSR path:** Render `/ssr/kitchen-sink` and verify the response stream contains a `['JS', ...]` instruction that calls `_setFixtureName('kitchen-sink')`.
- **Fixture name instruction emitted in prerender path:** Request `/prerender/05-nested-suspense` and verify the response includes the `_setFixtureName('05-nested-suspense')` JS instruction.
- **Fixture name instruction emitted in resume path:** POST to `/resume/<name>` and verify the fixture name JS instruction is present in the response.
- **No fixture name instruction for root route:** Render `/ssr` (no fixture name param) and verify no `_setFixtureName` instruction is emitted (the regex on `flightURL` should not match).

**Existing test suites**

- Run `npm test` — all existing unit tests pass (no regressions from adding `encodeReply` import or `callServer` option to `createFromReadableStream`)
- Run `npm run test:fantom` — all Fantom integration tests pass (changes to `entry.js` do not affect hydration or rendering behavior)

### Manual Testing

1. **Build the demo app:** Use `/build demo`
2. **Verify no regressions on basic fixtures:**
   - Navigate through several fixtures in the fixture list
   - Verify each renders correctly: `npm run app:screenshot`
3. **Verify fixture name is set during SSR:**
   - `npm run app:log-start`
   - Navigate to a fixture (e.g., "Staggered Loading")
   - `npm run app:log-read` — look for the `_setFixtureName` call in the JS instruction stream
   - Confirm the fixture name matches the navigated fixture
4. **Verify callServer option is passed to Flight client:**
   - Open any fixture that uses Flight streaming
   - `npm run app:log-start`
   - Load the fixture
   - `npm run app:log-read` — no errors about missing `callServer` or unresolvable server references
5. **Test fixture name updates on navigation:**
   - Navigate to "Kitchen Sink" fixture
   - `npm run app:log-read` — confirm `_setFixtureName('kitchen-sink')` or equivalent
   - Navigate to a different fixture
   - `npm run app:log-read` — confirm the fixture name updated
6. **Add a temporary server action test (for end-to-end callServer validation):**
   - Add a test button in an existing fixture that calls a server action on click
   - Run the app, navigate to the fixture
   - Tap the test button: `npm run app:tap -- <x> <y>`
   - Check RSC server logs (terminal running `npm run dev`) — verify a POST request was received with `rsc-action` header
   - `npm run app:screenshot` — verify the UI updated with the server action response
   - Remove the temporary test button after verification

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly (spot-check 3-4 fixtures via `npm run app:screenshot`)
- [ ] Staggered Loading prerender loads and hydrates correctly
- [ ] Counter in Staggered Loading can be incremented after hydration
- [ ] Flight stream deserialization works — adding `callServer` option to `createFromReadableStream` does not break existing fixture rendering
- [ ] SSR instruction stream format unchanged for non-action-related elements
- [ ] `npm test` passes
- [ ] `npm run test:fantom` passes
- [ ] No JavaScript errors in app console during normal fixture navigation (`npm run app:log-start` then `npm run app:log-read`)
- [ ] Debug channel still works (DevTools tab information flows correctly — the `debugChannel` option is preserved alongside the new `callServer` option)
- [ ] `_setFixtureName` does not interfere with non-fixture rendering (root route `/ssr` still works)

### Smoke Test: Staggered Loading

Verify the full SSR -> hydration -> interaction pipeline works after the `callServer` and fixture name changes:

1. Start dev server: `cd example && npm run dev`
2. Load Staggered Loading via partial prerender: navigate to "Staggered Loading" in the fixture list
3. **Verify parallel hydration:**
   - `npm run app:log-start` before loading
   - Load the fixture
   - `npm run app:log-read` — confirm hydration messages appear while later Suspense boundaries are still pending
   - Specifically: hydration should start processing Section 1 content before Section 4's 3000ms delay completes
4. **Verify counter interactivity:**
   - Find Counter button: `npm run app:snapshot-ui -- --filter Counter` or `-- --filter increment`
   - Tap increment button: `npm run app:tap -- <x> <y>` (using coordinates from snapshot)
   - Verify value changes from 0 to 1: `npm run app:snapshot-ui -- --filter "0"` then `-- --filter "1"`
   - Tap again — verify it changes from 1 to 2
5. **Verify all sections load:**
   - Wait for all 4 sections to stream in (~3 seconds for Section 4)
   - `npm run app:screenshot` — no skeleton placeholders should remain
6. **Verify fixture name was set:**
   - `npm run app:log-read` — confirm `_setFixtureName('05-nested-suspense')` appeared in the bootstrap instructions
