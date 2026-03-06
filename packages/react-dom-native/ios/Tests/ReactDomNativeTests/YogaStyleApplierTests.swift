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
        YogaStyleApplier.apply(["borderWidth": 2, "borderStyle": "solid"], to: node)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .all), 2)
    }

    func testBorderWidthIndividualEdges() {
        YogaStyleApplier.apply([
            "borderTopWidth": 1,
            "borderRightWidth": 2,
            "borderBottomWidth": 3,
            "borderLeftWidth": 4,
            "borderStyle": "solid"
        ], to: node)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .top), 1)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .right), 2)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .bottom), 3)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .left), 4)
    }

    func testBorderWidthSkippedWhenBorderStyleNone() {
        YogaStyleApplier.apply(["borderWidth": 2, "borderStyle": "none"], to: node)
        XCTAssertTrue(YGNodeStyleGetBorder(node, .all).isNaN, "borderWidth should not be set when borderStyle is none")
    }

    func testBorderWidthSkippedWhenBorderStyleAbsent() {
        YogaStyleApplier.apply(["borderWidth": 2], to: node)
        XCTAssertTrue(YGNodeStyleGetBorder(node, .all).isNaN, "borderWidth should not be set when borderStyle is absent")
    }

    func testBorderStyleWithoutBorderWidthDefaultsToMedium() {
        // CSS initial border-width is "medium" (3px). When borderStyle is set
        // without an explicit borderWidth, all edges should default to 3.
        YogaStyleApplier.apply(["borderStyle": "solid"], to: node)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .all), 3, "border-width should default to medium (3px) when borderStyle is set")
    }

    func testBorderStyleWithPerSideWidthOverridesDefault() {
        // When borderStyle is set with only borderBottomWidth, the other edges
        // should still get the CSS initial 3px, and bottom should be overridden.
        YogaStyleApplier.apply(["borderStyle": "solid", "borderBottomWidth": 1], to: node)
        XCTAssertEqual(YGNodeStyleGetBorder(node, .all), 3, "unset edges should default to medium (3px)")
        XCTAssertEqual(YGNodeStyleGetBorder(node, .bottom), 1, "per-side value should override the default")
    }

    // MARK: - Aspect ratio

    func testAspectRatio() {
        YogaStyleApplier.apply(["aspectRatio": 2], to: node)
        XCTAssertEqual(YGNodeStyleGetAspectRatio(node), 2)
    }

    func testAspectRatioWithWidth() {
        // width:200 + aspectRatio:2 → height should be 100
        let n = YGNodeNewWithConfig(YogaConfig.shared)!
        YogaStyleApplier.apply(["width": 200, "aspectRatio": 2], to: n)
        YGNodeCalculateLayout(n, Float.nan, Float.nan, .LTR)
        XCTAssertEqual(YGNodeLayoutGetWidth(n), 200, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(n), 100, accuracy: 0.1)
        YGNodeFree(n)
    }

    func testAspectRatioSquare() {
        // width:100 + aspectRatio:1 → height should be 100
        let n = YGNodeNewWithConfig(YogaConfig.shared)!
        YogaStyleApplier.apply(["width": 100, "aspectRatio": 1], to: n)
        YGNodeCalculateLayout(n, Float.nan, Float.nan, .LTR)
        XCTAssertEqual(YGNodeLayoutGetWidth(n), 100, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(n), 100, accuracy: 0.1)
        YGNodeFree(n)
    }

    func testAspectRatioFractional() {
        // width:200 + aspectRatio:0.5 → height should be 400
        let n = YGNodeNewWithConfig(YogaConfig.shared)!
        YogaStyleApplier.apply(["width": 200, "aspectRatio": 0.5], to: n)
        YGNodeCalculateLayout(n, Float.nan, Float.nan, .LTR)
        XCTAssertEqual(YGNodeLayoutGetWidth(n), 200, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(n), 400, accuracy: 0.1)
        YGNodeFree(n)
    }

    func testAspectRatioInBlockParent() {
        // Yoga's calculateBlockLayout does not handle aspectRatio.
        // Pre-computing height in YogaStyleApplier works around this.
        let parent = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )
        let child = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 200, "aspectRatio": 2]],
            surfaceId: 0
        )
        YGNodeInsertChild(parent.yogaNode, child.yogaNode, 0)
        YGNodeCalculateLayout(parent.yogaNode, 390, Float.nan, .LTR)

        XCTAssertEqual(YGNodeLayoutGetWidth(child.yogaNode), 200, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(child.yogaNode), 100, accuracy: 0.1,
                       "width:200 / aspectRatio:2 should give height:100 in block layout")
        YGNodeRemoveAllChildren(parent.yogaNode)
    }

    func testAspectRatioSquareInBlockParent() {
        let parent = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )
        let child = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 100, "aspectRatio": 1]],
            surfaceId: 0
        )
        YGNodeInsertChild(parent.yogaNode, child.yogaNode, 0)
        YGNodeCalculateLayout(parent.yogaNode, 390, Float.nan, .LTR)

        XCTAssertEqual(YGNodeLayoutGetWidth(child.yogaNode), 100, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(child.yogaNode), 100, accuracy: 0.1,
                       "width:100 / aspectRatio:1 should give height:100 in block layout")
        YGNodeRemoveAllChildren(parent.yogaNode)
    }

    func testAspectRatioWithMaxHeightInBlockParent() {
        // width:200 + aspectRatio:1 → computed height:200, clamped by maxHeight:80
        let parent = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )
        let child = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 200, "aspectRatio": 1, "maxHeight": 80]],
            surfaceId: 0
        )
        YGNodeInsertChild(parent.yogaNode, child.yogaNode, 0)
        YGNodeCalculateLayout(parent.yogaNode, 390, Float.nan, .LTR)

        XCTAssertEqual(YGNodeLayoutGetWidth(child.yogaNode), 200, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(child.yogaNode), 80, accuracy: 0.1,
                       "height from aspectRatio should be clamped by maxHeight")
        YGNodeRemoveAllChildren(parent.yogaNode)
    }

    func testAspectRatioWithNSNumberValues() {
        // Values from JSC arrive as NSNumber, not Swift Int/Double.
        // Verify toFloat handles NSNumber correctly.
        let n = YGNodeNewWithConfig(YogaConfig.shared)!
        let style: [String: Any] = [
            "width": NSNumber(value: 200),
            "aspectRatio": NSNumber(value: 2)
        ]
        YogaStyleApplier.apply(style, to: n)
        YGNodeCalculateLayout(n, Float.nan, Float.nan, .LTR)
        XCTAssertEqual(YGNodeLayoutGetWidth(n), 200, accuracy: 0.1)
        XCTAssertEqual(YGNodeLayoutGetHeight(n), 100, accuracy: 0.1,
                       "aspectRatio with NSNumber values should compute height correctly")
        YGNodeFree(n)
    }

    // MARK: - Existing properties (regression coverage)

    func testMaxHeightClampsHeightInFlexColumn() {
        // Reproduces max-height-in-flex section 3 via ShadowTreeBuilder
        // (the LayoutCompare code path).
        let builder = ShadowTreeBuilder(surfaceId: 0, viewportWidth: 390, viewportHeight: 844)

        // Root div with padding
        builder.openElement(type: "div", props: ["style": ["padding": 8]])

        // Flex column container with gap
        builder.openElement(type: "div", props: ["style": [
            "display": "flex",
            "flexDirection": "column",
            "width": 374,
            "backgroundColor": "#d5e8d4",
            "padding": 8,
            "marginBottom": 8,
            "gap": 4
        ] as [String: Any]])

        // Child 1: height:80, maxHeight:30
        builder.openElement(type: "div", props: ["style": ["height": 80, "maxHeight": 30]])
        builder.closeElement()

        // Child 2: height:80, maxHeight:50
        builder.openElement(type: "div", props: ["style": ["height": 80, "maxHeight": 50]])
        builder.closeElement()

        // Child 3: height:40
        builder.openElement(type: "div", props: ["style": ["height": 40]])
        builder.closeElement()

        builder.closeElement() // flex column container
        builder.closeElement() // root div

        builder.rootComplete()

        // Check the flex column container's children
        let root = builder.rootChildren[0]
        let container = root.children[0]
        let c1 = container.children[0]
        let c2 = container.children[1]
        let c3 = container.children[2]

        let h1 = YGNodeLayoutGetHeight(c1.yogaNode)
        let h2 = YGNodeLayoutGetHeight(c2.yogaNode)
        let h3 = YGNodeLayoutGetHeight(c3.yogaNode)
        print("ShadowTreeBuilder maxHeight: child heights = \(h1), \(h2), \(h3)")
        print("ShadowTreeBuilder maxHeight: container height = \(YGNodeLayoutGetHeight(container.yogaNode))")

        XCTAssertEqual(h1, 30, accuracy: 0.1,
                       "height:80 maxHeight:30 should clamp to 30")
        XCTAssertEqual(h2, 50, accuracy: 0.1,
                       "height:80 maxHeight:50 should clamp to 50")
        XCTAssertEqual(h3, 40, accuracy: 0.1,
                       "height:40 with no maxHeight should stay 40")

        // Total content = 8(pad) + 30 + 4(gap) + 50 + 4(gap) + 40 + 8(pad) = 144
        XCTAssertEqual(YGNodeLayoutGetHeight(container.yogaNode), 144, accuracy: 0.1,
                       "container height should be sum of clamped children + gaps + padding")
    }

    func testRelativePositionOffset() {
        // Test 1: Flex parent — Yoga includes relative offset in layout
        let flexParent = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["display": "flex", "flexDirection": "column", "width": 300, "height": 60, "padding": 10]],
            surfaceId: 0
        )
        let flexChild = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "width": 60, "height": 40,
                "position": "relative", "top": 10, "left": 20
            ]],
            surfaceId: 0
        )
        let flexParentStyle = flexParent.props["style"] as? [String: Any] ?? [:]
        YGNodeInsertChild(flexParent.yogaNode, flexChild.yogaNode, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: flexParent.yogaNode, child: flexChild.yogaNode,
            parentStyle: flexParentStyle, childStyle: flexChild.props["style"] as? [String: Any] ?? [:]
        )
        YGNodeCalculateLayout(flexParent.yogaNode, 300, 60, .LTR)
        // Flex layout: Yoga already includes the relative offset
        ShadowTreeLayout.readLayoutFrames(node: flexChild)
        XCTAssertEqual(flexChild.layoutFrame.origin.x, 30, accuracy: 0.01, "flex: relative left:20 applied (10+20=30)")
        XCTAssertEqual(flexChild.layoutFrame.origin.y, 20, accuracy: 0.01, "flex: relative top:10 applied (10+10=20)")
        YGNodeRemoveAllChildren(flexParent.yogaNode)

        // Test 2: Block parent — readLayoutFrames applies the offset manually
        let blockParent = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 300, "height": 60, "padding": 10]],
            surfaceId: 0
        )
        let blockChild = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "width": 60, "height": 40,
                "position": "relative", "top": 10, "left": 20
            ]],
            surfaceId: 0
        )
        YGNodeInsertChild(blockParent.yogaNode, blockChild.yogaNode, 0)
        YGNodeCalculateLayout(blockParent.yogaNode, 300, 60, .LTR)
        // Block layout: Yoga does NOT apply relative offsets.
        // readLayoutFrames should add them manually.
        ShadowTreeLayout.readLayoutFrames(node: blockChild)
        XCTAssertEqual(blockChild.layoutFrame.origin.x, 30, accuracy: 0.01, "block: relative left:20 manually applied (10+20=30)")
        XCTAssertEqual(blockChild.layoutFrame.origin.y, 20, accuracy: 0.01, "block: relative top:10 manually applied (10+10=20)")
        YGNodeRemoveAllChildren(blockParent.yogaNode)
    }

    func testAbsolutePositionInBlockLayout() {
        // Verify absolute positioning works in Yoga block layout
        let container = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 300, "height": 200, "position": "relative"]],
            surfaceId: 0
        )
        let child = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "width": 60, "height": 60,
                "position": "absolute", "top": 10, "left": 10
            ]],
            surfaceId: 0
        )

        // Add to both Yoga tree AND children array (as ShadowTreeBuilder does)
        container.children.append(child)
        YGNodeInsertChild(container.yogaNode, child.yogaNode, 0)

        // Apply flex context override (as ShadowTreeBuilder does)
        let parentStyle = container.props["style"] as? [String: Any] ?? [:]
        let childStyle = child.props["style"] as? [String: Any] ?? [:]
        YogaStyleApplier.applyFlexContextOverride(
            parent: container.yogaNode, child: child.yogaNode,
            parentStyle: parentStyle, childStyle: childStyle
        )

        YGNodeCalculateLayout(container.yogaNode, 300, 200, .LTR)
        ShadowTreeLayout.readLayoutFrames(node: container)

        // Child should be at (10, 10) with size (60, 60)
        XCTAssertEqual(child.layoutFrame.origin.x, 10, accuracy: 0.01, "absolute left:10 should be applied")
        XCTAssertEqual(child.layoutFrame.origin.y, 10, accuracy: 0.01, "absolute top:10 should be applied")
        XCTAssertEqual(child.layoutFrame.width, 60, accuracy: 0.01)
        XCTAssertEqual(child.layoutFrame.height, 60, accuracy: 0.01)

        YGNodeRemoveAllChildren(container.yogaNode)
    }

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

    func testAlignContentCenter() {
        YogaStyleApplier.apply(["alignContent": "center"], to: node)
        XCTAssertEqual(YGNodeStyleGetAlignContent(node), .center)
    }

    func testAlignContentSpaceBetween() {
        YogaStyleApplier.apply(["alignContent": "space-between"], to: node)
        XCTAssertEqual(YGNodeStyleGetAlignContent(node), .spaceBetween)
    }

    func testAlignContentSpaceEvenly() {
        YogaStyleApplier.apply(["alignContent": "space-evenly"], to: node)
        XCTAssertEqual(YGNodeStyleGetAlignContent(node), .spaceEvenly)
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

    func testTextRemeasureAfterFontInheritance() {
        // Simulates $$appendChild: a #text node initially measured at 16pt
        // is re-measured with the parent code element's font (Menlo 13pt).
        // lineHeight comes from ElementDefaults.textLineHeight (not the style dict).
        // Without YGNodeMarkDirty, Yoga would cache the initial 16pt measurement.
        let parent = ShadowNodeWrapper.createElementNode(
            type: "code",
            props: [:],
            surfaceId: 0
        )

        let family = ShadowNodeFamily(elementType: "#text", surfaceId: 0, instanceHandle: nil)
        let textNode = ShadowNodeWrapper(props: [:], children: [], family: family, text: "hello")

        // 1. Initial setup at 16pt (like $$createTextNode)
        YogaTextMeasure.setupMeasureFunc(on: textNode)

        // 2. Append to parent
        YGNodeInsertChild(parent.yogaNode, textNode.yogaNode, 0)

        // 3. Re-setup with parent's font (like $$appendChild).
        // lineHeight is NOT in the style dict — it comes from textLineHeight().
        let style = parent.props["style"] as? [String: Any] ?? [:]
        let fontSize = (style["fontSize"] as? NSNumber)?.doubleValue ?? 16
        let fontFamily = style["fontFamily"] as? String
        let lineHeight = ElementDefaults.textLineHeight(for: parent.family.elementType)

        YogaTextMeasure.cleanupMeasureContext(for: textNode.yogaNode)
        YogaTextMeasure.setupMeasureFunc(
            on: textNode,
            fontSize: CGFloat(fontSize),
            fontFamily: fontFamily,
            lineHeight: lineHeight
        )

        // 4. Calculate layout
        YGNodeStyleSetWidth(parent.yogaNode, 390)
        YGNodeCalculateLayout(parent.yogaNode, 390, Float.nan, .LTR)

        // Text should be measured at 14px (lineHeight), not ~20px (16pt system font)
        let textHeight = YGNodeLayoutGetHeight(textNode.yogaNode)
        XCTAssertEqual(textHeight, 14, accuracy: 0.5,
                       "Text should use lineHeight 14 from code element, not default 16pt measurement (~20)")

        // Verify lineHeight is NOT in the style dict (no false comparison diff)
        XCTAssertNil(style["lineHeight"], "lineHeight should not appear in style dict")
    }

    func testContentBoxFlexGrowWithDifferentPadding() {
        // CSS flexbox with content-box: flex space is distributed to INNER
        // (content) size equally, then padding/border is added outside.
        // Matches the e2e fixture hierarchy:
        // <div style={{width: 390}}>           — root (block)
        //   <div style={{display: 'flex', flexDirection: 'row', gap: 8, marginTop: 10}}>
        //     <div style={{flexGrow: 1, padding: 8, borderWidth: 2, borderStyle: 'solid', borderColor: '#aaa', backgroundColor: '#ffeedd'}}>
        //       <div style={{height: 30, backgroundColor: '#ddbb99'}} />
        //     </div>
        //     <div style={{flexGrow: 1, padding: 16, borderWidth: 2, borderStyle: 'solid', borderColor: '#aaa', backgroundColor: '#ddeeff'}}>
        //       <div style={{height: 30, backgroundColor: '#99bbdd'}} />
        //     </div>
        //   </div>
        // </div>

        // Root container
        let root = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["width": 390]],
            surfaceId: 0
        )

        // Flex row (no explicit width — stretches from parent)
        let row = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["display": "flex", "flexDirection": "row", "gap": 8, "marginTop": 10]],
            surfaceId: 0
        )

        // Insert row into root
        YGNodeInsertChild(root.yogaNode, row.yogaNode, 0)
        let rootStyle = root.props["style"] as? [String: Any] ?? [:]
        let rowStyle = row.props["style"] as? [String: Any] ?? [:]
        YogaStyleApplier.applyFlexContextOverride(
            parent: root.yogaNode, child: row.yogaNode,
            parentStyle: rootStyle, childStyle: rowStyle
        )

        let child1 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["flexGrow": 1, "padding": 8, "borderWidth": 2, "borderStyle": "solid", "borderColor": "#aaaaaa", "backgroundColor": "#ffeedd"]],
            surfaceId: 0
        )
        let innerDiv1 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 30, "backgroundColor": "#ddbb99"]],
            surfaceId: 0
        )
        // innerDiv1 is inserted into child1 before child1 is overridden to
        // flex. The cascade in applyFlexContextOverride should retroactively
        // override innerDiv1 when child1 is promoted to flex.
        YGNodeInsertChild(child1.yogaNode, innerDiv1.yogaNode, 0)

        let child2 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["flexGrow": 1, "padding": 16, "borderWidth": 2, "borderStyle": "solid", "borderColor": "#aaaaaa", "backgroundColor": "#ddeeff"]],
            surfaceId: 0
        )
        let innerDiv2 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 30, "backgroundColor": "#99bbdd"]],
            surfaceId: 0
        )
        YGNodeInsertChild(child2.yogaNode, innerDiv2.yogaNode, 0)

        // Insert children into row with flex context override + cascade
        let child1Style = child1.props["style"] as? [String: Any] ?? [:]
        let child1DisplayBefore = YGNodeStyleGetDisplay(child1.yogaNode)
        YGNodeInsertChild(row.yogaNode, child1.yogaNode, 0)
        YogaStyleApplier.applyFlexContextOverride(
            parent: row.yogaNode, child: child1.yogaNode,
            parentStyle: rowStyle, childStyle: child1Style
        )
        // Cascade to child1's existing children
        if child1DisplayBefore != YGNodeStyleGetDisplay(child1.yogaNode) {
            let overriddenParentStyle: [String: Any] = ["display": "flex"]
            let gcStyle = innerDiv1.props["style"] as? [String: Any] ?? [:]
            YogaStyleApplier.applyFlexContextOverride(
                parent: child1.yogaNode, child: innerDiv1.yogaNode,
                parentStyle: overriddenParentStyle, childStyle: gcStyle
            )
        }

        let child2Style = child2.props["style"] as? [String: Any] ?? [:]
        let child2DisplayBefore = YGNodeStyleGetDisplay(child2.yogaNode)
        YGNodeInsertChild(row.yogaNode, child2.yogaNode, 1)
        YogaStyleApplier.applyFlexContextOverride(
            parent: row.yogaNode, child: child2.yogaNode,
            parentStyle: rowStyle, childStyle: child2Style
        )
        // Cascade to child2's existing children
        if child2DisplayBefore != YGNodeStyleGetDisplay(child2.yogaNode) {
            let overriddenParentStyle: [String: Any] = ["display": "flex"]
            let gcStyle = innerDiv2.props["style"] as? [String: Any] ?? [:]
            YogaStyleApplier.applyFlexContextOverride(
                parent: child2.yogaNode, child: innerDiv2.yogaNode,
                parentStyle: overriddenParentStyle, childStyle: gcStyle
            )
        }

        // Calculate layout
        YGNodeCalculateLayout(root.yogaNode, 390, Float.nan, .LTR)

        let w1 = YGNodeLayoutGetWidth(child1.yogaNode)
        let w2 = YGNodeLayoutGetWidth(child2.yogaNode)
        let rowW = YGNodeLayoutGetWidth(row.yogaNode)

        print("Row width: \(rowW)")
        print("Child 1 width: \(w1)")
        print("Child 2 width: \(w2)")
        print("Child 1 display: \(YGNodeStyleGetDisplay(child1.yogaNode))")
        print("Child 1 box-sizing: \(YGNodeStyleGetBoxSizing(child1.yogaNode))")
        print("Row display: \(YGNodeStyleGetDisplay(row.yogaNode))")
        print("Root display: \(YGNodeStyleGetDisplay(root.yogaNode))")

        // CSS: available = 390 - 8 gap = 382. Overhead: 20 + 36 = 56.
        // Free = 382 - 56 = 326. Each gets 163 content → outer 183, 199.
        XCTAssertEqual(w1, 183, accuracy: 1, "Child 1 should be 183 (163 content + 16 padding + 4 border)")
        XCTAssertEqual(w2, 199, accuracy: 1, "Child 2 should be 199 (163 content + 32 padding + 4 border)")
    }

    func testFlexGrowVsFlexShorthandColumnWidths() {
        // Test table column distribution with display:block cells vs display:flex cells.
        // ShadowNodeWrapper references must be retained (deinit frees the yoga node).
        let config = YogaConfig.shared
        let family = ShadowNodeFamily(elementType: "#text", surfaceId: 0, instanceHandle: nil)
        var textWrappers: [ShadowNodeWrapper] = [] // retain wrappers

        // --- Test 1: cells with display:block + flex:1 ---
        let row1 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetFlexDirection(row1, .row)
        YGNodeStyleSetWidth(row1, 370)

        var cells1: [YGNodeRef] = []
        for (i, text) in ["Name", "Subject", "Grade"].enumerated() {
            let cell = YGNodeNewWithConfig(config)!
            YGNodeStyleSetDisplay(cell, .block)
            YGNodeStyleSetFlex(cell, 1)
            let tn = ShadowNodeWrapper(props: [:], family: family, text: text)
            YogaTextMeasure.setupMeasureFunc(on: tn, fontSize: 16, fontWeight: "bold")
            textWrappers.append(tn)
            YGNodeInsertChild(cell, tn.yogaNode, 0)
            YGNodeInsertChild(row1, cell, i)
            cells1.append(cell)
        }
        YGNodeCalculateLayout(row1, 370, Float.nan, .LTR)

        let block_w1 = YGNodeLayoutGetWidth(cells1[0])
        let block_w2 = YGNodeLayoutGetWidth(cells1[1])
        let block_w3 = YGNodeLayoutGetWidth(cells1[2])
        print("block + flex:1 widths: \(block_w1), \(block_w2), \(block_w3)")

        // --- Test 2: cells with display:flex + flex:1 ---
        let row2 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetFlexDirection(row2, .row)
        YGNodeStyleSetWidth(row2, 370)

        var cells2: [YGNodeRef] = []
        for (i, text) in ["Name", "Subject", "Grade"].enumerated() {
            let cell = YGNodeNewWithConfig(config)!
            YGNodeStyleSetDisplay(cell, .flex)
            YGNodeStyleSetFlexDirection(cell, .column)
            YGNodeStyleSetFlex(cell, 1)
            let tn = ShadowNodeWrapper(props: [:], family: family, text: text)
            YogaTextMeasure.setupMeasureFunc(on: tn, fontSize: 16, fontWeight: "bold")
            textWrappers.append(tn)
            YGNodeInsertChild(cell, tn.yogaNode, 0)
            YGNodeInsertChild(row2, cell, i)
            cells2.append(cell)
        }
        YGNodeCalculateLayout(row2, 370, Float.nan, .LTR)

        let flex_w1 = YGNodeLayoutGetWidth(cells2[0])
        let flex_w2 = YGNodeLayoutGetWidth(cells2[1])
        let flex_w3 = YGNodeLayoutGetWidth(cells2[2])
        print("flex + flex:1 widths: \(flex_w1), \(flex_w2), \(flex_w3)")

        // --- Test 3: cells with display:block + flexGrow:1 ---
        let row3 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetFlexDirection(row3, .row)
        YGNodeStyleSetWidth(row3, 370)

        var cells3: [YGNodeRef] = []
        for (i, text) in ["Name", "Subject", "Grade"].enumerated() {
            let cell = YGNodeNewWithConfig(config)!
            YGNodeStyleSetDisplay(cell, .block)
            YGNodeStyleSetFlexGrow(cell, 1)
            let tn = ShadowNodeWrapper(props: [:], family: family, text: text)
            YogaTextMeasure.setupMeasureFunc(on: tn, fontSize: 16, fontWeight: "bold")
            textWrappers.append(tn)
            YGNodeInsertChild(cell, tn.yogaNode, 0)
            YGNodeInsertChild(row3, cell, i)
            cells3.append(cell)
        }
        YGNodeCalculateLayout(row3, 370, Float.nan, .LTR)

        let block_grow_w1 = YGNodeLayoutGetWidth(cells3[0])
        let block_grow_w2 = YGNodeLayoutGetWidth(cells3[1])
        let block_grow_w3 = YGNodeLayoutGetWidth(cells3[2])
        print("block + flexGrow:1 widths: \(block_grow_w1), \(block_grow_w2), \(block_grow_w3)")

        // --- Test 4: cells with display:flex + flexGrow:1 (flexBasis:auto) ---
        let row4 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetFlexDirection(row4, .row)
        YGNodeStyleSetWidth(row4, 370)

        var cells4: [YGNodeRef] = []
        for (i, text) in ["Name", "Subject", "Grade"].enumerated() {
            let cell = YGNodeNewWithConfig(config)!
            YGNodeStyleSetDisplay(cell, .flex)
            YGNodeStyleSetFlexDirection(cell, .column)
            YGNodeStyleSetFlexGrow(cell, 1)
            let tn = ShadowNodeWrapper(props: [:], family: family, text: text)
            YogaTextMeasure.setupMeasureFunc(on: tn, fontSize: 16, fontWeight: "bold")
            textWrappers.append(tn)
            YGNodeInsertChild(cell, tn.yogaNode, 0)
            YGNodeInsertChild(row4, cell, i)
            cells4.append(cell)
        }
        YGNodeCalculateLayout(row4, 370, Float.nan, .LTR)

        let flex_grow_w1 = YGNodeLayoutGetWidth(cells4[0])
        let flex_grow_w2 = YGNodeLayoutGetWidth(cells4[1])
        let flex_grow_w3 = YGNodeLayoutGetWidth(cells4[2])
        print("flex + flexGrow:1 widths: \(flex_grow_w1), \(flex_grow_w2), \(flex_grow_w3)")

        // Document the actual behavior
        XCTAssertTrue(true, "Test documents flex distribution behavior")

        // Clean up wrappers first (before freeing rows)
        textWrappers.removeAll()
        YGNodeFree(row1)
        YGNodeFree(row2)
        YGNodeFree(row3)
        YGNodeFree(row4)
    }

    // MARK: - maxHeight in flex context

    func testMaxHeightOnFlexChildrenContentBox() {
        // Reproduces the max-height-in-flex fixture: section 3
        // Column flex container with gap:4, padding:8.
        // Children: height:80+maxHeight:30, height:80+maxHeight:50, height:40.
        // CSS expected: clamped to 30+50+40 + 2*4 gap = 128 content, 128+16 pad = 144
        let config = YogaConfig.shared

        let container = YGNodeNewWithConfig(config)!
        YGNodeStyleSetBoxSizing(container, .contentBox)
        YGNodeStyleSetDisplay(container, .flex)
        YGNodeStyleSetFlexDirection(container, .column)
        YGNodeStyleSetWidth(container, 374)
        YGNodeStyleSetPadding(container, .all, 8)
        YGNodeStyleSetGap(container, .all, 4)

        // Child 1: height 80, maxHeight 30
        let child1 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetBoxSizing(child1, .contentBox)
        YGNodeStyleSetDisplay(child1, .flex)
        YGNodeStyleSetFlexDirection(child1, .column)
        YGNodeStyleSetHeight(child1, 80)
        YGNodeStyleSetMaxHeight(child1, 30)
        YGNodeInsertChild(container, child1, 0)

        // Child 2: height 80, maxHeight 50
        let child2 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetBoxSizing(child2, .contentBox)
        YGNodeStyleSetDisplay(child2, .flex)
        YGNodeStyleSetFlexDirection(child2, .column)
        YGNodeStyleSetHeight(child2, 80)
        YGNodeStyleSetMaxHeight(child2, 50)
        YGNodeInsertChild(container, child2, 1)

        // Child 3: height 40
        let child3 = YGNodeNewWithConfig(config)!
        YGNodeStyleSetBoxSizing(child3, .contentBox)
        YGNodeStyleSetDisplay(child3, .flex)
        YGNodeStyleSetFlexDirection(child3, .column)
        YGNodeStyleSetHeight(child3, 40)
        YGNodeInsertChild(container, child3, 2)

        YGNodeCalculateLayout(container, 374, Float.nan, .LTR)

        let h1 = YGNodeLayoutGetHeight(child1)
        let h2 = YGNodeLayoutGetHeight(child2)
        let h3 = YGNodeLayoutGetHeight(child3)
        let hContainer = YGNodeLayoutGetHeight(container)

        print("Child 1 height: \(h1) (expected 30)")
        print("Child 2 height: \(h2) (expected 50)")
        print("Child 3 height: \(h3) (expected 40)")
        print("Container height: \(hContainer) (expected 144)")

        XCTAssertEqual(h1, 30, accuracy: 0.1, "maxHeight should clamp height from 80 to 30")
        XCTAssertEqual(h2, 50, accuracy: 0.1, "maxHeight should clamp height from 80 to 50")
        XCTAssertEqual(h3, 40, accuracy: 0.1, "height should be 40")
        XCTAssertEqual(hContainer, 144, accuracy: 0.1, "container = 30+50+40+8gap+16pad = 144")

        YGNodeFree(container)
    }

    func testMaxHeightOnFlexChildrenBlockPromoted() {
        // Same as above but with display:block children promoted to flex
        // via applyFlexContextOverride (matching the actual native rendering path).
        let config = YogaConfig.shared

        // Container: display:flex, flexDirection:column, padding:8, gap:4
        let container = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "display": "flex",
                "flexDirection": "column",
                "width": 374,
                "padding": 8,
                "gap": 4
            ] as [String: Any]],
            surfaceId: 0
        )

        // Child 1: height:80, maxHeight:30
        let child1 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 80, "maxHeight": 30] as [String: Any]],
            surfaceId: 0
        )

        // Child 2: height:80, maxHeight:50
        let child2 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 80, "maxHeight": 50] as [String: Any]],
            surfaceId: 0
        )

        // Child 3: height:40
        let child3 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 40] as [String: Any]],
            surfaceId: 0
        )

        // Insert children with flex context override
        let containerStyle = container.props["style"] as? [String: Any] ?? [:]

        for (i, child) in [child1, child2, child3].enumerated() {
            YGNodeInsertChild(container.yogaNode, child.yogaNode, i)
            let childStyle = child.props["style"] as? [String: Any] ?? [:]
            YogaStyleApplier.applyFlexContextOverride(
                parent: container.yogaNode,
                child: child.yogaNode,
                parentStyle: containerStyle,
                childStyle: childStyle
            )
        }

        YGNodeCalculateLayout(container.yogaNode, 374, Float.nan, .LTR)

        let h1 = YGNodeLayoutGetHeight(child1.yogaNode)
        let h2 = YGNodeLayoutGetHeight(child2.yogaNode)
        let h3 = YGNodeLayoutGetHeight(child3.yogaNode)
        let hContainer = YGNodeLayoutGetHeight(container.yogaNode)

        print("Block-promoted child 1 height: \(h1) (expected 30)")
        print("Block-promoted child 2 height: \(h2) (expected 50)")
        print("Block-promoted child 3 height: \(h3) (expected 40)")
        print("Block-promoted container height: \(hContainer) (expected 144)")

        XCTAssertEqual(h1, 30, accuracy: 0.1, "maxHeight should clamp height from 80 to 30")
        XCTAssertEqual(h2, 50, accuracy: 0.1, "maxHeight should clamp height from 80 to 50")
        XCTAssertEqual(h3, 40, accuracy: 0.1, "height should be 40")
        XCTAssertEqual(hContainer, 144, accuracy: 0.1, "container = 30+50+40+8gap+16pad = 144")
    }

    func testMaxHeightInBlockParentWithFlexChildren() {
        // Full hierarchy test: temp root (flex col) → block div → flex container → children with maxHeight.
        // Verifies the Yoga workaround in apply() that pre-clamps height when
        // both height and maxHeight are set as point values. Without the workaround,
        // Yoga uses the unclamped height for computing ancestor auto heights.
        let config = YogaConfig.shared

        // Temp root (like calculateYogaLayout creates)
        let tempRoot = YGNodeNewWithConfig(config)!
        YGNodeStyleSetFlexDirection(tempRoot, .column)
        YGNodeStyleSetWidth(tempRoot, 390)

        // Root div: display:block, padding:8
        let rootDiv = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["padding": 8] as [String: Any]],
            surfaceId: 0
        )

        // Flex column container: padding:8, gap:4
        let section3 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "display": "flex",
                "flexDirection": "column",
                "width": 374,
                "padding": 8,
                "gap": 4,
                "marginBottom": 8
            ] as [String: Any]],
            surfaceId: 0
        )

        // Children with height + maxHeight
        let s3child1 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 80, "maxHeight": 30] as [String: Any]],
            surfaceId: 0
        )
        let s3child2 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 80, "maxHeight": 50] as [String: Any]],
            surfaceId: 0
        )
        let s3child3 = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": ["height": 40] as [String: Any]],
            surfaceId: 0
        )

        // Wire up hierarchy
        let s3Style = section3.props["style"] as? [String: Any] ?? [:]
        for (i, child) in [s3child1, s3child2, s3child3].enumerated() {
            YGNodeInsertChild(section3.yogaNode, child.yogaNode, i)
            let childStyle = child.props["style"] as? [String: Any] ?? [:]
            YogaStyleApplier.applyFlexContextOverride(
                parent: section3.yogaNode, child: child.yogaNode,
                parentStyle: s3Style, childStyle: childStyle
            )
        }
        YGNodeInsertChild(rootDiv.yogaNode, section3.yogaNode, 0)
        let rootDivStyle = rootDiv.props["style"] as? [String: Any] ?? [:]
        YogaStyleApplier.applyFlexContextOverride(
            parent: rootDiv.yogaNode, child: section3.yogaNode,
            parentStyle: rootDivStyle, childStyle: s3Style
        )
        YGNodeInsertChild(tempRoot, rootDiv.yogaNode, 0)

        // Calculate layout
        YGNodeCalculateLayout(tempRoot, 390, Float.nan, .LTR)

        XCTAssertEqual(YGNodeLayoutGetHeight(s3child1.yogaNode), 30, accuracy: 0.1,
                       "maxHeight should clamp height from 80 to 30")
        XCTAssertEqual(YGNodeLayoutGetHeight(s3child2.yogaNode), 50, accuracy: 0.1,
                       "maxHeight should clamp height from 80 to 50")
        XCTAssertEqual(YGNodeLayoutGetHeight(s3child3.yogaNode), 40, accuracy: 0.1,
                       "height should be 40")
        XCTAssertEqual(YGNodeLayoutGetHeight(section3.yogaNode), 144, accuracy: 0.1,
                       "section = 30+50+40+8gap+16pad = 144")
        XCTAssertEqual(YGNodeLayoutGetHeight(rootDiv.yogaNode), 168, accuracy: 0.1,
                       "root = 144section + 8mb + 16pad = 168")

        YGNodeRemoveAllChildren(tempRoot)
        YGNodeFree(tempRoot)
    }

    func testOverflowHiddenDoesNotShrinkChildren() {
        // Reproduces overflow-radius fixture: a block div with overflow:hidden
        // and fixed height contains a child with larger explicit height.
        // CSS: the child keeps its full height (80px) and overflows (clipped).
        // Yoga: block-to-flex promotion makes the child a flex item with
        // flexShrink:1 (web default), incorrectly shrinking it.
        //
        // Hierarchy: flex-row → block-circle (h:60, overflow:hidden) → inner-div (h:80, mt:-10)
        // Path: root > div[1] > div[1] > div[0]

        // Flex row parent
        let flexRow = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "display": "flex",
                "flexDirection": "row",
                "width": 374,
                "gap": 16,
                "alignItems": "center"
            ] as [String: Any]],
            surfaceId: 0
        )

        // Circle container: block div with overflow:hidden and fixed height
        let circle = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "width": 60,
                "height": 60,
                "borderRadius": 30,
                "overflow": "hidden",
                "backgroundColor": "#9b59b6"
            ] as [String: Any]],
            surfaceId: 0
        )

        // Inner div: larger than parent, with negative margin
        let inner = ShadowNodeWrapper.createElementNode(
            type: "div",
            props: ["style": [
                "width": 80,
                "height": 80,
                "backgroundColor": "#e67e22",
                "marginTop": -10,
                "marginLeft": -10
            ] as [String: Any]],
            surfaceId: 0
        )

        // Build bottom-up (SSR order): inner → circle → flexRow
        circle.children.append(inner)
        YGNodeInsertChild(circle.yogaNode, inner.yogaNode, 0)

        flexRow.children.append(circle)
        YGNodeInsertChild(flexRow.yogaNode, circle.yogaNode, 0)
        let flexRowStyle = flexRow.props["style"] as? [String: Any] ?? [:]
        let circleStyle = circle.props["style"] as? [String: Any] ?? [:]
        let circleDisplayBefore = YGNodeStyleGetDisplay(circle.yogaNode)
        YogaStyleApplier.applyFlexContextOverride(
            parent: flexRow.yogaNode,
            child: circle.yogaNode,
            parentStyle: flexRowStyle,
            childStyle: circleStyle
        )
        // Cascade to circle's children
        if circleDisplayBefore != YGNodeStyleGetDisplay(circle.yogaNode) {
            let overriddenParentStyle: [String: Any] = ["display": "flex"]
            let innerStyle = inner.props["style"] as? [String: Any] ?? [:]
            YogaStyleApplier.applyFlexContextOverride(
                parent: circle.yogaNode,
                child: inner.yogaNode,
                parentStyle: overriddenParentStyle,
                childStyle: innerStyle
            )
        }

        YGNodeCalculateLayout(flexRow.yogaNode, 374, Float.nan, .LTR)

        let innerHeight = YGNodeLayoutGetHeight(inner.yogaNode)
        print("Inner div height: \(innerHeight) (expected 80)")
        print("Inner flexShrink: \(YGNodeStyleGetFlexShrink(inner.yogaNode))")

        // CSS: child keeps its explicit height=80, overflows the parent (clipped by overflow:hidden)
        XCTAssertEqual(innerHeight, 80, accuracy: 0.1,
                       "Child should keep explicit height=80, not be flex-shrunk")
    }

}

