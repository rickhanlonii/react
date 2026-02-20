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

    // MARK: - Existing properties (regression coverage)

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
}
