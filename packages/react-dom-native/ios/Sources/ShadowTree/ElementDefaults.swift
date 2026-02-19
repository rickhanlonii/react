import Foundation

/// Provides per-element-type default styles for HTML elements.
///
/// Previously maintained in JS (yoga-layout/defaults.js + components/registry),
/// these defaults are now applied natively. The merge happens in Bindings.swift
/// during node creation and cloning — user-supplied styles override defaults.
public enum ElementDefaults {

    /// Returns the default style dictionary for a given HTML element type.
    public static func defaults(for elementType: String) -> [String: Any] {
        switch elementType {
        // Block containers
        case "div", "main", "section", "article", "nav", "header", "footer", "aside", "form":
            return blockDefaults
        case "address":
            return addressDefaults
        case "blockquote", "figure":
            return blockquoteDefaults
        case "figcaption":
            return blockDefaults
        case "pre":
            return preDefaults
        case "details", "search":
            return blockDefaults
        case "summary":
            return summaryDefaults
        case "dialog":
            return dialogDefaults
        case "fieldset":
            return fieldsetDefaults
        case "legend":
            return legendDefaults

        // Text containers
        case "p":
            return pDefaults
        case "h1":
            return h1Defaults
        case "h2":
            return h2Defaults
        case "h3":
            return h3Defaults
        case "h4":
            return h4Defaults
        case "h5":
            return h5Defaults
        case "h6":
            return h6Defaults

        // Inline
        case "span":
            return spanDefaults
        case "label":
            return labelDefaults

        // Inline text (bold/italic/underline/strikethrough/etc.)
        case "strong", "b":
            return boldDefaults
        case "em", "i":
            return italicDefaults
        case "u":
            return underlineDefaults
        case "s", "del":
            return strikethroughDefaults
        case "ins":
            return underlineDefaults
        case "mark":
            return markDefaults
        case "small":
            return smallDefaults
        case "code", "kbd", "samp":
            return monospaceDefaults
        case "cite", "dfn", "var":
            return italicDefaults
        case "sub", "sup":
            return smallDefaults
        case "q", "time", "abbr", "data":
            return spanDefaults

        // Lists
        case "ul", "ol":
            return listDefaults
        case "li":
            return liDefaults
        case "dl":
            return dlDefaults
        case "dt":
            return blockDefaults
        case "dd":
            return ddDefaults

        // Interactive
        case "button":
            return buttonDefaults
        case "input":
            return inputDefaults
        case "textarea":
            return textareaDefaults
        case "select":
            return selectDefaults
        case "progress":
            return progressDefaults

        // Table
        case "table", "thead", "tbody", "tfoot":
            return blockDefaults
        case "tr":
            return trDefaults
        case "th":
            return thDefaults
        case "td":
            return tdDefaults
        case "caption":
            return captionDefaults

        // Media
        case "img":
            return imgDefaults
        case "video":
            return videoDefaults
        case "audio":
            return audioDefaults
        case "picture":
            return blockDefaults
        case "meter":
            return progressDefaults
        case "iframe":
            return iframeDefaults

        // Formatting
        case "hr":
            return hrDefaults

        // Links
        case "a":
            return aDefaults

        // P3 elements
        case "menu":
            return listDefaults
        case "hgroup", "center":
            return blockDefaults
        case "bdi", "bdo", "wbr", "ruby", "rt", "rp", "output":
            return spanDefaults
        case "optgroup":
            return blockDefaults
        case "canvas":
            return canvasDefaults
        case "embed", "object":
            return inlineBlockDefaults

        // Unknown elements: block layout
        default:
            return blockDefaults
        }
    }

    /// Merges element-type defaults with user-supplied style.
    /// User style overrides defaults. CSS `border` shorthand is expanded.
    /// Em-relative margins are recomputed when fontSize is overridden.
    public static func mergedStyle(
        for elementType: String,
        userStyle: [String: Any]?
    ) -> [String: Any] {
        let defaults = self.defaults(for: elementType)
        guard let userStyle = userStyle, !userStyle.isEmpty else {
            return defaults
        }
        guard !defaults.isEmpty else {
            return expandBorderShorthand(userStyle)
        }
        var merged = defaults
        for (key, value) in userStyle {
            merged[key] = value
        }

        // CSS margins specified in `em` units scale with fontSize.
        // When the user overrides fontSize but not margins, recompute
        // margins to match CSS behavior (e.g., <p> margin = 1em).
        if let multiplier = emMarginMultiplier[elementType],
           let userFontSize = userStyle["fontSize"],
           let fontSize = toDouble(userFontSize) {
            if userStyle["marginTop"] == nil {
                merged["marginTop"] = fontSize * multiplier
            }
            if userStyle["marginBottom"] == nil {
                merged["marginBottom"] = fontSize * multiplier
            }
        }

        return expandBorderShorthand(merged)
    }

    /// Em multiplier for default vertical margins. CSS uses `em` units for
    /// element default margins, which scale with fontSize.
    private static let emMarginMultiplier: [String: Double] = [
        "p": 1.0,
        "h1": 0.67,
        "h2": 0.83,
        "h3": 1.0,
        "h4": 1.33,
        "h5": 1.67,
        "h6": 2.33,
        "ul": 1.0,
        "ol": 1.0,
        "dl": 1.0,
        "blockquote": 1.0,
    ]

    /// Convert numeric style values (Int, Double, or NSNumber) to Double.
    private static func toDouble(_ value: Any) -> Double? {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let n = value as? NSNumber { return n.doubleValue }
        return nil
    }

    /// Expands CSS `border` shorthand (e.g. "1px solid red") into individual
    /// borderWidth/borderColor properties. Returns the style unchanged if no
    /// shorthand is present. Explicit borderWidth/borderColor take precedence.
    private static func expandBorderShorthand(_ style: [String: Any]) -> [String: Any] {
        guard let border = style["border"] as? String else {
            return style
        }

        var expanded = style
        expanded.removeValue(forKey: "border")

        // Parse: "<width> <style> <color>"
        // Color may contain spaces (e.g. "rgba(255, 0, 0, 0.4)"), so we parse
        // width and style tokens from the front, then treat the rest as color.
        let fullPattern = #"^(\d+(?:\.\d+)?(?:px|em|rem)?)\s+(\w+)\s+(.+)$"#
        if let regex = try? NSRegularExpression(pattern: fullPattern),
           let result = regex.firstMatch(
               in: border,
               range: NSRange(border.startIndex..., in: border)
           ) {
            if let widthRange = Range(result.range(at: 1), in: border) {
                let widthStr = String(border[widthRange])
                let numStr = widthStr.replacingOccurrences(
                    of: #"(px|em|rem)$"#, with: "", options: .regularExpression
                )
                if let width = Double(numStr), expanded["borderWidth"] == nil {
                    expanded["borderWidth"] = width
                }
            }
            // result.range(at: 2) is border-style (e.g. "solid") — ignored
            if let colorRange = Range(result.range(at: 3), in: border),
               expanded["borderColor"] == nil {
                expanded["borderColor"] = String(border[colorRange])
            }
        } else {
            // Fallback: width-only ("1px") or width+color ("1px red")
            let simplePattern = #"^(\d+(?:\.\d+)?(?:px|em|rem)?)(?:\s+(.+))?$"#
            if let regex = try? NSRegularExpression(pattern: simplePattern),
               let result = regex.firstMatch(
                   in: border,
                   range: NSRange(border.startIndex..., in: border)
               ) {
                if let widthRange = Range(result.range(at: 1), in: border) {
                    let widthStr = String(border[widthRange])
                    let numStr = widthStr.replacingOccurrences(
                        of: #"(px|em|rem)$"#, with: "", options: .regularExpression
                    )
                    if let width = Double(numStr), expanded["borderWidth"] == nil {
                        expanded["borderWidth"] = width
                    }
                }
                if result.range(at: 2).location != NSNotFound,
                   let colorRange = Range(result.range(at: 2), in: border),
                   expanded["borderColor"] == nil {
                    expanded["borderColor"] = String(border[colorRange])
                }
            }
        }

        return expanded
    }

    // MARK: - Default Dictionaries

    private static let blockDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16
    ]

    private static let addressDefaults: [String: Any] = [
        "display": "block",
        "fontStyle": "italic"
    ]

    private static let blockquoteDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
        "marginTop": 16,
        "marginBottom": 16,
        "marginLeft": 40,
        "marginRight": 40
    ]

    private static let preDefaults: [String: Any] = [
        "display": "block",
        "marginTop": 16,
        "marginBottom": 16,
        "fontFamily": "Menlo"
    ]

    private static let summaryDefaults: [String: Any] = [
        "flexDirection": "row"
    ]

    private static let dialogDefaults: [String: Any] = [
        "display": "block",
        "paddingTop": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "paddingRight": 16,
        "borderWidth": 1,
        "borderColor": "#000000",
        "backgroundColor": "#FFFFFF"
    ]

    private static let fieldsetDefaults: [String: Any] = [
        "display": "block",
        "marginLeft": 2,
        "marginRight": 2,
        "paddingTop": 5.6,
        "paddingBottom": 10,
        "paddingLeft": 12,
        "paddingRight": 12,
        "borderWidth": 2,
        "borderColor": "#C0C0C0",
        "borderRadius": 4
    ]

    private static let legendDefaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "paddingLeft": 2,
        "paddingRight": 2
    ]

    private static let pDefaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 16,
        "marginTop": 16,
        "marginBottom": 16
    ]

    private static let h1Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 32,
        "fontWeight": "bold",
        "marginTop": 21.44,
        "marginBottom": 21.44
    ]

    private static let h2Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 24,
        "fontWeight": "bold",
        "marginTop": 19.92,
        "marginBottom": 19.92
    ]

    private static let h3Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 18.72,
        "fontWeight": "bold",
        "marginTop": 18.72,
        "marginBottom": 18.72
    ]

    private static let h4Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 16,
        "fontWeight": "bold",
        "marginTop": 21.28,
        "marginBottom": 21.28
    ]

    private static let h5Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 13.28,
        "fontWeight": "bold",
        "marginTop": 22.18,
        "marginBottom": 22.18
    ]

    private static let h6Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 10.72,
        "fontWeight": "bold",
        "marginTop": 24.98,
        "marginBottom": 24.98
    ]

    private static let spanDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16
    ]

    private static let labelDefaults: [String: Any] = [
        "display": "inline",
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16
    ]

    private static let inlineBlockDefaults: [String: Any] = [
        "display": "inline-block"
    ]

    private static let listDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
        "paddingLeft": 40,
        "marginTop": 16,
        "marginBottom": 16
    ]

    private static let liDefaults: [String: Any] = [
        "flexDirection": "row",
        "fontSize": 16
    ]

    private static let dlDefaults: [String: Any] = [
        "display": "block",
        "marginTop": 16,
        "marginBottom": 16
    ]

    private static let ddDefaults: [String: Any] = [
        "display": "block",
        "marginLeft": 40
    ]

    private static let trDefaults: [String: Any] = [
        "flexDirection": "row"
    ]

    private static let thDefaults: [String: Any] = [
        "display": "block",
        "flex": 1,
        "paddingTop": 1,
        "paddingBottom": 1,
        "paddingLeft": 1,
        "paddingRight": 1,
        "fontWeight": "bold"
    ]

    private static let tdDefaults: [String: Any] = [
        "display": "block",
        "flex": 1,
        "paddingTop": 1,
        "paddingBottom": 1,
        "paddingLeft": 1,
        "paddingRight": 1
    ]

    private static let captionDefaults: [String: Any] = [
        "display": "block",
        "alignItems": "center"
    ]

    private static let buttonDefaults: [String: Any] = [
        "display": "inline-block",
        "boxSizing": "border-box",
        "flexDirection": "row",
        "alignItems": "center",
        "justifyContent": "center",
        "paddingTop": 1,
        "paddingBottom": 1,
        "paddingLeft": 11,
        "paddingRight": 11,
        "borderRadius": 10,
        "borderWidth": 1,
        "borderColor": "#767676",
        "backgroundColor": "#EFEFEF",
        "fontSize": 11,
        "minHeight": 20
    ]

    private static let inputDefaults: [String: Any] = [
        "display": "inline-block",
        "boxSizing": "border-box",
        "width": 154,
        "height": 20,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "fontSize": 11,
        "backgroundColor": "#FFFFFF"
    ]

    private static let textareaDefaults: [String: Any] = [
        "display": "inline-block",
        "boxSizing": "border-box",
        "width": 154,
        "minHeight": 48,
        "paddingTop": 4,
        "paddingBottom": 4,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "fontSize": 11,
        "backgroundColor": "#FFFFFF"
    ]

    private static let selectDefaults: [String: Any] = [
        "display": "inline-block",
        "flexDirection": "row",
        "alignItems": "center",
        "height": 32,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "backgroundColor": "#FFFFFF"
    ]

    private static let progressDefaults: [String: Any] = [
        "display": "inline-block",
        "height": 4
    ]

    private static let imgDefaults: [String: Any] = [
        "display": "inline-block",
        "objectFit": "fill"
    ]

    private static let videoDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 300,
        "height": 150,
        "backgroundColor": "#000000"
    ]

    private static let audioDefaults: [String: Any] = [
        "display": "inline-block",
        "flexDirection": "row",
        "alignItems": "center",
        "height": 32
    ]

    private static let iframeDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 300,
        "height": 150,
        "borderWidth": 2,
        "borderColor": "#808080"
    ]

    private static let canvasDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 300,
        "height": 150
    ]

    private static let hrDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
        "height": 0,
        "marginTop": 8,
        "marginBottom": 8,
        "borderTopWidth": 1,
        "borderTopColor": "#808080"
    ]

    private static let aDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16,
        "textDecorationLine": "underline"
    ]

    private static let boldDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16,
        "fontWeight": "bold"
    ]

    private static let italicDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16,
        "fontStyle": "italic"
    ]

    private static let underlineDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16,
        "textDecorationLine": "underline"
    ]

    private static let strikethroughDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16,
        "textDecorationLine": "line-through"
    ]

    private static let markDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 16,
        "backgroundColor": "#FFFF00",
        "color": "#000000"
    ]

    private static let smallDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontSize": 13.28
    ]

    private static let monospaceDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "alignSelf": "flex-start",
        "fontSize": 13,
        "fontFamily": "Menlo",
        "lineHeight": 14
    ]
}
