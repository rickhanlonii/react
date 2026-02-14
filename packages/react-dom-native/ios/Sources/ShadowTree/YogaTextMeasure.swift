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
    /// Retains the text string and font size for measurement.
    fileprivate class TextMeasureContext {
        let text: String
        var fontSize: CGFloat
        var lastMeasuredWidth: Float = 0

        init(text: String, fontSize: CGFloat) {
            self.text = text
            self.fontSize = fontSize
        }
    }

    /// Set up text measurement on a text node's yogaNode.
    ///
    /// - Parameters:
    ///   - node: The ShadowNodeWrapper for the text node.
    ///   - fontSize: Font size to use for measurement (default 16pt).
    public static func setupMeasureFunc(on node: ShadowNodeWrapper, fontSize: CGFloat = 16) {
        let context = TextMeasureContext(text: node.text ?? "", fontSize: fontSize)

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
    let font = UIFont.systemFont(ofSize: fontSize)
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
        measuredHeight = Float(ceil(measuredRect.height))
    }

    context.lastMeasuredWidth = measuredWidth
    return YGSize(width: measuredWidth, height: measuredHeight)
}
