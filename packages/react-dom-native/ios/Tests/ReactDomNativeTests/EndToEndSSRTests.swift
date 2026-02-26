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
// Prerequisites: Flight server on port 7100, SSR server on port 7101.
// Use `npm run test:e2e-swift` which starts the servers automatically.
// ---------------------------------------------------------------------------

final class EndToEndSSRTests: XCTestCase {

    static let flightPort = 7100
    static let ssrPort = 7101
    static var flightBaseURL: String { "http://localhost:\(flightPort)" }
    static var ssrBaseURL: String { "http://localhost:\(ssrPort)" }

    private var container: UIView!

    override func setUp() {
        super.setUp()
        ReactRuntime.shared.resetForTesting()
        ReactRuntime.shared.devBundleURL = URL(string: "\(Self.flightBaseURL)/bundle.js")
        container = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    }

    override func tearDown() {
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

    // MARK: - Test 1: RSC-Only Fixture Renders via SSR

    func testRSCOnlySSRRenders() {
        let root = Root(container: container)

        // 1. SSR render from real server
        let ssrDone = expectation(description: "SSR complete")
        root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/01-rsc-only") { error in
            XCTAssertNil(error, "SSR should complete without error")
            ssrDone.fulfill()
        }
        wait(for: [ssrDone], timeout: 15.0)

        // 2. Verify SSR produced UIViews
        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll, "SSR should create a UIScrollView")

        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("RSC Only"), "Should find 'RSC Only' in SSR output, got: \(texts)")
        XCTAssertTrue(texts.contains("Server Content"), "Should find 'Server Content' in SSR output, got: \(texts)")

        root.unmount()
    }

    // MARK: - Test 2: RSC-Only Fixture Hydrates Successfully

    func testRSCOnlyHydrates() {
        let root = Root(container: container)

        // 1. SSR render
        let ssrDone = expectation(description: "SSR complete")
        root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/01-rsc-only") { error in
            XCTAssertNil(error)
            ssrDone.fulfill()
        }
        wait(for: [ssrDone], timeout: 15.0)

        // Verify pre-hydration state
        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll)

        // 2. Hydrate with real Flight data
        let hydrateDone = expectation(description: "Hydration complete")
        root.hydrateRoot(serverURL: "\(Self.flightBaseURL)/fixtures/01-rsc-only") { error in
            XCTAssertNil(error, "Hydration should complete without error")
            hydrateDone.fulfill()
        }
        wait(for: [hydrateDone], timeout: 20.0)

        // 3. Verify views survived hydration
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("RSC Only"), "Content should survive hydration, got: \(texts)")
        XCTAssertTrue(texts.contains("Server Content"), "Content should survive hydration, got: \(texts)")

        root.unmount()
    }

    // MARK: - Test 3: Kitchen Sink Fixture Renders and Hydrates (Smoke Test)

    func testKitchenSinkRendersAndHydrates() {
        let root = Root(container: container)

        // 1. SSR render — kitchen sink has Suspense boundaries + client components
        let ssrDone = expectation(description: "SSR complete")
        root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/06-kitchen-sink") { error in
            XCTAssertNil(error, "SSR should complete without error")
            ssrDone.fulfill()
        }
        wait(for: [ssrDone], timeout: 15.0)

        // Verify SSR produced views
        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll, "SSR should create a UIScrollView")
        XCTAssertTrue(scroll!.subviews.count > 0, "SSR should produce at least one child view")

        // 2. Hydrate
        let hydrateDone = expectation(description: "Hydration complete")
        root.hydrateRoot(serverURL: "\(Self.flightBaseURL)/fixtures/06-kitchen-sink") { error in
            XCTAssertNil(error, "Hydration should complete without error")
            hydrateDone.fulfill()
        }
        wait(for: [hydrateDone], timeout: 20.0)

        // 3. Verify no crash, content visible
        XCTAssertTrue(scroll!.subviews.count > 0, "Views should survive hydration")
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.count > 0, "Should have visible text after hydration, got: \(texts)")

        root.unmount()
    }

    // MARK: - Test 4: Text Formatting Fixture Renders via SSR

    func testTextFormattingSSRRenders() {
        let root = Root(container: container)

        // Text formatting fixture — pure server components with styled text
        let ssrDone = expectation(description: "SSR complete")
        root.renderWithSSR(serverURL: "\(Self.ssrBaseURL)/ssr/02-text-formatting") { error in
            XCTAssertNil(error, "SSR should complete without error")
            ssrDone.fulfill()
        }
        wait(for: [ssrDone], timeout: 15.0)

        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll, "SSR should create a UIScrollView")
        XCTAssertTrue(scroll!.subviews.count > 0, "Should have content views")

        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.count > 0, "Should have visible text content")

        root.unmount()
    }
}
