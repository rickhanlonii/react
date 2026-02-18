import Foundation

/// A single layout difference between web and native rendering.
struct LayoutDiff: Codable {
    let path: String
    let property: String
    let web: Double
    let native: Double
    let delta: Double
    let webString: String?
    let nativeString: String?

    /// Numeric diff (backward-compatible)
    init(path: String, property: String, web: Double, native: Double, delta: Double) {
        self.path = path; self.property = property
        self.web = web; self.native = native; self.delta = delta
        self.webString = nil; self.nativeString = nil
    }

    /// String diff
    init(path: String, property: String, webString: String, nativeString: String) {
        self.path = path; self.property = property
        self.web = 0; self.native = 0; self.delta = 0
        self.webString = webString; self.nativeString = nativeString
    }

    var isStringDiff: Bool { webString != nil }
}

/// Compares web and native layout trees, returning differences.
enum LayoutComparer {

    static let defaultTolerance: Double = 1.0

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
            "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
            "fontSize", "lineHeight",
            "gap", "rowGap", "columnGap",
            "flexGrow", "flexShrink", "flexBasis",
            "minWidth", "maxWidth", "minHeight", "maxHeight",
            "top", "right", "bottom", "left",
            "borderRadius", "opacity"
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

        // Compare string style properties (only when both sides have values)
        let stringStyleProps = [
            "display", "flexDirection", "alignItems", "justifyContent",
            "flexWrap", "fontWeight",
            "overflow", "position", "textAlign",
            "color", "backgroundColor", "borderColor"
        ]

        for prop in stringStyleProps {
            if let webStr = web.styles[prop]?.stringValue,
               let nativeStr = native.styles[prop]?.stringValue {
                if webStr != nativeStr {
                    diffs.append(LayoutDiff(
                        path: path,
                        property: "styles.\(prop)",
                        webString: webStr,
                        nativeString: nativeStr
                    ))
                }
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
