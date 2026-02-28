import Foundation
import CoreGraphics

#if canImport(UIKit)
import UIKit
#endif

/// Provides per-element-type default styles for HTML elements.
///
/// Previously maintained in JS (yoga-layout/defaults.js + components/registry),
/// these defaults are now applied natively. The merge happens in Bindings.swift
/// during node creation and cloning — user-supplied styles override defaults.
public enum ElementDefaults {

    /// Returns the default style dictionary for a given HTML element type.
    public static func defaults(for elementType: String) -> [String: Any] {
        switch elementType {
        // Structural
        case "html", "body":
            return blockDefaults
        case "head":
            return headDefaults

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
        case "sub":
            return subDefaults
        case "sup":
            return supDefaults
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

    /// Returns the CSS "normal" line-height for monospace element types.
    /// This is used internally for text measurement only — it is NOT stored
    /// in the style dict, so it won't appear in layout comparison diffs.
    /// On web, `<code>`/`<kbd>`/`<samp>` have `line-height: normal` which
    /// for monospace fonts is ~1.08 × fontSize (13 × 1.08 ≈ 14).
    public static func textLineHeight(for elementType: String) -> CGFloat? {
        switch elementType {
        case "code", "kbd", "samp", "pre":
            return 14
        default:
            return nil
        }
    }

    /// Returns a Yoga-only minHeight for elements that need it to emulate
    /// CSS inline formatting context behavior. Applied directly to the Yoga
    /// node (NOT stored in the style dict) so it won't appear in layout
    /// comparison diffs.
    ///
    /// CSS `vertical-align: sub/super` shifts text below/above the baseline,
    /// expanding the parent line box. Yoga flex layout has no equivalent —
    /// `alignSelf` positions children within the row but doesn't expand it.
    /// Setting a minHeight on sub/sup makes them tall enough to expand the
    /// parent flex row to match the web's line box height.
    ///
    /// Values are calibrated for the default 16px parent font size.
    public static func yogaMinHeight(for elementType: String) -> CGFloat? {
        switch elementType {
        case "sub":
            return 24
        case "sup":
            return 23
        default:
            return nil
        }
    }

    /// Returns a Yoga-only minHeight for text container elements based on
    /// CSS `line-height: normal`. Applied directly to the Yoga node (NOT
    /// stored in the style dict).
    ///
    /// CSS block text containers (`<p>`, `<h1>`–`<h6>`) have a minimum
    /// height determined by their line-height, even when all children are
    /// smaller (e.g. `<p><small>text</small></p>`). Yoga flex layout has
    /// no line-height concept, so minHeight emulates this behavior.
    ///
    /// Uses ceil(ascender) + ceil(descender) to match WebKit's
    /// `line-height: normal` rendering for the system font. WebKit rounds
    /// ascent and descent separately before summing, which can produce a
    /// value 1px larger than ceil(lineHeight) at certain font sizes (e.g.
    /// fontSize 14: ceil(13.33)+ceil(3.38) = 18 vs ceil(16.71) = 17).
    /// Falls back to `ceil(1.2 * fontSize)` when UIKit is unavailable.
    public static func yogaTextContainerMinHeight(for elementType: String, fontSize: CGFloat) -> CGFloat? {
        switch elementType {
        case "p", "h1", "h2", "h3", "h4", "h5", "h6",
             "li", "dt", "dd",
             "summary", "legend", "label":
            #if canImport(UIKit)
            let font = UIFont.systemFont(ofSize: fontSize)
            return ceil(font.ascender) + ceil(abs(font.descender))
            #else
            return ceil(1.2 * fontSize)
            #endif
        default:
            return nil
        }
    }

    /// Returns true if the element type is CSS inline and should use Yoga
    /// `display: inlineBlock` for shrink-to-fit width inside block containers.
    /// This is set directly on the Yoga node (NOT stored in the style dict)
    /// to avoid false comparison diffs with web's computed display values.
    ///
    /// CSS inline elements stretch to full parent width in Yoga's block layout
    /// (calculateBlockLayout). Setting inlineBlock gives them content-sized
    /// width, matching CSS inline behavior where width = content width.
    public static func needsInlineBlockDisplay(for elementType: String) -> Bool {
        switch elementType {
        case "strong", "b", "em", "i", "u", "s", "del", "ins",
             "mark", "small", "code", "kbd", "samp",
             "cite", "dfn", "var", "sub", "sup",
             "span", "a", "q", "time", "abbr", "data",
             "bdi", "bdo", "wbr", "ruby", "rt", "rp", "output",
             "label":
            return true
        default:
            return false
        }
    }

    /// Elements whose style dict has flexWrap: "nowrap" (matching CSS
    /// getComputedStyle) but need Yoga flexWrap: wrap to prevent
    /// calculateBlockLayout from stacking text children vertically.
    ///
    /// Yoga uses calculateBlockLayout when display==block && flexWrap==noWrap.
    /// Block layout stacks children vertically, but these elements use
    /// flexDirection: "row" to lay out inline text children side-by-side.
    /// Setting Yoga's flexWrap to wrap forces flex layout while the style
    /// dict still reports "nowrap" for comparison accuracy.
    public static func needsYogaFlexWrapOverride(for elementType: String) -> Bool {
        switch elementType {
        case "pre", "legend", "summary":
            return true
        default:
            return false
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
            var style = expandBorderShorthand(userStyle)
            // Resolve unitless lineHeight (see comment below)
            if let rawLH = userStyle["lineHeight"], let lh = toDouble(rawLH) {
                let fontSize: Double
                if let userFS = userStyle["fontSize"], let fs = toDouble(userFS) {
                    fontSize = fs
                } else {
                    fontSize = 16
                }
                style["lineHeight"] = lh * fontSize
            }
            return style
        }
        var merged = defaults
        for (key, value) in userStyle {
            merged[key] = value
        }

        // CSS shorthand properties override individual properties.
        // When user sets `padding: 8`, remove default individual padding
        // values so YogaStyleApplier's shorthand → individual ordering
        // doesn't let defaults override the user's shorthand.
        if userStyle["padding"] != nil {
            for key in ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
                        "paddingHorizontal", "paddingVertical"] {
                if userStyle[key] == nil {
                    merged.removeValue(forKey: key)
                }
            }
        }
        if userStyle["margin"] != nil {
            for key in ["marginTop", "marginBottom", "marginLeft", "marginRight",
                        "marginHorizontal", "marginVertical"] {
                if userStyle[key] == nil {
                    merged.removeValue(forKey: key)
                }
            }
        }

        // CSS margins specified in `em` units scale with fontSize.
        // When the user overrides fontSize but not margins, recompute
        // margins to match CSS behavior (e.g., <p> margin = 1em).
        // Skip if user set `margin` or `marginVertical` shorthand —
        // those override the per-side defaults.
        if let multiplier = emMarginMultiplier[elementType],
           userStyle["margin"] == nil,
           userStyle["marginVertical"] == nil,
           let userFontSize = userStyle["fontSize"],
           let fontSize = toDouble(userFontSize) {
            if userStyle["marginTop"] == nil {
                merged["marginTop"] = fontSize * multiplier
            }
            if userStyle["marginBottom"] == nil {
                merged["marginBottom"] = fontSize * multiplier
            }
        }

        // CSS unitless line-height is a multiplier of fontSize (e.g.
        // lineHeight: 2 with fontSize: 16 = 32px).  React DOM treats
        // numeric lineHeight values as unitless (no "px" suffix), so we
        // resolve to pixels here to match getComputedStyle behavior.
        if let rawLH = userStyle["lineHeight"], let lh = toDouble(rawLH) {
            let fontSize: Double
            if let userFS = merged["fontSize"], let fs = toDouble(userFS) {
                fontSize = fs
            } else {
                fontSize = 16
            }
            merged["lineHeight"] = lh * fontSize
        }

        // CSS <hr> has margin-left: auto; margin-right: auto. When the hr
        // has no explicit width, it stretches to fill the parent and auto
        // margins resolve to 0 (matching our default marginLeft/Right: 0).
        // When the hr HAS an explicit width, auto margins center it. We
        // set auto margins only when width is present and the user hasn't
        // explicitly set marginLeft/Right.
        if elementType == "hr" && userStyle["width"] != nil {
            if userStyle["marginLeft"] == nil {
                merged["marginLeft"] = "auto"
            }
            if userStyle["marginRight"] == nil {
                merged["marginRight"] = "auto"
            }
        }

        // CSS form control appearance invalidation: when certain properties
        // (backgroundColor, borderColor, etc.) are set on a <button>, Safari
        // drops the system appearance (-webkit-appearance: push-button → none),
        // which changes the computed borderRadius, padding, and minHeight.
        // Match this behavior by stripping system-style defaults when the user
        // overrides appearance-breaking properties.
        if elementType == "button" {
            let breaksAppearance = userStyle["backgroundColor"] != nil
                || userStyle["borderColor"] != nil
                || userStyle["background"] != nil
            if breaksAppearance {
                if userStyle["borderRadius"] == nil {
                    merged.removeValue(forKey: "borderRadius")
                }
                if userStyle["minHeight"] == nil {
                    merged.removeValue(forKey: "minHeight")
                }
                if userStyle["paddingLeft"] == nil {
                    merged["paddingLeft"] = 6
                }
                if userStyle["paddingRight"] == nil {
                    merged["paddingRight"] = 6
                }
            }
        }

        return expandBorderShorthand(merged)
    }

    /// Recomputes em-relative margins on a child element based on the
    /// parent's fontSize, simulating CSS font-size inheritance for margin
    /// computation. Called at appendChild time when the parent's effective
    /// fontSize differs from the child's default.
    ///
    /// In CSS, `<p>` has `margin: 1em 0` where `1em` resolves to the
    /// element's computed font-size. When a `<p>` is inside a container
    /// with a different font-size (e.g. `<address style="font-size:14px">`),
    /// the margins scale accordingly. Since we don't have full CSS
    /// inheritance, we approximate by recomputing margins at insertion time.
    ///
    /// Returns the updated style dict if margins were recomputed, or nil
    /// if no changes were needed.
    public static func recomputeEmMargins(
        childType: String,
        childStyle: [String: Any],
        parentFontSize: Double
    ) -> [String: Any]? {
        guard let multiplier = emMarginMultiplier[childType] else { return nil }

        // Get the child's own fontSize (from defaults or user override)
        guard let childFontSize = toDouble(childStyle["fontSize"] ?? 16) else { return nil }

        // If the child's fontSize differs from its base default, the user
        // explicitly set it via inline style. mergedStyle already recomputed
        // margins for user-specified fontSize, so skip recomputation here.
        let baseDefaults = self.defaults(for: childType)
        let baseFontSize = toDouble(baseDefaults["fontSize"] ?? 16) ?? 16
        guard abs(childFontSize - baseFontSize) < 0.01 else { return nil }

        // Headings have em-based font-size (h1=2em, h2=1.5em, etc.) that
        // scales with parent fontSize. Other elements inherit fontSize directly.
        let expectedFontSize: Double
        if let fontSizeMultiplier = emFontSizeMultiplier[childType] {
            expectedFontSize = parentFontSize * fontSizeMultiplier
        } else {
            expectedFontSize = parentFontSize
        }

        // Only recompute if the expected fontSize differs from the current
        guard abs(expectedFontSize - childFontSize) > 0.01 else { return nil }

        let defaultMarginTop = childFontSize * multiplier
        let defaultMarginBottom = childFontSize * multiplier

        let currentMarginTop = toDouble(childStyle["marginTop"] ?? 0) ?? 0
        let currentMarginBottom = toDouble(childStyle["marginBottom"] ?? 0) ?? 0

        // Only recompute if margins are still at their default values
        // (i.e. user hasn't explicitly overridden them)
        guard abs(currentMarginTop - defaultMarginTop) < 0.01,
              abs(currentMarginBottom - defaultMarginBottom) < 0.01 else {
            return nil
        }

        var updated = childStyle
        let newMargin = expectedFontSize * multiplier
        updated["marginTop"] = newMargin
        updated["marginBottom"] = newMargin
        updated["fontSize"] = expectedFontSize
        return updated
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
        "pre": 1.0,
    ]

    /// Heading font-size multipliers relative to parent fontSize.
    /// CSS UA stylesheet uses em units: h1=2em, h2=1.5em, etc.
    /// Pre/code uses the monospace font-size quirk: 13/16 ≈ 0.8125.
    private static let emFontSizeMultiplier: [String: Double] = [
        "h1": 2.0,
        "h2": 1.5,
        "h3": 1.17,
        "h4": 1.0,
        "h5": 0.83,
        "h6": 0.67,
        "pre": 13.0 / 16.0,
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
            // result.range(at: 2) is border-style (e.g. "solid")
            if let styleRange = Range(result.range(at: 2), in: border),
               expanded["borderStyle"] == nil {
                expanded["borderStyle"] = String(border[styleRange])
            }
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

    private static let headDefaults: [String: Any] = [
        "display": "none"
    ]

    private static let blockDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16
    ]

    private static let addressDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
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
        "flexDirection": "row",
        "flexWrap": "nowrap",
        "fontSize": 13,
        "marginTop": 13,
        "marginBottom": 13,
        "fontFamily": "Menlo"
    ]

    private static let summaryDefaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "nowrap",
        "fontSize": 16
    ]

    private static let dialogDefaults: [String: Any] = [
        "display": "none",
        "fontSize": 16,
        "paddingTop": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "paddingRight": 16,
        "borderWidth": 1,
        "borderStyle": "solid",
        "borderColor": "#000000",
        "backgroundColor": "#FFFFFF"
    ]

    private static let fieldsetDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
        "marginLeft": 2,
        "marginRight": 2,
        "paddingTop": 5.6,
        "paddingBottom": 10,
        "paddingLeft": 12,
        "paddingRight": 12,
        "borderWidth": 2,
        "borderStyle": "groove",
        "borderColor": "#C0C0C0"
    ]

    private static let legendDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexWrap": "nowrap",
        "fontSize": 16,
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
        "marginTop": 19.91,
        "marginBottom": 19.91
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
        "marginTop": 22.17,
        "marginBottom": 22.17
    ]

    private static let h6Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 10.72,
        "fontWeight": "bold",
        "marginTop": 24.97,
        "marginBottom": 24.97
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
        "display": "block",
        "fontSize": 16
    ]

    private static let dlDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
        "marginTop": 16,
        "marginBottom": 16
    ]

    private static let ddDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16,
        "marginLeft": 40
    ]

    private static let trDefaults: [String: Any] = [
        "flexDirection": "row",
        "fontSize": 16
    ]

    private static let thDefaults: [String: Any] = [
        "display": "block",
        "flex": 1,
        "paddingTop": 1,
        "paddingBottom": 1,
        "paddingLeft": 1,
        "paddingRight": 1,
        "fontSize": 16,
        "fontWeight": "bold",
        "textAlign": "center"
    ]

    private static let tdDefaults: [String: Any] = [
        "display": "block",
        "flex": 1,
        "paddingTop": 1,
        "paddingBottom": 1,
        "paddingLeft": 1,
        "paddingRight": 1,
        "fontSize": 16
    ]

    private static let captionDefaults: [String: Any] = [
        "display": "block",
        "fontSize": 16
    ]

    private static let buttonDefaults: [String: Any] = [
        "display": "inline-block",
        "boxSizing": "border-box",
        "flexDirection": "row",
        "alignItems": "center",
        "justifyContent": "center",
        "textAlign": "center",
        "paddingTop": 1,
        "paddingBottom": 1,
        "paddingLeft": 11,
        "paddingRight": 11,
        "borderRadius": 10,
        "borderWidth": 1,
        "borderStyle": "solid",
        "borderColor": "#FFFFFF",
        "backgroundColor": "#E9E9EA",
        "fontSize": 11,
        "minHeight": 20
    ]

    private static let inputDefaults: [String: Any] = [
        "display": "inline-block",
        "boxSizing": "border-box",
        "width": 154,
        "height": 22,
        "paddingTop": 3,
        "paddingBottom": 4,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderStyle": "solid",
        "borderColor": "rgba(60, 60, 67, 0.6)",
        "borderRadius": 2,
        "fontSize": 11,
        "backgroundColor": "#FFFFFF"
    ]

    private static let textareaDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 142,
        "height": 28,
        "paddingTop": 2,
        "paddingBottom": 2,
        "paddingLeft": 5,
        "paddingRight": 5,
        "borderWidth": 1,
        "borderStyle": "solid",
        "borderColor": "rgba(60, 60, 67, 0.6)",
        "borderRadius": 2,
        "fontSize": 11,
        "backgroundColor": "#FFFFFF"
    ]

    private static let selectDefaults: [String: Any] = [
        "display": "inline-block",
        "boxSizing": "border-box",
        "flexDirection": "row",
        "alignItems": "center",
        "width": 24,
        "height": 20,
        "minHeight": 20,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderStyle": "solid",
        "borderColor": "#FFFFFF",
        "borderRadius": 10,
        "fontSize": 11,
        "backgroundColor": "#E9E9EA"
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
        "borderStyle": "inset",
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
        "marginLeft": 0,
        "marginRight": 0,
        "borderStyle": "inset",
        "borderTopWidth": 1,
        "borderRightWidth": 0,
        "borderBottomWidth": 1,
        "borderLeftWidth": 0,
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
        "alignSelf": "flex-end",
        "fontSize": 13.28
    ]

    private static let subDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "alignSelf": "flex-end",
        "fontSize": 13.28
    ]

    private static let supDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "alignSelf": "flex-start",
        "fontSize": 13.28
    ]

    private static let monospaceDefaults: [String: Any] = [
        "flexDirection": "row",
        "flexShrink": 1,
        "alignSelf": "flex-end",
        "fontSize": 13,
        "fontFamily": "Menlo"
    ]
}
