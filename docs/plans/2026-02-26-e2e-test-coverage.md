# E2E Test Coverage for All Fixtures

**Goal:** Add e2e tests for all 23 untested fixtures using parallel subagents.

**Prerequisites:** Build server running on port 6002. Use `npm run test:e2e-swift` to run tests (delegates to build server automatically).

---

## Current Coverage

| Fixture | SSR | Hydration | CSR |
|---------|-----|-----------|-----|
| 01-rsc-only | `testRSCOnlySSRRenders` | `testRSCOnlyHydrates` | `testRSCOnlyRendersViaCSR` |
| 02-text-formatting | `testTextFormattingSSRRenders` | - | `testTextFormattingRendersViaCSR` |
| 05-nested-suspense | - | `testNestedSuspenseRendersAndHydrates` | - |
| 06-kitchen-sink | - | `testKitchenSinkRendersAndHydrates` (skipped) | `testKitchenSinkRendersViaCSR` |
| 11-recoverable-errors | - | `testRecoverableErrorsHydrate` | - |

---

## Group A — Pure Server Components (no client JS, no Suspense)

Simple SSR-render + verify text content. No hydration needed.

**Test file:** `EndToEndSSRTests.swift`
**Pattern:** `renderWithSSR` → assert title/content labels visible

| # | Fixture | Test Name | Key Assertions |
|---|---------|-----------|----------------|
| 13 | fieldset | `testFieldsetSSRRenders` | Title "Fieldset" visible, legend text visible |
| 14 | button-variants | `testButtonVariantsSSRRenders` | Title visible, button label texts visible |
| 15 | image-square | `testImageSquareSSRRenders` | Title visible |
| 16 | image-landscape | `testImageLandscapeSSRRenders` | Title visible |
| 17 | image-row | `testImageRowSSRRenders` | Title visible |
| 18 | unordered-list | `testUnorderedListSSRRenders` | Title visible, list item texts visible |
| 19 | ordered-list | `testOrderedListSSRRenders` | Title visible, list item texts visible |
| 20 | nested-list | `testNestedListSSRRenders` | Title visible, nested item texts visible |
| 21 | table | `testTableSSRRenders` | Title visible, header/cell texts visible |

**Template:**
```swift
func testFieldsetSSRRenders() {
    let ssrDone = expectation(description: "SSR complete")
    root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/13-fieldset") { error in
        XCTAssertNil(error, "SSR should complete without error")
        ssrDone.fulfill()
    }
    wait(for: [ssrDone], timeout: 15.0)

    let scroll = scrollView(in: container)
    XCTAssertNotNil(scroll, "SSR should create a UIScrollView")

    let texts = findLabelTexts(in: scroll!)
    XCTAssertTrue(texts.contains(where: { $0.contains("Fieldset") }),
                   "Should find title, got: \(texts)")
}
```

---

## Group B — Client Components + Suspense

SSR-render, hydrate, wait for interactive content to appear.

**Test file:** `EndToEndSSRTests.swift`
**Pattern:** `renderWithSSR` → `hydrateRoot` → `waitForCondition` → assert content

| # | Fixture | Test Name | Key Assertions |
|---|---------|-----------|----------------|
| 03 | single-suspense | `testSingleSuspenseRendersAndHydrates` | Suspense content appears after hydration |
| 04 | client-components | `testClientComponentsRendersAndHydrates` | Counter text visible after hydration |
| 12 | contact-form | `testContactFormRendersAndHydrates` | Form field labels visible after hydration |
| 22 | meta-ai-homepage | `testMetaAIHomepageRendersAndHydrates` | Page title and section headers visible |

**Template:**
```swift
func testSingleSuspenseRendersAndHydrates() {
    // 1. SSR render
    let ssrDone = expectation(description: "SSR complete")
    root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/03-single-suspense") { error in
        XCTAssertNil(error, "SSR should complete without error")
        ssrDone.fulfill()
    }
    wait(for: [ssrDone], timeout: 15.0)

    let scroll = scrollView(in: container)
    XCTAssertNotNil(scroll, "SSR should create a UIScrollView")

    // 2. Hydrate
    let hydrateDone = expectation(description: "Hydration complete")
    root.hydrateRoot(serverURL: "\(Self.flightBaseURL)/fixtures/03-single-suspense") { error in
        XCTAssertNil(error, "Hydration should complete without error")
        hydrateDone.fulfill()
    }
    wait(for: [hydrateDone], timeout: 20.0)

    // 3. Wait for Suspense content
    waitForCondition(timeout: 15.0, description: "suspense content appears") {
        let texts = self.findLabelTexts(in: scroll!)
        return texts.contains(where: { $0.contains(/* fixture-specific text */) })
    }

    // 4. Assert
    let texts = findLabelTexts(in: scroll!)
    XCTAssertTrue(texts.contains(where: { $0.contains(/* fixture-specific text */) }),
                   "Content should be visible after hydration, got: \(texts)")
}
```

---

## Group C — Error Handling

Test error boundary fallbacks, uncaught errors, and error callbacks.

**Test files:** `EndToEndSSRTests.swift` and `EndToEndCSRTests.swift`

| # | Fixture | Test Name | Type | Key Assertions |
|---|---------|-----------|------|----------------|
| 07 | caught-errors | `testCaughtErrorsRendersAndHydrates` | SSR+hydrate | Error boundary fallback text visible |
| 08 | uncaught-server-error | `testUncaughtServerErrorSSR` | SSR | SSR completion callback receives error |
| 09 | uncaught-hydration-error | `testUncaughtHydrationError` | SSR+hydrate | Hydration error handled, app doesn't crash |
| 10 | uncaught-interaction-error | `testUncaughtInteractionError` | SSR+hydrate | Post-hydration error handled |
| 28 | client-render-errors | `testClientRenderErrorsViaCSR` | CSR | Error handled, fallback visible |

**Notes:**
- Read each fixture source to understand the expected error behavior
- Error fixtures may need `XCTExpectFailure` or error callback assertions
- Some may intentionally crash — verify the app recovers or shows fallback UI

---

## Group D — Flight Protocol

Test RSC streaming, async server components, and Flight edge cases.

**Test files:** `EndToEndSSRTests.swift` and `EndToEndCSRTests.swift`

| # | Fixture | Test Name | Type | Key Assertions |
|---|---------|-----------|------|----------------|
| 23 | flight-async-await | `testFlightAsyncAwaitRendersAndHydrates` | SSR+hydrate | Async content visible after streaming |
| 24 | flight-parallel-async | `testFlightParallelAsyncRendersAndHydrates` | SSR+hydrate | Multiple async sections all resolve |
| 25 | flight-server-error | `testFlightServerErrorHandled` | SSR or CSR | Error from server handled gracefully |
| 26 | flight-aborted-suspense | `testFlightAbortedSuspense` | SSR+hydrate | Aborted boundary shows fallback |
| 27 | flight-deduped-component | `testFlightDedupedComponentRenders` | SSR+hydrate | Component renders correctly (not duplicated) |

**Notes:**
- Read each fixture source to understand the streaming behavior
- Async fixtures have server-side delays — use appropriate timeouts
- `flight-server-error` and `flight-aborted-suspense` may need error/fallback assertions

---

## Execution

### Sequential batches (single branch, no worktrees)

Worktrees can't be used because Xcode builds and simulators are tied to a single workspace. All work happens on one branch, executed sequentially in 4 batches.

**For each batch:**
1. Read fixture source files to determine exact assertion text
2. Write all tests for the group into `EndToEndSSRTests.swift` / `EndToEndCSRTests.swift`
3. Run `npm run test:e2e-swift` to verify all tests pass
4. Commit the batch

### Batch order

```
Batch 1: Group A (9 SSR-only tests)        — simplest, no hydration
Batch 2: Group B (4 SSR+hydrate tests)     — builds on SSR pattern
Batch 3: Group D (5 Flight protocol tests) — streaming + async
Batch 4: Group C (5 error handling tests)  — trickiest, may need skips
Final:   Run full suite, verify 0 failures
```

**Why this order:** Start with the simplest tests (pure SSR, no client JS) to build confidence, then add hydration, then streaming, then error edge cases last since they're most likely to need fixture-specific handling.
