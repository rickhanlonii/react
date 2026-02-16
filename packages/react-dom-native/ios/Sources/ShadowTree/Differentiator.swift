import Foundation

// ---------------------------------------------------------------------------
// Differentiator
//
// Diffs an old shadow tree against a new shadow tree and produces a list of
// Mutation instructions. Called during the $$completeRoot commit pipeline
// after Yoga layout calculation.
//
// The diff algorithm walks both trees in parallel using ShadowNodeFamily
// identity to match nodes across revisions:
//
//   1. Same family, same props/layout -> skip (no mutation)
//   2. Same family, different props/layout -> Update mutation
//   3. New family not in old tree -> Create + Insert mutations
//   4. Old family not in new tree -> Remove + Delete mutations
//   5. Same family, different position -> Remove + Insert (reorder)
//
// This is a pure diffing engine. It does NOT apply mutations — that
// responsibility belongs to platform-specific appliers
// (UIKitMutationApplier, StubMutationApplier, etc.).
// ---------------------------------------------------------------------------

public class Differentiator {

    public init() {}

    // MARK: - Public API

    /// Diff old tree children against new tree children and return mutations.
    ///
    /// - Parameters:
    ///   - oldChildren: Children from the previous committed tree (may be empty
    ///     on the first commit).
    ///   - newChildren: Children from the newly constructed tree.
    ///   - parent: The parent node (nil for root-level children).
    /// - Returns: An ordered list of mutations to apply.
    public func diff(
        oldChildren: [ShadowNodeWrapper],
        newChildren: [ShadowNodeWrapper],
        parent: ShadowNodeWrapper?
    ) -> [Mutation] {
        var mutations: [Mutation] = []

        // Build a lookup of old children keyed by family identity.
        var oldByFamily: [ObjectIdentifier: ShadowNodeWrapper] = [:]
        for child in oldChildren {
            let key = ObjectIdentifier(child.family)
            oldByFamily[key] = child
        }

        // Track which old families are still present in the new tree.
        var matchedFamilies: Set<ObjectIdentifier> = []

        // Walk new children to detect creates, inserts, and updates.
        for (index, newChild) in newChildren.enumerated() {
            let familyKey = ObjectIdentifier(newChild.family)

            if let oldChild = oldByFamily[familyKey] {
                // Existing node — check for updates.
                matchedFamilies.insert(familyKey)

                // Check if props or layout changed (identity comparison is
                // sufficient because nodes are immutable).
                if oldChild !== newChild {
                    mutations.append(.update(
                        node: newChild,
                        oldProps: oldChild.props,
                        newProps: newChild.props
                    ))
                }

                // Recursively diff children of this node.
                let childMutations = diff(
                    oldChildren: oldChild.children,
                    newChildren: newChild.children,
                    parent: newChild
                )
                mutations.append(contentsOf: childMutations)
            } else {
                // New node — create and insert.
                mutations.append(.create(node: newChild))
                if let parentNode = parent {
                    mutations.append(.insert(
                        parent: parentNode,
                        child: newChild,
                        index: index
                    ))
                }

                // Recursively create children of the new subtree.
                let subtreeMutations = createSubtree(
                    node: newChild,
                    parentIndex: 0
                )
                mutations.append(contentsOf: subtreeMutations)
            }
        }

        // Walk old children to detect removes and deletes.
        for oldChild in oldChildren {
            let familyKey = ObjectIdentifier(oldChild.family)
            if !matchedFamilies.contains(familyKey) {
                if let parentNode = parent {
                    mutations.append(.remove(
                        parent: parentNode,
                        child: oldChild
                    ))
                }
                mutations.append(.delete(node: oldChild))

                // Recursively delete the subtree.
                let deleteMutations = deleteSubtree(node: oldChild)
                mutations.append(contentsOf: deleteMutations)
            }
        }

        return mutations
    }

    // MARK: - Subtree helpers

    /// Generates Create + Insert mutations for an entire tree from scratch.
    /// Used by SSR to create the initial view tree without a previous tree.
    ///
    /// Unlike `diff(oldChildren:newChildren:parent:)`, this generates Insert
    /// mutations for root-level nodes (using a virtual root parent).
    public static func initialMutations(from rootChildren: [ShadowNodeWrapper]) -> [Mutation] {
        var mutations: [Mutation] = []
        let differ = Differentiator()

        for (index, child) in rootChildren.enumerated() {
            mutations.append(.create(node: child))
            // Root-level children are inserted directly into the rootView,
            // not into a parent ShadowNodeWrapper. UIKitMutationApplier
            // handles the rootView insertion in its loop (CREATE sets frame).
            let subtreeMutations = differ.createSubtree(node: child, parentIndex: index)
            mutations.append(contentsOf: subtreeMutations)
        }

        return mutations
    }

    /// Recursively generates Create + Insert mutations for every node in a
    /// newly inserted subtree.
    private func createSubtree(
        node: ShadowNodeWrapper,
        parentIndex: Int
    ) -> [Mutation] {
        var mutations: [Mutation] = []
        for (index, child) in node.children.enumerated() {
            mutations.append(.create(node: child))
            mutations.append(.insert(parent: node, child: child, index: index))
            let childMutations = createSubtree(node: child, parentIndex: index)
            mutations.append(contentsOf: childMutations)
        }
        return mutations
    }

    /// Recursively generates Remove + Delete mutations for every node in a
    /// deleted subtree.
    private func deleteSubtree(node: ShadowNodeWrapper) -> [Mutation] {
        var mutations: [Mutation] = []
        for child in node.children {
            mutations.append(.remove(parent: node, child: child))
            mutations.append(.delete(node: child))
            let childMutations = deleteSubtree(node: child)
            mutations.append(contentsOf: childMutations)
        }
        return mutations
    }
}
