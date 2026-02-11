import UIKit
import ShadowTree

// ---------------------------------------------------------------------------
// UIKitMutationApplier
//
// Applies mutations produced by the Differentiator to UIKit views. This is
// the iOS app's mutation consumer — it creates UIViews, inserts/removes
// subviews, and updates props and layout frames.
//
// Mutations are applied atomically within a CATransaction to avoid
// flickering or partial rendering.
// ---------------------------------------------------------------------------

class UIKitMutationApplier {

    private let viewRegistry: ViewRegistry

    init(viewRegistry: ViewRegistry) {
        self.viewRegistry = viewRegistry
    }

    // MARK: - Mutation application

    /// Applies an ordered list of mutations to UIKit views atomically within
    /// a CATransaction.
    ///
    /// - Parameters:
    ///   - mutations: The mutations to apply (from `Differentiator.diff()`).
    ///   - rootView: The root UIView of the surface.
    func applyMutations(
        _ mutations: [Mutation],
        rootView: UIView
    ) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        for mutation in mutations {
            switch mutation {
            case .create(let node):
                let view = createView(for: node)
                viewRegistry.register(view: view, family: node.family)

            case .delete(let node):
                viewRegistry.unregister(family: node.family)

            case .insert(let parent, let child, let index):
                guard let parentView = viewRegistry.view(for: parent.family),
                      let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                parentView.insertSubview(childView, at: index)

            case .remove(_, let child):
                guard let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                childView.removeFromSuperview()

            case .update(let node, _, let newProps):
                guard let view = viewRegistry.view(for: node.family) else {
                    continue
                }
                applyProps(newProps, to: view)
                applyLayout(node.layoutFrame, to: view)
            }
        }

        CATransaction.commit()
    }

    // MARK: - View creation

    /// Creates a UIView for the given shadow node type.
    private func createView(for node: ShadowNodeWrapper) -> UIView {
        let type = node.family.elementType

        // TODO: Use a view pool for recycling.
        // TODO: Use HTMLElementRegistry to look up the correct UIView subclass.
        switch type {
        case "div", "section", "article", "nav", "header", "footer", "main", "aside":
            let view = UIView()
            applyProps(node.props, to: view)
            applyLayout(node.layoutFrame, to: view)
            return view

        case "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em",
             "b", "i", "u", "s", "a", "label", "li":
            let label = UILabel()
            label.numberOfLines = 0
            applyProps(node.props, to: label)
            applyLayout(node.layoutFrame, to: label)
            return label

        case "img":
            let imageView = UIImageView()
            imageView.contentMode = .scaleAspectFit
            applyProps(node.props, to: imageView)
            applyLayout(node.layoutFrame, to: imageView)
            return imageView

        case "button":
            let button = UIButton(type: .system)
            applyProps(node.props, to: button)
            applyLayout(node.layoutFrame, to: button)
            return button

        case "input", "textarea":
            let textField = UITextField()
            applyProps(node.props, to: textField)
            applyLayout(node.layoutFrame, to: textField)
            return textField

        default:
            // Unknown type — create a generic UIView and log a warning.
            print("[react-dom-native] Warning: Unknown element type '\(type)', using UIView")
            let view = UIView()
            applyProps(node.props, to: view)
            applyLayout(node.layoutFrame, to: view)
            return view
        }
    }

    // MARK: - Prop application

    /// Applies a props dictionary to a UIView. This is a simplified version;
    /// the full implementation will use HTMLElementRegistry descriptors.
    private func applyProps(_ props: [String: Any], to view: UIView) {
        guard let style = props["style"] as? [String: Any] else { return }

        if let bgColor = style["backgroundColor"] as? String {
            view.backgroundColor = UIColor.fromCSS(bgColor)
        }

        if let opacity = style["opacity"] as? Double {
            view.alpha = CGFloat(opacity)
        }

        if let hidden = style["display"] as? String, hidden == "none" {
            view.isHidden = true
        } else {
            view.isHidden = false
        }

        if let borderRadius = style["borderRadius"] as? Double {
            view.layer.cornerRadius = CGFloat(borderRadius)
            view.clipsToBounds = true
        }
    }

    /// Applies a layout frame to a UIView. Skips NaN/Inf values.
    private func applyLayout(_ frame: CGRect, to view: UIView) {
        guard frame.origin.x.isFinite,
              frame.origin.y.isFinite,
              frame.size.width.isFinite,
              frame.size.height.isFinite else {
            print("[react-dom-native] Warning: Skipping layout with non-finite values: \(frame)")
            return
        }
        view.frame = frame
    }
}

// MARK: - UIColor CSS helper

extension UIColor {
    /// Parses a basic CSS color string. Supports hex (#RRGGBB, #RGB) and
    /// a small set of named colors. This is a placeholder — the full
    /// implementation will support rgb(), rgba(), hsl(), etc.
    static func fromCSS(_ css: String) -> UIColor {
        if css.hasPrefix("#") {
            return fromHex(css)
        }
        switch css.lowercased() {
        case "red": return .red
        case "green": return .green
        case "blue": return .blue
        case "black": return .black
        case "white": return .white
        case "gray", "grey": return .gray
        case "yellow": return .yellow
        case "orange": return .orange
        case "purple": return .purple
        case "cyan": return .cyan
        case "clear", "transparent": return .clear
        default: return .black
        }
    }

    private static func fromHex(_ hex: String) -> UIColor {
        var hexStr = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexStr.hasPrefix("#") {
            hexStr.removeFirst()
        }

        // Expand shorthand (#RGB -> #RRGGBB)
        if hexStr.count == 3 {
            hexStr = hexStr.map { "\($0)\($0)" }.joined()
        }

        guard hexStr.count == 6,
              let value = UInt64(hexStr, radix: 16) else {
            return .black
        }

        let r = CGFloat((value >> 16) & 0xFF) / 255.0
        let g = CGFloat((value >> 8) & 0xFF) / 255.0
        let b = CGFloat(value & 0xFF) / 255.0
        return UIColor(red: r, green: g, blue: b, alpha: 1.0)
    }
}
