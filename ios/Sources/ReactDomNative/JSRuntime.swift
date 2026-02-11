import JavaScriptCore

class JSRuntime {
    let context: JSContext
    let bridge: NativeBridge

    init() {
        guard let ctx = JSContext() else {
            fatalError("Failed to create JSContext")
        }
        context = ctx

        // Set up exception handler
        context.exceptionHandler = { _, exception in
            guard let error = exception else { return }
            print("[JSRuntime] JS Error: \(error)")
            if let stack = error.objectForKeyedSubscript("stack") {
                print("[JSRuntime] Stack: \(stack)")
            }
        }

        // Register console.log
        let consoleLog: @convention(block) (JSValue) -> Void = { message in
            print("[JS] \(message)")
        }
        context.setObject(consoleLog, forKeyedSubscript: "$$log" as NSString)

        // Set up the native bridge (registers all $$ functions)
        bridge = NativeBridge(context: context)
    }

    func start(rootView: UIView) {
        // Register a surface for the root view
        bridge.registerSurface(surfaceId: 1, rootView: rootView)

        // Load and execute the JS bundle
        loadBundle()
    }

    func updateViewportSize(width: CGFloat, height: CGFloat) {
        // Notify JS of viewport size changes for layout
        let callback = context.objectForKeyedSubscript("$$onViewportResize")
        if let cb = callback, !cb.isUndefined {
            cb.call(withArguments: [width, height])
        }
    }

    private func loadBundle() {
        // Look for bundle.js in the app's Resources
        guard let bundleURL = Bundle.main.url(
            forResource: "bundle",
            ofType: "js",
            subdirectory: "Resources"
        ) else {
            print("[JSRuntime] Warning: bundle.js not found in Resources. " +
                  "Run scripts/build-js.sh to create it.")
            return
        }

        do {
            let source = try String(contentsOf: bundleURL, encoding: .utf8)
            context.evaluateScript(source, withSourceURL: bundleURL)
        } catch {
            print("[JSRuntime] Failed to load bundle.js: \(error)")
        }
    }
}
