import XCTest
@testable import ReactDomNativeKit

final class ElementDefaultsTests: XCTestCase {

    // MARK: - defaults(for:) — Block containers

    func testBlockContainersReturnFlexDirectionColumn() {
        let blockTypes = ["div", "main", "section", "article", "nav", "header", "footer", "aside", "form"]
        for type in blockTypes {
            let defaults = ElementDefaults.defaults(for: type)
            XCTAssertEqual(defaults["flexDirection"] as? String, "column", "\(type) should default to flexDirection column")
        }
    }

    // MARK: - defaults(for:) — Text containers

    func testParagraphDefaults() {
        let defaults = ElementDefaults.defaults(for: "p")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
    }

    func testH1Defaults() {
        let defaults = ElementDefaults.defaults(for: "h1")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Int, 32)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH2Defaults() {
        let defaults = ElementDefaults.defaults(for: "h2")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Int, 24)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH3Defaults() {
        let defaults = ElementDefaults.defaults(for: "h3")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Double, 18.7)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH4Defaults() {
        let defaults = ElementDefaults.defaults(for: "h4")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Int, 16)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH5Defaults() {
        let defaults = ElementDefaults.defaults(for: "h5")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.3)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testH6Defaults() {
        let defaults = ElementDefaults.defaults(for: "h6")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontSize"] as? Double, 10.7)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    // MARK: - defaults(for:) — Inline

    func testSpanDefaults() {
        let defaults = ElementDefaults.defaults(for: "span")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    }

    // MARK: - defaults(for:) — Interactive

    func testButtonDefaults() {
        let defaults = ElementDefaults.defaults(for: "button")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["alignItems"] as? String, "center")
        XCTAssertEqual(defaults["justifyContent"] as? String, "center")
        XCTAssertEqual(defaults["paddingTop"] as? Int, 4)
        XCTAssertEqual(defaults["paddingBottom"] as? Int, 4)
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 12)
        XCTAssertEqual(defaults["paddingRight"] as? Int, 12)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderColor"] as? String, "#767676")
        XCTAssertEqual(defaults["borderRadius"] as? Int, 4)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#EFEFEF")
    }

    func testInputDefaults() {
        let defaults = ElementDefaults.defaults(for: "input")
        XCTAssertEqual(defaults["height"] as? Int, 32)
        XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
        XCTAssertEqual(defaults["borderColor"] as? String, "#767676")
    }

    // MARK: - defaults(for:) — Lists

    func testListDefaults() {
        for type in ["ul", "ol"] {
            let defaults = ElementDefaults.defaults(for: type)
            XCTAssertEqual(defaults["flexDirection"] as? String, "column", "\(type) should default to flexDirection column")
            XCTAssertEqual(defaults["paddingLeft"] as? Int, 40, "\(type) should have paddingLeft 40")
        }
    }

    // MARK: - defaults(for:) — Links

    func testAnchorDefaults() {
        let defaults = ElementDefaults.defaults(for: "a")
        XCTAssertEqual(defaults["color"] as? String, "#007AFF")
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "underline")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    }

    // MARK: - Definition Lists

    func testDlDefaults() {
        let defaults = ElementDefaults.defaults(for: "dl")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
    }

    func testDtDefaults() {
        let defaults = ElementDefaults.defaults(for: "dt")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    }

    func testDdDefaults() {
        let defaults = ElementDefaults.defaults(for: "dd")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
    }

    // MARK: - P1 Block Containers

    func testAddressDefaults() {
        let defaults = ElementDefaults.defaults(for: "address")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
    }

    func testBlockquoteDefaults() {
        let defaults = ElementDefaults.defaults(for: "blockquote")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
        XCTAssertEqual(defaults["marginRight"] as? Int, 40)
    }

    func testFigureDefaults() {
        let defaults = ElementDefaults.defaults(for: "figure")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
        XCTAssertEqual(defaults["marginLeft"] as? Int, 40)
        XCTAssertEqual(defaults["marginRight"] as? Int, 40)
    }

    func testFigcaptionDefaults() {
        let defaults = ElementDefaults.defaults(for: "figcaption")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    }

    func testPreDefaults() {
        let defaults = ElementDefaults.defaults(for: "pre")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults["marginTop"] as? Int, 16)
        XCTAssertEqual(defaults["marginBottom"] as? Int, 16)
        XCTAssertEqual(defaults["fontFamily"] as? String, "Menlo")
    }

    // MARK: - P1 Inline Text

    func testBDefaults() {
        let defaults = ElementDefaults.defaults(for: "b")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
    }

    func testIDefaults() {
        let defaults = ElementDefaults.defaults(for: "i")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
    }

    func testUDefaults() {
        let defaults = ElementDefaults.defaults(for: "u")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "underline")
    }

    func testSDefaults() {
        let defaults = ElementDefaults.defaults(for: "s")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "line-through")
    }

    func testDelDefaults() {
        let defaults = ElementDefaults.defaults(for: "del")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "line-through")
    }

    func testInsDefaults() {
        let defaults = ElementDefaults.defaults(for: "ins")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["textDecorationLine"] as? String, "underline")
    }

    func testMarkDefaults() {
        let defaults = ElementDefaults.defaults(for: "mark")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["backgroundColor"] as? String, "#FFFF00")
        XCTAssertEqual(defaults["color"] as? String, "#000000")
    }

    func testSmallDefaults() {
        let defaults = ElementDefaults.defaults(for: "small")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
    }

    func testCodeDefaults() {
        let defaults = ElementDefaults.defaults(for: "code")
        XCTAssertEqual(defaults["flexDirection"] as? String, "row")
        XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
        XCTAssertEqual(defaults["fontFamily"] as? String, "Menlo")
    }

    // MARK: - defaults(for:) — Unknown element

    func testUnknownElementFallsBackToBlockDefaults() {
        let defaults = ElementDefaults.defaults(for: "custom-element")
        XCTAssertEqual(defaults["flexDirection"] as? String, "column")
        XCTAssertEqual(defaults.count, 1, "Unknown element should only have flexDirection")
    }

    // MARK: - mergedStyle(for:userStyle:)

    func testMergedStyleReturnsDefaultsWhenUserStyleIsNil() {
        let merged = ElementDefaults.mergedStyle(for: "div", userStyle: nil)
        XCTAssertEqual(merged["flexDirection"] as? String, "column")
    }

    func testMergedStyleReturnsDefaultsWhenUserStyleIsEmpty() {
        let merged = ElementDefaults.mergedStyle(for: "div", userStyle: [:])
        XCTAssertEqual(merged["flexDirection"] as? String, "column")
    }

    func testMergedStyleUserOverridesDefaults() {
        let merged = ElementDefaults.mergedStyle(for: "div", userStyle: ["flexDirection": "row"])
        XCTAssertEqual(merged["flexDirection"] as? String, "row")
    }

    func testMergedStyleUserAddsPropertiesWithoutRemovingDefaults() {
        let merged = ElementDefaults.mergedStyle(for: "h1", userStyle: ["backgroundColor": "red"])
        XCTAssertEqual(merged["flexDirection"] as? String, "column")
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
}
