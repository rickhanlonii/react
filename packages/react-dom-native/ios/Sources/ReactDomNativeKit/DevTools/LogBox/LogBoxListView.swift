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
    private let safeAreaFillView = UIView()

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

        let headerColor = UIColor(red: 0.17, green: 0.17, blue: 0.18, alpha: 1.0)

        // Safe area fill — extends header color behind the status bar
        safeAreaFillView.backgroundColor = headerColor
        safeAreaFillView.translatesAutoresizingMaskIntoConstraints = false

        // Header
        headerView.backgroundColor = headerColor

        let titleLabel = UILabel()
        titleLabel.text = "Errors"
        titleLabel.font = .boldSystemFont(ofSize: 20)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let closeButton = UIButton(type: .system)
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = .white
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

        addSubview(safeAreaFillView)
        addSubview(headerView)
        addSubview(tableView)

        NSLayoutConstraint.activate([
            safeAreaFillView.topAnchor.constraint(equalTo: topAnchor),
            safeAreaFillView.leadingAnchor.constraint(equalTo: leadingAnchor),
            safeAreaFillView.trailingAnchor.constraint(equalTo: trailingAnchor),
            safeAreaFillView.bottomAnchor.constraint(equalTo: headerView.bottomAnchor),

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
        case .fatalError, .error:
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

        messageLabel.font = UIFont(name: "Menlo-Regular", size: 14) ?? .monospacedSystemFont(ofSize: 14, weight: .regular)
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
