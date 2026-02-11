import Foundation
import JavaScriptCore
import ShadowTree

// ---------------------------------------------------------------------------
// TesterBridge
//
// Registers the same $$-prefixed bridge functions as NativeBridge but targets
// macOS (no UIKit). Uses StubViewRegistry and StubMutationApplier instead of
// their UIKit equivalents. Adds test-specific functions:
//   - $$getRenderedOutput(surfaceId) — serializes StubView tree to JSON
//   - $$reportResult(jsonString) — receives test results from JS runtime
// ---------------------------------------------------------------------------

class TesterBridge {

    // MARK: - Properties

    let context: JSContext
    let viewRegistry: StubViewRegistry
    let differentiator: Differentiator
    let mutationApplier: StubMutationApplier

    /// The registered JS event handler for event dispatch.
    private var eventHandler: JSManagedValue?

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Root StubViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: StubView] = [:]

    /// Test results captured from $$reportResult.
    var testResults: String?

    // MARK: - Initialization

    init(context: JSContext) {
        self.context = context
        self.viewRegistry = StubViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = StubMutationApplier(viewRegistry: viewRegistry)

        setupExceptionHandler()
        registerBridgeFunctions()
        registerEventPriorityConstants()
        registerTestFunctions()

        // Pre-register a default surface for tests
        let rootView = StubView(elementType: "root")
        rootViews[1] = rootView
        currentTrees[1] = []
    }

    // MARK: - Exception Handling

    private func setupExceptionHandler() {
        context.exceptionHandler = { _, exception in
            guard let error = exception else { return }
            let message = error.toString() ?? "Unknown JS error"
            let stack = error.objectForKeyedSubscript("stack")?.toString() ?? ""
            fputs("[fantom] JS Error: \(message)\n", stderr)
            if !stack.isEmpty {
                fputs("[fantom] Stack: \(stack)\n", stderr)
            }
        }
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
    }

    // MARK: - Test-specific Functions

    private func registerTestFunctions() {
        // $$getRenderedOutput(surfaceId) -> JSON string of StubView tree
        let getRenderedOutput: @convention(block) (Int) -> String = {
            [weak self] surfaceId in
            guard let self = self,
                  let rootView = self.rootViews[surfaceId] else {
                return "{}"
            }

            let json = rootView.toJSON()
            if let data = try? JSONSerialization.data(withJSONObject: json, options: []),
               let str = String(data: data, encoding: .utf8) {
                return str
            }
            return "{}"
        }
        context.setObject(getRenderedOutput, forKeyedSubscript: "$$getRenderedOutput" as NSString)

        // $$reportResult(jsonString) -> void
        let reportResult: @convention(block) (String) -> Void = {
            [weak self] jsonString in
            self?.testResults = jsonString
        }
        context.setObject(reportResult, forKeyedSubscript: "$$reportResult" as NSString)

        // $$dispatchEvent(targetType, eventType, payload) -> void
        let dispatchEvent: @convention(block) (String, String, [String: Any]) -> Void = {
            [weak self] targetType, eventType, payload in
            guard let self = self else { return }

            // Find the first StubView matching the target type and dispatch
            // the event to its instance handle via the event handler.
            for (_, tree) in self.currentTrees {
                if let node = self.findNode(ofType: targetType, in: tree) {
                    guard let managedHandle = node.family.instanceHandle,
                          let instanceHandle = managedHandle.value,
                          let managedHandler = self.eventHandler,
                          let handler = managedHandler.value else {
                        continue
                    }
                    handler.call(withArguments: [instanceHandle, eventType, payload])
                    return
                }
            }
        }
        context.setObject(dispatchEvent, forKeyedSubscript: "$$dispatchEvent" as NSString)
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
        let createNode: @convention(block) (String, Int, [String: Any], Bool, JSValue) -> ShadowNodeWrapper = {
            [weak self] type, surfaceId, props, isInsideTextContext, instanceHandle in

            let family = ShadowNodeFamily(
                elementType: type,
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )

            if let managedHandle = family.instanceHandle {
                self?.context.virtualMachine.addManagedReference(
                    managedHandle,
                    withOwner: family
                )
            }

            return ShadowNodeWrapper(
                props: props,
                children: [],
                family: family,
                text: nil
            )
        }
        context.setObject(createNode, forKeyedSubscript: "$$createNode" as NSString)

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

            return ShadowNodeWrapper(
                props: ["text": text],
                children: [],
                family: family,
                text: text
            )
        }
        context.setObject(createTextNode, forKeyedSubscript: "$$createTextNode" as NSString)
    }

    // MARK: - Clone Operations

    private func registerCloneOperations() {
        let cloneNode: @convention(block) (ShadowNodeWrapper) -> ShadowNodeWrapper = {
            node in
            return node.clone()
        }
        context.setObject(cloneNode, forKeyedSubscript: "$$cloneNode" as NSString)

        let cloneNodeWithNewProps: @convention(block) (ShadowNodeWrapper, [String: Any]) -> ShadowNodeWrapper = {
            node, newProps in
            return node.cloneWithNewProps(newProps)
        }
        context.setObject(cloneNodeWithNewProps, forKeyedSubscript: "$$cloneNodeWithNewProps" as NSString)

        let cloneNodeWithNewChildren: @convention(block) (ShadowNodeWrapper, JSValue) -> ShadowNodeWrapper = {
            node, childrenValue in
            if childrenValue.isUndefined || childrenValue.isNull {
                return node.cloneWithNewChildren([])
            }
            return node.cloneWithNewChildren([])
        }
        context.setObject(cloneNodeWithNewChildren, forKeyedSubscript: "$$cloneNodeWithNewChildren" as NSString)

        let cloneNodeWithNewChildrenAndProps: @convention(block) (ShadowNodeWrapper, JSValue, [String: Any]) -> ShadowNodeWrapper = {
            node, childrenValue, newProps in
            return node.cloneWithNewChildrenAndProps([], newProps)
        }
        context.setObject(cloneNodeWithNewChildrenAndProps, forKeyedSubscript: "$$cloneNodeWithNewChildrenAndProps" as NSString)
    }

    // MARK: - Tree Construction

    private func registerTreeConstruction() {
        let appendChild: @convention(block) (ShadowNodeWrapper, ShadowNodeWrapper) -> Void = {
            parentNode, childNode in
            parentNode.children.append(childNode)
        }
        context.setObject(appendChild, forKeyedSubscript: "$$appendChild" as NSString)
    }

    // MARK: - Container Operations

    private func registerContainerOperations() {
        let createChildSet: @convention(block) () -> NSMutableArray = {
            return NSMutableArray()
        }
        context.setObject(createChildSet, forKeyedSubscript: "$$createChildSet" as NSString)

        let appendChildToChildSet: @convention(block) (NSMutableArray, ShadowNodeWrapper) -> Void = {
            childSet, child in
            childSet.add(child)
        }
        context.setObject(appendChildToChildSet, forKeyedSubscript: "$$appendChildToChildSet" as NSString)

        let completeRoot: @convention(block) (Int, NSArray) -> Void = {
            [weak self] surfaceId, childNodes in
            guard let self = self else { return }

            var newChildren: [ShadowNodeWrapper] = []
            for item in childNodes {
                if let wrapper = item as? ShadowNodeWrapper {
                    newChildren.append(wrapper)
                }
            }

            let oldChildren = self.currentTrees[surfaceId] ?? []

            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil
            )

            if let rootView = self.rootViews[surfaceId] {
                self.mutationApplier.applyMutations(mutations, rootView: rootView)

                // The Differentiator does not generate insert/remove mutations
                // for root-level children (parent == nil). Sync the root view's
                // children directly from the new shadow tree.
                rootView.children = newChildren.compactMap { node in
                    self.viewRegistry.view(for: node.family)
                }
            }

            self.currentTrees[surfaceId] = newChildren
        }
        context.setObject(completeRoot, forKeyedSubscript: "$$completeRoot" as NSString)
    }

    // MARK: - Measurement

    private func registerMeasurement() {
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
        let registerHandler: @convention(block) (JSValue) -> Void = {
            [weak self] handler in
            guard let self = self else { return }
            let managed = JSManagedValue(value: handler)
            self.context.virtualMachine.addManagedReference(managed, withOwner: self)
            self.eventHandler = managed
        }
        context.setObject(registerHandler, forKeyedSubscript: "$$registerEventHandler" as NSString)
    }
}
