import Foundation

// ---------------------------------------------------------------------------
// LogBox Data Model
//
// LogBoxEntry represents a single error/warning. LogBoxStore is the in-memory
// collection that notifies the UI on changes.
// ---------------------------------------------------------------------------

public struct LogBoxEntry: Identifiable {
    public enum Level {
        case warning
        case error
        case fatalError
    }

    public enum Source: String {
        case jsException = "JS Exception"
        case consoleError = "console.error"
        case consoleWarning = "console.warn"
        case rendererUncaught = "Uncaught Error"
        case rendererCaught = "Caught Error"
        case rendererRecoverable = "Recoverable Error"
        case devServerError = "Dev Server Error"
        case nativeError = "Native Error"
    }

    public let id: UUID
    public let level: Level
    public let source: Source
    public let message: String
    public let stack: String?
    public let file: String?
    public let line: Int?
    public let timestamp: Date
    public var isRead: Bool

    public init(
        level: Level,
        source: Source,
        message: String,
        stack: String? = nil,
        file: String? = nil,
        line: Int? = nil
    ) {
        self.id = UUID()
        self.level = level
        self.source = source
        self.message = message
        self.stack = stack
        self.file = file
        self.line = line
        self.timestamp = Date()
        self.isRead = false
    }
}

public class LogBoxStore {
    public private(set) var entries: [LogBoxEntry] = []

    /// Called on main thread whenever entries change.
    public var onUpdate: (() -> Void)?

    public var unreadCount: Int {
        entries.filter { !$0.isRead }.count
    }

    public var hasOnlyWarnings: Bool {
        !entries.isEmpty && entries.allSatisfy { $0.level == .warning }
    }

    public func addEntry(_ entry: LogBoxEntry) {
        entries.append(entry)
        onUpdate?()
    }

    public func markRead(_ id: UUID) {
        if let idx = entries.firstIndex(where: { $0.id == id }) {
            entries[idx].isRead = true
            onUpdate?()
        }
    }

    public func clearAll() {
        entries.removeAll()
        onUpdate?()
    }
}
