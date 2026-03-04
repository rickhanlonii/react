import XCTest
@testable import ReactDomNativeKit

final class UIKitHelpersTests: XCTestCase {

    private var applier: UIKitMutationApplier!

    override func setUp() {
        super.setUp()
        let registry = ViewRegistry()
        applier = UIKitMutationApplier(viewRegistry: registry, logPrefix: "Test")
    }

    override func tearDown() {
        applier = nil
        super.tearDown()
    }

    // MARK: - parseColor — Hex

    func testParseColor6DigitHex() {
        let color = applier.parseColor("#FF0000")
        assertColorEquals(color, red: 1, green: 0, blue: 0, alpha: 1)
    }

    func testParseColor3DigitHex() {
        let color = applier.parseColor("#F00")
        assertColorEquals(color, red: 1, green: 0, blue: 0, alpha: 1)
    }

    func testParseColor8DigitHexWithAlpha() {
        let color = applier.parseColor("#FF000080")
        assertColorEquals(color, red: 1, green: 0, blue: 0, alpha: 128.0/255.0)
    }

    func testParseColor4DigitHexWithAlpha() {
        let color = applier.parseColor("#F008")
        assertColorEquals(color, red: 1, green: 0, blue: 0, alpha: 136.0/255.0)
    }

    // MARK: - parseColor — RGB/RGBA

    func testParseColorRGB() {
        let color = applier.parseColor("rgb(255, 0, 0)")
        assertColorEquals(color, red: 1, green: 0, blue: 0, alpha: 1)
    }

    func testParseColorRGBA() {
        let color = applier.parseColor("rgba(255, 0, 0, 0.5)")
        assertColorEquals(color, red: 1, green: 0, blue: 0, alpha: 0.5)
    }

    // MARK: - parseColor — Named colors

    func testParseColorNamedRed() {
        let color = applier.parseColor("red")
        XCTAssertEqual(color, .red)
    }

    func testParseColorNamedBlue() {
        let color = applier.parseColor("blue")
        XCTAssertEqual(color, .blue)
    }

    func testParseColorTransparent() {
        let color = applier.parseColor("transparent")
        XCTAssertEqual(color, .clear)
    }

    func testParseColorCyan() {
        let color = applier.parseColor("cyan")
        XCTAssertEqual(color, .cyan)
    }

    func testParseColorBrown() {
        let color = applier.parseColor("brown")
        XCTAssertEqual(color, .brown)
    }

    func testParseColorUnknownReturnsClear() {
        let color = applier.parseColor("notacolor")
        XCTAssertEqual(color, .clear)
    }

    // MARK: - parseFontWeight

    func testParseFontWeight100() {
        XCTAssertEqual(applier.parseFontWeight("100"), .ultraLight)
    }

    func testParseFontWeight400() {
        XCTAssertEqual(applier.parseFontWeight("400"), .regular)
    }

    func testParseFontWeightNormal() {
        XCTAssertEqual(applier.parseFontWeight("normal"), .regular)
    }

    func testParseFontWeight700() {
        XCTAssertEqual(applier.parseFontWeight("700"), .bold)
    }

    func testParseFontWeightBold() {
        XCTAssertEqual(applier.parseFontWeight("bold"), .bold)
    }

    func testParseFontWeight900() {
        XCTAssertEqual(applier.parseFontWeight("900"), .black)
    }

    // MARK: - parseTextAlignment

    func testParseTextAlignmentLeft() {
        XCTAssertEqual(applier.parseTextAlignment("left"), .left)
    }

    func testParseTextAlignmentCenter() {
        XCTAssertEqual(applier.parseTextAlignment("center"), .center)
    }

    func testParseTextAlignmentRight() {
        XCTAssertEqual(applier.parseTextAlignment("right"), .right)
    }

    func testParseTextAlignmentJustify() {
        XCTAssertEqual(applier.parseTextAlignment("justify"), .justified)
    }

    // MARK: - resolveFont

    func testResolveFontH1DefaultSize() {
        let font = applier.resolveFont(style: [:], elementType: "h1")
        XCTAssertEqual(font.pointSize, 32)
    }

    func testResolveFontPDefaultSize() {
        let font = applier.resolveFont(style: [:], elementType: "p")
        XCTAssertEqual(font.pointSize, 16)
    }

    func testResolveFontExplicitFontSizeOverride() {
        let font = applier.resolveFont(style: ["fontSize": NSNumber(value: 24)], elementType: "p")
        XCTAssertEqual(font.pointSize, 24)
    }

    func testResolveFontExplicitFontWeightOverride() {
        let font = applier.resolveFont(style: ["fontWeight": "300"], elementType: "p")
        // p defaults to regular weight, "300" is light
        let descriptor = font.fontDescriptor
        let traits = descriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any]
        let weight = traits?[.weight] as? UIFont.Weight
        XCTAssertEqual(weight, .light)
    }

    func testResolveFontItalic() {
        let font = applier.resolveFont(style: ["fontStyle": "italic"], elementType: "p")
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitItalic))
    }

    // MARK: - parseRotation

    func testParseRotationDegrees() {
        let rotation = applier.parseRotation("45deg")
        XCTAssertEqual(rotation, CGFloat(45.0 * .pi / 180.0), accuracy: 0.0001)
    }

    func testParseRotation180Degrees() {
        let rotation = applier.parseRotation("180deg")
        XCTAssertEqual(rotation, .pi, accuracy: 0.0001)
    }

    func testParseRotationRadians() {
        let rotation = applier.parseRotation("1.5rad")
        XCTAssertEqual(rotation, 1.5, accuracy: 0.0001)
    }

    func testParseRotationInvalidReturnsZero() {
        let rotation = applier.parseRotation("invalid")
        XCTAssertEqual(rotation, 0)
    }

    // MARK: - Helpers

    private func assertColorEquals(
        _ color: UIColor,
        red expectedR: CGFloat,
        green expectedG: CGFloat,
        blue expectedB: CGFloat,
        alpha expectedA: CGFloat,
        accuracy: CGFloat = 0.02,
        file: StaticString = #file,
        line: UInt = #line
    ) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, expectedR, accuracy: accuracy, "Red component mismatch", file: file, line: line)
        XCTAssertEqual(g, expectedG, accuracy: accuracy, "Green component mismatch", file: file, line: line)
        XCTAssertEqual(b, expectedB, accuracy: accuracy, "Blue component mismatch", file: file, line: line)
        XCTAssertEqual(a, expectedA, accuracy: accuracy, "Alpha component mismatch", file: file, line: line)
    }
}
