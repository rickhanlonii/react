import XCTest
import UIKit
import ShadowTree
@testable import ReactDomNativeKit

// ---------------------------------------------------------------------------
// ProgressiveHydrationTests
//
// Integration tests that exercise the real ReactDomNativeKit SSR pipeline:
// Root → SSRCoordinator → ShadowTreeBuilder → UIKitMutationApplier → UIViews.
//
// These tests feed SSR instruction streams directly to Root.feedSSRData()
// (bypassing HTTP) and verify the resulting UIView hierarchy.
//
// View hierarchy notes:
// - Text-container elements (p, h1-h6, span, etc.) create UILabels
// - #text nodes create separate UILabels (children of the text container UILabel)
// - div, section, etc. create UIViews
// - #suspense creates a UIView (falls through to default case)
// - Root.createViewsFromTree wraps everything in a UIScrollView
// ---------------------------------------------------------------------------

final class ProgressiveHydrationTests: XCTestCase {

    private var container: UIView!

    override func setUp() {
        super.setUp()
        container = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    }

    override func tearDown() {
        container = nil
        super.tearDown()
    }

    // MARK: - Helpers

    /// Builds a newline-delimited instruction stream from an array of instruction arrays.
    /// Includes a trailing newline so the parser processes the last instruction
    /// without requiring `finish()`.
    private func stream(_ instructions: [[Any]]) -> String {
        let lines = instructions.compactMap { inst -> String? in
            guard let data = try? JSONSerialization.data(withJSONObject: inst, options: []),
                  let str = String(data: data, encoding: .utf8) else { return nil }
            return str
        }
        return lines.joined(separator: "\n") + "\n"
    }

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

    // MARK: - Test 1: SSR Shell Renders to UIViews

    func testSSRShellRendersToUIViews() {
        // Fizz output for: <div><p>Hello</p></div>
        let ssrStream = stream([
            ["O", "div"],
              ["O", "p"],
                ["T", "Hello"],
              ["C"],
            ["C"],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(ssrStream)

        // Container should have a scroll view (created by createViewsFromTree)
        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll, "SSR should create a UIScrollView in the container")

        // Scroll view should have one root child (the div)
        XCTAssertEqual(scroll!.subviews.count, 1, "Should have one root-level view (div)")

        // Find the "Hello" text in the label hierarchy
        // (p creates a UILabel, #text creates a child UILabel with the actual text)
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("Hello"), "Should find 'Hello' text in the view hierarchy")

        root.unmount()
    }

    // MARK: - Test 2: Multiple Elements Render Correctly

    func testSSRMultipleElementsRenderCorrectly() {
        // Fizz output for:
        // <div>
        //   <h1>Title</h1>
        //   <p>Paragraph</p>
        // </div>
        let ssrStream = stream([
            ["O", "div"],
              ["O", "h1"],
                ["T", "Title"],
              ["C"],
              ["O", "p"],
                ["T", "Paragraph"],
              ["C"],
            ["C"],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(ssrStream)

        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll)

        // Find all text content
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("Title"), "Should contain 'Title'")
        XCTAssertTrue(texts.contains("Paragraph"), "Should contain 'Paragraph'")

        root.unmount()
    }

    // MARK: - Test 3: Inline (Completed) Suspense Boundary

    func testSSRCompletedSuspenseBoundary() {
        // Fizz output for a completed boundary (content resolved inline):
        // <div>
        //   <Suspense fallback={<p>Loading...</p>}>
        //     <p>Content</p>
        //   </Suspense>
        // </div>
        let ssrStream = stream([
            ["O", "div"],
              ["O", "#suspense"],
                ["O", "p"],
                  ["T", "Content"],
                ["C"],
              ["C"],
            ["C"],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(ssrStream)

        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll)

        // Content should be visible (boundary was completed, not pending)
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("Content"), "Completed boundary content should be visible")
        XCTAssertFalse(texts.contains("Loading..."), "Fallback should NOT be present")

        root.unmount()
    }

    // MARK: - Test 4: Pending Boundary Shows Fallback

    func testSSRPendingBoundaryShowsFallback() {
        // Fizz output for a pending boundary:
        // <div>
        //   <Suspense fallback={<p>Loading...</p>}>
        //     <p>Content (not yet available)</p>
        //   </Suspense>
        // </div>
        // Fizz emits B/B for pending boundaries with fallback inline.
        let ssrStream = stream([
            ["O", "div"],
              ["B", 0],
                ["O", "p"],
                  ["T", "Loading..."],
                ["C"],
              ["/B"],
            ["C"],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(ssrStream)

        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll)

        // Fallback should be visible (boundary is pending)
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("Loading..."), "Fallback should be visible for pending boundary")

        root.unmount()
    }

    // MARK: - Test 5: Boundary Reveal Replaces Fallback

    func testBoundaryRevealReplacesFallback() {
        // Shell with pending boundary showing fallback
        let shell = stream([
            ["O", "div"],
              ["B", 0],
                ["O", "p"],
                  ["T", "Loading..."],
                ["C"],
              ["/B"],
            ["C"],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(shell, finish: false)

        // Verify fallback is shown initially
        guard let scroll = scrollView(in: container) else {
            XCTFail("SSR should create a UIScrollView in the container")
            return
        }
        var texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("Loading..."), "Fallback should be visible before reveal")

        // Feed segment + reveal
        let segment = stream([
            ["S", 0],
              ["O", "p"],
                ["T", "Revealed content"],
              ["C"],
            ["/S"],
            ["X", 0],
        ])

        root.feedSSRSegment(segment)

        // Flush throttled reveals synchronously
        root.flushPendingRevealsForTesting()

        // Verify content replaced fallback
        texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("Revealed content"), "Revealed content should be visible after reveal")
        XCTAssertFalse(texts.contains("Loading..."), "Fallback should be gone after reveal")

        root.unmount()
    }

    // MARK: - Test 6: Two Sibling Boundaries Both Reveal

    func testTwoSiblingBoundariesBothReveal() {
        // Shell with two pending boundaries
        let shell = stream([
            ["O", "div"],
              ["B", 0],
                ["O", "p"],
                  ["T", "Fallback A"],
                ["C"],
              ["/B"],
              ["B", 1],
                ["O", "p"],
                  ["T", "Fallback B"],
                ["C"],
              ["/B"],
            ["C"],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(shell, finish: false)

        // Verify both fallbacks are shown
        guard let scroll = scrollView(in: container) else {
            XCTFail("SSR should create a UIScrollView in the container")
            return
        }
        var texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("Fallback A"))
        XCTAssertTrue(texts.contains("Fallback B"))

        // Feed both segments + reveals
        let segments = stream([
            ["S", 0],
              ["O", "p"],
                ["T", "Content A"],
              ["C"],
            ["/S"],
            ["X", 0],
            ["S", 1],
              ["O", "p"],
                ["T", "Content B"],
              ["C"],
            ["/S"],
            ["X", 1],
        ])

        root.feedSSRSegment(segments)
        root.flushPendingRevealsForTesting()

        // Verify both contents replaced fallbacks
        texts = findLabelTexts(in: scroll)
        XCTAssertTrue(texts.contains("Content A"), "Content A should be visible")
        XCTAssertTrue(texts.contains("Content B"), "Content B should be visible")
        XCTAssertFalse(texts.contains("Fallback A"), "Fallback A should be gone")
        XCTAssertFalse(texts.contains("Fallback B"), "Fallback B should be gone")

        root.unmount()
    }

    // MARK: - Test 7: Complete Stream With Segments In One Shot

    func testCompleteStreamWithSegmentsInOneShot() {
        // Full stream: shell + segments + reveals all at once
        // (matches what hydration-suspense-itest.js tests)
        let ssrStream = stream([
            ["O", "div"],
              ["B", 0],
                ["O", "p"],
                  ["T", "Loading..."],
                ["C"],
              ["/B"],
            ["C"],
            ["R"],
            ["S", 0],
              ["O", "p"],
                ["T", "Streamed content"],
              ["C"],
            ["/S"],
            ["X", 0],
        ])

        let root = Root(container: container)
        root.feedSSRData(ssrStream)

        // Flush any pending reveals
        root.flushPendingRevealsForTesting()

        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll)

        // Content should be visible (boundary was revealed)
        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("Streamed content"), "Streamed content should be visible")
        XCTAssertFalse(texts.contains("Loading..."), "Fallback should be gone")

        root.unmount()
    }

    // MARK: - Test 8: Flight Data Gets Buffered

    func testFlightDataGetsBuffered() {
        // SSR stream with embedded Flight data (D instructions)
        // D instructions should be buffered for later hydration replay,
        // not interfere with SSR view rendering.
        let ssrStream = stream([
            ["O", "div"],
              ["T", "Hello"],
            ["C"],
            ["D", "0:\"test-row\""],
            ["R"],
        ])

        let root = Root(container: container)
        root.feedSSRData(ssrStream)

        // Verify the SSR content rendered correctly despite D instructions
        let scroll = scrollView(in: container)
        XCTAssertNotNil(scroll)

        let texts = findLabelTexts(in: scroll!)
        XCTAssertTrue(texts.contains("Hello"), "SSR content should render despite Flight data")

        root.unmount()
    }
}
