import UIKit
import ShadowTree

// ---------------------------------------------------------------------------
// UIKitMutationApplier
//
// Applies mutations produced by the Differentiator to UIViews. This is
// the production equivalent of StubMutationApplier in the test harness.
// ---------------------------------------------------------------------------

public typealias EventDispatcher = (UIView, String, [String: Any]) -> Void

public class UIKitMutationApplier: NSObject {

    private let viewRegistry: ViewRegistry
    public var dispatchEvent: EventDispatcher?

    public init(viewRegistry: ViewRegistry) {
        self.viewRegistry = viewRegistry
    }

    // MARK: - Mutation application

    /// Applies an ordered list of mutations to UIViews.
    ///
    /// - Parameters:
    ///   - mutations: The mutations to apply (from `Differentiator.diff()`).
    ///   - rootView: The root UIView of the surface.
    public func applyMutations(
        _ mutations: [Mutation],
        rootView: UIView
    ) {
        print("[MutationApplier] Applying \(mutations.count) mutations")

        for (index, mutation) in mutations.enumerated() {
            switch mutation {
            case .create(let node):
                print("[MutationApplier] [\(index)] CREATE: \(node.family.elementType)")
                let view = createView(for: node)
                view.frame = node.layoutFrame
                print("[MutationApplier]   frame: \(view.frame)")
                viewRegistry.register(view: view, family: node.family)

            case .delete(let node):
                print("[MutationApplier] [\(index)] DELETE: \(node.family.elementType)")
                if let view = viewRegistry.view(for: node.family) {
                    view.removeFromSuperview()
                }
                viewRegistry.unregister(family: node.family)

            case .insert(let parent, let child, let index):
                print("[MutationApplier] [\(index)] INSERT: \(child.family.elementType) into \(parent.family.elementType) at \(index)")
                guard let parentView = viewRegistry.view(for: parent.family),
                      let childView = viewRegistry.view(for: child.family) else {
                    print("[MutationApplier]   SKIPPED - parent or child view not found")
                    continue
                }
                // Inherit font properties from parent text elements to #text children
                if child.family.elementType == "#text", let childLabel = childView as? UILabel {
                    applyInheritedTextStyle(to: childLabel, parentType: parent.family.elementType, parentProps: parent.props)
                }
                let clampedIndex = min(index, parentView.subviews.count)
                parentView.insertSubview(childView, at: clampedIndex)
                print("[MutationApplier]   inserted OK")

            case .remove(let parent, let child):
                print("[MutationApplier] [\(index)] REMOVE: \(child.family.elementType)")
                guard let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                childView.removeFromSuperview()

            case .update(let node, _, let newProps):
                print("[MutationApplier] [\(index)] UPDATE: \(node.family.elementType)")
                guard let view = viewRegistry.view(for: node.family) else {
                    continue
                }
                updateView(view, elementType: node.family.elementType, props: newProps)
                view.frame = node.layoutFrame
            }
        }

        print("[MutationApplier] Done. Root view subviews: \(rootView.subviews.count)")
    }

    // MARK: - View Factory

    /// Creates a UIView for the given shadow node based on its element type.
    private func createView(for node: ShadowNodeWrapper) -> UIView {
        let elementType = node.family.elementType
        let props = node.props

        switch elementType {
        case "div":
            let view = UIView()
            applyCommonProps(to: view, props: props)
            return view

        case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6":
            let label = UILabel()
            label.numberOfLines = 0
            applyTextProps(to: label, props: props, elementType: elementType)
            applyCommonProps(to: label, props: props)
            return label

        case "button":
            let button = UIButton(type: .system)
            applyButtonProps(to: button, props: props)
            applyCommonProps(to: button, props: props)
            button.addTarget(self, action: #selector(handleButtonTap(_:)), for: .touchUpInside)
            return button

        case "input":
            let textField = UITextField()
            applyInputProps(to: textField, props: props)
            applyCommonProps(to: textField, props: props)
            textField.addTarget(self, action: #selector(handleTextFieldChanged(_:)), for: .editingChanged)
            return textField

        case "img":
            let imageView = UIImageView()
            applyImageProps(to: imageView, props: props)
            applyCommonProps(to: imageView, props: props)
            return imageView

        case "#text":
            // Text node - create a label with the text content
            let label = UILabel()
            label.numberOfLines = 0
            if let text = node.text {
                label.text = text
            }
            label.font = UIFont.systemFont(ofSize: 16)
            label.textColor = .black
            return label

        default:
            // Fallback to a plain view
            let view = UIView()
            applyCommonProps(to: view, props: props)
            return view
        }
    }

    /// Updates an existing view with new props.
    private func updateView(_ view: UIView, elementType: String, props: [String: Any]) {
        applyCommonProps(to: view, props: props)

        switch elementType {
        case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6":
            if let label = view as? UILabel {
                applyTextProps(to: label, props: props, elementType: elementType)
            }
        case "button":
            if let button = view as? UIButton {
                applyButtonProps(to: button, props: props)
            }
        case "input":
            if let textField = view as? UITextField {
                applyInputProps(to: textField, props: props)
            }
        case "img":
            if let imageView = view as? UIImageView {
                applyImageProps(to: imageView, props: props)
            }
        default:
            break
        }
    }

    // MARK: - Prop Appliers

    private func applyCommonProps(to view: UIView, props: [String: Any]) {
        // Background color from style
        if let style = props["style"] as? [String: Any] {
            if let bgColor = style["backgroundColor"] as? String {
                view.backgroundColor = parseColor(bgColor)
            }
            // Border properties via CALayer
            if let borderWidth = style["borderWidth"] as? NSNumber {
                view.layer.borderWidth = CGFloat(borderWidth.doubleValue)
            }
            if let borderColor = style["borderColor"] as? String {
                view.layer.borderColor = parseColor(borderColor).cgColor
            }
            if let borderRadius = style["borderRadius"] as? NSNumber {
                view.layer.cornerRadius = CGFloat(borderRadius.doubleValue)
                view.clipsToBounds = true
            }
        }
    }

    private func applyTextProps(to label: UILabel, props: [String: Any], elementType: String) {
        // Set text from children
        if let children = props["children"] as? String {
            label.text = children
        }

        // Text color from style
        if let style = props["style"] as? [String: Any] {
            if let color = style["color"] as? String {
                label.textColor = parseColor(color)
            }
            if let fontSize = style["fontSize"] as? NSNumber {
                label.font = UIFont.systemFont(ofSize: CGFloat(fontSize.doubleValue))
            }
        }

        // Heading sizes
        switch elementType {
        case "h1":
            label.font = UIFont.boldSystemFont(ofSize: 32)
        case "h2":
            label.font = UIFont.boldSystemFont(ofSize: 24)
        case "h3":
            label.font = UIFont.boldSystemFont(ofSize: 20)
        default:
            break
        }
    }

    private func applyButtonProps(to button: UIButton, props: [String: Any]) {
        // Button title from children
        if let children = props["children"] as? String {
            button.setTitle(children, for: .normal)
        }
    }

    private func applyInputProps(to textField: UITextField, props: [String: Any]) {
        if let placeholder = props["placeholder"] as? String {
            textField.placeholder = placeholder
        }
        if let value = props["value"] as? String {
            textField.text = value
        }
        textField.borderStyle = .roundedRect
    }

    private func applyImageProps(to imageView: UIImageView, props: [String: Any]) {
        if let src = props["src"] as? String, let url = URL(string: src) {
            // Simple async image loading
            URLSession.shared.dataTask(with: url) { data, _, _ in
                if let data = data, let image = UIImage(data: data) {
                    DispatchQueue.main.async {
                        imageView.image = image
                    }
                }
            }.resume()
        }
        imageView.contentMode = .scaleAspectFit
    }

    /// Applies inherited text styling from a parent text element to a #text child label.
    /// In CSS, text nodes inherit font-size, font-weight, and color from their parent element.
    private func applyInheritedTextStyle(to label: UILabel, parentType: String, parentProps: [String: Any]) {
        // Heading defaults (bold + specific sizes)
        switch parentType {
        case "h1":
            label.font = UIFont.boldSystemFont(ofSize: 32)
        case "h2":
            label.font = UIFont.boldSystemFont(ofSize: 24)
        case "h3":
            label.font = UIFont.boldSystemFont(ofSize: 20)
        case "h4":
            label.font = UIFont.boldSystemFont(ofSize: 16)
        case "h5":
            label.font = UIFont.boldSystemFont(ofSize: 13.3)
        case "h6":
            label.font = UIFont.boldSystemFont(ofSize: 10.7)
        default:
            break
        }

        // Style overrides from parent (fontSize, color)
        if let style = parentProps["style"] as? [String: Any] {
            if let fontSize = style["fontSize"] as? NSNumber {
                let size = CGFloat(fontSize.doubleValue)
                // Preserve bold if parent is a heading
                switch parentType {
                case "h1", "h2", "h3", "h4", "h5", "h6":
                    label.font = UIFont.boldSystemFont(ofSize: size)
                default:
                    label.font = UIFont.systemFont(ofSize: size)
                }
            }
            if let color = style["color"] as? String {
                label.textColor = parseColor(color)
            }
        }
    }

    // MARK: - Event Handlers

    @objc private func handleButtonTap(_ sender: UIButton) {
        dispatchEvent?(sender, "click", [:])
    }

    @objc private func handleTextFieldChanged(_ sender: UITextField) {
        dispatchEvent?(sender, "change", ["value": sender.text ?? ""])
    }

    // MARK: - Helpers

    private func parseColor(_ color: String) -> UIColor {
        // Handle hex colors
        if color.hasPrefix("#") {
            var hex = color.dropFirst()
            if hex.count == 3 {
                // Expand shorthand (#RGB -> #RRGGBB)
                hex = hex.map { "\($0)\($0)" }.joined()[...]
            }
            if hex.count == 6 {
                let scanner = Scanner(string: String(hex))
                var rgb: UInt64 = 0
                scanner.scanHexInt64(&rgb)
                let r = CGFloat((rgb >> 16) & 0xFF) / 255.0
                let g = CGFloat((rgb >> 8) & 0xFF) / 255.0
                let b = CGFloat(rgb & 0xFF) / 255.0
                return UIColor(red: r, green: g, blue: b, alpha: 1.0)
            }
        }

        // Handle named colors
        switch color.lowercased() {
        case "red": return .red
        case "green": return .green
        case "blue": return .blue
        case "white": return .white
        case "black": return .black
        case "gray", "grey": return .gray
        case "yellow": return .yellow
        case "orange": return .orange
        case "purple": return .purple
        case "clear", "transparent": return .clear
        default: return .clear
        }
    }
}
