import UIKit

// ---------------------------------------------------------------------------
// LogBoxDetailView
//
// Full-screen error detail: message, stack trace, source label, navigation.
// Hydration mismatch errors get a special layout with a scrollable diff.
// ---------------------------------------------------------------------------

class LogBoxDetailView: UIView {
    var onBack: (() -> Void)?
    var onDismissEntry: (() -> Void)?
    var onDismissAll: (() -> Void)?
    var onNavigate: ((Int) -> Void)?  // delta: -1 = prev, +1 = next

    private var entryId: UUID?
    private var currentEntry: LogBoxEntry?
    private let safeAreaFillView = UIView()
    private let headerView = UIView()
    private let sourceLabel = UILabel()
    private let countLabel = UILabel()
    private let scrollView = UIScrollView()
    private let messageLabel = UILabel()
    private let stackLabel = UILabel()
    private let fileLabel = UILabel()
    private let copyButton = UIButton(type: .system)

    // Hydration mismatch diff block
    private let diffTitleLabel = UILabel()
    private let diffContainer = UIView()
    private let diffScrollView = UIScrollView()
    private let diffLabel = UILabel()
    private var diffHeightConstraint: NSLayoutConstraint?

    private let contentStack = UIStackView()

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
        currentEntry = entry

        countLabel.text = "\(index + 1) of \(total)"

        let isHydrationMismatch = entry.message.contains("hydration-mismatch")
            || entry.message.contains("hydrated but some attributes")

        if isHydrationMismatch {
            configureHydrationMismatch(entry: entry)
        } else {
            configureDefault(entry: entry)
        }

        scrollView.setContentOffset(.zero, animated: false)
    }

    // MARK: - Default Configuration

    private func configureDefault(entry: LogBoxEntry) {
        // Restore standard order: fileLabel, messageLabel, diffTitleLabel, diffContainer, stackLabel
        contentStack.removeArrangedSubview(diffTitleLabel)
        contentStack.removeArrangedSubview(diffContainer)
        contentStack.insertArrangedSubview(diffTitleLabel, at: 2)
        contentStack.insertArrangedSubview(diffContainer, at: 3)

        let headerColor: UIColor
        switch entry.level {
        case .fatalError, .error:
            headerColor = UIColor(red: 1.0, green: 0.4, blue: 0.4, alpha: 1)
        case .warning:
            headerColor = UIColor(red: 1.0, green: 0.8, blue: 0.0, alpha: 1)
        }
        headerView.backgroundColor = headerColor
        safeAreaFillView.backgroundColor = headerColor

        sourceLabel.text = entry.source.rawValue
        messageLabel.attributedText = nil
        messageLabel.text = entry.message
        messageLabel.font = UIFont(name: "Menlo-Regular", size: 15)
            ?? .monospacedSystemFont(ofSize: 15, weight: .regular)

        diffContainer.isHidden = true
        diffTitleLabel.isHidden = true

        if let stack = entry.stack, !stack.isEmpty {
            stackLabel.attributedText = formatStack(stack)
            stackLabel.isHidden = false
        } else {
            stackLabel.isHidden = true
        }

        if let file = entry.file {
            var location = file
            if let line = entry.line { location += ":\(line)" }
            fileLabel.text = location
            fileLabel.isHidden = false
        } else {
            fileLabel.isHidden = true
        }
    }

    // MARK: - Hydration Mismatch Configuration

    private func configureHydrationMismatch(entry: LogBoxEntry) {
        // Move diff title + diff before message for hydration mismatch layout
        contentStack.removeArrangedSubview(diffTitleLabel)
        contentStack.removeArrangedSubview(diffContainer)
        contentStack.insertArrangedSubview(diffTitleLabel, at: 1)
        contentStack.insertArrangedSubview(diffContainer, at: 2)

        let headerColor = UIColor(red: 1.0, green: 0.6, blue: 0.2, alpha: 1)
        headerView.backgroundColor = headerColor
        safeAreaFillView.backgroundColor = headerColor

        sourceLabel.text = "Mismatch"
        fileLabel.isHidden = true

        // Extract just the diff from the message
        let diff = extractDiff(entry.message)

        // Hardcoded link
        let linkColor = UIColor(red: 0.4, green: 0.7, blue: 1.0, alpha: 1)
        messageLabel.attributedText = NSAttributedString(
            string: "https://react.dev/link/hydration-mismatch",
            attributes: [
                .font: UIFont.systemFont(ofSize: 15),
                .foregroundColor: linkColor,
            ])

        if let diff = diff, !diff.isEmpty {
            diffLabel.attributedText = formatDiff(diff)
            let textSize = diffLabel.sizeThatFits(CGSize(
                width: CGFloat.greatestFiniteMagnitude,
                height: CGFloat.greatestFiniteMagnitude))
            diffLabel.frame = CGRect(origin: .zero, size: textSize)
            diffScrollView.contentSize = textSize
            diffHeightConstraint?.constant = min(textSize.height + 24, 400)
            diffTitleLabel.isHidden = false
            diffContainer.isHidden = false
        } else {
            diffTitleLabel.isHidden = true
            diffContainer.isHidden = true
        }

        if let stack = entry.stack, !stack.isEmpty {
            stackLabel.attributedText = formatStack(stack)
            stackLabel.isHidden = false
        } else {
            stackLabel.isHidden = true
        }
    }

    /// Extracts the component tree diff from a hydration mismatch message.
    /// The diff starts at the first line containing `<` after the URL.
    private func extractDiff(_ message: String) -> String? {
        let lines = message.components(separatedBy: "\n")
        var diffLines: [String] = []
        var inDiff = false
        var pastURL = false

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if inDiff {
                diffLines.append(line)
            } else if pastURL && (trimmed.hasPrefix("<") || trimmed.hasPrefix("+") || trimmed.hasPrefix("-") || trimmed == "...") {
                inDiff = true
                diffLines.append(line)
            } else if trimmed.hasPrefix("https://") {
                pastURL = true
            }
        }

        return diffLines.isEmpty ? nil : diffLines.joined(separator: "\n")
    }

    /// Formats a component tree diff with colored +/- lines.
    private func formatDiff(_ diff: String) -> NSAttributedString {
        let font = UIFont(name: "Menlo-Regular", size: 13) ?? .monospacedSystemFont(ofSize: 13, weight: .regular)
        let defaultColor = UIColor(white: 1, alpha: 0.7)
        let addColor = UIColor(red: 0.4, green: 0.9, blue: 0.4, alpha: 1)
        let removeColor = UIColor(red: 1.0, green: 0.4, blue: 0.4, alpha: 1)

        let result = NSMutableAttributedString()
        let lines = diff.components(separatedBy: "\n")

        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let color: UIColor
            if trimmed.hasPrefix("+") {
                color = addColor
            } else if trimmed.hasPrefix("-") {
                color = removeColor
            } else {
                color = defaultColor
            }
            result.append(NSAttributedString(string: line, attributes: [
                .font: font, .foregroundColor: color,
            ]))
            if i < lines.count - 1 {
                result.append(NSAttributedString(string: "\n"))
            }
        }
        return result
    }

    // MARK: - Setup

    private func setupUI() {
        backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.13, alpha: 1.0)

        // Safe area fill — extends header color behind the status bar
        safeAreaFillView.backgroundColor = UIColor(red: 0.9, green: 0.2, blue: 0.2, alpha: 1)
        safeAreaFillView.translatesAutoresizingMaskIntoConstraints = false

        // Header bar
        headerView.backgroundColor = UIColor(red: 0.9, green: 0.2, blue: 0.2, alpha: 1)
        headerView.translatesAutoresizingMaskIntoConstraints = false

        let backButton = UIButton(type: .system)
        backButton.setImage(UIImage(systemName: "chevron.backward"), for: .normal)
        backButton.tintColor = .white
        backButton.addTarget(self, action: #selector(handleBack), for: .touchUpInside)
        backButton.translatesAutoresizingMaskIntoConstraints = false

        sourceLabel.font = .boldSystemFont(ofSize: 16)
        sourceLabel.textColor = .white
        sourceLabel.translatesAutoresizingMaskIntoConstraints = false

        countLabel.font = .systemFont(ofSize: 13)
        countLabel.textColor = UIColor(white: 1, alpha: 0.7)
        countLabel.translatesAutoresizingMaskIntoConstraints = false

        let prevButton = UIButton(type: .system)
        prevButton.setImage(UIImage(systemName: "chevron.up"), for: .normal)
        prevButton.tintColor = .white
        prevButton.addTarget(self, action: #selector(handlePrev), for: .touchUpInside)
        prevButton.translatesAutoresizingMaskIntoConstraints = false

        let nextButton = UIButton(type: .system)
        nextButton.setImage(UIImage(systemName: "chevron.down"), for: .normal)
        nextButton.tintColor = .white
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
            backButton.widthAnchor.constraint(equalToConstant: 44),
            backButton.heightAnchor.constraint(equalToConstant: 44),
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

        fileLabel.font = UIFont(name: "Menlo-Bold", size: 13) ?? .monospacedSystemFont(ofSize: 13, weight: .medium)
        fileLabel.textColor = UIColor(red: 0.6, green: 0.8, blue: 1.0, alpha: 1)
        fileLabel.numberOfLines = 0
        fileLabel.translatesAutoresizingMaskIntoConstraints = false

        messageLabel.font = UIFont(name: "Menlo-Regular", size: 15) ?? .monospacedSystemFont(ofSize: 15, weight: .regular)
        messageLabel.textColor = .white
        messageLabel.numberOfLines = 0
        messageLabel.translatesAutoresizingMaskIntoConstraints = false

        // Diff code block — UIScrollView with UILabel for horizontal scrolling
        diffTitleLabel.text = "Hydration Mismatch"
        diffTitleLabel.font = .boldSystemFont(ofSize: 15)
        diffTitleLabel.textColor = .white
        diffTitleLabel.translatesAutoresizingMaskIntoConstraints = false
        diffTitleLabel.isHidden = true

        diffContainer.backgroundColor = UIColor(white: 0, alpha: 0.3)
        diffContainer.layer.cornerRadius = 8
        diffContainer.clipsToBounds = true
        diffContainer.translatesAutoresizingMaskIntoConstraints = false
        diffContainer.isHidden = true

        diffScrollView.showsHorizontalScrollIndicator = true
        diffScrollView.showsVerticalScrollIndicator = false
        diffScrollView.translatesAutoresizingMaskIntoConstraints = false

        diffLabel.numberOfLines = 0

        diffContainer.addSubview(diffScrollView)
        diffScrollView.addSubview(diffLabel)

        let heightConstraint = diffContainer.heightAnchor.constraint(equalToConstant: 200)
        diffHeightConstraint = heightConstraint

        NSLayoutConstraint.activate([
            diffScrollView.topAnchor.constraint(equalTo: diffContainer.topAnchor, constant: 12),
            diffScrollView.leadingAnchor.constraint(equalTo: diffContainer.leadingAnchor, constant: 12),
            diffScrollView.trailingAnchor.constraint(equalTo: diffContainer.trailingAnchor, constant: -12),
            diffScrollView.bottomAnchor.constraint(equalTo: diffContainer.bottomAnchor, constant: -12),
            heightConstraint,
        ])

        stackLabel.font = UIFont(name: "Menlo-Regular", size: 12) ?? .monospacedSystemFont(ofSize: 12, weight: .regular)
        stackLabel.textColor = UIColor(white: 1, alpha: 0.6)
        stackLabel.numberOfLines = 0
        stackLabel.translatesAutoresizingMaskIntoConstraints = false

        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        contentStack.addArrangedSubview(fileLabel)
        contentStack.addArrangedSubview(messageLabel)
        contentStack.addArrangedSubview(diffTitleLabel)
        contentStack.addArrangedSubview(diffContainer)
        contentStack.addArrangedSubview(stackLabel)

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

        copyButton.setTitle("Copy", for: .normal)
        copyButton.setTitleColor(.white, for: .normal)
        copyButton.titleLabel?.font = .boldSystemFont(ofSize: 16)
        copyButton.backgroundColor = UIColor(white: 1, alpha: 0.15)
        copyButton.layer.cornerRadius = 8
        copyButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 20, bottom: 10, right: 20)
        copyButton.addTarget(self, action: #selector(handleCopy), for: .touchUpInside)
        copyButton.translatesAutoresizingMaskIntoConstraints = false

        let dismissAllButton = UIButton(type: .system)
        dismissAllButton.setTitle("Dismiss All", for: .normal)
        dismissAllButton.setTitleColor(UIColor(white: 1, alpha: 0.6), for: .normal)
        dismissAllButton.titleLabel?.font = .systemFont(ofSize: 14)
        dismissAllButton.addTarget(self, action: #selector(handleDismissAll), for: .touchUpInside)
        dismissAllButton.translatesAutoresizingMaskIntoConstraints = false

        let footerStack = UIStackView(arrangedSubviews: [copyButton, dismissButton, dismissAllButton])
        footerStack.axis = .horizontal
        footerStack.spacing = 16
        footerStack.alignment = .center
        footerStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(safeAreaFillView)
        addSubview(headerView)
        addSubview(scrollView)
        addSubview(footerStack)

        NSLayoutConstraint.activate([
            safeAreaFillView.topAnchor.constraint(equalTo: topAnchor),
            safeAreaFillView.leadingAnchor.constraint(equalTo: leadingAnchor),
            safeAreaFillView.trailingAnchor.constraint(equalTo: trailingAnchor),
            safeAreaFillView.bottomAnchor.constraint(equalTo: headerView.bottomAnchor),

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

    // MARK: - Stack Formatting

    /// Parses JSC stack trace lines ("func@http://host/file.js:line:col")
    /// into two-line format: function name, then indented file location.
    private func formatStack(_ stack: String) -> NSAttributedString {
        let lines = stack.components(separatedBy: "\n")
        let nameFont = UIFont(name: "Menlo-Regular", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        let locFont = UIFont(name: "Menlo-Regular", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        let nameColor = UIColor(white: 1, alpha: 0.85)
        let locColor = UIColor(white: 1, alpha: 0.5)

        struct Frame {
            let name: String
            let location: String
        }

        var frames: [Frame] = []
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { continue }

            let parts = trimmed.components(separatedBy: "@")
            let name: String
            var rawLocation: String
            if parts.count >= 2 {
                name = parts[0].isEmpty ? "(anonymous)" : parts[0]
                rawLocation = parts.dropFirst().joined(separator: "@")
            } else {
                name = trimmed
                rawLocation = ""
            }

            var location = rawLocation
            if let schemeRange = location.range(of: "://") {
                let afterScheme = String(location[schemeRange.upperBound...])
                if let slashIndex = afterScheme.firstIndex(of: "/") {
                    location = String(afterScheme[afterScheme.index(after: slashIndex)...])
                } else {
                    location = afterScheme
                }
            }
            if let lastColon = location.lastIndex(of: ":") {
                let afterColon = location[location.index(after: lastColon)...]
                if afterColon.allSatisfy(\.isNumber),
                   let secondLastColon = location[..<lastColon].lastIndex(of: ":") {
                    let betweenColons = location[location.index(after: secondLastColon)..<lastColon]
                    if betweenColons.allSatisfy(\.isNumber) {
                        location = String(location[..<lastColon])
                    }
                }
            }

            frames.append(Frame(name: name, location: location))
        }

        guard !frames.isEmpty else {
            return NSAttributedString(string: stack, attributes: [
                .font: nameFont, .foregroundColor: nameColor,
            ])
        }

        let result = NSMutableAttributedString()
        for (i, frame) in frames.enumerated() {
            result.append(NSAttributedString(string: frame.name, attributes: [
                .font: nameFont, .foregroundColor: nameColor,
            ]))
            if !frame.location.isEmpty {
                result.append(NSAttributedString(string: "\n  " + frame.location, attributes: [
                    .font: locFont, .foregroundColor: locColor,
                ]))
            }

            if i < frames.count - 1 {
                result.append(NSAttributedString(string: "\n"))
            }
        }
        return result
    }

    // MARK: - Actions

    @objc private func handleBack() { onBack?() }
    @objc private func handlePrev() { onNavigate?(-1) }
    @objc private func handleNext() { onNavigate?(1) }
    @objc private func handleCopy() {
        guard let entry = currentEntry else { return }
        var text = "\(entry.source.rawValue)\n"
        if let file = entry.file {
            text += file
            if let line = entry.line { text += ":\(line)" }
            text += "\n"
        }
        text += "\n\(entry.message)"
        if let stack = entry.stack, !stack.isEmpty {
            text += "\n\n\(stack)"
        }
        UIPasteboard.general.string = text

        let original = copyButton.titleLabel?.text
        copyButton.setTitle("Copied!", for: .normal)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.copyButton.setTitle(original, for: .normal)
        }
    }
    @objc private func handleDismissEntry() {
        onDismissEntry?()
    }
    @objc private func handleDismissAll() { onDismissAll?() }
}
