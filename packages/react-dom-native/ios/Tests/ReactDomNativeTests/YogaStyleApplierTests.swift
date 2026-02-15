import XCTest
import Yoga
@testable import ReactDomNativeKit

final class YogaStyleApplierTests: XCTestCase {

    private var node: YGNodeRef!

    override func setUp() {
        super.setUp()
        node = YGNodeNew()
    }

    override func tearDown() {
        YGNodeFree(node)
        node = nil
        super.tearDown()
    }

    // MARK: - Overflow (new property)

    func testOverflowVisible() {
        YogaStyleApplier.apply(["overflow": "visible"], to: node)
        XCTAssertEqual(YGNodeStyleGetOverflow(node), .visible)
    }

    func testOverflowHidden() {
        YogaStyleApplier.apply(["overflow": "hidden"], to: node)
        XCTAssertEqual(YGNodeStyleGetOverflow(node), .hidden)
    }

    func testOverflowScroll() {
        YogaStyleApplier.apply(["overflow": "scroll"], to: node)
        XCTAssertEqual(YGNodeStyleGetOverflow(node), .scroll)
    }

    func testOverflowAuto() {
        YogaStyleApplier.apply(["overflow": "auto"], to: node)
        XCTAssertEqual(YGNodeStyleGetOverflow(node), .scroll)
    }

    // MARK: - Position offsets (new properties)

    func testPositionTop() {
        YogaStyleApplier.apply(["top": 10], to: node)
        XCTAssertEqual(YGNodeStyleGetPosition(node, .top).value, 10)
    }

    func testPositionLeft() {
        YogaStyleApplier.apply(["left": 20], to: node)
        XCTAssertEqual(YGNodeStyleGetPosition(node, .left).value, 20)
    }

    func testPositionRight() {
        YogaStyleApplier.apply(["right": 30], to: node)
        XCTAssertEqual(YGNodeStyleGetPosition(node, .right).value, 30)
    }

    func testPositionBottom() {
        YogaStyleApplier.apply(["bottom": 40], to: node)
        XCTAssertEqual(YGNodeStyleGetPosition(node, .bottom).value, 40)
    }

    // MARK: - Border width (new properties)

    func testBorderWidthAllEdges() {
        YogaStyleApplier.apply(["borderWidth": 2], to: node)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .all), 2)
    }

    func testBorderWidthIndividualEdges() {
        YogaStyleApplier.apply([
            "borderTopWidth": 1,
            "borderRightWidth": 2,
            "borderBottomWidth": 3,
            "borderLeftWidth": 4
        ], to: node)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .top), 1)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .right), 2)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .bottom), 3)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .left), 4)
    }

    // MARK: - Existing properties (regression coverage)

    func testFlexDirectionColumn() {
        YogaStyleApplier.apply(["flexDirection": "column"], to: node)
        XCTAssertEqual(YGNodeStyleGetFlexDirection(node), .column)
    }

    func testFlexDirectionRow() {
        YogaStyleApplier.apply(["flexDirection": "row"], to: node)
        XCTAssertEqual(YGNodeStyleGetFlexDirection(node), .row)
    }

    func testDisplayNone() {
        YogaStyleApplier.apply(["display": "none"], to: node)
        XCTAssertEqual(YGNodeStyleGetDisplay(node), .none)
    }

    func testPaddingAndMargin() {
        YogaStyleApplier.apply([
            "padding": 10,
            "marginTop": 5
        ], to: node)
        XCTAssertEqual(YGNodeStyleGetPadding(node, .all).value, 10)
        XCTAssertEqual(YGNodeStyleGetMargin(node, .top).value, 5)
    }

    func testWidthAndHeight() {
        YogaStyleApplier.apply(["width": 100, "height": 200], to: node)
        XCTAssertEqual(YGNodeStyleGetWidth(node).value, 100)
        XCTAssertEqual(YGNodeStyleGetHeight(node).value, 200)
    }

    func testUnknownPropertyDoesNotCrash() {
        YogaStyleApplier.apply(["backgroundColor": "red", "unknownProp": 42], to: node)
        // Should not crash — unknown properties are silently ignored
    }

    func testPositionAbsolute() {
        YogaStyleApplier.apply(["position": "absolute"], to: node)
        XCTAssertEqual(YGNodeStyleGetPositionType(node), .absolute)
    }

    func testAlignItemsCenter() {
        YogaStyleApplier.apply(["alignItems": "center"], to: node)
        XCTAssertEqual(YGNodeStyleGetAlignItems(node), .center)
    }

    func testJustifyContentSpaceBetween() {
        YogaStyleApplier.apply(["justifyContent": "space-between"], to: node)
        XCTAssertEqual(YGNodeStyleGetJustifyContent(node), .spaceBetween)
    }
}
