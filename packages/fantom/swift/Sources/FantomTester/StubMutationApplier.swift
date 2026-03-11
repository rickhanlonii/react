import Foundation
import ShadowTree

// ---------------------------------------------------------------------------
// StubMutationApplier
//
// Applies mutations produced by the Differentiator to StubViews. This is
// the test harness equivalent of UIKitMutationApplier — it operates on
// StubView trees instead of UIView hierarchies.
// ---------------------------------------------------------------------------

class StubMutationApplier {

    private let viewRegistry: StubViewRegistry

    init(viewRegistry: StubViewRegistry) {
        self.viewRegistry = viewRegistry
    }

    // MARK: - Mutation application

    /// Applies an ordered list of mutations to StubViews.
    ///
    /// - Parameters:
    ///   - mutations: The mutations to apply (from `Differentiator.diff()`).
    ///   - rootView: The root StubView of the surface.
    func applyMutations(
        _ mutations: [Mutation],
        rootView: StubView
    ) {
        for mutation in mutations {
            switch mutation {
            case .create(let node):
                var props = node.props
                // ShadowTreeBuilder stores text in node.text, not props.
                // Include it so StubView JSON output contains text content.
                if let text = node.text {
                    props["text"] = text
                }
                let view = StubView(
                    elementType: node.family.elementType,
                    props: props
                )
                view.frame = node.layoutFrame
                viewRegistry.register(view: view, family: node.family)

            case .delete(let node):
                viewRegistry.unregister(family: node.family)

            case .insert(let parent, let child, let index):
                guard let parentView = viewRegistry.view(for: parent.family),
                      let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                let clampedIndex = min(index, parentView.children.count)
                parentView.children.insert(childView, at: clampedIndex)

            case .remove(let parent, let child):
                guard let parentView = viewRegistry.view(for: parent.family),
                      let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                if let idx = parentView.children.firstIndex(where: { $0 === childView }) {
                    parentView.children.remove(at: idx)
                }

            case .update(let node, _, let newProps):
                guard let view = viewRegistry.view(for: node.family) else {
                    continue
                }
                var props = newProps
                if let text = node.text {
                    props["text"] = text
                }
                view.props = props
                view.frame = node.layoutFrame
            }
        }
    }
}
