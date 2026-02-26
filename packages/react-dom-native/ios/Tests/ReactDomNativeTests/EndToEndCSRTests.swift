import XCTest
import UIKit
@testable import ReactDomNativeKit

// ---------------------------------------------------------------------------
// EndToEndCSRTests
//
// End-to-end integration tests that exercise the CSR (client-side rendering)
// pipeline: real HTTP Flight server → real React reconciler → real UIKit views.
//
// Unlike SSR tests, CSR uses `root.render(serverURL:)` which calls completion
// immediately — before any Flight data arrives or views are created. Tests
// must poll/wait for views to appear.
//
// Prerequisites: Flight server on port 7100.
// Use `npm run test:e2e-swift` which starts the servers automatically.
// ---------------------------------------------------------------------------

final class EndToEndCSRTests: XCTestCase {

    static let flightPort = 7100
    static var flightBaseURL: String { "http://localhost:\(flightPort)" }

    private var container: UIView!
    private var root: Root!

    override func setUp() {
        super.setUp()
        ReactRuntime.shared.resetForTesting()
        ReactRuntime.shared.devBundleURL = URL(string: "\(Self.flightBaseURL)/bundle.js")
        container = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        root = Root(container: container)
    }

    override func tearDown() {
        root.unmount()
        // Drain the run loop so async cleanup (URLSession delegates, GCD blocks) completes
        // before the next test's setUp resets ReactRuntime.
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        root = nil
        container = nil
        super.tearDown()
    }

    // MARK: - Helpers

    /// Returns the UIScrollView that Root creates for content.
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

    // MARK: - Test 1: RSC-Only Fixture Renders via CSR

    func testRSCOnlyRendersViaCSR() {
        // Start CSR render — completion fires immediately, before views exist
        let renderDone = expectation(description: "render called")
        root.render(serverURL: "\(Self.flightBaseURL)/fixtures/01-rsc-only") { error in
            XCTAssertNil(error, "CSR render should start without error")
            renderDone.fulfill()
        }
        wait(for: [renderDone], timeout: 15.0)

        // Wait for views to appear asynchronously
        waitForCondition(timeout: 15.0, description: "RSC Only labels appear") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains("RSC Only") && texts.contains("Server Content")
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("RSC Only"), "Should find 'RSC Only' in CSR output, got: \(texts)")
        XCTAssertTrue(texts.contains("Server Content"), "Should find 'Server Content' in CSR output, got: \(texts)")
    }

    // MARK: - Test 2: Text Formatting Fixture Renders via CSR

    func testTextFormattingRendersViaCSR() {
        let renderDone = expectation(description: "render called")
        root.render(serverURL: "\(Self.flightBaseURL)/fixtures/02-text-formatting") { error in
            XCTAssertNil(error, "CSR render should start without error")
            renderDone.fulfill()
        }
        wait(for: [renderDone], timeout: 15.0)

        // Wait for views to appear
        waitForCondition(timeout: 15.0, description: "text formatting views appear") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            return scroll.subviews.count > 0 && self.findLabelTexts(in: scroll).count > 0
        }

        let scroll = scrollView(in: container)!
        XCTAssertTrue(scroll.subviews.count > 0, "Should have content views")
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.count > 0, "Should have visible text content, got: \(texts)")
    }

    // MARK: - Test 3: Kitchen Sink Fixture Renders via CSR (Smoke Test)

    func testKitchenSinkRendersViaCSR() {
        // Kitchen sink has Suspense boundaries + client components
        let renderDone = expectation(description: "render called")
        root.render(serverURL: "\(Self.flightBaseURL)/fixtures/06-kitchen-sink") { error in
            XCTAssertNil(error, "CSR render should start without error")
            renderDone.fulfill()
        }
        wait(for: [renderDone], timeout: 15.0)

        // Wait for views to appear
        waitForCondition(timeout: 20.0, description: "kitchen sink views appear") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            return scroll.subviews.count > 0 && self.findLabelTexts(in: scroll).count > 0
        }

        let scroll = scrollView(in: container)!
        XCTAssertTrue(scroll.subviews.count > 0, "Should have content views after CSR")
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.count > 0, "Should have visible text after CSR, got: \(texts)")
    }

    // MARK: - Test 4: Client Render Errors via CSR

    func testClientRenderErrorsViaCSR() {
        // Fixture 28: ThrowOnServer throws on server, renders on client
        // Via CSR, the component should render successfully (only throws server-side)
        let renderDone = expectation(description: "render called")
        root.render(serverURL: "\(Self.flightBaseURL)/fixtures/28-client-render-errors") { error in
            XCTAssertNil(error, "CSR render should start without error")
            renderDone.fulfill()
        }
        wait(for: [renderDone], timeout: 15.0)

        // Wait for views to appear
        waitForCondition(timeout: 15.0, description: "client render content appears") {
            guard let scroll = self.scrollView(in: self.container) else { return false }
            let texts = self.findLabelTexts(in: scroll)
            return texts.contains(where: { $0.contains("Suspense Recovery") })
        }

        let scroll = scrollView(in: container)!
        let texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains(where: { $0.contains("Suspense Recovery") }),
                       "Should find section heading, got: \(texts)")
    }
}
