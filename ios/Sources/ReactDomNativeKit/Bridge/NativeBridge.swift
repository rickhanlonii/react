import Foundation
import JavaScriptCore
import UIKit
import ShadowTree

// ---------------------------------------------------------------------------
// NativeBridge
//
// Registers all $$-prefixed bridge functions on a JSContext. These functions
// implement the persistent-mode shadow node protocol that the React
// reconciler's host config calls into.
//
// Threading: All bridge calls are synchronous on the main thread. The
// JSContext, shadow tree, Yoga layout, and UIKit all share the main thread.
//
// Exception: $$fetch is asynchronous. The call returns immediately, and
// URLSession performs the HTTP request on a background thread. Response
// chunks are delivered via callbacks dispatched to the main thread.
// ---------------------------------------------------------------------------

public class NativeBridge {

    // MARK: - Properties

    public let context: JSContext
    public let viewRegistry: ViewRegistry
    public let differentiator: Differentiator
    public let mutationApplier: UIKitMutationApplier

    /// The registered JS event handler, called for Native -> JS event dispatch.
    /// Set via $$registerEventHandler. Stored as JSManagedValue to prevent GC.
    private var eventHandler: JSManagedValue?

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: UIView] = [:]

    // MARK: - Initialization

    public init(context: JSContext) {
        self.context = context
        self.viewRegistry = ViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = UIKitMutationApplier(viewRegistry: viewRegistry)

        setupExceptionHandler()
        registerBridgeFunctions()
        registerEventPriorityConstants()
    }

    // MARK: - Exception Handling

    private func setupExceptionHandler() {
        context.exceptionHandler = { _, exception in
            guard let error = exception else { return }
            let message = error.toString() ?? "Unknown JS error"
            let stack = error.objectForKeyedSubscript("stack")?.toString() ?? ""
            print("[react-dom-native] JS Error: \(message)")
            if !stack.isEmpty {
                print("[react-dom-native] Stack: \(stack)")
            }
        }
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
        context.setObject(32, forKeyedSubscript: "$$DefaultEventPriority" as NSString)
        context.setObject(2, forKeyedSubscript: "$$DiscreteEventPriority" as NSString)
        context.setObject(8, forKeyedSubscript: "$$ContinuousEventPriority" as NSString)
    }

    // MARK: - Bridge Function Registration

    private func registerBridgeFunctions() {
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
        // $$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle) -> ShadowNodeHandle
        let createNode: @convention(block) (String, Int, [String: Any], Bool, JSValue) -> ShadowNodeWrapper = {
            [weak self] type, surfaceId, props, isInsideTextContext, instanceHandle in

            let family = ShadowNodeFamily(
                elementType: type,
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )

            // Store managed reference to prevent GC of the instance handle
            if let managedHandle = family.instanceHandle {
                self?.context.virtualMachine.addManagedReference(
                    managedHandle,
                    withOwner: family
                )
            }

            let node = ShadowNodeWrapper(
                props: props,
                children: [],
                family: family,
                text: nil
            )

            // TODO: Look up ElementDescriptor from HTMLElementRegistry
            // TODO: Apply style props to Yoga node
            // TODO: Set up text measure function if text container

            return node
        }
        context.setObject(createNode, forKeyedSubscript: "$$createNode" as NSString)

        // $$createTextNode(text, surfaceId, instanceHandle) -> ShadowNodeHandle
        let createTextNode: @convention(block) (String, Int, JSValue) -> ShadowNodeWrapper = {
            [weak self] text, surfaceId, instanceHandle in

            let family = ShadowNodeFamily(
                elementType: "#text",
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )

            if let managedHandle = family.instanceHandle {
                self?.context.virtualMachine.addManagedReference(
                    managedHandle,
                    withOwner: family
                )
            }

            let node = ShadowNodeWrapper(
                props: ["text": text],
                children: [],
                family: family,
                text: text
            )

            return node
        }
        context.setObject(createTextNode, forKeyedSubscript: "$$createTextNode" as NSString)
    }

    // MARK: - Clone Operations

    private func registerCloneOperations() {
        // $$cloneNode(node) -> ShadowNodeHandle
        let cloneNode: @convention(block) (ShadowNodeWrapper) -> ShadowNodeWrapper = {
            node in
            return node.clone()
        }
        context.setObject(cloneNode, forKeyedSubscript: "$$cloneNode" as NSString)

        // $$cloneNodeWithNewProps(node, newProps) -> ShadowNodeHandle
        let cloneNodeWithNewProps: @convention(block) (ShadowNodeWrapper, [String: Any]) -> ShadowNodeWrapper = {
            node, newProps in
            return node.cloneWithNewProps(newProps)
        }
        context.setObject(cloneNodeWithNewProps, forKeyedSubscript: "$$cloneNodeWithNewProps" as NSString)

        // $$cloneNodeWithNewChildren(node, children?) -> ShadowNodeHandle
        let cloneNodeWithNewChildren: @convention(block) (ShadowNodeWrapper, JSValue) -> ShadowNodeWrapper = {
            node, childrenValue in
            // children parameter may be undefined (passed as JSValue)
            if childrenValue.isUndefined || childrenValue.isNull {
                return node.cloneWithNewChildren([])
            }
            // If children are provided, they would be an array of ShadowNodeWrapper
            // For now, clone with empty children (the reconciler typically passes
            // undefined and then appends children individually)
            return node.cloneWithNewChildren([])
        }
        context.setObject(cloneNodeWithNewChildren, forKeyedSubscript: "$$cloneNodeWithNewChildren" as NSString)

        // $$cloneNodeWithNewChildrenAndProps(node, children?, newProps) -> ShadowNodeHandle
        let cloneNodeWithNewChildrenAndProps: @convention(block) (ShadowNodeWrapper, JSValue, [String: Any]) -> ShadowNodeWrapper = {
            node, childrenValue, newProps in
            // children parameter may be undefined
            return node.cloneWithNewChildrenAndProps([], newProps)
        }
        context.setObject(cloneNodeWithNewChildrenAndProps, forKeyedSubscript: "$$cloneNodeWithNewChildrenAndProps" as NSString)
    }

    // MARK: - Tree Construction

    private func registerTreeConstruction() {
        // $$appendChild(parentNode, childNode) -> void
        let appendChild: @convention(block) (ShadowNodeWrapper, ShadowNodeWrapper) -> Void = {
            parentNode, childNode in
            parentNode.children.append(childNode)
            // TODO: Add child's Yoga node to parent's Yoga node
        }
        context.setObject(appendChild, forKeyedSubscript: "$$appendChild" as NSString)
    }

    // MARK: - Container Operations

    private func registerContainerOperations() {
        // $$createChildSet() -> ChildSetHandle
        // Returns a mutable NSMutableArray that JS sees as an opaque handle.
        let createChildSet: @convention(block) () -> NSMutableArray = {
            return NSMutableArray()
        }
        context.setObject(createChildSet, forKeyedSubscript: "$$createChildSet" as NSString)

        // $$appendChildToChildSet(childSet, child) -> void
        let appendChildToChildSet: @convention(block) (NSMutableArray, ShadowNodeWrapper) -> Void = {
            childSet, child in
            childSet.add(child)
        }
        context.setObject(appendChildToChildSet, forKeyedSubscript: "$$appendChildToChildSet" as NSString)

        // $$completeRoot(surfaceId, childNodes) -> void
        // This is the core commit function. Triggers layout, diff, and UIKit mutations.
        let completeRoot: @convention(block) (Int, NSArray) -> Void = {
            [weak self] surfaceId, childNodes in
            guard let self = self else { return }

            print("[NativeBridge] $$completeRoot called, surfaceId: \(surfaceId), childNodes count: \(childNodes.count)")

            // 1. Convert NSArray to [ShadowNodeWrapper]
            var newChildren: [ShadowNodeWrapper] = []
            for item in childNodes {
                if let wrapper = item as? ShadowNodeWrapper {
                    newChildren.append(wrapper)
                } else {
                    print("[NativeBridge] Warning: item is not ShadowNodeWrapper, type: \(type(of: item))")
                }
            }
            print("[NativeBridge] Converted \(newChildren.count) ShadowNodeWrappers")

            // 2. Get old tree (empty on first commit)
            let oldChildren = self.currentTrees[surfaceId] ?? []
            print("[NativeBridge] Old children: \(oldChildren.count)")

            // 3. Calculate layout
            // TODO: Full Yoga layout. For now, use simple vertical stack layout.
            if let rootView = self.rootViews[surfaceId] {
                let bounds = rootView.bounds
                self.applySimpleLayout(to: newChildren, in: bounds)
            }

            // 4. Diff old tree vs new tree
            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil
            )
            print("[NativeBridge] Mutations: \(mutations.count)")

            // 5. Apply mutations to UIViews atomically
            if let rootView = self.rootViews[surfaceId] {
                print("[NativeBridge] Applying mutations to rootView")
                self.mutationApplier.applyMutations(mutations, rootView: rootView)

                // 5b. Attach root-level children to the UIKit rootView
                // The mutations create/insert the tree, but we need to add top-level nodes to the container
                for child in newChildren {
                    if let childView = self.viewRegistry.view(for: child.family) {
                        if childView.superview == nil {
                            print("[NativeBridge] Attaching root child \(child.family.elementType) to rootView")
                            rootView.addSubview(childView)
                        }
                    }
                }
            } else {
                print("[NativeBridge] Warning: No rootView for surfaceId \(surfaceId)")
            }

            // 6. Promote new tree to current tree
            self.currentTrees[surfaceId] = newChildren
            print("[NativeBridge] $$completeRoot done")
        }
        context.setObject(completeRoot, forKeyedSubscript: "$$completeRoot" as NSString)
    }

    // MARK: - Simple Layout (Temporary until Yoga)

    /// Simple vertical stack layout for demo purposes.
    /// TODO: Replace with proper Yoga layout calculation.
    private func applySimpleLayout(to nodes: [ShadowNodeWrapper], in bounds: CGRect) {
        var yOffset: CGFloat = 60 // Start below status bar
        let padding: CGFloat = 16
        let availableWidth = bounds.width - (padding * 2)

        for node in nodes {
            let height = layoutNode(node, x: padding, y: yOffset, width: availableWidth)
            yOffset += height
        }
    }

    private func layoutNode(_ node: ShadowNodeWrapper, x: CGFloat, y: CGFloat, width: CGFloat) -> CGFloat {
        let elementType = node.family.elementType

        // Estimate heights based on element type
        var height: CGFloat
        switch elementType {
        case "h1":
            height = 40
        case "h2":
            height = 32
        case "p", "span", "label":
            height = 24
        case "button":
            height = 44
            // Layout button children (spans, text)
            var childY: CGFloat = 8
            for child in node.children {
                let childHeight = layoutNode(child, x: 8, y: childY, width: width - 16)
                childY += childHeight
            }
        case "input":
            height = 44
        case "#text":
            // Text nodes fill their parent
            height = 20
        case "div":
            // Container - layout children vertically
            height = 0
            var childY = y
            for child in node.children {
                let childHeight = layoutNode(child, x: x, y: childY, width: width)
                childY += childHeight
                height += childHeight
            }
            if height == 0 { height = 20 } // Min height
        default:
            height = 30
        }

        node.layoutFrame = CGRect(x: x, y: y, width: width, height: height)

        // Now layout text children with actual parent frame
        if elementType == "h1" || elementType == "h2" || elementType == "p" || elementType == "span" || elementType == "label" {
            for child in node.children {
                if child.family.elementType == "#text" {
                    child.layoutFrame = CGRect(x: 0, y: 0, width: width, height: height)
                    print("[Layout] #text (inside \(elementType)) -> \(child.layoutFrame)")
                }
            }
        }

        print("[Layout] \(elementType) -> \(node.layoutFrame)")
        return height + 8 // Add spacing
    }

    // MARK: - Measurement

    private func registerMeasurement() {
        // $$measureNode(node, callback) -> void
        let measureNode: @convention(block) (ShadowNodeWrapper, JSValue) -> Void = {
            node, callback in
            let frame = node.layoutFrame
            callback.call(withArguments: [
                frame.origin.x,
                frame.origin.y,
                frame.size.width,
                frame.size.height
            ])
        }
        context.setObject(measureNode, forKeyedSubscript: "$$measureNode" as NSString)
    }

    // MARK: - Event Handling

    private func registerEventHandling() {
        // $$registerEventHandler(handler) -> void
        let registerHandler: @convention(block) (JSValue) -> Void = {
            [weak self] handler in
            guard let self = self else { return }
            let managed = JSManagedValue(value: handler)
            self.context.virtualMachine.addManagedReference(managed, withOwner: self)
            self.eventHandler = managed
        }
        context.setObject(registerHandler, forKeyedSubscript: "$$registerEventHandler" as NSString)
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
        guard let managedHandle = family.instanceHandle,
              let instanceHandle = managedHandle.value else {
            // InstanceHandle was GC'd - node is unmounted. Silently drop.
            return
        }

        // 3. Get the registered event handler
        guard let managedHandler = eventHandler,
              let handler = managedHandler.value else {
            print("[react-dom-native] Warning: No event handler registered")
            return
        }

        // 4. Call handler(instanceHandle, eventType, payload)
        handler.call(withArguments: [instanceHandle, eventType, payload])
    }

    // MARK: - Networking

    private func registerNetworking() {
        // $$fetch(url, headers, callback) -> void
        // Asynchronous - URLSession runs on background thread, callbacks
        // dispatched to main thread.
        let fetch: @convention(block) (String, [String: String], JSValue) -> Void = {
            urlString, headers, callback in

            print("[NativeBridge] $$fetch called: \(urlString)")

            guard let url = URL(string: urlString) else {
                print("[NativeBridge] Invalid URL: \(urlString)")
                // Dispatch error callback on main thread
                DispatchQueue.main.async {
                    callback.call(withArguments: ["error", "Invalid URL: \(urlString)"])
                }
                return
            }

            var request = URLRequest(url: url)
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }

            // Use a managed value to prevent GC of the callback during async work
            guard let managedCallback = JSManagedValue(value: callback) else {
                print("[NativeBridge] Failed to create managed callback")
                return
            }
            let vm = callback.context.virtualMachine!
            vm.addManagedReference(managedCallback, withOwner: vm)

            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                DispatchQueue.main.async {
                    guard let cb = managedCallback.value else {
                        print("[NativeBridge] Callback was garbage collected")
                        return
                    }

                    if let error = error {
                        print("[NativeBridge] Fetch error: \(error.localizedDescription)")
                        cb.call(withArguments: ["error", error.localizedDescription])
                        vm.removeManagedReference(managedCallback, withOwner: vm)
                        return
                    }

                    if let httpResponse = response as? HTTPURLResponse {
                        print("[NativeBridge] Response status: \(httpResponse.statusCode)")
                    }

                    if let data = data, let text = String(data: data, encoding: .utf8) {
                        print("[NativeBridge] Received \(data.count) bytes")
                        cb.call(withArguments: ["data", text])
                    }

                    cb.call(withArguments: ["end", ""])
                    vm.removeManagedReference(managedCallback, withOwner: vm)
                }
            }
            task.resume()
        }
        context.setObject(fetch, forKeyedSubscript: "$$fetch" as NSString)
    }
}
