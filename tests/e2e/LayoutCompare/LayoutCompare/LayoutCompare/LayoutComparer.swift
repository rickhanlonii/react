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

    static let defaultTolerance: Double = 2.0

    /// Normalize color strings to a common format for comparison.
    /// Converts "rgb(r, g, b)" → "#rrggbb" so web and native values match.
    private static func normalizeColor(_ color: String) -> String {
        let trimmed = color.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("rgb(") && trimmed.hasSuffix(")") {
            let inner = trimmed.dropFirst(4).dropLast(1)
            let parts = inner.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            if parts.count == 3 {
                return String(format: "#%02x%02x%02x", parts[0], parts[1], parts[2])
            }
        }
        return trimmed
    }

    /// Normalize fontWeight keywords to numeric equivalents.
    /// CSS: "normal" = "400", "bold" = "700".
    private static func normalizeFontWeight(_ value: String) -> String {
        switch value {
        case "normal": return "400"
        case "bold": return "700"
        default: return value
        }
    }

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

        let colorProps: Set<String> = ["color", "backgroundColor", "borderColor"]

        // Elements that intentionally diverge on flexWrap (use "wrap" in Yoga to emulate CSS block text wrapping)
        let flexWrapExcluded: Set<String> = ["p", "h1", "h2", "h3", "h4", "h5", "h6"]

        for prop in stringStyleProps {
            if prop == "flexWrap" && flexWrapExcluded.contains(web.type) {
                continue
            }
            if let webStr = web.styles[prop]?.stringValue,
               let nativeStr = native.styles[prop]?.stringValue {
                let webNorm: String
                let nativeNorm: String
                if colorProps.contains(prop) {
                    webNorm = normalizeColor(webStr)
                    nativeNorm = normalizeColor(nativeStr)
                } else if prop == "fontWeight" {
                    webNorm = normalizeFontWeight(webStr)
                    nativeNorm = normalizeFontWeight(nativeStr)
                } else {
                    webNorm = webStr
                    nativeNorm = nativeStr
                }
                if webNorm != nativeNorm {
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
