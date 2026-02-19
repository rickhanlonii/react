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

    /// Normalize a single color token to lowercase hex "#rrggbb" or "#rrggbbaa".
    /// Handles: rgb(r,g,b), rgba(r,g,b,a), #RRGGBB, #RGB.
    private static func normalizeSingleColor(_ color: String) -> String {
        let trimmed = color.trimmingCharacters(in: .whitespaces)

        // rgba(r, g, b, a)
        if trimmed.hasPrefix("rgba(") && trimmed.hasSuffix(")") {
            let inner = trimmed.dropFirst(5).dropLast(1)
            let parts = inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            if parts.count == 4,
               let r = Int(parts[0]), let g = Int(parts[1]), let b = Int(parts[2]),
               let a = Double(parts[3]) {
                if a >= 1.0 {
                    return String(format: "#%02x%02x%02x", r, g, b)
                }
                return String(format: "#%02x%02x%02x%02x", r, g, b, Int(round(a * 255)))
            }
        }

        // rgb(r, g, b)
        if trimmed.hasPrefix("rgb(") && trimmed.hasSuffix(")") {
            let inner = trimmed.dropFirst(4).dropLast(1)
            let parts = inner.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            if parts.count == 3 {
                return String(format: "#%02x%02x%02x", parts[0], parts[1], parts[2])
            }
        }

        // Already hex — lowercase it
        if trimmed.hasPrefix("#") {
            return trimmed.lowercased()
        }

        return trimmed
    }

    /// Normalize color strings to a common format for comparison.
    /// Handles multi-value border colors like "rgb(255,0,0) rgb(0,255,0)".
    private static func normalizeColor(_ color: String) -> String {
        // Split on rgb/rgba boundaries to handle multi-value border colors
        // e.g. "rgb(255, 0, 0) rgb(153, 153, 153) rgb(153, 153, 153)"
        var tokens: [String] = []
        var remaining = color.trimmingCharacters(in: .whitespaces)

        while !remaining.isEmpty {
            if remaining.hasPrefix("rgb") {
                // Find the closing paren
                if let closeIdx = remaining.firstIndex(of: ")") {
                    let token = String(remaining[remaining.startIndex...closeIdx])
                    tokens.append(normalizeSingleColor(token))
                    remaining = String(remaining[remaining.index(after: closeIdx)...])
                        .trimmingCharacters(in: .whitespaces)
                } else {
                    tokens.append(normalizeSingleColor(remaining))
                    break
                }
            } else if remaining.hasPrefix("#") {
                // Hex token — take until next space or end
                let parts = remaining.split(separator: " ", maxSplits: 1)
                tokens.append(normalizeSingleColor(String(parts[0])))
                remaining = parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespaces) : ""
            } else {
                tokens.append(normalizeSingleColor(remaining))
                break
            }
        }

        return tokens.joined(separator: " ")
    }

    /// Normalize display keywords to layout-equivalent values.
    /// CSS table display types map to "block" since Yoga uses block/flex layout.
    private static func normalizeDisplay(_ value: String) -> String {
        switch value {
        case "list-item", "table", "table-header-group", "table-row-group",
             "table-footer-group", "table-row", "table-cell", "table-caption",
             "table-column", "table-column-group":
            return "block"
        case "inline-table":
            return "inline-block"
        default:
            return value
        }
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
            "rowGap", "columnGap",
            "flexGrow", "flexShrink", "flexBasis",
            "minWidth", "maxWidth", "minHeight", "maxHeight",
            "top", "right", "bottom", "left",
            "borderRadius",
            "borderTopLeftRadius", "borderTopRightRadius",
            "borderBottomRightRadius", "borderBottomLeftRadius",
            "opacity"
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

        // Buttons/inputs: web reports "normal" for alignItems/justifyContent, but
        // native uses "center" to implement the same visual behavior. Skip these.
        let alignExcludedElements: Set<String> = ["button", "input", "select", "textarea"]
        let alignExcludedProps: Set<String> = ["alignItems", "justifyContent"]

        for prop in stringStyleProps {
            if prop == "flexWrap" && flexWrapExcluded.contains(web.type) {
                continue
            }
            if alignExcludedProps.contains(prop) && alignExcludedElements.contains(web.type) {
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
                } else if prop == "display" {
                    // Normalize display values that are equivalent for layout:
                    // "list-item" → "block", CSS table display types → "block"
                    // (Yoga can't do table layout, renders table elements as block)
                    webNorm = normalizeDisplay(webStr)
                    nativeNorm = normalizeDisplay(nativeStr)
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
