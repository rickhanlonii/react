import JavaScriptCore
import UIKit
import ShadowTree

public class JSRuntime {
    public let context: JSContext
    public let bridge: NativeBridge

    // Timer management
    private var timers: [Int: DispatchWorkItem] = [:]
    private var nextTimerId = 1

    public init() {
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

        // Register console object with log, warn, error, info, debug
        let consoleLog: @convention(block) (JSValue) -> Void = { message in
            print("[JS] \(message)")
        }
        let consoleWarn: @convention(block) (JSValue) -> Void = { message in
            print("[JS WARN] \(message)")
        }
        let consoleError: @convention(block) (JSValue) -> Void = { message in
            print("[JS ERROR] \(message)")
        }

        let consoleObj = JSValue(newObjectIn: context)!
        consoleObj.setObject(consoleLog, forKeyedSubscript: "log" as NSString)
        consoleObj.setObject(consoleWarn, forKeyedSubscript: "warn" as NSString)
        consoleObj.setObject(consoleError, forKeyedSubscript: "error" as NSString)
        consoleObj.setObject(consoleLog, forKeyedSubscript: "info" as NSString)
        consoleObj.setObject(consoleLog, forKeyedSubscript: "debug" as NSString)
        context.setObject(consoleObj, forKeyedSubscript: "console" as NSString)

        // Legacy $$log for backwards compatibility
        context.setObject(consoleLog, forKeyedSubscript: "$$log" as NSString)

        // Set up the native bridge (registers all $$ functions)
        bridge = NativeBridge(context: context)

        // Register timer functions (must be after all stored properties are initialized)
        setupTimerPolyfills()
    }

    private func setupTimerPolyfills() {
        // setTimeout
        let setTimeout: @convention(block) (JSValue, JSValue) -> Int = { [weak self] callback, delay in
            guard let self = self else { return 0 }
            let timerId = self.nextTimerId
            self.nextTimerId += 1

            let delayMs = delay.isUndefined ? 0 : delay.toInt32()
            let workItem = DispatchWorkItem { [weak self] in
                self?.timers.removeValue(forKey: timerId)
                callback.call(withArguments: [])
            }
            self.timers[timerId] = workItem
            DispatchQueue.main.asyncAfter(
                deadline: .now() + .milliseconds(Int(delayMs)),
                execute: workItem
            )
            return timerId
        }
        context.setObject(setTimeout, forKeyedSubscript: "setTimeout" as NSString)

        // clearTimeout
        let clearTimeout: @convention(block) (Int) -> Void = { [weak self] timerId in
            if let workItem = self?.timers.removeValue(forKey: timerId) {
                workItem.cancel()
            }
        }
        context.setObject(clearTimeout, forKeyedSubscript: "clearTimeout" as NSString)

        // setInterval
        let setInterval: @convention(block) (JSValue, JSValue) -> Int = { [weak self] callback, delay in
            guard let self = self else { return 0 }
            let timerId = self.nextTimerId
            self.nextTimerId += 1

            let delayMs = delay.isUndefined ? 0 : max(1, delay.toInt32())

            func scheduleNext() {
                let workItem = DispatchWorkItem { [weak self] in
                    guard self?.timers[timerId] != nil else { return }
                    callback.call(withArguments: [])
                    scheduleNext()
                }
                self.timers[timerId] = workItem
                DispatchQueue.main.asyncAfter(
                    deadline: .now() + .milliseconds(Int(delayMs)),
                    execute: workItem
                )
            }
            scheduleNext()
            return timerId
        }
        context.setObject(setInterval, forKeyedSubscript: "setInterval" as NSString)

        // clearInterval (same as clearTimeout)
        context.setObject(clearTimeout, forKeyedSubscript: "clearInterval" as NSString)

        // queueMicrotask - uses Promise.resolve().then() for microtask semantics
        context.evaluateScript("""
            if (typeof queueMicrotask === 'undefined') {
                globalThis.queueMicrotask = function(callback) {
                    Promise.resolve().then(callback);
                };
            }
        """)

        // TextEncoder/TextDecoder polyfills for UTF-8 encoding
        context.evaluateScript("""
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

    public func start(rootView: UIView) {
        // Register a surface for the root view
        bridge.registerSurface(surfaceId: 1, rootView: rootView)

        // Load and execute the JS bundle
        loadBundle()
    }

    public func updateViewportSize(width: CGFloat, height: CGFloat) {
        // Notify JS of viewport size changes for layout
        let callback = context.objectForKeyedSubscript("$$onViewportResize")
        if let cb = callback, !cb.isUndefined {
            cb.call(withArguments: [width, height])
        }
    }

    public func reloadBundle() {
        // Re-evaluate the bundle for hot reload
        loadBundle()
    }

    private func loadBundle() {
        // Look for bundle.js in the app bundle (not in a subdirectory)
        guard let bundleURL = Bundle.main.url(
            forResource: "bundle",
            withExtension: "js"
        ) else {
            print("[JSRuntime] Warning: bundle.js not found. " +
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
