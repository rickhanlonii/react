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
        // With the flex context override applied at insertion time, block
        // children of flex parents get their Yoga display overridden from
        // .block to .flex, so flexGrow distributes space by ratio (1:2:1).

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

        // Insert children with flex context override (simulates appendChild)
        let rowStyle = row.props["style"] as? [String: Any] ?? [:]

        YGNodeInsertChild(row.yogaNode, child1.yogaNode, 0)
        let child1Style = child1.props["style"] as? [String: Any] ?? [:]
        YogaStyleApplier.applyFlexContextOverride(parent: row.yogaNode, child: child1.yogaNode, parentStyle: rowStyle, childStyle: child1Style)

        YGNodeInsertChild(row.yogaNode, child2.yogaNode, 1)
        let child2Style = child2.props["style"] as? [String: Any] ?? [:]
        YogaStyleApplier.applyFlexContextOverride(parent: row.yogaNode, child: child2.yogaNode, parentStyle: rowStyle, childStyle: child2Style)

        YGNodeInsertChild(row.yogaNode, child3.yogaNode, 2)
        let child3Style = child3.props["style"] as? [String: Any] ?? [:]
        YogaStyleApplier.applyFlexContextOverride(parent: row.yogaNode, child: child3.yogaNode, parentStyle: rowStyle, childStyle: child3Style)

        YGNodeInsertChild(outer.yogaNode, row.yogaNode, 0)

        YGNodeCalculateLayout(outer.yogaNode, 390, Float.nan, .LTR)

        // Available space = 390 - 2*8 (gap) = 374
        // Ratio 1:2:1 => child1=93.5, child2=187, child3=93.5
        XCTAssertEqual(YGNodeLayoutGetWidth(child1.yogaNode), 93.5, accuracy: 0.5)
        XCTAssertEqual(YGNodeLayoutGetWidth(child2.yogaNode), 187, accuracy: 0.5)
        XCTAssertEqual(YGNodeLayoutGetWidth(child3.yogaNode), 93.5, accuracy: 0.5)
    }

    // MARK: - Flex context override

    func testFlexContextOverrideBlockChildInFlexParent() {
        // Block child in explicit flex parent: display should be overridden to .flex
        let parent = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(parent, .flex)

        let child = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(child, .block)

        YGNodeInsertChild(parent, child, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: parent, child: child,
            parentStyle: ["display": "flex"], childStyle: [:]
        )

        XCTAssertEqual(YGNodeStyleGetDisplay(child), .flex)
        XCTAssertEqual(YGNodeStyleGetFlexDirection(child), .column)

        YGNodeRemoveAllChildren(parent)
        YGNodeFree(child)
        YGNodeFree(parent)
    }

    func testFlexContextOverrideBlockChildInBlockParent() {
        // Block child in block parent: no override (preserves margin collapsing)
        let parent = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(parent, .block)

        let child = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(child, .block)

        YGNodeInsertChild(parent, child, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: parent, child: child,
            parentStyle: ["display": "block"], childStyle: [:]
        )

        XCTAssertEqual(YGNodeStyleGetDisplay(child), .block)

        YGNodeRemoveAllChildren(parent)
        YGNodeFree(child)
        YGNodeFree(parent)
    }

    func testFlexContextOverrideBlockChildInImplicitFlexParent() {
        // Block child in parent with NO explicit display (Yoga defaults to
        // .flex but style dict has no "display" key): no override.
        // This is the key regression fix — the root fixture container
        // never sets display explicitly, so its block children must
        // NOT be converted to flex.
        let parent = YGNodeNewWithConfig(YogaConfig.shared)!
        // Don't set display — Yoga defaults to .flex

        let child = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(child, .block)

        YGNodeInsertChild(parent, child, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: parent, child: child,
            parentStyle: [:], childStyle: [:]
        )

        XCTAssertEqual(YGNodeStyleGetDisplay(child), .block)

        YGNodeRemoveAllChildren(parent)
        YGNodeFree(child)
        YGNodeFree(parent)
    }

    func testFlexContextOverridePreservesExplicitFlexDirection() {
        // Block child with explicit flexDirection:row in style dict should
        // NOT have its flexDirection overridden to column
        let parent = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(parent, .flex)

        let child = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(child, .block)
        YGNodeStyleSetFlexDirection(child, .row)

        YGNodeInsertChild(parent, child, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: parent, child: child,
            parentStyle: ["display": "flex"],
            childStyle: ["flexDirection": "row"]
        )

        XCTAssertEqual(YGNodeStyleGetDisplay(child), .flex)
        XCTAssertEqual(YGNodeStyleGetFlexDirection(child), .row)

        YGNodeRemoveAllChildren(parent)
        YGNodeFree(child)
        YGNodeFree(parent)
    }

    func testFlexContextOverrideFlexChildUnchanged() {
        // Child with display:flex should NOT be affected
        let parent = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(parent, .flex)

        let child = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetDisplay(child, .flex)
        YGNodeStyleSetFlexDirection(child, .row)

        YGNodeInsertChild(parent, child, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: parent, child: child,
            parentStyle: ["display": "flex"], childStyle: [:]
        )

        XCTAssertEqual(YGNodeStyleGetDisplay(child), .flex)
        XCTAssertEqual(YGNodeStyleGetFlexDirection(child), .row)

        YGNodeRemoveAllChildren(parent)
        YGNodeFree(child)
        YGNodeFree(parent)
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

    func testMarginAutoCentersHorizontally() {
        // A fixed-width child with marginLeft/marginRight auto should be centered.
        let outer = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )
        let child = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 200, "height": 50, "marginLeft": "auto", "marginRight": "auto"]],
            surfaceId: 0
        )

        YGNodeInsertChild(outer.yogaNode, child.yogaNode, 0)
        YGNodeCalculateLayout(outer.yogaNode, 390, Float.nan, .LTR)

        // Child should be centered: (390 - 200) / 2 = 95
        XCTAssertEqual(YGNodeLayoutGetLeft(child.yogaNode), 95, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetWidth(child.yogaNode), 200, accuracy: 0.1)
        // Note: YGNodeLayoutGetMargin returns 0 for auto margins, not the
        // computed value. The LayoutExtractor must compute auto margins from
        // layout position and parent width instead.
    }
}
