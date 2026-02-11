import UIKit

class ErrorOverlay {
    private var overlayWindow: UIWindow?
    private var errorView: ErrorOverlayView?

    static let shared = ErrorOverlay()

    private init() {}

    func show(message: String, stack: String?, file: String?, line: Int?) {
        DispatchQueue.main.async { [weak self] in
            self?.presentOverlay(message: message, stack: stack, file: file, line: line)
        }
    }

    func dismiss() {
        DispatchQueue.main.async { [weak self] in
            self?.overlayWindow?.isHidden = true
            self?.overlayWindow = nil
            self?.errorView = nil
        }
    }

    private func presentOverlay(message: String, stack: String?, file: String?, line: Int?) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }

        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1

        let view = ErrorOverlayView()
        view.configure(message: message, stack: stack, file: file, line: line)
        view.onDismiss = { [weak self] in
            self?.dismiss()
        }

        let vc = UIViewController()
        vc.view = view
        window.rootViewController = vc
        window.isHidden = false

        self.overlayWindow = window
        self.errorView = view
    }
}

class ErrorOverlayView: UIView {
    var onDismiss: (() -> Void)?

    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let stackLabel = UILabel()
    private let fileLabel = UILabel()
    private let dismissButton = UIButton(type: .system)
    private let scrollView = UIScrollView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    func configure(message: String, stack: String?, file: String?, line: Int?) {
        messageLabel.text = message

        if let stack = stack {
            stackLabel.text = stack
            stackLabel.isHidden = false
        } else {
            stackLabel.isHidden = true
        }

        if let file = file {
            var location = file
            if let line = line {
                location += ":\(line)"
            }
            fileLabel.text = location
            fileLabel.isHidden = false
        } else {
            fileLabel.isHidden = true
        }
    }

    private func setupUI() {
        backgroundColor = UIColor(red: 0.8, green: 0.1, blue: 0.1, alpha: 0.95)

        // Title
        titleLabel.text = "JavaScript Error"
        titleLabel.font = .boldSystemFont(ofSize: 20)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Message
        messageLabel.font = .systemFont(ofSize: 16)
        messageLabel.textColor = .white
        messageLabel.numberOfLines = 0
        messageLabel.translatesAutoresizingMaskIntoConstraints = false

        // File location
        fileLabel.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        fileLabel.textColor = UIColor(white: 1, alpha: 0.7)
        fileLabel.numberOfLines = 0
        fileLabel.translatesAutoresizingMaskIntoConstraints = false

        // Stack trace
        stackLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        stackLabel.textColor = UIColor(white: 1, alpha: 0.6)
        stackLabel.numberOfLines = 0
        stackLabel.translatesAutoresizingMaskIntoConstraints = false

        // Dismiss button
        dismissButton.setTitle("Dismiss", for: .normal)
        dismissButton.setTitleColor(.white, for: .normal)
        dismissButton.titleLabel?.font = .boldSystemFont(ofSize: 16)
        dismissButton.backgroundColor = UIColor(white: 0, alpha: 0.3)
        dismissButton.layer.cornerRadius = 8
        dismissButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 20, bottom: 10, right: 20)
        dismissButton.addTarget(self, action: #selector(handleDismiss), for: .touchUpInside)
        dismissButton.translatesAutoresizingMaskIntoConstraints = false

        // Scroll view for long stack traces
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        let contentStack = UIStackView(arrangedSubviews: [
            titleLabel, messageLabel, fileLabel, stackLabel
        ])
        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.translatesAutoresizingMaskIntoConstraints = false

        scrollView.addSubview(contentStack)
        addSubview(scrollView)
        addSubview(dismissButton)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 20),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            scrollView.bottomAnchor.constraint(equalTo: dismissButton.topAnchor, constant: -16),

            contentStack.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentStack.widthAnchor.constraint(equalTo: scrollView.widthAnchor),

            dismissButton.centerXAnchor.constraint(equalTo: centerXAnchor),
            dismissButton.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -20),
        ])

        // Tap anywhere to dismiss
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleDismiss))
        addGestureRecognizer(tapGesture)
    }

    @objc private func handleDismiss() {
        onDismiss?()
    }
}
