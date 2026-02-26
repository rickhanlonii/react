import UIKit
import ShadowTree
import JSEngine

public class JSRuntime {
    public let engine: JSEngine
    public let bindings: Bindings

    // Timer management
    private var timers: [Int: DispatchWorkItem] = [:]
    private var nextTimerId = 1

    // WebSocket management (DEBUG only — used by DevTools WebSocket polyfill)
    #if DEBUG
    private var webSockets: [Int: URLSessionWebSocketTask] = [:]
    private var webSocketSessions: [Int: URLSession] = [:]
    private var webSocketDelegates: [Int: WebSocketBridgeDelegate] = [:]
    #endif

    public init() {
        let eng = JavaScriptCoreEngine()
        engine = eng

        // Set up exception handler — routes to LogBox + CDP
        engine.exceptionHandler = { message, stack in
            print("[JS] Exception: \(message)")
            if let stack = stack {
                print("[JS] Stack: \(stack)")
            }
            #if DEBUG
            LogBox.shared.addEntry(
                level: .fatalError,
                source: .jsException,
                message: message,
                stack: stack
            )
            LogBox.shared.forwardExceptionToCDP(message: message, stack: stack)
            #endif
        }

        // Register console object with native-backed methods.
        // Routes to: Xcode console (always), LogBox (warn/error), CDP (all).
        let consoleLevels = ["log", "info", "debug", "warn", "error", "trace"]
        let consoleObj = eng.makeObject()
        for level in consoleLevels {
            let fn = eng.makeFunction { [weak eng] args in
                // Stringify all arguments, handling printf-style format strings
                let parts: [String] = args.compactMap { eng?.toString($0) }
                let message: String
                if let format = parts.first, format.contains("%") {
                    message = JSRuntime.formatConsoleArgs(format: format, args: Array(parts.dropFirst()))
                } else {
                    message = parts.joined(separator: " ")
                }

                // 1. Always print to Xcode console
                let prefix = level == "error" ? "[JS ERROR]"
                           : level == "warn" ? "[JS WARN]"
                           : "[JS]"
                print("\(prefix) \(message)")

                #if DEBUG
                // 2. Route warn/error to LogBox
                if level == "error" {
                    LogBox.shared.addEntry(
                        level: .error,
                        source: .consoleError,
                        message: message
                    )
                } else if level == "warn" {
                    LogBox.shared.addEntry(
                        level: .warning,
                        source: .consoleWarning,
                        message: message
                    )
                }

                // 3. Forward all console calls to CDP
                LogBox.shared.forwardConsoleToCDP(level: level, message: message, stack: nil)
                #endif

                return nil
            }
            eng.setProperty(consoleObj, level, fn)
        }
        engine.setGlobalProperty("console", consoleObj)

        // Legacy $$log for backwards compatibility
        engine.setGlobalProperty("$$log", engine.getProperty(consoleObj, "log")!)

        // Set up the bindings (registers all $$ functions)
        bindings = Bindings(engine: engine)

        // Register timer functions (must be after all stored properties are initialized)
        setupTimerPolyfills()

        // Register WebSocket bridge functions for JS polyfill (DevTools, etc.)
        #if DEBUG
        setupWebSocketBridge()
        #endif
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

    /// Applies printf-style format specifiers (%s, %d, %f, %o, %O) used by JS console APIs.
    private static func formatConsoleArgs(format: String, args: [String]) -> String {
        var result = ""
        var argIndex = 0
        var i = format.startIndex
        while i < format.endIndex {
            let c = format[i]
            if c == "%", format.index(after: i) < format.endIndex {
                let next = format[format.index(after: i)]
                if "sdfoOi".contains(next), argIndex < args.count {
                    result += args[argIndex]
                    argIndex += 1
                    i = format.index(i, offsetBy: 2)
                    continue
                } else if next == "%" {
                    result += "%"
                    i = format.index(i, offsetBy: 2)
                    continue
                }
            }
            result.append(c)
            i = format.index(after: i)
        }
        // Append remaining args that weren't consumed by format specifiers
        for j in argIndex..<args.count {
            result += " " + args[j]
        }
        return result
    }

    // MARK: - WebSocket Bridge (DEBUG only)

    #if DEBUG
    private func setupWebSocketBridge() {
        // $$nativeWSOpen(id, url) — creates a URLSessionWebSocketTask and connects
        engine.setGlobalFunction("$$nativeWSOpen") { [weak self] args in
            guard let self = self else { return nil }
            guard args.count >= 2 else { return nil }
            let id = self.engine.toInt(args[0]) ?? 0
            let url = self.engine.toString(args[1]) ?? ""
            guard let wsURL = URL(string: url) else { return nil }

            let delegate = WebSocketBridgeDelegate(id: id, engine: self.engine, runtime: self)
            let session = URLSession(
                configuration: .default,
                delegate: delegate,
                delegateQueue: .main
            )
            let task = session.webSocketTask(with: wsURL)

            self.webSockets[id] = task
            self.webSocketSessions[id] = session
            self.webSocketDelegates[id] = delegate

            task.resume()
            return nil
        }

        // $$nativeWSSend(id, data) — sends a string message
        engine.setGlobalFunction("$$nativeWSSend") { [weak self] args in
            guard let self = self else { return nil }
            guard args.count >= 2 else { return nil }
            let id = self.engine.toInt(args[0]) ?? 0
            let data = self.engine.toString(args[1]) ?? ""
            self.webSockets[id]?.send(.string(data)) { error in
                if let error = error {
                    print("[WebSocket] Send error (id=\(id)): \(error)")
                }
            }
            return nil
        }

        // $$nativeWSClose(id) — closes the WebSocket connection
        engine.setGlobalFunction("$$nativeWSClose") { [weak self] args in
            guard let self = self else { return nil }
            guard args.count >= 1 else { return nil }
            let id = self.engine.toInt(args[0]) ?? 0
            self.closeWebSocket(id: id)
            return nil
        }
    }

    /// Starts the receive loop for a WebSocket.
    fileprivate func receiveWSMessage(id: Int) {
        guard let task = webSockets[id] else { return }
        task.receive { [weak self] result in
            guard let self = self else { return }
            DispatchQueue.main.async {
                switch result {
                case .success(let message):
                    let data: String
                    switch message {
                    case .string(let text): data = text
                    case .data(let bytes): data = String(data: bytes, encoding: .utf8) ?? ""
                    @unknown default: return
                    }
                    if let callback = self.engine.getGlobalProperty("$$nativeWSOnMessage") {
                        _ = self.engine.callFunction(callback, args: [
                            self.engine.makeNumber(Double(id)),
                            self.engine.makeString(data),
                        ])
                    }
                    // Continue receiving
                    self.receiveWSMessage(id: id)

                case .failure(let error):
                    print("[WebSocket] Receive error (id=\(id)): \(error.localizedDescription)")
                    if let callback = self.engine.getGlobalProperty("$$nativeWSOnError") {
                        _ = self.engine.callFunction(callback, args: [
                            self.engine.makeNumber(Double(id)),
                            self.engine.makeString(error.localizedDescription),
                        ])
                    }
                    if let callback = self.engine.getGlobalProperty("$$nativeWSOnClose") {
                        _ = self.engine.callFunction(callback, args: [
                            self.engine.makeNumber(Double(id)),
                        ])
                    }
                    self.webSockets.removeValue(forKey: id)
                    self.webSocketSessions.removeValue(forKey: id)
                    self.webSocketDelegates.removeValue(forKey: id)
                }
            }
        }
    }

    /// Closes and cleans up a WebSocket connection.
    private func closeWebSocket(id: Int) {
        webSockets[id]?.cancel(with: .goingAway, reason: nil)
        webSockets.removeValue(forKey: id)
        webSocketSessions[id]?.invalidateAndCancel()
        webSocketSessions.removeValue(forKey: id)
        webSocketDelegates.removeValue(forKey: id)
    }

    /// Closes all WebSocket connections (called during runtime cleanup).
    func closeAllWebSockets() {
        for id in webSockets.keys {
            closeWebSocket(id: id)
        }
    }
    #endif

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

// MARK: - WebSocket Bridge Delegate (DEBUG only)

#if DEBUG
/// URLSession delegate that fires JS callbacks for WebSocket lifecycle events.
class WebSocketBridgeDelegate: NSObject, URLSessionWebSocketDelegate {
    private let id: Int
    private weak var engine: JSEngine?
    private weak var runtime: JSRuntime?

    init(id: Int, engine: JSEngine, runtime: JSRuntime) {
        self.id = id
        self.engine = engine
        self.runtime = runtime
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let engine = self.engine else { return }
            if let callback = engine.getGlobalProperty("$$nativeWSOnOpen") {
                _ = engine.callFunction(callback, args: [
                    engine.makeNumber(Double(self.id)),
                ])
            }
            // Start the receive loop now that the connection is open
            self.runtime?.receiveWSMessage(id: self.id)
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let engine = self.engine else { return }
            if let callback = engine.getGlobalProperty("$$nativeWSOnClose") {
                _ = engine.callFunction(callback, args: [
                    engine.makeNumber(Double(self.id)),
                ])
            }
        }
    }
}
#endif
