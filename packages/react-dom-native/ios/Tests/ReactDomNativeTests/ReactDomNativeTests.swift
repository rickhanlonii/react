import XCTest
import JavaScriptCore

final class ReactDomNativeTests: XCTestCase {
    func testJSContextCreation() {
        let context = JSContext()
        XCTAssertNotNil(context, "JSContext should be created successfully")
    }

    func testBridgeFunctionRegistration() {
        let context = JSContext()!
        let bridge = NativeBridge(context: context)

        // Verify $$ globals are registered
        let createNode = context.objectForKeyedSubscript("$$createNode")
        XCTAssertNotNil(createNode)
        XCTAssertFalse(createNode!.isUndefined, "$$createNode should be registered")

        let completeRoot = context.objectForKeyedSubscript("$$completeRoot")
        XCTAssertNotNil(completeRoot)
        XCTAssertFalse(completeRoot!.isUndefined, "$$completeRoot should be registered")

        _ = bridge // Keep reference alive
    }

    func testJSBundleExecution() {
        let context = JSContext()!
        var logOutput: String?
        let log: @convention(block) (JSValue) -> Void = { value in
            logOutput = value.toString()
        }
        context.setObject(log, forKeyedSubscript: "$$log" as NSString)

        let script = """
        if (typeof $$log !== 'undefined') {
            $$log('test message');
        }
        """
        context.evaluateScript(script)
        XCTAssertEqual(logOutput, "test message")
    }
}
