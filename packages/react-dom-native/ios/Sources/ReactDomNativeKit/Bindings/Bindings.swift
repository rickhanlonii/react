import Foundation
import UIKit
import ShadowTree
import JSEngine
import Yoga

// ---------------------------------------------------------------------------
// Bindings
//
// Registers all $$-prefixed functions via the JSEngine protocol. These
// functions implement the persistent-mode shadow node protocol that the
// React reconciler's host config calls into.
//
// Node identity crosses the JS↔Swift boundary as integer IDs. The
// nodeRegistry maps these IDs to ShadowNodeWrapper instances. This
// decouples the ShadowTree from any engine-specific bridging requirements
// (no @objc, no NSObject, no JSC protocol conformance).
//
// Threading: All calls are synchronous on the main thread. The engine,
// shadow tree, Yoga layout, and UIKit all share the main thread.
//
// Exception: $$fetch is asynchronous. The call returns immediately, and
// URLSession performs the HTTP request on a background thread. Response
// chunks are delivered via callbacks dispatched to the main thread.
// ---------------------------------------------------------------------------

public class Bindings {

    // MARK: - Properties

    public let engine: JSEngine
    public let viewRegistry: ViewRegistry
    public let differentiator: Differentiator
    public let mutationApplier: UIKitMutationApplier

    /// Handles event dispatch between native UIKit views and the JS runtime.
    let eventDispatcher: EventDispatcher

    /// Whether native commit timing collection is enabled (toggled by JS via $$setNativeTracingEnabled).
    var nativeTracingEnabled = false

    /// Sub-phase timings from the most recent calculateYogaLayout call (when tracing).
    var lastLayoutTimings: [String: Double]?

    /// Sync frame timings from the most recent $$completeRoot call (when tracing).
    var lastSyncTimings: (start: Double, end: Double)?

    /// Per-node layout timings from the most recent calculateYogaLayout call (when tracing).
    var lastLayoutNodeTimings: [(type: String, start: Double, end: Double)] = []

    /// Callback used by Swift to send inspector messages to the dev server.
    /// Wired by Root to the HotReloadClient WebSocket.
    public var sendInspectorMessage: ((String) -> Void)?

    /// Current tree per surface. Keyed by surfaceId.
    var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Persistent Yoga root nodes per surface. Survives across commits so
    /// Yoga's incremental layout can skip unchanged subtrees — children that
    /// remain in the tree keep their cached layout results.
    var rootYogaNodes: [Int: YGNodeRef] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    var rootViews: [Int: UIView] = [:]

    /// SSR trees registered for hydration traversal. Keyed by surfaceId.
    var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Surfaces where hydration is in progress. Set when hydration starts,
    /// cleared on first $$completeRoot.
    var hydrationInProgress: Set<Int> = []

    /// SSR commit timings to report when tracing starts. Accumulated by Root during
    /// SSR first paint and boundary reveals, then pushed to JS when tracing is enabled.
    var pendingSSRCommitTimings: [[String: Any]] = []

    /// Maps SSR nodes to their parent for resilient sibling lookups.
    /// When a boundary reveal replaces the SSR tree, nodes from the old tree
    /// can still find siblings via their parent reference.
    var ssrNodeToParent: [ObjectIdentifier: ShadowNodeWrapper] = [:]

    /// Called when hydration completes for a surface (first $$completeRoot).
    /// Root uses this to clean up SSR infrastructure (parser, tree builder, etc.).
    public var onHydrationComplete: ((Int) -> Void)?

    // MARK: - Node Registry

    /// Maps integer node IDs to ShadowNodeWrapper instances.
    /// Nodes cross the JS↔Swift boundary as integer IDs.
    var nodeRegistry: [Int: ShadowNodeWrapper] = [:]
    var nextNodeId = 1

    /// Maps integer child set IDs to arrays of ShadowNodeWrappers.
    var childSetRegistry: [Int: [ShadowNodeWrapper]] = [:]
    var nextChildSetId = 1

    // MARK: - Initialization

    public init(engine: JSEngine) {
        self.engine = engine
        self.viewRegistry = ViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = UIKitMutationApplier(viewRegistry: viewRegistry)
        self.eventDispatcher = EventDispatcher(engine: engine, viewRegistry: viewRegistry)

        registerBindingFunctions()
        registerEventPriorityConstants()

        // Wire event dispatcher after init to avoid capturing self before initialization
        self.mutationApplier.dispatchEvent = { [weak self] view, eventType, payload in
            self?.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
        }
    }

    // MARK: - Binding Function Registration

    private func registerBindingFunctions() {
        registerNodeCreation()
        registerCloneOperations()
        registerTreeConstruction()
        registerContainerOperations()
        registerMeasurement()
        registerEventHandling()
        registerNetworking()
        registerHydrationTraversal()
    }

    // MARK: - Surface Management

    /// Registers a root UIView for a surface. Must be called before the
    /// renderer commits to this surface.
    public func registerSurface(surfaceId: Int, rootView: UIView) {
        let scrollView = UIScrollView(frame: rootView.bounds)
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.contentInsetAdjustmentBehavior = .automatic
        rootView.addSubview(scrollView)
        rootViews[surfaceId] = scrollView
        currentTrees[surfaceId] = []
        mutationApplier.installRootTapGesture(on: scrollView)
    }

    /// Returns the current shadow tree for a surface, or nil if not registered.
    public func currentTree(forSurface surfaceId: Int) -> [ShadowNodeWrapper]? {
        return currentTrees[surfaceId]
    }

    /// Unregisters a surface and cleans up its tree and views.
    public func unregisterSurface(surfaceId: Int) {
        rootViews[surfaceId]?.removeFromSuperview()
        rootViews.removeValue(forKey: surfaceId)
        currentTrees.removeValue(forKey: surfaceId)
        if let rootYoga = rootYogaNodes.removeValue(forKey: surfaceId) {
            YGNodeRemoveAllChildren(rootYoga)
            YGNodeFree(rootYoga)
        }
    }

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
        let message = "{\"type\":\"screenshot-data\",\"data\":\"\(base64)\",\"width\":\(pixelWidth),\"height\":\(pixelHeight),\"scale\":\(Int(scale))}"
        sendInspectorMessage?(message)
    }

    // MARK: - DevTools

    /// Delivers an inspector message from the dev server to JS.
    /// Calls the global $$onInspectorMessage function if it exists.
    public func deliverInspectorMessage(_ json: String) {
        guard let handler = engine.getGlobalProperty("$$onInspectorMessage") else { return }
        _ = engine.callFunction(handler, args: [engine.makeString(json)])
    }

    /// Counter for inspector-specific node IDs (document, body wrapper nodes).
    /// Shadow tree nodes use their nodeRegistry IDs directly.
    var inspectorNodeIdCounter = 900000

    func nextInspectorNodeId() -> Int {
        inspectorNodeIdCounter += 1
        return inspectorNodeIdCounter
    }

    /// Converts a style dictionary to a CSS-like string.
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

    /// Converts camelCase to kebab-case (e.g., "fontSize" → "font-size").
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
