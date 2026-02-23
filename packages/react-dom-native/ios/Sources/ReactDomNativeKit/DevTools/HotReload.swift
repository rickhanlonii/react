import Foundation

public class HotReloadClient {
    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var webSocketURL: URL
    private var isConnected = false
    private var reconnectTimer: Timer?

    /// Callback invoked on the main thread when an inspector message arrives
    /// from the dev server (e.g. start-tracing, stop-tracing).
    public var onInspectorMessage: ((String) -> Void)?

    /// Callback invoked on the main thread when a reload message arrives.
    public var onReload: (() -> Void)?

    /// Creates a hot reload client.
    ///
    /// - Parameters:
    ///   - host: WebSocket server host (default: "localhost")
    ///   - port: WebSocket server port (default: 8082)
    public init(host: String = "localhost", port: Int = 8082) {
        self.webSocketURL = URL(string: "ws://\(host):\(port)")!
    }

    public func connect() {
        guard !isConnected else { return }

        let task = session.webSocketTask(with: webSocketURL)
        self.webSocketTask = task
        task.resume()
        isConnected = true

        print("[HotReload] Connected to \(webSocketURL)")
        receiveMessage()
    }

    /// Sends a string message to the dev server via the WebSocket connection.
    public func send(_ message: String) {
        webSocketTask?.send(.string(message)) { error in
            if let error = error {
                print("[HotReload] Send failed: \(error)")
            }
        }
    }

    public func disconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected = false
    }

    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleMessage(text)
                    }
                @unknown default:
                    break
                }
                // Continue listening
                self.receiveMessage()

            case .failure(let error):
                print("[HotReload] Connection lost: \(error.localizedDescription)")
                self.isConnected = false
                self.scheduleReconnect()
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch type {
            case "reload":
                print("[HotReload] Reloading JS bundle...")
                self.onReload?()

            case "error":
                let message = json["message"] as? String ?? "Unknown error"
                let stack = json["stack"] as? String
                let file = json["file"] as? String
                let line = json["line"] as? Int
                ErrorOverlay.shared.show(
                    message: message,
                    stack: stack,
                    file: file,
                    line: line
                )

            case "clear-errors":
                ErrorOverlay.shared.dismiss()

            case "start-tracing", "stop-tracing", "cdp-request":
                self.onInspectorMessage?(text)

            default:
                break
            }
        }
    }

    private func scheduleReconnect() {
        DispatchQueue.main.async { [weak self] in
            self?.reconnectTimer?.invalidate()
            self?.reconnectTimer = Timer.scheduledTimer(
                withTimeInterval: 2.0,
                repeats: false
            ) { [weak self] _ in
                print("[HotReload] Attempting reconnect...")
                self?.connect()
            }
        }
    }
}
