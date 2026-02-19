import Foundation
import CoreGraphics
import Yoga

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Text measurement for Yoga layout.
///
/// Registers a YGMeasureFunc on text node yogaNodes so Yoga can calculate
/// the intrinsic size of text content. Uses NSString.boundingRect for
/// measurement.
///
/// Since YGMeasureFunc is a C function pointer and cannot capture Swift
/// context, we store text measurement info on the YGNode's context pointer.
public enum YogaTextMeasure {

    /// Context object stored on a text node's yogaNode via YGNodeSetContext.
    /// Retains the text string and font info for measurement.
    fileprivate class TextMeasureContext {
        let text: String
        var fontSize: CGFloat
        var fontWeight: String?
        var fontFamily: String?
        var fontStyle: String?
        var lineHeight: CGFloat?
        var lastMeasuredWidth: Float = 0

        init(text: String, fontSize: CGFloat, fontWeight: String? = nil, fontFamily: String? = nil, fontStyle: String? = nil, lineHeight: CGFloat? = nil) {
            self.text = text
            self.fontSize = fontSize
            self.fontWeight = fontWeight
            self.fontFamily = fontFamily
            self.fontStyle = fontStyle
            self.lineHeight = lineHeight
        }
    }

    /// Set up text measurement on a text node's yogaNode.
    ///
    /// - Parameters:
    ///   - node: The ShadowNodeWrapper for the text node.
    ///   - fontSize: Font size to use for measurement (default 16pt).
    ///   - fontWeight: CSS font weight string (e.g. "bold", "700").
    ///   - fontFamily: Font family name (e.g. "Menlo").
    ///   - fontStyle: CSS font style (e.g. "italic").
    ///   - lineHeight: CSS line-height override. When set, caps the per-line
    ///     measured height to match web rendering (e.g. monospace fonts).
    public static func setupMeasureFunc(
        on node: ShadowNodeWrapper,
        fontSize: CGFloat = 16,
        fontWeight: String? = nil,
        fontFamily: String? = nil,
        fontStyle: String? = nil,
        lineHeight: CGFloat? = nil
    ) {
        let context = TextMeasureContext(
            text: node.text ?? "",
            fontSize: fontSize,
            fontWeight: fontWeight,
            fontFamily: fontFamily,
            fontStyle: fontStyle,
            lineHeight: lineHeight
        )

        // Store context as unmanaged retained pointer on the yogaNode
        let contextPtr = Unmanaged.passRetained(context).toOpaque()
        YGNodeSetContext(node.yogaNode, contextPtr)

        // Set the measure function
        YGNodeSetMeasureFunc(node.yogaNode, textMeasureFunc)

        // Mark as text node type (allows layout rounding truncation)
        YGNodeSetNodeType(node.yogaNode, .text)
    }

    /// Clean up the measure context when a text node is being deallocated.
    /// Call this before freeing the yogaNode.
    public static func cleanupMeasureContext(for yogaNode: YGNodeRef) {
        if let ptr = YGNodeGetContext(yogaNode) {
            Unmanaged<TextMeasureContext>.fromOpaque(ptr).release()
            YGNodeSetContext(yogaNode, nil)
        }
    }

    /// Threshold for detecting meaningful width shrinkage (avoids float rounding false positives).
    private static let remeasureEpsilon: Float = 0.5

    #if canImport(UIKit)
    /// Resolves a UIFont from style properties for text measurement.
    static func resolveFont(size: CGFloat, weight: String?, family: String?, style: String?) -> UIFont {
        let uiWeight: UIFont.Weight
        switch weight {
        case "100": uiWeight = .ultraLight
        case "200": uiWeight = .thin
        case "300": uiWeight = .light
        case "normal", "400", nil: uiWeight = .regular
        case "500": uiWeight = .medium
        case "600": uiWeight = .semibold
        case "bold", "700": uiWeight = .bold
        case "800": uiWeight = .heavy
        case "900": uiWeight = .black
        default: uiWeight = .regular
        }

        var font: UIFont
        if let family = family, let customFont = UIFont(name: family, size: size) {
            font = customFont
        } else {
            font = UIFont.systemFont(ofSize: size, weight: uiWeight)
        }

        if style == "italic" {
            let descriptor = font.fontDescriptor.withSymbolicTraits(.traitItalic) ?? font.fontDescriptor
            font = UIFont(descriptor: descriptor, size: size)
        }

        return font
    }
    #endif

    /// Returns true if the text node was flex-shrunk narrower than its measured width,
    /// meaning the height is wrong (computed at the wider width) and needs re-measurement.
    public static func needsRemeasure(yogaNode: YGNodeRef) -> Bool {
        guard let ptr = YGNodeGetContext(yogaNode) else { return false }
        let context = Unmanaged<TextMeasureContext>.fromOpaque(ptr).takeUnretainedValue()
        let layoutWidth = YGNodeLayoutGetWidth(yogaNode)
        return context.lastMeasuredWidth - layoutWidth > remeasureEpsilon
    }
}

/// C-compatible measure function for text nodes.
/// Reads the TextMeasureContext from the node's context pointer and
/// measures the text using NSString.boundingRect.
private func textMeasureFunc(
    _ node: YGNodeConstRef?,
    _ width: Float,
    _ widthMode: YGMeasureMode,
    _ height: Float,
    _ heightMode: YGMeasureMode
) -> YGSize {
    guard let node = node,
          let ptr = YGNodeGetContext(node) else {
        return YGSize(width: 0, height: 0)
    }

    let context = Unmanaged<YogaTextMeasure.TextMeasureContext>.fromOpaque(ptr).takeUnretainedValue()

    let text = context.text as NSString
    let fontSize = context.fontSize

    #if canImport(UIKit)
    let font = YogaTextMeasure.resolveFont(size: fontSize, weight: context.fontWeight, family: context.fontFamily, style: context.fontStyle)
    #elseif canImport(AppKit)
    let font = NSFont.systemFont(ofSize: fontSize)
    #else
    // Fallback: return a reasonable default size
    return YGSize(width: Float(text.length * 8), height: Float(fontSize * 1.2))
    #endif

    // Determine max width constraint
    let maxWidth: CGFloat
    switch widthMode {
    case .exactly, .atMost:
        maxWidth = CGFloat(width)
    default:
        maxWidth = .greatestFiniteMagnitude
    }

    let constraintSize = CGSize(width: maxWidth, height: .greatestFiniteMagnitude)
    let measuredRect = text.boundingRect(
        with: constraintSize,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font],
        context: nil
    )

    let measuredWidth: Float
    switch widthMode {
    case .exactly:
        measuredWidth = width
    default:
        measuredWidth = Float(ceil(measuredRect.width))
    }

    let measuredHeight: Float
    switch heightMode {
    case .exactly:
        measuredHeight = height
    default:
        // When lineHeight is specified (e.g. monospace elements), use it
        // to cap the per-line measured height to match CSS line-height.
        if let lh = context.lineHeight {
            #if canImport(UIKit)
            let fontLineHeight = font.lineHeight
            #else
            let fontLineHeight = font.ascender - font.descender + font.leading
            #endif
            let lineCount = max(1, Int(round(measuredRect.height / fontLineHeight)))
            measuredHeight = Float(ceil(CGFloat(lineCount) * lh))
        } else {
            measuredHeight = Float(ceil(measuredRect.height))
        }
    }

    context.lastMeasuredWidth = measuredWidth
    return YGSize(width: measuredWidth, height: measuredHeight)
}
