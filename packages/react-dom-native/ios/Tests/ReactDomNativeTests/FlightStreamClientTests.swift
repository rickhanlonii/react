import XCTest
import JSEngine
@testable import ReactDomNativeKit

final class FlightStreamClientTests: XCTestCase {

    private var engine: JavaScriptCoreEngine!

    override func setUp() {
        super.setUp()
        engine = JavaScriptCoreEngine()
        FlightStreamClient.clearModuleCache(engine: nil)
    }

    override func tearDown() {
        FlightStreamClient.clearModuleCache(engine: engine)
        engine = nil
        super.tearDown()
    }

    // MARK: - Row Parsing

    func testParseModelRow() {
        // Model row: no tag, JSON data
        // Format: <hex_id>:<json>\n
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("0:{\"key\":\"value\"}\n")

        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].0, 0)        // id
        XCTAssertEqual(receivedRows[0].1, "")        // tag (empty for model)
        XCTAssertEqual(receivedRows[0].2, "{\"key\":\"value\"}") // data
    }

    func testParseTaggedRow() {
        // Tagged row: E for error
        // Format: <hex_id>:E<data>\n
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("1:E{\"message\":\"error\"}\n")

        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].0, 1)
        XCTAssertEqual(receivedRows[0].1, "E")
        XCTAssertEqual(receivedRows[0].2, "{\"message\":\"error\"}")
    }

    func testParseHexId() {
        // Row IDs are hex-encoded
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        // 0xa = 10, 0xff = 255
        client.processString("a:{\"id\":10}\n")
        client.processString("ff:{\"id\":255}\n")

        XCTAssertEqual(receivedRows.count, 2)
        XCTAssertEqual(receivedRows[0].0, 10)
        XCTAssertEqual(receivedRows[1].0, 255)
    }

    func testParseMultipleRows() {
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("0:{\"a\":1}\n1:{\"b\":2}\n2:H\"hint\"\n")

        XCTAssertEqual(receivedRows.count, 3)
        XCTAssertEqual(receivedRows[0].0, 0)
        XCTAssertEqual(receivedRows[1].0, 1)
        XCTAssertEqual(receivedRows[2].0, 2)
        XCTAssertEqual(receivedRows[2].1, "H")
    }

    func testParseRowsSplitAcrossChunks() {
        // Simulate streaming: row data arrives in two separate chunks
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("0:{\"ke")
        XCTAssertEqual(receivedRows.count, 0, "No rows should be emitted yet")

        client.processString("y\":\"value\"}\n")
        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].2, "{\"key\":\"value\"}")
    }

    func testParseBinaryRow() {
        // Binary row: T (text) uses length-prefix format
        // Format: <hex_id>:T<hex_length>,<data>
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        // Length 5 (hex), data = "hello"
        client.processString("0:T5,hello")

        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].0, 0)
        XCTAssertEqual(receivedRows[0].1, "T")
        XCTAssertEqual(receivedRows[0].2, "hello")
    }

    func testParseBinaryRowSplitAcrossChunks() {
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        // Length a (hex) = 10 bytes. Split: "hel" (3) + "lo worl" (7) = 10 exactly.
        client.processString("0:Ta,hel")
        XCTAssertEqual(receivedRows.count, 0, "Should not emit row with partial binary data")

        client.processString("lo worl")
        XCTAssertEqual(receivedRows.count, 1, "Row should emit once all 10 bytes received")
        XCTAssertEqual(receivedRows[0].0, 0)
        XCTAssertEqual(receivedRows[0].1, "T")
        XCTAssertEqual(receivedRows[0].2, "hello worl")
    }

    func testParseBinaryRowExactChunks() {
        // Test binary row split exactly across chunks
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        // Length 6 (hex), data = "abcdef"
        client.processString("0:T6,abc")
        XCTAssertEqual(receivedRows.count, 0)

        client.processString("def")
        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].2, "abcdef")
    }

    func testParseModelRowStartingWithArray() {
        // Model rows can start with [ (JSON array)
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("0:[\"div\",null]\n")

        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].1, "")  // no tag
        XCTAssertEqual(receivedRows[0].2, "[\"div\",null]")
    }

    func testParseModelRowStartingWithNumber() {
        // Model rows can start with a digit (JSON number)
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("0:42\n")

        XCTAssertEqual(receivedRows.count, 1)
        XCTAssertEqual(receivedRows[0].1, "")
        XCTAssertEqual(receivedRows[0].2, "42")
    }

    func testParseModelRowStartingWithBooleans() {
        // Model rows starting with t (true), f (false), n (null)
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        let client = makeClient()
        client.processString("0:true\n1:false\n2:null\n")

        XCTAssertEqual(receivedRows.count, 3)
        XCTAssertEqual(receivedRows[0].2, "true")
        XCTAssertEqual(receivedRows[1].2, "false")
        XCTAssertEqual(receivedRows[2].2, "null")
    }

    // MARK: - Module Row (I tag)

    func testModuleRowNotPassedToProcessFlightRow() {
        // Module rows (I tag) are handled natively, NOT forwarded to JS
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { responseId, id, tag, data in
            receivedRows.append((id, tag, data))
        }
        installResolveFlightModule { _, _, _, _ in }
        installRejectFlightModule { _, _, _ in }

        let client = makeClient()
        client.processString("3:I[\"Counter\",[],\"*\"]\n")

        XCTAssertEqual(receivedRows.count, 0, "Module rows should not be passed to $$processFlightRow")
    }

    // MARK: - Close and Error

    func testClose() {
        var closeCalled = false
        var closedResponseId: Int?
        engine.setGlobalFunction("$$closeFlightResponse") { [weak self] args in
            closeCalled = true
            closedResponseId = self?.engine.toInt(args[0])
            return nil
        }

        let client = makeClient(responseId: 42)
        client.close()

        XCTAssertTrue(closeCalled)
        XCTAssertEqual(closedResponseId, 42)
    }

    func testReportError() {
        var errorCalled = false
        var errorResponseId: Int?
        var errorMessage: String?
        engine.setGlobalFunction("$$reportFlightError") { [weak self] args in
            errorCalled = true
            errorResponseId = self?.engine.toInt(args[0])
            errorMessage = self?.engine.toString(args[1])
            return nil
        }

        let client = makeClient(responseId: 7)
        let error = NSError(domain: "Test", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "network failure"
        ])
        client.reportError(error)

        XCTAssertTrue(errorCalled)
        XCTAssertEqual(errorResponseId, 7)
        XCTAssertEqual(errorMessage, "network failure")
    }

    // MARK: - Server Origin Extraction

    func testServerOriginExtraction() {
        // The client should extract origin from full server URL
        var receivedRows: [(Int, String, String)] = []
        installProcessFlightRow { _, id, tag, data in
            receivedRows.append((id, tag, data))
        }

        // Create client with full URL path
        let client = FlightStreamClient(
            responseId: 1,
            engine: engine,
            serverURL: "http://localhost:6000/api/flight"
        )
        // Verify it works by parsing a simple row
        client.processString("0:{\"test\":true}\n")
        XCTAssertEqual(receivedRows.count, 1)
    }

    // MARK: - Module Cache

    func testModuleCacheCleared() {
        // clearModuleCache should not crash when called with nil engine
        FlightStreamClient.clearModuleCache(engine: nil)
        // And should work with a real engine
        FlightStreamClient.clearModuleCache(engine: engine)
    }

    // MARK: - Response ID Tracking

    func testResponseIdPassedToProcessRow() {
        var receivedResponseId: Int?
        engine.setGlobalFunction("$$processFlightRow") { [weak self] args in
            receivedResponseId = self?.engine.toInt(args[0])
            return nil
        }

        let client = makeClient(responseId: 99)
        client.processString("0:{}\n")

        XCTAssertEqual(receivedResponseId, 99)
    }

    // MARK: - Helpers

    private func makeClient(responseId: Int = 1) -> FlightStreamClient {
        return FlightStreamClient(
            responseId: responseId,
            engine: engine,
            serverURL: "http://localhost:6000"
        )
    }

    private func installProcessFlightRow(_ handler: @escaping (Int, Int, String, String) -> Void) {
        engine.setGlobalFunction("$$processFlightRow") { [weak self] args in
            guard let self = self else { return nil }
            let responseId = self.engine.toInt(args[0]) ?? 0
            let id = self.engine.toInt(args[1]) ?? 0
            let tag = self.engine.toString(args[2]) ?? ""
            let data = self.engine.toString(args[3]) ?? ""
            handler(responseId, id, tag, data)
            return nil
        }
    }

    private func installResolveFlightModule(_ handler: @escaping (Int, Int, JSValueRef, String) -> Void) {
        engine.setGlobalFunction("$$resolveFlightModule") { [weak self] args in
            guard let self = self else { return nil }
            let responseId = self.engine.toInt(args[0]) ?? 0
            let chunkId = self.engine.toInt(args[1]) ?? 0
            let exports = args[2]
            let exportName = self.engine.toString(args[3]) ?? ""
            handler(responseId, chunkId, exports, exportName)
            return nil
        }
    }

    private func installRejectFlightModule(_ handler: @escaping (Int, Int, String) -> Void) {
        engine.setGlobalFunction("$$rejectFlightModule") { [weak self] args in
            guard let self = self else { return nil }
            let responseId = self.engine.toInt(args[0]) ?? 0
            let chunkId = self.engine.toInt(args[1]) ?? 0
            let errorMessage = self.engine.toString(args[2]) ?? ""
            handler(responseId, chunkId, errorMessage)
            return nil
        }
    }
}
