import Foundation
import Network

/// Lightweight HTTP server that exposes e2e test results on localhost:6101.
/// Claude calls WebFetch on /results to get structured JSON results.
class HTTPResultsServer {
    static let shared = HTTPResultsServer()

    private var listener: NWListener?
    private let port: UInt16 = 6101
    private let queue = DispatchQueue(label: "HTTPResultsServer")

    /// Latest results, updated by FixtureRunner
    var latestResults: ResultsPayload = ResultsPayload(status: "idle", passed: 0, total: 0, fixtures: [:])

    /// Callback triggered when a POST /run-all request is received
    var onRunAllRequested: (() -> Void)?

    /// Callback triggered when a POST /reload-bundles request is received
    var onReloadBundlesRequested: (() -> Void)?

    struct FixtureResult: Codable {
        let passed: Bool
        let elements: Int
        let diffs: [LayoutDiff]
        var error: String? = nil
    }

    struct ResultsPayload: Codable {
        var status: String // "idle", "running", "complete"
        var passed: Int
        var total: Int
        var fixtures: [String: FixtureResult]
    }

    func start() {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        } catch {
            print("[HTTPResultsServer] Failed to create listener: \(error)")
            return
        }

        listener?.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        listener?.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("[HTTPResultsServer] Listening on http://localhost:\(self.port)")
            case .failed(let error):
                print("[HTTPResultsServer] Failed: \(error)")
            default:
                break
            }
        }

        listener?.start(queue: queue)
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, error in
            guard let self = self, let data = data else {
                connection.cancel()
                return
            }

            let request = String(data: data, encoding: .utf8) ?? ""
            let response: String

            if request.hasPrefix("GET /results") {
                let json = (try? JSONEncoder().encode(self.latestResults)) ?? Data()
                response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n" + String(data: json, encoding: .utf8)!
            } else if request.hasPrefix("POST /run-all") {
                DispatchQueue.main.async { self.onRunAllRequested?() }
                response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true}"
            } else if request.hasPrefix("POST /reload-bundles") {
                DispatchQueue.main.async { self.onReloadBundlesRequested?() }
                response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true}"
            } else {
                response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nNot Found"
            }

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    func stop() {
        listener?.cancel()
    }
}
