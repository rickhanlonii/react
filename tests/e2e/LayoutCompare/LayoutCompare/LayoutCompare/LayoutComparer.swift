import Foundation

/// A single layout difference between web and native rendering.
struct LayoutDiff: Codable {
    let path: String
    let property: String
    let web: Double
    let native: Double
    let delta: Double
}

/// Compares web and native layout trees, returning differences.
enum LayoutComparer {

    static let defaultTolerance: Double = 2.0

    static func compare(
        web: LayoutNode,
        native: LayoutNode,
        path: String = "root",
        tolerance: Double = defaultTolerance
    ) -> [LayoutDiff] {
        var diffs: [LayoutDiff] = []

        // Compare frame properties
        let frameProps: [(String, Double, Double)] = [
            ("x", web.x, native.x),
            ("y", web.y, native.y),
            ("width", web.width, native.width),
            ("height", web.height, native.height),
        ]

        for (prop, webVal, nativeVal) in frameProps {
            let delta = webVal - nativeVal
            if abs(delta) > tolerance {
                diffs.append(LayoutDiff(
                    path: path,
                    property: prop,
                    web: webVal,
                    native: nativeVal,
                    delta: delta
                ))
            }
        }

        // Compare numeric style properties
        let numericStyleProps = [
            "marginTop", "marginRight", "marginBottom", "marginLeft",
            "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
            "fontSize"
        ]

        for prop in numericStyleProps {
            let webVal = web.styles[prop]?.numericValue ?? 0
            let nativeVal = native.styles[prop]?.numericValue ?? 0
            let delta = webVal - nativeVal
            if abs(delta) > tolerance {
                diffs.append(LayoutDiff(
                    path: path,
                    property: "styles.\(prop)",
                    web: webVal,
                    native: nativeVal,
                    delta: delta
                ))
            }
        }

        // Recurse children (matched by index)
        let count = min(web.children.count, native.children.count)
        for i in 0..<count {
            let childType = web.children[i].type
            let childPath = "\(path) > \(childType)[\(i)]"
            diffs += compare(
                web: web.children[i],
                native: native.children[i],
                path: childPath,
                tolerance: tolerance
            )
        }

        // Report child count mismatches
        if web.children.count != native.children.count {
            diffs.append(LayoutDiff(
                path: path,
                property: "childCount",
                web: Double(web.children.count),
                native: Double(native.children.count),
                delta: Double(web.children.count - native.children.count)
            ))
        }

        return diffs
    }

    static func countElements(_ node: LayoutNode) -> Int {
        return 1 + node.children.reduce(0) { $0 + countElements($1) }
    }
}
