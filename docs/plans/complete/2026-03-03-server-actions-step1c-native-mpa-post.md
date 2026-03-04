# Step 1c: Native MPA Form POST (Pre-hydration)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pre-hydration form submission from Swift — when a user taps a submit button before JS hydration completes, the native side reads the form's string `action` URL, collects input values from UITextFields, and POSTs directly to the SSR server for a full-page re-render.

**Architecture:** Before JS hydration completes, native form elements don't have React event handlers attached. The JS-driven submit dispatch from Step 1b won't fire because no event handler is registered yet. For progressive enhancement, the native side needs its own form submit path:

1. User taps a button inside a `<form action="/url">`
2. Swift detects the tap in `handleRootTap` (the pre-hydration gesture handler)
3. Walks up the view hierarchy to find the enclosing `<form>`
4. Reads the `action` string prop from the form's shadow node props
5. Collects input values from descendant UITextFields
6. URL-encodes and POSTs to the action URL via URLSession
7. Receives a new instruction stream and replaces the current SSR tree

This is the same behavior as a browser submitting a `<form>` with no JavaScript — pure MPA form submission.

**Tech Stack:** Swift (UIKitMutationApplier.swift, ShadowNodeFamily.swift)

**Depends on:** Step 1a (bridge POST support), Step 1b (form submit dispatch — shares the submit button detection logic)

---

### Task 1: Store form `action` and input `name` props on native views

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

**Step 1: Store the `action` prop on form views**

The `action` prop on `<form>` and `name` prop on `<input>` need to be accessible from Swift at submit time. Currently:
- ShadowNodeFamily stores `elementType` and `instanceHandle` but NOT arbitrary props
- The props dict lives on ShadowNodeWrapper in the shadow tree (not directly accessible from UIView)

The simplest approach: store these specific props on the UIView using associated objects, or add dedicated fields to ShadowNodeFamily.

**Option A (associated objects on UIView):**
```swift
private var formActionKey: UInt8 = 0
private var inputNameKey: UInt8 = 0

extension UIView {
    var formAction: String? {
        get { objc_getAssociatedObject(self, &formActionKey) as? String }
        set { objc_setAssociatedObject(self, &formActionKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    }
    var inputName: String? {
        get { objc_getAssociatedObject(self, &inputNameKey) as? String }
        set { objc_setAssociatedObject(self, &inputNameKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    }
}
```

**Option B (fields on ShadowNodeFamily):**
```swift
// In ShadowNodeFamily.swift:
/// The string `action` URL for <form> elements. Set during CREATE/UPDATE.
public var formActionURL: String? = nil
/// The `name` attribute for <input> elements. Set during CREATE/UPDATE.
public var inputName: String? = nil
```

**Recommendation:** Option B is cleaner — it keeps the data on the model (ShadowNodeFamily) rather than the view. And ShadowNodeFamily already has `elementType`, `hasClickHandler`, etc.

**Step 2: Set the props during CREATE and UPDATE mutations**

In `UIKitMutationApplier.swift`, during view creation and prop updates:

```swift
// For <form> elements:
if node.family.elementType == "form" {
    node.family.formActionURL = node.props["action"] as? String
}

// For <input> elements:
if node.family.elementType == "input" {
    node.family.inputName = node.props["name"] as? String
}
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeFamily.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift
git commit -m "feat: store form action URL and input name on ShadowNodeFamily"
```

---

### Task 2: Pre-hydration form submit in handleRootTap

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

**Step 1: Add MPA form submit detection**

The `handleRootTap` method (line 738) handles taps before hydration. When a button inside a form is tapped pre-hydration, attempt an MPA form submit.

```swift
/// When a submit button is tapped before hydration, check if it's inside a
/// form with a string action URL. If so, perform a native MPA form submission.
private func attemptMPAFormSubmit(from buttonView: UIView) -> Bool {
    // Walk up looking for a <form> with an action URL
    var formSearch: UIView? = buttonView.superview
    while let view = formSearch {
        guard let family = viewRegistry.family(for: view),
              family.elementType == "form" else {
            formSearch = view.superview
            continue
        }

        // Check if the form has a string action URL
        guard let actionURL = family.formActionURL, !actionURL.isEmpty else {
            return false // Form exists but no action URL
        }

        // Collect form data from input descendants
        var formFields: [String: String] = [:]
        collectFormData(from: view, into: &formFields)

        // POST to the action URL
        performMPAFormPost(to: actionURL, fields: formFields)
        return true
    }
    return false
}
```

**Step 2: Implement form data collection**

Walk descendant UITextFields and read their current text values:

```swift
private func collectFormData(from view: UIView, into fields: inout [String: String]) {
    for subview in view.subviews {
        if let textField = subview as? UITextField,
           let family = viewRegistry.family(for: textField),
           let name = family.inputName, !name.isEmpty {
            fields[name] = textField.text ?? ""
        }
        collectFormData(from: subview, into: &fields)
    }
}
```

**Step 3: Implement the MPA POST**

```swift
private func performMPAFormPost(to actionURL: String, fields: [String: String]) {
    guard let url = URL(string: actionURL) else {
        print("[react-dom-native] MPA form submit: invalid action URL: \(actionURL)")
        return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

    // URL-encode the form fields
    let body = fields.map { key, value in
        let encodedKey = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key
        let encodedValue = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
        return "\(encodedKey)=\(encodedValue)"
    }.joined(separator: "&")
    request.httpBody = body.data(using: .utf8)

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
        DispatchQueue.main.async {
            guard let self = self else { return }

            if let error = error {
                print("[react-dom-native] MPA form submit failed: \(error.localizedDescription)")
                return
            }

            guard let data = data, let responseText = String(data: data, encoding: .utf8) else {
                print("[react-dom-native] MPA form submit: empty response")
                return
            }

            // The response is a new SSR instruction stream.
            // Delegate to the SSR loading path to replace the current tree.
            self.onMPAFormResponse?(responseText)
        }
    }.resume()
}
```

**Step 4: Wire into handleRootTap**

In `handleRootTap`, when a button is tapped before hydration:

```swift
// In handleRootTap, after hit-testing the tapped view:
if let family = viewRegistry.family(for: tappedView),
   family.elementType == "button" {
    // Check for MPA form submit (pre-hydration)
    if attemptMPAFormSubmit(from: tappedView) {
        return // MPA form submit handled natively
    }
}
```

**Step 5: Add onMPAFormResponse callback**

Add a callback property to UIKitMutationApplier that the SSR coordinator can set:

```swift
/// Called when an MPA form POST receives a response.
/// The response is a new SSR instruction stream that should replace the current tree.
var onMPAFormResponse: ((String) -> Void)?
```

Wire this in `Root+SSR.swift` (or wherever SSR loading happens) to:
1. Tear down the current shadow tree and UIKit views
2. Parse the new instruction stream via InstructionStreamParser
3. Build a new shadow tree
4. Mount the new UIKit views

This is essentially a full page reload in native — the same `Root+SSR.swift` loading path should be reusable.

**Step 6: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift
git commit -m "feat: add native-side MPA form POST for pre-hydration form submission"
```

---

### Edge Cases and Notes

**Race condition with hydration:** If the user submits a form just as hydration completes, there could be a race between the MPA form POST and the interactive form handler (Step 1b). The native side should check whether hydration has completed before choosing the MPA path. If hydration is done, the JS event handler will handle it. A simple flag (`isHydrated`) can gate this.

**FormData construction limitations:** This implementation only handles `<input type="text">` (UITextField). Full MPA form support would also need:
- `<select>` elements
- `<textarea>` elements
- Radio buttons and checkboxes
- File inputs
- Hidden inputs (for `$ACTION_ID_*` keys — needed in Step 4a for server action MPA)
These can be added incrementally as those element types are implemented.

**SSR tree replacement:** After receiving the new instruction stream, the native side must:
1. Tear down the current shadow tree and UIKit views
2. Parse the new instruction stream
3. Build a new shadow tree
4. Mount the new UIKit views
This is essentially a full-page reload. The `Root+SSR.swift` loading path should be reusable.

**Server action MPA (later):** Once Step 4a adds `_actionId` to form props, this same `attemptMPAFormSubmit` can be extended to include the `$ACTION_ID_*` key in the POST body, enabling pre-hydration server action form submission. The `collectFormData` method already walks all descendants, so hidden inputs with action IDs will be picked up automatically once those are rendered.

**Button type filtering:** This step checks `family.elementType == "button"` but doesn't check `isSubmitButton` (added in Step 4b). For now, any button inside a form triggers MPA submit. This is fine for the initial implementation since all buttons in forms are expected to be submit buttons.

---

## Testing & Verification

### Automated Tests

**Swift unit tests** — add to `packages/react-dom-native/ios/Tests/ReactDomNativeTests/`:

1. **`formActionURL` and `inputName` on ShadowNodeFamily** — Create a test file `MPAFormSubmitTests.swift`:
   - Test that `ShadowNodeFamily` stores `formActionURL`:
     ```swift
     func testFormActionURLStored() {
         let family = ShadowNodeFamily(elementType: "form", surfaceId: 1, instanceHandle: nil)
         XCTAssertNil(family.formActionURL)
         family.formActionURL = "http://localhost:6001/ssr/test"
         XCTAssertEqual(family.formActionURL, "http://localhost:6001/ssr/test")
     }
     ```
   - Test that `ShadowNodeFamily` stores `inputName`:
     ```swift
     func testInputNameStored() {
         let family = ShadowNodeFamily(elementType: "input", surfaceId: 1, instanceHandle: nil)
         XCTAssertNil(family.inputName)
         family.inputName = "username"
         XCTAssertEqual(family.inputName, "username")
     }
     ```

2. **`collectFormData` recursive walk** — Test that it walks descendant UITextFields and collects name/value pairs:
   - Build a view hierarchy: UIView (form) > UIView (div) > UITextField (name="email", text="a@b.com") + UITextField (name="password", text="secret")
   - Register each view and its family in a ViewRegistry
   - Call `collectFormData(from: formView, into: &fields)`
   - Verify `fields == ["email": "a@b.com", "password": "secret"]`
   - Test with nested UITextFields at multiple depths
   - Test that UITextFields without an `inputName` are skipped

3. **`performMPAFormPost` URLRequest construction** — Test that it builds the correct request:
   - Use a mock URLSession or URLProtocol to intercept the request
   - Call `performMPAFormPost(to: "http://localhost:6001/ssr/submit", fields: ["name": "Rick", "age": "30"])`
   - Verify the URLRequest has `httpMethod == "POST"`
   - Verify `Content-Type` header is `application/x-www-form-urlencoded`
   - Verify httpBody decodes to `name=Rick&age=30` (order may vary)
   - Test with empty fields dict — body should be empty string
   - Test with special characters — values should be percent-encoded

4. **`attemptMPAFormSubmit` hierarchy walk** — Test the upward walk from button to form:
   - Build hierarchy: UIView (form, formActionURL="/submit") > UIView (div) > UIButton (button)
   - Call `attemptMPAFormSubmit(from: buttonView)` — should return `true`
   - Test with no form ancestor — should return `false`
   - Test with form that has no `formActionURL` — should return `false`
   - Test with form that has empty `formActionURL` — should return `false`

**Fantom integration test** — add `tests/integration/mpa-form-submit-itest.js`:
   - This test is limited to verifying the JS/Swift bridge stores form props correctly, since Fantom cannot perform real network requests. Render a `<form action="/submit"><input name="q" /><button>Go</button></form>`, then verify the rendered output includes the form with its action prop stored. The actual MPA POST flow requires a running SSR server and is covered by manual and E2E testing.

**Run existing test suites:**
```bash
npm run test:swift     # All Swift unit tests pass, including new MPAFormSubmitTests
npm run test:fantom    # All Fantom integration tests pass (no regressions)
npm test               # All JS unit tests pass
```

### Manual Testing

1. **Prepare a form fixture for MPA testing:**
   - Create or use a fixture with `<form action="http://localhost:6001/prerender/06-kitchen-sink">` containing `<input name="testfield" />` and `<button>Submit</button>`
   - Ensure the SSR server (port 6001) is running

2. **Test pre-hydration MPA form submit:**
   - Build and run the demo app: use `/build demo`
   - Start log capture: `npm run app:log-start`
   - Kill the dev server JS bundle watcher to prevent hydration (or add a long artificial delay)
   - Navigate to the form fixture
   - Verify the form renders via SSR (screenshot should show form elements): `npm run app:screenshot`
   - Find the submit button coordinates: `npm run app:snapshot-ui -- --filter Submit`
   - Tap the submit button: `npm run app:tap -- <x> <y>`
   - Read logs: `npm run app:log-read` — should show `[react-dom-native] MPA form submit` log with the action URL
   - Verify the SSR server received the POST request (check SSR server terminal output)

3. **Test form data collection:**
   - Before tapping submit, type text into the input field: `npm run app:tap -- <input_x> <input_y>` then `npm run app:type-text -- "hello world"`
   - Tap submit
   - Verify in SSR server logs that the POST body includes `testfield=hello%20world`

4. **Test edge cases:**
   - Tap a button that is NOT inside a form — should not trigger MPA POST, should fall through to normal pre-hydration behavior
   - Tap submit on a form with no `action` attribute — `attemptMPAFormSubmit` should return `false`
   - Re-enable the JS bundle and verify normal hydration still works — post-hydration taps should go through JS event handlers, not MPA path

5. **Test hydration race condition:**
   - Load the form fixture and rapidly tap submit — if hydration completes mid-tap, verify no crash or double submit

### Regression Checklist

- [ ] All existing Falcon fixtures render correctly via GET requests
- [ ] Staggered Loading fixture loads with partial prerender
- [ ] Hydration starts in parallel to SSR stream (verify via logs)
- [ ] Counter in Staggered Loading can be incremented after hydration
- [ ] `npm test` passes
- [ ] `npm run test:swift` passes
- [ ] `npm run test:fantom` passes
- [ ] No networking regressions (existing GET fetches work)
- [ ] Server hot-reload still works (clearServerSourceCache)
- [ ] Pre-hydration tap on non-form buttons still works (existing handleRootTap behavior preserved)
- [ ] ShadowNodeFamily fields `formActionURL` and `inputName` default to nil and do not affect existing elements

### Smoke Test: Staggered Loading

This critical smoke test verifies existing functionality is preserved after the ShadowNodeFamily and UIKitMutationApplier changes:

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
