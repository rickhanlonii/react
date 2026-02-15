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
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
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
            let style = props["style"] as? [String: Any] ?? [:]
            let overflow = style["overflow"] as? String
            if overflow == "scroll" || overflow == "auto" {
                let scrollView = UIScrollView()
                scrollView.clipsToBounds = true
                if let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
                applyCommonProps(to: scrollView, props: props)
                return scrollView
            }
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
            // Fallback to a plain view (or scroll view for overflow:scroll/auto)
            let style = props["style"] as? [String: Any] ?? [:]
            let overflow = style["overflow"] as? String
            if overflow == "scroll" || overflow == "auto" {
                let scrollView = UIScrollView()
                scrollView.clipsToBounds = true
                if let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
                applyCommonProps(to: scrollView, props: props)
                return scrollView
            }
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
                // Don't set clipsToBounds here — it conflicts with boxShadow.
                // Only overflow:hidden should set clipsToBounds.
            }

            // opacity
            if let opacity = style["opacity"] as? NSNumber {
                view.alpha = CGFloat(opacity.doubleValue)
            }

            // overflow
            if let overflow = style["overflow"] as? String {
                switch overflow {
                case "hidden":
                    view.clipsToBounds = true
                case "visible":
                    view.clipsToBounds = false
                case "scroll", "auto":
                    view.clipsToBounds = true
                default: break
                }
            }

            // visibility
            if let visibility = style["visibility"] as? String {
                view.isHidden = (visibility == "hidden")
            }

            // pointerEvents
            if let pointerEvents = style["pointerEvents"] as? String {
                view.isUserInteractionEnabled = (pointerEvents != "none")
            }

            // zIndex
            if let zIndex = style["zIndex"] as? NSNumber {
                view.layer.zPosition = CGFloat(zIndex.doubleValue)
            }

            // boxShadow (dictionary form: {offsetX, offsetY, blurRadius, color})
            if let shadow = style["boxShadow"] as? [String: Any] {
                let offsetX = (shadow["offsetX"] as? NSNumber)?.doubleValue ?? 0
                let offsetY = (shadow["offsetY"] as? NSNumber)?.doubleValue ?? 0
                let blur = (shadow["blurRadius"] as? NSNumber)?.doubleValue ?? 0
                let color = (shadow["color"] as? String) ?? "black"
                view.layer.shadowOffset = CGSize(width: offsetX, height: offsetY)
                view.layer.shadowRadius = CGFloat(blur)
                view.layer.shadowColor = parseColor(color).cgColor
                view.layer.shadowOpacity = 1.0
            }

            // transform (array-of-objects format: [{rotate: '45deg'}, {scale: 0.75}])
            if let transforms = style["transform"] as? [[String: Any]] {
                var t = CGAffineTransform.identity
                for entry in transforms {
                    if let rotate = entry["rotate"] as? String {
                        t = t.rotated(by: parseRotation(rotate))
                    }
                    if let scale = entry["scale"] as? NSNumber {
                        t = t.scaledBy(x: CGFloat(scale.doubleValue), y: CGFloat(scale.doubleValue))
                    }
                    if let tx = entry["translateX"] as? NSNumber {
                        t = t.translatedBy(x: CGFloat(tx.doubleValue), y: 0)
                    }
                    if let ty = entry["translateY"] as? NSNumber {
                        t = t.translatedBy(x: 0, y: CGFloat(ty.doubleValue))
                    }
                    if let scaleX = entry["scaleX"] as? NSNumber {
                        t = t.scaledBy(x: CGFloat(scaleX.doubleValue), y: 1)
                    }
                    if let scaleY = entry["scaleY"] as? NSNumber {
                        t = t.scaledBy(x: 1, y: CGFloat(scaleY.doubleValue))
                    }
                }
                view.transform = t
            }
        }
    }

    private func applyTextProps(to label: UILabel, props: [String: Any], elementType: String) {
        let style = props["style"] as? [String: Any] ?? [:]

        // 1. Set text from children
        if let children = props["children"] as? String {
            label.text = children
        }

        // 2. Apply textTransform (modifies text string)
        if let textTransform = style["textTransform"] as? String, let text = label.text {
            switch textTransform {
            case "uppercase":
                label.text = text.uppercased()
            case "lowercase":
                label.text = text.lowercased()
            case "capitalize":
                label.text = text.capitalized
            default: break
            }
        }

        // 3. Set font via resolveFont()
        label.font = resolveFont(style: style, elementType: elementType)

        // 4. Set textColor
        if let color = style["color"] as? String {
            label.textColor = parseColor(color)
        }

        // 5. Set textAlignment
        if let textAlign = style["textAlign"] as? String {
            label.textAlignment = parseTextAlignment(textAlign)
        }

        // 6-8. Apply attributed text properties (decoration, lineHeight, letterSpacing)
        applyAttributedTextProps(to: label, style: style)
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
        let style = parentProps["style"] as? [String: Any] ?? [:]

        // 1. Text is already set on #text nodes during CREATE

        // 2. Apply textTransform (modifies text string)
        if let textTransform = style["textTransform"] as? String, let text = label.text {
            switch textTransform {
            case "uppercase":
                label.text = text.uppercased()
            case "lowercase":
                label.text = text.lowercased()
            case "capitalize":
                label.text = text.capitalized
            default: break
            }
        }

        // 3. Set font via resolveFont()
        label.font = resolveFont(style: style, elementType: parentType)

        // 4. Set textColor
        if let color = style["color"] as? String {
            label.textColor = parseColor(color)
        }

        // 5. Set textAlignment
        if let textAlign = style["textAlign"] as? String {
            label.textAlignment = parseTextAlignment(textAlign)
        }

        // 6-8. Apply attributed text properties (decoration, lineHeight, letterSpacing)
        applyAttributedTextProps(to: label, style: style)
    }

    // MARK: - Event Handlers

    @objc private func handleButtonTap(_ sender: UIButton) {
        dispatchEvent?(sender, "click", [:])
    }

    @objc private func handleTextFieldChanged(_ sender: UITextField) {
        dispatchEvent?(sender, "change", ["value": sender.text ?? ""])
    }

    // MARK: - Text Helpers

    /// Resolves a UIFont from style properties and element type.
    /// Supports fontSize, fontWeight (100-900, "bold", "normal"), and fontStyle ("italic").
    func resolveFont(style: [String: Any], elementType: String) -> UIFont {
        // Determine base size from element type
        var size: CGFloat
        var isBold = false
        switch elementType {
        case "h1": size = 32; isBold = true
        case "h2": size = 24; isBold = true
        case "h3": size = 20; isBold = true
        case "h4": size = 16; isBold = true
        case "h5": size = 13.3; isBold = true
        case "h6": size = 10.7; isBold = true
        default: size = 16
        }

        // Override with explicit fontSize
        if let fontSize = style["fontSize"] as? NSNumber {
            size = CGFloat(fontSize.doubleValue)
        }

        // Determine weight
        var weight: UIFont.Weight = isBold ? .bold : .regular
        if let fw = style["fontWeight"] as? String {
            weight = parseFontWeight(fw)
        } else if let fw = style["fontWeight"] as? NSNumber {
            weight = parseFontWeight(String(fw.intValue))
        }

        // Build font
        var font = UIFont.systemFont(ofSize: size, weight: weight)

        // Apply italic via font descriptor traits
        if let fontStyle = style["fontStyle"] as? String, fontStyle == "italic" {
            let descriptor = font.fontDescriptor.withSymbolicTraits(.traitItalic) ?? font.fontDescriptor
            font = UIFont(descriptor: descriptor, size: size)
        }

        return font
    }

    /// Parses a CSS font-weight string to UIFont.Weight.
    func parseFontWeight(_ value: String) -> UIFont.Weight {
        switch value {
        case "100": return .ultraLight
        case "200": return .thin
        case "300": return .light
        case "normal", "400": return .regular
        case "500": return .medium
        case "600": return .semibold
        case "bold", "700": return .bold
        case "800": return .heavy
        case "900": return .black
        default: return .regular
        }
    }

    /// Parses a CSS text-align string to NSTextAlignment.
    func parseTextAlignment(_ value: String) -> NSTextAlignment {
        switch value {
        case "left": return .left
        case "center": return .center
        case "right": return .right
        case "justify", "justified": return .justified
        default: return .natural
        }
    }

    /// Applies textDecorationLine, lineHeight, and letterSpacing as attributed text.
    /// Must be called AFTER font, color, and text are already set on the label.
    private func applyAttributedTextProps(to label: UILabel, style: [String: Any]) {
        let hasDecoration = style["textDecorationLine"] != nil
        let hasLineHeight = style["lineHeight"] != nil
        let hasLetterSpacing = style["letterSpacing"] != nil

        guard hasDecoration || hasLineHeight || hasLetterSpacing else { return }
        guard let text = label.text else { return }

        // Start with existing font and color
        var attributes: [NSAttributedString.Key: Any] = [:]
        attributes[.font] = label.font
        if let textColor = label.textColor {
            attributes[.foregroundColor] = textColor
        }

        // 6. textDecorationLine
        if let decoration = style["textDecorationLine"] as? String {
            switch decoration {
            case "underline":
                attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
            case "line-through":
                attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
            case "underline line-through":
                attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
                attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
            default: break
            }
        }

        // 7. lineHeight via paragraph style
        if let lh = style["lineHeight"] as? NSNumber {
            let lineHeight = CGFloat(lh.doubleValue)
            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.minimumLineHeight = lineHeight
            paragraphStyle.maximumLineHeight = lineHeight
            // Preserve text alignment
            paragraphStyle.alignment = label.textAlignment
            attributes[.paragraphStyle] = paragraphStyle
            // Center text vertically within the line height
            let fontLineHeight = label.font.lineHeight
            if lineHeight > fontLineHeight {
                attributes[.baselineOffset] = (lineHeight - fontLineHeight) / 4
            }
        }

        // 8. letterSpacing (kern)
        if let spacing = style["letterSpacing"] as? NSNumber {
            attributes[.kern] = CGFloat(spacing.doubleValue)
        }

        label.attributedText = NSAttributedString(string: text, attributes: attributes)
    }

    // MARK: - Helpers

    /// Parses a rotation string like "45deg" or "1.5rad" to radians.
    func parseRotation(_ value: String) -> CGFloat {
        if value.hasSuffix("deg") {
            let num = value.dropLast(3)
            if let degrees = Double(num) {
                return CGFloat(degrees * .pi / 180.0)
            }
        } else if value.hasSuffix("rad") {
            let num = value.dropLast(3)
            if let radians = Double(num) {
                return CGFloat(radians)
            }
        }
        // Fallback: try parsing as raw number (radians)
        if let radians = Double(value) {
            return CGFloat(radians)
        }
        return 0
    }

    func parseColor(_ color: String) -> UIColor {
        // Handle hex colors
        if color.hasPrefix("#") {
            var hex = color.dropFirst()
            if hex.count == 3 {
                // Expand shorthand (#RGB -> #RRGGBB)
                hex = hex.map { "\($0)\($0)" }.joined()[...]
            }
            if hex.count == 4 {
                // Expand shorthand (#RGBA -> #RRGGBBAA)
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
            if hex.count == 8 {
                let scanner = Scanner(string: String(hex))
                var rgba: UInt64 = 0
                scanner.scanHexInt64(&rgba)
                let r = CGFloat((rgba >> 24) & 0xFF) / 255.0
                let g = CGFloat((rgba >> 16) & 0xFF) / 255.0
                let b = CGFloat((rgba >> 8) & 0xFF) / 255.0
                let a = CGFloat(rgba & 0xFF) / 255.0
                return UIColor(red: r, green: g, blue: b, alpha: a)
            }
        }

        // Handle rgb(r, g, b) and rgba(r, g, b, a)
        if color.hasPrefix("rgb") {
            let inner = color
                .replacingOccurrences(of: "rgba(", with: "")
                .replacingOccurrences(of: "rgb(", with: "")
                .replacingOccurrences(of: ")", with: "")
            let parts = inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            if parts.count >= 3,
               let r = Double(parts[0]),
               let g = Double(parts[1]),
               let b = Double(parts[2]) {
                let a = parts.count >= 4 ? (Double(parts[3]) ?? 1.0) : 1.0
                return UIColor(red: CGFloat(r / 255.0), green: CGFloat(g / 255.0), blue: CGFloat(b / 255.0), alpha: CGFloat(a))
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
        case "cyan": return .cyan
        case "brown": return .brown
        case "clear", "transparent": return .clear
        default: return .clear
        }
    }
}
