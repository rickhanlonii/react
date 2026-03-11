import SwiftUI
import WebKit

enum ComparisonMode: String, CaseIterable {
    case split = "Split"
    case diff = "Diff"
    case overlay = "Overlay"
}

struct OverlayComparisonView: UIViewRepresentable {
    var webView: WKWebView
    var nativeScrollView: UIScrollView
    var mode: ComparisonMode
    var overlayOpacity: Double

    func makeUIView(context: Context) -> OverlayContainerView {
        let container = OverlayContainerView()
        container.addSubview(webView)
        container.addSubview(nativeScrollView)
        container.webView = webView
        container.nativeView = nativeScrollView
        return container
    }

    func updateUIView(_ container: OverlayContainerView, context: Context) {
        container.currentMode = mode
        container.overlayOpacity = overlayOpacity
        container.setNeedsLayout()
    }
}

class OverlayContainerView: UIView {
    weak var webView: UIView?
    weak var nativeView: UIView?
    var currentMode: ComparisonMode = .split
    var overlayOpacity: Double = 0.5

    private let webLabel = UILabel()
    private let nativeLabel = UILabel()
    private let divider = UIView()

    override init(frame: CGRect) {
        super.init(frame: frame)

        webLabel.text = "Web (react-dom)"
        webLabel.font = .preferredFont(forTextStyle: .caption1)
        webLabel.textColor = .secondaryLabel
        webLabel.textAlignment = .center
        addSubview(webLabel)

        nativeLabel.text = "Native (react-dom-native)"
        nativeLabel.font = .preferredFont(forTextStyle: .caption1)
        nativeLabel.textColor = .secondaryLabel
        nativeLabel.textAlignment = .center
        addSubview(nativeLabel)

        divider.backgroundColor = .separator
        addSubview(divider)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let webView = webView, let nativeView = nativeView else { return }

        let labelHeight: CGFloat = 20
        let dividerHeight: CGFloat = 1.0 / UIScreen.main.scale

        switch currentMode {
        case .split:
            webLabel.isHidden = false
            nativeLabel.isHidden = false
            divider.isHidden = false

            let availableHeight = bounds.height - labelHeight * 2 - dividerHeight
            let halfHeight = availableHeight / 2

            webLabel.frame = CGRect(x: 0, y: 0, width: bounds.width, height: labelHeight)
            webView.frame = CGRect(x: 0, y: labelHeight, width: bounds.width, height: halfHeight)
            divider.frame = CGRect(x: 0, y: labelHeight + halfHeight, width: bounds.width, height: dividerHeight)
            nativeLabel.frame = CGRect(x: 0, y: labelHeight + halfHeight + dividerHeight, width: bounds.width, height: labelHeight)
            nativeView.frame = CGRect(x: 0, y: labelHeight * 2 + halfHeight + dividerHeight, width: bounds.width, height: halfHeight)

            webView.alpha = 1.0
            nativeView.alpha = 1.0
            nativeView.layer.compositingFilter = nil

        case .diff:
            webLabel.isHidden = true
            nativeLabel.isHidden = true
            divider.isHidden = true

            webView.frame = bounds
            nativeView.frame = bounds

            webView.alpha = 1.0
            nativeView.alpha = 1.0
            nativeView.layer.compositingFilter = "differenceBlendMode"

        case .overlay:
            webLabel.isHidden = true
            nativeLabel.isHidden = true
            divider.isHidden = true

            webView.frame = bounds
            nativeView.frame = bounds

            webView.alpha = 1.0
            nativeView.alpha = CGFloat(overlayOpacity)
            nativeView.layer.compositingFilter = nil
        }
    }
}
