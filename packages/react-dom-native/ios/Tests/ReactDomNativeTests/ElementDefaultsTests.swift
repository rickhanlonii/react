import XCTest
@testable import ReactDomNativeKit

final class ElementDefaultsTests: XCTestCase {

    // MARK: - defaults(for:) — Block containers

    func testBlockContainersReturnDisplayBlock() {
        let blockTypes = ["div", "main", "section", "article", "nav", "header", "footer", "aside", "form"]
        for type in blockTypes {
            let defaults = ElementDefaults.defaults(for: type)
            XCTAssertEqual(defaults["display"] as? String, "block", "\(type) should default to display block")
        }
    }

    // MARK: - defaults(for:) — Text containers

    func testParagraphDefaults() {
        let defaults = ElementDefaults.defaults(for: "p")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    func testH1Defaults() {
        let defaults = ElementDefaults.defaults(for: "h1")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Int, 32)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH2Defaults() {
        let defaults = ElementDefaults.defaults(for: "h2")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Int, 24)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH3Defaults() {
        let defaults = ElementDefaults.defaults(for: "h3")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Double, 18.72)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH4Defaults() {
        let defaults = ElementDefaults.defaults(for: "h4")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH5Defaults() {
        let defaults = ElementDefaults.defaults(for: "h5")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH6Defaults() {
        let defaults = ElementDefaults.defaults(for: "h6")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
        XCTAssertEqual(defaults["fontSize"] as? Double, 10.72)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    // MARK: - defaults(for:) — Inline

    func testSpanDefaults() {
        let defaults = ElementDefaults.defaults(for: "span")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertNil(defaults["display"])
        XCTAssertNil(defaults["alignItems"])
    }

    // MARK: - defaults(for:) — Interactive

    func testButtonDefaults() {
        let defaults = ElementDefaults.defaults(for: "button")
        XCTAssertEqual(defaults["display"] as? String, "inline-block")
        XCTAssertEqual(defaults["boxSizing"] as? String, "border-box")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["alignItems"] as? String, "center")
        XCTAssertEqual(defaults["justifyContent"] as? String, "center")
        XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 11)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 11)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderColor"] as? String, "#767676")
        XCTAssertEqual(defaults["borderRadius"] as? Int, 10)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#EFEFEF")
        XCTAssertEqual(defaults["minHeight"] as? Int, 20)
        XCTAssertEqual(defaults["fontSize"] as? Int, 11)
    }

    func testInputDefaults() {
        let defaults = ElementDefaults.defaults(for: "input")
        XCTAssertEqual(defaults["display"] as? String, "inline-block")
        XCTAssertEqual(defaults["boxSizing"] as? String, "border-box")
        XCTAssertEqual(defaults["width"] as? Int, 154)
        XCTAssertEqual(defaults["height"] as? Int, 20)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderColor"] as? String, "#767676")
        XCTAssertEqual(defaults["fontSize"] as? Int, 11)
    }

    // MARK: - defaults(for:) — Lists

    func testListDefaults() {
        for type in ["ul", "ol"] {
            let defaults = ElementDefaults.defaults(for: type)
            XCTAssertEqual(defaults["display"] as? String, "block", "\(type) should default to display block")
            XCTAssertEqual(defaults["fontSize"] as? Int, 16, "\(type) should default to fontSize 16")
            XCTAssertEqual(defaults["paddingLeft"] as? Int, 40, "\(type) should have paddingLeft 40")
        }
    }

    func testLiDefaults() {
        let defaults = ElementDefaults.defaults(for: "li")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    // MARK: - defaults(for:) — Links

    func testAnchorDefaults() {
        let defaults = ElementDefaults.defaults(for: "a")
        XCTAssertEqual(defaults["color"] as? String, "#007AFF")
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "underline")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertNil(defaults["alignItems"])
    }

    // MARK: - P2 Inline Text

    func testCiteDefaults() {
        let defaults = ElementDefaults.defaults(for: "cite")
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
    }

    func testDfnDefaults() {
        let defaults = ElementDefaults.defaults(for: "dfn")
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
    }

    func testVarDefaults() {
        let defaults = ElementDefaults.defaults(for: "var")
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
    }

    func testSubDefaults() {
        let defaults = ElementDefaults.defaults(for: "sub")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
    }

    func testSupDefaults() {
        let defaults = ElementDefaults.defaults(for: "sup")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
    }

    func testQDefaults() {
        let defaults = ElementDefaults.defaults(for: "q")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    }

    func testTimeDefaults() {
        let defaults = ElementDefaults.defaults(for: "time")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    }

    func testAbbrDefaults() {
        let defaults = ElementDefaults.defaults(for: "abbr")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    }

    // MARK: - P2 Block Containers

    func testDetailsDefaults() {
        let defaults = ElementDefaults.defaults(for: "details")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testSummaryDefaults() {
        let defaults = ElementDefaults.defaults(for: "summary")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    }

    func testDialogDefaults() {
        let defaults = ElementDefaults.defaults(for: "dialog")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["paddingTop"] as? Int, 16)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 16)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 16)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 16)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderColor"] as? String, "#000000")
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#FFFFFF")
    }

    func testFieldsetDefaults() {
        let defaults = ElementDefaults.defaults(for: "fieldset")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["borderWidth"] as? Int, 2)
        XCTAssertEqual(defaults["borderColor"] as? String, "#C0C0C0")
        XCTAssertEqual(defaults["borderRadius"] as? Int, 4)
    }

    func testLegendDefaults() {
        let defaults = ElementDefaults.defaults(for: "legend")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 2)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 2)
    }

    func testSearchDefaults() {
        let defaults = ElementDefaults.defaults(for: "search")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    // MARK: - Label

    func testLabelDefaults() {
        let defaults = ElementDefaults.defaults(for: "label")
        XCTAssertEqual(defaults["display"] as? String, "inline")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertNil(defaults["alignSelf"])
    }

    // MARK: - Table Elements

    func testTableDefaults() {
        let defaults = ElementDefaults.defaults(for: "table")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testTheadDefaults() {
        let defaults = ElementDefaults.defaults(for: "thead")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testTbodyDefaults() {
        let defaults = ElementDefaults.defaults(for: "tbody")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testTrDefaults() {
        let defaults = ElementDefaults.defaults(for: "tr")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    }

    func testThDefaults() {
        let defaults = ElementDefaults.defaults(for: "th")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flex"] as? Int, 1)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 1)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 1)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testTdDefaults() {
        let defaults = ElementDefaults.defaults(for: "td")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flex"] as? Int, 1)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 1)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 1)
    }

    func testTfootDefaults() {
        let defaults = ElementDefaults.defaults(for: "tfoot")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testCaptionDefaults() {
        let defaults = ElementDefaults.defaults(for: "caption")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["alignItems"] as? String, "center")
    }

    // MARK: - Form Controls

    func testProgressDefaults() {
        let defaults = ElementDefaults.defaults(for: "progress")
        XCTAssertEqual(defaults["height"] as? Int, 4)
    }

    // MARK: - Media Elements

    func testVideoDefaults() {
        let defaults = ElementDefaults.defaults(for: "video")
        XCTAssertEqual(defaults["width"] as? Int, 300)
        XCTAssertEqual(defaults["height"] as? Int, 150)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#000000")
    }

    func testAudioDefaults() {
        let defaults = ElementDefaults.defaults(for: "audio")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["height"] as? Int, 32)
    }

    // MARK: - Remaining P2 Elements

    func testPictureDefaults() {
        let defaults = ElementDefaults.defaults(for: "picture")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testMeterDefaults() {
        let defaults = ElementDefaults.defaults(for: "meter")
        XCTAssertEqual(defaults["height"] as? Int, 4)
    }

    func testIframeDefaults() {
        let defaults = ElementDefaults.defaults(for: "iframe")
        XCTAssertEqual(defaults["width"] as? Int, 300)
        XCTAssertEqual(defaults["height"] as? Int, 150)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 2)
        XCTAssertEqual(defaults["borderColor"] as? String, "#808080")
    }

    // MARK: - P3 Elements

    func testMenuDefaults() {
        let defaults = ElementDefaults.defaults(for: "menu")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 40)
    }

    func testCanvasDefaults() {
        let defaults = ElementDefaults.defaults(for: "canvas")
        XCTAssertEqual(defaults["width"] as? Int, 300)
        XCTAssertEqual(defaults["height"] as? Int, 150)
    }

    func testHgroupDefaults() {
        let defaults = ElementDefaults.defaults(for: "hgroup")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testBdiDefaults() {
        let defaults = ElementDefaults.defaults(for: "bdi")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    }

    // MARK: - Definition Lists

    func testDlDefaults() {
        let defaults = ElementDefaults.defaults(for: "dl")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
    }

    func testDtDefaults() {
        let defaults = ElementDefaults.defaults(for: "dt")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testDdDefaults() {
        let defaults = ElementDefaults.defaults(for: "dd")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
    }

    // MARK: - P1 Block Containers

    func testAddressDefaults() {
        let defaults = ElementDefaults.defaults(for: "address")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
    }

    func testBlockquoteDefaults() {
        let defaults = ElementDefaults.defaults(for: "blockquote")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
        XCTAssertEqual(defaults["marginRight"] as? Int, 40)
    }

    func testFigureDefaults() {
        let defaults = ElementDefaults.defaults(for: "figure")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
        XCTAssertEqual(defaults["marginRight"] as? Int, 40)
    }

    func testFigcaptionDefaults() {
        let defaults = ElementDefaults.defaults(for: "figcaption")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testPreDefaults() {
        let defaults = ElementDefaults.defaults(for: "pre")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
        XCTAssertEqual(defaults["fontFamily"] as? String, "Menlo")
    }

    // MARK: - P1 Inline Text

    func testBDefaults() {
        let defaults = ElementDefaults.defaults(for: "b")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
        XCTAssertNil(defaults["alignItems"])
    }

    func testStrongDefaults() {
        let defaults = ElementDefaults.defaults(for: "strong")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
        XCTAssertNil(defaults["display"])
        XCTAssertNil(defaults["alignItems"])
    }

    func testIDefaults() {
        let defaults = ElementDefaults.defaults(for: "i")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
        XCTAssertNil(defaults["alignItems"])
    }

    func testEmDefaults() {
        let defaults = ElementDefaults.defaults(for: "em")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
        XCTAssertNil(defaults["display"])
        XCTAssertNil(defaults["alignItems"])
    }

    func testUDefaults() {
        let defaults = ElementDefaults.defaults(for: "u")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "underline")
        XCTAssertNil(defaults["alignItems"])
    }

    func testSDefaults() {
        let defaults = ElementDefaults.defaults(for: "s")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "line-through")
        XCTAssertNil(defaults["alignItems"])
    }

    func testDelDefaults() {
        let defaults = ElementDefaults.defaults(for: "del")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "line-through")
        XCTAssertNil(defaults["alignItems"])
    }

    func testInsDefaults() {
        let defaults = ElementDefaults.defaults(for: "ins")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "underline")
        XCTAssertNil(defaults["alignItems"])
    }

    func testMarkDefaults() {
        let defaults = ElementDefaults.defaults(for: "mark")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#FFFF00")
        XCTAssertEqual(defaults["color"] as? String, "#000000")
        XCTAssertNil(defaults["alignItems"])
    }

    func testSmallDefaults() {
        let defaults = ElementDefaults.defaults(for: "small")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
    }

    func testCodeDefaults() {
        let defaults = ElementDefaults.defaults(for: "code")
        XCTAssertNil(defaults["display"])
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 13)
        XCTAssertEqual(defaults["fontFamily"] as? String, "Menlo")
        XCTAssertNil(defaults["alignItems"])
    }

    // MARK: - defaults(for:) — Unknown element

    func testUnknownElementFallsBackToBlockDefaults() {
        let defaults = ElementDefaults.defaults(for: "custom-element")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    // MARK: - mergedStyle(for:userStyle:)

    func testMergedStyleReturnsDefaultsWhenUserStyleIsNil() {
        let merged = ElementDefaults.mergedStyle(for: "div", userStyle: nil)
        XCTAssertEqual(merged["display"] as? String, "block")
    }

    func testMergedStyleReturnsDefaultsWhenUserStyleIsEmpty() {
        let merged = ElementDefaults.mergedStyle(for: "div", userStyle: [:])
        XCTAssertEqual(merged["display"] as? String, "block")
    }

    func testMergedStyleUserOverridesDefaults() {
        let merged = ElementDefaults.mergedStyle(for: "div", userStyle: ["display": "none"])
        XCTAssertEqual(merged["display"] as? String, "none")
    }

    func testMergedStyleUserAddsPropertiesWithoutRemovingDefaults() {
        let merged = ElementDefaults.mergedStyle(for: "h1", userStyle: ["backgroundColor": "red"])
        XCTAssertEqual(merged["display"] as? String, "block")
        XCTAssertEqual(merged["flexDirection"] as? String, "row")
        XCTAssertEqual(merged["fontSize"] as? Int, 32)
        XCTAssertEqual(merged["fontWeight"] as? String, "bold")
        XCTAssertEqual(merged["backgroundColor"] as? String, "red")
    }

    func testMergedStyleReturnsUserStyleForElementWithNoRelevantDefaults() {
        // img defaults only have objectFit, test a property that isn't in defaults
        let merged = ElementDefaults.mergedStyle(for: "img", userStyle: ["width": 100])
        XCTAssertEqual(merged["width"] as? Int, 100)
        XCTAssertEqual(merged["objectFit"] as? String, "fill")
    }

    // MARK: - Border shorthand expansion

    func testBorderShorthandFullParse() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "1px solid red"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
        XCTAssertEqual(merged["borderColor"] as? String, "red")
        XCTAssertNil(merged["border"])
    }

    func testBorderShorthandFractionalWidth() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "2.5px solid #333"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 2.5)
        XCTAssertEqual(merged["borderColor"] as? String, "#333")
    }

    func testBorderShorthandRgbaColor() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "1px solid rgba(255, 0, 0, 0.4)"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
        XCTAssertEqual(merged["borderColor"] as? String, "rgba(255, 0, 0, 0.4)")
    }

    func testBorderShorthandWidthOnly() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "3px"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 3.0)
        XCTAssertNil(merged["borderColor"])
    }

    func testBorderShorthandExplicitOverrides() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "1px solid red", "borderWidth": 5]
        )
        XCTAssertEqual(merged["borderWidth"] as? Int, 5)
        XCTAssertEqual(merged["borderColor"] as? String, "red")
    }

    func testBorderShorthandExplicitColorOverrides() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "1px solid red", "borderColor": "blue"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
        XCTAssertEqual(merged["borderColor"] as? String, "blue")
    }

    func testNoBorderShorthandPassesThrough() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["borderWidth": 2, "borderColor": "blue"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Int, 2)
        XCTAssertEqual(merged["borderColor"] as? String, "blue")
    }
}
