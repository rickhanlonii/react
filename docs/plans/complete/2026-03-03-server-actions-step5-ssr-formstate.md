# Step 5: SSR formState Plumbing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** MPA form submissions work through the SSR server — submit a form before hydration, get a full re-rendered page with updated state and `formState` for `useActionState` matching.

**Architecture:** The SSR server receives a form POST from the native app (before JS hydration), extracts the action ID from the form data (`$ACTION_ID_*` keys), forwards the action execution to the RSC server, then fetches a fresh Flight stream and re-renders the full page with `formState` so `useActionState` hooks pick up the new state during SSR.

**How Next.js does this (reference):**
1. Browser submits form as `multipart/form-data` POST to the current URL
2. Next.js server receives the POST, extracts FormData
3. Calls `decodeAction(formData, serverManifest)` — this finds `$ACTION_ID_*` or `$ACTION_REF_*` keys in the FormData, resolves the server action function, and returns `fn.bind(null, formData)`
4. Executes the action: `actionResult = await action()`
5. Calls `decodeFormState(actionResult, formData, serverManifest)` — returns `[result, keyPath, refId, boundArgsCount]` or null
6. Re-renders the page via Fizz with `formState` passed to `createRequest`
7. Fizz uses `formState` to determine which `useActionState` hook matches, emitting `<!--F!-->` (matching) or `<!--F-->` (not matching) markers

**How react-dom-native should do this:**
1. Native app submits form data via `$$fetch` POST to the SSR server (before hydration completes)
2. SSR server receives POST, parses form data
3. Executes the action on the RSC server by POSTing with `rsc-action` header (same as interactive callServer in Step 2)
4. Gets back the action result from the RSC server response
5. Calls `decodeFormState` to create `formState`
6. Fetches a fresh Flight stream from the RSC server
7. Re-renders via Fizz with `formState`, producing a new instruction stream
8. Sends the new instruction stream back to the native app
9. Native app replaces the current SSR tree with the new one

**Tech Stack:** Node.js, Express, react-server-dom-webpack/server.node (`decodeAction`, `decodeFormState`), Swift (InstructionStreamParser, ShadowTreeBuilder)

**Depends on:** Step 2 (server action infrastructure — POST endpoint on RSC server), Step 4a (form action serialization — `_actionId` in form props, FSM instructions)

---

### Task 1: Accept formState in renderToPipeableStream

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzServerNode.js`

**Step 1: Pass formState through to Fizz.createRequest**

Currently `renderToPipeableStream` (line 45-57) passes `undefined` for the `formState` parameter to `Fizz.createRequest`. Update it to accept `options.formState`:

```js
function renderToPipeableStream(children, options) {
  if (!options) options = {};

  var resumableState = NativeFizzConfig.createResumableState(
    undefined,  // identifierPrefix
    undefined,  // externalRuntimeConfig
    undefined,  // bootstrapScriptContent
    options.bootstrapScripts,
    undefined,  // bootstrapModules
  );
  var request = Fizz.createRequest(
    children,
    resumableState,
    NativeFizzConfig.createRenderState(resumableState),
    NativeFizzConfig.createRootFormatContext(),
    options.progressiveChunkSize,
    options.onError,
    options.onAllReady,
    options.onShellReady,
    options.onShellError,
    undefined,              // onFatalError
    options.formState,      // <-- NEW: pass formState for useActionState matching
  );

  var hasStartedFlowing = false;
  Fizz.startWork(request);
  // ... rest unchanged
```

When `formState` is non-null, Fizz will call `pushFormStateMarkerIsMatching` / `pushFormStateMarkerIsNotMatching` (from NativeFizzConfig.js) for each `useActionState` hook in the tree, emitting `['FSM', true]` or `['FSM', false]` instructions. The client can then use these during hydration to match state.

**Step 2: Commit**

```bash
git add packages/react-dom-native/src/server/NativeFizzServerNode.js
git commit -m "feat: accept formState option in renderToPipeableStream for MPA form handling"
```

---

### Task 2: Add POST endpoint to SSR server

**Files:**
- Modify: `example/server/ssr-server.js`

**Step 1: Add URL-encoded body parsing**

Add Express URL-encoded body parsing middleware. This handles the `application/x-www-form-urlencoded` content type that native form POSTs will use:

```js
// After the existing app.use(express.json(...)) at line 29:
app.use(express.urlencoded({extended: true}));
```

**Step 2: Add a server manifest for decodeAction/decodeFormState**

`decodeAction` and `decodeFormState` need a server manifest to resolve action IDs back to modules. The server manifest maps action IDs (file URLs) to module metadata. Create a helper that builds it:

```js
function getServerManifest() {
  var manifest = {};
  var url = require('url');
  var serverSrcDir = path.resolve(__dirname, 'src');

  function scanDir(dir) {
    var entries = fs.readdirSync(dir, {withFileTypes: true});
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
        try {
          var content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes("'use server'") || content.includes('"use server"')) {
            var mod = require(fullPath);
            var fileUrl = url.pathToFileURL(fullPath).href;
            for (var exportName in mod) {
              if (typeof mod[exportName] === 'function') {
                var fullId = fileUrl + '#' + exportName;
                manifest[fullId] = {
                  id: fileUrl,
                  chunks: [],
                  name: exportName,
                };
              }
            }
            if (typeof mod.default === 'function') {
              manifest[fileUrl] = {
                id: fileUrl,
                chunks: [],
                name: 'default',
              };
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  scanDir(serverSrcDir);
  return manifest;
}
```

**Note:** This duplicates some logic from Step 2's `getServerManifest()` on the RSC server. Consider extracting to a shared module, or having the SSR server call the RSC server's manifest endpoint.

**Step 3: Add POST handler**

```js
app.post('/ssr/:name', function (req, res) {
  var name = req.params.name;

  // Build FormData from the parsed body
  var formData = new FormData();
  if (req.body && typeof req.body === 'object') {
    for (var key in req.body) {
      formData.append(key, req.body[key]);
    }
  }

  // Use decodeAction to find and bind the server action
  var {decodeAction, decodeFormState} = require('react-server-dom-webpack/server');
  var serverManifest = getServerManifest();

  var actionPromise = decodeAction(formData, serverManifest);

  if (!actionPromise) {
    // No action found in form data — just re-render
    handleSSR(FLIGHT_SERVER + '/fixtures/' + name, req, res);
    return;
  }

  actionPromise
    .then(function (action) {
      return action();
    })
    .then(function (actionResult) {
      return decodeFormState(actionResult, formData, serverManifest)
        .then(function (formState) {
          var flightURL = FLIGHT_SERVER + '/fixtures/' + name;
          handleSSR(flightURL, req, res, formState);
        });
    })
    .catch(function (err) {
      console.error('[SSR] Action execution failed:', err);
      res.status(500).send('Action execution failed: ' + err.message);
    });
});
```

**Step 4: Refactor handleSSR to accept formState**

Rather than duplicating `handleSSR`, add an optional `formState` parameter:

```js
function handleSSR(flightURL, req, res, formState) {
  // ... existing code ...

  // Only change: pass formState to renderToPipeableStream
  var nativeStream = renderToNativeStream(React.createElement(Root), {
    bootstrapScripts: [FLIGHT_SERVER + '/bundle.js'],
    formState: formState || undefined,  // <-- NEW parameter
    onShellReady: function () { /* ... */ },
    // ...
  });
}
```

The existing GET handler calls `handleSSR(url, req, res)` with no formState (undefined), and the new POST handler calls `handleSSR(url, req, res, formState)` with the decoded formState.

**Step 5: Commit**

```bash
git add example/server/ssr-server.js
git commit -m "feat: add MPA form POST handling to SSR server with formState"
```

---

### Task 3: Handle formState in native SSR pipeline

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift`
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift`
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`
- Modify: `packages/react-dom-native/src/renderer/renderer.js`
- Modify: `example/server/ssr-server.js`
- Modify: `example/src/entry.js`

**Step 1: Handle FSM instructions in InstructionStreamParser**

The `InstructionStreamParser` at `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift` has a switch statement for opcodes (line 102). Add handling for the `FSM` opcode.

First, add a delegate method to `InstructionStreamDelegate` (line 26-42):

```swift
func didReceiveFormStateMarker(isMatching: Bool)
```

Then add the case to the switch in `processLine`:

```swift
case "FSM":
    guard array.count >= 2 else {
        delegate?.didReceiveError(
            InstructionParseError.invalidFormat("FSM instruction missing value")
        )
        return
    }
    let isMatching = array[1] as? Bool ?? false
    delegate?.didReceiveFormStateMarker(isMatching: isMatching)
```

**Step 2: Handle FSM in ShadowTreeBuilder**

The `ShadowTreeBuilder` needs to handle the new delegate method. Create a marker node in the shadow tree that hydration can find:

```swift
func didReceiveFormStateMarker(isMatching: Bool) {
    let family = ShadowNodeFamily(
        elementType: "#formStateMarker",
        surfaceId: surfaceId,
        instanceHandle: nil
    )
    let node = ShadowNodeWrapper(
        family: family,
        props: ["isMatching": isMatching],
        yogaNode: YGNodeNewWithConfig(YogaConfig.shared)
    )
    if let parent = nodeStack.last {
        parent.appendChild(node)
    }
}
```

**Step 3: Update HostConfig for form state marker hydration**

Update `canHydrateFormStateMarker` and `isFormStateMarkerMatching` in `HostConfig.js`:

```js
exports.canHydrateFormStateMarker = function(instance) {
  if (instance && instance.type === '#formStateMarker') {
    return instance;
  }
  return false;
};

exports.isFormStateMarkerMatching = function(instance) {
  return instance && instance.props && instance.props.isMatching === true;
};
```

**Step 4: Pass formState to hydrateRoot**

Deliver formState from SSR to the client via a JS instruction (matching existing pattern):

In `ssr-server.js`, after computing formState, emit a JS instruction:
```js
var formStateJS = JSON.stringify(['JS',
  'globalThis.__REACT_DOM_NATIVE__._formState = ' + JSON.stringify(formState)
]) + '\n';
pendingRows.push(formStateJS);
```

In `entry.js`, when hydrating, read the formState:
```js
var formState = globalThis.__REACT_DOM_NATIVE__._formState || null;
var root = hydrateRoot(container, element, { formState: formState });
```

Update `hydrateRoot` in `renderer.js` to accept and pass formState:
```js
function hydrateRoot(nativeRootView, initialElement, options) {
  // ...
  const root = reconciler.createHydrationContainer(
    initialElement,
    null,           // callback
    container,
    1,              // ConcurrentRoot
    null,           // hydrationCallbacks
    false,          // isStrictMode
    null,           // concurrentUpdatesByDefaultOverride
    '',             // identifierPrefix
    options && options.onUncaughtError ? options.onUncaughtError : /* ... */,
    options && options.onCaughtError ? options.onCaughtError : /* ... */,
    options && options.onRecoverableError ? options.onRecoverableError : /* ... */,
    noop,           // onDefaultTransitionIndicator
    null,           // transitionCallbacks
    options && options.formState != null ? options.formState : null,  // <-- formState
  );
  // ...
}
```

**Step 5: Commit**

```bash
git add packages/react-dom-native/src/server/NativeFizzServerNode.js
git add packages/react-dom-native/src/renderer/HostConfig.js
git add packages/react-dom-native/src/renderer/renderer.js
git add packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift
git add example/server/ssr-server.js
git add example/src/entry.js
git commit -m "feat: handle formState markers in native SSR pipeline"
```

---

### Edge Cases and Notes

**Race condition with hydration:** If the user submits a form just as hydration completes, there could be a race between the MPA form POST and the interactive form handler. The native side should check whether hydration has completed before choosing the MPA path. If hydration is done, the JS event handler will handle it via `startHostTransition`.

**decodeFormState dependency:** `decodeFormState` requires the `$ACTION_KEY` field in the FormData, which is set by `useActionState` during SSR. This key encodes the component path and hook index. Without it, `decodeFormState` returns `null`, which means `useActionState` won't match. This is fine for forms that don't use `useActionState` — they'll just get a fresh render.

**SSR server re-render ordering:** The MPA POST handler must:
1. First execute the action (which may mutate server state)
2. Then fetch a fresh Flight stream (which reflects the mutated state)
3. Then render via Fizz with formState

This ordering is critical — if we fetch the Flight stream before executing the action, the rendered page won't reflect the action's side effects.

**Actual file paths verified:**
- `InstructionStreamParser.swift` is at `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift`
- `ShadowTreeBuilder.swift` is at `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift`
- `NativeFizzServerNode.js` is at `packages/react-dom-native/src/server/NativeFizzServerNode.js`
- `HostConfig.js` is at `packages/react-dom-native/src/renderer/HostConfig.js`
- `renderer.js` is at `packages/react-dom-native/src/renderer/renderer.js`
- `ssr-server.js` is at `example/server/ssr-server.js`
- `entry.js` is at `example/src/entry.js`

---

## Testing & Verification

### Automated Tests

**Server test: `renderToPipeableStream` accepts `formState` option**

Add tests in `packages/react-dom-native/src/server/__tests__/`:

- Render a component using `useActionState` with `formState: null` (or `undefined`) → verify the instruction stream does NOT contain any `FSM` instructions — `useActionState` hooks render with their initial state
- Render a component using `useActionState` with a valid `formState` (e.g., `['result', '$ACTION_KEY_...', 'actionRef', 0]`) → verify the instruction stream contains `FSM` instructions with appropriate `true`/`false` matching values
- Render a component with NO `useActionState` hooks with `formState` set → verify no `FSM` instructions emitted (formState is irrelevant when no hooks consume it)
- Verify `renderToPipeableStream` still works identically when `formState` is omitted (backward compatibility)

**Swift unit test: InstructionStreamParser handles FSM opcode**

Add tests in the Swift unit test suite for the new `FSM` opcode:

- Parse `["FSM", true]` → verify delegate method `didReceiveFormStateMarker(isMatching: true)` is called
- Parse `["FSM", false]` → verify delegate method `didReceiveFormStateMarker(isMatching: false)` is called
- Parse `["FSM"]` (missing value) → verify `didReceiveError` is called with `invalidFormat` error
- Parse `["FSM", "notABool"]` (non-boolean value) → verify `didReceiveFormStateMarker(isMatching: false)` is called (fallback to `false` per the `as? Bool ?? false` logic)
- Verify all existing opcodes (`CT`, `AP`, `TN`, `SC`, `SBC`, `SBO`, `JS`, etc.) still parse correctly — no regression from adding the new case

**Swift unit test: ShadowTreeBuilder creates marker nodes for FSM instructions**

- Call `didReceiveFormStateMarker(isMatching: true)` on a ShadowTreeBuilder with an active parent node → verify a child node is created with `elementType == "#formStateMarker"` and `props["isMatching"] == true`
- Call `didReceiveFormStateMarker(isMatching: false)` → verify child node has `props["isMatching"] == false`
- Verify the marker node has a Yoga node allocated (required for tree traversal during hydration)
- Verify the marker node has `instanceHandle == nil` (marker nodes are not interactive)

**Unit test for HostConfig: form state marker hydration methods**

Add tests for the updated hydration methods in HostConfig:

- `canHydrateFormStateMarker(instance)` where `instance.type === '#formStateMarker'` → returns the instance
- `canHydrateFormStateMarker(instance)` where `instance.type === 'div'` → returns `false`
- `canHydrateFormStateMarker(instance)` where `instance` is `null` → returns `false`
- `isFormStateMarkerMatching(instance)` where `instance.props.isMatching === true` → returns `true`
- `isFormStateMarkerMatching(instance)` where `instance.props.isMatching === false` → returns `false`
- `isFormStateMarkerMatching(instance)` where `instance.props` has no `isMatching` key → returns `false`

**Server integration test: SSR POST endpoint**

Add tests for the MPA form submission flow on `ssr-server.js`:

- POST to `/ssr/:name` with `application/x-www-form-urlencoded` body containing `$ACTION_ID_<fileUrl>#<exportName>=` key → verify `decodeAction` resolves the correct server action function
- Verify the action is executed (side effects occur)
- Verify `decodeFormState` is called with the action result and form data, producing a non-null `formState`
- Verify the SSR response instruction stream includes a JS instruction setting `globalThis.__REACT_DOM_NATIVE__._formState`
- Verify the instruction stream includes `FSM` marker instructions for `useActionState` hooks
- POST to `/ssr/:name` with form data that does NOT contain any `$ACTION_ID_*` key → verify it falls through to a normal GET-style SSR render (no action executed, no formState)
- POST with an invalid/unresolvable `$ACTION_ID_*` → verify the server returns a 500 error with appropriate message

**Unit test for entry.js: formState hydration plumbing**

- Verify that when `globalThis.__REACT_DOM_NATIVE__._formState` is set to a valid formState array, `hydrateRoot` is called with `{ formState: <that value> }`
- Verify that when `globalThis.__REACT_DOM_NATIVE__._formState` is `undefined` (not set), `hydrateRoot` is called with `{ formState: null }`
- Verify that `hydrateRoot` in `renderer.js` passes `options.formState` as the correct positional argument to `reconciler.createHydrationContainer`

**Run all test suites:**

```bash
npm test                 # JS unit tests — all pass including HostConfig and entry.js tests
npm run test:swift       # Swift unit tests — all pass including FSM parsing and marker node tests
npm run test:fantom      # Fantom integration tests — all pass, hydration with formState works
```

### Manual Testing

1. **Create a `useActionState` test fixture:**
   ```jsx
   // server component with a server action
   'use server';
   async function increment(prevState) {
     return (prevState || 0) + 1;
   }

   // client component using useActionState
   function CounterForm() {
     const [count, dispatch, isPending] = useActionState(increment, 0);
     return (
       <form action={dispatch}>
         <p>Count: {count}</p>
         <button type="submit" id="action-state-submit">
           {isPending ? 'Incrementing...' : 'Increment'}
         </button>
       </form>
     );
   }
   ```

2. **Verify SSR instruction stream includes FSM markers:**
   - `curl http://localhost:6001/ssr/test-fixture` — inspect the raw instruction stream output
   - Look for `["FSM", false]` markers in the stream (no formState on initial GET, so all markers should be non-matching)
   - Verify the stream still contains all expected opcodes (`CT`, `AP`, `TN`, etc.) alongside the new FSM markers

3. **Test MPA form submission (submit before hydration):**
   - Load the fixture via prerender
   - Before hydration completes, tap the submit button
   - The native app should POST to the SSR server with the form data
   - `npm run app:log-start` before submission, `npm run app:log-read` after
   - Verify SSR server logs show: action ID decoded, action executed, formState computed
   - Verify the response instruction stream includes `["JS", "globalThis.__REACT_DOM_NATIVE__._formState = ..."]`
   - Verify the re-rendered page shows `Count: 1` (the action incremented the count)
   - Verify `FSM` markers now show `["FSM", true]` for the matching `useActionState` hook

4. **Test interactive form submission (submit after hydration):**
   - Load the fixture and wait for hydration to complete
   - Tap the submit button
   - Verify `startHostTransition` handles the form submission (from Step 4b)
   - Verify `useActionState` updates the count on-screen
   - Verify `isPending` shows "Incrementing..." while the action is in flight
   - `npm run app:screenshot` to verify final state

5. **Verify formState round-trip:**
   - After MPA submission re-renders the page, verify hydration succeeds without mismatch
   - The `formState` passed to `hydrateRoot` should match the FSM markers in the instruction stream
   - Check logs for any hydration mismatch warnings

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly (no FSM markers appear in non-form SSR streams)
- [ ] Staggered Loading prerender works — hydration in parallel with SSR stream
- [ ] Counter in Staggered Loading increments after hydration
- [ ] Existing SSR GET endpoints return identical instruction streams (no formState, no FSM markers)
- [ ] SSR instruction stream format unchanged for components that do not use `useActionState`
- [ ] Hydration succeeds for all existing fixtures (FSM markers only appear when formState is set)
- [ ] InstructionStreamParser handles all existing opcodes without regression (CT, AP, TN, SC, SBC, SBO, JS, etc.)
- [ ] ShadowTreeBuilder handles all existing instruction types without regression
- [ ] `renderToPipeableStream` without `formState` option behaves identically to before
- [ ] `hydrateRoot` without `formState` option behaves identically to before
- [ ] Express URL-encoded body parsing middleware does not break existing SSR GET routes
- [ ] `npm test` passes — all JS unit tests green
- [ ] `npm run test:swift` passes — all Swift unit tests green
- [ ] `npm run test:fantom` passes — all Fantom integration tests green

### Smoke Test: Staggered Loading

Verify the full pipeline (SSR → hydration → interaction) is not broken by formState plumbing:

1. Start dev server: `cd example && npm run dev`
2. Navigate to "Staggered Loading" fixture
3. Load via prerender endpoint
4. **Verify parallel hydration:**
   - `npm run app:log-start` → load fixture → `npm run app:log-read`
   - Confirm hydration begins while SSR stream is still delivering Suspense boundaries
   - Section 1 (500ms delay) should become interactive before Section 4 (3000ms) finishes streaming
   - Verify no `FSM` markers appear in logs (Staggered Loading does not use `useActionState`)
5. **Verify counter interactivity:**
   - Find Counter: `npm run app:snapshot-ui -- --filter Counter`
   - Tap increment button
   - Verify counter value increases (0 → 1)
   - Tap again (1 → 2)
6. **Verify no regressions from SSR formState changes:**
   - The Staggered Loading fixture does not use forms or `useActionState`
   - Verify `renderToPipeableStream` produces the same instruction stream as before (no FSM markers)
   - Verify hydration succeeds without mismatch — `formState: null` means no FSM matching occurs
   - Verify the `_formState` global is not set (no JS instruction emitted for non-form pages)
7. Take final screenshot: `npm run app:screenshot`
