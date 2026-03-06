# Step 4a: Fizz Form Action Serialization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fizz serializes server reference actions in form instructions, enabling MPA form submission and `useActionState` SSR matching.

**Architecture:** When Fizz renders a `<form>` with an `action` prop that's a server reference function, the function has a `$$FORM_ACTION` method (injected by the Flight protocol). Fizz calls `$$FORM_ACTION(prefix)` which returns `{action, name, data, encType, method, target}`. In react-dom (web), this generates hidden `<input>` fields like `$ACTION_ID_<id>`. In react-dom-native, we serialize the action metadata into the form's instruction props so the native side can reconstruct it for MPA fallback, and so hydration can match the SSR output.

For **interactive** forms (after hydration), the reconciler uses `fiber.memoizedProps.action` directly — it's the actual function reference restored by the Flight client. So the Fizz serialization is primarily for:
1. MPA form submission before hydration (Step 5, Step 7)
2. Matching `useActionState` form state during SSR -> hydration

**Tech Stack:** JavaScript (NativeFizzConfig.js)

**Depends on:** Step 3 (callServer)

---

### Task 1: Fizz form action serialization

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzConfig.js`

**Step 1: Detect server reference action props in pushStartInstance**

When Fizz renders a `<form>` with an `action` prop that's a function, or a `<button>`/`<input>` with a `formAction` function prop, we need to handle the serialization. Server action functions have a `$$FORM_ACTION` method injected by the Flight bundler plugin. We call it to get the serialized form fields.

**How React DOM does it:** React DOM calls `getCustomFormFields(resumableState, formAction)` which calls `formAction.$$FORM_ACTION(prefix)`. This returns `{action, name, data, encType, method, target}` where `data` is a FormData containing `$ACTION_ID_<id>` entries. The returned `action` URL, `encType`, and `method` are rendered as HTML attributes, and the `data` entries become hidden `<input>` fields.

**How react-dom-native should do it:** We don't have HTML forms, but we still need the action metadata for MPA fallback (Step 5/7) and for the reconciler to re-attach the action during hydration. We serialize the action ID and bound args in the form's instruction props.

Update `pushStartInstance` in `NativeFizzConfig.js` (lines 65-86):

```js
exports.pushStartInstance = function pushStartInstance(
  target,
  type,
  props,
  resumableState,
  renderState,
  hoistableState,
  formatContext,
  textEmbedded,
  isFallback,
) {
  const filteredProps = filterProps(props);

  // Special handling for form action serialization
  if (type === 'form' && typeof filteredProps.action === 'function') {
    var action = filteredProps.action;
    if (typeof action.$$FORM_ACTION === 'function') {
      // Server reference — call $$FORM_ACTION to get serialized fields
      var formId = resumableState.nextFormID != null
        ? resumableState.nextFormID++
        : 0;
      var prefix = (resumableState.idPrefix || '') + formId;
      var customFields = action.$$FORM_ACTION(prefix);
      if (customFields) {
        // Store the action ID in props for MPA form submission
        filteredProps._actionId = customFields.name
          ? customFields.name
          : null;
        filteredProps._actionData = {};
        if (customFields.data) {
          customFields.data.forEach(function(value, key) {
            filteredProps._actionData[key] = value;
          });
        }
      }
      // Strip the function — native side can't use it
      filteredProps.action = customFields
        ? (customFields.action || 'POST')
        : 'POST';
    } else {
      // Client-only function action — strip for SSR,
      // will be re-attached during hydration from the fiber
      delete filteredProps.action;
    }
  }

  // Special handling for button/input formAction
  if ((type === 'button' || type === 'input') && typeof filteredProps.formAction === 'function') {
    var formAction = filteredProps.formAction;
    if (typeof formAction.$$FORM_ACTION === 'function') {
      var buttonFormId = resumableState.nextFormID != null
        ? resumableState.nextFormID++
        : 0;
      var buttonPrefix = (resumableState.idPrefix || '') + buttonFormId;
      var buttonCustomFields = formAction.$$FORM_ACTION(buttonPrefix);
      if (buttonCustomFields) {
        filteredProps._formActionId = buttonCustomFields.name
          ? buttonCustomFields.name
          : null;
        filteredProps._formActionData = {};
        if (buttonCustomFields.data) {
          buttonCustomFields.data.forEach(function(value, key) {
            filteredProps._formActionData[key] = value;
          });
        }
      }
      filteredProps.formAction = buttonCustomFields
        ? (buttonCustomFields.action || 'POST')
        : 'POST';
    } else {
      delete filteredProps.formAction;
    }
  }

  // Only include props object if non-empty
  const hasProps = Object.keys(filteredProps).length > 0;
  if (hasProps) {
    writeInstruction(target, ['O', type, filteredProps]);
  } else {
    writeInstruction(target, ['O', type]);
  }
  // Return children for Fizz to render
  return props.children;
};
```

**Step 2: Add nextFormID to resumable state**

Update `createResumableState` to include `nextFormID` for generating unique form prefixes:

```js
exports.createResumableState = function createResumableState(
  identifierPrefix,
  externalRuntimeConfig,
  bootstrapScriptContent,
  bootstrapScripts,
  bootstrapModules,
) {
  return {
    bootstrapScripts: bootstrapScripts || [],
    nextFormID: 0,
    idPrefix: identifierPrefix || '',
  };
};
```

**Step 3: Implement formState markers**

Update the no-op form state markers to emit instructions that the client can use for `useActionState` state matching. These are called by the Fizz server (react-server.development.js:1937-1940) when rendering `useActionState` hooks and `request.formState` is non-null.

```js
exports.pushFormStateMarkerIsMatching = function pushFormStateMarkerIsMatching(target) {
  writeInstruction(target, ['FSM', true]);
};

exports.pushFormStateMarkerIsNotMatching = function pushFormStateMarkerIsNotMatching(target) {
  writeInstruction(target, ['FSM', false]);
};
```

**Step 4: Write a test**

Create `packages/react-dom-native/src/server/__tests__/form-action-serialization.test.js`:

```js
'use strict';

var React = require('react');

// Test that Fizz serializes server reference actions in form instructions
describe('form action serialization', () => {
  var renderToInstructions;

  beforeEach(() => {
    // Helper to render an element through Fizz and collect instructions
    var {PassThrough} = require('stream');
    var {renderToPipeableStream} = require('../NativeFizzServerNode');

    renderToInstructions = function(element) {
      return new Promise(function(resolve, reject) {
        var chunks = [];
        var stream = renderToPipeableStream(element, {
          onShellReady: function() {
            var passThrough = new PassThrough();
            stream.pipe(passThrough);
            passThrough.on('data', function(chunk) {
              chunks.push(chunk.toString());
            });
            passThrough.on('end', function() {
              var instructions = [];
              chunks.join('').split('\n').forEach(function(line) {
                if (line.trim()) {
                  try {
                    instructions.push(JSON.parse(line));
                  } catch (e) {}
                }
              });
              resolve(instructions);
            });
          },
          onShellError: reject,
        });
      });
    };
  });

  it('serializes server reference action in form instructions', async () => {
    // Create a mock server reference with $$FORM_ACTION
    var action = function() {};
    action.$$FORM_ACTION = function(prefix) {
      return {
        name: '$ACTION_ID_test-module#testAction',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: new FormData(),
      };
    };

    var element = React.createElement('form', {action: action},
      React.createElement('button', {type: 'submit'}, 'Submit')
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]._actionId).toBe('$ACTION_ID_test-module#testAction');
  });

  it('strips client-only function actions for SSR', async () => {
    var action = function() {}; // No $$FORM_ACTION = client-only

    var element = React.createElement('form', {action: action},
      React.createElement('button', {type: 'submit'}, 'Submit')
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    // action should be stripped (not serialized as a function)
    expect(openForm[2]).toBeUndefined();
  });
});
```

**Step 5: Run tests**

Run: `npm test -- --testPathPattern form-action`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/react-dom-native/src/server/NativeFizzConfig.js
git add packages/react-dom-native/src/server/__tests__/form-action-serialization.test.js
git commit -m "feat: serialize server reference actions in Fizz form instructions"
```

---

## Testing & Verification

### Automated Tests

**Server tests (`packages/react-dom-native/src/server/__tests__/form-action-serialization.test.js`)**

The plan already includes a test file skeleton. Expand it to cover the full surface area. All tests use the same `renderToInstructions` helper pattern established in `prerender.test.js` — render an element through Fizz via `renderToPipeableStream`, collect the newline-delimited JSON instructions, and assert on the instruction contents.

- **Server reference action with `$$FORM_ACTION` serializes `_actionId` and `_actionData` in form instruction props:**
  Create a mock server reference function with `$$FORM_ACTION` that returns `{name: '$ACTION_ID_mod#act', action: '', data: formData, ...}` where `formData` contains entries like `$ACTION_ID_mod#act` = `''`. Render `<form action={serverRef}>` through Fizz. Find the `['O', 'form', props]` instruction and verify `props._actionId === '$ACTION_ID_mod#act'` and `props._actionData` is an object containing the FormData entries.

- **Server reference action with bound args serializes `_actionData` entries:**
  Create a `$$FORM_ACTION` that returns `data` containing multiple entries (e.g., `$ACTION_REF_1` = `'bound-value'`). Verify all entries appear in `_actionData` as key-value pairs.

- **Client-only function action (no `$$FORM_ACTION`) is stripped from SSR output:**
  Render `<form action={function() {}}>` (no `$$FORM_ACTION` property). Verify the `['O', 'form']` instruction either has no props object (index 2 is undefined) or the props object does not contain an `action` key. The function must not appear in the serialized output.

- **String action prop passes through unchanged:**
  Render `<form action="/api/submit">`. Verify the `['O', 'form', {action: '/api/submit'}]` instruction contains the string action value unchanged. This is a regression test for Step 1b string action support.

- **Button `formAction` function props serialize `_formActionId`:**
  Create a mock server reference with `$$FORM_ACTION` on a `formAction` prop. Render `<button formAction={serverRef}>Submit</button>`. Find the `['O', 'button', props]` instruction and verify `props._formActionId` is set and `props._formActionData` contains the serialized FormData entries.

- **Input `formAction` function props serialize `_formActionId`:**
  Same as above but with `<input type="submit" formAction={serverRef} />`. Verify `_formActionId` appears in the input instruction props.

- **Client-only `formAction` function on button is stripped:**
  Render `<button formAction={function() {}}>`. Verify the button instruction has no `formAction` in its props.

- **Form state markers emit `['FSM', true]` and `['FSM', false]` instructions:**
  Test `pushFormStateMarkerIsMatching` and `pushFormStateMarkerIsNotMatching` directly by calling them with a target array and verifying the emitted instructions. Since these are called by Fizz internals during `useActionState` rendering (only when `request.formState` is non-null), a direct function call test is appropriate:
  ```js
  var target = [];
  NativeFizzConfig.pushFormStateMarkerIsMatching(target);
  expect(JSON.parse(target[0])).toEqual(['FSM', true]);

  var target2 = [];
  NativeFizzConfig.pushFormStateMarkerIsNotMatching(target2);
  expect(JSON.parse(target2[0])).toEqual(['FSM', false]);
  ```

- **`createResumableState` includes `nextFormID` starting at 0:**
  Call `createResumableState()` and verify the returned object has `nextFormID === 0` and `idPrefix === ''`.

- **`createResumableState` with identifier prefix:**
  Call `createResumableState('pfx_')` and verify `idPrefix === 'pfx_'`.

- **Multiple forms get unique prefixes (`nextFormID` increments):**
  Create a mock with two `<form>` elements that both have server reference actions. Render them in the same Fizz pass and verify each form's `_actionData` entries use different prefixes (the first form uses prefix `'0'`, the second uses prefix `'1'`). This validates that `resumableState.nextFormID++` works correctly.

- **Non-form elements are unaffected:**
  Render `<div><span>hello</span></div>` through Fizz. Verify instructions are identical to the existing `prerender.test.js` output — no extra props, no `_actionId`, no `_actionData`. This prevents regressions in the common non-form path.

- **Form with no action prop renders normally:**
  Render `<form><input type="text" /></form>`. Verify the form instruction has no `_actionId` or `_actionData` — the form action serialization only triggers when `action` is a function.

**Existing test suites**

- Run `npm test` — all existing tests pass, including `prerender.test.js` and `resume.test.js` (the changes to `pushStartInstance` and `createResumableState` must not break existing rendering behavior)
- Run `npm run test:fantom` — all Fantom integration tests pass (Fizz config changes do not affect client-side reconciler behavior)
- Run `npm test -- --testPathPattern form-action` — the new test file passes

### Manual Testing

1. **Verify non-form SSR output is unchanged:**
   - Start the SSR server: `cd example && npm run dev`
   - `curl http://localhost:6001/ssr/kitchen-sink` — capture the instruction stream
   - Verify instructions are identical to the pre-change output (no extra props on div/span/p elements)

2. **Create a test fixture with a server action form:**
   - Add a temporary fixture (e.g., `tests/e2e/fixtures/test-form-action.js`) with:
     ```jsx
     <form action={serverAction}>
       <input type="text" name="message" />
       <button type="submit">Submit</button>
     </form>
     ```
   - Register it in the fixture list

3. **Inspect the SSR instruction stream:**
   - `curl http://localhost:6001/ssr/test-form-action`
   - Verify the form instruction contains `_actionId` in props (the server reference ID)
   - Verify `_actionData` contains the FormData entries from `$$FORM_ACTION`
   - Verify the action prop is replaced with `'POST'` (or the `customFields.action` value), not the raw function

4. **Verify client-only function actions are stripped:**
   - Create a fixture with `<form action={() => console.log('client only')}>` (no `"use server"`)
   - `curl http://localhost:6001/ssr/<fixture-name>`
   - Verify the form's `action` prop is absent from the instruction stream (not serialized as `[Function]` or similar)

5. **Verify string action passthrough:**
   - Create a fixture with `<form action="/api/submit">`
   - `curl http://localhost:6001/ssr/<fixture-name>`
   - Verify the form instruction has `action: "/api/submit"` unchanged

6. **Build and run the demo app:** `/build demo`
   - Navigate through existing fixtures
   - `npm run app:screenshot` — verify no visual regressions

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly (spot-check via `npm run app:screenshot`)
- [ ] Staggered Loading prerender loads and hydrates correctly
- [ ] Counter in Staggered Loading can be incremented after hydration
- [ ] SSR instruction stream format unchanged for non-form elements (verified via `curl` against `/ssr/kitchen-sink`)
- [ ] `prerender.test.js` passes — existing Fizz prerender tests not broken by `pushStartInstance` changes
- [ ] `resume.test.js` passes — resume flow not broken by `createResumableState` changes (new `nextFormID` field)
- [ ] `form-action-serialization.test.js` passes — all new tests green
- [ ] `npm test` passes (full unit test suite)
- [ ] `npm run test:fantom` passes (integration tests)
- [ ] No JavaScript errors in app console during normal fixture navigation
- [ ] `filterProps` still correctly strips event handlers (`onClick`, etc.) — the new form action logic runs after `filterProps`
- [ ] Forms without action props render identically to before (no spurious `_actionId` or `_actionData`)

### Smoke Test: Staggered Loading

Verify the full SSR -> hydration -> interaction pipeline works after `NativeFizzConfig.js` changes:

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
   - Verify value changes from 0 to 1
   - Tap again — verify it changes from 1 to 2
5. **Verify all sections load:**
   - Wait for all 4 sections to stream in (~3 seconds for Section 4)
   - `npm run app:screenshot` — no skeleton placeholders should remain
6. **Verify SSR output correctness:**
   - `curl http://localhost:6001/prerender/05-nested-suspense`
   - Verify the prerender output contains `['O', '#suspense']` boundaries and no `_actionId` props (this fixture has no forms)
