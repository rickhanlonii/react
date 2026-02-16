# HTML Element Expansion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add support for all P1 and P2 HTML elements, bringing the total from ~20 to ~60 elements with correct browser-matching defaults.

**Architecture:** Each new element requires changes to 3 files: `ElementDefaults.swift` (defaults), `UIKitMutationApplier.swift` (view creation), and `HostConfig.js` (text context). Elements are batched by category for efficient implementation.

**Tech Stack:** Swift (ElementDefaults, UIKitMutationApplier, YogaStyleApplier), JavaScript (HostConfig.js), Jest/Fantom (integration tests), XCTest (Swift unit tests)

**Reference:** Element descriptors with exact values are in `docs/research/html-elements/`. Each task references the specific file.

---

## Files Overview

Every task touches the same core files. Listed once here, referenced by shorthand in tasks.

| Shorthand | Path |
|-----------|------|
| **Defaults** | `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` |
| **Applier** | `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` |
| **HostConfig** | `packages/react-dom-native/src/renderer/HostConfig.js` |
| **SwiftTests** | `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift` |
| **JSTests** | `tests/integration/element-defaults-itest.js` |
| **Descriptors** | `docs/research/html-elements/` |

---

## Task 1: P1 Inline Text Elements (b, i, u, s, del, ins, mark, small, code)

These are all virtual text elements with simple text attribute defaults. They follow the exact same pattern as `strong` and `em`.

**Reference:** `docs/research/html-elements/03-inline-text.md`

**Step 1: Write Swift unit tests**

Add to **SwiftTests**:

```swift
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
```

**Step 2: Run Swift tests to verify they fail**

Run: `swift test` (from the ios package directory)
Expected: FAIL — each element returns `blockDefaults` instead of its specific defaults

**Step 3: Add defaults to ElementDefaults.swift**

Add cases to the `defaults(for:)` switch in **Defaults**:

```swift
// Inline text (bold/italic/underline/strikethrough/etc.)
case "b":
    return boldDefaults
case "i":
    return italicDefaults
case "u":
    return underlineDefaults
case "s", "del":
    return strikethroughDefaults
case "ins":
    return underlineDefaults
case "mark":
    return markDefaults
case "small":
    return smallDefaults
case "code", "kbd", "samp":
    return monospaceDefaults
```

Add static dictionaries:

```swift
private static let boldDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "fontWeight": "bold"
]

private static let italicDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "fontStyle": "italic"
]

private static let underlineDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "textDecorationLine": "underline"
]

private static let strikethroughDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "textDecorationLine": "line-through"
]

private static let markDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "backgroundColor": "#FFFF00",
    "color": "#000000"
]

private static let smallDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "fontSize": 13.28
]

private static let monospaceDefaults: [String: Any] = [
    "flexDirection": "row",
    "flexShrink": 1,
    "fontFamily": "Menlo"
]
```

**Step 4: Update HostConfig.js TEXT_CONTEXT_ELEMENTS**

Add to the Set in **HostConfig**:

```javascript
const TEXT_CONTEXT_ELEMENTS = new Set([
  // ... existing entries ...
  'b',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'code',
  'kbd',
  'samp',
]);
```

**Step 5: Add case to UIKitMutationApplier createView**

These are virtual text elements that use the same UILabel path when not virtual. Add to the existing `case "span", "p", "h1"...` line in **Applier**:

```swift
case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
     "b", "i", "u", "s", "del", "ins", "mark", "small", "code", "kbd", "samp":
```

Also update the matching case in `updateView()`.

**Step 6: Run Swift tests to verify they pass**

Run: `swift test`
Expected: All new tests PASS

**Step 7: Write and run integration test**

Add to **JSTests**:

```javascript
it('code gets monospace font family', function () {
  var root = Fantom.createRoot();
  Fantom.runTask(function () {
    root.render(<p><code>hello</code></p>);
  });
  var output = Fantom.getRenderedOutput();
  var code = output.children[0].children[0];
  expect(code.type).toBe('code');
  expect(code.props.style.fontFamily).toBe('Menlo');
});

it('mark gets yellow background and black text', function () {
  var root = Fantom.createRoot();
  Fantom.runTask(function () {
    root.render(<p><mark>highlighted</mark></p>);
  });
  var output = Fantom.getRenderedOutput();
  var mark = output.children[0].children[0];
  expect(mark.props.style.backgroundColor).toBe('#FFFF00');
  expect(mark.props.style.color).toBe('#000000');
});
```

Run: `npm test -- tests/integration/element-defaults-itest.js`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift \
       packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift \
       packages/react-dom-native/src/renderer/HostConfig.js \
       packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift \
       tests/integration/element-defaults-itest.js
git commit -m "feat: add P1 inline text elements (b, i, u, s, del, ins, mark, small, code)"
```

---

## Task 2: P1 Block Containers (address, figure, figcaption, blockquote, pre)

Block containers that are mostly like `<div>` with different default margins/padding/text.

**Reference:** `docs/research/html-elements/01-block-containers.md`

**Step 1: Write Swift unit tests**

Add to **SwiftTests**:

```swift
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
```

**Step 2: Run Swift tests to verify they fail**

Run: `swift test`
Expected: FAIL

**Step 3: Add defaults to ElementDefaults.swift**

Add cases to `defaults(for:)` switch:

```swift
case "address":
    return addressDefaults
case "blockquote", "figure":
    return blockquoteDefaults
case "figcaption":
    return blockDefaults
case "pre":
    return preDefaults
```

Add static dictionaries:

```swift
private static let addressDefaults: [String: Any] = [
    "flexDirection": "column",
    "fontStyle": "italic"
]

private static let blockquoteDefaults: [String: Any] = [
    "flexDirection": "column",
    "marginTop": 16,
    "marginBottom": 16,
    "marginLeft": 40,
    "marginRight": 40
]

private static let preDefaults: [String: Any] = [
    "flexDirection": "column",
    "marginTop": 16,
    "marginBottom": 16,
    "fontFamily": "Menlo"
]
```

**Step 4: Update UIKitMutationApplier**

`address`, `figure`, `figcaption`, and `blockquote` are plain UIViews — they fall through to the `default` case already, which creates a UIView. No change needed there.

`pre` is a text container that preserves whitespace. Add to the UILabel case in `createView`:

```swift
case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
     "b", "i", "u", "s", "del", "ins", "mark", "small", "code", "kbd", "samp",
     "pre":
```

Also update `updateView()` to match.

**Step 5: Run Swift tests to verify they pass**

Run: `swift test`
Expected: PASS

**Step 6: Write and run integration test**

Add to **JSTests**:

```javascript
it('blockquote gets 40px horizontal margins', function () {
  var root = Fantom.createRoot();
  Fantom.runTask(function () {
    root.render(<blockquote>Quote</blockquote>);
  });
  var output = Fantom.getRenderedOutput();
  var bq = output.children[0];
  expect(bq.type).toBe('blockquote');
  expect(bq.props.style.marginLeft).toBe(40);
  expect(bq.props.style.marginRight).toBe(40);
});

it('pre gets monospace font', function () {
  var root = Fantom.createRoot();
  Fantom.runTask(function () {
    root.render(<pre>code block</pre>);
  });
  var output = Fantom.getRenderedOutput();
  var pre = output.children[0];
  expect(pre.props.style.fontFamily).toBe('Menlo');
});
```

Run: `npm test -- tests/integration/element-defaults-itest.js`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift \
       packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift \
       packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift \
       tests/integration/element-defaults-itest.js
git commit -m "feat: add P1 block containers (address, blockquote, figure, figcaption, pre)"
```

---

## Task 3: P1 Definition Lists (dl, dt, dd)

**Reference:** `docs/research/html-elements/04-lists.md`

**Step 1: Write Swift unit tests**

```swift
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
```

**Step 2: Run tests to verify fail**

**Step 3: Add defaults**

Add to `defaults(for:)` switch:

```swift
case "dl":
    return dlDefaults
case "dt":
    return blockDefaults
case "dd":
    return ddDefaults
```

Add dictionaries:

```swift
private static let dlDefaults: [String: Any] = [
    "flexDirection": "column",
    "marginTop": 16,
    "marginBottom": 16
]

private static let ddDefaults: [String: Any] = [
    "flexDirection": "column",
    "marginLeft": 40
]
```

**Step 4: No UIKitMutationApplier changes needed** — these are plain UIViews (default case).

**Step 5: Run tests to verify pass**

**Step 6: Write integration test**

```javascript
it('dd gets 40px left margin', function () {
  var root = Fantom.createRoot();
  Fantom.runTask(function () {
    root.render(
      <dl>
        <dt>Term</dt>
        <dd>Definition</dd>
      </dl>
    );
  });
  var output = Fantom.getRenderedOutput();
  var dd = output.children[0].children[1];
  expect(dd.type).toBe('dd');
  expect(dd.props.style.marginLeft).toBe(40);
});
```

**Step 7: Commit**

```bash
git commit -m "feat: add definition list elements (dl, dt, dd)"
```

---

## Task 4: P1 Table Elements (table, thead, tbody, tr, th, td)

**Reference:** `docs/research/html-elements/05-tables.md`

**Step 1: Write Swift unit tests**

```swift
// MARK: - Table Elements

func testTableDefaults() {
    let defaults = ElementDefaults.defaults(for: "table")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
}

func testTheadDefaults() {
    let defaults = ElementDefaults.defaults(for: "thead")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
}

func testTbodyDefaults() {
    let defaults = ElementDefaults.defaults(for: "tbody")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
}

func testTrDefaults() {
    let defaults = ElementDefaults.defaults(for: "tr")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
}

func testThDefaults() {
    let defaults = ElementDefaults.defaults(for: "th")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    XCTAssertEqual(defaults["flex"] as? Int, 1)
    XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
    XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
    XCTAssertEqual(defaults["paddingLeft"] as? Int, 1)
    XCTAssertEqual(defaults["paddingRight"] as? Int, 1)
    XCTAssertEqual(defaults["fontWeight"] as? String, "bold")
}

func testTdDefaults() {
    let defaults = ElementDefaults.defaults(for: "td")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    XCTAssertEqual(defaults["flex"] as? Int, 1)
    XCTAssertEqual(defaults["paddingTop"] as? Int, 1)
    XCTAssertEqual(defaults["paddingBottom"] as? Int, 1)
    XCTAssertEqual(defaults["paddingLeft"] as? Int, 1)
    XCTAssertEqual(defaults["paddingRight"] as? Int, 1)
}
```

**Step 2: Run tests to verify fail**

**Step 3: Add defaults**

```swift
case "table", "thead", "tbody", "tfoot":
    return blockDefaults
case "tr":
    return trDefaults
case "th":
    return thDefaults
case "td":
    return tdDefaults
```

```swift
private static let trDefaults: [String: Any] = [
    "flexDirection": "row"
]

private static let thDefaults: [String: Any] = [
    "flexDirection": "column",
    "flex": 1,
    "paddingTop": 1,
    "paddingBottom": 1,
    "paddingLeft": 1,
    "paddingRight": 1,
    "fontWeight": "bold"
]

private static let tdDefaults: [String: Any] = [
    "flexDirection": "column",
    "flex": 1,
    "paddingTop": 1,
    "paddingBottom": 1,
    "paddingLeft": 1,
    "paddingRight": 1
]
```

**Step 4: Update UIKitMutationApplier**

`th` and `td` are text containers — add to the UILabel case:

```swift
case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
     "b", "i", "u", "s", "del", "ins", "mark", "small", "code", "kbd", "samp",
     "pre", "th", "td":
```

**Step 5: Run tests to verify pass**

**Step 6: Write integration test**

```javascript
it('table renders with flex-based layout', function () {
  var root = Fantom.createRoot();
  Fantom.runTask(function () {
    root.render(
      <table>
        <tr>
          <th>Header</th>
          <td>Cell</td>
        </tr>
      </table>
    );
  });
  var output = Fantom.getRenderedOutput();
  var table = output.children[0];
  expect(table.type).toBe('table');
  expect(table.props.style.flexDirection).toBe('column');
  var tr = table.children[0];
  expect(tr.props.style.flexDirection).toBe('row');
  var th = tr.children[0];
  expect(th.props.style.flex).toBe(1);
  expect(th.props.style.fontWeight).toBe('bold');
});
```

**Step 7: Commit**

```bash
git commit -m "feat: add table elements (table, thead, tbody, tfoot, tr, th, td)"
```

---

## Task 5: P1 Label Element

**Reference:** `docs/research/html-elements/06-form-controls.md`

**Step 1: Write Swift unit test**

```swift
func testLabelDefaults() {
    let defaults = ElementDefaults.defaults(for: "label")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
}
```

**Step 2: Run test to verify fail**

**Step 3: Add defaults**

```swift
case "label":
    return spanDefaults  // Same defaults as span
```

No new dictionary needed — reuses `spanDefaults`.

**Step 4: Add to TEXT_CONTEXT_ELEMENTS** — already there (line 39).

**Step 5: Run test to verify pass**

**Step 6: Commit**

```bash
git commit -m "feat: add label element support"
```

---

## Task 6: P2 Block Containers (details, summary, dialog, fieldset, legend, search)

**Reference:** `docs/research/html-elements/01-block-containers.md`

**Step 1: Write Swift unit tests**

```swift
// MARK: - P2 Block Containers

func testDetailsDefaults() {
    let defaults = ElementDefaults.defaults(for: "details")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
}

func testSummaryDefaults() {
    let defaults = ElementDefaults.defaults(for: "summary")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
}

func testDialogDefaults() {
    let defaults = ElementDefaults.defaults(for: "dialog")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    XCTAssertEqual(defaults["paddingTop"] as? Int, 16)
    XCTAssertEqual(defaults["paddingBottom"] as? Int, 16)
    XCTAssertEqual(defaults["paddingLeft"] as? Int, 16)
    XCTAssertEqual(defaults["paddingRight"] as? Int, 16)
    XCTAssertEqual(defaults["borderWidth"] as? Int, 1)
    XCTAssertEqual(defaults["borderColor"] as? String, "#000000")
    XCTAssertEqual(defaults["backgroundColor"] as? String, "#FFFFFF")
}

func testFieldsetDefaults() {
    let defaults = ElementDefaults.defaults(for: "fieldset")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    XCTAssertEqual(defaults["borderWidth"] as? Int, 2)
    XCTAssertEqual(defaults["borderColor"] as? String, "#C0C0C0")
    XCTAssertEqual(defaults["borderRadius"] as? Int, 4)
}

func testLegendDefaults() {
    let defaults = ElementDefaults.defaults(for: "legend")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    XCTAssertEqual(defaults["paddingLeft"] as? Int, 2)
    XCTAssertEqual(defaults["paddingRight"] as? Int, 2)
}

func testSearchDefaults() {
    let defaults = ElementDefaults.defaults(for: "search")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
}
```

**Step 2: Run tests to verify fail**

**Step 3: Add defaults**

```swift
case "details", "search":
    return blockDefaults
case "summary":
    return summaryDefaults
case "dialog":
    return dialogDefaults
case "fieldset":
    return fieldsetDefaults
case "legend":
    return legendDefaults
```

```swift
private static let summaryDefaults: [String: Any] = [
    "flexDirection": "row"
]

private static let dialogDefaults: [String: Any] = [
    "flexDirection": "column",
    "paddingTop": 16,
    "paddingBottom": 16,
    "paddingLeft": 16,
    "paddingRight": 16,
    "borderWidth": 1,
    "borderColor": "#000000",
    "backgroundColor": "#FFFFFF"
]

private static let fieldsetDefaults: [String: Any] = [
    "flexDirection": "column",
    "marginLeft": 2,
    "marginRight": 2,
    "paddingTop": 5.6,
    "paddingBottom": 10,
    "paddingLeft": 12,
    "paddingRight": 12,
    "borderWidth": 2,
    "borderColor": "#C0C0C0",
    "borderRadius": 4
]

private static let legendDefaults: [String: Any] = [
    "flexDirection": "row",
    "paddingLeft": 2,
    "paddingRight": 2
]
```

**Step 4: No UIKitMutationApplier changes** — all fall through to default UIView case.

**Step 5: Run tests to verify pass**

**Step 6: Commit**

```bash
git commit -m "feat: add P2 block containers (details, summary, dialog, fieldset, legend, search)"
```

---

## Task 7: P2 Inline Text Elements (sub, sup, abbr, cite, q, dfn, var, samp, kbd, time)

**Reference:** `docs/research/html-elements/03-inline-text.md`

Most of these share defaults with elements already added. `cite`, `dfn`, `var` = italic. `samp`, `kbd` = monospace. `sub`, `sup` have baseline offset. `q`, `time`, `abbr` have no visual defaults.

**Step 1: Write Swift unit tests**

```swift
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
    XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
}

func testSupDefaults() {
    let defaults = ElementDefaults.defaults(for: "sup")
    XCTAssertEqual(defaults["flexDirection"] as? String, "row")
    XCTAssertEqual(defaults["flexShrink"] as? Int, 1)
    XCTAssertEqual(defaults["fontSize"] as? Double, 13.28)
}

func testQDefaults() {
    // q has same layout as span, no visual extras
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
```

**Step 2: Run tests to verify fail**

**Step 3: Add defaults**

```swift
case "cite", "dfn", "var":
    return italicDefaults
case "sub", "sup":
    return smallDefaults  // Same font-size reduction
case "q", "time", "abbr", "data":
    return spanDefaults
```

Note: `kbd`, `samp` were already added in Task 1 (`monospaceDefaults`).

**Step 4: Add to TEXT_CONTEXT_ELEMENTS in HostConfig.js**

```javascript
'cite', 'dfn', 'var', 'sub', 'sup', 'q', 'time', 'abbr', 'data',
```

**Step 5: Add to UIKitMutationApplier UILabel case**

```swift
case "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
     "b", "i", "u", "s", "del", "ins", "mark", "small", "code", "kbd", "samp",
     "pre", "th", "td",
     "cite", "dfn", "var", "sub", "sup", "q", "time", "abbr", "data":
```

**Step 6: Run tests to verify pass**

**Step 7: Commit**

```bash
git commit -m "feat: add P2 inline text elements (sub, sup, abbr, cite, q, dfn, var, time)"
```

---

## Task 8: P2 Table Footer and Caption (tfoot, caption)

**Reference:** `docs/research/html-elements/05-tables.md`

**Step 1: Write Swift unit tests**

```swift
func testTfootDefaults() {
    let defaults = ElementDefaults.defaults(for: "tfoot")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
}

func testCaptionDefaults() {
    let defaults = ElementDefaults.defaults(for: "caption")
    XCTAssertEqual(defaults["flexDirection"] as? String, "column")
    XCTAssertEqual(defaults["alignItems"] as? String, "center")
}
```

**Step 2: Run tests to verify fail**

**Step 3: Add defaults** — `tfoot` already handled (in Task 4 group). Add:

```swift
case "caption":
    return captionDefaults
```

```swift
private static let captionDefaults: [String: Any] = [
    "flexDirection": "column",
    "alignItems": "center"
]
```

**Step 4: Run tests to verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: add table caption element"
```

---

## Task 9: P2 Form Controls (progress, input[type=checkbox], input[type=range])

**Reference:** `docs/research/html-elements/06-form-controls.md`

These require new UIKit view types and are more involved than defaults-only changes.

**Step 1: Write Swift unit tests for progress**

```swift
func testProgressDefaults() {
    let defaults = ElementDefaults.defaults(for: "progress")
    XCTAssertEqual(defaults["height"] as? Int, 4)
}
```

**Step 2: Add defaults**

```swift
case "progress":
    return progressDefaults
```

```swift
private static let progressDefaults: [String: Any] = [
    "height": 4
]
```

**Step 3: Add UIKitMutationApplier createView case for progress**

```swift
case "progress":
    let progressView = UIProgressView(progressViewStyle: .default)
    if let value = props["value"] as? Double, let max = props["max"] as? Double {
        progressView.progress = Float(value / max)
    }
    applyCommonProps(to: progressView, props: props)
    return progressView
```

**Step 4: Add updateView case**

```swift
case "progress":
    if let progressView = view as? UIProgressView {
        if let value = props["value"] as? Double {
            let max = (props["max"] as? Double) ?? 1.0
            progressView.progress = Float(value / max)
        }
    }
```

**Step 5: Run tests to verify pass**

**Step 6: Commit**

```bash
git commit -m "feat: add progress element with UIProgressView"
```

**Note:** `input[type=checkbox]` (UISwitch) and `input[type=range]` (UISlider) require extending the `input` case in `createView` to check the `type` prop and return different UIKit views. This involves modifying the existing input handling logic:

```swift
case "input":
    let inputType = (props["type"] as? String) ?? "text"
    switch inputType {
    case "checkbox":
        let toggle = UISwitch()
        // ... configure
        return toggle
    case "range":
        let slider = UISlider()
        // ... configure
        return slider
    default:
        let textField = UITextField()
        // ... existing text field setup
        return textField
    }
```

These are more involved and should be separate commits.

---

## Task 10: P2 Media Elements (video, audio)

**Reference:** `docs/research/html-elements/07-embedded-media.md`

These require AVFoundation integration. High complexity.

**Step 1: Write Swift unit tests**

```swift
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
```

**Step 2: Add defaults**

```swift
case "video":
    return videoDefaults
case "audio":
    return audioDefaults
```

```swift
private static let videoDefaults: [String: Any] = [
    "width": 300,
    "height": 150,
    "backgroundColor": "#000000"
]

private static let audioDefaults: [String: Any] = [
    "flexDirection": "row",
    "alignItems": "center",
    "height": 32
]
```

**Step 3: Add createView placeholder** (full AVPlayer integration is separate work)

```swift
case "video":
    let view = UIView()
    view.backgroundColor = .black
    applyCommonProps(to: view, props: props)
    // TODO: Add AVPlayerLayer for actual video playback
    return view

case "audio":
    let view = UIView()
    applyCommonProps(to: view, props: props)
    // TODO: Add AVAudioPlayer + playback controls
    return view
```

**Step 4: Run tests to verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: add video/audio element defaults (playback implementation deferred)"
```

---

## Task 11: P2 Remaining Elements (picture, meter, iframe placeholder)

**Reference:** `docs/research/html-elements/07-embedded-media.md`, `docs/research/html-elements/06-form-controls.md`

**Step 1: Add defaults for remaining P2 elements**

```swift
case "picture":
    return blockDefaults
case "meter":
    return progressDefaults  // Same visual as progress
case "iframe":
    return iframeDefaults
```

```swift
private static let iframeDefaults: [String: Any] = [
    "width": 300,
    "height": 150,
    "borderWidth": 2,
    "borderColor": "#808080"
]
```

**Step 2: Write tests, run, verify**

**Step 3: Commit**

```bash
git commit -m "feat: add remaining P2 element defaults (picture, meter, iframe)"
```

---

## Task 12: P3 Remaining Elements (menu, hgroup, center, bdi, bdo, wbr, ruby, rt, data, output, optgroup, canvas, embed, object)

These are rare elements. Most just need defaults entries that alias to existing dictionaries.

**Step 1: Add all P3 defaults in one batch**

```swift
case "menu":
    return listDefaults  // Same as ul
case "hgroup", "center":
    return blockDefaults
case "bdi", "bdo", "wbr", "ruby", "rt", "rp", "data", "output":
    return spanDefaults
case "optgroup":
    return blockDefaults
case "canvas":
    return canvasDefaults
case "embed", "object":
    return blockDefaults
```

```swift
private static let canvasDefaults: [String: Any] = [
    "width": 300,
    "height": 150
]
```

**Step 2: Write tests for a representative sample (menu, canvas)**

**Step 3: Commit**

```bash
git commit -m "feat: add P3 element defaults"
```

---

## Task 13: Update Documentation

**Step 1: Update master plan**

Mark the expanded element support in `docs/master-plan.md`.

**Step 2: Update html-element-registry spec**

Update `docs/specs/html-element-registry.md` to reflect the new elements.

**Step 3: Commit**

```bash
git commit -m "docs: update element registry with P1-P3 elements"
```

---

## Summary

| Task | Elements Added | Priority | Complexity |
|------|---------------|----------|------------|
| 1 | b, i, u, s, del, ins, mark, small, code, kbd, samp | P1 | Low |
| 2 | address, blockquote, figure, figcaption, pre | P1 | Low |
| 3 | dl, dt, dd | P1 | Low |
| 4 | table, thead, tbody, tfoot, tr, th, td | P1 | Medium |
| 5 | label | P1 | Low |
| 6 | details, summary, dialog, fieldset, legend, search | P2 | Medium |
| 7 | sub, sup, abbr, cite, q, dfn, var, time | P2 | Low |
| 8 | caption | P2 | Low |
| 9 | progress (+ checkbox/range stubs) | P2 | Medium |
| 10 | video, audio | P2 | High (deferred playback) |
| 11 | picture, meter, iframe | P2 | Low |
| 12 | All P3 elements | P3 | Low |
| 13 | Documentation update | — | Low |

**Total new elements:** ~45
**Total after completion:** ~65 elements
