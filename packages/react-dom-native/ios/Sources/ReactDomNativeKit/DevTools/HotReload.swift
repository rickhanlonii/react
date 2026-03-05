#if DEBUG
import Foundation

public class HotReloadClient {
    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var webSocketURL: URL
    private var isConnected = false
    private var reconnectTimer: Timer?

    // Identity info sent on connect
    private let appName: String
    private let deviceName: String
    private let deviceModel: String
    private let simulatorUDID: String?
    private let platform: String

    /// Callback invoked on the main thread when an inspector message arrives
    /// from the dev server (e.g. start-tracing, stop-tracing).
    public var onInspectorMessage: ((String) -> Void)?

    /// Callback invoked on the main thread when a clear message arrives
    /// (e.g. DevTools Page.navigate(about:blank) to blank the screen).
    public var onClear: (() -> Void)?

    /// Callback invoked on the main thread when a reload message arrives.
    public var onReload: (() -> Void)?

    /// Callback invoked on the main thread when a refresh message arrives
    /// with changed chunk info for Fast Refresh.
    public var onRefresh: (([[String: Any]]) -> Void)?

    /// Creates a hot reload client.
    ///
    /// - Parameters:
    ///   - url: Full WebSocket URL (e.g. ws://localhost:6001/__dev)
    ///   - appName: App display name (e.g. "Falcon")
    ///   - deviceName: Simulator/device name (e.g. "Falcon Demo")
    ///   - deviceModel: Device model (e.g. "iPhone 16 Pro")
    ///   - simulatorUDID: Simulator UDID if running in simulator
    ///   - platform: "iOS Simulator" or "iOS"
    public init(
        url: URL,
        appName: String = "Falcon",
        deviceName: String = "iOS Device",
        deviceModel: String = "iPhone",
        simulatorUDID: String? = nil,
        platform: String = "iOS"
    ) {
        self.webSocketURL = url
        self.appName = appName
        self.deviceName = deviceName
        self.deviceModel = deviceModel
        self.simulatorUDID = simulatorUDID
        self.platform = platform
    }

    public func connect() {
        guard !isConnected else { return }

        let task = session.webSocketTask(with: webSocketURL)
        self.webSocketTask = task
        task.resume()
        isConnected = true

        // Send identity info immediately
        var connectInfo: [String: Any] = [
            "type": "connect",
            "appName": appName,
            "deviceName": deviceName,
            "deviceModel": deviceModel,
            "platform": platform,
        ]
        if let udid = simulatorUDID {
            connectInfo["simulatorUDID"] = udid
        }
        if let jsonData = try? JSONSerialization.data(withJSONObject: connectInfo),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            send(jsonString)
        }

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
            case "clear":
                self.onClear?()

            case "reload":
                print("[HotReload] Reloading JS bundle...")
                self.onReload?()

            case "refresh":
                let chunks = json["chunks"] as? [[String: Any]] ?? []
                print("[HotReload] Fast refresh with \(chunks.count) chunk(s)")
                self.onRefresh?(chunks)

            case "error":
                let message = json["message"] as? String ?? "Unknown error"
                let stack = json["stack"] as? String
                let file = json["file"] as? String
                let line = json["line"] as? Int
                LogBox.shared.addEntry(
                    level: .fatalError,
                    source: .devServerError,
                    message: message,
                    stack: stack,
                    file: file,
                    line: line
                )

            case "clear-errors":
                LogBox.shared.clearAll()

            case "start-tracing", "stop-tracing", "cdp-request", "dispatch-touch", "capture-screenshot", "enable-commit-screenshots", "disable-commit-screenshots", "navigate-fixture":
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
#endif