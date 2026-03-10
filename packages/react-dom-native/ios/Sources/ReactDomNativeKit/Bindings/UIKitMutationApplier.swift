import UIKit
import ShadowTree

// ---------------------------------------------------------------------------
// UIKitMutationApplier
//
// Applies mutations produced by the Differentiator to UIViews. This is
// the production equivalent of StubMutationApplier in the test harness.
// ---------------------------------------------------------------------------

public typealias EventDispatchHandler = (UIView, String, [String: Any]) -> Void

public class UIKitMutationApplier: NSObject {

    private let viewRegistry: ViewRegistry
    private let viewPool = ViewPool()
    public var dispatchEvent: EventDispatchHandler?

    /// Called when an MPA form POST receives a response.
    /// The response is a new SSR instruction stream that should replace the current tree.
    var onMPAFormResponse: ((String) -> Void)?

    /// Base URL for SSR endpoint, used for MPA form submission when
    /// the form action is "POST" (relative action). Set by startServerOnly().
    var ssrBaseURL: String?

    /// Tracks inherited textAlign per view for CSS textAlign inheritance.
    /// textAlign is an inherited CSS property — parent containers pass it
    /// to all descendant text elements.
    private var inheritedTextAlign: [ObjectIdentifier: NSTextAlignment] = [:]

    /// Tracks inherited text color per view for CSS color inheritance.
    /// color is an inherited CSS property — parent containers pass it
    /// to all descendant text elements.
    private var inheritedTextColor: [ObjectIdentifier: UIColor] = [:]

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
        var unused: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
        applyMutations(mutations, rootView: rootView, tracing: false, mutationTimings: &unused)
    }

    /// Applies an ordered list of mutations to UIViews, with optional per-mutation
    /// timing collection for flame graph visualization.
    public func applyMutations(
        _ mutations: [Mutation],
        rootView: UIView,
        tracing: Bool,
        mutationTimings: inout [(mutationType: String, elementType: String, start: Double, end: Double)]
    ) {
        for (index, mutation) in mutations.enumerated() {
            let mutStart = tracing ? performanceNow() : 0
            var mutType = ""
            var elemType = ""

            switch mutation {
            case .create(let node):
                mutType = "CREATE"
                elemType = node.family.elementType
                let poolKey = viewPoolKey(elementType: node.family.elementType, props: node.props)
                let view: UIView
                if let recycled = viewPool.dequeue(elementType: poolKey) {
                    view = recycled
                    updateView(view, elementType: node.family.elementType, props: node.props)
                    if node.family.elementType == "#text", let label = view as? UILabel {
                        label.text = node.text
                    }
                } else {
                    view = createView(for: node)
                }
                view.frame = node.layoutFrame
                // Apply bounds-dependent props (borders, border-radius) now that frame is set
                applyBoundsDependentProps(to: view, props: node.props)
                // Promote backgroundColor to a sublayer for positioned elements so
                // children with negative zIndex can render behind the background
                // (matching CSS stacking context behavior).
                applyBackgroundLayerIfNeeded(to: view, props: node.props)
                node.family.hasClickHandler = node.props["onClick"] != nil
                if node.family.elementType == "button" {
                    let buttonType = node.props["type"] as? String
                    // HTML default: <button> without type is type="submit"
                    node.family.isSubmitButton = (buttonType == nil || buttonType == "submit")
                }
                if node.family.elementType == "input" {
                    let inputType = node.props["type"] as? String
                    node.family.isSubmitButton = (inputType == "submit" || inputType == "image")
                }
                if node.family.elementType == "form" {
                    node.family.formActionURL = node.props["action"] as? String
                    // Store serialized action data for MPA form submission
                    if let actionData = node.props["_actionData"] as? [String: Any] {
                        var stringData: [String: String] = [:]
                        for (key, value) in actionData {
                            stringData[key] = "\(value)"
                        }
                        if let actionId = node.props["_actionId"] as? String {
                            stringData[actionId] = ""
                        }
                        node.family.formActionData = stringData
                    }
                }
                if node.family.elementType == "input" {
                    node.family.inputName = node.props["name"] as? String
                }
                viewRegistry.register(view: view, family: node.family)

            case .delete(let node):
                mutType = "DELETE"
                elemType = node.family.elementType
                if let view = node.family.view {
                    inheritedTextAlign.removeValue(forKey: ObjectIdentifier(view))
                    inheritedTextColor.removeValue(forKey: ObjectIdentifier(view))
                    view.removeFromSuperview()
                    let poolKey = viewPoolKey(elementType: node.family.elementType, view: view)
                    viewPool.recycle(view: view, elementType: poolKey)
                }
                viewRegistry.unregister(family: node.family)

            case .insert(let parent, let child, let index):
                mutType = "INSERT"
                elemType = child.family.elementType
                guard let parentView = parent.family.view,
                      let childView = child.family.view else {
                    continue
                }
                // Inherit font properties from parent text elements to #text children
                if child.family.elementType == "#text", let childLabel = childView as? UILabel {
                    applyInheritedTextStyle(to: childLabel, parentType: parent.family.elementType, parentProps: parent.props, inheritedColor: inheritedTextColor[ObjectIdentifier(parentView)])
                }
                // CSS textAlign inheritance — cascades from ancestors to descendants
                let childStyle = child.props["style"] as? [String: Any] ?? [:]
                if let textAlign = childStyle["textAlign"] as? String {
                    inheritedTextAlign[ObjectIdentifier(childView)] = parseTextAlignment(textAlign)
                } else {
                    let parentStyle = parent.props["style"] as? [String: Any] ?? [:]
                    let inherited: NSTextAlignment?
                    if let textAlign = parentStyle["textAlign"] as? String {
                        inherited = parseTextAlignment(textAlign)
                    } else {
                        inherited = inheritedTextAlign[ObjectIdentifier(parentView)]
                    }
                    if let alignment = inherited {
                        inheritedTextAlign[ObjectIdentifier(childView)] = alignment
                        if let label = childView as? UILabel {
                            label.textAlignment = alignment
                        }
                    }
                }
                // CSS color inheritance — cascades from ancestors to descendants
                if let color = childStyle["color"] as? String {
                    inheritedTextColor[ObjectIdentifier(childView)] = parseColor(color)
                } else {
                    let parentStyle = parent.props["style"] as? [String: Any] ?? [:]
                    let inherited: UIColor?
                    if let color = parentStyle["color"] as? String {
                        inherited = parseColor(color)
                    } else {
                        inherited = inheritedTextColor[ObjectIdentifier(parentView)]
                    }
                    if let color = inherited {
                        inheritedTextColor[ObjectIdentifier(childView)] = color
                        if let label = childView as? UILabel {
                            label.textColor = color
                        }
                    }
                }
                let clampedIndex = min(index, parentView.subviews.count)
                parentView.insertSubview(childView, at: clampedIndex)

            case .remove(let parent, let child):
                mutType = "REMOVE"
                elemType = child.family.elementType
                guard let childView = child.family.view else {
                    continue
                }
                childView.removeFromSuperview()

            case .update(let node, _, let newProps):
                mutType = "UPDATE"
                elemType = node.family.elementType
                guard let view = node.family.view else {
                    continue
                }
                updateView(view, elementType: node.family.elementType, props: newProps)
                // Update text content for #text nodes (family reuse path)
                if node.family.elementType == "#text", let label = view as? UILabel {
                    label.text = node.text
                }
                view.frame = node.layoutFrame
                // Apply bounds-dependent props (borders, border-radius) now that frame is set
                applyBoundsDependentProps(to: view, props: newProps)
                node.family.hasClickHandler = newProps["onClick"] != nil
                if node.family.elementType == "button" {
                    let buttonType = newProps["type"] as? String
                    // HTML default: <button> without type is type="submit"
                    node.family.isSubmitButton = (buttonType == nil || buttonType == "submit")
                }
                if node.family.elementType == "input" {
                    let inputType = newProps["type"] as? String
                    node.family.isSubmitButton = (inputType == "submit" || inputType == "image")
                }
                if node.family.elementType == "form" {
                    node.family.formActionURL = newProps["action"] as? String
                    // Store serialized action data for MPA form submission
                    if let actionData = newProps["_actionData"] as? [String: Any] {
                        var stringData: [String: String] = [:]
                        for (key, value) in actionData {
                            stringData[key] = "\(value)"
                        }
                        if let actionId = newProps["_actionId"] as? String {
                            stringData[actionId] = ""
                        }
                        node.family.formActionData = stringData
                    } else {
                        node.family.formActionData = nil
                    }
                }
                if node.family.elementType == "input" {
                    node.family.inputName = newProps["name"] as? String
                }
                applyBackgroundLayerIfNeeded(to: view, props: newProps)
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }

            if tracing {
                let mutEnd = performanceNow()
                mutationTimings.append((mutType, elemType, mutStart, mutEnd))
            }
        }

    }

    // MARK: - View Factory

    /// Creates a UIView for the given shadow node based on its element type.
    /// Pool key that distinguishes scroll views from plain views for the same element type.
    private func viewPoolKey(elementType: String, props: [String: Any]) -> String {
        let style = props["style"] as? [String: Any] ?? [:]
        let overflow = style["overflow"] as? String
        if overflow == "scroll" || overflow == "auto" {
            return elementType + ":scroll"
        }
        return elementType
    }

    private func viewPoolKey(elementType: String, view: UIView) -> String {
        if view is UIScrollView {
            return elementType + ":scroll"
        }
        return elementType
    }

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

        case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
             "b", "i", "u", "s", "del", "ins", "mark", "small", "code", "kbd", "samp",
             "pre", "th", "td",
             "cite", "dfn", "var", "sub", "sup", "q", "time", "abbr", "data":
            let label = UILabel()
            label.numberOfLines = 0
            if elementType == "pre" {
                label.lineBreakMode = .byCharWrapping
            }
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

        case "progress":
            let progressView = UIProgressView(progressViewStyle: .default)
            if let value = props["value"] as? Double, let max = props["max"] as? Double {
                progressView.progress = Float(value / max)
            }
            applyCommonProps(to: progressView, props: props)
            return progressView

        case "video":
            let view = UIView()
            view.backgroundColor = .black
            applyCommonProps(to: view, props: props)
            return view

        case "audio":
            let view = UIView()
            applyCommonProps(to: view, props: props)
            return view

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
        case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
             "b", "i", "u", "s", "del", "ins", "mark", "small", "code", "kbd", "samp",
             "pre", "th", "td",
             "cite", "dfn", "var", "sub", "sup", "q", "time", "abbr", "data":
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
        case "progress":
            if let progressView = view as? UIProgressView {
                if let value = props["value"] as? Double {
                    let max = (props["max"] as? Double) ?? 1.0
                    progressView.progress = Float(value / max)
                }
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
            // NOTE: Border props, border radius, and background layer depend on
            // view.bounds and are applied separately via applyBoundsDependent()
            // after view.frame is set.

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

        // id → accessibilityIdentifier + mark as accessibility element
        if let id = props["id"] as? String {
            view.accessibilityIdentifier = id
            view.isAccessibilityElement = true
        }
    }

    /// Applies bounds-dependent styling (borders, border radius) to a view.
    /// Must be called AFTER view.frame is set, because these operations use
    /// view.bounds to compute sublayer frames and shape paths.
    private func applyBoundsDependentProps(to view: UIView, props: [String: Any]) {
        if let style = props["style"] as? [String: Any] {
            applyBorderProps(to: view, style: style)
            applyBorderRadius(to: view, style: style)
        }
    }

    /// Removes any previously-added border-edge sublayers and adds new ones
    /// for per-side border widths. Falls back to CALayer.borderWidth for uniform borders.
    private func applyBorderProps(to view: UIView, style: [String: Any]) {
        // CSS initial border-width is "medium" (3px) when borderStyle is visible.
        // When borderStyle is not set or "none", no borders render.
        let borderStyle = style["borderStyle"] as? String
        let hasBorderStyle = borderStyle != nil && borderStyle != "none"
        let cssInitialBorderWidth: Double = 3

        // Read per-side values (nil = not set)
        let top = (style["borderTopWidth"] as? NSNumber)?.doubleValue
        let right = (style["borderRightWidth"] as? NSNumber)?.doubleValue
        let bottom = (style["borderBottomWidth"] as? NSNumber)?.doubleValue
        let left = (style["borderLeftWidth"] as? NSNumber)?.doubleValue
        let uniform = (style["borderWidth"] as? NSNumber)?.doubleValue

        // Resolve each edge: per-side overrides uniform, which defaults to
        // CSS initial "medium" (3px) when borderStyle is visible
        let defaultWidth = hasBorderStyle ? (uniform ?? cssInitialBorderWidth) : (uniform ?? 0)
        let t = top ?? defaultWidth
        let r = right ?? defaultWidth
        let b = bottom ?? defaultWidth
        let l = left ?? defaultWidth

        // Parse border color — uniform and per-side
        let uniformColor: CGColor
        if let colorStr = style["borderColor"] as? String {
            uniformColor = parseColor(colorStr).cgColor
        } else {
            uniformColor = UIColor.black.cgColor
        }
        let topColor = (style["borderTopColor"] as? String).map { parseColor($0).cgColor } ?? uniformColor
        let rightColor = (style["borderRightColor"] as? String).map { parseColor($0).cgColor } ?? uniformColor
        let bottomColor = (style["borderBottomColor"] as? String).map { parseColor($0).cgColor } ?? uniformColor
        let leftColor = (style["borderLeftColor"] as? String).map { parseColor($0).cgColor } ?? uniformColor

        // Remove old border layers
        view.layer.sublayers?.filter { $0.name == "__border_edge__" }
            .forEach { $0.removeFromSuperlayer() }

        // If all zero, clear CALayer border too and return
        if t == 0 && r == 0 && b == 0 && l == 0 {
            view.layer.borderWidth = 0
            return
        }

        let colorsUniform = topColor === rightColor && rightColor === bottomColor && bottomColor === leftColor

        // If all widths and colors equal, use CALayer uniform border (simpler, antialiased)
        if t == r && r == b && b == l && colorsUniform {
            view.layer.borderWidth = CGFloat(t)
            view.layer.borderColor = topColor
            return
        }

        // Clear uniform border — we'll use sublayers instead
        view.layer.borderWidth = 0

        // Helper to add an edge layer
        func addEdge(frame: CGRect, color: CGColor) {
            let layer = CALayer()
            layer.name = "__border_edge__"
            layer.backgroundColor = color
            layer.frame = frame
            // zPosition ensures borders render above child views
            layer.zPosition = 1000
            view.layer.addSublayer(layer)
        }

        let bounds = view.bounds
        if t > 0 {
            addEdge(frame: CGRect(x: 0, y: 0, width: bounds.width, height: CGFloat(t)), color: topColor)
        }
        if b > 0 {
            addEdge(frame: CGRect(x: 0, y: bounds.height - CGFloat(b), width: bounds.width, height: CGFloat(b)), color: bottomColor)
        }
        if l > 0 {
            addEdge(frame: CGRect(x: 0, y: 0, width: CGFloat(l), height: bounds.height), color: leftColor)
        }
        if r > 0 {
            addEdge(frame: CGRect(x: bounds.width - CGFloat(r), y: 0, width: CGFloat(r), height: bounds.height), color: rightColor)
        }
    }

    /// Resolves a border-radius value from the style dict. Handles both numeric
    /// pixel values (NSNumber) and percentage strings (e.g. "50%"). Percentage
    /// values are resolved relative to the element's width, matching CSS
    /// getComputedStyle which reports the horizontal radius first (parseFloat
    /// extracts it). UIKit's cornerRadius auto-clamps when radius exceeds the
    /// smaller dimension.
    private func resolveBorderRadius(_ value: Any?, width: Double, height: Double) -> Double? {
        if let num = value as? NSNumber {
            return num.doubleValue
        }
        if let str = value as? String, str.hasSuffix("%"),
           let pct = Double(str.dropLast()) {
            // CSS resolves percentage border-radius to horizontal=pct*width/100.
            // Web extractor uses parseFloat(getComputedStyle().borderTopLeftRadius)
            // which extracts the horizontal radius. UIKit cornerRadius auto-clamps
            // to min(width, height)/2 when the value exceeds bounds.
            return pct * width / 100
        }
        return nil
    }

    /// Applies border-radius to a view. Supports both uniform borderRadius and
    /// per-corner values (borderTopLeftRadius, borderTopRightRadius, etc.).
    /// Uses CALayer.cornerRadius for uniform radii and a CAShapeLayer mask
    /// for per-corner radii.
    private func applyBorderRadius(to view: UIView, style: [String: Any]) {
        let w = Double(view.bounds.width)
        let h = Double(view.bounds.height)
        let uniform = resolveBorderRadius(style["borderRadius"], width: w, height: h)
        let tl = resolveBorderRadius(style["borderTopLeftRadius"], width: w, height: h) ?? uniform ?? 0
        let tr = resolveBorderRadius(style["borderTopRightRadius"], width: w, height: h) ?? uniform ?? 0
        let bl = resolveBorderRadius(style["borderBottomLeftRadius"], width: w, height: h) ?? uniform ?? 0
        let br = resolveBorderRadius(style["borderBottomRightRadius"], width: w, height: h) ?? uniform ?? 0

        // Remove any existing corner mask from a previous apply
        view.layer.mask = (view.layer.mask?.name == "__corner_mask__") ? nil : view.layer.mask

        if tl == 0 && tr == 0 && bl == 0 && br == 0 {
            view.layer.cornerRadius = 0
            return
        }

        // If all corners are the same, use the simpler CALayer API
        if tl == tr && tr == bl && bl == br {
            view.layer.cornerRadius = CGFloat(tl)
            return
        }

        // Per-corner: use a UIBezierPath mask
        view.layer.cornerRadius = 0
        let bounds = view.bounds
        let path = UIBezierPath()

        // Start at top-left, after the top-left radius
        path.move(to: CGPoint(x: CGFloat(tl), y: 0))

        // Top edge -> top-right corner
        path.addLine(to: CGPoint(x: bounds.width - CGFloat(tr), y: 0))
        if tr > 0 {
            path.addArc(
                withCenter: CGPoint(x: bounds.width - CGFloat(tr), y: CGFloat(tr)),
                radius: CGFloat(tr), startAngle: -.pi / 2, endAngle: 0, clockwise: true
            )
        }

        // Right edge -> bottom-right corner
        path.addLine(to: CGPoint(x: bounds.width, y: bounds.height - CGFloat(br)))
        if br > 0 {
            path.addArc(
                withCenter: CGPoint(x: bounds.width - CGFloat(br), y: bounds.height - CGFloat(br)),
                radius: CGFloat(br), startAngle: 0, endAngle: .pi / 2, clockwise: true
            )
        }

        // Bottom edge -> bottom-left corner
        path.addLine(to: CGPoint(x: CGFloat(bl), y: bounds.height))
        if bl > 0 {
            path.addArc(
                withCenter: CGPoint(x: CGFloat(bl), y: bounds.height - CGFloat(bl)),
                radius: CGFloat(bl), startAngle: .pi / 2, endAngle: .pi, clockwise: true
            )
        }

        // Left edge -> top-left corner
        path.addLine(to: CGPoint(x: 0, y: CGFloat(tl)))
        if tl > 0 {
            path.addArc(
                withCenter: CGPoint(x: CGFloat(tl), y: CGFloat(tl)),
                radius: CGFloat(tl), startAngle: .pi, endAngle: 3 * .pi / 2, clockwise: true
            )
        }

        path.close()

        let shapeLayer = CAShapeLayer()
        shapeLayer.name = "__corner_mask__"
        shapeLayer.path = path.cgPath
        view.layer.mask = shapeLayer
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
            var imgRequest = URLRequest(url: url)
            setNetworkResourceType("Image", on: &imgRequest)
            let task = URLSession.shared.dataTask(with: imgRequest) { data, _, _ in
                if let data = data, let image = UIImage(data: data) {
                    DispatchQueue.main.async {
                        imageView.image = image
                    }
                }
            }
            task.resume()
        }
        imageView.contentMode = .scaleAspectFit
    }

    /// Applies inherited text styling from a parent text element to a #text child label.
    /// In CSS, text nodes inherit font-size, font-weight, and color from their parent element.
    /// The `inheritedColor` parameter carries the cascaded color from ancestor containers
    /// (CSS color inheritance goes up the entire ancestor chain, not just the immediate parent).
    private func applyInheritedTextStyle(to label: UILabel, parentType: String, parentProps: [String: Any], inheritedColor: UIColor? = nil) {
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

        // 4. Set textColor — from parent's explicit color, or cascaded from ancestors
        if let color = style["color"] as? String {
            label.textColor = parseColor(color)
        } else if let color = inheritedColor {
            label.textColor = color
        }

        // 5. Set textAlignment
        if let textAlign = style["textAlign"] as? String {
            label.textAlignment = parseTextAlignment(textAlign)
        }

        // 6-8. Apply attributed text properties (decoration, lineHeight, letterSpacing)
        applyAttributedTextProps(to: label, style: style)

        // Pre elements: preserve whitespace and prevent truncation
        if parentType == "pre" {
            label.lineBreakMode = .byCharWrapping
        }
    }

    // MARK: - Event Handlers

    /// Installs a root-level tap gesture recognizer for event delegation.
    /// Like web React, a single listener on the root captures all taps and
    /// dispatches click events to the correct element by hit-testing.
    /// This works for both SSR and CSR views.
    public func installRootTapGesture(on view: UIView) {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleRootTap(_:)))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
    }

    @objc private func handleRootTap(_ sender: UITapGestureRecognizer) {
        guard let rootView = sender.view else { return }
        let point = sender.location(in: rootView)
        guard let hitView = rootView.hitTest(point, with: nil) else { return }

        // Check for pre-hydration MPA form submit: if a button inside a form
        // with a string action URL is tapped, POST directly to the server.
        if let family = viewRegistry.family(for: hitView),
           family.elementType == "button" {
            if attemptMPAFormSubmit(from: hitView) {
                return // MPA form submit handled natively
            }
        }

        // Walk up the view hierarchy from the hit view, dispatching click
        // events for each registered element that has a click handler (event
        // bubbling). Skip UIButton and UITextField — they handle their own
        // events via addTarget.
        var current: UIView? = hitView
        while let view = current, view !== rootView {
            if !(view is UIButton) && !(view is UITextField),
               let family = viewRegistry.family(for: view),
               family.hasClickHandler {
                dispatchEvent?(view, "click", ["_nativeTimestamp": performanceNow()])
            }
            current = view.superview
        }
    }

    /// Dispatches a synthetic tap at a point in the given root view's coordinate space.
    /// Used by the DevTools screencast to forward clicks from Chrome DevTools.
    public func dispatchTapAtPoint(in rootView: UIView, at point: CGPoint) {
        guard let hitView = rootView.hitTest(point, with: nil) else {
            return
        }

        // For UIButton/UITextField, fire their target actions directly
        if let button = hitView as? UIButton {
            button.sendActions(for: .touchUpInside)
            return
        }
        if let textField = hitView as? UITextField {
            textField.becomeFirstResponder()
            return
        }

        // Walk up the view hierarchy dispatching click events (event bubbling)
        var current: UIView? = hitView
        while let view = current, view !== rootView {
            if let family = viewRegistry.family(for: view),
               family.hasClickHandler {
                dispatchEvent?(view, "click", ["_nativeTimestamp": performanceNow()])
            }
            current = view.superview
        }
    }

    @objc private func handleButtonTap(_ sender: UIButton) {
        // Try MPA form submit first (works without JS runtime in Server Only mode)
        if let family = viewRegistry.family(for: sender),
           family.isSubmitButton {
            if attemptMPAFormSubmit(from: sender) {
                return
            }
        }

        // Dispatch click on the button itself
        dispatchEvent?(sender, "click", ["_nativeTimestamp": performanceNow()])

        // Check if this button is a submit button inside a form
        guard let family = viewRegistry.family(for: sender),
              family.isSubmitButton else {
            return
        }

        // Walk up the view hierarchy looking for a form element
        var formSearch: UIView? = sender.superview
        while let view = formSearch {
            if let family = viewRegistry.family(for: view),
               family.elementType == "form" {
                // Collect form field values from native UITextFields
                var formData: [String: String] = [:]
                collectFormData(from: view, into: &formData)
                dispatchEvent?(view, "submit", [
                    "_nativeTimestamp": performanceNow(),
                    "_formData": formData
                ])
                return
            }
            formSearch = view.superview
        }
    }

    @objc private func handleTextFieldChanged(_ sender: UITextField) {
        dispatchEvent?(sender, "change", ["value": sender.text ?? "", "_nativeTimestamp": performanceNow()])
    }

    // MARK: - MPA Form Submit (Pre-hydration)

    /// When a submit button is tapped before hydration, check if it's inside a
    /// form with a string action URL. If so, perform a native MPA form submission.
    func attemptMPAFormSubmit(from buttonView: UIView) -> Bool {
        // Walk up looking for a <form> with an action URL
        var formSearch: UIView? = buttonView.superview
        while let view = formSearch {
            guard let family = viewRegistry.family(for: view),
                  family.elementType == "form" else {
                formSearch = view.superview
                continue
            }

            // Check if the form has a string action URL
            guard var actionURL = family.formActionURL, !actionURL.isEmpty else {
                return false // Form exists but no action URL
            }

            // When Fizz serializes a server action, it sets action="POST" (not a URL).
            // Use the SSR base URL as the POST target instead.
            if actionURL == "POST" {
                guard let baseURL = ssrBaseURL, !baseURL.isEmpty else {
                    return false
                }
                actionURL = baseURL
            }

            // Collect form data from input descendants
            var formFields: [String: String] = [:]
            collectFormData(from: view, into: &formFields)

            // Disable the submit button and fade it while the POST is in flight.
            // The button is re-created when reloadFromSSRResponse rebuilds the view tree.
            if let button = buttonView as? UIButton {
                button.isEnabled = false
                UIView.animate(withDuration: 0.2) {
                    button.alpha = 0.5
                }
            }

            // POST to the action URL, including serialized action data
            performMPAFormPost(to: actionURL, fields: formFields, actionData: family.formActionData, submitButton: buttonView as? UIButton)
            return true
        }
        return false
    }

    func collectFormData(from view: UIView, into fields: inout [String: String]) {
        for subview in view.subviews {
            if let textField = subview as? UITextField,
               let family = viewRegistry.family(for: textField),
               let name = family.inputName, !name.isEmpty {
                fields[name] = textField.text ?? ""
            }
            collectFormData(from: subview, into: &fields)
        }
    }

    func performMPAFormPost(to actionURL: String, fields: [String: String], actionData: [String: String]? = nil, submitButton: UIButton? = nil) {
        guard let url = URL(string: actionURL) else {
            print("[react-dom-native] MPA form submit: invalid action URL: \(actionURL)")
            submitButton?.isEnabled = true
            submitButton?.alpha = 1.0
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        // Merge user form fields with serialized action data
        var allFields = fields
        if let actionData = actionData {
            for (key, value) in actionData {
                allFields[key] = value
            }
        }

        // URL-encode all fields using form-encoding rules.
        // .urlQueryAllowed is NOT suitable — it leaves &, =, + unencoded.
        // For application/x-www-form-urlencoded, only unreserved chars are safe.
        var formSafe = CharacterSet.alphanumerics
        formSafe.insert(charactersIn: "-._~")
        let body = allFields.map { key, value in
            let encodedKey = key.addingPercentEncoding(withAllowedCharacters: formSafe) ?? key
            let encodedValue = value.addingPercentEncoding(withAllowedCharacters: formSafe) ?? value
            return "\(encodedKey)=\(encodedValue)"
        }.joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        setNetworkResourceType("Document", on: &request)
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }

                if let error = error {
                    print("[react-dom-native] MPA form submit failed: \(error.localizedDescription)")
                    submitButton?.isEnabled = true
                    submitButton?.alpha = 1.0
                    return
                }

                guard let data = data, let responseText = String(data: data, encoding: .utf8) else {
                    print("[react-dom-native] MPA form submit: empty response")
                    submitButton?.isEnabled = true
                    submitButton?.alpha = 1.0
                    return
                }

                // The response is a new SSR instruction stream.
                // Delegate to the SSR loading path to replace the current tree.
                self.onMPAFormResponse?(responseText)
            }
        }
        task.resume()
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
        case "small", "sub", "sup": size = 13.28
        default: size = 16
        }

        // Override with explicit fontSize
        if let fontSize = style["fontSize"] as? NSNumber {
            size = CGFloat(fontSize.doubleValue)
        } else if let fontSize = style["fontSize"] as? Double {
            size = CGFloat(fontSize)
        }

        // Determine weight
        var weight: UIFont.Weight = isBold ? .bold : .regular
        if let fw = style["fontWeight"] as? String {
            weight = parseFontWeight(fw)
        } else if let fw = style["fontWeight"] as? NSNumber {
            weight = parseFontWeight(String(fw.intValue))
        }

        // Build font
        var font: UIFont
        if let family = style["fontFamily"] as? String,
           let customFont = UIFont(name: family, size: size) {
            font = customFont
        } else {
            font = UIFont.systemFont(ofSize: size, weight: weight)
        }

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

    // MARK: - Background Layer for Stacking Context

    /// When a view is a positioned element (position: relative/absolute), CSS
    /// allows children with negative z-index to render behind the parent's
    /// background. UIKit's `backgroundColor` is drawn by the view's own layer,
    /// which is always behind all sublayers — so `zPosition = -1` on a child
    /// still appears above the background.
    ///
    /// To match CSS behavior, this method "promotes" the background color into
    /// a separate sublayer with `zPosition = -0.5`. Normal child views
    /// (default `zPosition = 0`) render on top of this background. Child layers
    /// with negative `zPosition` (from `zIndex: -1` etc.) render behind this
    /// background sublayer, matching the CSS stacking context paint order.
    private func applyBackgroundLayerIfNeeded(to view: UIView, props: [String: Any]) {
        let style = props["style"] as? [String: Any] ?? [:]
        let position = style["position"] as? String

        // Remove any existing promoted background layer.
        // Use removeFromSuperlayer() instead of sublayers?.removeAll — the
        // latter sets layer.sublayers which re-parents ALL sublayers and can
        // disrupt subview layer ordering.
        view.layer.sublayers?.filter { $0.name == "__bg_layer__" }
            .forEach { $0.removeFromSuperlayer() }

        // Only promote for position:relative elements. CSS stacking context
        // allows children with negative z-index to render behind the parent's
        // background — this requires the background in a sublayer. Absolute
        // children don't need this promotion and it can cause their backgrounds
        // to not render when the sublayer frame doesn't match.
        guard position == "relative",
              let bgColorStr = style["backgroundColor"] as? String else {
            return
        }

        let bgColor = parseColor(bgColorStr)

        // Clear the view's own backgroundColor so it doesn't paint behind everything
        view.backgroundColor = .clear

        // Add a background sublayer behind normal children but above
        // children with negative zIndex. Using zPosition -0.5 ensures:
        // - Normal children (zPosition 0) render ON TOP of the background
        // - Children with zIndex: -1 (zPosition -1) render BEHIND the background
        // Previously zPosition was 0, which caused the bgLayer to cover
        // child views due to UIKit sublayer ordering when subviews are
        // inserted (insertSubview places the subview's layer before
        // manually-added sublayers at the same zPosition).
        let bgLayer = CALayer()
        bgLayer.name = "__bg_layer__"
        bgLayer.backgroundColor = bgColor.cgColor
        bgLayer.frame = view.bounds
        bgLayer.zPosition = -0.5

        // Apply corner radius to match the view
        let w = Double(view.bounds.width)
        let h = Double(view.bounds.height)
        let uniform = resolveBorderRadius(style["borderRadius"], width: w, height: h)
        let tl = resolveBorderRadius(style["borderTopLeftRadius"], width: w, height: h) ?? uniform ?? 0
        let tr = resolveBorderRadius(style["borderTopRightRadius"], width: w, height: h) ?? uniform ?? 0
        let bl = resolveBorderRadius(style["borderBottomLeftRadius"], width: w, height: h) ?? uniform ?? 0
        let br = resolveBorderRadius(style["borderBottomRightRadius"], width: w, height: h) ?? uniform ?? 0

        if tl == tr && tr == bl && bl == br && tl > 0 {
            bgLayer.cornerRadius = CGFloat(tl)
        } else if tl > 0 || tr > 0 || bl > 0 || br > 0 {
            let bounds = view.bounds
            let path = UIBezierPath()
            path.move(to: CGPoint(x: CGFloat(tl), y: 0))
            path.addLine(to: CGPoint(x: bounds.width - CGFloat(tr), y: 0))
            if tr > 0 { path.addArc(withCenter: CGPoint(x: bounds.width - CGFloat(tr), y: CGFloat(tr)), radius: CGFloat(tr), startAngle: -.pi / 2, endAngle: 0, clockwise: true) }
            path.addLine(to: CGPoint(x: bounds.width, y: bounds.height - CGFloat(br)))
            if br > 0 { path.addArc(withCenter: CGPoint(x: bounds.width - CGFloat(br), y: bounds.height - CGFloat(br)), radius: CGFloat(br), startAngle: 0, endAngle: .pi / 2, clockwise: true) }
            path.addLine(to: CGPoint(x: CGFloat(bl), y: bounds.height))
            if bl > 0 { path.addArc(withCenter: CGPoint(x: CGFloat(bl), y: bounds.height - CGFloat(bl)), radius: CGFloat(bl), startAngle: .pi / 2, endAngle: .pi, clockwise: true) }
            path.addLine(to: CGPoint(x: 0, y: CGFloat(tl)))
            if tl > 0 { path.addArc(withCenter: CGPoint(x: CGFloat(tl), y: CGFloat(tl)), radius: CGFloat(tl), startAngle: .pi, endAngle: 3 * .pi / 2, clockwise: true) }
            path.close()
            let mask = CAShapeLayer()
            mask.path = path.cgPath
            bgLayer.mask = mask
        }

        // Insert at position 0 so it's behind existing sublayers
        view.layer.insertSublayer(bgLayer, at: 0)
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
