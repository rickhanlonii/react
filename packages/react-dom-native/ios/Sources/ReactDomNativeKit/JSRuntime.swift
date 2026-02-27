import UIKit
import ShadowTree
import JSEngine

public class JSRuntime {
    public let engine: JSEngine
    public let bindings: Bindings
    let tracer: PerformanceTracer

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

        let perfTracer = PerformanceTracer()
        tracer = perfTracer

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

        // console.timeStamp — supports both standard single-arg form and
        // React's extended form: (name, start, end, track, trackGroup, color, properties)
        // Calls native PerformanceTracer directly — no eng.evaluate() needed.
        let timeStampFn = eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            if args.count <= 1 {
                // Standard single-arg — no-op in JSC (no built-in timeline)
                return nil
            }
            guard perfTracer.isTracing else { return nil }
            let label = eng.toString(args[0]) ?? ""
            let start = eng.toDouble(args[1]) ?? 0
            let end = eng.toDouble(args[2]) ?? 0
            let track = eng.toString(args[3]) ?? ""
            let trackGroup = args.count > 4 && !eng.isUndefined(args[4])
                ? eng.toString(args[4]) : nil
            let color = args.count > 5 ? (eng.toString(args[5]) ?? "") : ""
            var properties: [[String]]? = nil
            if args.count > 6 && !eng.isUndefined(args[6]) && !eng.isNull(args[6]) {
                if let propsArr = eng.toArray(args[6]) {
                    properties = propsArr.compactMap { pairRef -> [String]? in
                        guard let pair = eng.toArray(pairRef) else { return nil }
                        return pair.compactMap { eng.toString($0) }
                    }
                }
            }
            perfTracer.reportTimeStamp(
                label: label, start: start, end: end,
                track: track, trackGroup: trackGroup, color: color,
                properties: properties
            )
            return nil
        }
        eng.setProperty(consoleObj, "timeStamp", timeStampFn)

        engine.setGlobalProperty("console", consoleObj)

        // Legacy $$log for backwards compatibility
        engine.setGlobalProperty("$$log", engine.getProperty(consoleObj, "log")!)

        // Set up the bindings (registers all $$ functions)
        bindings = Bindings(engine: engine)

        // Register performance API polyfill (must be before bundle evaluation)
        setupPerformancePolyfill()

        // Register timer functions (must be after all stored properties are initialized)
        setupTimerPolyfills()

        // Register ReadableStream polyfill (must be before bundle evaluation)
        setupReadableStreamPolyfill()

        // Register WebSocket bridge functions for JS polyfill (DevTools, etc.)
        #if DEBUG
        setupWebSocketBridge()
        #endif
    }

    private func setupPerformancePolyfill() {
        let eng = engine
        let tracer = self.tracer

        let perfObj = eng.makeObject()

        // performance.timeOrigin
        eng.setProperty(perfObj, "timeOrigin", eng.makeNumber(tracer.timeOrigin))

        // performance.now() -> milliseconds relative to timeOrigin
        eng.setProperty(perfObj, "now", eng.makeFunction { [weak eng] _ in
            guard let eng = eng else { return nil }
            return eng.makeNumber(tracer.now())
        })

        // performance.mark(name, options)
        eng.setProperty(perfObj, "mark", eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = eng.toString(args[0]) ?? ""
            var startTime = tracer.now()
            var detail: JSValueRef = eng.makeNull()

            if args.count > 1 && !eng.isUndefined(args[1]) && !eng.isNull(args[1]) {
                let options = args[1]
                // Access startTime — triggers getter (important for React DevTools
                // supportsUserTimingV3 feature detection via Object.defineProperty)
                if let stRef = eng.getProperty(options, "startTime"),
                   let st = eng.toDouble(stRef) {
                    startTime = st
                }
                if let d = eng.getProperty(options, "detail") {
                    detail = d
                }
            }

            let entry: [String: Any] = [
                "entryType": "mark", "name": name,
                "startTime": startTime, "duration": 0.0,
            ]
            tracer.addMark(entry)
            tracer.reportMark(name: name, startTime: startTime)

            let jsEntry = eng.makeObject()
            eng.setProperty(jsEntry, "entryType", eng.makeString("mark"))
            eng.setProperty(jsEntry, "name", eng.makeString(name))
            eng.setProperty(jsEntry, "startTime", eng.makeNumber(startTime))
            eng.setProperty(jsEntry, "duration", eng.makeNumber(0))
            eng.setProperty(jsEntry, "detail", detail)
            return jsEntry
        })

        // performance.measure(name, startOrOptions, endMark)
        eng.setProperty(perfObj, "measure", eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = eng.toString(args[0]) ?? ""
            var startTime: Double = 0
            var endTime: Double = tracer.now()
            var detail: JSValueRef = eng.makeNull()

            if args.count > 1 && !eng.isUndefined(args[1]) && !eng.isNull(args[1]) {
                let arg1 = args[1]
                // Detect options object by checking for known properties
                let startProp = eng.getProperty(arg1, "start")
                let endProp = eng.getProperty(arg1, "end")
                let durationProp = eng.getProperty(arg1, "duration")
                let detailProp = eng.getProperty(arg1, "detail")

                if startProp != nil || endProp != nil || durationProp != nil || detailProp != nil {
                    // Options object form: {start, end, duration, detail}
                    if let sp = startProp {
                        if let n = eng.toDouble(sp), !n.isNaN {
                            startTime = n
                        } else if let s = eng.toString(sp) {
                            startTime = tracer.findMarkTime(s)
                        } else {
                            startTime = tracer.now()
                        }
                    } else {
                        startTime = tracer.now()
                    }
                    if let ep = endProp {
                        if let n = eng.toDouble(ep), !n.isNaN {
                            endTime = n
                        } else if let s = eng.toString(ep) {
                            endTime = tracer.findMarkTime(s)
                        } else {
                            endTime = tracer.now()
                        }
                    } else if let dp = durationProp, let d = eng.toDouble(dp), !d.isNaN {
                        endTime = startTime + d
                    } else {
                        endTime = tracer.now()
                    }
                    if let d = detailProp {
                        detail = d
                    }
                } else if let n = eng.toDouble(arg1), !n.isNaN {
                    // Number form: measure(name, startTime, endTime)
                    startTime = n
                    if args.count > 2 && !eng.isUndefined(args[2]) {
                        if let en = eng.toDouble(args[2]), !en.isNaN {
                            endTime = en
                        }
                    }
                } else if let s = eng.toString(arg1) {
                    // String form: measure(name, startMark, endMark)
                    startTime = tracer.findMarkTime(s)
                    if args.count > 2 && !eng.isUndefined(args[2]) {
                        if let es = eng.toString(args[2]) {
                            endTime = tracer.findMarkTime(es)
                        }
                    }
                }
            }

            let duration = endTime - startTime
            // Convert detail to Swift dict for tracer event serialization
            let swiftDetail: Any? = eng.toDictionary(detail)
            tracer.addMeasure([
                "entryType": "measure", "name": name,
                "startTime": startTime, "duration": duration,
            ])
            tracer.reportMeasure(name: name, start: startTime, duration: duration, detail: swiftDetail)

            // Return JS entry with original detail reference
            let jsEntry = eng.makeObject()
            eng.setProperty(jsEntry, "entryType", eng.makeString("measure"))
            eng.setProperty(jsEntry, "name", eng.makeString(name))
            eng.setProperty(jsEntry, "startTime", eng.makeNumber(startTime))
            eng.setProperty(jsEntry, "duration", eng.makeNumber(duration))
            eng.setProperty(jsEntry, "detail", detail)
            return jsEntry
        })

        // performance.clearMarks(name)
        eng.setProperty(perfObj, "clearMarks", eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = args.count > 0 && !eng.isUndefined(args[0]) ? eng.toString(args[0]) : nil
            tracer.clearMarks(name)
            return nil
        })

        // performance.clearMeasures(name)
        eng.setProperty(perfObj, "clearMeasures", eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = args.count > 0 && !eng.isUndefined(args[0]) ? eng.toString(args[0]) : nil
            tracer.clearMeasures(name)
            return nil
        })

        // performance.getEntriesByType(type)
        eng.setProperty(perfObj, "getEntriesByType", eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            let type = eng.toString(args[0]) ?? ""
            let entries = tracer.getEntriesByType(type)
            return JSRuntime.convertEntriesToJS(entries, engine: eng)
        })

        // performance.getEntriesByName(name, type)
        eng.setProperty(perfObj, "getEntriesByName", eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = eng.toString(args[0]) ?? ""
            let type = args.count > 1 && !eng.isUndefined(args[1]) ? eng.toString(args[1]) : nil
            let entries = tracer.getEntriesByName(name, type: type)
            return JSRuntime.convertEntriesToJS(entries, engine: eng)
        })

        eng.setGlobalProperty("performance", perfObj)

        // --- Bridge functions for PerformanceTracer ---

        // $$onInspectorMessage(jsonString)
        // Handles inspector messages from the dev server (start-tracing, stop-tracing, cdp-request).
        // Replaces the JS-side InspectorMessageHandler.js.
        eng.setGlobalFunction("$$onInspectorMessage") { [weak self, weak eng] args in
            guard let self = self, let eng = eng else { return nil }
            guard let jsonString = eng.toString(args[0]),
                  let data = jsonString.data(using: .utf8),
                  let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = message["type"] as? String else {
                return nil
            }

            switch type {
            case "start-tracing":
                guard !self.tracer.isTracing else { return nil }
                self.tracer.startTracing()
                self.bindings.nativeTracingEnabled = true
                self.bindings.pushPendingSSRCommitTimingsToJS()

            case "stop-tracing":
                guard self.tracer.isTracing else { return nil }
                let result = self.tracer.stopTracing()
                self.bindings.nativeTracingEnabled = false
                // Serialize events to JSON and send via WebSocket
                let response: [String: Any] = [
                    "type": "trace-data",
                    "events": result.events,
                    "tracingStartTs": result.tracingStartTs,
                ]
                if let responseData = try? JSONSerialization.data(withJSONObject: response),
                   let responseString = String(data: responseData, encoding: .utf8) {
                    self.bindings.sendInspectorMessage?(responseString)
                }

            case "cdp-request":
                // Forward CDP requests to the JS handler (RuntimeAgent, etc.)
                if let cdpHandler = eng.getGlobalProperty("$$handleCDPRequest") {
                    _ = eng.callFunction(cdpHandler, args: [eng.makeString(jsonString)])
                }

            default:
                break
            }
            return nil
        }

        // $$isTracing() -> bool
        eng.setGlobalFunction("$$isTracing") { [weak eng] _ in
            return eng?.makeBool(tracer.isTracing)
        }

        // $$reportTimeStamp(label, start, end, track, trackGroup, color, properties)
        eng.setGlobalFunction("$$reportTimeStamp") { [weak eng] args in
            guard let eng = eng else { return nil }
            let label = eng.toString(args[0]) ?? ""
            let start = eng.toDouble(args[1]) ?? 0
            let end = eng.toDouble(args[2]) ?? 0
            let track = eng.toString(args[3]) ?? ""
            let trackGroup = args.count > 4 && !eng.isUndefined(args[4])
                ? eng.toString(args[4]) : nil
            let color = args.count > 5 ? (eng.toString(args[5]) ?? "") : ""
            var properties: [[String]]? = nil
            if args.count > 6 && !eng.isUndefined(args[6]) && !eng.isNull(args[6]) {
                if let propsArr = eng.toArray(args[6]) {
                    properties = propsArr.compactMap { pairRef -> [String]? in
                        guard let pair = eng.toArray(pairRef) else { return nil }
                        return pair.compactMap { eng.toString($0) }
                    }
                }
            }
            tracer.reportTimeStamp(
                label: label, start: start, end: end,
                track: track, trackGroup: trackGroup, color: color,
                properties: properties
            )
            return nil
        }

        // $$reportMeasure(name, start, duration, detail)
        eng.setGlobalFunction("$$reportMeasure") { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = eng.toString(args[0]) ?? ""
            let start = eng.toDouble(args[1]) ?? 0
            let duration = eng.toDouble(args[2]) ?? 0
            let detail: Any?
            if args.count > 3 && !eng.isUndefined(args[3]) && !eng.isNull(args[3]) {
                detail = eng.toDictionary(args[3])
            } else {
                detail = nil
            }
            tracer.reportMeasure(name: name, start: start, duration: duration, detail: detail)
            return nil
        }

        // $$reportMark(name, startTime)
        eng.setGlobalFunction("$$reportMark") { [weak eng] args in
            guard let eng = eng else { return nil }
            let name = eng.toString(args[0]) ?? ""
            let startTime = eng.toDouble(args[1]) ?? 0
            tracer.reportMark(name: name, startTime: startTime)
            return nil
        }

        // $$reportInteraction(eventType, interactionId, inputTime, processingStart, processingEnd)
        eng.setGlobalFunction("$$reportInteraction") { [weak eng] args in
            guard let eng = eng else { return nil }
            let eventType = eng.toString(args[0]) ?? ""
            let interactionId = eng.toInt(args[1]) ?? 0
            let inputTime = eng.toDouble(args[2]) ?? 0
            let processingStart = eng.toDouble(args[3]) ?? 0
            let processingEnd = eng.toDouble(args[4]) ?? 0
            tracer.reportInteraction(
                eventType: eventType, interactionId: interactionId,
                inputTime: inputTime, processingStart: processingStart,
                processingEnd: processingEnd
            )
            return nil
        }

        // $$nextInteractionId() -> number
        eng.setGlobalFunction("$$nextInteractionId") { [weak eng] _ in
            return eng?.makeNumber(Double(tracer.getNextInteractionId()))
        }
    }

    // MARK: - JS value conversion helpers

    /// Converts a Swift `[[String: Any]]` entries array to a JS array of objects.
    private static func convertEntriesToJS(_ entries: [[String: Any]], engine eng: JSEngine) -> JSValueRef {
        let jsEntries = entries.map { entry -> JSValueRef in
            let obj = eng.makeObject()
            for (key, value) in entry {
                eng.setProperty(obj, key, convertAnyToJS(value, engine: eng))
            }
            return obj
        }
        return eng.makeArray(jsEntries)
    }

    /// Converts a Swift `[[String: Any]]` events array to a JS array of objects.
    private static func convertEventsToJS(_ events: [[String: Any]], engine eng: JSEngine) -> JSValueRef {
        let jsEvents = events.map { event -> JSValueRef in
            let obj = eng.makeObject()
            for (key, value) in event {
                eng.setProperty(obj, key, convertAnyToJS(value, engine: eng))
            }
            return obj
        }
        return eng.makeArray(jsEvents)
    }

    /// Converts a Swift Any value to a JS value.
    private static func convertAnyToJS(_ value: Any, engine eng: JSEngine) -> JSValueRef {
        switch value {
        case let str as String:
            return eng.makeString(str)
        case let bool as Bool:
            return eng.makeBool(bool)
        case let num as Int:
            return eng.makeNumber(Double(num))
        case let num as Double:
            return eng.makeNumber(num)
        case let dict as [String: Any]:
            let obj = eng.makeObject()
            for (k, v) in dict {
                eng.setProperty(obj, k, convertAnyToJS(v, engine: eng))
            }
            return obj
        case let arr as [Any]:
            let elements = arr.map { convertAnyToJS($0, engine: eng) }
            return eng.makeArray(elements)
        default:
            return eng.makeNull()
        }
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

        // TextEncoder polyfill — native Swift UTF-8 encoding.
        // Swift's String.utf8 gives the bytes, then a thin JS helper wraps
        // them in a Uint8Array (since JSEngine doesn't expose typed arrays).
        engine.evaluate("globalThis.$$__u8 = function(a) { return new Uint8Array(a); };")
        let newUint8Array = engine.getGlobalProperty("$$__u8")!
        engine.protect(newUint8Array)
        engine.evaluate("delete globalThis.$$__u8;")

        let textEncoderCtor = engine.makeFunction { [weak engine] _ in
            guard let engine = engine else { return nil }
            let encoder = engine.makeObject()
            engine.setProperty(encoder, "encode", engine.makeFunction { [weak engine] args in
                guard let engine = engine else { return nil }
                guard args.count > 0,
                      let str = engine.toString(args[0]) else {
                    return engine.callFunction(newUint8Array,
                        args: [engine.makeArray([])])
                }
                let jsBytes = engine.makeArray(
                    Array(str.utf8).map { engine.makeNumber(Double($0)) }
                )
                return engine.callFunction(newUint8Array, args: [jsBytes])
            })
            return encoder
        }
        engine.setGlobalProperty("TextEncoder", textEncoderCtor)

        // TextDecoder polyfill — native Swift UTF-8 decoding.
        // Uint8Array.toString() gives comma-separated byte values (single bridge
        // crossing), then Swift's String(bytes:encoding:.utf8) handles decoding.
        let textDecoderCtor = engine.makeFunction { [weak engine] _ in
            guard let engine = engine else { return nil }
            let decoder = engine.makeObject()
            engine.setProperty(decoder, "decode", engine.makeFunction { [weak engine] args in
                guard let engine = engine else { return nil }
                guard args.count > 0 else { return engine.makeString("") }
                let bytesArg = args[0]
                if engine.isUndefined(bytesArg) || engine.isNull(bytesArg) {
                    return engine.makeString("")
                }
                guard let csv = engine.toString(bytesArg), !csv.isEmpty else {
                    return engine.makeString("")
                }
                let bytes: [UInt8] = csv.split(separator: ",").compactMap { UInt8($0) }
                let result = String(bytes: bytes, encoding: .utf8) ?? ""
                return engine.makeString(result)
            })
            return decoder
        }
        engine.setGlobalProperty("TextDecoder", textDecoderCtor)
    }

    /// Native ReadableStream polyfill — minimal subset for react-server-dom-webpack/client.
    ///
    /// All state (buffer, closed/errored flags, pending readers) is held in Swift
    /// variables captured by closures. Only Promise construction and error throwing
    /// use thin JS helpers since the JSEngine protocol doesn't expose those.
    private func setupReadableStreamPolyfill() {
        let eng = engine

        // Promise and error helpers — thin JS wrappers that let Swift create
        // Promises and throw errors without direct JavaScriptCore coupling.
        eng.evaluate("""
            globalThis.$$__rs = {
                newPromise: function(ex) { return new Promise(ex); },
                resolve: function(v) { return Promise.resolve(v); },
                reject: function(e) { return Promise.reject(e); },
                throwTypeError: function(m) { throw new TypeError(m); },
                throwValue: function(e) { throw e; }
            };
        """)
        let helpers = eng.getGlobalProperty("$$__rs")!
        let newPromiseFn = eng.getProperty(helpers, "newPromise")!
        let resolvePromiseFn = eng.getProperty(helpers, "resolve")!
        let rejectPromiseFn = eng.getProperty(helpers, "reject")!
        let throwTypeErrorFn = eng.getProperty(helpers, "throwTypeError")!
        let throwValueFn = eng.getProperty(helpers, "throwValue")!
        eng.protect(newPromiseFn)
        eng.protect(resolvePromiseFn)
        eng.protect(rejectPromiseFn)
        eng.protect(throwTypeErrorFn)
        eng.protect(throwValueFn)
        eng.evaluate("delete globalThis.$$__rs;")

        // ReadableStream constructor — returns a new stream object with
        // getReader() attached. State is held in captured Swift vars.
        let readableStreamCtor = eng.makeFunction { [weak eng] args in
            guard let eng = eng else { return nil }

            // --- Per-instance mutable state (shared across all closures) ---
            var buffer: [JSValueRef] = []
            var closed = false
            var errored = false
            var storedError: JSValueRef?
            var pendingResolve: JSValueRef?
            var pendingReject: JSValueRef?
            var locked = false

            // --- Controller ---
            let controller = eng.makeObject()

            // controller.enqueue(chunk)
            eng.setProperty(controller, "enqueue", eng.makeFunction { [weak eng] cArgs in
                guard let eng = eng else { return nil }
                if errored {
                    _ = eng.callFunction(throwValueFn, args: [storedError ?? eng.makeUndefined()])
                    return nil
                }
                if closed {
                    _ = eng.callFunction(throwTypeErrorFn,
                        args: [eng.makeString("Cannot enqueue to a closed ReadableStream")])
                    return nil
                }
                let chunk = cArgs.count > 0 ? cArgs[0] : eng.makeUndefined()
                if let resolve = pendingResolve {
                    if let pj = pendingReject { eng.unprotect(pj) }
                    eng.unprotect(resolve)
                    pendingResolve = nil
                    pendingReject = nil
                    let result = eng.makeObject()
                    eng.setProperty(result, "value", chunk)
                    eng.setProperty(result, "done", eng.makeBool(false))
                    _ = eng.callFunction(resolve, args: [result])
                } else {
                    eng.protect(chunk)
                    buffer.append(chunk)
                }
                return nil
            })

            // controller.close()
            eng.setProperty(controller, "close", eng.makeFunction { [weak eng] _ in
                guard let eng = eng else { return nil }
                closed = true
                if let resolve = pendingResolve {
                    if let pj = pendingReject { eng.unprotect(pj) }
                    eng.unprotect(resolve)
                    pendingResolve = nil
                    pendingReject = nil
                    let result = eng.makeObject()
                    eng.setProperty(result, "value", eng.makeUndefined())
                    eng.setProperty(result, "done", eng.makeBool(true))
                    _ = eng.callFunction(resolve, args: [result])
                }
                return nil
            })

            // controller.error(err)
            eng.setProperty(controller, "error", eng.makeFunction { [weak eng] eArgs in
                guard let eng = eng else { return nil }
                let err = eArgs.count > 0 ? eArgs[0] : eng.makeUndefined()
                errored = true
                eng.protect(err)
                storedError = err
                if let reject = pendingReject {
                    if let pr = pendingResolve { eng.unprotect(pr) }
                    eng.unprotect(reject)
                    pendingResolve = nil
                    pendingReject = nil
                    _ = eng.callFunction(reject, args: [err])
                }
                return nil
            })

            // --- Stream object ---
            let stream = eng.makeObject()

            // stream.getReader()
            eng.setProperty(stream, "getReader", eng.makeFunction { [weak eng] _ in
                guard let eng = eng else { return nil }
                if locked {
                    _ = eng.callFunction(throwTypeErrorFn,
                        args: [eng.makeString("ReadableStream is already locked to a reader")])
                    return nil
                }
                locked = true

                let reader = eng.makeObject()

                // reader.read()
                eng.setProperty(reader, "read", eng.makeFunction { [weak eng] _ in
                    guard let eng = eng else { return nil }

                    if errored {
                        return eng.callFunction(rejectPromiseFn,
                            args: [storedError ?? eng.makeUndefined()])
                    }

                    if !buffer.isEmpty {
                        let chunk = buffer.removeFirst()
                        eng.unprotect(chunk)
                        let result = eng.makeObject()
                        eng.setProperty(result, "value", chunk)
                        eng.setProperty(result, "done", eng.makeBool(false))
                        return eng.callFunction(resolvePromiseFn, args: [result])
                    }

                    if closed {
                        let result = eng.makeObject()
                        eng.setProperty(result, "value", eng.makeUndefined())
                        eng.setProperty(result, "done", eng.makeBool(true))
                        return eng.callFunction(resolvePromiseFn, args: [result])
                    }

                    // Buffer empty, stream open — return a pending promise
                    let executor = eng.makeFunction { [weak eng] exArgs in
                        guard let eng = eng else { return nil }
                        pendingResolve = exArgs[0]
                        pendingReject = exArgs[1]
                        eng.protect(exArgs[0])
                        eng.protect(exArgs[1])
                        return nil
                    }
                    return eng.callFunction(newPromiseFn, args: [executor])
                })

                return reader
            })

            // Call start(controller) if source provided
            if !args.isEmpty && !eng.isUndefined(args[0]) && !eng.isNull(args[0]) {
                if let startFn = eng.getProperty(args[0], "start") {
                    _ = eng.callFunction(startFn, args: [controller])
                }
            }

            return stream
        }

        eng.setGlobalProperty("ReadableStream", readableStreamCtor)
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
