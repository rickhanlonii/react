# Step 4b: Form Submit Event Handling

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a submit button is tapped inside a `<form>`, the Swift side dispatches a `submit` event, and the JS event handler calls `reconciler.startHostTransition` to trigger the form action via React's built-in form action machinery.

**Architecture:** The react-reconciler already has all form action machinery built in (`startHostTransition`, `HostTransitionContext`, `resetFormInstance`, `requestFormReset`). Our job is to:
1. Make the Swift side dispatch `submit` events when submit buttons are tapped inside forms
2. Make the JS event handler recognize `submit` events and call `startHostTransition`
3. Handle function `action`/`formAction` props in the HostConfig (canary values for native)

**Tech Stack:** Swift (UIKitMutationApplier.swift, ShadowNodeFamily.swift), JavaScript (renderer.js, HostConfig.js)

**Depends on:** Step 4a (Fizz serialization), Step 3 (callServer)

---

### Task 1: Swift-side form submit event dispatch

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeFamily.swift`

**Step 1: Track submit button type on ShadowNodeFamily**

The `ShadowNodeFamily` (at `ios/Sources/ShadowTree/ShadowNodeFamily.swift`) already tracks `elementType` and `hasClickHandler`. We need to add `isSubmitButton` to distinguish `<button type="submit">` from `<button type="button">`.

In HTML, a `<button>` without an explicit `type` attribute defaults to `type="submit"`. Only `<button type="submit">` (or no type) triggers form submission. `<button type="button">` and `<button type="reset">` do not.

In `ShadowNodeFamily.swift`, add:
```swift
/// Whether this button is a submit button (type="submit" or no type on <button>).
/// Updated during CREATE/UPDATE mutations.
public var isSubmitButton: Bool = false
```

**Step 2: Set isSubmitButton during CREATE and UPDATE mutations**

In `UIKitMutationApplier.swift`, during CREATE and UPDATE mutations, set the flag:

```swift
if node.family.elementType == "button" {
    let buttonType = node.props["type"] as? String
    // HTML default: <button> without type is type="submit"
    node.family.isSubmitButton = (buttonType == nil || buttonType == "submit")
}
if node.family.elementType == "input" {
    let inputType = node.props["type"] as? String
    node.family.isSubmitButton = (inputType == "submit" || inputType == "image")
}
```

**Step 3: Add form submit dispatch to handleButtonTap**

In `UIKitMutationApplier.swift`, the `handleButtonTap` method (line 786) handles click events. When a UIButton is tapped, if it's a submit button, walk up the view hierarchy looking for a form element. If found, dispatch a `submit` event to the form view.

```swift
@objc private func handleButtonTap(_ sender: UIButton) {
    // Dispatch click on the button itself
    dispatchEvent?(sender, "click", ["_nativeTimestamp": performanceNow()])

    // Check if this button is a submit button inside a form
    guard let family = viewRegistry.family(for: sender),
          family.isSubmitButton else {
        return
    }

    // Walk up the view hierarchy looking for a form element
    var formSearch: UIView? = sender.superview
    while let view = formSearch {
        if let family = viewRegistry.family(for: view),
           family.elementType == "form" {
            dispatchEvent?(view, "submit", ["_nativeTimestamp": performanceNow()])
            return
        }
        formSearch = view.superview
    }
}
```

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeFamily.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift
git commit -m "feat: dispatch form submit events from Swift on submit button tap"
```

---

### Task 2: JS event handler form submit dispatch

**Files:**
- Modify: `packages/react-dom-native/src/renderer/renderer.js`

**Step 1: Handle submit events via startHostTransition**

The current event handler in `renderer.js` (lines 25-52) maps all events through the `on` + EventType prop convention (e.g., `click` -> `onClick`). Form submission is different — React's reconciler expects the host environment to call `reconciler.startHostTransition(formFiber, pendingState, action, formData)` when a form is submitted.

In React DOM (web), this is done by the `extractEvents` system in `ReactDOMEventListener`. When a native `submit` event fires on a `<form>`, React looks at the form fiber's `action` prop. If it's a function, it calls `startHostTransition`.

For react-dom-native, we need to add special handling in the event handler for `submit` events:

```js
$$registerEventHandler(function (instanceHandle, eventType, payload) {
  var fiber = instanceHandle;
  if (!fiber) return;

  // Special handling for form submit events
  if (eventType === 'submit') {
    // The native side dispatches submit on the form view directly,
    // so the fiber here is the form fiber.
    var formFiber = fiber;

    // The form fiber must be a HostComponent (tag === 5) with type "form"
    if (formFiber.tag === 5 && formFiber.memoizedProps) {
      var action = formFiber.memoizedProps.action;
      if (typeof action === 'function') {
        // Check if a submitter button has a formAction override
        var submitterAction = null;
        if (payload && payload._submitterFiberHandle) {
          var submitterFiber = payload._submitterFiberHandle;
          if (submitterFiber.memoizedProps &&
              typeof submitterFiber.memoizedProps.formAction === 'function') {
            submitterAction = submitterFiber.memoizedProps.formAction;
          }
        }

        var finalAction = submitterAction || action;

        // Build FormData from the form's descendant input fibers
        // For now, pass null formData — server actions receive args via encodeReply
        var formData = null;

        reconciler.discreteUpdates(function () {
          reconciler.startHostTransition(formFiber, {pending: true}, finalAction, formData);
        });
        reconciler.flushSyncWork();
        reconciler.flushPassiveEffects();
        return;
      }
    }
    // If no function action, fall through to normal event dispatch
  }

  // Normal event dispatch (onClick, onChange, etc.)
  var propName = 'on' + eventType.charAt(0).toUpperCase() + eventType.slice(1);
  if (fiber && fiber.memoizedProps && typeof fiber.memoizedProps[propName] === 'function') {
    // Capture timing for Interactions track
    var inputTime;
    var processingStart;
    if (typeof $$isTracing === 'function' && $$isTracing()) {
      inputTime = (payload && payload._nativeTimestamp) ? payload._nativeTimestamp : performance.now();
      processingStart = performance.now();
    }

    reconciler.discreteUpdates(function () {
      fiber.memoizedProps[propName](payload);
    });
    reconciler.flushSyncWork();
    reconciler.flushPassiveEffects();

    if (typeof $$isTracing === 'function' && $$isTracing()) {
      var processingEnd = performance.now();
      $$reportInteraction(eventType, $$nextInteractionId(), inputTime, processingStart, processingEnd);
    }
  }
});
```

**Important notes:**
- `reconciler.startHostTransition` is exported from the react-reconciler (confirmed at `bundle.js:35836`)
- The reconciler internally wraps the action in `startTransition`, handles pending state via `HostTransitionContext`, and calls `resetFormInstance` after the action completes
- `formData` is passed as the second argument to the action function (e.g., `action(formData)`)
- For server actions, the action function is a server reference proxy that calls `callServer(id, args)` — `formData` becomes the args

**Step 2: Commit**

```bash
git add packages/react-dom-native/src/renderer/renderer.js
git commit -m "feat: handle form submit events via startHostTransition in event handler"
```

---

### Task 3: HostConfig form-related updates

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`

**Step 1: Handle function action props in createInstance**

When the reconciler creates a `<form>` instance with a function `action` prop, the function needs to survive the bridge crossing. Currently, `replaceEventHandlers` replaces all `on*` function props with `true` canary values. The `action` prop is NOT an `on*` prop, so it won't be replaced — but it also won't survive `toDictionary()` across the JSC bridge (functions are dropped).

This is fine because the reconciler keeps the actual function on `fiber.memoizedProps.action` — the native side doesn't need the function. We just need to make sure the native side knows this form has an action handler.

In `createInstance` and `cloneInstance`, strip function `action` props before sending to native, replacing with a canary:

```js
// In createInstance, after replaceEventHandlers(nativeProps):
if (type === 'form' && typeof props.action === 'function') {
  nativeProps.action = true; // canary — marks form as having an action handler
}
if ((type === 'button' || type === 'input') && typeof props.formAction === 'function') {
  nativeProps.formAction = true; // canary
}
```

Similarly in `cloneInstance`.

**Step 2: Keep resetFormInstance as no-op**

The current `resetFormInstance` at line 551 is a no-op:
```js
exports.resetFormInstance = function resetFormInstance() {};
```

This is called by the reconciler after a form action completes successfully, to reset the form's inputs. On the web, this calls `form.reset()`. For native, we could dispatch a reset command to the native side, but for now a no-op is fine — native text inputs don't have the same "dirty" state as HTML form inputs.

**Step 3: Verify canHydrateFormStateMarker**

The current implementation at line 686 returns `false`:
```js
exports.canHydrateFormStateMarker = function() { return false; };
```

This will need to be updated when we implement `useActionState` SSR support (Step 5). For now, returning `false` means Fizz form state markers are ignored during hydration, which is correct until we emit FSM instructions and handle them on the client.

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/renderer/HostConfig.js
git commit -m "feat: handle function action/formAction props in renderer host config"
```

---

### Edge Cases and Notes

**Nested forms:** HTML doesn't support nested `<form>` elements. The Swift form-ancestor walk in Task 1 naturally finds the nearest ancestor form, matching web behavior. No special handling needed.

**Multiple submit buttons with formAction:** When a `<button formAction={differentAction}>` is clicked inside a `<form action={defaultAction}>`, the button's `formAction` should override the form's `action`. The JS event handler in Task 2 handles this by checking `payload._submitterFiberHandle` for a `formAction` prop. However, the current Swift implementation doesn't pass the submitter fiber — it just dispatches `submit` on the form. We'll need to enhance this later, or handle it by walking the fiber tree in JS when the submit event arrives.

**formData construction:** In React DOM (web), when a form is submitted, the browser constructs a FormData from the form's input elements. In react-dom-native, we don't have native HTML form elements, so FormData construction would need to be done in JS by walking the form fiber's children looking for input fibers and reading their values. For the initial implementation, passing `null` as formData to `startHostTransition` is acceptable — server actions typically use bound arguments (from `action.bind(null, arg1, arg2)`) rather than FormData.

**useActionState:** The `useActionState` hook works with the reconciler's internal form action queue. It relies on:
1. `HostTransitionContext` (already wired up in HostConfig.js:536-543)
2. `startHostTransition` calling the action in a transition
3. Form state markers during SSR (FSM instructions, Step 4a)
4. `formState` passed to `hydrateRoot` (renderer.js:141 — currently `null`)

Full `useActionState` SSR support requires Step 5 (SSR formState plumbing) to provide `formState` to `hydrateRoot`.

---

## Testing & Verification

### Automated Tests

**Swift unit test: `isSubmitButton` property on ShadowNodeFamily**

Add a test in the Swift unit test suite covering the `isSubmitButton` flag:

- `<button>` (no type attribute) → `isSubmitButton` = `true` (HTML default is submit)
- `<button type="submit">` → `isSubmitButton` = `true`
- `<button type="button">` → `isSubmitButton` = `false`
- `<button type="reset">` → `isSubmitButton` = `false`
- `<input type="submit">` → `isSubmitButton` = `true`
- `<input type="image">` → `isSubmitButton` = `true`
- `<input type="text">` → `isSubmitButton` = `false`
- `<div>` → `isSubmitButton` remains default `false` (non-button elements unaffected)

**Fantom integration test: `form-submit-handling-itest.js`**

Create `tests/integration/form-submit-handling-itest.js` with these test cases:

1. **Submit button inside form triggers startHostTransition:**
   - Render `<form action={fn}><button type="submit">Go</button></form>` where `fn` is a mock function
   - Simulate a button tap via Fantom event dispatch on the button → verify `submit` event is dispatched on the form
   - Verify `startHostTransition` is called with the form fiber and the action function

2. **type="button" inside form does NOT trigger submit:**
   - Render `<form action={fn}><button type="button">Cancel</button></form>`
   - Simulate button tap → verify the `submit` event is NOT dispatched on the form
   - Verify `startHostTransition` is NOT called

3. **Button outside form does not dispatch submit:**
   - Render `<div><button type="submit">Orphan</button></div>` (no ancestor `<form>`)
   - Simulate button tap → verify no `submit` event is dispatched
   - The click handler on the button should still fire normally

4. **onClick still fires on submit buttons:**
   - Render `<form action={actionFn}><button type="submit" onClick={clickFn}>Go</button></form>`
   - Simulate button tap → verify `clickFn` is called AND `submit` event is dispatched
   - Both the click handler and form submission should work together

5. **Form with string action (not function) falls through:**
   - Render `<form action="/submit-url"><button type="submit">Go</button></form>`
   - Simulate button tap → verify `startHostTransition` is NOT called (string action is not a function)

**Unit test for HostConfig: function action/formAction prop handling**

Add tests in `packages/react-dom-native/src/renderer/__tests__/` (or existing test file):

- `createInstance('form', {action: someFn})` → resulting native props have `action: true` (canary value, not the function)
- `createInstance('form', {action: '/url'})` → resulting native props have `action: '/url'` (string preserved)
- `createInstance('button', {formAction: someFn})` → resulting native props have `formAction: true`
- `createInstance('input', {formAction: someFn})` → resulting native props have `formAction: true`
- `createInstance('button', {formAction: '/url'})` → string formAction preserved
- `cloneInstance` with updated function action → canary value in cloned props

**Run test suites:**

```bash
npm test                 # JS unit tests — all pass
npm run test:fantom      # Fantom integration tests — all pass including new form submit tests
npm run test:swift       # Swift unit tests — all pass including isSubmitButton tests
```

### Manual Testing

1. **Build the demo app:** Use `/build demo` to compile and run.

2. **Create a test fixture with form action:**
   - Add a server component fixture with `<form action={serverAction}><button type="submit" id="form-submit">Submit</button></form>`
   - The server action should perform a visible side effect (e.g., console.log or state mutation)

3. **Verify submit button triggers form action:**
   - Navigate to the fixture in the app
   - `npm run app:snapshot-ui -- --filter form-submit` to locate the submit button
   - `npm run app:log-start` to begin capturing logs
   - `npm run app:tap -- <x> <y>` on the submit button coordinates
   - `npm run app:log-read` — verify logs show `startHostTransition` was invoked
   - Verify the server action executes (check RSC server logs)
   - `npm run app:screenshot` to verify UI updates after action completes

4. **Verify type="button" does NOT submit:**
   - Add `<button type="button" id="no-submit" onClick={() => console.log('clicked')}>Cancel</button>` inside the same form
   - Tap the "Cancel" button
   - Verify in logs that only the click handler fires, NOT `startHostTransition`

5. **Verify button outside form has no submit behavior:**
   - Add `<button type="submit" id="orphan-btn">Orphan</button>` outside any `<form>`
   - Tap the orphan button
   - Verify no submit event is dispatched, no errors in logs

6. **Verify onClick + submit coexistence:**
   - Add `<form action={serverAction}><button type="submit" id="both-btn" onClick={clickHandler}>Both</button></form>`
   - Tap the button
   - Verify both the onClick handler AND the form submit action fire

7. **Snapshot UI before and after:**
   - `npm run app:snapshot-ui` before tapping → capture initial state
   - Tap submit → wait for action to complete
   - `npm run app:snapshot-ui` after → verify UI reflects the action result

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly (`npm run app:screenshot` on each fixture)
- [ ] Staggered Loading prerender works — hydration proceeds in parallel with SSR stream
- [ ] Counter in Staggered Loading increments after hydration (onClick still works)
- [ ] Existing button click handlers still work — no regression from `isSubmitButton` changes
- [ ] Existing form-less buttons work — no submit events dispatched for buttons outside forms
- [ ] Buttons with `type="button"` inside forms do NOT trigger form submit
- [ ] Buttons with `type="reset"` inside forms do NOT trigger form submit
- [ ] `resetFormInstance` no-op does not break any existing behavior
- [ ] `canHydrateFormStateMarker` returning `false` does not break hydration
- [ ] `npm test` passes — all JS unit tests green
- [ ] `npm run test:swift` passes — all Swift unit tests green including `isSubmitButton` tests
- [ ] `npm run test:fantom` passes — all Fantom integration tests green including new form submit tests

### Smoke Test: Staggered Loading

Verify the full pipeline (SSR → hydration → interaction) is not broken by form submit handling changes:

1. Start dev server: `cd example && npm run dev`
2. Navigate to "Staggered Loading" fixture
3. Load via prerender endpoint
4. **Verify parallel hydration:**
   - `npm run app:log-start` → load fixture → `npm run app:log-read`
   - Confirm hydration begins while SSR stream is still delivering Suspense boundaries
   - Section 1 (500ms delay) should become interactive before Section 4 (3000ms) finishes streaming
5. **Verify counter interactivity:**
   - Find Counter: `npm run app:snapshot-ui -- --filter Counter`
   - Tap increment button
   - Verify counter value increases (0 → 1)
   - Tap again (1 → 2)
6. **Verify no regressions from form handling changes:**
   - The Counter uses a `<button>` with `onClick`, NOT inside a `<form>`
   - Verify the button tap does NOT accidentally trigger form submit logic (no `submit` event dispatched)
   - Verify the click event handler fires correctly — `isSubmitButton` should be `false` for buttons with `onClick` that have no ancestor form, so the form-ancestor walk should never execute
7. Take final screenshot: `npm run app:screenshot`
