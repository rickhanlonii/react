import UIKit

public class ReloadBanner {
    private var bannerWindow: UIWindow?
    private var bannerView: ReloadBannerView?
    private var showTime: Date?
    private var dismissRequested: Bool = false

    /// Minimum time the banner stays visible so it doesn't flash.
    private let minimumDisplayDuration: TimeInterval = 0.3

    public static let shared = ReloadBanner()

    private init() {}

    public func show() {
        DispatchQueue.main.async { [weak self] in
            self?.presentBanner()
        }
    }

    public func dismiss() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.bannerWindow != nil else { return }

            let elapsed = Date().timeIntervalSince(self.showTime ?? .distantPast)
            let remaining = self.minimumDisplayDuration - elapsed

            if remaining > 0 {
                // Wait until minimum duration has passed
                self.dismissRequested = true
                DispatchQueue.main.asyncAfter(deadline: .now() + remaining) { [weak self] in
                    self?.performDismiss()
                }
            } else {
                self.performDismiss()
            }
        }
    }

    private func performDismiss() {
        guard let window = bannerWindow, let banner = bannerView else { return }
        self.dismissRequested = false

        // Slide up + fade out
        UIView.animate(withDuration: 0.25, delay: 0, options: .curveEaseIn, animations: {
            banner.transform = CGAffineTransform(translationX: 0, y: -20)
            window.alpha = 0
        }, completion: { _ in
            window.isHidden = true
            self.bannerWindow = nil
            self.bannerView = nil
            self.showTime = nil
        })
    }

    private func presentBanner() {
        // If already showing, no-op (but cancel any pending dismiss)
        if bannerWindow != nil {
            dismissRequested = false
            return
        }

        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }

        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.isUserInteractionEnabled = false

        let vc = UIViewController()
        vc.view.backgroundColor = .clear

        let banner = ReloadBannerView()
        banner.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(banner)

        NSLayoutConstraint.activate([
            banner.topAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.topAnchor, constant: 8),
            banner.centerXAnchor.constraint(equalTo: vc.view.centerXAnchor),
        ])

        window.rootViewController = vc
        window.alpha = 0
        window.isHidden = false

        // Start off-screen (above) for slide-in
        banner.transform = CGAffineTransform(translationX: 0, y: -20)

        self.bannerWindow = window
        self.bannerView = banner
        self.showTime = Date()
        self.dismissRequested = false

        // Slide down + fade in
        UIView.animate(withDuration: 0.3, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0, options: [], animations: {
            window.alpha = 1
            banner.transform = .identity
        })
    }
}

private class ReloadBannerView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        backgroundColor = UIColor(red: 0.0, green: 0.48, blue: 1.0, alpha: 0.92)
        layer.cornerRadius = 10

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = .white
        spinner.startAnimating()
        spinner.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = "Reloading..."
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.textColor = .white
        label.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .horizontal
        stack.spacing = 8
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ])
    }
}
