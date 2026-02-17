# Fix Swift ElementDefaultsTests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update ElementDefaultsTests.swift to match the current ElementDefaults.swift after the `display: "block"` refactor, then verify all test suites pass.

**Architecture:** The defaults were refactored from `flexDirection: "column"` to `display: "block"` for block elements, and text containers (p, h1-h6) changed from `flexDirection: "column"` to `flexDirection: "row"` + `flexWrap: "wrap"`. Button padding/border values also changed. Tests need to match the source of truth in `ElementDefaults.swift`.

**Tech Stack:** Swift, XCTest, xcodebuild

---

### Task 1: Fix block container tests

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift:8-13`

**Step 1: Update `testBlockContainersReturnFlexDirectionColumn`**

Replace the test to check `display: "block"` instead of `flexDirection: "column"`:

```swift
func testBlockContainersReturnDisplayBlock() {
    let blockTypes = ["div", "main", "section", "article", "nav", "header", "footer", "aside", "form"]
    for type in blockTypes {
        let defaults = ElementDefaults.defaults(for: type)
        XCTAssertEqual(defaults["display"] as? String, "block", "\(type) should default to display block")
    }
}
```

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: Some tests still fail (remaining mismatches), but `testBlockContainersReturnDisplayBlock` should no longer be in the failures.

---

### Task 2: Fix text container tests (p, h1-h6)

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift:18-64`

**Step 1: Update all heading/paragraph tests**

These elements now use `display: "block"`, `flexDirection: "row"`, `flexWrap: "wrap"`. Update each test:

```swift
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
    XCTAssertEqual(defaults["fontSize"] as? Double, 18.7)
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
    XCTAssertEqual(defaults["fontSize"] as? Double, 13.3)
    XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
}

func testH6Defaults() {
    let defaults = ElementDefaults.defaults(for: "h6")
    XCTAssertEqual(defaults["display"] as? String, "block")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    XCTAssertEqual(defaults["flexWrap"] as? String, "wrap")
    XCTAssertEqual(defaults["fontSize"] as? Double, 10.7)
    XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
}
```

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: Heading tests pass. Remaining failures from other block elements.

---

### Task 3: Fix remaining block element tests

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift`

**Step 1: Update all tests that check `flexDirection: "column"` for elements using `blockDefaults`**

These elements use `blockDefaults` which is `["display": "block"]` — no `flexDirection` key. Change each assertion from `flexDirection == "column"` to `display == "block"`:

```swift
// Lists
func testListDefaults() {
    for type in ["ul", "ol"] {
        let defaults = ElementDefaults.defaults(for: type)
        XCTAssertEqual(defaults["display"] as? String, "block", "\(type) should default to display block")
        XCTAssertEqual(defaults["paddingLeft"] as? Int, 40, "\(type) should have paddingLeft 40")
    }
}

// Details/Search (use blockDefaults)
func testDetailsDefaults() {
    let defaults = ElementDefaults.defaults(for: "details")
    XCTAssertEqual(defaults["display"] as? String, "block")
}

func testSearchDefaults() {
    let defaults = ElementDefaults.defaults(for: "search")
    XCTAssertEqual(defaults["display"] as? String, "block")
}

// Dialog
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

// Fieldset
func testFieldsetDefaults() {
    let defaults = ElementDefaults.defaults(for: "fieldset")
    XCTAssertEqual(defaults["display"] as? String, "block")
    XCTAssertEqual(defaults["borderWidth"] as? Int, 2)
    XCTAssertEqual(defaults["borderColor"] as? String, "#C0C0C0")
    XCTAssertEqual(defaults["borderRadius"] as? Int, 4)
}

// Table elements
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

// Media
func testPictureDefaults() {
    let defaults = ElementDefaults.defaults(for: "picture")
    XCTAssertEqual(defaults["display"] as? String, "block")
}

// P3
func testMenuDefaults() {
    let defaults = ElementDefaults.defaults(for: "menu")
    XCTAssertEqual(defaults["display"] as? String, "block")
    XCTAssertEqual(defaults["paddingLeft"] as? Int, 40)
}

func testHgroupDefaults() {
    let defaults = ElementDefaults.defaults(for: "hgroup")
    XCTAssertEqual(defaults["display"] as? String, "block")
}

// Definition lists
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

// P1 block containers
func testAddressDefaults() {
    let defaults = ElementDefaults.defaults(for: "address")
    XCTAssertEqual(defaults["display"] as? String, "block")
    XCTAssertEqual(defaults["fontStyle"] as? String, "italic")
}

func testBlockquoteDefaults() {
    let defaults = ElementDefaults.defaults(for: "blockquote")
    XCTAssertEqual(defaults["display"] as? String, "block")
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
```

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: Block element tests pass.

---

### Task 4: Fix button defaults test

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift:76-89`

**Step 1: Update `testButtonDefaults` to match actual values**

The actual `buttonDefaults` has: `paddingTop: 2, paddingBottom: 3, paddingLeft: 6, paddingRight: 6, borderWidth: 2, fontSize: 13.3`.

```swift
func testButtonDefaults() {
    let defaults = ElementDefaults.defaults(for: "button")
    XCTAssertEqual(defaults["display"] as? String, "inline-block")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    XCTAssertEqual(defaults["alignItems"] as? String, "center")
    XCTAssertEqual(defaults["justifyContent"] as? String, "center")
    XCTAssertEqual(defaults["paddingTop"] as? Int, 2)
    XCTAssertEqual(defaults["paddingBottom"] as? Int, 3)
    XCTAssertEqual(defaults["paddingLeft"] as? Int, 6)
    XCTAssertEqual(defaults["paddingRight"] as? Int, 6)
    XCTAssertEqual(defaults["borderWidth"] as? Int, 2)
    XCTAssertEqual(defaults["borderColor"] as? String, "#767676")
    XCTAssertEqual(defaults["borderRadius"] as? Int, 4)
    XCTAssertEqual(defaults["backgroundColor"] as? String, "#EFEFEF")
    XCTAssertEqual(defaults["fontSize"] as? Double, 13.3)
}
```

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: Button test passes.

---

### Task 5: Fix unknown element and merged style tests

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift:468-497`

**Step 1: Update the unknown element and merged style tests**

```swift
func testUnknownElementFallsBackToBlockDefaults() {
    let defaults = ElementDefaults.defaults(for: "custom-element")
    XCTAssertEqual(defaults["display"] as? String, "block")
    XCTAssertEqual(defaults.count, 1, "Unknown element should only have display")
}

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
```

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: ALL Swift tests pass.

---

### Task 6: Run all test suites and verify

**Step 1: Run Swift tests**

Run: `npm run test:swift`
Expected: All tests pass, exit code 0.

**Step 2: Run JS unit tests**

Run: `npm test`
Expected: All tests pass, exit code 0.

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift
git commit -m "test: update ElementDefaultsTests for display block refactor"
```
