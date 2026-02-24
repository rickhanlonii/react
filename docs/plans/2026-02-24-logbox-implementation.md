# LogBox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native Swift LogBox that displays all app errors (JS exceptions, console errors/warnings, React render errors, dev server errors) in a floating badge + list + detail UI.

**Architecture:** Centralized Swift error routing. Console is injected natively from Swift (already done in JSRuntime.swift). All error sources route through `LogBox` singleton which manages both UI display and CDP forwarding. Replaces `ErrorOverlay.swift`. JS-side `ConsoleForwarding.js` and `ExceptionReporter.js` are deleted.

**Tech Stack:** Swift/UIKit, JavaScriptCore bridge globals, CDP JSON over WebSocket

**Design doc:** `docs/plans/2026-02-24-logbox-design.md`

---

### Task 1: LogBox Data Model (LogBoxEntry + LogBoxStore)

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxStore.swift`

**Step 1: Create LogBoxEntry and LogBoxStore**

```swift
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
        case rendererUncaught = "React Uncaught Error"
        case rendererCaught = "React Caught Error"
        case rendererRecoverable = "React Recoverable Error"
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

    public func dismiss(_ id: UUID) {
        entries.removeAll { $0.id == id }
        onUpdate?()
    }

    public func clearAll() {
        entries.removeAll()
        onUpdate?()
    }
}
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxStore.swift
git commit -m "Add LogBox data model (LogBoxEntry + LogBoxStore)"
```

---

### Task 2: LogBoxBadge (Floating Error Count)

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxBadge.swift`

**Step 1: Create the floating badge view**

A draggable red circle in the bottom-right corner showing the unread error count. Yellow when only warnings exist. Tap opens the list. Uses `UIPanGestureRecognizer` for repositioning.

```swift
import UIKit

// ---------------------------------------------------------------------------
// LogBoxBadge
//
// Floating red circle showing unread error count. Draggable. Tap opens list.
// Yellow when only warnings exist, red otherwise.
// ---------------------------------------------------------------------------

class LogBoxBadge: UIView {
    var onTap: (() -> Void)?

    private let countLabel = UILabel()
    private let badgeSize: CGFloat = 44

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    func update(count: Int, warningsOnly: Bool) {
        countLabel.text = "\(count)"
        backgroundColor = warningsOnly
            ? UIColor(red: 1.0, green: 0.8, blue: 0.0, alpha: 0.95)
            : UIColor(red: 0.9, green: 0.2, blue: 0.2, alpha: 0.95)
    }

    private func setupUI() {
        backgroundColor = UIColor(red: 0.9, green: 0.2, blue: 0.2, alpha: 0.95)
        layer.cornerRadius = badgeSize / 2
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowRadius = 4

        countLabel.font = .boldSystemFont(ofSize: 18)
        countLabel.textColor = .white
        countLabel.textAlignment = .center
        countLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(countLabel)

        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: badgeSize),
            heightAnchor.constraint(equalToConstant: badgeSize),
            countLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            countLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])

        // Tap gesture
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)

        // Drag gesture
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        addGestureRecognizer(pan)
    }

    @objc private func handleTap() {
        onTap?()
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let superview = superview else { return }
        let translation = gesture.translation(in: superview)
        center = CGPoint(x: center.x + translation.x, y: center.y + translation.y)
        gesture.setTranslation(.zero, in: superview)
    }
}
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxBadge.swift
git commit -m "Add LogBoxBadge floating error count view"
```

---

### Task 3: LogBoxListView (Error List Overlay)

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxListView.swift`

**Step 1: Create the error list view**

Full-screen overlay with a scrollable list of all LogBox entries. Each row shows: colored level indicator, source label, first line of message, relative timestamp. Header has "LogBox" title, error count, and "Clear All" + close (X) buttons. Tap a row to open detail.

```swift
import UIKit

// ---------------------------------------------------------------------------
// LogBoxListView
//
// Full-screen overlay showing all LogBox entries in a scrollable list.
// Each row shows level, source, message preview, and timestamp.
// ---------------------------------------------------------------------------

class LogBoxListView: UIView {
    var entries: [LogBoxEntry] = [] {
        didSet { tableView.reloadData() }
    }
    var onSelectEntry: ((LogBoxEntry) -> Void)?
    var onDismiss: (() -> Void)?
    var onClearAll: (() -> Void)?

    private let tableView = UITableView(frame: .zero, style: .plain)
    private let headerView = UIView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.13, alpha: 1.0)

        // Header
        let titleLabel = UILabel()
        titleLabel.text = "LogBox"
        titleLabel.font = .boldSystemFont(ofSize: 20)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let closeButton = UIButton(type: .system)
        closeButton.setTitle("✕", for: .normal)
        closeButton.setTitleColor(.white, for: .normal)
        closeButton.titleLabel?.font = .systemFont(ofSize: 20)
        closeButton.addTarget(self, action: #selector(handleDismiss), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false

        let clearButton = UIButton(type: .system)
        clearButton.setTitle("Clear All", for: .normal)
        clearButton.setTitleColor(UIColor(white: 1, alpha: 0.7), for: .normal)
        clearButton.titleLabel?.font = .systemFont(ofSize: 14)
        clearButton.addTarget(self, action: #selector(handleClearAll), for: .touchUpInside)
        clearButton.translatesAutoresizingMaskIntoConstraints = false

        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(titleLabel)
        headerView.addSubview(closeButton)
        headerView.addSubview(clearButton)

        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 16),
            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            closeButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -16),
            closeButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),
            clearButton.trailingAnchor.constraint(equalTo: closeButton.leadingAnchor, constant: -8),
            clearButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 52),
        ])

        // Table view
        tableView.backgroundColor = .clear
        tableView.separatorColor = UIColor(white: 1, alpha: 0.1)
        tableView.delegate = self
        tableView.dataSource = self
        tableView.register(LogBoxListCell.self, forCellReuseIdentifier: "LogBoxListCell")
        tableView.translatesAutoresizingMaskIntoConstraints = false

        addSubview(headerView)
        addSubview(tableView)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            tableView.topAnchor.constraint(equalTo: headerView.bottomAnchor),
            tableView.leadingAnchor.constraint(equalTo: leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @objc private func handleDismiss() {
        onDismiss?()
    }

    @objc private func handleClearAll() {
        onClearAll?()
    }
}

extension LogBoxListView: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        entries.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "LogBoxListCell", for: indexPath) as! LogBoxListCell
        let entry = entries[entries.count - 1 - indexPath.row]  // newest first
        cell.configure(with: entry)
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let entry = entries[entries.count - 1 - indexPath.row]
        onSelectEntry?(entry)
    }
}

// MARK: - List Cell

private class LogBoxListCell: UITableViewCell {
    private let levelDot = UIView()
    private let sourceLabel = UILabel()
    private let messageLabel = UILabel()
    private let timeLabel = UILabel()

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    func configure(with entry: LogBoxEntry) {
        switch entry.level {
        case .fatalError:
            levelDot.backgroundColor = UIColor(red: 0.9, green: 0.2, blue: 0.2, alpha: 1)
        case .error:
            levelDot.backgroundColor = UIColor(red: 1.0, green: 0.4, blue: 0.4, alpha: 1)
        case .warning:
            levelDot.backgroundColor = UIColor(red: 1.0, green: 0.8, blue: 0.0, alpha: 1)
        }

        sourceLabel.text = entry.source.rawValue
        messageLabel.text = entry.message.components(separatedBy: "\n").first ?? entry.message
        timeLabel.text = relativeTime(entry.timestamp)

        // Dim read entries
        contentView.alpha = entry.isRead ? 0.6 : 1.0
    }

    private func relativeTime(_ date: Date) -> String {
        let seconds = Int(-date.timeIntervalSinceNow)
        if seconds < 60 { return "\(seconds)s ago" }
        if seconds < 3600 { return "\(seconds / 60)m ago" }
        return "\(seconds / 3600)h ago"
    }

    private func setupUI() {
        backgroundColor = .clear
        selectionStyle = .none

        levelDot.layer.cornerRadius = 5
        levelDot.translatesAutoresizingMaskIntoConstraints = false

        sourceLabel.font = .systemFont(ofSize: 11, weight: .medium)
        sourceLabel.textColor = UIColor(white: 1, alpha: 0.5)
        sourceLabel.translatesAutoresizingMaskIntoConstraints = false

        messageLabel.font = .monospacedSystemFont(ofSize: 14, weight: .regular)
        messageLabel.textColor = .white
        messageLabel.numberOfLines = 2
        messageLabel.translatesAutoresizingMaskIntoConstraints = false

        timeLabel.font = .systemFont(ofSize: 11)
        timeLabel.textColor = UIColor(white: 1, alpha: 0.4)
        timeLabel.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(levelDot)
        contentView.addSubview(sourceLabel)
        contentView.addSubview(messageLabel)
        contentView.addSubview(timeLabel)

        NSLayoutConstraint.activate([
            levelDot.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            levelDot.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 16),
            levelDot.widthAnchor.constraint(equalToConstant: 10),
            levelDot.heightAnchor.constraint(equalToConstant: 10),

            sourceLabel.leadingAnchor.constraint(equalTo: levelDot.trailingAnchor, constant: 10),
            sourceLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 12),

            timeLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            timeLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 12),
            timeLabel.leadingAnchor.constraint(greaterThanOrEqualTo: sourceLabel.trailingAnchor, constant: 8),

            messageLabel.leadingAnchor.constraint(equalTo: levelDot.trailingAnchor, constant: 10),
            messageLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            messageLabel.topAnchor.constraint(equalTo: sourceLabel.bottomAnchor, constant: 4),
            messageLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -12),
        ])
    }
}
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxListView.swift
git commit -m "Add LogBoxListView error list overlay"
```

---

### Task 4: LogBoxDetailView (Single Error Detail)

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxDetailView.swift`

**Step 1: Create the error detail view**

Full-screen overlay showing a single error. Red/yellow header with source label. Scrollable message + stack trace. Navigation arrows (prev/next) to browse entries. "Dismiss" removes one entry, "Dismiss All" clears everything. Back button returns to list.

```swift
import UIKit

// ---------------------------------------------------------------------------
// LogBoxDetailView
//
// Full-screen error detail: message, stack trace, source label, navigation.
// ---------------------------------------------------------------------------

class LogBoxDetailView: UIView {
    var onBack: (() -> Void)?
    var onDismissEntry: ((UUID) -> Void)?
    var onDismissAll: (() -> Void)?
    var onNavigate: ((Int) -> Void)?  // delta: -1 = prev, +1 = next

    private var entryId: UUID?
    private let headerView = UIView()
    private let sourceLabel = UILabel()
    private let countLabel = UILabel()
    private let scrollView = UIScrollView()
    private let messageLabel = UILabel()
    private let stackLabel = UILabel()
    private let fileLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    func configure(with entry: LogBoxEntry, index: Int, total: Int) {
        entryId = entry.id

        switch entry.level {
        case .fatalError:
            headerView.backgroundColor = UIColor(red: 0.8, green: 0.1, blue: 0.1, alpha: 1)
        case .error:
            headerView.backgroundColor = UIColor(red: 0.9, green: 0.25, blue: 0.25, alpha: 1)
        case .warning:
            headerView.backgroundColor = UIColor(red: 0.7, green: 0.55, blue: 0.0, alpha: 1)
        }

        sourceLabel.text = entry.source.rawValue
        countLabel.text = "\(index + 1) of \(total)"
        messageLabel.text = entry.message

        if let stack = entry.stack, !stack.isEmpty {
            stackLabel.text = stack
            stackLabel.isHidden = false
        } else {
            stackLabel.isHidden = true
        }

        if let file = entry.file {
            var location = file
            if let line = entry.line {
                location += ":\(line)"
            }
            fileLabel.text = location
            fileLabel.isHidden = false
        } else {
            fileLabel.isHidden = true
        }

        scrollView.setContentOffset(.zero, animated: false)
    }

    private func setupUI() {
        backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.13, alpha: 1.0)

        // Header bar
        headerView.backgroundColor = UIColor(red: 0.8, green: 0.1, blue: 0.1, alpha: 1)
        headerView.translatesAutoresizingMaskIntoConstraints = false

        let backButton = UIButton(type: .system)
        backButton.setTitle("< LogBox", for: .normal)
        backButton.setTitleColor(.white, for: .normal)
        backButton.titleLabel?.font = .systemFont(ofSize: 16)
        backButton.addTarget(self, action: #selector(handleBack), for: .touchUpInside)
        backButton.translatesAutoresizingMaskIntoConstraints = false

        sourceLabel.font = .boldSystemFont(ofSize: 16)
        sourceLabel.textColor = .white
        sourceLabel.translatesAutoresizingMaskIntoConstraints = false

        countLabel.font = .systemFont(ofSize: 13)
        countLabel.textColor = UIColor(white: 1, alpha: 0.7)
        countLabel.translatesAutoresizingMaskIntoConstraints = false

        let prevButton = UIButton(type: .system)
        prevButton.setTitle("▲", for: .normal)
        prevButton.setTitleColor(.white, for: .normal)
        prevButton.addTarget(self, action: #selector(handlePrev), for: .touchUpInside)
        prevButton.translatesAutoresizingMaskIntoConstraints = false

        let nextButton = UIButton(type: .system)
        nextButton.setTitle("▼", for: .normal)
        nextButton.setTitleColor(.white, for: .normal)
        nextButton.addTarget(self, action: #selector(handleNext), for: .touchUpInside)
        nextButton.translatesAutoresizingMaskIntoConstraints = false

        headerView.addSubview(backButton)
        headerView.addSubview(sourceLabel)
        headerView.addSubview(countLabel)
        headerView.addSubview(prevButton)
        headerView.addSubview(nextButton)

        NSLayoutConstraint.activate([
            backButton.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 12),
            backButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            sourceLabel.centerXAnchor.constraint(equalTo: headerView.centerXAnchor),
            sourceLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            nextButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -12),
            nextButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            prevButton.trailingAnchor.constraint(equalTo: nextButton.leadingAnchor, constant: -8),
            prevButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            countLabel.trailingAnchor.constraint(equalTo: prevButton.leadingAnchor, constant: -12),
            countLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 48),
        ])

        // Scrollable content
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        fileLabel.font = .monospacedSystemFont(ofSize: 13, weight: .medium)
        fileLabel.textColor = UIColor(red: 0.6, green: 0.8, blue: 1.0, alpha: 1)
        fileLabel.numberOfLines = 0
        fileLabel.translatesAutoresizingMaskIntoConstraints = false

        messageLabel.font = .monospacedSystemFont(ofSize: 15, weight: .regular)
        messageLabel.textColor = .white
        messageLabel.numberOfLines = 0
        messageLabel.translatesAutoresizingMaskIntoConstraints = false

        stackLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        stackLabel.textColor = UIColor(white: 1, alpha: 0.6)
        stackLabel.numberOfLines = 0
        stackLabel.translatesAutoresizingMaskIntoConstraints = false

        let contentStack = UIStackView(arrangedSubviews: [fileLabel, messageLabel, stackLabel])
        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.translatesAutoresizingMaskIntoConstraints = false

        scrollView.addSubview(contentStack)

        // Footer buttons
        let dismissButton = UIButton(type: .system)
        dismissButton.setTitle("Dismiss", for: .normal)
        dismissButton.setTitleColor(.white, for: .normal)
        dismissButton.titleLabel?.font = .boldSystemFont(ofSize: 16)
        dismissButton.backgroundColor = UIColor(white: 1, alpha: 0.15)
        dismissButton.layer.cornerRadius = 8
        dismissButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 20, bottom: 10, right: 20)
        dismissButton.addTarget(self, action: #selector(handleDismissEntry), for: .touchUpInside)
        dismissButton.translatesAutoresizingMaskIntoConstraints = false

        let dismissAllButton = UIButton(type: .system)
        dismissAllButton.setTitle("Dismiss All", for: .normal)
        dismissAllButton.setTitleColor(UIColor(white: 1, alpha: 0.6), for: .normal)
        dismissAllButton.titleLabel?.font = .systemFont(ofSize: 14)
        dismissAllButton.addTarget(self, action: #selector(handleDismissAll), for: .touchUpInside)
        dismissAllButton.translatesAutoresizingMaskIntoConstraints = false

        let footerStack = UIStackView(arrangedSubviews: [dismissButton, dismissAllButton])
        footerStack.axis = .horizontal
        footerStack.spacing = 16
        footerStack.alignment = .center
        footerStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(headerView)
        addSubview(scrollView)
        addSubview(footerStack)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: trailingAnchor),

            scrollView.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: 16),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            scrollView.bottomAnchor.constraint(equalTo: footerStack.topAnchor, constant: -12),

            contentStack.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentStack.widthAnchor.constraint(equalTo: scrollView.widthAnchor),

            footerStack.centerXAnchor.constraint(equalTo: centerXAnchor),
            footerStack.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -16),
        ])
    }

    @objc private func handleBack() { onBack?() }
    @objc private func handlePrev() { onNavigate?(-1) }
    @objc private func handleNext() { onNavigate?(1) }
    @objc private func handleDismissEntry() {
        guard let id = entryId else { return }
        onDismissEntry?(id)
    }
    @objc private func handleDismissAll() { onDismissAll?() }
}
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxDetailView.swift
git commit -m "Add LogBoxDetailView error detail overlay"
```

---

### Task 5: LogBox Coordinator (Singleton + Window Management)

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBox.swift`

**Step 1: Create the LogBox singleton**

Manages the `LogBoxStore`, the overlay `UIWindow`, and the state machine between badge/list/detail views. Entry point for all error sources.

Reference for window management pattern: `ReloadBanner.swift:67-113` (window creation with UIWindowScene, alert level).

```swift
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

    private init() {
        store.onUpdate = { [weak self] in
            self?.updateUI()
        }
    }

    private func updateUI() {
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

        let window = UIWindow(windowScene: scene)
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

        // Make the window pass through touches except on the badge
        vc.view.isUserInteractionEnabled = true

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
        detailView.onDismissEntry = { [weak self] id in
            self?.store.dismiss(id)
            // If no more entries, hide everything
            guard let self = self, !self.store.entries.isEmpty else { return }
            let newIndex = min(index, self.store.entries.count - 1)
            self.showDetail(at: newIndex)
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
```

Key design points:
- `ensureBadgeWindow()` creates a pass-through window (only the badge circle receives taps)
- State transitions: hidden → badge (when errors arrive) → list (on tap) → detail (on row tap)
- `addEntry()` auto-expands to detail for `.fatalError` level
- `sendCDP` closure is set by `ReactRuntime` when HotReloadClient connects
- Stack trace parsing moved from JS (`RemoteObject.parseStackTrace`) to Swift

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBox.swift
git commit -m "Add LogBox coordinator with window management and CDP forwarding"
```

---

### Task 6: Wire Console + Exception Handler to LogBox

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift:17-48`

**Step 1: Update console handlers to route through LogBox**

Replace the current print-only console handlers with versions that:
1. Print to Xcode console (as before)
2. Route `warn`/`error` to LogBox
3. Forward all levels to CDP via LogBox

Also update the exception handler to route through LogBox instead of just printing.

The console handlers in `JSRuntime.swift:26-48` currently create individual `consoleLog`, `consoleWarn`, `consoleError` closures. Replace them with a single pattern that routes through LogBox.

```swift
// Replace lines 17-51 of JSRuntime.swift with:

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
let consoleLevels = ["log", "info", "debug", "warn", "error"]
let consoleObj = engine.makeObject()
for level in consoleLevels {
    let fn = eng.makeFunction { [weak eng] args in
        // Stringify all arguments
        let parts: [String] = args.compactMap { eng?.toString($0) }
        let message = parts.joined(separator: " ")

        // 1. Always print to Xcode console
        let prefix = level == "error" ? "[JS ERROR]"
                   : level == "warn" ? "[JS WARN]"
                   : "[JS]"
        print("\(prefix) \(message)")

        #if DEBUG
        // 2. Route warn/error to LogBox
        if level == "error" {
            let stack = (try? args.first.flatMap { arg -> String? in
                // Try to get stack from Error objects
                if let eng = eng, let stackProp = eng.getProperty(arg, "stack") {
                    return eng.toString(stackProp)
                }
                return nil
            }) ?? nil
            LogBox.shared.addEntry(
                level: .error,
                source: .consoleError,
                message: message,
                stack: stack
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
    engine.setProperty(consoleObj, level, fn)
}
engine.setGlobalProperty("console", consoleObj)

// Legacy $$log for backwards compatibility
engine.setGlobalProperty("$$log", engine.getProperty(consoleObj, "log")!)
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift
git commit -m "Wire console and exception handler to LogBox + CDP"
```

---

### Task 7: Wire React Error Callbacks via Bridge Globals

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift:555-601`
- Modify: `packages/react-dom-native/src/renderer/renderer.js:75-82,121-132`

**Step 1: Register bridge globals in ReactRuntime.swift**

Add three bridge globals for React error callbacks in `setupDevToolsConnection()`. These are called by `renderer.js` when React catches errors.

Add inside `setupDevToolsConnection()` (after the existing code at line 600, before `#endif`):

```swift
// Register React error callback bridge globals
guard let engine = runtime?.engine else { return }

engine.setGlobalFunction("$$nativeOnUncaughtError") { [weak engine] args in
    let message = args.first.flatMap { engine?.toString($0) } ?? "Unknown error"
    let stack = args.count > 1 ? engine?.toString(args[1]) : nil
    LogBox.shared.addEntry(
        level: .fatalError,
        source: .rendererUncaught,
        message: message,
        stack: stack
    )
    LogBox.shared.forwardExceptionToCDP(message: message, stack: stack)
    return nil
}

engine.setGlobalFunction("$$nativeOnCaughtError") { [weak engine] args in
    let message = args.first.flatMap { engine?.toString($0) } ?? "Unknown error"
    let stack = args.count > 1 ? engine?.toString(args[1]) : nil
    LogBox.shared.addEntry(
        level: .error,
        source: .rendererCaught,
        message: message,
        stack: stack
    )
    return nil
}

engine.setGlobalFunction("$$nativeOnRecoverableError") { [weak engine] args in
    let message = args.first.flatMap { engine?.toString($0) } ?? "Unknown error"
    let stack = args.count > 1 ? engine?.toString(args[1]) : nil
    LogBox.shared.addEntry(
        level: .warning,
        source: .rendererRecoverable,
        message: message,
        stack: stack
    )
    return nil
}
```

**Step 2: Update renderer.js error callbacks**

Replace the `console.error` calls in `createRoot` (lines 75-82) and `createHydrationContainer` (lines 121-132) with bridge global calls.

In `createRoot` (line 75-78), replace the `onUncaughtError` callback:
```javascript
function(error) {
    if (typeof $$nativeOnUncaughtError === 'function') {
        $$nativeOnUncaughtError(error.message, error.stack);
    }
},
```

Replace the `onCaughtError` callback (line 79-82):
```javascript
function(error, errorInfo) {
    if (typeof $$nativeOnCaughtError === 'function') {
        $$nativeOnCaughtError(error.message, error.stack);
    }
},
```

In `createHydrationContainer` (lines 121-132), replace the three default callbacks:
```javascript
options && options.onUncaughtError ? options.onUncaughtError : function(error) {
    if (typeof $$nativeOnUncaughtError === 'function') {
        $$nativeOnUncaughtError(error.message, error.stack);
    }
},
options && options.onCaughtError ? options.onCaughtError : function(error, errorInfo) {
    if (typeof $$nativeOnCaughtError === 'function') {
        $$nativeOnCaughtError(error.message, error.stack);
    }
},
options && options.onRecoverableError ? options.onRecoverableError : function(error, errorInfo) {
    if (typeof $$nativeOnRecoverableError === 'function') {
        $$nativeOnRecoverableError(error.message, error.stack);
    }
},
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git add packages/react-dom-native/src/renderer/renderer.js
git commit -m "Wire React error callbacks to LogBox via native bridge globals"
```

---

### Task 8: Wire HotReload Errors to LogBox + Connect CDP

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift:105-118`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift:555-601`

**Step 1: Update HotReloadClient to use LogBox instead of ErrorOverlay**

In `HotReload.swift`, replace the `"error"` case (lines 105-115):

```swift
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
```

Replace the `"clear-errors"` case (lines 117-118):

```swift
case "clear-errors":
    LogBox.shared.clearAll()
```

**Step 2: Wire LogBox CDP sender in ReactRuntime**

In `setupDevToolsConnection()` in `ReactRuntime.swift`, after `client.connect()` (around line 597), add:

```swift
// Connect LogBox CDP forwarding to the WebSocket
LogBox.shared.sendCDP = { [weak client] json in
    client?.send(json)
}
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git commit -m "Wire HotReload errors to LogBox and connect CDP forwarding"
```

---

### Task 9: Delete Old Files + Clean Up entry.js

**Files:**
- Delete: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/ErrorOverlay.swift`
- Delete: `packages/react-dom-native/src/devtools/ConsoleForwarding.js`
- Delete: `packages/react-dom-native/src/devtools/ExceptionReporter.js`
- Modify: `packages/react-dom-native/src/entry.js:22-25`

**Step 1: Delete ErrorOverlay.swift**

```bash
rm packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/ErrorOverlay.swift
```

**Step 2: Delete ConsoleForwarding.js**

```bash
rm packages/react-dom-native/src/devtools/ConsoleForwarding.js
```

**Step 3: Delete ExceptionReporter.js**

```bash
rm packages/react-dom-native/src/devtools/ExceptionReporter.js
```

**Step 4: Remove requires from entry.js**

In `entry.js`, remove lines 22 and 25:
```javascript
// REMOVE: require('./devtools/ConsoleForwarding');
// REMOVE: require('./devtools/ExceptionReporter');
```

**Step 5: Remove $$reportUncaughtException call from JavaScriptCoreEngine.swift**

In `JavaScriptCoreEngine.swift:52-56`, remove the CDP forwarding to the now-deleted JS handler. The exception handler should only call `self?.exceptionHandler?(message, stack)` — the Swift-side LogBox handles CDP forwarding.

Replace lines 46-57:
```swift
context.exceptionHandler = { [weak self] ctx, exception in
    guard let error = exception else { return }
    let message = error.toString() ?? "Unknown JS error"
    let stack = error.objectForKeyedSubscript("stack")?.toString()
    self?.exceptionHandler?(message, stack)
}
```

**Step 6: Commit**

```bash
git rm packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/ErrorOverlay.swift
git rm packages/react-dom-native/src/devtools/ConsoleForwarding.js
git rm packages/react-dom-native/src/devtools/ExceptionReporter.js
git add packages/react-dom-native/src/entry.js
git add packages/react-dom-native/ios/Sources/JSEngine/JavaScriptCoreEngine.swift
git commit -m "Remove ErrorOverlay, ConsoleForwarding, ExceptionReporter — replaced by LogBox"
```

---

### Task 10: Build and Verify

**Step 1: Build the demo app**

Use `/build-demo` to build and run the Falcon demo app. Verify:
- App launches without crashes
- LogBox badge appears when console.error is called
- Tapping badge shows the error list
- Tapping an error shows the detail view
- Dev server errors (introduce a syntax error in a server component) show in LogBox
- "Clear All" removes all entries

**Step 2: Verify CDP forwarding**

- Connect Chrome DevTools to the running app
- Verify `console.log` / `console.error` messages appear in DevTools console
- Verify uncaught exceptions appear in DevTools console

**Step 3: Fix any issues found during testing**

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix LogBox integration issues found during testing"
```
