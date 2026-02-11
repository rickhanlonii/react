import UIKit

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
//   1. Same family, same props/layout → skip (no mutation)
//   2. Same family, different props/layout → Update mutation
//   3. New family not in old tree → Create + Insert mutations
//   4. Old family not in new tree → Remove + Delete mutations
//   5. Same family, different position → Remove + Insert (reorder)
//
// Mutations are applied atomically within a CATransaction to avoid
// flickering or partial rendering.
// ---------------------------------------------------------------------------

// MARK: - Mutation types

enum Mutation {
    /// A new node needs a UIView. Dequeue from pool or create fresh.
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

// MARK: - Differentiator

class Differentiator {

    private let viewRegistry: ViewRegistry

    init(viewRegistry: ViewRegistry) {
        self.viewRegistry = viewRegistry
    }

    // MARK: - Public API

    /// Diff old tree children against new tree children and return mutations.
    ///
    /// - Parameters:
    ///   - oldChildren: Children from the previous committed tree (may be empty
    ///     on the first commit).
    ///   - newChildren: Children from the newly constructed tree.
    ///   - parent: The parent node (nil for root-level children).
    /// - Returns: An ordered list of mutations to apply.
    func diff(
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

    // MARK: - Mutation application

    /// Applies an ordered list of mutations to UIKit views atomically within
    /// a CATransaction.
    ///
    /// - Parameters:
    ///   - mutations: The mutations to apply (from `diff()`).
    ///   - rootView: The root UIView of the surface.
    func applyMutations(
        _ mutations: [Mutation],
        rootView: UIView
    ) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        for mutation in mutations {
            switch mutation {
            case .create(let node):
                let view = createView(for: node)
                viewRegistry.register(view: view, family: node.family)

            case .delete(let node):
                viewRegistry.unregister(family: node.family)

            case .insert(let parent, let child, let index):
                guard let parentView = viewRegistry.view(for: parent.family),
                      let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                parentView.insertSubview(childView, at: index)

            case .remove(_, let child):
                guard let childView = viewRegistry.view(for: child.family) else {
                    continue
                }
                childView.removeFromSuperview()

            case .update(let node, _, let newProps):
                guard let view = viewRegistry.view(for: node.family) else {
                    continue
                }
                applyProps(newProps, to: view)
                applyLayout(node.layoutFrame, to: view)
            }
        }

        CATransaction.commit()
    }

    // MARK: - View creation

    /// Creates a UIView for the given shadow node type.
    private func createView(for node: ShadowNodeWrapper) -> UIView {
        let type = node.family.elementType

        // TODO: Use a view pool for recycling.
        // TODO: Use HTMLElementRegistry to look up the correct UIView subclass.
        switch type {
        case "div", "section", "article", "nav", "header", "footer", "main", "aside":
            let view = UIView()
            applyProps(node.props, to: view)
            applyLayout(node.layoutFrame, to: view)
            return view

        case "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em",
             "b", "i", "u", "s", "a", "label", "li":
            let label = UILabel()
            label.numberOfLines = 0
            applyProps(node.props, to: label)
            applyLayout(node.layoutFrame, to: label)
            return label

        case "img":
            let imageView = UIImageView()
            imageView.contentMode = .scaleAspectFit
            applyProps(node.props, to: imageView)
            applyLayout(node.layoutFrame, to: imageView)
            return imageView

        case "button":
            let button = UIButton(type: .system)
            applyProps(node.props, to: button)
            applyLayout(node.layoutFrame, to: button)
            return button

        case "input", "textarea":
            let textField = UITextField()
            applyProps(node.props, to: textField)
            applyLayout(node.layoutFrame, to: textField)
            return textField

        default:
            // Unknown type — create a generic UIView and log a warning.
            print("[react-dom-native] Warning: Unknown element type '\(type)', using UIView")
            let view = UIView()
            applyProps(node.props, to: view)
            applyLayout(node.layoutFrame, to: view)
            return view
        }
    }

    // MARK: - Prop application

    /// Applies a props dictionary to a UIView. This is a simplified version;
    /// the full implementation will use HTMLElementRegistry descriptors.
    private func applyProps(_ props: [String: Any], to view: UIView) {
        guard let style = props["style"] as? [String: Any] else { return }

        if let bgColor = style["backgroundColor"] as? String {
            view.backgroundColor = UIColor.fromCSS(bgColor)
        }

        if let opacity = style["opacity"] as? Double {
            view.alpha = CGFloat(opacity)
        }

        if let hidden = style["display"] as? String, hidden == "none" {
            view.isHidden = true
        } else {
            view.isHidden = false
        }

        if let borderRadius = style["borderRadius"] as? Double {
            view.layer.cornerRadius = CGFloat(borderRadius)
            view.clipsToBounds = true
        }
    }

    /// Applies a layout frame to a UIView. Skips NaN/Inf values.
    private func applyLayout(_ frame: CGRect, to view: UIView) {
        guard frame.origin.x.isFinite,
              frame.origin.y.isFinite,
              frame.size.width.isFinite,
              frame.size.height.isFinite else {
            print("[react-dom-native] Warning: Skipping layout with non-finite values: \(frame)")
            return
        }
        view.frame = frame
    }
}

// MARK: - UIColor CSS helper

private extension UIColor {
    /// Parses a basic CSS color string. Supports hex (#RRGGBB, #RGB) and
    /// a small set of named colors. This is a placeholder — the full
    /// implementation will support rgb(), rgba(), hsl(), etc.
    static func fromCSS(_ css: String) -> UIColor {
        if css.hasPrefix("#") {
            return fromHex(css)
        }
        switch css.lowercased() {
        case "red": return .red
        case "green": return .green
        case "blue": return .blue
        case "black": return .black
        case "white": return .white
        case "gray", "grey": return .gray
        case "yellow": return .yellow
        case "orange": return .orange
        case "purple": return .purple
        case "cyan": return .cyan
        case "clear", "transparent": return .clear
        default: return .black
        }
    }

    private static func fromHex(_ hex: String) -> UIColor {
        var hexStr = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexStr.hasPrefix("#") {
            hexStr.removeFirst()
        }

        // Expand shorthand (#RGB → #RRGGBB)
        if hexStr.count == 3 {
            hexStr = hexStr.map { "\($0)\($0)" }.joined()
        }

        guard hexStr.count == 6,
              let value = UInt64(hexStr, radix: 16) else {
            return .black
        }

        let r = CGFloat((value >> 16) & 0xFF) / 255.0
        let g = CGFloat((value >> 8) & 0xFF) / 255.0
        let b = CGFloat(value & 0xFF) / 255.0
        return UIColor(red: r, green: g, blue: b, alpha: 1.0)
    }
}
