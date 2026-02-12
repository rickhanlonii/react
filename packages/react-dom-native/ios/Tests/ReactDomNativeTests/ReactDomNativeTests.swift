import XCTest
import JSEngine

final class ReactDomNativeTests: XCTestCase {
    func testEngineCreation() {
        let engine = JavaScriptCoreEngine()
        XCTAssertNotNil(engine, "JavaScriptCoreEngine should be created successfully")
    }

    func testBindingFunctionRegistration() {
        let engine = JavaScriptCoreEngine()
        let bindings = Bindings(engine: engine)

        // Verify $$ globals are registered
        let createNode = engine.getGlobalProperty("$$createNode")
        XCTAssertNotNil(createNode, "$$createNode should be registered")

        let completeRoot = engine.getGlobalProperty("$$completeRoot")
        XCTAssertNotNil(completeRoot, "$$completeRoot should be registered")

        _ = bindings // Keep reference alive
    }

    func testJSBundleExecution() {
        let engine = JavaScriptCoreEngine()
        var logOutput: String?
        engine.setGlobalFunction("$$log") { args in
            logOutput = engine.toString(args[0])
            return nil
        }

        let script = """
        if (typeof $$log !== 'undefined') {
            $$log('test message');
        }
        """
        engine.evaluate(script)
        XCTAssertEqual(logOutput, "test message")
    }
}
