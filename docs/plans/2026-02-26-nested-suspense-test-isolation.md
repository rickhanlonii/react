# Investigate testNestedSuspenseRendersAndHydrates Failure

**Goal:** Fix the pre-existing test isolation bug causing `testNestedSuspenseRendersAndHydrates` to fail when hydration tests run before it.

---

## Symptom

- `testNestedSuspenseRendersAndHydrates` passes when run after SSR-only tests
- It fails with `got: []` (empty scroll view) when hydration tests run before it (alphabetical order: `testClientComponentsRendersAndHydrates`, `testContactFormRendersAndHydrates` come before `testNestedSuspense...`)
- SSR produces 43 mutations (correct), but after hydration the scroll view is empty — hydration wipes the view hierarchy and fails to rebuild it
- The `hydrateRoot` callback never fires (timeout after 16s)

## Key Question

Why does `resetForTesting()` + `unmount()` + run loop drain in tearDown not fully clean up state left by previous hydration tests?

---

## Investigation Steps

### Step 1: Confirm the ordering hypothesis

Run `testNestedSuspenseRendersAndHydrates` in isolation (no other tests) and confirm it passes. Then run it after only `testClientComponentsRendersAndHydrates` and confirm it fails. This isolates which test (or combination) triggers the failure.

**How:** Use `xcodebuild test` with `-only-testing:` to control test ordering.

### Step 2: Audit `resetForTesting()`

Read `ReactRuntime.resetForTesting()` and catalog everything it does and does NOT reset:
- JS context (JSContext) — is it recreated or reused?
- Registered client component modules
- URLSession state / active network connections
- Global JS variables (e.g., `globalThis.$$createNode`)
- Surface/root registration state
- Any singletons or static state in Swift

### Step 3: Audit tearDown cleanup

Read the `Root.unmount()` implementation and the tearDown sequence:
- Does `unmount()` cancel in-flight network requests?
- Does the 0.1s run loop drain give enough time for URLSession delegates to complete?
- Are there GCD blocks or timers from hydration that outlive tearDown?

### Step 4: Check client component module cache

Hydration tests load client component chunks (`Counter.jsx`, `Tabs.jsx`, `FormControls.jsx`). Check:
- Are loaded modules cached globally in the JS context?
- Does `resetForTesting()` clear this cache?
- Could stale module references cause the next test's hydration to use wrong module instances?

### Step 5: Check the `hasThrown` global in ThrowOnHydration

`ThrowOnHydration.jsx` has a module-level `let hasThrown = false` that persists across tests if the JS context is reused. If `testUncaughtHydrationError` or `testRecoverableErrorsHydrate` runs before nested-suspense, `hasThrown` stays `true` in the module scope. This wouldn't directly cause the nested-suspense failure but indicates JS context reuse.

### Step 6: Add diagnostic logging

Add temporary logging to the failing test path:
- Log the JS context identity (pointer) in setUp to verify it's a fresh context
- Log whether `hydrateRoot`'s callback fires at all (vs. silently failing)
- Log the Flight stream response status for the hydration request
- Log any JS errors during hydration (check if errors are swallowed)

### Step 7: Propose fix

Based on findings, the fix is likely one of:
1. **Recreate JSContext** in `resetForTesting()` instead of reusing it
2. **Increase tearDown drain time** or add explicit cancellation of in-flight requests
3. **Clear module cache** explicitly in `resetForTesting()`
4. **Invalidate URLSession** between tests to prevent connection reuse
5. **Accept the limitation** and reorder tests (rename to control alphabetical ordering)

---

## Files to Read

| File | Purpose |
|------|---------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` | `resetForTesting()` implementation |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | `unmount()`, `hydrateRoot()`, `renderWithSSR()` |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/JSBridge.swift` | JS context lifecycle |
| `packages/react-dom-native/src/entry.js` | Client-side module loading, global state |
| `packages/react-dom-native/src/flight-client/FlightClient.js` | Flight client state, module resolution |
| `example/server/src/components/ThrowOnHydration.jsx` | Module-level `hasThrown` global |
