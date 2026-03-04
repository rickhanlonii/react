# Step 2: Server Action Infrastructure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** RSC server can receive, decode, execute server actions and return a new Flight stream.

**Architecture:** Register `'use server'` functions via `node-register` (already active at `server.js:15`), build a server manifest for `decodeReply`/`decodeAction`, add POST endpoint to server.js.

**Tech Stack:** Node.js, Express, react-server-dom-webpack/server.node

**Depends on:** Step 1 (bridge POST support — extends `$$fetch` to accept method/body)

---

## Background: How Server Actions Work in React

### Manifest format

`resolveServerReference(bundlerConfig, id)` (in `react-server-dom-webpack-server.node.development.js:4394`) looks up the manifest in two ways:

1. **Full ID lookup:** `bundlerConfig[fullId]` where `fullId` = `"file:///path/to/module.js#exportName"`
2. **Module-level lookup:** If full ID not found, splits at last `#` and looks up `bundlerConfig[modulePath]`

Each manifest entry must have shape: `{ id: string, chunks: string[], name: string }`

`resolveServerReference` returns a metadata array: `[moduleId, chunks, exportName]`

### Module resolution

`requireModule(metadata)` (line 4458) calls `__webpack_require__(metadata[0])` to load the module, then accesses `metadata[2]` (the export name) on the result.

`preloadModule(metadata)` (line 4430) calls `__webpack_chunk_load__` for each chunk ID. For server-side execution with Node.js require(), chunks are empty and `__webpack_chunk_load__` returns `Promise.resolve()`.

### decodeReply vs decodeAction

- **`decodeReply(body, serverManifest)`** — Used for interactive callServer (Step 3). The client sends a serialized args string via `encodeReply`. `decodeReply` accepts either a string (wraps in FormData internally) or FormData. Returns a Promise of the decoded args array.
- **`decodeAction(body, serverManifest)`** — Used for MPA form POSTs (Step 5). The FormData has `$ACTION_ID_<id>` or `$ACTION_REF_<idx>` keys. Returns a Promise of `fn.bind(null, formData)`.
- **`decodeFormState(actionResult, body, serverManifest)`** — Used for progressive enhancement. Returns `[result, keyPath, refId, boundArgsCount]` or null.

### node-register behavior (already active)

`node-register` (`cjs/react-server-dom-webpack-node-register.js`) monkey-patches `Module.prototype._compile`. For `'use server'` files, it:
1. Compiles the module normally (runs the code)
2. For each exported function, calls `registerServerReference(fn, fileUrl, exportName)` where `fileUrl = url.pathToFileURL(filename).href`
3. This sets `fn.$$typeof = Symbol.for('react.server.reference')` and `fn.$$id = fileUrl + "#" + exportName` (or `fileUrl` if `exportName === null`)

### Verified API exports

From `node_modules/react-server-dom-webpack/server.node.js`:
```
renderToPipeableStream, renderToReadableStream
decodeReply, decodeReplyFromBusboy, decodeReplyFromAsyncIterable
decodeAction, decodeFormState
registerServerReference, registerClientReference
createClientModuleProxy, createTemporaryReferenceSet
```

---

### Task 1: Set up webpack globals on RSC server

**Files:**
- Modify: `example/server/server.js`

**Step 1: Add webpack globals for server action resolution**

`decodeReply` internally calls `resolveServerReference` -> `requireModule` which uses `__webpack_require__`. `preloadModule` uses `__webpack_chunk_load__`. Since the RSC server runs Node.js (not webpack), we need to define these globals.

Note: `url` module is not currently required in `server.js`, so add it.

Add after the existing `require` statements at the top of `server.js` (after line 20: `var React = require('react');`):

```js
var url = require('url');

// __webpack_require__ and __webpack_chunk_load__ — needed by decodeReply/decodeAction
// to resolve server action modules via resolveServerReference -> requireModule.
// The RSC server runs Node.js, so we use require() directly and skip chunk loading.
// Server action IDs are file:// URLs (set by node-register's registerServerReference).
globalThis.__webpack_require__ = function (id) {
  if (id.startsWith('file://')) {
    return require(url.fileURLToPath(id));
  }
  return require(id);
};
globalThis.__webpack_chunk_load__ = function () {
  return Promise.resolve();
};
```

**Step 2: Commit**

```bash
git add example/server/server.js
git commit -m "feat: add webpack globals for server action resolution on RSC server"
```

---

### Task 2: Create server action files

**Files:**
- Create: `example/server/src/actions/todo-actions.js`

**Step 1: Create the todo actions file**

This file belongs in the Step 6 (Todo Demo) plan — creating it here is premature. However, we need at least one `'use server'` file to test the infrastructure. Create a minimal test action:

```js
'use server';

// In-memory todo storage (shared across requests for the demo)
var nextId = 3;
var todos = [
  {id: 1, text: 'Learn React Server Components', completed: true},
  {id: 2, text: 'Build with Server Actions', completed: false},
];

async function addTodo(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {error: 'Text is required'};
  }
  var todo = {id: nextId++, text: text.trim(), completed: false};
  todos.push(todo);
  return {success: true, todo: todo};
}

async function toggleTodo(id) {
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].id === id) {
      todos[i] = Object.assign({}, todos[i], {completed: !todos[i].completed});
      return {success: true};
    }
  }
  return {error: 'Todo not found'};
}

async function deleteTodo(id) {
  var index = -1;
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].id === id) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return {error: 'Todo not found'};
  }
  todos.splice(index, 1);
  return {success: true};
}

function getTodos() {
  return todos.slice();
}

exports.addTodo = addTodo;
exports.toggleTodo = toggleTodo;
exports.deleteTodo = deleteTodo;
exports.getTodos = getTodos;
```

**Important note on `addTodo` signature:** The original plan had `addTodo(formData)` with `formData.get('text')`. This is the MPA/form action pattern where the action receives FormData. For interactive callServer (Step 3), actions receive normal JS arguments instead. The signature should accept a plain string `text` argument for interactive mode. The MPA form action pattern (where actions receive FormData) will be handled in Step 5 — either by having separate form-specific actions or by using `decodeAction` which automatically binds FormData as the first argument.

**Step 2: Verify node-register handles the file**

The RSC server already calls `require('react-server-dom-webpack/node-register')()` at line 15. When our actions file is required, `node-register` will:
1. Detect the `'use server'` directive
2. Compile the module normally (runs the code, populating exports)
3. For each exported function, call `registerServerReference(fn, fileUrl, exportName)`
4. Each function gets `$$typeof: Symbol.for('react.server.reference')` and `$$id: fileUrl + "#" + exportName`

Verify by adding a temporary log after requiring the actions:
```js
var actions = require('./src/actions/todo-actions');
console.log('addTodo $$id:', actions.addTodo.$$id);
// Expected: file:///Users/.../example/server/src/actions/todo-actions.js#addTodo
```

Run: `cd example && node --conditions react-server server/server.js`
Expected: Logs something like `addTodo $$id: file:///Users/.../todo-actions.js#addTodo`

Remove the temporary log after verifying.

**Step 3: Add actions dir to clearServerSourceCache**

The existing `clearServerSourceCache()` function (line 36) only clears modules under `SERVER_SRC_DIR` which is `example/server/src`. Since actions live under `example/server/src/actions/`, they are already covered. No change needed — but verify this by confirming `SERVER_SRC_DIR` is `path.resolve(__dirname, 'src')` which resolves to `example/server/src`.

**Step 4: Commit**

```bash
git add example/server/src/actions/todo-actions.js
git commit -m "feat: add todo server action functions"
```

---

### Task 3: Build server manifest

**Files:**
- Modify: `example/server/server.js`

**Step 1: Build the server manifest for decodeReply**

The manifest maps module IDs to `{ id, chunks, name }` entries. `resolveServerReference` does two types of lookup:

1. First tries `manifest[fullId]` where `fullId` = `"file:///path/module.js#exportName"`
2. If not found, splits at last `#`, tries `manifest[modulePath]`

For lookup (2), only the `name` from the manifest entry is used as fallback — so we should register entries keyed by both the full ID and the module path.

Add to `server.js` (after the `clearServerSourceCache` function, before the routes):

```js
// Build server manifest — maps server action IDs to module metadata.
//
// resolveServerReference (in react-server-dom-webpack) looks up entries
// by full ID ("file:///path.js#export") first, then falls back to
// module path ("file:///path.js") splitting at the last #.
//
// Each entry: { id: moduleId, chunks: [], name: exportName }
// - id: passed to __webpack_require__ to load the module
// - chunks: empty (Node.js require, no chunk loading needed)
// - name: the export to access on the module
var SERVER_ACTIONS_DIR = path.resolve(__dirname, 'src/actions');

function getServerManifest() {
  var manifest = {};
  if (!fs.existsSync(SERVER_ACTIONS_DIR)) return manifest;

  var files = fs.readdirSync(SERVER_ACTIONS_DIR).filter(function (f) {
    return f.endsWith('.js');
  });

  for (var i = 0; i < files.length; i++) {
    var filePath = path.resolve(SERVER_ACTIONS_DIR, files[i]);
    var fileUrl = url.pathToFileURL(filePath).href;

    // Require the module (node-register will handle 'use server')
    var mod = require(filePath);

    // Register each exported function in the manifest
    for (var exportName in mod) {
      if (typeof mod[exportName] === 'function') {
        var fullId = fileUrl + '#' + exportName;
        // Entry keyed by full ID (primary lookup path)
        manifest[fullId] = {
          id: fileUrl,
          chunks: [],
          name: exportName,
        };
      }
    }

    // Also register by module path (fallback lookup path).
    // When resolveServerReference splits at #, it looks up manifest[modulePath]
    // and uses the name from the metadata. We register with name '' so the
    // full-ID path is preferred (it has the correct export name).
    manifest[fileUrl] = {
      id: fileUrl,
      chunks: [],
      name: '',
    };
  }

  return manifest;
}
```

**Important detail:** The manifest is passed as the `webpackMap`/`bundlerConfig` parameter to `decodeReply`. For interactive server actions (callServer path), `decodeReply` deserializes server references embedded in the args. The manifest must be able to resolve those references. For the simple case (no server references in args), the manifest just needs to exist — `decodeReply` only uses it when the serialized args contain server reference tokens.

**Step 2: Commit**

```bash
git add example/server/server.js
git commit -m "feat: build server manifest for action ID resolution"
```

---

### Task 4: Add POST endpoint for server actions

**Files:**
- Modify: `example/server/server.js`

**Step 1: Add body parsing middleware**

Express needs to parse incoming request bodies. The callServer path sends `Content-Type: text/plain` with the serialized args string. Add middleware **before** the routes (after line 73's `app.use(express.static(...))`):

```js
// Body parsing for server action requests.
// Interactive callServer sends Content-Type: text/plain with encoded args.
// MPA form POST sends multipart/form-data (handled by busboy in Step 5).
app.use(express.text({type: 'text/plain'}));
```

Note: `express.json()` is not needed for server actions — the Flight protocol uses its own serialization format, not JSON.

**Step 2: Add the POST endpoint**

Add this **before** the existing `app.get('/fixtures/:name', ...)` route (line 184). Express matches routes in order, so the POST handler won't conflict with the GET handler.

```js
app.post('/fixtures/:name', function (req, res) {
  clearServerSourceCache();

  var rscAction = req.headers['rsc-action'];

  if (rscAction) {
    // Interactive mode: callServer sent action ID in header + encoded args in body.
    // The client called encodeReply(args) which produces either a JSON string
    // or FormData. For now we handle the string case (no binary blobs in args).
    var serverModule = require('react-server-dom-webpack/server');
    var decodeReply = serverModule.decodeReply;

    var serverManifest = getServerManifest();

    // Decode the reply body (serialized arguments).
    // decodeReply accepts a string or FormData. When given a string, it
    // internally wraps it in FormData. Returns a Promise<args[]>.
    var bodyPromise;
    if (typeof req.body === 'string' && req.body.length > 0) {
      bodyPromise = decodeReply(req.body, serverManifest);
    } else {
      bodyPromise = Promise.resolve([]);
    }

    bodyPromise.then(function (decodedArgs) {
      // Resolve the server action function from the manifest.
      // The action ID is the $$id set by node-register, e.g.
      // "file:///path/to/todo-actions.js#addTodo"
      var idx = rscAction.lastIndexOf('#');
      if (idx === -1) {
        res.status(400).send('Invalid action ID (missing #): ' + rscAction);
        return Promise.resolve();
      }
      var modulePath = rscAction.slice(0, idx);
      var exportName = rscAction.slice(idx + 1);

      // Load the module via __webpack_require__ (which calls Node require)
      var mod = __webpack_require__(modulePath);
      var fn = mod[exportName];
      if (typeof fn !== 'function') {
        res.status(404).send('Server action not found: ' + rscAction);
        return Promise.resolve();
      }

      // Execute the action
      return Promise.resolve(fn.apply(null, decodedArgs));
    }).then(function (actionResult) {
      // Re-render the fixture with updated server state.
      // The action has already mutated server state (e.g. added a todo).
      // Now we render a fresh Flight stream so the client can update its UI.
      var fixturePath = path.join(FIXTURES_DIR, req.params.name + '.js');
      if (!fs.existsSync(fixturePath)) {
        res.status(404).send('Fixture not found: ' + req.params.name);
        return;
      }

      var mod = require(fixturePath);
      var FixtureComponent = mod.default || mod;
      var element = React.createElement(FixtureComponent);

      // Return the action result as the first element of the returnValue
      // stream, followed by the re-rendered tree. This matches the Next.js
      // pattern where the action response is a Flight stream containing
      // both the return value and the updated RSC tree.
      renderFlightWithDebugChannel(element, res);
    }).catch(function (error) {
      console.error('[RSC] Server action error:', error);
      if (!res.headersSent) {
        res.status(500).send('Server action failed: ' + error.message);
      }
    });
  } else {
    // MPA mode: form POST with FormData body.
    // Will be implemented in Step 5 (SSR MPA handling) using decodeAction.
    res.status(501).send('MPA form POST not yet implemented on RSC server');
  }
});
```

**Key design decisions:**

1. **Action resolution:** Rather than using a separate `resolveActionById` helper, we resolve the action inline by splitting the `rsc-action` header at `#` and using `__webpack_require__`. This is simpler and avoids redundancy with the manifest — the manifest is only needed by `decodeReply` (for resolving server references embedded in args), not for finding the action function itself.

2. **Re-rendering after action:** After executing the action, we re-render the fixture component to produce a fresh Flight stream. The client replaces its current tree with the new one from this stream. This is the same pattern Next.js uses — the action response is a complete RSC tree, not just the return value.

3. **Error handling:** We check `!res.headersSent` before sending error responses because `renderFlightWithDebugChannel` may have already started writing headers.

4. **Action return value:** Currently, the action return value is discarded — only the re-rendered tree is sent back. In a future step, the return value could be included in the Flight stream (Next.js embeds it as a special row). For now, actions communicate results by mutating server state that the re-render picks up.

**Step 3: Add CORS headers for POST**

The native app's `$$fetch` makes cross-origin POST requests to the RSC server. Add CORS preflight handling:

```js
// CORS preflight for server action POST requests
app.options('/fixtures/:name', function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, rsc-action');
  res.status(204).end();
});
```

Note: The GET handler already sets `Access-Control-Allow-Origin: *` via `renderFlightWithDebugChannel`. The CORS preflight is needed because the POST uses custom headers (`rsc-action`), which triggers a preflight request from the native URLSession. Actually — URLSession does NOT do CORS preflight (that's a browser thing). But the Express response still needs the `Access-Control-Allow-Origin` header, which `renderFlightWithDebugChannel` already sets. So this OPTIONS handler is optional safety for potential browser-based testing.

**Step 4: Test the endpoint manually**

Start the RSC server and send a test request:

```bash
# Start server
cd example && node --conditions react-server server/server.js &

# Test: call addTodo action with a text argument
# The body is the encodeReply output for ["Buy groceries"]
# For simple string args, encodeReply produces a JSON string like: ["Buy groceries"]
curl -X POST http://localhost:6000/fixtures/todo-app \
  -H "Content-Type: text/plain" \
  -H "rsc-action: file:///path/to/example/server/src/actions/todo-actions.js#addTodo" \
  -d '["Buy groceries"]'
```

Note: Replace the path with the actual absolute path on your machine. The action ID must exactly match the `$$id` that `node-register` assigns.

Expected: Returns a Flight stream (`Content-Type: text/x-component`). The stream contains the re-rendered fixture with the newly added todo.

If the fixture `todo-app` doesn't exist yet, create a minimal placeholder fixture in `example/server/src/fixtures/todo-app.js` or use an existing fixture name for testing.

**Step 5: Commit**

```bash
git add example/server/server.js
git commit -m "feat: add POST endpoint for server action execution on RSC server"
```

---

## Edge Cases and Future Considerations

### Concurrent actions
Multiple actions can be in flight simultaneously. Each POST is independent and re-renders the fixture from scratch. Since we use in-memory state (e.g., the todos array), concurrent mutations could race. This is acceptable for the demo — a production system would use a database with proper concurrency control.

### Actions during SSR
Server actions are only invoked interactively (POST from the client). During SSR, actions are serialized as server references in the Flight stream. The client receives these references and calls them via callServer when the user triggers them. No special SSR handling is needed in this step.

### Binary data in args
`encodeReply` can produce FormData (instead of a string) when args contain binary data (TypedArrays, Blobs). The current `express.text()` middleware won't handle FormData. To support this in the future, add `busboy` for multipart parsing (see `decodeReplyFromBusboy`). For now, string-only args are sufficient.

### Action return values
Currently the action return value is not sent to the client — only the re-rendered tree is. Next.js includes the return value in the Flight stream by passing it to `renderToPipeableStream` as part of the model. A future enhancement could wrap the element + return value:

```js
var model = {
  returnValue: actionResult,
  root: element,
};
renderToPipeableStream(model, manifest, ...);
```

The client would then extract `returnValue` from the deserialized result.

---

## Testing & Verification

### Automated Tests

**Server integration tests** — create `example/server/__tests__/server-actions.test.js`:

These tests start the RSC server programmatically (or use supertest) and exercise the POST endpoint, `getServerManifest()`, and `__webpack_require__` directly.

1. **`getServerManifest()` returns correct entries:**
   ```js
   it('returns manifest entries for todo-actions.js exports', function () {
     var manifest = getServerManifest();
     // Check that addTodo, toggleTodo, deleteTodo, getTodos are registered
     var todoActionsPath = require('url').pathToFileURL(
       require('path').resolve(__dirname, '../src/actions/todo-actions.js')
     ).href;
     expect(manifest[todoActionsPath + '#addTodo']).toEqual({
       id: todoActionsPath,
       chunks: [],
       name: 'addTodo',
     });
     expect(manifest[todoActionsPath + '#toggleTodo']).toBeDefined();
     expect(manifest[todoActionsPath + '#deleteTodo']).toBeDefined();
     expect(manifest[todoActionsPath + '#getTodos']).toBeDefined();
     // Module-level fallback entry
     expect(manifest[todoActionsPath]).toEqual({
       id: todoActionsPath,
       chunks: [],
       name: '',
     });
   });
   ```

2. **`__webpack_require__` handles file:// URLs:**
   ```js
   it('resolves file:// URLs via require()', function () {
     var filePath = require('path').resolve(__dirname, '../src/actions/todo-actions.js');
     var fileUrl = require('url').pathToFileURL(filePath).href;
     var mod = __webpack_require__(fileUrl);
     expect(typeof mod.addTodo).toBe('function');
     expect(typeof mod.getTodos).toBe('function');
   });

   it('falls back to regular require() for non-file:// IDs', function () {
     var mod = __webpack_require__('path');
     expect(typeof mod.resolve).toBe('function');
   });
   ```

3. **`__webpack_chunk_load__` returns resolved promise:**
   ```js
   it('returns a resolved promise', async function () {
     var result = await __webpack_chunk_load__('anything');
     expect(result).toBeUndefined();
   });
   ```

4. **`node-register` sets $$id on server action functions:**
   ```js
   it('assigns $$id to use server exports', function () {
     var actions = require('../src/actions/todo-actions');
     expect(actions.addTodo.$$id).toMatch(/todo-actions\.js#addTodo$/);
     expect(actions.addTodo.$$typeof).toBe(Symbol.for('react.server.reference'));
     expect(actions.toggleTodo.$$id).toMatch(/todo-actions\.js#toggleTodo$/);
   });
   ```

5. **POST endpoint with valid action ID returns Flight stream:**
   - Use supertest or a direct HTTP request to POST to `/fixtures/06-kitchen-sink`
   - Set `rsc-action` header to the $$id of `addTodo` and body to `["Test todo"]`
   - Assert response status is 200
   - Assert `Content-Type` is `text/x-component`
   - Assert response body is non-empty and contains Flight stream rows (lines starting with digits followed by `:`)

6. **POST endpoint with invalid action ID returns 400:**
   - POST with `rsc-action: invalid-no-hash`
   - Assert response status is 400
   - Assert body contains `Invalid action ID`

7. **POST endpoint with non-existent action returns 404:**
   - POST with `rsc-action: file:///nonexistent.js#foo`
   - Assert response status is 404 or 500 (module not found)

8. **POST endpoint without rsc-action header returns 501:**
   - POST to `/fixtures/06-kitchen-sink` with no `rsc-action` header
   - Assert response status is 501
   - Assert body contains `MPA form POST not yet implemented`

9. **POST endpoint with non-existent fixture returns 404:**
   - POST with a valid action header but to `/fixtures/nonexistent-fixture`
   - Assert response status is 404
   - Assert body contains `Fixture not found`

10. **`express.text()` middleware parses text/plain body:**
    - POST with `Content-Type: text/plain` and body `["arg1", "arg2"]`
    - Verify the body reaches the handler as a string (not parsed JSON)

**Run existing test suites:**
```bash
npm test               # All JS unit tests pass, including new server-actions.test.js
npm run test:fantom    # All Fantom integration tests pass (no regressions)
npm run test:swift     # All Swift tests pass (no changes to Swift code in this step)
```

### Manual Testing

1. **Start the RSC server and verify startup:**
   ```bash
   cd example && node --conditions react-server server/server.js
   ```
   - Server should start without errors on port 6000
   - Should log `RSC server listening on http://localhost:6000`

2. **Verify `node-register` assigns $$id to exports:**
   - Temporarily add logging after requiring todo-actions (as described in Task 2 Step 2)
   - Start the server and check output:
     ```
     addTodo $$id: file:///Users/.../example/server/src/actions/todo-actions.js#addTodo
     ```
   - Remove the temporary log after verifying

3. **Test the POST endpoint with curl — successful action:**
   ```bash
   # Get the action ID first (from the $$id logged above)
   ACTION_ID="file:///Users/.../example/server/src/actions/todo-actions.js#addTodo"

   curl -v -X POST http://localhost:6000/fixtures/06-kitchen-sink \
     -H "Content-Type: text/plain" \
     -H "rsc-action: $ACTION_ID" \
     -d '["Buy groceries"]'
   ```
   - Verify response headers include `Content-Type: text/x-component`
   - Verify response body is a Flight stream (lines like `0:...`, `1:...`)
   - Verify the action executed (the todo list in-memory state was mutated)

4. **Test with missing rsc-action header (MPA fallback):**
   ```bash
   curl -v -X POST http://localhost:6000/fixtures/06-kitchen-sink \
     -H "Content-Type: text/plain" \
     -d 'some body'
   ```
   - Expect 501 status and body `MPA form POST not yet implemented on RSC server`

5. **Test with invalid action ID (no # separator):**
   ```bash
   curl -v -X POST http://localhost:6000/fixtures/06-kitchen-sink \
     -H "Content-Type: text/plain" \
     -H "rsc-action: invalid-action-id" \
     -d '[]'
   ```
   - Expect 400 status and body `Invalid action ID (missing #): invalid-action-id`

6. **Test with non-existent action function:**
   ```bash
   curl -v -X POST http://localhost:6000/fixtures/06-kitchen-sink \
     -H "Content-Type: text/plain" \
     -H "rsc-action: file:///Users/.../todo-actions.js#nonExistentFunc" \
     -d '[]'
   ```
   - Expect 404 status and body `Server action not found`

7. **Test existing GET endpoints still work:**
   ```bash
   curl http://localhost:6000/fixtures/06-kitchen-sink
   curl http://localhost:6000/fixtures
   curl http://localhost:6000/bundle-version
   ```
   - All should return expected responses (Flight stream, fixture list JSON, version JSON)

8. **Test server source cache clearing:**
   - Make a change to `todo-actions.js` (e.g., modify default todos)
   - POST to the endpoint again
   - Verify the response reflects the change (clearServerSourceCache should pick up the edit)

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly via GET requests
- [ ] Staggered Loading fixture loads with partial prerender
- [ ] Hydration starts in parallel to SSR stream (verify via logs)
- [ ] Counter in Staggered Loading can be incremented after hydration
- [ ] `npm test` passes
- [ ] `npm run test:swift` passes
- [ ] `npm run test:fantom` passes
- [ ] No networking regressions (existing GET fetches work)
- [ ] Server hot-reload still works (clearServerSourceCache covers actions dir)
- [ ] `express.static` still serves webpack build output
- [ ] `/fixtures` list endpoint returns valid JSON
- [ ] `/bundle-version` endpoint returns version
- [ ] GET `/fixtures/:name` is unaffected by the new POST route
- [ ] CORS headers present on POST responses (Access-Control-Allow-Origin: *)

### Smoke Test: Staggered Loading

This critical smoke test verifies the RSC server changes do not break existing Flight rendering or SSR streaming:

1. Start the dev server: `cd example && npm run dev`
2. Navigate to "Staggered Loading" fixture
3. Load via prerender: the SSR server at port 6001 serves `/prerender/05-nested-suspense`
4. **Verify parallel hydration:**
   - Start log capture: `npm run app:log-start`
   - Load the fixture
   - Read logs: `npm run app:log-read` — should show hydration starting while SSR stream is still delivering later Suspense boundaries
   - Section 1 (500ms) should hydrate before Section 4 (3000ms) even finishes streaming
5. **Verify counter interactivity:**
   - After Section 1 hydrates, find the Counter button: `npm run app:snapshot-ui -- --filter Counter`
   - Tap increment: `npm run app:tap -- <x> <y>`
   - Verify counter increments: `npm run app:snapshot-ui -- --filter Counter` should show "1"
6. **Verify all sections eventually load:**
   - Wait ~4 seconds for all sections
   - Take screenshot: `npm run app:screenshot`
   - All 4 sections should be visible with content (no skeleton placeholders remaining)
