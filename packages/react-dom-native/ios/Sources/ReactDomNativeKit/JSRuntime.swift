import UIKit
import ShadowTree
import JSEngine

public class JSRuntime {
    public let engine: JSEngine
    public let bindings: Bindings

    // Timer management
    private var timers: [Int: DispatchWorkItem] = [:]
    private var nextTimerId = 1

    public init() {
        let eng = JavaScriptCoreEngine()
        engine = eng

        // Set up exception handler
        engine.exceptionHandler = { message, stack in
            print("[JSRuntime] JS Error: \(message)")
            if let stack = stack {
                print("[JSRuntime] Stack: \(stack)")
            }
        }

        // Register console object with log, warn, error, info, debug
        let consoleLog = eng.makeFunction { [weak eng] args in
            let message = args.first.flatMap { eng?.toString($0) } ?? ""
            print("[JS] \(message)")
            return nil
        }
        let consoleWarn = eng.makeFunction { [weak eng] args in
            let message = args.first.flatMap { eng?.toString($0) } ?? ""
            print("[JS WARN] \(message)")
            return nil
        }
        let consoleError = eng.makeFunction { [weak eng] args in
            let message = args.first.flatMap { eng?.toString($0) } ?? ""
            print("[JS ERROR] \(message)")
            return nil
        }

        let consoleObj = engine.makeObject()
        engine.setProperty(consoleObj, "log", consoleLog)
        engine.setProperty(consoleObj, "warn", consoleWarn)
        engine.setProperty(consoleObj, "error", consoleError)
        engine.setProperty(consoleObj, "info", consoleLog)
        engine.setProperty(consoleObj, "debug", consoleLog)
        engine.setGlobalProperty("console", consoleObj)

        // Legacy $$log for backwards compatibility
        engine.setGlobalProperty("$$log", consoleLog)

        // Set up the bindings (registers all $$ functions)
        bindings = Bindings(engine: engine)

        // Register timer functions (must be after all stored properties are initialized)
        setupTimerPolyfills()
    }

    private func setupTimerPolyfills() {
        // setTimeout
        engine.setGlobalFunction("setTimeout") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let callback = args[0]
            let delayMs = args.count > 1 && !engine.isUndefined(args[1])
                ? engine.toInt(args[1]) ?? 0
                : 0

            let timerId = self.nextTimerId
            self.nextTimerId += 1
            engine.protect(callback)

            let workItem = DispatchWorkItem { [weak self, weak engine] in
                self?.timers.removeValue(forKey: timerId)
                _ = engine?.callFunction(callback, args: [])
                engine?.unprotect(callback)
            }
            self.timers[timerId] = workItem
            DispatchQueue.main.asyncAfter(
                deadline: .now() + .milliseconds(delayMs),
                execute: workItem
            )
            return engine.makeNumber(Double(timerId))
        }

        // clearTimeout / clearInterval
        let clearTimerBody: ([JSValueRef]) -> JSValueRef? = { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let timerId = engine.toInt(args[0]) ?? 0
            if let workItem = self.timers.removeValue(forKey: timerId) {
                workItem.cancel()
            }
            return nil
        }
        engine.setGlobalFunction("clearTimeout", clearTimerBody)
        engine.setGlobalFunction("clearInterval", clearTimerBody)

        // setInterval
        engine.setGlobalFunction("setInterval") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let callback = args[0]
            let delayMs = args.count > 1 && !engine.isUndefined(args[1])
                ? max(1, engine.toInt(args[1]) ?? 0)
                : 1
            let timerId = self.nextTimerId
            self.nextTimerId += 1
            engine.protect(callback)

            self.scheduleInterval(
                timerId: timerId, callback: callback,
                delayMs: delayMs, engine: engine
            )
            return engine.makeNumber(Double(timerId))
        }

        // queueMicrotask - uses Promise.resolve().then() for microtask semantics
        engine.evaluate("""
            if (typeof queueMicrotask === 'undefined') {
                globalThis.queueMicrotask = function(callback) {
                    Promise.resolve().then(callback);
                };
            }
        """)

        // TextEncoder/TextDecoder polyfills for UTF-8 encoding
        engine.evaluate("""
            if (typeof TextEncoder === 'undefined') {
                globalThis.TextEncoder = function() {};
                TextEncoder.prototype.encode = function(str) {
                    var bytes = [];
                    for (var i = 0; i < str.length; i++) {
                        var c = str.charCodeAt(i);
                        if (c < 0x80) {
                            bytes.push(c);
                        } else if (c < 0x800) {
                            bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
                        } else if (c < 0xd800 || c >= 0xe000) {
                            bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
                        } else {
                            i++;
                            c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
                            bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
                        }
                    }
                    return new Uint8Array(bytes);
                };
            }
            if (typeof TextDecoder === 'undefined') {
                globalThis.TextDecoder = function() {};
                TextDecoder.prototype.decode = function(bytes) {
                    if (!bytes) return '';
                    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
                    var str = '', i = 0;
                    while (i < arr.length) {
                        var c = arr[i++];
                        if (c < 0x80) {
                            str += String.fromCharCode(c);
                        } else if (c < 0xe0) {
                            str += String.fromCharCode(((c & 0x1f) << 6) | (arr[i++] & 0x3f));
                        } else if (c < 0xf0) {
                            str += String.fromCharCode(((c & 0x0f) << 12) | ((arr[i++] & 0x3f) << 6) | (arr[i++] & 0x3f));
                        } else {
                            var cp = ((c & 0x07) << 18) | ((arr[i++] & 0x3f) << 12) | ((arr[i++] & 0x3f) << 6) | (arr[i++] & 0x3f);
                            cp -= 0x10000;
                            str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
                        }
                    }
                    return str;
                };
            }
        """)
    }

    /// Schedules recurring interval execution. Extracted as a method to avoid
    /// retain cycles from nested closures capturing self strongly.
    private func scheduleInterval(
        timerId: Int, callback: JSValueRef,
        delayMs: Int, engine: JSEngine
    ) {
        let workItem = DispatchWorkItem { [weak self, weak engine] in
            guard let self = self, let engine = engine else { return }
            guard self.timers[timerId] != nil else { return }
            _ = engine.callFunction(callback, args: [])
            self.scheduleInterval(
                timerId: timerId, callback: callback,
                delayMs: delayMs, engine: engine
            )
        }
        self.timers[timerId] = workItem
        DispatchQueue.main.asyncAfter(
            deadline: .now() + .milliseconds(delayMs),
            execute: workItem
        )
    }

    public func start(rootView: UIView) {
        // Register a surface for the root view
        bindings.registerSurface(surfaceId: 1, rootView: rootView)

        // Load and execute the JS bundle
        loadBundle()
    }

    public func updateViewportSize(width: CGFloat, height: CGFloat) {
        // Notify JS of viewport size changes for layout
        guard let callback = engine.getGlobalProperty("$$onViewportResize") else { return }
        _ = engine.callFunction(callback, args: [
            engine.makeNumber(Double(width)),
            engine.makeNumber(Double(height))
        ])
    }

    public func reloadBundle() {
        // Re-evaluate the bundle for hot reload
        loadBundle()
    }

    private func loadBundle() {
        // Look for bundle.js in the package's own resources
        guard let bundleURL = Bundle.module.url(
            forResource: "bundle",
            withExtension: "js",
            subdirectory: "Resources"
        ) else {
            print("[JSRuntime] Warning: bundle.js not found in package resources. " +
                  "Run `npm run build` from the example directory.")
            return
        }

        do {
            let source = try String(contentsOf: bundleURL, encoding: .utf8)
            engine.evaluate(source, sourceURL: bundleURL)
        } catch {
            print("[JSRuntime] Failed to load bundle.js: \(error)")
        }
    }
}
