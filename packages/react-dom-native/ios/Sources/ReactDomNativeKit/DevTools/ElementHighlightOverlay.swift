import UIKit
import Yoga
import ShadowTree

// ---------------------------------------------------------------------------
// ElementHighlightOverlay
//
// Draws a Chrome DevTools-style box model overlay on top of a UIView.
// Shows content (blue), padding (green), border (yellow), and margin (orange)
// regions with translucent fills. Only one highlight is active at a time.
// ---------------------------------------------------------------------------

class ElementHighlightOverlay {

    private weak var rootView: UIView?
    private var overlayView: UIView?

    init(rootView: UIView?) {
        self.rootView = rootView
    }

    func highlight(node: ShadowNodeWrapper, view: UIView) {
        hide()

        guard let rootView = rootView else { return }

        let yoga = node.yogaNode

        // Read box model values from Yoga layout
        let marginTop = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .top)))
        let marginRight = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .right)))
        let marginBottom = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .bottom)))
        let marginLeft = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .left)))

        let borderTop = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .top)))
        let borderRight = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .right)))
        let borderBottom = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .bottom)))
        let borderLeft = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .left)))

        let paddingTop = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .top)))
        let paddingRight = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .right)))
        let paddingBottom = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .bottom)))
        let paddingLeft = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .left)))

        // Convert view frame to root view coordinates
        let viewFrame = view.convert(view.bounds, to: rootView)

        // Calculate regions (margin is outside the view frame)
        let marginRect = CGRect(
            x: viewFrame.origin.x - marginLeft,
            y: viewFrame.origin.y - marginTop,
            width: viewFrame.width + marginLeft + marginRight,
            height: viewFrame.height + marginTop + marginBottom
        )

        let borderRect = viewFrame

        let paddingRect = CGRect(
            x: viewFrame.origin.x + borderLeft,
            y: viewFrame.origin.y + borderTop,
            width: viewFrame.width - borderLeft - borderRight,
            height: viewFrame.height - borderTop - borderBottom
        )

        let contentRect = CGRect(
            x: paddingRect.origin.x + paddingLeft,
            y: paddingRect.origin.y + paddingTop,
            width: paddingRect.width - paddingLeft - paddingRight,
            height: paddingRect.height - paddingTop - paddingBottom
        )

        // Create overlay
        let overlay = HighlightView(frame: marginRect)
        overlay.marginRect = CGRect(origin: .zero, size: marginRect.size)
        overlay.borderRect = borderRect.offsetBy(dx: -marginRect.origin.x, dy: -marginRect.origin.y)
        overlay.paddingRect = paddingRect.offsetBy(dx: -marginRect.origin.x, dy: -marginRect.origin.y)
        overlay.contentRect = contentRect.offsetBy(dx: -marginRect.origin.x, dy: -marginRect.origin.y)
        overlay.isUserInteractionEnabled = false
        overlay.backgroundColor = .clear

        rootView.addSubview(overlay)
        self.overlayView = overlay
    }

    func hide() {
        overlayView?.removeFromSuperview()
        overlayView = nil
    }

    private func nanToZero(_ value: Float) -> Float {
        return value.isNaN ? 0 : value
    }
}

// MARK: - HighlightView

private class HighlightView: UIView {
    var marginRect: CGRect = .zero
    var borderRect: CGRect = .zero
    var paddingRect: CGRect = .zero
    var contentRect: CGRect = .zero

    // Chrome DevTools highlight colors
    private let marginColor = UIColor(red: 246/255, green: 178/255, blue: 107/255, alpha: 0.66)
    private let borderColor = UIColor(red: 255/255, green: 229/255, blue: 153/255, alpha: 0.66)
    private let paddingColor = UIColor(red: 147/255, green: 196/255, blue: 125/255, alpha: 0.55)
    private let contentColor = UIColor(red: 111/255, green: 168/255, blue: 220/255, alpha: 0.66)

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Margin (outermost) — fill the whole rect, then paint over with inner regions
        ctx.setFillColor(marginColor.cgColor)
        ctx.fill(marginRect)

        // Border
        ctx.setFillColor(borderColor.cgColor)
        ctx.fill(borderRect)

        // Padding
        ctx.setFillColor(paddingColor.cgColor)
        ctx.fill(paddingRect)

        // Content (innermost)
        ctx.setFillColor(contentColor.cgColor)
        ctx.fill(contentRect)
    }
}
