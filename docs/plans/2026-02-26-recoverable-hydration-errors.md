# Recoverable Hydration Errors — Test & Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an e2e test for the recoverable errors fixture (11-recoverable-errors), then debug and fix why hydration errors don't fall back to client render.

**Architecture:** The fixture has two cases: (1) a text mismatch (`HydrationMismatch` renders `Date.now()`, different on server vs client), and (2) a throw-during-hydration inside `<Suspense>` (`ThrowOnHydration`). React's reconciler detects these mismatches, sets `ForceClientRender` on the nearest Suspense boundary, and re-renders that subtree client-side. The renderer uses persistent mode, so the fallback flows through `cloneInstance` / `replaceContainerChildren` / `$$completeRoot` rather than mutation-mode `clearSuspenseBoundary`.

**Tech Stack:** Swift (XCTest), React reconciler (persistent mode), JavaScriptCore, Yoga

---

### Task 1: Add the failing e2e test

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift`

**Step 1: Write the test**

Add a new test to `EndToEndSSRTests` that SSR-renders fixture 11, hydrates it, and asserts the recovered content is visible. The fixture has two sections:

- **Text Mismatch**: `HydrationMismatch` renders `Date.now()` — server and client produce different values. After recovery, the client value should be visible (a numeric string).
- **Suspense Recovery**: `ThrowOnHydration` throws during hydration inside `<Suspense>`. After recovery, the child text "This renders on the server, then recovers on the client" should be visible.

```swift
// MARK: - Test 6: Recoverable Errors — Hydration Mismatch Recovery

func testRecoverableErrorsHydrate() {
    // 1. SSR render
    let ssrDone = expectation(description: "SSR complete")
    root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/11-recoverable-errors") { error in
        XCTAssertNil(error, "SSR should complete without error")
        ssrDone.fulfill()
    }
    wait(for: [ssrDone], timeout: 15.0)

    // Verify SSR produced views
    let scroll = scrollView(in: container)
    XCTAssertNotNil(scroll, "SSR should create a UIScrollView")

    let ssrTexts = findLabelTexts(in: scroll!)
    XCTAssertTrue(ssrTexts.contains(where: { $0.contains("Recoverable Errors") }),
                   "Should find title in SSR output, got: \(ssrTexts)")

    // 2. Hydrate — this triggers recoverable errors that React should recover from
    let hydrateDone = expectation(description: "Hydration complete")
    root.hydrateRoot(serverURL: "\(Self.flightBaseURL)/fixtures/11-recoverable-errors") { error in
        XCTAssertNil(error, "Hydration should complete without error")
        hydrateDone.fulfill()
    }
    wait(for: [hydrateDone], timeout: 20.0)

    // 3. Wait for recovery — React should client-render the mismatched subtrees
    waitForCondition(timeout: 15.0, description: "recoverable error content appears") {
        let texts = self.findLabelTexts(in: scroll!)
        // The title and section headers should survive
        let hasTitle = texts.contains(where: { $0.contains("Recoverable Errors") })
        // The Suspense recovery section should show recovered content
        let hasSuspenseRecovery = texts.contains(where: {
            $0.contains("This renders on the server, then recovers on the client")
        })
        return hasTitle && hasSuspenseRecovery
    }

    // 4. Assert final state
    let texts = findLabelTexts(in: scroll!)
    XCTAssertTrue(texts.contains(where: { $0.contains("Recoverable Errors") }),
                   "Title should survive hydration recovery, got: \(texts)")
    XCTAssertTrue(texts.contains(where: { $0.contains("Text Mismatch") }),
                   "Text Mismatch section header should be visible, got: \(texts)")
    XCTAssertTrue(texts.contains(where: { $0.contains("Suspense Recovery") }),
                   "Suspense Recovery section header should be visible, got: \(texts)")
    XCTAssertTrue(texts.contains(where: {
        $0.contains("This renders on the server, then recovers on the client")
    }), "Suspense-recovered content should be visible after hydration recovery, got: \(texts)")
}
```

**Step 2: Run the test to verify it fails**

Run: `npm run test:e2e-swift`

Expected: The test fails. Likely outcomes:
- Hydration crashes/hangs instead of recovering gracefully
- Views are empty after hydration (`got: []`)
- The `waitForCondition` times out because recovered content never appears

**Step 3: Commit the failing test**

```
git add packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift
git commit -m "Add failing e2e test for recoverable hydration errors"
```

---

### Task 2: Debug the failure

**Step 1: Read the test output**

Look at the xcodebuild output from the failing test. Key things to look for:
- JS console logs (printed via `$$log` / `console.log`) — these show up in xcodebuild stderr
- Whether hydration starts at all (`[Renderer] hydrateRoot called`)
- Whether `onRecoverableError` fires (`[JS WARN] Recoverable:`)
- Whether `replaceContainerChildren` is called and with what arguments
- Any crashes, exceptions, or assertion failures in Swift

**Step 2: Add targeted logging if needed**

Key files to add logging to, depending on what the test output shows:

| Symptom | File to investigate | What to log |
|---------|-------------------|-------------|
| Hydration never completes | `packages/react-dom-native/src/entry.js:206-219` | Whether `hydrateFromStream` is called |
| JS exception during hydration | `packages/react-dom-native/src/renderer/HostConfig.js` | Which HostConfig method throws |
| `replaceContainerChildren` gets wrong args | `packages/react-dom-native/src/renderer/HostConfig.js:275-297` | Log the newChildren array in detail |
| `cloneInstance` fails for recovered nodes | `packages/react-dom-native/src/renderer/HostConfig.js:190-232` | Log instance state (does `_nativeNode` exist?) |
| Swift shadow tree diff crashes | `packages/react-dom-native/ios/Sources/ShadowTree/` | Log the diff input |
| `$$completeRoot` receives bad nodes | `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift` | Log the node refs |

**Step 3: Reproduce in isolation**

If the failure is hard to diagnose from test output alone, try running the fixture via CSR (which doesn't involve SSR+hydration) to confirm the fixture itself works:

```swift
func testRecoverableErrorsCSR() {
    let renderDone = expectation(description: "render called")
    root.render(serverURL: "\(Self.flightBaseURL)/fixtures/11-recoverable-errors") { error in
        XCTAssertNil(error)
        renderDone.fulfill()
    }
    wait(for: [renderDone], timeout: 15.0)

    waitForCondition(timeout: 15.0, description: "views appear") {
        guard let scroll = self.scrollView(in: self.container) else { return false }
        let texts = self.findLabelTexts(in: scroll)
        return texts.contains(where: { $0.contains("Recoverable Errors") })
    }
}
```

---

### Task 3: Fix the root cause

**Step 1: Identify the broken layer**

Based on Task 2 debugging, the fix will be in one of these layers:

| Layer | Files |
|-------|-------|
| HostConfig hydration methods | `packages/react-dom-native/src/renderer/HostConfig.js` (lines 773-876) |
| HostConfig persistent-mode clone/commit | `packages/react-dom-native/src/renderer/HostConfig.js` (lines 190-297) |
| Renderer hydrateRoot setup | `packages/react-dom-native/src/renderer/renderer.js` (lines 101-152) |
| Entry point hydrateFromStream | `packages/react-dom-native/src/entry.js` (lines 206-219) |
| Swift shadow tree / completeRoot | `packages/react-dom-native/ios/Sources/ShadowTree/` |
| Swift Root hydration lifecycle | `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` |

**Step 2: Implement the fix**

Make the minimal change to fix the root cause. Don't refactor surrounding code.

**Step 3: Run the test to verify it passes**

Run: `npm run test:e2e-swift`

Expected: `testRecoverableErrorsHydrate` passes. All other tests still pass (8 executed, 1 skipped, 0 failures + the new test).

**Step 4: Run the full test suite**

Run: `npm test` (JS unit tests) and `npm run test:swift` (Swift unit tests) to make sure nothing regressed.

**Step 5: Commit the fix**

```
git add <changed files>
git commit -m "Fix hydration error recovery to fall back to client render"
```

---

### Reference: Key files

| File | Purpose |
|------|---------|
| `example/server/src/fixtures/11-recoverable-errors.js` | The fixture under test |
| `example/server/src/components/ThrowOnHydration.jsx` | Throws during hydration (detects native via `$$createNode`) |
| `example/server/src/components/HydrationMismatch.jsx` | Renders `Date.now()` for server/client mismatch |
| `packages/react-dom-native/src/renderer/HostConfig.js` | Hydration + persistent mode host config |
| `packages/react-dom-native/src/renderer/renderer.js` | `hydrateRoot` with `onRecoverableError` callback |
| `packages/react-dom-native/src/entry.js` | `hydrateFromStream` bridge entry point |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | SSR + hydration lifecycle |
| `packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift` | The test file |
