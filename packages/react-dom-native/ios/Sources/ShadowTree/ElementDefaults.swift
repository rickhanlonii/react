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
        case "span", "label":
            return spanDefaults

        // Inline text (bold/italic/underline/strikethrough/etc.)
        case "b":
            return boldDefaults
        case "i":
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
    /// User style overrides defaults.
    public static func mergedStyle(
        for elementType: String,
        userStyle: [String: Any]?
    ) -> [String: Any] {
        let defaults = self.defaults(for: elementType)
        guard let userStyle = userStyle, !userStyle.isEmpty else {
            return defaults
        }
        guard !defaults.isEmpty else {
            return userStyle
        }
        var merged = defaults
        for (key, value) in userStyle {
            merged[key] = value
        }
        return merged
    }

    // MARK: - Default Dictionaries

    private static let blockDefaults: [String: Any] = [
        "display": "block"
    ]

    private static let addressDefaults: [String: Any] = [
        "display": "block",
        "fontStyle": "italic"
    ]

    private static let blockquoteDefaults: [String: Any] = [
        "display": "block",
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
        "fontSize": 16
    ]

    private static let h1Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 32,
        "fontWeight": "bold"
    ]

    private static let h2Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 24,
        "fontWeight": "bold"
    ]

    private static let h3Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 18.7,
        "fontWeight": "bold"
    ]

    private static let h4Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 16,
        "fontWeight": "bold"
    ]

    private static let h5Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 13.3,
        "fontWeight": "bold"
    ]

    private static let h6Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 10.7,
        "fontWeight": "bold"
    ]

    private static let spanDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1
    ]

    private static let inlineBlockDefaults: [String: Any] = [
        "display": "inline-block"
    ]

    private static let listDefaults: [String: Any] = [
        "display": "block",
        "paddingLeft": 40
    ]

    private static let liDefaults: [String: Any] = [
        "flexDirection": "row"
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
        "flexDirection": "row",
        "alignItems": "center",
        "justifyContent": "center",
        "paddingTop": 4,
        "paddingBottom": 4,
        "paddingLeft": 12,
        "paddingRight": 12,
        "borderRadius": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "backgroundColor": "#EFEFEF",
        "fontSize": 13.3
    ]

    private static let inputDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 139,
        "height": 32,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "fontSize": 13.3,
        "backgroundColor": "#FFFFFF"
    ]

    private static let textareaDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 139,
        "minHeight": 48,
        "paddingTop": 4,
        "paddingBottom": 4,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "fontSize": 13.3,
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
        "height": 0,
        "marginTop": 8,
        "marginBottom": 8,
        "borderTopWidth": 1,
        "borderTopColor": "#808080"
    ]

    private static let aDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "color": "#007AFF",
        "textDecorationLine": "underline"
    ]

    private static let boldDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontWeight": "bold"
    ]

    private static let italicDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "fontStyle": "italic"
    ]

    private static let underlineDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "textDecorationLine": "underline"
    ]

    private static let strikethroughDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "textDecorationLine": "line-through"
    ]

    private static let markDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
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
        "fontFamily": "Menlo"
    ]
}
