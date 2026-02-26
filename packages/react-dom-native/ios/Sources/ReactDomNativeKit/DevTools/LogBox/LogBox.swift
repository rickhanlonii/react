import UIKit

// ---------------------------------------------------------------------------
// LogBox
//
// Singleton coordinator for error display. Manages LogBoxStore and the
// three UI states: badge (floating count), list (all errors), detail
// (single error). All error sources route through addEntry().
//
// Also handles CDP (Chrome DevTools Protocol) forwarding of console
// messages and exceptions to the dev server WebSocket.
// ---------------------------------------------------------------------------

public class LogBox {
    public static let shared = LogBox()

    // MARK: - Public API

    public let store = LogBoxStore()

    /// WebSocket send function for CDP forwarding. Set by ReactRuntime
    /// when the HotReloadClient connects.
    public var sendCDP: ((String) -> Void)?

    /// Add an error entry and update the UI.
    public func addEntry(
        level: LogBoxEntry.Level,
        source: LogBoxEntry.Source,
        message: String,
        stack: String? = nil,
        file: String? = nil,
        line: Int? = nil
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let entry = LogBoxEntry(
                level: level, source: source, message: message,
                stack: stack, file: file, line: line
            )
            self.store.addEntry(entry)

            // Auto-expand for fatal errors
            if level == .fatalError {
                let idx = self.store.entries.count - 1
                self.showDetail(at: idx)
            }
        }
    }

    /// Clear all errors (e.g. on "clear-errors" from dev server).
    public func clearAll() {
        DispatchQueue.main.async { [weak self] in
            self?.store.clearAll()
        }
    }

    // MARK: - CDP Forwarding

    /// Forward a console message as a CDP Runtime.consoleAPICalled event.
    public func forwardConsoleToCDP(level: String, message: String, stack: String?) {
        guard let send = sendCDP else { return }

        // Map level to CDP type
        let cdpType = level == "warn" ? "warning" : level

        var msg: [String: Any] = [
            "type": "console-message",
            "cdpType": cdpType,
            "args": [["type": "string", "value": message]],
            "timestamp": Date().timeIntervalSince1970 * 1000,
        ]

        if let stack = stack, (level == "error" || level == "warn") {
            msg["stackTrace"] = parseStackTrace(stack)
        }

        if let data = try? JSONSerialization.data(withJSONObject: msg),
           let json = String(data: data, encoding: .utf8) {
            send(json)
        }
    }

    /// Forward an exception as a CDP Runtime.exceptionThrown event.
    public func forwardExceptionToCDP(message: String, stack: String?) {
        guard let send = sendCDP else { return }

        let stackTrace = parseStackTrace(stack)
        let firstFrame = (stackTrace["callFrames"] as? [[String: Any]])?.first

        let msg: [String: Any] = [
            "type": "cdp-event",
            "method": "Runtime.exceptionThrown",
            "params": [
                "timestamp": Date().timeIntervalSince1970 * 1000,
                "exceptionDetails": [
                    "exceptionId": Int(Date().timeIntervalSince1970 * 1000),
                    "text": "Uncaught \(message)",
                    "lineNumber": firstFrame?["lineNumber"] ?? 0,
                    "columnNumber": firstFrame?["columnNumber"] ?? 0,
                    "scriptId": "0",
                    "url": firstFrame?["url"] ?? "",
                    "stackTrace": stackTrace,
                    "exception": ["type": "string", "value": message],
                    "executionContextId": 1,
                ] as [String: Any],
            ] as [String: Any],
        ]

        if let data = try? JSONSerialization.data(withJSONObject: msg),
           let json = String(data: data, encoding: .utf8) {
            send(json)
        }
    }

    // MARK: - Private

    private enum UIState {
        case hidden
        case badge
        case list
        case detail(index: Int)
    }

    private var overlayWindow: UIWindow?
    private var badge: LogBoxBadge?
    private var uiState: UIState = .hidden
    private var isUpdatingUI = false

    private init() {
        store.onUpdate = { [weak self] in
            self?.updateUI()
        }
    }

    private func updateUI() {
        guard !isUpdatingUI else { return }
        isUpdatingUI = true
        defer { isUpdatingUI = false }

        if store.entries.isEmpty {
            hideAll()
            return
        }

        switch uiState {
        case .hidden:
            showBadge()
        case .badge:
            updateBadge()
        case .list:
            // Refresh list data in-place
            if let vc = overlayWindow?.rootViewController,
               let listView = vc.view as? LogBoxListView {
                listView.entries = store.entries
            }
            // Also update badge if it exists
            updateBadge()
        case .detail(let index):
            // If the entry was dismissed and list is now empty, hide
            if store.entries.isEmpty {
                hideAll()
            } else {
                // Clamp index and refresh
                let clampedIndex = min(index, store.entries.count - 1)
                showDetail(at: clampedIndex)
            }
        }
    }

    // MARK: - Badge

    private func showBadge() {
        ensureBadgeWindow()
        updateBadge()
        uiState = .badge
    }

    private func updateBadge() {
        let count = store.unreadCount > 0 ? store.unreadCount : store.entries.count
        badge?.update(count: count, warningsOnly: store.hasOnlyWarnings)
    }

    private func ensureBadgeWindow() {
        guard badge == nil else { return }
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }

        let window = PassThroughWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.isUserInteractionEnabled = true
        window.backgroundColor = .clear

        let vc = UIViewController()
        vc.view.backgroundColor = .clear

        let badgeView = LogBoxBadge()
        badgeView.translatesAutoresizingMaskIntoConstraints = false
        badgeView.onTap = { [weak self] in
            self?.showList()
        }
        vc.view.addSubview(badgeView)

        NSLayoutConstraint.activate([
            badgeView.trailingAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            badgeView.bottomAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
        ])

        window.rootViewController = vc
        window.isHidden = false

        self.overlayWindow = window
        self.badge = badgeView
    }

    // MARK: - List

    private func showList() {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }

        // Replace badge window with full-screen list window
        overlayWindow?.isHidden = true
        overlayWindow = nil
        badge = nil

        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1

        let listView = LogBoxListView()
        listView.entries = store.entries
        listView.onSelectEntry = { [weak self] entry in
            guard let self = self,
                  let idx = self.store.entries.firstIndex(where: { $0.id == entry.id }) else { return }
            self.store.markRead(entry.id)
            self.showDetail(at: idx)
        }
        listView.onDismiss = { [weak self] in
            self?.dismissToState()
        }
        listView.onClearAll = { [weak self] in
            self?.store.clearAll()
        }

        let vc = UIViewController()
        vc.view = listView
        window.rootViewController = vc
        window.isHidden = false

        self.overlayWindow = window
        uiState = .list
    }

    // MARK: - Detail

    private func showDetail(at index: Int) {
        guard index >= 0, index < store.entries.count else { return }
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }

        // Replace current window with detail window
        overlayWindow?.isHidden = true
        overlayWindow = nil
        badge = nil

        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1

        let detailView = LogBoxDetailView()
        detailView.configure(with: store.entries[index], index: index, total: store.entries.count)
        store.markRead(store.entries[index].id)

        detailView.onBack = { [weak self] in
            self?.showList()
        }
        detailView.onDismissEntry = { [weak self] in
            self?.dismissToState()
        }
        detailView.onDismissAll = { [weak self] in
            self?.store.clearAll()
        }
        detailView.onNavigate = { [weak self] delta in
            guard let self = self else { return }
            let newIndex = index + delta
            guard newIndex >= 0, newIndex < self.store.entries.count else { return }
            self.showDetail(at: newIndex)
        }

        let vc = UIViewController()
        vc.view = detailView
        window.rootViewController = vc
        window.isHidden = false

        self.overlayWindow = window
        uiState = .detail(index: index)
    }

    // MARK: - Dismiss

    /// Dismiss overlay back to badge (if entries exist) or hidden.
    private func dismissToState() {
        overlayWindow?.isHidden = true
        overlayWindow = nil
        badge = nil

        if store.entries.isEmpty {
            uiState = .hidden
        } else {
            showBadge()
        }
    }

    private func hideAll() {
        overlayWindow?.isHidden = true
        overlayWindow = nil
        badge = nil
        uiState = .hidden
    }

    // MARK: - Stack Trace Parsing

    /// Parse a JSC stack trace string into a CDP-compatible StackTrace dict.
    private func parseStackTrace(_ stack: String?) -> [String: Any] {
        guard let stack = stack else { return ["callFrames": []] }
        let lines = stack.components(separatedBy: "\n")
        var frames: [[String: Any]] = []
        // JSC stack format: "functionName@file:line:col" or "@file:line:col"
        let pattern = try? NSRegularExpression(pattern: "^(.*)@(.*?):(\\d+):(\\d+)$")
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard let match = pattern?.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) else { continue }
            let functionName = Range(match.range(at: 1), in: trimmed).map { String(trimmed[$0]) } ?? ""
            let url = Range(match.range(at: 2), in: trimmed).map { String(trimmed[$0]) } ?? ""
            let lineNum = Range(match.range(at: 3), in: trimmed).flatMap { Int(trimmed[$0]) } ?? 0
            let colNum = Range(match.range(at: 4), in: trimmed).flatMap { Int(trimmed[$0]) } ?? 0
            frames.append([
                "functionName": functionName,
                "scriptId": "0",
                "url": url,
                "lineNumber": lineNum - 1,  // CDP is 0-based
                "columnNumber": colNum - 1,
            ])
        }
        return ["callFrames": frames]
    }
}

// MARK: - Pass-Through Touch Handling

/// A UIWindow that only handles touches landing on a LogBoxBadge (or its
/// subviews). All other touches pass through to the app window below.
private class PassThroughWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hitView = super.hitTest(point, with: event) else { return nil }
        // Walk up from the hit view — only handle if it's inside a LogBoxBadge
        var current: UIView? = hitView
        while let view = current {
            if view is LogBoxBadge { return hitView }
            current = view.superview
        }
        return nil
    }
}
