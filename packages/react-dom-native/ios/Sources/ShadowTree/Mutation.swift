import Foundation

// ---------------------------------------------------------------------------
// Mutation
//
// Represents a single change to apply to the view tree. Produced by the
// Differentiator during tree diffing. Consumed by platform-specific
// mutation appliers (UIKitMutationApplier for the app, StubMutationApplier
// for the test harness).
// ---------------------------------------------------------------------------

public enum Mutation {
    /// A new node needs a view. Dequeue from pool or create fresh.
    case create(node: ShadowNodeWrapper)

    /// A node was removed from the tree. Return its view to the pool.
    case delete(node: ShadowNodeWrapper)

    /// Attach a child view at a specific index in the parent.
    case insert(
        parent: ShadowNodeWrapper,
        child: ShadowNodeWrapper,
        index: Int
    )

    /// Detach a child view from its parent.
    case remove(
        parent: ShadowNodeWrapper,
        child: ShadowNodeWrapper
    )

    /// Props or layout changed. Apply new properties and frame to the view.
    case update(
        node: ShadowNodeWrapper,
        oldProps: [String: Any],
        newProps: [String: Any]
    )
}
