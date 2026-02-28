import XCTest
import ShadowTree

// ---------------------------------------------------------------------------
// InstructionStreamParserTests
//
// Unit tests for InstructionStreamParser. Uses a mock delegate to capture
// parsed instructions and verify correct dispatch.
// ---------------------------------------------------------------------------

final class InstructionStreamParserTests: XCTestCase {

    private var parser: InstructionStreamParser!
    private var delegate: MockDelegate!

    override func setUp() {
        super.setUp()
        parser = InstructionStreamParser()
        delegate = MockDelegate()
        parser.delegate = delegate
    }

    override func tearDown() {
        parser = nil
        delegate = nil
        super.tearDown()
    }

    // MARK: - Helpers

    /// Feeds a JSON instruction array to the parser as a complete line.
    private func feed(_ instruction: [Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: instruction, options: []) else {
            XCTFail("Failed to serialize instruction")
            return
        }
        // Add newline so the parser processes it immediately
        var lineData = data
        lineData.append(UInt8(ascii: "\n"))
        parser.receive(data: lineData)
    }

    // MARK: - JS Instruction Tests

    func testJSInstructionParsesCodeString() {
        feed(["JS", "console.log('hello')"])

        XCTAssertEqual(delegate.javaScriptCalls.count, 1)
        XCTAssertEqual(delegate.javaScriptCalls[0], "console.log('hello')")
        XCTAssertTrue(delegate.errors.isEmpty)
    }

    func testJSInstructionWithEmptyString() {
        feed(["JS", ""])

        XCTAssertEqual(delegate.javaScriptCalls.count, 1)
        XCTAssertEqual(delegate.javaScriptCalls[0], "")
        XCTAssertTrue(delegate.errors.isEmpty)
    }

    func testJSInstructionWithMultilineCode() {
        let code = "var x = 1;\nvar y = 2;\nx + y;"
        feed(["JS", code])

        XCTAssertEqual(delegate.javaScriptCalls.count, 1)
        XCTAssertEqual(delegate.javaScriptCalls[0], code)
    }

    func testJSInstructionMissingCodeReportsError() {
        // ["JS"] with no code string
        feed(["JS"])

        XCTAssertEqual(delegate.javaScriptCalls.count, 0)
        XCTAssertEqual(delegate.errors.count, 1)
        XCTAssertTrue(delegate.errors[0].contains("JS instruction missing code string"))
    }

    func testJSInstructionWithNonStringCodeReportsError() {
        // ["JS", 42] — code should be a string, not a number
        feed(["JS", 42])

        XCTAssertEqual(delegate.javaScriptCalls.count, 0)
        XCTAssertEqual(delegate.errors.count, 1)
        XCTAssertTrue(delegate.errors[0].contains("JS instruction missing code string"))
    }

    func testMultipleJSInstructions() {
        feed(["JS", "first()"])
        feed(["JS", "second()"])
        feed(["JS", "third()"])

        XCTAssertEqual(delegate.javaScriptCalls.count, 3)
        XCTAssertEqual(delegate.javaScriptCalls[0], "first()")
        XCTAssertEqual(delegate.javaScriptCalls[1], "second()")
        XCTAssertEqual(delegate.javaScriptCalls[2], "third()")
    }

    func testJSInstructionInterleavedWithOtherInstructions() {
        feed(["O", "div"])
        feed(["JS", "setup()"])
        feed(["T", "Hello"])
        feed(["JS", "init()"])
        feed(["C"])

        XCTAssertEqual(delegate.javaScriptCalls.count, 2)
        XCTAssertEqual(delegate.javaScriptCalls[0], "setup()")
        XCTAssertEqual(delegate.javaScriptCalls[1], "init()")
        XCTAssertEqual(delegate.openElements.count, 1)
        XCTAssertEqual(delegate.textNodes.count, 1)
        XCTAssertEqual(delegate.closeCount, 1)
    }

    // MARK: - Other Opcodes (Smoke Tests)

    func testOpenElementParses() {
        feed(["O", "div", ["class": "test"]])
        XCTAssertEqual(delegate.openElements.count, 1)
        XCTAssertEqual(delegate.openElements[0].type, "div")
    }

    func testTextNodeParses() {
        feed(["T", "hello"])
        XCTAssertEqual(delegate.textNodes, ["hello"])
    }

    func testCloseElementParses() {
        feed(["C"])
        XCTAssertEqual(delegate.closeCount, 1)
    }

    func testUnknownOpcodeReportsError() {
        feed(["UNKNOWN"])
        XCTAssertEqual(delegate.errors.count, 1)
        XCTAssertTrue(delegate.errors[0].contains("Unknown instruction opcode"))
    }
}

// MARK: - Mock Delegate

private class MockDelegate: InstructionStreamDelegate {
    var openElements: [(type: String, props: [String: Any])] = []
    var textNodes: [String] = []
    var closeCount = 0
    var beginBoundaries: [Int] = []
    var endBoundaryCount = 0
    var beginSegments: [Int] = []
    var endSegmentCount = 0
    var revealBoundaries: [Int] = []
    var rootCompleteCount = 0
    var placeholders: [Int] = []
    var clientRenderBoundaries: [(id: Int, digest: String?)] = []
    var javaScriptCalls: [String] = []
    var errors: [String] = []

    func didReceiveOpenElement(type: String, props: [String: Any]) {
        openElements.append((type: type, props: props))
    }

    func didReceiveTextNode(text: String) {
        textNodes.append(text)
    }

    func didReceiveCloseElement() {
        closeCount += 1
    }

    func didReceiveBeginBoundary(id: Int) {
        beginBoundaries.append(id)
    }

    func didReceiveEndBoundary() {
        endBoundaryCount += 1
    }

    func didReceiveBeginSegment(id: Int) {
        beginSegments.append(id)
    }

    func didReceiveEndSegment() {
        endSegmentCount += 1
    }

    func didReceiveRevealBoundary(id: Int) {
        revealBoundaries.append(id)
    }

    func didReceiveRootComplete() {
        rootCompleteCount += 1
    }

    func didReceivePlaceholder(id: Int) {
        placeholders.append(id)
    }

    func didReceiveClientRenderBoundary(id: Int, errorDigest: String?) {
        clientRenderBoundaries.append((id: id, digest: errorDigest))
    }

    func didReceiveJavaScript(code: String) {
        javaScriptCalls.append(code)
    }

    func didReceiveError(_ error: Error) {
        errors.append("\(error)")
    }
}
