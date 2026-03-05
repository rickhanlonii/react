import Foundation
import UIKit
import ShadowTree
import Yoga

// ---------------------------------------------------------------------------
// Bindings+DevTools
//
// Chrome DevTools Protocol (CDP) inspection methods and helper formatters.
// Provides DOM inspection, computed styles, box model, screenshots, and
// HTML serialization for the Elements panel.
// ---------------------------------------------------------------------------

extension Bindings {

    // MARK: - DevTools Screenshot Capture

    /// Captures a screenshot of the app window as a JPEG and sends it via
    /// `sendInspectorMessage` as a base64-encoded `screenshot-data` message.
    /// Called from the DevTools screencast proxy to capture frames in-process
    /// instead of shelling out to `xcrun simctl`.
    ///
    /// - Parameters:
    ///   - maxWidth: Maximum width in pixels for the rendered image. If the
    ///     window's pixel width exceeds this, the render is scaled down
    ///     proportionally. Pass 0 or negative to capture at full resolution.
    ///   - quality: JPEG compression quality from 0.0 (most compression) to
    ///     1.0 (least compression).
    public func captureScreenshot(maxWidth: Int, quality: CGFloat) {
        // Capture timestamp in the same clock domain (performanceNow µs) as
        // trace events, so the proxy doesn't need wall-clock fallback math.
        let ts = performanceNow() * 1000.0
        guard let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first,
              let window = windowScene.windows.first else {
            return
        }

        let scale = windowScene.screen.scale
        let bounds = window.bounds
        let pixelWidth = Int(bounds.width * scale)
        let pixelHeight = Int(bounds.height * scale)

        // Determine the render size — scale down if maxWidth is set and
        // the window's pixel width exceeds it.
        var renderSize = bounds.size
        if maxWidth > 0 && pixelWidth > maxWidth {
            let ratio = CGFloat(maxWidth) / CGFloat(pixelWidth)
            renderSize = CGSize(
                width: bounds.width * ratio,
                height: bounds.height * ratio
            )
        }

        let renderer = UIGraphicsImageRenderer(size: renderSize)
        let jpegData = renderer.jpegData(withCompressionQuality: quality) { _ in
            window.drawHierarchy(in: CGRect(origin: .zero, size: renderSize), afterScreenUpdates: false)
        }

        let base64 = jpegData.base64EncodedString()

        // Send the original pixel dimensions (not the possibly-downscaled
        // render size) so the proxy can map click coordinates correctly.
        let message = "{\"type\":\"screenshot-data\",\"data\":\"\(base64)\",\"width\":\(pixelWidth),\"height\":\(pixelHeight),\"scale\":\(Int(scale)),\"ts\":\(ts)}"
        sendInspectorMessage?(message)
    }

    /// Captures a screenshot during a commit if commit-level tracing is enabled.
    /// Called synchronously at the end of $$completeRoot. Uses afterScreenUpdates: false
    /// because we're on the main thread mid-commit — true would deadlock.
    /// The UIKit view properties (frames, backgrounds, text) are already set by
    /// applyMutations, so drawHierarchy captures the correct visual state.
    public func captureCommitScreenshot() {
        guard commitScreenshotsEnabled else { return }
        guard let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first,
              let window = windowScene.windows.first else {
            return
        }

        let scale = windowScene.screen.scale
        let bounds = window.bounds
        let pixelWidth = Int(bounds.width * scale)
        let pixelHeight = Int(bounds.height * scale)

        var renderSize = bounds.size
        if commitScreenshotMaxWidth > 0 && pixelWidth > commitScreenshotMaxWidth {
            let ratio = CGFloat(commitScreenshotMaxWidth) / CGFloat(pixelWidth)
            renderSize = CGSize(
                width: bounds.width * ratio,
                height: bounds.height * ratio
            )
        }

        let renderer = UIGraphicsImageRenderer(size: renderSize)
        let jpegData = renderer.jpegData(withCompressionQuality: commitScreenshotQuality) { _ in
            window.drawHierarchy(in: CGRect(origin: .zero, size: renderSize), afterScreenUpdates: true)
        }
        // Capture timestamp AFTER rendering with afterScreenUpdates:true —
        // this ensures the screenshot reflects the current commit's pixels,
        // and the timestamp aligns with when those pixels were actually drawn.
        let ts = performanceNow() * 1000.0 // ms → µs to match trace event format

        let base64 = jpegData.base64EncodedString()

        let message = "{\"type\":\"screenshot-data\",\"data\":\"\(base64)\",\"width\":\(pixelWidth),\"height\":\(pixelHeight),\"scale\":\(Int(scale)),\"ts\":\(ts)}"
        sendInspectorMessage?(message)
    }

    // MARK: - DevTools Inspector Message Delivery

    /// Delivers an inspector message from the dev server to JS.
    /// Calls the global $$onInspectorMessage function if it exists.
    public func deliverInspectorMessage(_ json: String) {
        guard let handler = engine.getGlobalProperty("$$onInspectorMessage") else { return }
        _ = engine.callFunction(handler, args: [engine.makeString(json)])
    }

    func nextInspectorNodeId() -> Int {
        inspectorNodeIdCounter += 1
        return inspectorNodeIdCounter
    }

    // MARK: - Formatting Helpers

    func styleDictToCSS(_ style: [String: Any]) -> String {
        var parts: [String] = []
        for (key, value) in style.sorted(by: { $0.key < $1.key }) {
            let cssKey = camelToKebab(key)
            if let num = value as? NSNumber {
                // Unitless properties
                let unitless: Set<String> = [
                    "opacity", "flex-grow", "flex-shrink", "z-index",
                    "font-weight", "line-height", "order"
                ]
                if unitless.contains(cssKey) {
                    parts.append("\(cssKey): \(num)")
                } else {
                    parts.append("\(cssKey): \(num)px")
                }
            } else {
                parts.append("\(cssKey): \(value)")
            }
        }
        return parts.joined(separator: "; ")
    }

    func camelToKebab(_ str: String) -> String {
        var result = ""
        for char in str {
            if char.isUppercase {
                result += "-"
                result += char.lowercased()
            } else {
                result += String(char)
            }
        }
        return result
    }

    func nodeToHTML(_ node: ShadowNodeWrapper, depth: Int = 0) -> String {
        let elementType = node.family.elementType

        if elementType == "#text" {
            return node.text ?? ""
        }

        let indent = String(repeating: "  ", count: depth)

        // Build attributes string
        var attrParts: [String] = []
        for (key, value) in node.props.sorted(by: { $0.key < $1.key }) {
            if key == "style" {
                if let styleDict = value as? [String: Any] {
                    let css = styleDictToCSS(styleDict)
                    if !css.isEmpty {
                        attrParts.append("style=\"\(css)\"")
                    }
                }
            } else if key == "children" || key == "instanceHandle" {
                continue
            } else if value is NSNull {
                continue
            } else {
                attrParts.append("\(key)=\"\(value)\"")
            }
        }

        let attrString = attrParts.isEmpty ? "" : " " + attrParts.joined(separator: " ")

        if node.children.isEmpty {
            return "\(indent)<\(elementType)\(attrString) />"
        }

        // Check if children are all text — render inline
        let allText = node.children.allSatisfy { $0.family.elementType == "#text" }
        if allText {
            let text = node.children.map { $0.text ?? "" }.joined()
            return "\(indent)<\(elementType)\(attrString)>\(text)</\(elementType)>"
        }

        var lines = ["\(indent)<\(elementType)\(attrString)>"]
        for child in node.children {
            lines.append(nodeToHTML(child, depth: depth + 1))
        }
        lines.append("\(indent)</\(elementType)>")
        return lines.joined(separator: "\n")
    }

    func nanToZero(_ value: Float) -> Float {
        return value.isNaN ? 0 : value
    }

    func formatPx(_ value: Float) -> String {
        if value.isNaN { return "0px" }
        if value == Float(Int(value)) { return "\(Int(value))px" }
        return String(format: "%.1fpx", value)
    }

    func formatYGValue(_ value: YGValue) -> String {
        switch value.unit {
        case .point: return formatPx(value.value)
        case .percent: return "\(value.value)%"
        case .auto: return "auto"
        default: return "auto"
        }
    }

    func displayToString(_ display: YGDisplay) -> String {
        switch display {
        case .flex: return "flex"
        case .block: return "block"
        case .none: return "none"
        case .inlineBlock: return "inline-block"
        default: return "flex"
        }
    }

    func positionToString(_ position: YGPositionType) -> String {
        switch position {
        case .relative: return "relative"
        case .absolute: return "absolute"
        case .static: return "static"
        default: return "relative"
        }
    }

    func flexDirectionToString(_ dir: YGFlexDirection) -> String {
        switch dir {
        case .row: return "row"
        case .column: return "column"
        case .rowReverse: return "row-reverse"
        case .columnReverse: return "column-reverse"
        default: return "column"
        }
    }

    func justifyToString(_ justify: YGJustify) -> String {
        switch justify {
        case .flexStart: return "flex-start"
        case .center: return "center"
        case .flexEnd: return "flex-end"
        case .spaceBetween: return "space-between"
        case .spaceAround: return "space-around"
        case .spaceEvenly: return "space-evenly"
        default: return "flex-start"
        }
    }

    func alignToString(_ align: YGAlign) -> String {
        switch align {
        case .auto: return "auto"
        case .flexStart: return "flex-start"
        case .center: return "center"
        case .flexEnd: return "flex-end"
        case .stretch: return "stretch"
        case .baseline: return "baseline"
        case .spaceBetween: return "space-between"
        case .spaceAround: return "space-around"
        default: return "stretch"
        }
    }

    func flexWrapToString(_ wrap: YGWrap) -> String {
        switch wrap {
        case .noWrap: return "nowrap"
        case .wrap: return "wrap"
        case .wrapReverse: return "wrap-reverse"
        default: return "nowrap"
        }
    }

    func overflowToString(_ overflow: YGOverflow) -> String {
        switch overflow {
        case .visible: return "visible"
        case .hidden: return "hidden"
        case .scroll: return "scroll"
        default: return "visible"
        }
    }

    // MARK: - CDP Inspector Methods (Direct Swift)
    //
    // These methods return [String: Any] dictionaries for direct use by
    // Swift CDP dispatch, avoiding JS↔Swift boundary crossings.

    /// Returns the full CDP DOM.Node document tree for a surface.
    func cdpGetDocumentTree(surfaceId: Int) -> [String: Any] {
        let children: [ShadowNodeWrapper]?
        if surfaceId > 0, let tree = currentTrees[surfaceId] {
            children = tree
        } else {
            children = currentTrees.values.first(where: { !$0.isEmpty })
                ?? currentTrees.values.first
        }

        guard let children = children else {
            return makeEmptyDocumentDict()
        }

        var bodyChildren: [[String: Any]] = []
        for child in children {
            bodyChildren.append(contentsOf: serializeNodeToDict(child))
        }

        let bodyId = nextInspectorNodeId()
        let headId = nextInspectorNodeId()
        let htmlId = nextInspectorNodeId()
        let docId = nextInspectorNodeId()

        let bodyNode: [String: Any] = [
            "nodeId": bodyId, "backendNodeId": bodyId,
            "nodeType": 1, "nodeName": "BODY", "localName": "body", "nodeValue": "",
            "childNodeCount": bodyChildren.count, "children": bodyChildren, "attributes": [] as [Any],
        ]
        let headNode: [String: Any] = [
            "nodeId": headId, "backendNodeId": headId,
            "nodeType": 1, "nodeName": "HEAD", "localName": "head", "nodeValue": "",
            "childNodeCount": 0, "children": [] as [Any], "attributes": [] as [Any],
        ]
        let htmlNode: [String: Any] = [
            "nodeId": htmlId, "backendNodeId": htmlId,
            "nodeType": 1, "nodeName": "HTML", "localName": "html", "nodeValue": "",
            "childNodeCount": 2, "children": [headNode, bodyNode], "attributes": [] as [Any],
        ]
        let doc: [String: Any] = [
            "nodeId": docId, "backendNodeId": docId,
            "nodeType": 9, "nodeName": "#document", "localName": "", "nodeValue": "",
            "childNodeCount": 1, "children": [htmlNode],
            "documentURL": "falcon://app", "baseURL": "falcon://app", "xmlVersion": "",
        ]
        return ["root": doc]
    }

    /// Returns CDP computedStyle for a node.
    func cdpGetComputedStyle(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["computedStyle": [] as [Any]]
        }

        var properties: [[String: String]] = []
        let yoga = node.yogaNode
        let frame = node.layoutFrame

        properties.append(["name": "width", "value": "\(frame.width)px"])
        properties.append(["name": "height", "value": "\(frame.height)px"])
        properties.append(["name": "top", "value": "\(frame.origin.y)px"])
        properties.append(["name": "left", "value": "\(frame.origin.x)px"])

        properties.append(["name": "margin-top", "value": formatPx(YGNodeLayoutGetMargin(yoga, .top))])
        properties.append(["name": "margin-right", "value": formatPx(YGNodeLayoutGetMargin(yoga, .right))])
        properties.append(["name": "margin-bottom", "value": formatPx(YGNodeLayoutGetMargin(yoga, .bottom))])
        properties.append(["name": "margin-left", "value": formatPx(YGNodeLayoutGetMargin(yoga, .left))])

        properties.append(["name": "padding-top", "value": formatPx(YGNodeLayoutGetPadding(yoga, .top))])
        properties.append(["name": "padding-right", "value": formatPx(YGNodeLayoutGetPadding(yoga, .right))])
        properties.append(["name": "padding-bottom", "value": formatPx(YGNodeLayoutGetPadding(yoga, .bottom))])
        properties.append(["name": "padding-left", "value": formatPx(YGNodeLayoutGetPadding(yoga, .left))])

        properties.append(["name": "border-top-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .top))])
        properties.append(["name": "border-right-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .right))])
        properties.append(["name": "border-bottom-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .bottom))])
        properties.append(["name": "border-left-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .left))])

        properties.append(["name": "display", "value": displayToString(YGNodeStyleGetDisplay(yoga))])
        properties.append(["name": "position", "value": positionToString(YGNodeStyleGetPositionType(yoga))])
        properties.append(["name": "flex-direction", "value": flexDirectionToString(YGNodeStyleGetFlexDirection(yoga))])
        properties.append(["name": "justify-content", "value": justifyToString(YGNodeStyleGetJustifyContent(yoga))])
        properties.append(["name": "align-items", "value": alignToString(YGNodeStyleGetAlignItems(yoga))])
        properties.append(["name": "align-self", "value": alignToString(YGNodeStyleGetAlignSelf(yoga))])
        properties.append(["name": "align-content", "value": alignToString(YGNodeStyleGetAlignContent(yoga))])
        properties.append(["name": "flex-wrap", "value": flexWrapToString(YGNodeStyleGetFlexWrap(yoga))])
        properties.append(["name": "overflow", "value": overflowToString(YGNodeStyleGetOverflow(yoga))])

        properties.append(["name": "flex-grow", "value": "\(YGNodeStyleGetFlexGrow(yoga))"])
        properties.append(["name": "flex-shrink", "value": "\(YGNodeStyleGetFlexShrink(yoga))"])
        properties.append(["name": "flex-basis", "value": formatYGValue(YGNodeStyleGetFlexBasis(yoga))])

        let gap = YGNodeStyleGetGap(yoga, .all)
        if gap.unit != .undefined { properties.append(["name": "gap", "value": formatYGValue(gap)]) }
        let rowGap = YGNodeStyleGetGap(yoga, .row)
        if rowGap.unit != .undefined { properties.append(["name": "row-gap", "value": formatYGValue(rowGap)]) }
        let columnGap = YGNodeStyleGetGap(yoga, .column)
        if columnGap.unit != .undefined { properties.append(["name": "column-gap", "value": formatYGValue(columnGap)]) }

        let style = node.props["style"] as? [String: Any] ?? [:]
        let visualKeys = [
            "color", "backgroundColor", "opacity",
            "fontSize", "fontWeight", "fontFamily", "fontStyle",
            "borderRadius", "borderColor", "borderStyle",
            "textAlign", "textDecoration", "lineHeight"
        ]
        for key in visualKeys {
            if let val = style[key] {
                let cssKey = camelToKebab(key)
                if let num = val as? NSNumber {
                    let unitless: Set<String> = ["opacity", "font-weight", "line-height"]
                    if unitless.contains(cssKey) {
                        properties.append(["name": cssKey, "value": "\(num)"])
                    } else {
                        properties.append(["name": cssKey, "value": "\(num)px"])
                    }
                } else {
                    properties.append(["name": cssKey, "value": "\(val)"])
                }
            }
        }

        return ["computedStyle": properties]
    }

    /// Returns CDP inline style for a node.
    func cdpGetInlineStyle(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["cssProperties": [] as [Any], "shorthandEntries": [] as [Any]]
        }

        let style = node.props["style"] as? [String: Any] ?? [:]
        var cssProps: [[String: String]] = []
        for (key, value) in style.sorted(by: { $0.key < $1.key }) {
            let cssKey = camelToKebab(key)
            if let num = value as? NSNumber {
                let unitless: Set<String> = [
                    "opacity", "flex-grow", "flex-shrink", "z-index",
                    "font-weight", "line-height", "order"
                ]
                if unitless.contains(cssKey) {
                    cssProps.append(["name": cssKey, "value": "\(num)"])
                } else {
                    cssProps.append(["name": cssKey, "value": "\(num)px"])
                }
            } else {
                cssProps.append(["name": cssKey, "value": "\(value)"])
            }
        }

        return ["cssProperties": cssProps, "shorthandEntries": [] as [Any]]
    }

    /// Returns CDP outerHTML for a node.
    func cdpGetOuterHTML(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["outerHTML": ""]
        }
        return ["outerHTML": nodeToHTML(node)]
    }

    /// Returns CDP box model for a node.
    func cdpGetBoxModel(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["model": [
                "content": [0,0,0,0,0,0,0,0], "padding": [0,0,0,0,0,0,0,0],
                "border": [0,0,0,0,0,0,0,0], "margin": [0,0,0,0,0,0,0,0],
                "width": 0, "height": 0,
            ] as [String: Any]]
        }

        let yoga = node.yogaNode
        let frame = node.layoutFrame

        let mt = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .top)))
        let mr = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .right)))
        let mb = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .bottom)))
        let ml = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .left)))

        let bt = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .top)))
        let br_ = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .right)))
        let bb = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .bottom)))
        let bl = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .left)))

        let pt = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .top)))
        let pr = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .right)))
        let pb = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .bottom)))
        let pl = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .left)))

        var absX = frame.origin.x
        var absY = frame.origin.y
        if let view = viewRegistry.view(for: node.family) {
            let absFrame = view.convert(view.bounds, to: nil)
            absX = absFrame.origin.x
            absY = absFrame.origin.y
        }

        let w = frame.width
        let h = frame.height

        let mx0 = absX - ml, my0 = absY - mt
        let mx1 = absX + w + mr, my1 = absY + h + mb
        let marginQuad = [mx0, my0, mx1, my0, mx1, my1, mx0, my1].map { Double($0) }

        let bx0 = absX, by0 = absY
        let bx1 = absX + w, by1 = absY + h
        let borderQuad = [bx0, by0, bx1, by0, bx1, by1, bx0, by1].map { Double($0) }

        let px0 = absX + bl, py0 = absY + bt
        let px1 = absX + w - br_, py1 = absY + h - bb
        let paddingQuad = [px0, py0, px1, py0, px1, py1, px0, py1].map { Double($0) }

        let cx0 = px0 + pl, cy0 = py0 + pt
        let cx1 = px1 - pr, cy1 = py1 - pb
        let contentQuad = [cx0, cy0, cx1, cy0, cx1, cy1, cx0, cy1].map { Double($0) }

        return ["model": [
            "content": contentQuad, "padding": paddingQuad,
            "border": borderQuad, "margin": marginQuad,
            "width": Double(w), "height": Double(h),
        ] as [String: Any]]
    }

    /// Returns process memory stats.
    func cdpGetMemoryUsage() -> [String: Any] {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        if result == KERN_SUCCESS {
            return ["usedSize": info.resident_size, "totalSize": info.virtual_size]
        }
        return ["usedSize": 0, "totalSize": 0]
    }

    /// Returns full body HTML for web preview rendering.
    func cdpGetPreviewHTML() -> [String: Any] {
        let docResult = cdpGetDocumentTree(surfaceId: 0)
        guard let root = docResult["root"] as? [String: Any],
              let rootChildren = root["children"] as? [[String: Any]],
              let htmlNode = rootChildren.first,
              let htmlChildren = htmlNode["children"] as? [[String: Any]],
              htmlChildren.count > 1,
              let bodyNode = htmlChildren.last,
              let bodyChildren = bodyNode["children"] as? [[String: Any]] else {
            return ["html": ""]
        }

        var parts: [String] = []
        for child in bodyChildren {
            if let childNodeId = child["nodeId"] as? Int {
                let outerResult = cdpGetOuterHTML(nodeId: childNodeId)
                if let outerHTML = outerResult["outerHTML"] as? String, !outerHTML.isEmpty {
                    parts.append(outerHTML)
                }
            }
        }
        return ["html": parts.joined(separator: "\n")]
    }

    // MARK: - CDP Node Serialization (Dictionary)

    /// Recursively serializes a ShadowNodeWrapper into CDP DOM.Node dict format.
    /// Returns an array — normally one element, but #suspense nodes are flattened.
    func serializeNodeToDict(_ node: ShadowNodeWrapper) -> [[String: Any]] {
        let elementType = node.family.elementType

        if elementType == "#suspense" {
            var results: [[String: Any]] = []
            for child in node.children {
                results.append(contentsOf: serializeNodeToDict(child))
            }
            return results
        }

        var nodeId = 0
        for (id, registeredNode) in nodeRegistry where registeredNode === node {
            nodeId = id
            break
        }
        if nodeId == 0 {
            nodeId = registerNode(node)
        }

        var jsNode: [String: Any]

        if elementType == "#text" {
            jsNode = [
                "nodeId": nodeId, "backendNodeId": nodeId,
                "nodeType": 3, "nodeName": "#text", "localName": "",
                "nodeValue": node.text ?? "",
                "childNodeCount": 0, "children": [] as [Any],
            ]
        } else {
            var attrs: [String] = []
            for (key, value) in node.props {
                if key == "style" {
                    if let styleDict = value as? [String: Any] {
                        let cssString = styleDictToCSS(styleDict)
                        if !cssString.isEmpty {
                            attrs.append("style")
                            attrs.append(cssString)
                        }
                    }
                } else if key == "children" || key == "instanceHandle" {
                    continue
                } else if value is NSNull {
                    continue
                } else if let fn = value as? AnyObject, "\(type(of: fn))".contains("Function") {
                    attrs.append(key)
                    attrs.append("true")
                } else {
                    attrs.append(key)
                    attrs.append("\(value)")
                }
            }

            var childNodes: [[String: Any]] = []
            for child in node.children {
                childNodes.append(contentsOf: serializeNodeToDict(child))
            }

            jsNode = [
                "nodeId": nodeId, "backendNodeId": nodeId,
                "nodeType": 1, "nodeName": elementType.uppercased(), "localName": elementType,
                "nodeValue": "",
                "childNodeCount": childNodes.count, "children": childNodes, "attributes": attrs,
            ]
        }

        return [jsNode]
    }

    /// Returns an empty document tree as a dictionary.
    func makeEmptyDocumentDict() -> [String: Any] {
        let bodyId = nextInspectorNodeId()
        let headId = nextInspectorNodeId()
        let htmlId = nextInspectorNodeId()
        let docId = nextInspectorNodeId()

        let bodyNode: [String: Any] = [
            "nodeId": bodyId, "backendNodeId": bodyId,
            "nodeType": 1, "nodeName": "BODY", "localName": "body", "nodeValue": "",
            "childNodeCount": 0, "children": [] as [Any], "attributes": [] as [Any],
        ]
        let headNode: [String: Any] = [
            "nodeId": headId, "backendNodeId": headId,
            "nodeType": 1, "nodeName": "HEAD", "localName": "head", "nodeValue": "",
            "childNodeCount": 0, "children": [] as [Any], "attributes": [] as [Any],
        ]
        let htmlNode: [String: Any] = [
            "nodeId": htmlId, "backendNodeId": htmlId,
            "nodeType": 1, "nodeName": "HTML", "localName": "html", "nodeValue": "",
            "childNodeCount": 2, "children": [headNode, bodyNode], "attributes": [] as [Any],
        ]
        let doc: [String: Any] = [
            "nodeId": docId, "backendNodeId": docId,
            "nodeType": 9, "nodeName": "#document", "localName": "", "nodeValue": "",
            "childNodeCount": 1, "children": [htmlNode],
            "documentURL": "falcon://app", "baseURL": "falcon://app", "xmlVersion": "",
        ]
        return ["root": doc]
    }
}
