#if DEBUG
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
#endif
