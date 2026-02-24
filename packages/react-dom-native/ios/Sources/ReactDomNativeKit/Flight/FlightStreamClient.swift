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
// For module ('I') rows, webpack chunk files are fetched via URLSession and
// evaluated in JSC. Each chunk self-registers its modules via the webpack
// JSONP push handler. After all chunks for a module are loaded,
// $$webpackRequire(moduleId, exportName) resolves the module exports.
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

    // MARK: - Chunk Cache

    /// Set of chunk URLs that have been fetched and evaluated.
    /// Webpack chunks self-register their modules when evaluated, so we only
    /// need to track which chunks have been loaded to avoid re-fetching.
    private static var loadedChunks: Set<String> = []

    /// Clears the chunk cache. Called during ReactRuntime.performFullReset().
    static func clearModuleCache(engine: JSEngine?) {
        loadedChunks.removeAll()
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

    /// Handles an 'I' (module) row: parse metadata, fetch webpack chunks, resolve module.
    ///
    /// Webpack metadata format:
    ///   Array:  [moduleId, [chunkId, chunkFilename, ...], exportName]
    ///   Object: {id: moduleId, chunks: [chunkId, chunkFilename, ...], name: exportName}
    ///
    /// The chunks array is double-indexed: [chunkId, filename, chunkId, filename, ...].
    /// Each chunk file is fetched and evaluated — it self-registers its modules in the
    /// webpack runtime via the JSONP push handler. After all chunks are loaded, we call
    /// $$webpackRequire(moduleId, exportName) to get the resolved module exports.
    private func processModuleRow(id: Int, data: String) {
        guard let engine = engine else { return }

        // Parse metadata JSON
        guard let jsonData = data.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: jsonData) else {
            rejectModule(chunkId: id, errorMessage: "Failed to parse module metadata: \(data)")
            return
        }

        let moduleId: String
        let exportName: String
        var chunkFilenames: [String] = []

        if let arr = parsed as? [Any] {
            // Array format: [moduleId, chunks, exportName]
            moduleId = "\(arr[0])"
            let name = (arr.count > 2 ? arr[2] as? String : nil) ?? "default"
            exportName = name.isEmpty ? "default" : name
            if arr.count > 1, let chunks = arr[1] as? [Any] {
                // Double-indexed: [chunkId, filename, chunkId, filename, ...]
                for i in stride(from: 1, to: chunks.count, by: 2) {
                    if let filename = chunks[i] as? String {
                        chunkFilenames.append(filename)
                    }
                }
            }
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
            if let chunks = dict["chunks"] as? [Any] {
                for i in stride(from: 1, to: chunks.count, by: 2) {
                    if let filename = chunks[i] as? String {
                        chunkFilenames.append(filename)
                    }
                }
            }
        } else {
            rejectModule(chunkId: id, errorMessage: "Unexpected metadata format: \(data)")
            return
        }

        // Load all chunks, then resolve the module via $$webpackRequire
        loadChunks(chunkFilenames: chunkFilenames) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success:
                self.resolveWebpackModule(chunkId: id, moduleId: moduleId, exportName: exportName)
            case .failure(let error):
                self.rejectModule(chunkId: id, errorMessage: error.localizedDescription)
            }
        }
    }

    /// Loads webpack chunk files by fetching and evaluating them.
    /// Each chunk self-registers its modules in the webpack runtime when evaluated.
    private func loadChunks(chunkFilenames: [String], completion: @escaping (Result<Void, Error>) -> Void) {
        guard !chunkFilenames.isEmpty else {
            completion(.success(()))
            return
        }

        let group = DispatchGroup()
        var firstError: Error?

        for filename in chunkFilenames {
            let chunkURL = "\(serverOrigin)/\(filename)"

            // Skip already-loaded chunks
            if Self.loadedChunks.contains(chunkURL) {
                continue
            }

            group.enter()
            guard let url = URL(string: chunkURL) else {
                group.leave()
                continue
            }

            URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
                DispatchQueue.main.async {
                    defer { group.leave() }
                    guard let self = self, let engine = self.engine else { return }

                    if let error = error {
                        if firstError == nil { firstError = error }
                        return
                    }

                    guard let data = data, let code = String(data: data, encoding: .utf8) else {
                        return
                    }

                    // Evaluate the chunk — it self-registers via JSONP push:
                    // globalThis["webpackChunkfalcon"].push([...])
                    engine.evaluate(code, sourceURL: url)
                    Self.loadedChunks.insert(chunkURL)
                }
            }.resume()
        }

        group.notify(queue: .main) {
            if let error = firstError {
                completion(.failure(error))
            } else {
                completion(.success(()))
            }
        }
    }

    /// Resolves a webpack module after its chunks have been loaded.
    /// Calls $$webpackRequire(moduleId, exportName) to get the module exports.
    private func resolveWebpackModule(chunkId: Int, moduleId: String, exportName: String) {
        guard let engine = engine else { return }
        guard let fn = engine.getGlobalProperty("$$webpackRequire") else {
            rejectModule(chunkId: chunkId, errorMessage: "$$webpackRequire not available")
            return
        }

        guard let exports = engine.callFunction(fn, args: [
            engine.makeString(moduleId),
            engine.makeString(exportName)
        ]) else {
            rejectModule(chunkId: chunkId, errorMessage: "$$webpackRequire returned nil for \(moduleId)")
            return
        }

        // Resolve the Flight chunk with the module exports
        guard let resolveFn = engine.getGlobalProperty("$$resolveFlightModule") else { return }
        _ = engine.callFunction(resolveFn, args: [
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
