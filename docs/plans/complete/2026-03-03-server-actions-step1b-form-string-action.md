# Step 1b: Form String Action + Submit Dispatch

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify `<form action="/url">` passes the string action prop through Fizz, and add Swift-side form submit event dispatch so button taps inside forms fire a `submit` event.

**Architecture:** String `action` props on `<form>` should pass through Fizz's `filterProps` unmodified (since it only strips `on[A-Z]` handlers). On the Swift side, when a button inside a `<form>` is tapped, dispatch a `submit` event to the form view. The JS side handles the event — for string actions (MPA), JS reads the action URL and POSTs via `$$fetch`. For function actions (interactive, Step 4b), React handles it via `startHostTransition`.

**Tech Stack:** JavaScript (NativeFizzConfig.js tests), Swift (UIKitMutationApplier.swift)

**Depends on:** Step 1a (bridge POST support)

---

### Task 1: Verify Fizz passes `action` prop through for `<form>`

**Files:**
- Read: `packages/react-dom-native/src/server/NativeFizzConfig.js` — `filterProps` function at line 39
- Create: `packages/react-dom-native/src/server/__tests__/form-action.test.js`

**Step 1: Confirm action prop passes through**

The Fizz config's `filterProps` (NativeFizzConfig.js:39-48) strips `children` and event handlers matching `/^on[A-Z]/`. The `action` prop is a plain string (not an event handler — it starts with lowercase "a"), so it passes through to the instruction stream as-is: `["O", "form", {"action": "/some-url"}]`.

Read `NativeFizzConfig.js:39-48` and confirm `filterProps` does not strip `action`. No code change needed if it doesn't.

**Important edge case for later steps:** When `action` is a server action _function_ (not a string), it will be a function value. The current `filterProps` only strips `on[A-Z]` handlers but passes through other function values. However, functions cannot be serialized to JSON (the instruction stream is JSON). Step 4a (Fizz form action serialization) will handle this.

**Step 2: Write a test to verify**

Create a test in `packages/react-dom-native/src/server/__tests__/form-action.test.js`. This file will be picked up by the `server` jest project config (`jest.config.js:27-32`).

**Important:** The test should import from `../NativeFizzServerNode` (the actual implementation), not from `react-dom-native/server` (which is a package export that may not resolve in test). See the existing `prerender.test.js:4` for the correct import pattern.

```js
'use strict';

var React = require('react');
var {renderToPipeableStream} = require('../NativeFizzServerNode');
var {PassThrough} = require('stream');

function renderToInstructions(element) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var passThrough = new PassThrough();
    passThrough.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    passThrough.on('end', function () {
      var instructions = chunks
        .join('')
        .trim()
        .split('\n')
        .map(JSON.parse);
      resolve(instructions);
    });
    passThrough.on('error', reject);
    var stream = renderToPipeableStream(element, {
      onShellReady: function () {
        stream.pipe(passThrough);
      },
      onShellError: reject,
    });
  });
}

describe('form action serialization', function () {
  it('passes string action prop through to instructions', async function () {
    var element = React.createElement('form', {action: '/submit'});
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]).toEqual({action: '/submit'});
  });

  it('passes method prop through for forms', async function () {
    var element = React.createElement('form', {
      action: '/submit',
      method: 'post',
    });
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]).toEqual({action: '/submit', method: 'post'});
  });
});
```

**Step 3: Run the test**

Run: `npm test -- --testPathPattern form-action`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/server/__tests__/form-action.test.js
git commit -m "test: verify Fizz passes form action string prop through"
```

---

### Task 2: Add form submit dispatch in Swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

**Current state of relevant code:**
- `<form>` falls through to the default case in `createView()` (UIKitMutationApplier.swift:272-288) — creates a plain UIView (or UIScrollView for overflow:scroll)
- `<form>` is treated as a block container in `ElementDefaults.swift:25` (same style as `div`)
- `<button>` creates a UIButton with `handleButtonTap` target action (UIKitMutationApplier.swift:222-227)
- `handleButtonTap` dispatches a "click" event to JS (UIKitMutationApplier.swift:786-788)
- `dispatchEvent` closure is set from `EventDispatcher.swift:40-69`

**Architecture decision: JS-driven submit (Option A)**

Dispatch a simple "submit" event on the form view from Swift. Let JS handle everything (reading action prop, collecting form data, POSTing). This is preferred because:
1. React will intercept form submits for interactive mode (Step 4b)
2. Keeps network logic in JS (avoids duplicating in Swift)
3. The same `dispatchEvent` mechanism is already used for clicks
4. Aligns with how React DOM works (browser fires submit, React reads FormData)

**Step 1: Modify handleButtonTap to dispatch form submit**

In `UIKitMutationApplier.swift`, modify `handleButtonTap` (line 786-788):

```swift
@objc private func handleButtonTap(_ sender: UIButton) {
    // Walk up to find nearest <form> ancestor
    var current: UIView? = sender.superview
    while let v = current {
        if let family = viewRegistry.family(for: v),
           family.elementType == "form" {
            // Dispatch "submit" event to the form
            dispatchEvent?(v, "submit", ["_nativeTimestamp": performanceNow()])
            break
        }
        current = v.superview
    }
    // Always dispatch the click event on the button
    dispatchEvent?(sender, "click", ["_nativeTimestamp": performanceNow()])
}
```

**Note:** This dispatches submit for ALL buttons inside forms, regardless of `type` attribute. Step 4b refines this by adding `isSubmitButton` tracking on `ShadowNodeFamily` to only dispatch submit for `<button type="submit">` (or no type, which defaults to submit in HTML). For now, this simpler version is fine since the demo won't have `<button type="button">` inside forms yet.

**Step 2: Handle "submit" event in JS for string action**

In the JS event handler (renderer.js), the submit event will arrive but won't match any `onSubmit` prop handler. For string action forms, we need a handler that reads the form's action prop and POSTs to it.

Add a submit handler in `entry.js` (or the event handler in `renderer.js`):

```js
// In the event handler, after the normal prop-based dispatch:
if (eventType === 'submit' && fiber && fiber.memoizedProps) {
  var action = fiber.memoizedProps.action;
  if (typeof action === 'string' && action) {
    // String action — MPA form POST
    // Collect input values by walking the fiber tree
    var formData = collectFormDataFromFiber(fiber);
    var body = urlEncodeFormData(formData);

    $$fetch(action, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: body,
    }, function(type, data) {
      if (type === 'error') {
        console.error('[form submit] POST failed:', data);
      }
      // For MPA, the response is a new page — handle in Step 5
    });
  }
}
```

**Helper: collectFormDataFromFiber**

Walk the form fiber's children looking for input fibers and reading their `value` or `defaultValue`:

```js
function collectFormDataFromFiber(formFiber) {
  var data = {};
  function walk(fiber) {
    if (!fiber) return;
    if (fiber.tag === 5 && fiber.type === 'input' && fiber.memoizedProps) {
      var name = fiber.memoizedProps.name;
      if (name) {
        // Read the current native value via the instance
        var value = fiber.memoizedProps.value || fiber.memoizedProps.defaultValue || '';
        data[name] = value;
      }
    }
    walk(fiber.child);
    walk(fiber.sibling);
  }
  walk(formFiber.child);
  return data;
}

function urlEncodeFormData(data) {
  return Object.keys(data).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
  }).join('&');
}
```

**Note:** Reading `fiber.memoizedProps.value` gives the React-side value, not the current native UITextField text. For uncontrolled inputs (using `defaultValue`), the actual user-typed text lives only on the native UITextField. Getting it requires either:
1. Reading from the native side via a bridge call
2. Tracking value changes in JS via the "change" event handler (already dispatched by `handleTextFieldChanged`)

Option 2 is simpler — the "change" event already fires with `{value: "..."}` when the user types. We could track the latest value per input in a WeakMap. But for the initial implementation, using `fiber.memoizedProps.value` works for controlled inputs, and for uncontrolled inputs we can add value tracking later.

**Step 3: Test manually**

Build and run the demo app with a simple form fixture:
```jsx
function FormTest() {
  return (
    <form action="http://localhost:6000/test-action" method="post">
      <input name="message" defaultValue="hello" id="form-input" />
      <button type="submit" id="form-submit">Submit</button>
    </form>
  );
}
```

Run: `/build demo` then tap the Submit button. Verify the POST request is sent to the action URL.

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift
git add packages/react-dom-native/src/renderer/renderer.js
git commit -m "feat: add form submit event dispatch and string action POST handling"
```

---

### Edge cases to consider

1. **Nested forms** — HTML spec says nested forms are invalid. The Swift form-ancestor walk naturally finds the nearest ancestor, matching web behavior.
2. **Button type="button"** — Should not trigger form submit. Handled properly in Step 4b with `isSubmitButton` tracking. For now, all buttons dispatch submit if inside a form.
3. **Multiple submit buttons** — The submitter button's `name`/`value` should be included in FormData. Deferred.
4. **Default values** — `<input defaultValue="x">` current text lives on UITextField, not in React props. See note above about value tracking.
5. **Pre-hydration timing** — Before hydration, there's no JS event handler. The MPA fallback (Step 7) handles pre-hydration form submission from Swift.
6. **Disabled inputs** — `<input disabled>` should not be included in FormData (matches HTML spec). Deferred.

### Key codebase references
- **Button tap handler:** `UIKitMutationApplier.swift:786-788` — `handleButtonTap(_:)`
- **Event dispatch closure:** Set from `EventDispatcher.swift:40-69`
- **View ↔ Family mapping:** `ViewRegistry.swift` — `family(for:)` lookup
- **Form element defaults:** `ElementDefaults.swift:25` — `form` treated as block container
- **Fizz prop filtering:** `NativeFizzConfig.js:39-48` — `filterProps()` strips `children` and `on[A-Z]` handlers
- **Jest config:** `jest.config.js` — server tests match `src/server/__tests__/**/*.test.js`

### How Next.js handles this (for reference)
Next.js uses React DOM's built-in `<form>` support which delegates to the browser's native form submission. React intercepts the submit event via `addEventListener('submit')` on the form element. For string action URLs, the browser performs a normal form POST. For server action functions, React calls `callServer(actionId, formData)`. For MPA (no JS), the browser's native form submission handles the POST. Falcon needs to replicate both paths in Swift/JS since there's no browser.

---

## Testing & Verification

### Automated Tests

**Server test (`form-action.test.js`)**

The plan already creates `packages/react-dom-native/src/server/__tests__/form-action.test.js` with two test cases. The following should also be verified or added:

- **String action passes through Fizz `filterProps`** (already in plan) — render `<form action="/submit">`, verify the instruction stream contains `["O", "form", {"action": "/submit"}]`
- **Method prop passes through** (already in plan) — render `<form action="/submit" method="post">`, verify both `action` and `method` appear in the instruction output
- **Event handler props are stripped** — render `<form action="/submit" onSubmit={fn}>`, verify `onSubmit` is NOT in the instruction output (it matches `/^on[A-Z]/` and should be filtered)
- **Children prop is stripped** — verify `children` does not appear in the form's props in the instruction stream
- **Form with no action** — render `<form>` with no action prop, verify the instruction stream has `["O", "form", {}]` (empty props dict)

**Fantom integration test (`tests/integration/form-submit-itest.js`)**

Create a new integration test `tests/integration/form-submit-itest.js` that tests the Swift-side form submit event dispatch via the Fantom harness:

- Render `<form><button>Submit</button></form>` in Fantom
- Simulate a button tap on the button view
- Verify a "submit" event is dispatched to the form view (via the `dispatchEvent` closure)
- Verify a "click" event is also dispatched to the button view (both events should fire)
- Verify the submit event fires BEFORE the click event (submit dispatched first in `handleButtonTap`)
- Test a button NOT inside a form — verify only "click" fires, no "submit"

**Unit test in renderer (`renderer.test.js` or event handler tests)**

- Test that when a "submit" event arrives and the target fiber's `memoizedProps.action` is a string (e.g., `"/submit"`), the handler calls `$$fetch` with POST method, correct Content-Type header, and URL-encoded body
- Test that when `action` is undefined or empty, no `$$fetch` call is made
- Test `collectFormDataFromFiber` — verify it walks child fibers and collects `name`/`value` pairs from `<input>` elements
- Test `urlEncodeFormData` — verify proper encoding of special characters (spaces, ampersands, etc.)

**Regression**

- Run `npm test` — all existing tests must pass, including the new form-action tests and existing bridge/renderer tests
- Run `npm run test:fantom` — all existing integration tests must pass
- Run `npm test -- --testPathPattern form-action` — the new server test suite passes

### Manual Testing

1. Create a temporary test fixture with a form:
   ```jsx
   function FormTest() {
     return (
       <form action="http://localhost:6000/test-action" method="post">
         <input name="message" defaultValue="hello" id="form-input" />
         <button type="submit" id="form-submit">Submit</button>
       </form>
     );
   }
   ```
2. Build and run the app using `/build demo`
3. Navigate to the test fixture in the Falcon Demo simulator
4. Use `npm run app:snapshot-ui` to verify the form, input, and button rendered correctly — look for the `form-input` and `form-submit` accessibility identifiers
5. Use `npm run app:snapshot-ui -- --filter form-submit` to find the Submit button coordinates
6. Tap the Submit button using `npm run app:tap -- <x> <y>` with the coordinates from the snapshot
7. Check the server logs to verify a POST request was received at `/test-action` with body `message=hello`
8. Use `npm run app:log-start` and `npm run app:log-read` to check for any errors in the app logs
9. Test a button outside a form — verify tapping it does NOT trigger a submit event (only a click)

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly (navigate through fixture list)
- [ ] Staggered Loading fixture loads with partial prerender — hydration starts in parallel to SSR stream
- [ ] Counter in Staggered Loading fixture can be incremented after hydration
- [ ] Kitchen Sink fixture renders all elements correctly
- [ ] No console errors during normal operation
- [ ] `npm test` passes all existing test suites
- [ ] `npm run test:fantom` passes all integration tests
- [ ] Button taps outside of forms still dispatch click events correctly (no regressions from `handleButtonTap` changes)
- [ ] Existing button interactions (e.g., Counter increment) still work after the `handleButtonTap` modification

### Smoke Test: Staggered Loading

This smoke test verifies existing functionality is preserved after the `handleButtonTap` and event dispatch changes:

1. Start the dev server: `cd example && npm run dev`
2. Load the Staggered Loading fixture via prerender endpoint (`/prerender/05-nested-suspense`)
3. Verify the shell renders immediately (skeleton placeholders visible)
4. Verify sections stream in progressively (500ms, 1000ms, 2000ms, 3000ms intervals)
5. Verify hydration starts while SSR stream is still in progress:
   - Use `npm run app:log-start` before loading
   - After loading, `npm run app:log-read` should show hydration messages interleaved with SSR boundary reveals
   - The Counter component in Section 1 should become interactive before Section 4 finishes loading
6. Tap the Counter increment button (use `npm run app:snapshot-ui -- --filter Counter` to find it, then `npm run app:tap`)
7. Verify the counter value increases from 0 to 1 — this is critical because the Counter button is a `<button>` that uses `handleButtonTap`, and the Step 1b changes modify that function to also check for form ancestors
8. Take a screenshot: `npm run app:screenshot` to verify visual rendering
