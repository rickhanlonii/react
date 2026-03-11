import Foundation
import JSEngine

// ---------------------------------------------------------------------------
// FantomTester — Headless test runner for react-dom-native
//
// Usage: FantomTester <path-to-bundle.js>
//
// Loads a JS test bundle into JavaScriptCore, executes it, and prints
// test results as JSON to stdout. Exit code 0 = all passed, 1 = failures.
// ---------------------------------------------------------------------------

func main() -> Int32 {
    let args = CommandLine.arguments

    guard args.count >= 2 else {
        fputs("Usage: FantomTester <path-to-bundle.js>\n", stderr)
        return 1
    }

    let bundlePath = args[1]

    // 1. Read the JS bundle
    guard let bundleSource = try? String(contentsOfFile: bundlePath, encoding: .utf8) else {
        fputs("Error: Could not read bundle at \(bundlePath)\n", stderr)
        return 1
    }

    // 2. Create JS engine
    let engine = JavaScriptCoreEngine()

    engine.exceptionHandler = { message, stack in
        fputs("[fantom] JS Error: \(message)\n", stderr)
        if let stack = stack {
            fputs("[fantom] Stack: \(stack)\n", stderr)
        }
    }

    // 3. Set up console.log/warn/error — capture messages for test output.
    //    A single $$captureConsole(level, message) bridge function receives
    //    the pre-joined message. The actual console methods are defined in JS
    //    so they can handle variadic arguments naturally.
    var consoleMessages: [[String: String]] = []

    engine.setGlobalFunction("$$captureConsole") { [weak engine] args in
        guard let engine = engine else { return nil }
        let level = engine.toString(args[0]) ?? "log"
        let message = engine.toString(args[1]) ?? ""
        consoleMessages.append(["level": level, "message": message])
        return nil
    }

    engine.evaluate("""
        (function() {
            function makeConsole(level) {
                return function() {
                    var parts = [];
                    for (var i = 0; i < arguments.length; i++) {
                        var arg = arguments[i];
                        if (typeof arg === 'object' && arg !== null) {
                            try { parts.push(JSON.stringify(arg)); }
                            catch(e) { parts.push(String(arg)); }
                        } else {
                            parts.push(String(arg));
                        }
                    }
                    $$captureConsole(level, parts.join(' '));
                };
            }
            var c = { log: makeConsole('log'), warn: makeConsole('warn'), error: makeConsole('error') };
            globalThis.console = c;
        })();
    """)

    // 4. Create TesterBridge (registers all $$-prefixed functions)
    let bridge = TesterBridge(engine: engine)

    // 5. Evaluate the bundle (this registers tests via describe/it and
    //    defines $$RunTests$$ via the injected setup.js)
    engine.evaluate(bundleSource, sourceURL: URL(fileURLWithPath: bundlePath))

    // 6. Call $$RunTests$$ to execute all registered tests
    if let runTests = engine.getGlobalProperty("$$RunTests$$") {
        _ = engine.callFunction(runTests, args: [])
    } else {
        // If $$RunTests$$ is not defined, the bundle may have run tests inline
        fputs("Warning: $$RunTests$$ not found — tests may have run inline\n", stderr)
    }

    // 7. Output results — merge console messages into the results JSON
    if let results = bridge.testResults,
       let data = results.data(using: .utf8),
       var json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {

        // Inject captured console messages
        if !consoleMessages.isEmpty {
            json["console"] = consoleMessages
        }

        if let outputData = try? JSONSerialization.data(withJSONObject: json, options: []),
           let output = String(data: outputData, encoding: .utf8) {
            print(output)
        } else {
            print(results)
        }

        let failed = json["failed"] as? Int ?? 0
        return failed > 0 ? 1 : 0
    } else {
        // No results reported — output empty result
        let fallback = "{\"passed\":0,\"failed\":0,\"tests\":[]}"
        print(fallback)
        return 0
    }
}

exit(main())
