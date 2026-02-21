import XCTest
@testable import ShadowTree

final class MarginCollapseTests: XCTestCase {

    // MARK: - Helpers

    /// Create a ShadowNodeWrapper with the given element type and style.
    private func makeNode(
        type: String,
        style: [String: Any] = [:],
        children: [ShadowNodeWrapper] = []
    ) -> ShadowNodeWrapper {
        let family = ShadowNodeFamily(elementType: type, surfaceId: 0, instanceHandle: nil)
        let props: [String: Any] = style.isEmpty ? [:] : ["style": style]
        let node = ShadowNodeWrapper(props: props, children: children, family: family)
        return node
    }

    // MARK: - computeCollapseTopMargin

    func testCollapseTopMargin_blockWithPadding_returnsOwnMargin() {
        // Block node with padding → returns own margin (padding blocks collapse)
        let child = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let parent = makeNode(type: "div", style: [
            "marginTop": 5.0,
            "paddingTop": 10.0,
            "display": "block"
        ], children: [child])

        let result = ShadowTreeLayout.computeCollapseTopMargin(parent)
        XCTAssertEqual(result, 5.0, accuracy: 0.01, "Padding blocks collapse; should return own margin")
    }

    func testCollapseTopMargin_blockWithFirstBlockChild() {
        // Block node with first block child having marginTop → returns max(parent, child)
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: ["marginTop": 5.0, "display": "block"], children: [h1])

        let result = ShadowTreeLayout.computeCollapseTopMargin(div)
        XCTAssertEqual(result, 21.44, accuracy: 0.01, "Should return max(5, 21.44) = 21.44")
    }

    func testCollapseTopMargin_nestedBlocks() {
        // Nested: block > block > h1(marginTop=21.44) → returns 21.44
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let inner = makeNode(type: "div", style: ["display": "block"], children: [h1])
        let outer = makeNode(type: "div", style: ["display": "block"], children: [inner])

        let result = ShadowTreeLayout.computeCollapseTopMargin(outer)
        XCTAssertEqual(result, 21.44, accuracy: 0.01, "Should collapse through nested blocks")
    }

    func testCollapseTopMargin_firstChildIsText_returnsOwnMargin() {
        // Block node with first child being #text → returns own margin (text is not block-level)
        let textNode = makeNode(type: "#text", style: [:])
        let div = makeNode(type: "div", style: ["marginTop": 5.0, "display": "block"], children: [textNode])

        let result = ShadowTreeLayout.computeCollapseTopMargin(div)
        XCTAssertEqual(result, 5.0, accuracy: 0.01, "Text child should not participate in collapse")
    }

    func testCollapseTopMargin_parentMarginLargerThanChild() {
        // Parent margin larger than child → returns parent margin
        let h1 = makeNode(type: "h1", style: ["marginTop": 10.0, "display": "block"])
        let div = makeNode(type: "div", style: ["marginTop": 30.0, "display": "block"], children: [h1])

        let result = ShadowTreeLayout.computeCollapseTopMargin(div)
        XCTAssertEqual(result, 30.0, accuracy: 0.01, "Should return max(30, 10) = 30")
    }

    func testCollapseTopMargin_borderBlocksCollapse() {
        // Block node with border → returns own margin (border blocks collapse)
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: [
            "marginTop": 5.0,
            "borderTopWidth": 1.0,
            "display": "block"
        ], children: [h1])

        let result = ShadowTreeLayout.computeCollapseTopMargin(div)
        XCTAssertEqual(result, 5.0, accuracy: 0.01, "Border blocks collapse; should return own margin")
    }

    func testCollapseTopMargin_noChildren_returnsOwnMargin() {
        let div = makeNode(type: "div", style: ["marginTop": 5.0, "display": "block"])
        let result = ShadowTreeLayout.computeCollapseTopMargin(div)
        XCTAssertEqual(result, 5.0, accuracy: 0.01, "No children means no collapse")
    }

    // MARK: - computeCollapseBottomMargin

    func testCollapseBottomMargin_nestedBlocks() {
        let p = makeNode(type: "p", style: ["marginBottom": 16.0, "display": "block"])
        let div = makeNode(type: "div", style: ["display": "block"], children: [p])

        let result = ShadowTreeLayout.computeCollapseBottomMargin(div)
        XCTAssertEqual(result, 16.0, accuracy: 0.01, "Should collapse through to last child's bottom margin")
    }

    func testCollapseBottomMargin_paddingBlocksCollapse() {
        let p = makeNode(type: "p", style: ["marginBottom": 16.0, "display": "block"])
        let div = makeNode(type: "div", style: [
            "paddingBottom": 10.0,
            "display": "block"
        ], children: [p])

        let result = ShadowTreeLayout.computeCollapseBottomMargin(div)
        XCTAssertEqual(result, 0.0, accuracy: 0.01, "Padding blocks collapse; should return own margin (0)")
    }

    // MARK: - adjustMarginCollapseThrough

    func testAdjust_singleRootBlock_firstChildMarginEscapes() {
        // Root block with h1 first child (marginTop=21.44) → node.layoutFrame.y += 21.44
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: ["display": "block"], children: [h1])
        div.layoutFrame = CGRect(x: 0, y: 0, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [div])

        XCTAssertEqual(div.layoutFrame.origin.y, 21.44, accuracy: 0.01,
                       "Should push div down by escaped margin")
    }

    func testAdjust_rootWithPadding_noAdjustment() {
        // Root node with padding-top → no adjustment
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: [
            "paddingTop": 10.0,
            "display": "block"
        ], children: [h1])
        div.layoutFrame = CGRect(x: 0, y: 0, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [div])

        XCTAssertEqual(div.layoutFrame.origin.y, 0.0, accuracy: 0.01,
                       "Padding blocks collapse; no adjustment")
    }

    func testAdjust_nestedCollapse_onlyAdjustsOutermost() {
        // Nested: div > div > h1(marginTop=21.44) → only outer div adjusted
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let inner = makeNode(type: "div", style: ["display": "block"], children: [h1])
        inner.layoutFrame = CGRect(x: 0, y: 0, width: 375, height: 50)
        let outer = makeNode(type: "div", style: ["display": "block"], children: [inner])
        outer.layoutFrame = CGRect(x: 0, y: 0, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [outer])

        XCTAssertEqual(outer.layoutFrame.origin.y, 21.44, accuracy: 0.01,
                       "Outermost block should be pushed down by collapsed margin")
    }

    func testAdjust_parentOwnMarginLarger_noDelta() {
        // Parent margin (30) >= child margin (21.44) → delta = 0, no adjustment
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: [
            "marginTop": 30.0,
            "display": "block"
        ], children: [h1])
        div.layoutFrame = CGRect(x: 0, y: 30, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [div])

        XCTAssertEqual(div.layoutFrame.origin.y, 30.0, accuracy: 0.01,
                       "Parent margin already larger; no additional offset needed")
    }

    func testAdjust_flexParent_noAdjustment() {
        // Flex parent → not a block formatting parent, no adjustment
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: ["display": "flex"], children: [h1])
        div.layoutFrame = CGRect(x: 0, y: 0, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [div])

        XCTAssertEqual(div.layoutFrame.origin.y, 0.0, accuracy: 0.01,
                       "Flex parents don't participate in margin collapse")
    }

    func testAdjust_emptyBlock_noAdjustment() {
        // Empty block → no children, no adjustment
        let div = makeNode(type: "div", style: ["display": "block"])
        div.layoutFrame = CGRect(x: 0, y: 0, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [div])

        XCTAssertEqual(div.layoutFrame.origin.y, 0.0, accuracy: 0.01,
                       "Empty block has no children to collapse through")
    }

    func testAdjust_preservesExistingY() {
        // Existing y offset should be preserved and added to
        let h1 = makeNode(type: "h1", style: ["marginTop": 21.44, "display": "block"])
        let div = makeNode(type: "div", style: ["display": "block"], children: [h1])
        div.layoutFrame = CGRect(x: 10, y: 50, width: 375, height: 100)

        ShadowTreeLayout.adjustMarginCollapseThrough(children: [div])

        XCTAssertEqual(div.layoutFrame.origin.y, 71.44, accuracy: 0.01,
                       "Should add delta to existing y position")
        XCTAssertEqual(div.layoutFrame.origin.x, 10.0, accuracy: 0.01,
                       "X position should be unchanged")
    }
}
