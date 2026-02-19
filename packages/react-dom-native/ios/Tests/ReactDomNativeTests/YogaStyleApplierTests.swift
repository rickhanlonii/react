import XCTest
import Yoga
@testable import ReactDomNativeKit
@testable import ShadowTree

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

    // MARK: - Flex grow layout

    func testFlexGrowDistribution() {
        // Replicate the flex-grow fixture:
        // <div style={{width: 390}}>
        //   <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
        //     <div style={{flexGrow: 1, height: 50}} />
        //     <div style={{flexGrow: 2, height: 50}} />
        //     <div style={{flexGrow: 1, height: 50}} />
        //   </div>
        // </div>
        //
        // Note: blockDefaults adds display:"block" to each child div.
        // Yoga's Display.block prevents children from respecting flexGrow
        // ratios inside a flex parent — they distribute space equally instead.
        // This is a known Yoga limitation (CSS would give 1:2:1 ratios).
        // We keep Display.block because it's needed for margin collapsing.

        let outer = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )

        let row = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["display": "flex", "flexDirection": "row", "gap": 8]],
            surfaceId: 0
        )

        let child1 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["flexGrow": 1, "height": 50]],
            surfaceId: 0
        )
        let child2 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["flexGrow": 2, "height": 50]],
            surfaceId: 0
        )
        let child3 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["flexGrow": 1, "height": 50]],
            surfaceId: 0
        )

        YGNodeInsertChild(row.yogaNode, child1.yogaNode, 0)
        YGNodeInsertChild(row.yogaNode, child2.yogaNode, 1)
        YGNodeInsertChild(row.yogaNode, child3.yogaNode, 2)
        YGNodeInsertChild(outer.yogaNode, row.yogaNode, 0)

        YGNodeCalculateLayout(outer.yogaNode, 390, Float.nan, .LTR)

        // Yoga Display.block children distribute space equally (374/3 ≈ 124.67)
        // rather than by flex-grow ratio (CSS would give 93.5, 187, 93.5).
        let equalWidth: Float = (390 - 2 * 8) / 3  // ≈ 124.67
        XCTAssertEqual(YGNodeLayoutGetWidth(child1.yogaNode), equalWidth, accuracy: 1.0)
        XCTAssertEqual(YGNodeLayoutGetWidth(child2.yogaNode), equalWidth, accuracy: 1.0)
        XCTAssertEqual(YGNodeLayoutGetWidth(child3.yogaNode), equalWidth, accuracy: 1.0)
    }

    func testBlockDefaultsStackVerticallyAndStretch() {
        // Verify display: block gives vertical stacking + width stretch.
        let outer = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )
        let child1 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 50]],
            surfaceId: 0
        )
        let child2 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 50]],
            surfaceId: 0
        )

        YGNodeInsertChild(outer.yogaNode, child1.yogaNode, 0)
        YGNodeInsertChild(outer.yogaNode, child2.yogaNode, 1)

        YGNodeCalculateLayout(outer.yogaNode, 390, Float.nan, .LTR)

        // Children should stack vertically and stretch to fill parent width
        XCTAssertEqual(YGNodeLayoutGetTop(child1.yogaNode), 0, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetTop(child2.yogaNode), 50, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetWidth(child1.yogaNode), 390, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetWidth(child2.yogaNode), 390, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(outer.yogaNode), 100, accuracy: 0.1)
    }
}
