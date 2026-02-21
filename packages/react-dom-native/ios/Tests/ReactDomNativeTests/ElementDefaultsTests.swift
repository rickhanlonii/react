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
        XCTAssertEqual(defaults["textAlign"] as? String, "center")
        XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 11)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 11)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderStyle"] as? String, "solid")
        XCTAssertEqual(defaults["borderColor"] as? String, "#FFFFFF")
        XCTAssertEqual(defaults["borderRadius"] as? Int, 10)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#E9E9EA")
        XCTAssertEqual(defaults["minHeight"] as? Int, 20)
        XCTAssertEqual(defaults["fontSize"] as? Int, 11)
    }

    func testInputDefaults() {
        let defaults = ElementDefaults.defaults(for: "input")
        XCTAssertEqual(defaults["display"] as? String, "inline-block")
        XCTAssertEqual(defaults["boxSizing"] as? String, "border-box")
        XCTAssertEqual(defaults["width"] as? Int, 154)
        XCTAssertEqual(defaults["height"] as? Int, 22)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 3)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 4)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 4)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 4)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderStyle"] as? String, "solid")
        XCTAssertEqual(defaults["borderColor"] as? String, "rgba(60, 60, 67, 0.6)")
        XCTAssertEqual(defaults["fontSize"] as? Int, 11)
    }

    func testTextareaDefaults() {
        let defaults = ElementDefaults.defaults(for: "textarea")
        XCTAssertEqual(defaults["display"] as? String, "inline-block")
        XCTAssertNil(defaults["boxSizing"], "textarea uses content-box (CSS default)")
        XCTAssertEqual(defaults["width"] as? Int, 142)
        XCTAssertEqual(defaults["height"] as? Int, 28)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 2)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 2)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 5)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 5)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderStyle"] as? String, "solid")
        XCTAssertEqual(defaults["borderColor"] as? String, "rgba(60, 60, 67, 0.6)")
        XCTAssertEqual(defaults["borderRadius"] as? Int, 2)
        XCTAssertEqual(defaults["fontSize"] as? Int, 11)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#FFFFFF")
    }

    func testSelectDefaults() {
        let defaults = ElementDefaults.defaults(for: "select")
        XCTAssertEqual(defaults["display"] as? String, "inline-block")
        XCTAssertEqual(defaults["boxSizing"] as? String, "border-box")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["alignItems"] as? String, "center")
        XCTAssertEqual(defaults["width"] as? Int, 24)
        XCTAssertEqual(defaults["height"] as? Int, 20)
        XCTAssertEqual(defaults["minHeight"] as? Int, 20)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 4)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 4)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderStyle"] as? String, "solid")
        XCTAssertEqual(defaults["borderColor"] as? String, "#FFFFFF")
        XCTAssertEqual(defaults["borderRadius"] as? Int, 10)
        XCTAssertEqual(defaults["fontSize"] as? Int, 11)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#E9E9EA")
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
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    // MARK: - defaults(for:) — Links

    func testAnchorDefaults() {
        let defaults = ElementDefaults.defaults(for: "a")
        XCTAssertNil(defaults["color"])
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
        XCTAssertEqual(defaults["alignSelf"] as? String, "flex-end")
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
    }

    func testSupDefaults() {
        let defaults = ElementDefaults.defaults(for: "sup")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["alignSelf"] as? String, "flex-start")
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
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "nowrap")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    func testDialogDefaults() {
        let defaults = ElementDefaults.defaults(for: "dialog")
        XCTAssertEqual(defaults["display"] as? String, "none")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 16)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 16)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 16)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 16)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderStyle"] as? String, "solid")
        XCTAssertEqual(defaults["borderColor"] as? String, "#000000")
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#FFFFFF")
    }

    func testFieldsetDefaults() {
        let defaults = ElementDefaults.defaults(for: "fieldset")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 2)
        XCTAssertEqual(defaults["borderStyle"] as? String, "groove")
        XCTAssertEqual(defaults["borderColor"] as? String, "#C0C0C0")
        XCTAssertNil(defaults["borderRadius"])
    }

    func testLegendDefaults() {
        let defaults = ElementDefaults.defaults(for: "legend")
        XCTAssertNil(defaults["display"])
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "nowrap")
        XCTAssertNil(defaults["alignSelf"])
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
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
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    func testThDefaults() {
        let defaults = ElementDefaults.defaults(for: "th")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flex"] as? Int, 1)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 1)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
        XCTAssertEqual(defaults["textAlign"] as? String, "center")
    }

    func testTdDefaults() {
        let defaults = ElementDefaults.defaults(for: "td")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flex"] as? Int, 1)
        XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 1)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    func testTfootDefaults() {
        let defaults = ElementDefaults.defaults(for: "tfoot")
        XCTAssertEqual(defaults["display"] as? String, "block")
    }

    func testCaptionDefaults() {
        let defaults = ElementDefaults.defaults(for: "caption")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertNil(defaults["alignItems"])
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
        XCTAssertEqual(defaults["borderStyle"] as? String, "inset")
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
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
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
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
    }

    // MARK: - P1 Block Containers

    func testAddressDefaults() {
        let defaults = ElementDefaults.defaults(for: "address")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
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
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    func testPreDefaults() {
        let defaults = ElementDefaults.defaults(for: "pre")
        XCTAssertEqual(defaults["display"] as? String, "block")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexWrap"] as? String, "nowrap")
        XCTAssertEqual(defaults["fontSize"] as? Int, 13)
        XCTAssertEqual(defaults["marginTop"] as? Int, 13)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 13)
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
        XCTAssertNil(defaults["minHeight"])
        XCTAssertNil(defaults["alignItems"])
    }

    func testSmallDefaults() {
        let defaults = ElementDefaults.defaults(for: "small")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["alignSelf"] as? String, "flex-end")
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
    }

    func testCodeDefaults() {
        let defaults = ElementDefaults.defaults(for: "code")
        XCTAssertNil(defaults["display"])
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["alignSelf"] as? String, "flex-end")
        XCTAssertEqual(defaults["fontSize"] as? Int, 13)
        XCTAssertEqual(defaults["fontFamily"] as? String, "Menlo")
        XCTAssertNil(defaults["lineHeight"], "lineHeight should not be in style dict — it is an internal measurement hint")
        XCTAssertNil(defaults["alignItems"])
    }

    // MARK: - textLineHeight(for:)

    func testTextLineHeightForMonospaceElements() {
        XCTAssertEqual(ElementDefaults.textLineHeight(for: "code"), 14)
        XCTAssertEqual(ElementDefaults.textLineHeight(for: "kbd"), 14)
        XCTAssertEqual(ElementDefaults.textLineHeight(for: "samp"), 14)
    }

    func testTextLineHeightNilForNonMonospace() {
        XCTAssertNil(ElementDefaults.textLineHeight(for: "div"))
        XCTAssertNil(ElementDefaults.textLineHeight(for: "p"))
        XCTAssertNil(ElementDefaults.textLineHeight(for: "span"))
        XCTAssertNil(ElementDefaults.textLineHeight(for: "h1"))
    }

    // MARK: - yogaMinHeight(for:)

    func testYogaMinHeightForSubSup() {
        XCTAssertEqual(ElementDefaults.yogaMinHeight(for: "sub"), 24)
        XCTAssertEqual(ElementDefaults.yogaMinHeight(for: "sup"), 23)
        XCTAssertNil(ElementDefaults.yogaMinHeight(for: "textarea"))
    }

    func testYogaMinHeightNilForOtherElements() {
        XCTAssertNil(ElementDefaults.yogaMinHeight(for: "div"))
        XCTAssertNil(ElementDefaults.yogaMinHeight(for: "span"))
        XCTAssertNil(ElementDefaults.yogaMinHeight(for: "mark"))
        XCTAssertNil(ElementDefaults.yogaMinHeight(for: "small"))
        XCTAssertNil(ElementDefaults.yogaMinHeight(for: "code"))
    }

    // MARK: - yogaTextContainerMinHeight(for:fontSize:)

    func testYogaTextContainerMinHeightFontMetrics() {
        // Print UIFont metrics for diagnostic purposes
        for size in [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32] as [CGFloat] {
            let font = UIFont.systemFont(ofSize: size)
            let lh = font.lineHeight
            let ceilLh = ceil(lh)
            let oldFormula = ceil(1.2 * size)
            print("fontSize=\(Int(size)): UIFont.lineHeight=\(lh), ceil=\(Int(ceilLh)), old=\(Int(oldFormula)), ascender=\(font.ascender), descender=\(font.descender), leading=\(font.leading)")
        }
    }

    func testYogaTextContainerMinHeightForP() {
        let minHeight = ElementDefaults.yogaTextContainerMinHeight(for: "p", fontSize: 16)!
        // UIFont.systemFont(ofSize: 16).lineHeight ≈ 19.09, ceil → 20
        XCTAssertEqual(minHeight, 20)
    }

    func testYogaTextContainerMinHeightScalesWithFontSize() {
        // ceil(1.2 * 32) = 39
        let h1Height = ElementDefaults.yogaTextContainerMinHeight(for: "h1", fontSize: 32)!
        XCTAssertEqual(h1Height, 39)
        // ceil(1.2 * 24) = 29
        let h2Height = ElementDefaults.yogaTextContainerMinHeight(for: "h2", fontSize: 24)!
        XCTAssertEqual(h2Height, 29)
    }

    func testYogaTextContainerMinHeightNilForNonTextContainers() {
        XCTAssertNil(ElementDefaults.yogaTextContainerMinHeight(for: "div", fontSize: 16))
        XCTAssertNil(ElementDefaults.yogaTextContainerMinHeight(for: "span", fontSize: 16))
        XCTAssertNil(ElementDefaults.yogaTextContainerMinHeight(for: "mark", fontSize: 16))
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
        XCTAssertEqual(merged["borderStyle"] as? String, "solid")
        XCTAssertEqual(merged["borderColor"] as? String, "red")
        XCTAssertNil(merged["border"])
    }

    func testBorderShorthandFractionalWidth() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "2.5px solid #333"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 2.5)
        XCTAssertEqual(merged["borderStyle"] as? String, "solid")
        XCTAssertEqual(merged["borderColor"] as? String, "#333")
    }

    func testBorderShorthandRgbaColor() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "1px solid rgba(255, 0, 0, 0.4)"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
        XCTAssertEqual(merged["borderStyle"] as? String, "solid")
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
        XCTAssertEqual(merged["borderStyle"] as? String, "solid")
        XCTAssertEqual(merged["borderColor"] as? String, "red")
    }

    func testBorderShorthandExplicitColorOverrides() {
        let merged = ElementDefaults.mergedStyle(
            for: "div",
            userStyle: ["border": "1px solid red", "borderColor": "blue"]
        )
        XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
        XCTAssertEqual(merged["borderStyle"] as? String, "solid")
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

    // MARK: - Line-height resolution

    func testPaddingShorthandOverridesDefaultIndividualPadding() {
        // textarea has default paddingTop/Bottom/Left/Right: 4
        // User sets padding: 8 (shorthand) — should remove individual defaults
        let merged = ElementDefaults.mergedStyle(
            for: "textarea",
            userStyle: ["padding": 8]
        )
        XCTAssertEqual(merged["padding"] as? Int, 8)
        XCTAssertNil(merged["paddingTop"], "shorthand should remove default paddingTop")
        XCTAssertNil(merged["paddingBottom"], "shorthand should remove default paddingBottom")
        XCTAssertNil(merged["paddingLeft"], "shorthand should remove default paddingLeft")
        XCTAssertNil(merged["paddingRight"], "shorthand should remove default paddingRight")
    }

    func testPaddingShorthandPreservesExplicitIndividualPadding() {
        // When user sets both shorthand AND individual, keep the individual
        let merged = ElementDefaults.mergedStyle(
            for: "textarea",
            userStyle: ["padding": 8, "paddingTop": 12]
        )
        XCTAssertEqual(merged["padding"] as? Int, 8)
        XCTAssertEqual(merged["paddingTop"] as? Int, 12)
        XCTAssertNil(merged["paddingBottom"])
    }

    func testLineHeightResolvedAsMultiplier() {
        // CSS unitless line-height is a multiplier: lineHeight * fontSize
        let merged = ElementDefaults.mergedStyle(
            for: "p",
            userStyle: ["lineHeight": 2, "fontSize": 16]
        )
        // 2 * 16 = 32px
        XCTAssertEqual(merged["lineHeight"] as? Double, 32.0)
    }

    func testLineHeightUsesDefaultFontSizeWhenNotSpecified() {
        // When no fontSize is provided, uses default 16
        let merged = ElementDefaults.mergedStyle(
            for: "p",
            userStyle: ["lineHeight": 1.5]
        )
        // 1.5 * 16 = 24px
        XCTAssertEqual(merged["lineHeight"] as? Double, 24.0)
    }

    func testLineHeightUsesElementDefaultFontSize() {
        // h1 has fontSize 32 in defaults — lineHeight should multiply by that
        let merged = ElementDefaults.mergedStyle(
            for: "h1",
            userStyle: ["lineHeight": 1.5]
        )
        // 1.5 * 32 = 48px
        XCTAssertEqual(merged["lineHeight"] as? Double, 48.0)
    }
}
