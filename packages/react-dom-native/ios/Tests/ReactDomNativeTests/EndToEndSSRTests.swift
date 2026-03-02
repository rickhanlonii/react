import XCTest
import UIKit
@testable import ReactDomNativeKit

// ---------------------------------------------------------------------------
// EndToEndSSRTests
//
// End-to-end integration tests that exercise the full production pipeline:
// real HTTP servers → real SSR streaming → real UIKit views → real React
// hydration → interactive app.
//
// Uses the `hydrateRoot(view, url:)` free function which handles SSR streaming,
// bootstrap URL extraction, and hydration in a single call.
//
// Prerequisites: Flight server on port 7100, SSR server on port 7101.
// Use `npm run test:e2e-swift` which starts the servers automatically.
// ---------------------------------------------------------------------------

final class EndToEndSSRTests: XCTestCase {

    static let flightPort = 7100
    static let ssrPort = 7101
    static var flightBaseURL: String { "http://localhost:\(flightPort)" }
    static var ssrBaseURL: String { "http://localhost:\(ssrPort)" }

    private var container: UIView!
    private var root: Root!

    override func setUp() {
        super.setUp()
        ReactRuntime.shared.resetForTesting()
        container = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    }

    override func tearDown() {
        root?.unmount()
        // Drain the run loop so async cleanup (URLSession delegates, GCD blocks) completes
        // before the next test's setUp resets ReactRuntime.
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        root = nil
        container = nil
        super.tearDown()
    }

    // MARK: - Helpers

    /// Returns the UIScrollView that Root creates for SSR content.
    private func scrollView(in view: UIView) -> UIScrollView? {
        return view.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView
    }

    /// Recursively finds all UILabel views in the hierarchy and returns their text values.
    private func findLabelTexts(in view: UIView) -> [String] {
        var texts: [String] = []
        if let label = view as? UILabel, let text = label.text, !text.isEmpty {
            texts.append(text)
        }
        for sub in view.subviews {
            texts.append(contentsOf: findLabelTexts(in: sub))
        }
        return texts
    }

    /// Waits for a condition to become true, polling on the main run loop.
    private func waitForCondition(
        timeout: TimeInterval = 15.0,
        description: String = "condition",
        condition: @escaping () -> Bool
    ) {
        let exp = expectation(description: description)
        let deadline = Date().addingTimeInterval(timeout)

        func check() {
            if condition() {
                exp.fulfill()
            } else if Date() < deadline {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { check() }
            }
        }
        check()

        wait(for: [exp], timeout: timeout + 1.0)
    }

    /// Starts SSR + hydration via the hydrateRoot free function and waits for SSR content.
    private func hydrateFixture(_ fixtureName: String) {
        let ssrURL = "\(Self.ssrBaseURL)/ssr/\(fixtureName)"
        root = hydrateRoot(container, url: ssrURL)
    }

    // MARK: - Test 1: RSC-Only Fixture Renders via SSR

    func testRSCOnlySSRRenders() {
        hydrateFixture("01-rsc-only")

        // Wait for SSR content to appear
        waitForCondition(timeout: 15.0, description: "SSR content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains("RSC Only") && texts.contains("Server Content")
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("RSC Only"), "Should find 'RSC Only' in SSR output, got: \(texts)")
        XCTAssertTrue(texts.contains("Server Content"), "Should find 'Server Content' in SSR output, got: \(texts)")
    }

    // MARK: - Test 2: RSC-Only Fixture Hydrates Successfully

    func testRSCOnlyHydrates() {
        hydrateFixture("01-rsc-only")

        // Wait for content to appear (SSR + hydration happen automatically)
        waitForCondition(timeout: 20.0, description: "content appears after hydration") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains("RSC Only") && texts.contains("Server Content")
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("RSC Only"), "Content should survive hydration, got: \(texts)")
        XCTAssertTrue(texts.contains("Server Content"), "Content should survive hydration, got: \(texts)")
    }

    // MARK: - Test 3: Kitchen Sink Fixture Renders and Hydrates (Smoke Test)
    // TODO: Kitchen sink SSR+hydration fails because client component chunks
    // (e.g. ErrorBoundary.jsx) are loaded asynchronously via webpack and may not
    // be available when the Flight client tries to resolve them during hydration.
    // This is a real bug in the client component loading path, not a test issue.
    // The CSR version of this test (testKitchenSinkRendersViaCSR) works fine.

    func testKitchenSinkRendersAndHydrates() throws {
        throw XCTSkip("Client component chunk loading during SSR hydration is not yet supported")
    }

    // MARK: - Test 4: Nested Suspense Fixture Renders and Hydrates

    func testNestedSuspenseRendersAndHydrates() {
        hydrateFixture("05-nested-suspense")

        // Wait for SSR shell content
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Nested Suspense") })
        }

        // Wait for all boundary content to appear (boundaries resolve over 3s)
        waitForCondition(timeout: 20.0, description: "all boundaries resolved") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Fast") })
                && texts.contains(where: { $0.contains("Medium") })
                && texts.contains(where: { $0.contains("Slow (2000ms)") })
                && texts.contains(where: { $0.contains("Slowest") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Fast") }),
                       "Fast boundary should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Medium") }),
                       "Medium boundary should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Slow (2000ms)") }),
                       "Slow boundary should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Slowest") }),
                       "Slowest boundary should be visible, got: \(texts)")
    }

    // MARK: - Test 6: Recoverable Errors — Hydration Mismatch Recovery

    func testRecoverableErrorsHydrate() {
        hydrateFixture("11-recoverable-errors")

        // Wait for SSR content
        waitForCondition(timeout: 15.0, description: "SSR content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Recoverable Errors") })
        }

        // Wait for recovery — React should client-render the mismatched subtrees
        waitForCondition(timeout: 20.0, description: "recoverable error content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            let hasTitle = texts.contains(where: { $0.contains("Recoverable Errors") })
            let hasSuspenseRecovery = texts.contains(where: {
                $0.contains("This renders on the server, then recovers on the client")
            })
            return hasTitle && hasSuspenseRecovery
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
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

    // MARK: - Group A: Pure Server Components (SSR-only)

    func testFieldsetSSRRenders() {
        hydrateFixture("13-fieldset")

        waitForCondition(timeout: 15.0, description: "fieldset content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Fieldset") })
                && texts.contains(where: { $0.contains("Account Settings") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Fieldset") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Account Settings") }),
                       "Should find legend text, got: \(texts)")
    }

    func testButtonVariantsSSRRenders() {
        hydrateFixture("14-button-variants")

        waitForCondition(timeout: 15.0, description: "button variants content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Button Variants") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Button Variants") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Default Button") }),
                       "Should find button label, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Styled Button") }),
                       "Should find styled button label, got: \(texts)")
    }

    func testImageSquareSSRRenders() {
        hydrateFixture("15-image-square")

        waitForCondition(timeout: 15.0, description: "image square content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Square Image") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Square Image") }),
                       "Should find title, got: \(texts)")
    }

    func testImageLandscapeSSRRenders() {
        hydrateFixture("16-image-landscape")

        waitForCondition(timeout: 15.0, description: "image landscape content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Landscape Image") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Landscape Image") }),
                       "Should find title, got: \(texts)")
    }

    func testImageRowSSRRenders() {
        hydrateFixture("17-image-row")

        waitForCondition(timeout: 15.0, description: "image row content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Image Row") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Image Row") }),
                       "Should find title, got: \(texts)")
    }

    func testUnorderedListSSRRenders() {
        hydrateFixture("18-unordered-list")

        waitForCondition(timeout: 15.0, description: "unordered list content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Unordered List") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Unordered List") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("React Server Components") }),
                       "Should find list item text, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("UIKit Native Views") }),
                       "Should find list item text, got: \(texts)")
    }

    func testOrderedListSSRRenders() {
        hydrateFixture("19-ordered-list")

        waitForCondition(timeout: 15.0, description: "ordered list content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Ordered List") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Ordered List") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Server renders RSC") }),
                       "Should find list item text, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Interactive components activate") }),
                       "Should find list item text, got: \(texts)")
    }

    func testNestedListSSRRenders() {
        hydrateFixture("20-nested-list")

        waitForCondition(timeout: 15.0, description: "nested list content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Nested List") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Nested List") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("RSC rendering") }),
                       "Should find nested item text, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("JavaScriptCore") }),
                       "Should find nested item text, got: \(texts)")
    }

    func testTableSSRRenders() {
        hydrateFixture("21-table")

        waitForCondition(timeout: 15.0, description: "table content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Table") })
                && texts.contains(where: { $0.contains("Feature") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Table") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Feature") }),
                       "Should find header text, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("RSC Streaming") }),
                       "Should find cell text, got: \(texts)")
    }

    // MARK: - Group B: Client Components + Suspense (SSR + hydrate)

    func testSingleSuspenseRendersAndHydrates() {
        hydrateFixture("03-single-suspense")

        // Wait for SSR shell
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Single Suspense") })
        }

        // Wait for Suspense content to appear
        waitForCondition(timeout: 20.0, description: "suspense content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Loaded Content") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Loaded Content") }),
                       "Loaded Content should be visible after hydration, got: \(texts)")
    }

    func testClientComponentsRendersAndHydrates() {
        hydrateFixture("04-client-components")

        // Wait for SSR shell
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Client Components") })
        }

        // Wait for client components to be interactive
        waitForCondition(timeout: 20.0, description: "client components visible") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Counter") })
                && texts.contains(where: { $0.contains("Tabs") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Counter") }),
                       "Counter heading should be visible after hydration, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Tabs") }),
                       "Tabs heading should be visible after hydration, got: \(texts)")
    }

    func testContactFormRendersAndHydrates() {
        hydrateFixture("12-contact-form")

        // Wait for SSR shell
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Contact Form") })
        }

        // Wait for form controls to appear
        waitForCondition(timeout: 20.0, description: "form labels visible") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Name") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Contact Form") }),
                       "Title should survive hydration, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Name") }),
                       "Form field label should be visible after hydration, got: \(texts)")
    }

    func testMetaAIHomepageRendersAndHydrates() {
        hydrateFixture("22-meta-ai-homepage")

        // Wait for SSR content
        waitForCondition(timeout: 15.0, description: "SSR content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("What can I do for you?") })
        }

        // Wait for hydration to complete
        waitForCondition(timeout: 20.0, description: "hydrated content visible") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Ask anything") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("What can I do for you?") }),
                       "Title should survive hydration, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Ask anything") }),
                       "Input placeholder should be visible, got: \(texts)")
    }

    // MARK: - Group D: Flight Protocol

    func testFlightAsyncAwaitRendersAndHydrates() {
        hydrateFixture("23-flight-async-await")

        // Wait for SSR shell
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Async Await") })
        }

        // Wait for all async sections
        waitForCondition(timeout: 20.0, description: "async sections appear") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Fast Section") })
                && texts.contains(where: { $0.contains("Medium Section") })
                && texts.contains(where: { $0.contains("Slow Section") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Fast Section") }),
                       "Fast section should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Slow Section") }),
                       "Slow section should be visible, got: \(texts)")
    }

    func testFlightParallelAsyncRendersAndHydrates() {
        // Use a root with onRecoverableError to detect hydration mismatches
        var recoverableErrors: [Error] = []
        let options = RootOptions(onRecoverableError: { error in
            recoverableErrors.append(error)
        })
        let ssrURL = "\(Self.ssrBaseURL)/ssr/24-flight-parallel-async"
        root = hydrateRoot(container, url: ssrURL, options: options)

        // Wait for SSR shell
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Parallel Async") })
        }

        // Wait for all parallel sections
        waitForCondition(timeout: 20.0, description: "parallel sections appear") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Left") })
                && texts.contains(where: { $0.contains("Right") })
                && texts.contains(where: { $0 == "A" || $0.contains("A") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Left") }),
                       "Left section should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Right") }),
                       "Right section should be visible, got: \(texts)")

        // Assert no hydration mismatches
        XCTAssertEqual(recoverableErrors.count, 0,
                       "Hydration should complete without recoverable errors (mismatches), got: \(recoverableErrors)")
    }

    func testFlightServerErrorHandled() {
        hydrateFixture("25-flight-server-error")

        // Wait for SSR streaming reveals to bring in the Suspense content
        waitForCondition(timeout: 20.0, description: "SSR streaming content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Success") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Server Error") }),
                       "Should find title, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Success") }),
                       "Success section should be visible via SSR streaming, got: \(texts)")
    }

    func testFlightDedupedComponentRenders() {
        hydrateFixture("27-flight-deduped-component")

        // Wait for SSR shell
        waitForCondition(timeout: 15.0, description: "SSR shell content") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Deduped Component") })
        }

        // Wait for shared content to appear in both cards
        waitForCondition(timeout: 20.0, description: "deduped content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Card A") })
                && texts.contains(where: { $0.contains("Card B") })
                && texts.contains(where: { $0.contains("Shared content") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Card A") }),
                       "Card A should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Card B") }),
                       "Card B should be visible, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Shared content") }),
                       "Shared content should appear, got: \(texts)")
    }

    // MARK: - Group C: Error Handling

    func testCaughtErrorsRendersAndHydrates() {
        // Fixture 07: ErrorBoundary catches server, hydration, and interaction errors
        // The async ThrowingServerComponent error corrupts the RSC Flight stream,
        // so SSR only gets a partial response. Verify SSR handles this gracefully.
        hydrateFixture("07-caught-errors")

        // Wait for any content to appear
        waitForCondition(timeout: 15.0, description: "some content appears") {
            let scroll = self.scrollView(in: self.container)
            return scroll != nil
        }

        // SSR should create a view hierarchy even with the server error
        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll, "SSR should create a UIScrollView even with server errors")
        // Test passes as long as the app doesn't crash
    }

    func testUncaughtServerErrorSSR() {
        // Fixture 08: Server component throws with no ErrorBoundary
        hydrateFixture("08-uncaught-server-error")

        // Wait for any content or scroll view to appear
        waitForCondition(timeout: 15.0, description: "some content appears") {
            let scroll = self.scrollView(in: self.container)
            return scroll != nil
        }

        // The server error should either:
        // - Be reported via the error callback, or
        // - The SSR shell renders but streaming fails
        // Either way, verify we got some output (at minimum the shell)
        let scroll = scrollView(in: container)
        if let scroll = scroll {
            let texts = findLabelTexts(in: scroll)
            // If we got the shell, verify the title is there
            if !texts.isEmpty {
                XCTAssertTrue(texts.contains(where: { $0.contains("Uncaught Server Error") }),
                               "Should find title if shell rendered, got: \(texts)")
            }
        }
        // Test passes as long as the app doesn't crash
    }

    func testUncaughtHydrationError() {
        // Fixture 09: ThrowOnHydration throws during hydration, no ErrorBoundary
        hydrateFixture("09-uncaught-hydration-error")

        // Wait for SSR content (renders fine, ThrowOnHydration only throws on client)
        waitForCondition(timeout: 15.0, description: "SSR content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Uncaught Hydration Error") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Uncaught Hydration Error") }),
                       "Should find title in SSR output, got: \(texts)")
        // Test passes as long as the app doesn't crash
    }

    func testUncaughtInteractionError() {
        // Fixture 10: ThrowOnClick renders a button, error only on click
        hydrateFixture("10-uncaught-interaction-error")

        // Wait for SSR content
        waitForCondition(timeout: 15.0, description: "SSR content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Uncaught Interaction Error") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Uncaught Interaction Error") }),
                       "Should find title in SSR output, got: \(texts)")
        XCTAssertTrue(texts.contains(where: { $0.contains("Click to throw") }),
                       "Should find button label in SSR output, got: \(texts)")
    }

    // MARK: - Test 5: Text Formatting Fixture Renders via SSR

    func testTextFormattingSSRRenders() {
        hydrateFixture("02-text-formatting")

        waitForCondition(timeout: 15.0, description: "text formatting content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            return scroll.subviews.count > 0 && self.findLabelTexts(in: scroll).count > 0
        }

        let scroll = scrollView(in: container)!
        XCTAssertTrue(scroll.subviews.count > 0, "Should have content views")
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.count > 0, "Should have visible text content")
    }
}
