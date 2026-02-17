import Foundation
import ShadowTree
import JSEngine
import Yoga

// ---------------------------------------------------------------------------
// TesterBridge
//
// Registers the same $$-prefixed functions as Bindings but targets macOS
// (no UIKit). Uses StubViewRegistry and StubMutationApplier instead of their
// UIKit equivalents. Adds test-specific functions:
//   - $$getRenderedOutput(surfaceId) — serializes StubView tree to JSON
//   - $$reportResult(jsonString) — receives test results from JS runtime
//   - $$dispatchEvent(targetType, eventType, payload) — simulate events
//
// Uses the same integer node ID approach as Bindings for passing node
// identity across the JS↔Swift boundary.
// ---------------------------------------------------------------------------

class TesterBridge {

    // MARK: - Properties

    let engine: JSEngine
    let viewRegistry: StubViewRegistry
    let differentiator: Differentiator
    let mutationApplier: StubMutationApplier

    /// The registered JS event handler for event dispatch.
    private var eventHandler: JSValueRef?

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// SSR trees registered for hydration traversal. Keyed by surfaceId.
    private var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Maps SSR nodes to their parent for resilient sibling lookups.
    private var ssrNodeToParent: [ObjectIdentifier: ShadowNodeWrapper] = [:]

    /// Root StubViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: StubView] = [:]

    /// Test results captured from $$reportResult.
    var testResults: String?

    // MARK: - Node Registry

    private var nodeRegistry: [Int: ShadowNodeWrapper] = [:]
    private var nextNodeId = 1

    private var childSetRegistry: [Int: [ShadowNodeWrapper]] = [:]
    private var nextChildSetId = 1

    private func registerNode(_ node: ShadowNodeWrapper) -> Int {
        let id = nextNodeId
        nextNodeId += 1
        nodeRegistry[id] = node
        return id
    }

    private func lookupNode(_ ref: JSValueRef) -> ShadowNodeWrapper? {
        guard let id = engine.toInt(ref) else { return nil }
        return nodeRegistry[id]
    }

    // MARK: - Initialization

    init(engine: JSEngine) {
        self.engine = engine
        self.viewRegistry = StubViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = StubMutationApplier(viewRegistry: viewRegistry)

        registerBridgeFunctions()
        registerEventPriorityConstants()
        registerTestFunctions()

        // Pre-register a default surface for tests
        let rootView = StubView(elementType: "root")
        rootViews[1] = rootView
        currentTrees[1] = []
    }

    // MARK: - Event Priority Constants

    private func registerEventPriorityConstants() {
        engine.setGlobalProperty("$$DefaultEventPriority", engine.makeNumber(32))
        engine.setGlobalProperty("$$DiscreteEventPriority", engine.makeNumber(2))
        engine.setGlobalProperty("$$ContinuousEventPriority", engine.makeNumber(8))
    }

    // MARK: - Bridge Function Registration

    private func registerBridgeFunctions() {
        registerNodeCreation()
        registerCloneOperations()
        registerTreeConstruction()
        registerContainerOperations()
        registerMeasurement()
        registerEventHandling()
        registerHydrationTraversal()
    }

    // MARK: - Test-specific Functions

    private func registerTestFunctions() {
        // $$getRenderedOutput(surfaceId) -> JSON string of StubView tree
        engine.setGlobalFunction("$$getRenderedOutput") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            guard let rootView = self.rootViews[surfaceId] else {
                return engine.makeString("{}")
            }

            let json = rootView.toJSON()
            if let data = try? JSONSerialization.data(withJSONObject: json, options: []),
               let str = String(data: data, encoding: .utf8) {
                return engine.makeString(str)
            }
            return engine.makeString("{}")
        }

        // $$reportResult(jsonString) -> void
        engine.setGlobalFunction("$$reportResult") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            self.testResults = engine.toString(args[0])
            return nil
        }

        // $$dispatchEvent(targetType, eventType, payload) -> void
        engine.setGlobalFunction("$$dispatchEvent") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let targetType = engine.toString(args[0]) ?? ""
            let eventType = engine.toString(args[1]) ?? ""
            let payload = engine.toDictionary(args[2]) ?? [:]

            for (_, tree) in self.currentTrees {
                if let node = self.findNode(ofType: targetType, in: tree) {
                    guard let instanceHandle = node.family.instanceHandle,
                          let handler = self.eventHandler else {
                        continue
                    }
                    _ = engine.callFunction(handler, args: [
                        instanceHandle,
                        engine.makeString(eventType),
                        engine.wrapNativeObject(payload as NSDictionary)
                    ])
                    return nil
                }
            }
            return nil
        }

        // $$getRenderedNodeIds(surfaceId) -> [nodeId]
        // Returns the node IDs for the current tree's root children.
        engine.setGlobalFunction("$$getRenderedNodeIds") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            guard let tree = self.currentTrees[surfaceId] else {
                return engine.makeArray([])
            }
            let ids: [JSValueRef] = tree.compactMap { node in
                // Find the node ID in the registry
                for (id, registeredNode) in self.nodeRegistry where registeredNode === node {
                    return engine.makeNumber(Double(id))
                }
                return nil
            }
            return engine.makeArray(ids)
        }
    }

    /// Finds a shadow node by element type in the tree (depth-first).
    private func findNode(ofType type: String, in children: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
        for child in children {
            if child.family.elementType == type {
                return child
            }
            if let found = findNode(ofType: type, in: child.children) {
                return found
            }
        }
        return nil
    }

    // MARK: - Node Creation

    private func registerNodeCreation() {
        engine.setGlobalFunction("$$createNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let type = engine.toString(args[0]) ?? "div"
            let surfaceId = engine.toInt(args[1]) ?? 0
            var props = engine.toDictionary(args[2]) ?? [:]
            let instanceHandle = args[4]

            // Merge element-type defaults with user-supplied style
            let userStyle = props["style"] as? [String: Any]
            let mergedStyle = ElementDefaults.mergedStyle(for: type, userStyle: userStyle)
            if !mergedStyle.isEmpty {
                props["style"] = mergedStyle
            }

            let family = ShadowNodeFamily(
                elementType: type,
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )
            engine.protect(instanceHandle)

            let node = ShadowNodeWrapper(
                props: props, children: [], family: family, text: nil
            )

            // Apply style props to Yoga node
            if let style = props["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: node.yogaNode)
            }

            let nodeId = self.registerNode(node)
            return engine.makeNumber(Double(nodeId))
        }

        engine.setGlobalFunction("$$createTextNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let text = engine.toString(args[0]) ?? ""
            let surfaceId = engine.toInt(args[1]) ?? 0
            let instanceHandle = args[2]

            let family = ShadowNodeFamily(
                elementType: "#text",
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )
            engine.protect(instanceHandle)

            let node = ShadowNodeWrapper(
                props: ["text": text], children: [], family: family, text: text
            )

            // Set up text measurement on the yogaNode
            YogaTextMeasure.setupMeasureFunc(on: node)

            let nodeId = self.registerNode(node)
            return engine.makeNumber(Double(nodeId))
        }
    }

    // MARK: - Clone Operations

    private func registerCloneOperations() {
        engine.setGlobalFunction("$$cloneNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let newId = self.registerNode(node.clone())
            return engine.makeNumber(Double(newId))
        }

        engine.setGlobalFunction("$$cloneNodeWithNewProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            var newProps = engine.toDictionary(args[1]) ?? [:]
            // Merge element-type defaults with user-supplied style
            let elementType = node.family.elementType
            let userStyle = newProps["style"] as? [String: Any]
            let mergedStyle = ElementDefaults.mergedStyle(for: elementType, userStyle: userStyle)
            if !mergedStyle.isEmpty {
                newProps["style"] = mergedStyle
            }
            let cloned = node.cloneWithNewProps(newProps)
            // Apply new style to the cloned yogaNode
            if let style = newProps["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: cloned.yogaNode)
            }
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        engine.setGlobalFunction("$$cloneNodeWithNewChildren") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let newId = self.registerNode(node.cloneWithNewChildren([]))
            return engine.makeNumber(Double(newId))
        }

        engine.setGlobalFunction("$$cloneNodeWithNewChildrenAndProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            var newProps = engine.toDictionary(args[2]) ?? [:]
            // Merge element-type defaults with user-supplied style
            let elementType = node.family.elementType
            let userStyle = newProps["style"] as? [String: Any]
            let mergedStyle = ElementDefaults.mergedStyle(for: elementType, userStyle: userStyle)
            if !mergedStyle.isEmpty {
                newProps["style"] = mergedStyle
            }
            let cloned = node.cloneWithNewChildrenAndProps([], newProps)
            // Apply new style to the cloned yogaNode
            if let style = newProps["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: cloned.yogaNode)
            }
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }
    }

    // MARK: - Tree Construction

    private func registerTreeConstruction() {
        engine.setGlobalFunction("$$appendChild") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let parent = self.lookupNode(args[0]),
                  let child = self.lookupNode(args[1]) else { return nil }
            let index = parent.children.count
            parent.children.append(child)
            // Wire up Yoga parent-child relationship
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(parent.yogaNode, child.yogaNode, index)

            // If the child is a #text node, inherit font properties from parent for
            // accurate Yoga measurement.
            if child.family.elementType == "#text" {
                let style = parent.props["style"] as? [String: Any] ?? [:]
                let fontSize: CGFloat
                if let fs = style["fontSize"] as? NSNumber {
                    fontSize = CGFloat(fs.doubleValue)
                } else {
                    fontSize = 16
                }
                let fontWeight = style["fontWeight"] as? String
                let fontFamily = style["fontFamily"] as? String
                let fontStyle = style["fontStyle"] as? String

                YogaTextMeasure.cleanupMeasureContext(for: child.yogaNode)
                YogaTextMeasure.setupMeasureFunc(
                    on: child,
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                    fontFamily: fontFamily,
                    fontStyle: fontStyle
                )
            }

            return nil
        }
    }

    // MARK: - Container Operations

    private func registerContainerOperations() {
        engine.setGlobalFunction("$$createChildSet") { [weak self, weak engine] _ in
            guard let self = self, let engine = engine else { return nil }
            let id = self.nextChildSetId
            self.nextChildSetId += 1
            self.childSetRegistry[id] = []
            return engine.makeNumber(Double(id))
        }

        engine.setGlobalFunction("$$appendChildToChildSet") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let childSetId = engine.toInt(args[0]) ?? 0
            guard let child = self.lookupNode(args[1]) else { return nil }
            self.childSetRegistry[childSetId]?.append(child)
            return nil
        }

        engine.setGlobalFunction("$$completeRoot") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0

            // args[1] is an array of native node IDs from the JS host config
            let childRefs = engine.toArray(args[1]) ?? []
            let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
                guard let id = engine.toInt(ref) else { return nil }
                return self.nodeRegistry[id]
            }

            let oldChildren = self.currentTrees[surfaceId] ?? []

            // Calculate layout using Yoga (use a default test viewport size)
            self.calculateYogaLayout(for: newChildren, width: 390, height: 844)

            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil
            )

            if let rootView = self.rootViews[surfaceId] {
                self.mutationApplier.applyMutations(mutations, rootView: rootView)
                rootView.children = newChildren.compactMap { node in
                    self.viewRegistry.view(for: node.family)
                }
            }

            self.currentTrees[surfaceId] = newChildren
            return nil
        }
    }

    // MARK: - Yoga Layout

    /// Calculate layout using Yoga for the given top-level children.
    /// Uses a fixed viewport size for headless testing.
    private func calculateYogaLayout(for children: [ShadowNodeWrapper], width: Float, height: Float) {
        guard !children.isEmpty else { return }

        let rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetWidth(rootNode, width)
        YGNodeStyleSetHeight(rootNode, height)

        for (index, child) in children.enumerated() {
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(rootNode, child.yogaNode, index)
        }

        YGNodeCalculateLayout(rootNode, width, height, .LTR)

        for child in children {
            readYogaLayout(from: child)
        }

        YGNodeRemoveAllChildren(rootNode)
        YGNodeFree(rootNode)
    }

    /// Recursively read Yoga layout results into each node's layoutFrame.
    private func readYogaLayout(from node: ShadowNodeWrapper) {
        node.layoutFrame = CGRect(
            x: CGFloat(YGNodeLayoutGetLeft(node.yogaNode)),
            y: CGFloat(YGNodeLayoutGetTop(node.yogaNode)),
            width: CGFloat(YGNodeLayoutGetWidth(node.yogaNode)),
            height: CGFloat(YGNodeLayoutGetHeight(node.yogaNode))
        )
        for child in node.children {
            readYogaLayout(from: child)
        }
    }

    // MARK: - Measurement

    private func registerMeasurement() {
        engine.setGlobalFunction("$$measureNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let callback = args[1]
            let frame = node.layoutFrame
            _ = engine.callFunction(callback, args: [
                engine.makeNumber(Double(frame.origin.x)),
                engine.makeNumber(Double(frame.origin.y)),
                engine.makeNumber(Double(frame.size.width)),
                engine.makeNumber(Double(frame.size.height))
            ])
            return nil
        }
    }

    // MARK: - Event Handling

    private func registerEventHandling() {
        engine.setGlobalFunction("$$registerEventHandler") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let handler = args[0]
            engine.protect(handler)
            if let oldHandler = self.eventHandler {
                engine.unprotect(oldHandler)
            }
            self.eventHandler = handler
            return nil
        }
    }

    // MARK: - Hydration Traversal

    private func registerHydrationTraversal() {
        // $$registerSSRTree(surfaceId, nodeIds) -> void
        // Called from JS to register an SSR tree for hydration.
        // nodeIds is an array of root-level SSR node IDs.
        engine.setGlobalFunction("$$registerSSRTree") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            let nodeRefs = engine.toArray(args[1]) ?? []
            let nodes: [ShadowNodeWrapper] = nodeRefs.compactMap { ref in
                guard let id = engine.toInt(ref) else { return nil }
                return self.nodeRegistry[id]
            }
            self.ssrTrees[surfaceId] = nodes
            // Build parent map for resilient sibling lookups
            for child in nodes {
                self.buildParentMap(child)
            }
            return nil
        }

        // $$getFirstSSRChild(surfaceId) -> {nodeId, type} | null
        // Returns the first root-level child of the SSR tree for a surface.
        engine.setGlobalFunction("$$getFirstSSRChild") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            guard let tree = self.ssrTrees[surfaceId], let first = tree.first else {
                return nil
            }
            return self.makeSSRNodeRef(first, engine: engine)
        }

        // $$getSSRChildOf(nodeId) -> {nodeId, type} | null
        // Returns the first child of an SSR node.
        engine.setGlobalFunction("$$getSSRChildOf") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            guard let first = node.children.first else { return nil }
            return self.makeSSRNodeRef(first, engine: engine)
        }

        // $$getNextSSRSibling(nodeId) -> {nodeId, type} | null
        // Returns the next sibling of an SSR node.
        engine.setGlobalFunction("$$getNextSSRSibling") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }

            // Find this node in its parent's children array
            // Walk all SSR trees and current trees to find the parent
            if let sibling = self.findNextSibling(of: node) {
                return self.makeSSRNodeRef(sibling, engine: engine)
            }
            return nil
        }

        // $$clearSSRTree(surfaceId) -> void
        // Cleans up the SSR tree after hydration completes.
        engine.setGlobalFunction("$$clearSSRTree") { [weak self] args in
            guard let self = self else { return nil }
            let surfaceId = (self.engine.toInt(args[0])) ?? 0
            self.ssrTrees.removeValue(forKey: surfaceId)
            self.ssrNodeToParent.removeAll()
            return nil
        }
    }

    /// Creates a JS object representing an SSR node for hydration traversal.
    /// Returns { _ssrNodeRef: nodeId, _ssrFamily: nodeId, type: "div"|"#text", props: {...} }
    private func makeSSRNodeRef(_ node: ShadowNodeWrapper, engine: JSEngine) -> JSValueRef? {
        let nodeId = registerNode(node)
        let obj = engine.makeObject()
        engine.setProperty(obj, "_ssrNodeRef", engine.makeNumber(Double(nodeId)))
        engine.setProperty(obj, "_ssrFamily", engine.makeNumber(Double(nodeId)))
        engine.setProperty(obj, "type", engine.makeString(node.family.elementType))
        if let text = node.text {
            engine.setProperty(obj, "text", engine.makeString(text))
        }
        // For #suspense nodes, expose pending/fallback state for hydration
        if node.family.elementType == "#suspense" {
            let pending = (node.props["pending"] as? Bool) ?? false
            let fallback = (node.props["fallback"] as? Bool) ?? false
            engine.setProperty(obj, "pending", engine.makeBool(pending))
            engine.setProperty(obj, "fallback", engine.makeBool(fallback))
            if let boundaryId = node.props["boundaryId"] as? Int {
                engine.setProperty(obj, "boundaryId", engine.makeNumber(Double(boundaryId)))
            }
        }
        return obj
    }

    /// Finds the next sibling of a node by searching all known trees.
    /// Falls back to the parent map if the node is from a stale (pre-reveal) tree.
    private func findNextSibling(of target: ShadowNodeWrapper) -> ShadowNodeWrapper? {
        // Primary: search current SSR trees
        for (_, tree) in ssrTrees {
            if let sibling = findNextSiblingInChildren(target, children: tree) {
                return sibling
            }
        }

        // Fallback: use parent map for stale nodes from pre-reveal trees
        if let parent = ssrNodeToParent[ObjectIdentifier(target)] {
            if let index = parent.children.firstIndex(where: { $0 === target }),
               index + 1 < parent.children.count {
                return parent.children[index + 1]
            }
        }

        return nil
    }

    /// Recursively searches children arrays for the target node and returns the next sibling.
    private func findNextSiblingInChildren(_ target: ShadowNodeWrapper, children: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
        for (index, child) in children.enumerated() {
            if child === target {
                if index + 1 < children.count {
                    return children[index + 1]
                }
                return nil
            }
            // Recurse into children
            if let found = findNextSiblingInChildren(target, children: child.children) {
                return found
            }
        }
        return nil
    }

    /// Recursively builds the parent map for an SSR subtree.
    private func buildParentMap(_ node: ShadowNodeWrapper) {
        for child in node.children {
            ssrNodeToParent[ObjectIdentifier(child)] = node
            buildParentMap(child)
        }
    }
}
