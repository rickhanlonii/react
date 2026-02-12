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

    /// The registered JS event handler, called for Native -> JS event dispatch.
    /// Set via $$registerEventHandler. Protected via engine.protect().
    private var eventHandler: JSValueRef?

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: UIView] = [:]

    // MARK: - Node Registry

    /// Maps integer node IDs to ShadowNodeWrapper instances.
    /// Nodes cross the JS↔Swift boundary as integer IDs.
    private var nodeRegistry: [Int: ShadowNodeWrapper] = [:]
    private var nextNodeId = 1

    /// Maps integer child set IDs to arrays of ShadowNodeWrappers.
    private var childSetRegistry: [Int: [ShadowNodeWrapper]] = [:]
    private var nextChildSetId = 1

    /// Registers a node and returns its integer ID.
    private func registerNode(_ node: ShadowNodeWrapper) -> Int {
        let id = nextNodeId
        nextNodeId += 1
        nodeRegistry[id] = node
        return id
    }

    /// Looks up a node by its integer ID.
    private func lookupNode(_ ref: JSValueRef) -> ShadowNodeWrapper? {
        guard let id = engine.toInt(ref) else { return nil }
        return nodeRegistry[id]
    }

    // MARK: - Initialization

    public init(engine: JSEngine) {
        self.engine = engine
        self.viewRegistry = ViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = UIKitMutationApplier(viewRegistry: viewRegistry)

        registerBindingFunctions()
        registerEventPriorityConstants()
    }

    // MARK: - Surface Management

    /// Registers a root UIView for a surface. Must be called before the
    /// renderer commits to this surface.
    public func registerSurface(surfaceId: Int, rootView: UIView) {
        rootViews[surfaceId] = rootView
        currentTrees[surfaceId] = []
    }

    /// Unregisters a surface and cleans up its tree and views.
    public func unregisterSurface(surfaceId: Int) {
        rootViews.removeValue(forKey: surfaceId)
        currentTrees.removeValue(forKey: surfaceId)
    }

    // MARK: - Event Priority Constants

    private func registerEventPriorityConstants() {
        engine.setGlobalProperty("$$DefaultEventPriority", engine.makeNumber(32))
        engine.setGlobalProperty("$$DiscreteEventPriority", engine.makeNumber(2))
        engine.setGlobalProperty("$$ContinuousEventPriority", engine.makeNumber(8))
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
    }

    // MARK: - Node Creation

    private func registerNodeCreation() {
        // $$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle) -> nodeId
        engine.setGlobalFunction("$$createNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let type = engine.toString(args[0]) ?? "div"
            let surfaceId = engine.toInt(args[1]) ?? 0
            let props = engine.toDictionary(args[2]) ?? [:]
            // args[3] = isInsideTextContext (unused for now)
            let instanceHandle = args[4]

            let family = ShadowNodeFamily(
                elementType: type,
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )

            // Protect the instance handle from GC
            engine.protect(instanceHandle)

            let node = ShadowNodeWrapper(
                props: props,
                children: [],
                family: family,
                text: nil
            )

            // Apply style props to Yoga node
            if let style = props["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: node.yogaNode)
            }

            let nodeId = self.registerNode(node)
            return engine.makeNumber(Double(nodeId))
        }

        // $$createTextNode(text, surfaceId, instanceHandle) -> nodeId
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
                props: ["text": text],
                children: [],
                family: family,
                text: text
            )

            // Set up text measurement on the yogaNode
            YogaTextMeasure.setupMeasureFunc(on: node)

            let nodeId = self.registerNode(node)
            return engine.makeNumber(Double(nodeId))
        }
    }

    // MARK: - Clone Operations

    private func registerCloneOperations() {
        // $$cloneNode(nodeId) -> nodeId
        engine.setGlobalFunction("$$cloneNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let cloned = node.clone()
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        // $$cloneNodeWithNewProps(nodeId, newProps) -> nodeId
        engine.setGlobalFunction("$$cloneNodeWithNewProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let newProps = engine.toDictionary(args[1]) ?? [:]
            let cloned = node.cloneWithNewProps(newProps)
            // Apply new style to the cloned yogaNode
            if let style = newProps["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: cloned.yogaNode)
            }
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        // $$cloneNodeWithNewChildren(nodeId, children?) -> nodeId
        engine.setGlobalFunction("$$cloneNodeWithNewChildren") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            // children parameter may be undefined; the reconciler typically
            // passes undefined and then appends children individually
            let cloned = node.cloneWithNewChildren([])
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        // $$cloneNodeWithNewChildrenAndProps(nodeId, children?, newProps) -> nodeId
        engine.setGlobalFunction("$$cloneNodeWithNewChildrenAndProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let newProps = engine.toDictionary(args[2]) ?? [:]
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
        // $$appendChild(parentNodeId, childNodeId) -> void
        engine.setGlobalFunction("$$appendChild") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let parent = self.lookupNode(args[0]),
                  let child = self.lookupNode(args[1]) else {
                return nil
            }
            let index = parent.children.count
            parent.children.append(child)
            // Wire up Yoga parent-child relationship
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(parent.yogaNode, child.yogaNode, index)
            return nil
        }
    }

    // MARK: - Container Operations

    private func registerContainerOperations() {
        // $$createChildSet() -> childSetId
        engine.setGlobalFunction("$$createChildSet") { [weak self, weak engine] _ in
            guard let self = self, let engine = engine else { return nil }
            let id = self.nextChildSetId
            self.nextChildSetId += 1
            self.childSetRegistry[id] = []
            return engine.makeNumber(Double(id))
        }

        // $$appendChildToChildSet(childSetId, childNodeId) -> void
        engine.setGlobalFunction("$$appendChildToChildSet") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let childSetId = engine.toInt(args[0]) ?? 0
            guard let child = self.lookupNode(args[1]) else { return nil }
            self.childSetRegistry[childSetId]?.append(child)
            return nil
        }

        // $$completeRoot(surfaceId, childNodeIds) -> void
        // This is the core commit function. Triggers layout, diff, and UIKit mutations.
        // The JS host config passes an array of native node IDs (integers).
        engine.setGlobalFunction("$$completeRoot") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let surfaceId = engine.toInt(args[0]) ?? 0

            // args[1] is an array of native node IDs from the JS host config
            let childRefs = engine.toArray(args[1]) ?? []
            let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
                guard let id = engine.toInt(ref) else { return nil }
                return self.nodeRegistry[id]
            }

            print("[Bindings] $$completeRoot called, surfaceId: \(surfaceId), children: \(newChildren.count)")

            // 1. Get old tree (empty on first commit)
            let oldChildren = self.currentTrees[surfaceId] ?? []
            print("[Bindings] Old children: \(oldChildren.count)")

            // 2. Calculate layout using Yoga
            if let rootView = self.rootViews[surfaceId] {
                let bounds = rootView.bounds
                self.calculateYogaLayout(for: newChildren, in: bounds)
            }

            // 3. Diff old tree vs new tree
            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil
            )
            print("[Bindings] Mutations: \(mutations.count)")

            // 4. Apply mutations to UIViews atomically
            if let rootView = self.rootViews[surfaceId] {
                print("[Bindings] Applying mutations to rootView")
                self.mutationApplier.applyMutations(mutations, rootView: rootView)

                // 4b. Attach root-level children to the UIKit rootView
                for child in newChildren {
                    if let childView = self.viewRegistry.view(for: child.family) {
                        if childView.superview == nil {
                            print("[Bindings] Attaching root child \(child.family.elementType) to rootView")
                            rootView.addSubview(childView)
                        }
                    }
                }
            } else {
                print("[Bindings] Warning: No rootView for surfaceId \(surfaceId)")
            }

            // 5. Promote new tree to current tree
            self.currentTrees[surfaceId] = newChildren

            // 6. Clean up stale nodes from registry
            // Collect all node IDs still reachable from any current tree
            var liveNodes = Set<Int>()
            for (_, tree) in self.currentTrees {
                self.collectNodeIds(from: tree, into: &liveNodes)
            }
            // Remove nodes not in any current tree
            let staleIds = self.nodeRegistry.keys.filter { !liveNodes.contains($0) }
            for id in staleIds {
                self.nodeRegistry.removeValue(forKey: id)
            }

            print("[Bindings] $$completeRoot done (registry: \(self.nodeRegistry.count) nodes)")
            return nil
        }
    }

    /// Recursively collects all node IDs reachable from the given tree.
    private func collectNodeIds(from nodes: [ShadowNodeWrapper], into ids: inout Set<Int>) {
        for node in nodes {
            // Find this node's ID in the registry (reverse lookup)
            for (id, registeredNode) in nodeRegistry where registeredNode === node {
                ids.insert(id)
            }
            collectNodeIds(from: node.children, into: &ids)
        }
    }

    // MARK: - Yoga Layout

    /// Calculate layout using Yoga for the given top-level children within bounds.
    ///
    /// Creates a temporary root YGNode sized to the container, inserts
    /// top-level children, calculates layout, reads results into layoutFrame,
    /// then cleans up the temporary root.
    private func calculateYogaLayout(for children: [ShadowNodeWrapper], in bounds: CGRect) {
        guard !children.isEmpty else { return }

        // 1. Create temporary root node sized to container
        let rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetWidth(rootNode, Float(bounds.width))
        YGNodeStyleSetHeight(rootNode, Float(bounds.height))

        // 2. Insert top-level children into temporary root
        for (index, child) in children.enumerated() {
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(rootNode, child.yogaNode, index)
        }

        // 3. Calculate layout
        YGNodeCalculateLayout(rootNode, Float(bounds.width), Float(bounds.height), .LTR)

        // 4. Walk tree reading layout results into layoutFrame
        for child in children {
            readYogaLayout(from: child)
        }

        // 5. Remove children from temporary root (ownership stays with ShadowNodeWrappers)
        YGNodeRemoveAllChildren(rootNode)

        // 6. Free temporary root
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
        // $$measureNode(nodeId, callback) -> void
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
        // $$registerEventHandler(handler) -> void
        engine.setGlobalFunction("$$registerEventHandler") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let handler = args[0]
            engine.protect(handler)
            // Unprotect the old handler if there was one
            if let oldHandler = self.eventHandler {
                engine.unprotect(oldHandler)
            }
            self.eventHandler = handler
            return nil
        }
    }

    // MARK: - Event Dispatch (Native -> JS)

    /// Dispatches a native event to the JS event handler. Called from UIKit
    /// event handlers (tap gesture recognizers, scroll delegates, etc.).
    ///
    /// - Parameters:
    ///   - view: The UIView that received the event.
    ///   - eventType: The event type string (e.g. "click", "scroll", "change").
    ///   - payload: The event payload dictionary.
    public func dispatchEvent(
        from view: UIView,
        eventType: String,
        payload: [String: Any]
    ) {
        // 1. Look up the ShadowNodeFamily for this view
        guard let family = viewRegistry.family(for: view) else {
            // View not in registry - possibly already unmounted. Silently drop.
            return
        }

        // 2. Get the InstanceHandle from the family
        guard let instanceHandle = family.instanceHandle else {
            // InstanceHandle was GC'd - node is unmounted. Silently drop.
            return
        }

        // 3. Get the registered event handler
        guard let handler = eventHandler else {
            print("[react-dom-native] Warning: No event handler registered")
            return
        }

        // 4. Call handler(instanceHandle, eventType, payload)
        _ = engine.callFunction(handler, args: [
            instanceHandle,
            engine.makeString(eventType),
            engine.wrapNativeObject(payload as NSDictionary)
        ])
    }

    // MARK: - Networking

    private func registerNetworking() {
        // $$fetch(url, headers, callback) -> void
        // Asynchronous - URLSession runs on background thread, callbacks
        // dispatched to main thread.
        engine.setGlobalFunction("$$fetch") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let urlString = engine.toString(args[0]) ?? ""
            let headersDict = engine.toDictionary(args[1]) ?? [:]
            let callback = args[2]

            print("[Bindings] $$fetch called: \(urlString)")

            guard let url = URL(string: urlString) else {
                print("[Bindings] Invalid URL: \(urlString)")
                DispatchQueue.main.async { [weak engine] in
                    guard let engine = engine else { return }
                    _ = engine.callFunction(callback, args: [
                        engine.makeString("error"),
                        engine.makeString("Invalid URL: \(urlString)")
                    ])
                }
                return nil
            }

            var request = URLRequest(url: url)
            for (key, value) in headersDict {
                if let stringValue = value as? String {
                    request.setValue(stringValue, forHTTPHeaderField: key)
                }
            }

            // Protect callback from GC during async work
            engine.protect(callback)

            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                DispatchQueue.main.async { [weak engine] in
                    guard let engine = engine else { return }

                    if let error = error {
                        print("[Bindings] Fetch error: \(error.localizedDescription)")
                        _ = engine.callFunction(callback, args: [
                            engine.makeString("error"),
                            engine.makeString(error.localizedDescription)
                        ])
                        engine.unprotect(callback)
                        return
                    }

                    if let httpResponse = response as? HTTPURLResponse {
                        print("[Bindings] Response status: \(httpResponse.statusCode)")
                    }

                    if let data = data, let text = String(data: data, encoding: .utf8) {
                        print("[Bindings] Received \(data.count) bytes")
                        _ = engine.callFunction(callback, args: [
                            engine.makeString("data"),
                            engine.makeString(text)
                        ])
                    }

                    _ = engine.callFunction(callback, args: [
                        engine.makeString("end"),
                        engine.makeString("")
                    ])
                    engine.unprotect(callback)
                }
            }
            task.resume()
            return nil
        }
    }
}
