import UIKit

/// Recycles UIViews to avoid repeated allocation/deallocation.
/// Keyed by element type so views are only reused for the same element.
final class ViewPool {
    private var pools: [String: [UIView]] = [:]
    private let maxPerType = 20

    func dequeue(elementType: String) -> UIView? {
        return pools[elementType]?.popLast()
    }

    func recycle(view: UIView, elementType: String) {
        // Reset common state (caller is responsible for removeFromSuperview)
        view.layer.sublayers?.filter { $0.name == "__border_edge__" || $0.name == "__corner_mask__" || $0.name == "__bg_layer__" }
            .forEach { $0.removeFromSuperlayer() }
        view.layer.mask = nil
        view.layer.cornerRadius = 0
        view.layer.borderWidth = 0
        view.layer.borderColor = nil
        view.alpha = 1
        view.isHidden = false
        view.transform = .identity
        view.backgroundColor = nil
        view.isOpaque = false
        view.clipsToBounds = false

        if let label = view as? UILabel {
            label.text = nil
            label.attributedText = nil
            label.font = UIFont.systemFont(ofSize: 16)
            label.textColor = .black
            label.textAlignment = .natural
            label.numberOfLines = 0
            label.lineBreakMode = .byWordWrapping
        }

        if let scrollView = view as? UIScrollView {
            scrollView.contentSize = .zero
            scrollView.contentOffset = .zero
        }

        var pool = pools[elementType, default: []]
        guard pool.count < maxPerType else { return }
        pool.append(view)
        pools[elementType] = pool
    }
}
