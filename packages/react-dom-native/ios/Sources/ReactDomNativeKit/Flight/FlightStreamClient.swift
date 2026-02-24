import Foundation
import JSEngine

// ---------------------------------------------------------------------------
// FlightStreamClient
//
// Swift-native parser for the React Flight wire protocol. Replaces the JS-side
// processStringChunk state machine. Parses streamed text into rows of the form
// `<hex_id>:<tag><data>\n` and dispatches them to the JS Flight client via
// bridge globals ($$processFlightRow, $$resolveFlightModule, etc.).
//
// For module ('I') rows, the module is fetched and evaluated natively via
// URLSession + JSEngine.evaluate(code, sourceURL:), matching how browsers
// handle <script> tags during SSR.
// ---------------------------------------------------------------------------

/// Parses a Flight byte stream and dispatches rows to JS via bridge globals.
class FlightStreamClient {

    // MARK: - Parser State

    private enum ParserState {
        case rowID
        case rowTag
        case rowData
        case rowLength
        case rowBinary
    }

    /// The JS response ID returned by $$createFlightResponse.
    let responseId: Int

    /// The JS engine for calling bridge globals and evaluating modules.
    private weak var engine: JSEngine?

    /// The server origin for building module URLs (e.g. "http://localhost:6000").
    private let serverOrigin: String

    // Parser state
    private var state: ParserState = .rowID
    private var rowID: Int = 0
    private var rowTag: String = ""
    private var buffer: String = ""
    private var rowLength: Int = 0
    private var binaryBuffer: String = ""
    private var binaryReceived: Int = 0

    // Binary row tags (use length-prefixed format)
    private static let binaryTags: Set<Character> = [
        "T", "A", "O", "o", "b", "U", "S", "s", "L", "l", "G", "g", "M", "m", "V"
    ]

    // MARK: - Module Cache

    /// Shared module cache across all FlightStreamClient instances.
    /// Survives individual stream lifetimes but cleared on full reset.
    enum ModuleCacheEntry {
        case pending(callbacks: [(Result<JSValueRef, Error>) -> Void])
        case resolved(exports: JSValueRef)
        case rejected(error: Error)
    }

    private static var moduleCache: [String: ModuleCacheEntry] = [:]

    /// Clears the module cache. Called during ReactRuntime.performFullReset().
    static func clearModuleCache(engine: JSEngine?) {
        for (_, entry) in moduleCache {
            if case .resolved(let exports) = entry {
                engine?.unprotect(exports)
            }
        }
        moduleCache.removeAll()
    }

    // MARK: - Init

    init(responseId: Int, engine: JSEngine, serverURL: String) {
        self.responseId = responseId
        self.engine = engine
        // Extract origin (protocol + host + port) from server URL
        if let url = URL(string: serverURL),
           let scheme = url.scheme,
           let host = url.host {
            let port = url.port.map { ":\($0)" } ?? ""
            self.serverOrigin = "\(scheme)://\(host)\(port)"
        } else {
            self.serverOrigin = serverURL
        }
    }

    // MARK: - Stream Processing

    /// Processes a string chunk through the row-parsing state machine.
    /// This is the main entry point for feeding data into the parser.
    func processString(_ text: String) {
        let chars = Array(text)
        var i = 0

        while i < chars.count {
            let ch = chars[i]

            switch state {
            case .rowID:
                if ch == ":" {
                    state = .rowTag
                } else {
                    // Hex digit for row ID
                    let code = ch.asciiValue ?? 0
                    let digit: Int
                    if code > 96 { // lowercase a-f
                        digit = Int(code) - 87
                    } else { // 0-9
                        digit = Int(code) - 48
                    }
                    rowID = (rowID << 4) | digit
                }

            case .rowTag:
                if ch == "\"" || ch == "{" || ch == "[" ||
                   ch == "t" || ch == "f" || ch == "n" ||
                   (ch >= "0" && ch <= "9") {
                    // No tag — model row. Character is part of JSON.
                    rowTag = ""
                    buffer = String(ch)
                    state = .rowData
                } else if Self.binaryTags.contains(ch) {
                    // Binary row — switch to length-prefix mode
                    rowTag = String(ch)
                    rowLength = 0
                    state = .rowLength
                } else {
                    // Tagged text row
                    rowTag = String(ch)
                    buffer = ""
                    state = .rowData
                }

            case .rowLength:
                if ch == "," {
                    // End of length prefix — switch to binary data mode
                    state = .rowBinary
                    binaryBuffer = ""
                    binaryReceived = 0
                } else {
                    // Hex digit for length
                    let code = ch.asciiValue ?? 0
                    let digit: Int
                    if code > 96 {
                        digit = Int(code) - 87
                    } else {
                        digit = Int(code) - 48
                    }
                    rowLength = (rowLength << 4) | digit
                }

            case .rowBinary:
                let remaining = rowLength - binaryReceived
                let available = chars.count - i
                if available >= remaining {
                    // We have enough data to complete this row
                    let endIdx = i + remaining
                    binaryBuffer += String(chars[i..<endIdx])
                    i = endIdx - 1 // -1 because loop increments
                    dispatchRow(id: rowID, tag: rowTag, data: binaryBuffer)
                    resetParserState()
                } else {
                    // Need more data
                    binaryBuffer += String(chars[i...])
                    binaryReceived += available
                    i = chars.count // Skip past the rest
                    continue // Don't increment i again
                }

            case .rowData:
                if ch == "\n" {
                    // End of row
                    dispatchRow(id: rowID, tag: rowTag, data: buffer)
                    resetParserState()
                } else {
                    buffer.append(ch)
                }
            }

            i += 1
        }
    }

    /// Signals that the Flight stream is complete.
    func close() {
        guard let engine = engine else { return }
        guard let closeFn = engine.getGlobalProperty("$$closeFlightResponse") else { return }
        _ = engine.callFunction(closeFn, args: [
            engine.makeNumber(Double(responseId))
        ])
    }

    /// Reports a transport-level error to the Flight client.
    func reportError(_ error: Error) {
        guard let engine = engine else { return }
        guard let errorFn = engine.getGlobalProperty("$$reportFlightError") else { return }
        _ = engine.callFunction(errorFn, args: [
            engine.makeNumber(Double(responseId)),
            engine.makeString(error.localizedDescription)
        ])
    }

    // MARK: - Private

    private func resetParserState() {
        state = .rowID
        rowID = 0
        rowTag = ""
        buffer = ""
        rowLength = 0
        binaryBuffer = ""
        binaryReceived = 0
    }

    /// Dispatches a complete row to the appropriate handler.
    private func dispatchRow(id: Int, tag: String, data: String) {
        if tag == "I" {
            // Module row — handle natively
            processModuleRow(id: id, data: data)
        } else {
            // All other rows — pass to JS processRow
            processGenericRow(id: id, tag: tag, data: data)
        }
    }

    /// Dispatches a non-module row to JS via $$processFlightRow.
    private func processGenericRow(id: Int, tag: String, data: String) {
        guard let engine = engine else { return }
        guard let fn = engine.getGlobalProperty("$$processFlightRow") else { return }
        _ = engine.callFunction(fn, args: [
            engine.makeNumber(Double(responseId)),
            engine.makeNumber(Double(id)),
            engine.makeString(tag),
            engine.makeString(data)
        ])
    }

    /// Handles an 'I' (module) row: parse metadata, fetch + evaluate module.
    private func processModuleRow(id: Int, data: String) {
        guard let engine = engine else { return }

        // Parse metadata JSON to extract moduleId and exportName.
        // Two formats are used by the Flight protocol:
        //   Array:  ["moduleId", chunks, "exportName"]
        //   Object: {"id": "moduleId", "chunks": [], "name": "exportName"}
        guard let jsonData = data.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: jsonData) else {
            rejectModule(chunkId: id, errorMessage: "Failed to parse module metadata: \(data)")
            return
        }

        let moduleId: String
        let exportName: String

        if let arr = parsed as? [Any] {
            // Array format: [moduleId, chunks, exportName]
            guard let mid = arr[0] as? String else {
                rejectModule(chunkId: id, errorMessage: "Missing module id in array metadata: \(data)")
                return
            }
            moduleId = mid
            let name = (arr.count > 2 ? arr[2] as? String : nil) ?? "default"
            exportName = name.isEmpty ? "default" : name
        } else if let dict = parsed as? [String: Any] {
            // Object format: {id, chunks, name}
            if let mid = dict["id"] as? String {
                moduleId = mid
            } else if let mid = dict["id"] as? Int {
                moduleId = String(mid)
            } else {
                rejectModule(chunkId: id, errorMessage: "Missing module id in metadata: \(data)")
                return
            }
            exportName = (dict["name"] as? String) ?? "default"
        } else {
            rejectModule(chunkId: id, errorMessage: "Unexpected metadata format: \(data)")
            return
        }

        let moduleURL = "\(serverOrigin)/modules/\(moduleId).js"

        // Check static module cache
        if let cached = Self.moduleCache[moduleURL] {
            switch cached {
            case .resolved(let exports):
                // Already loaded — resolve immediately
                resolveModule(chunkId: id, exports: exports, exportName: exportName)
                return

            case .pending(var callbacks):
                // Loading in progress — queue callback
                callbacks.append { [weak self] result in
                    guard let self = self else { return }
                    switch result {
                    case .success(let exports):
                        self.resolveModule(chunkId: id, exports: exports, exportName: exportName)
                    case .failure(let error):
                        self.rejectModule(chunkId: id, errorMessage: error.localizedDescription)
                    }
                }
                Self.moduleCache[moduleURL] = .pending(callbacks: callbacks)
                return

            case .rejected(let error):
                rejectModule(chunkId: id, errorMessage: error.localizedDescription)
                return
            }
        }

        // Not cached — start fetch
        Self.moduleCache[moduleURL] = .pending(callbacks: [{ [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let exports):
                self.resolveModule(chunkId: id, exports: exports, exportName: exportName)
            case .failure(let error):
                self.rejectModule(chunkId: id, errorMessage: error.localizedDescription)
            }
        }])

        guard let url = URL(string: moduleURL) else {
            completeModuleFetch(moduleURL: moduleURL, result: .failure(
                NSError(domain: "FlightStreamClient", code: -1, userInfo: [
                    NSLocalizedDescriptionKey: "Invalid module URL: \(moduleURL)"
                ])
            ))
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }

                if let error = error {
                    self.completeModuleFetch(moduleURL: moduleURL, result: .failure(error))
                    return
                }

                guard let data = data,
                      let code = String(data: data, encoding: .utf8) else {
                    self.completeModuleFetch(moduleURL: moduleURL, result: .failure(
                        NSError(domain: "FlightStreamClient", code: -2, userInfo: [
                            NSLocalizedDescriptionKey: "Invalid module data from \(moduleURL)"
                        ])
                    ))
                    return
                }

                guard let engine = self.engine else { return }

                // Evaluate the module IIFE via JSEngine (not JS eval)
                // Module assigns to globalThis.__module
                engine.evaluate(code, sourceURL: url)

                guard let exports = engine.getGlobalProperty("__module") else {
                    self.completeModuleFetch(moduleURL: moduleURL, result: .failure(
                        NSError(domain: "FlightStreamClient", code: -3, userInfo: [
                            NSLocalizedDescriptionKey: "Module did not export __module: \(moduleURL)"
                        ])
                    ))
                    return
                }

                // Clean up the global
                engine.evaluate("delete globalThis.__module")

                // Protect the exports from GC
                engine.protect(exports)

                self.completeModuleFetch(moduleURL: moduleURL, result: .success(exports))
            }
        }.resume()
    }

    /// Completes a module fetch, updating the cache and notifying all waiters.
    private func completeModuleFetch(moduleURL: String, result: Result<JSValueRef, Error>) {
        // Extract pending callbacks before updating cache
        var callbacks: [(Result<JSValueRef, Error>) -> Void] = []
        if case .pending(let pending) = Self.moduleCache[moduleURL] {
            callbacks = pending
        }

        // Update cache
        switch result {
        case .success(let exports):
            Self.moduleCache[moduleURL] = .resolved(exports: exports)
        case .failure(let error):
            Self.moduleCache[moduleURL] = .rejected(error: error)
        }

        // Notify all waiters
        for callback in callbacks {
            callback(result)
        }
    }

    /// Resolves a module chunk via $$resolveFlightModule bridge global.
    private func resolveModule(chunkId: Int, exports: JSValueRef, exportName: String) {
        guard let engine = engine else { return }
        guard let fn = engine.getGlobalProperty("$$resolveFlightModule") else { return }
        _ = engine.callFunction(fn, args: [
            engine.makeNumber(Double(responseId)),
            engine.makeNumber(Double(chunkId)),
            exports,
            engine.makeString(exportName)
        ])
    }

    /// Rejects a module chunk via $$rejectFlightModule bridge global.
    private func rejectModule(chunkId: Int, errorMessage: String) {
        guard let engine = engine else { return }
        guard let fn = engine.getGlobalProperty("$$rejectFlightModule") else { return }
        _ = engine.callFunction(fn, args: [
            engine.makeNumber(Double(responseId)),
            engine.makeNumber(Double(chunkId)),
            engine.makeString(errorMessage)
        ])
    }
}
