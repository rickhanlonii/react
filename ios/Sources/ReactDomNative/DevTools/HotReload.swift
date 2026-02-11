import Foundation
import JavaScriptCore

class HotReloadClient {
    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var serverURL: URL
    private weak var jsRuntime: JSRuntime?
    private var isConnected = false
    private var reconnectTimer: Timer?

    init(host: String = "localhost", port: Int = 8082, runtime: JSRuntime) {
        self.serverURL = URL(string: "ws://\(host):\(port)")!
        self.jsRuntime = runtime
    }

    func connect() {
        guard !isConnected else { return }

        let task = session.webSocketTask(with: serverURL)
        self.webSocketTask = task
        task.resume()
        isConnected = true

        print("[HotReload] Connected to \(serverURL)")
        receiveMessage()
    }

    func disconnect() {
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
            switch type {
            case "reload":
                print("[HotReload] Reloading JS bundle...")
                self?.jsRuntime?.reloadBundle()

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
