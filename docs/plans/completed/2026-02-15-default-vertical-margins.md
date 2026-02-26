# Default Vertical Margins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add correct default vertical margins to block-level HTML elements (`h1`–`h6`, `p`, `ul`, `ol`, `address`, etc.) to match Chrome's user agent stylesheet.

**Architecture:** Update `ElementDefaults.swift` default dictionaries with `marginTop`/`marginBottom` values computed from Chrome's UA stylesheet em-based margins resolved against each element's font size. Add integration tests to verify margin values appear in rendered output and that margin collapsing works correctly between elements with default margins.

**Tech Stack:** Swift (ElementDefaults.swift), JS (Fantom integration tests)

---

## Reference: Chrome UA Stylesheet Margins

Chrome specifies vertical margins in `em` units. Resolved pixel values depend on each element's default `fontSize`:

| Element | UA margin | fontSize | marginTop (px) | marginBottom (px) |
|---------|-----------|----------|-----------------|-------------------|
| `p`     | 1em       | 16       | 16              | 16                |
| `h1`    | 0.67em    | 32       | 21.4            | 21.4              |
| `h2`    | 0.83em    | 24       | 19.9            | 19.9              |
| `h3`    | 1em       | 18.7     | 18.7            | 18.7              |
| `h4`    | 1.33em    | 16       | 21.3            | 21.3              |
| `h5`    | 1.67em    | 13.3     | 22.2            | 22.2              |
| `h6`    | 2.33em    | 10.7     | 24.9            | 24.9              |
| `ul/ol` | 1em       | 16       | 16              | 16                |
| `address`| 0 (none) | 16       | —               | —                 |

Elements that **already have** correct margins (no changes needed):
- `blockquote`, `figure`: marginTop=16, marginBottom=16 ✓
- `pre`: marginTop=16, marginBottom=16 ✓
- `dl`: marginTop=16, marginBottom=16 ✓
- `hr`: marginTop=8, marginBottom=8 ✓

---

### Task 1: Write failing tests for default vertical margins

**Files:**
- Modify: `tests/integration/element-defaults-itest.js`

**Step 1: Add margin tests**

Add these tests after the existing `h1` test (after line 33):

```js
  it('p gets default vertical margins of 16px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<p>text</p>);
    });

    var output = Fantom.getRenderedOutput();
    var p = output.children[0];
    expect(p.props.style.marginTop).toBe(16);
    expect(p.props.style.marginBottom).toBe(16);
  });

  it('h1 gets default vertical margins of 21.4px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<h1>Title</h1>);
    });

    var output = Fantom.getRenderedOutput();
    var h1 = output.children[0];
    expect(h1.props.style.marginTop).toBe(21.4);
    expect(h1.props.style.marginBottom).toBe(21.4);
  });

  it('h2 gets default vertical margins of 19.9px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<h2>Title</h2>);
    });

    var output = Fantom.getRenderedOutput();
    var h2 = output.children[0];
    expect(h2.props.style.marginTop).toBe(19.9);
    expect(h2.props.style.marginBottom).toBe(19.9);
  });

  it('ul gets default vertical margins of 16px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<ul><li>item</li></ul>);
    });

    var output = Fantom.getRenderedOutput();
    var ul = output.children[0];
    expect(ul.props.style.marginTop).toBe(16);
    expect(ul.props.style.marginBottom).toBe(16);
  });
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:fantom -- --testPathPattern element-defaults`

Expected: 4 new tests FAIL (margin properties are undefined in the style).

**Step 3: Commit**

```bash
git add tests/integration/element-defaults-itest.js
git commit -m "test: add failing tests for default vertical margins"
```

---

### Task 2: Add vertical margins to `p` and heading defaults

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift:238-291`

**Step 1: Update pDefaults**

```swift
    private static let pDefaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 16,
        "marginTop": 16,
        "marginBottom": 16
    ]
```

**Step 2: Update h1Defaults**

```swift
    private static let h1Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 32,
        "fontWeight": "bold",
        "marginTop": 21.4,
        "marginBottom": 21.4
    ]
```

**Step 3: Update h2Defaults**

```swift
    private static let h2Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 24,
        "fontWeight": "bold",
        "marginTop": 19.9,
        "marginBottom": 19.9
    ]
```

**Step 4: Update h3Defaults**

```swift
    private static let h3Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 18.7,
        "fontWeight": "bold",
        "marginTop": 18.7,
        "marginBottom": 18.7
    ]
```

**Step 5: Update h4Defaults**

```swift
    private static let h4Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 16,
        "fontWeight": "bold",
        "marginTop": 21.3,
        "marginBottom": 21.3
    ]
```

**Step 6: Update h5Defaults**

```swift
    private static let h5Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 13.3,
        "fontWeight": "bold",
        "marginTop": 22.2,
        "marginBottom": 22.2
    ]
```

**Step 7: Update h6Defaults**

```swift
    private static let h6Defaults: [String: Any] = [
        "display": "block",
        "flexDirection": "row",
        "flexWrap": "wrap",
        "fontSize": 10.7,
        "fontWeight": "bold",
        "marginTop": 24.9,
        "marginBottom": 24.9
    ]
```

**Step 8: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift
git commit -m "feat(defaults): add default vertical margins to p and h1-h6"
```

---

### Task 3: Add vertical margins to list defaults

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift:303-306`

**Step 1: Update listDefaults**

```swift
    private static let listDefaults: [String: Any] = [
        "display": "block",
        "paddingLeft": 40,
        "marginTop": 16,
        "marginBottom": 16
    ]
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift
git commit -m "feat(defaults): add default vertical margins to ul/ol lists"
```

---

### Task 4: Rebuild Fantom and run all tests

**Step 1: Rebuild the Fantom binary**

Run: `npm run build:fantom`

The Swift binary must be rebuilt because `ElementDefaults.swift` changed.

**Step 2: Run all tests**

Run: `npm run test:fantom`

Expected: All tests PASS (37 existing + 4 new = 41 total).

**Step 3: Commit (if any test adjustments needed)**

Fix any test failures and commit.

---

### Task 5: Write margin collapsing integration test with real elements

**Files:**
- Modify: `tests/integration/block-layout-itest.js`

This test verifies that default margins on real HTML elements (`h2` + `p`) collapse correctly.

**Step 1: Add test**

Add after the existing tests:

```js
  it('h2 and p default margins collapse correctly', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <h2>Title</h2>
          <p>Paragraph</p>
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var h2 = parent.children[0];
    var p = parent.children[1];
    // h2: marginTop=19.9, content height = font-based, marginBottom=19.9
    // p: marginTop=16, marginBottom=16
    // Collapsed gap = max(19.9, 16) = 19.9
    expect(h2.frame.y).toBeCloseTo(19.9, 0);
    // p.y = h2.y + h2.height + collapsed(h2.marginBottom=19.9, p.marginTop=16) = h2.y + h2.height + 19.9
    var expectedPY = h2.frame.y + h2.frame.height + 19.9;
    expect(p.frame.y).toBeCloseTo(expectedPY, 0);
  });
```

**Step 2: Run tests**

Run: `npm run test:fantom -- --testPathPattern block-layout`

Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/block-layout-itest.js
git commit -m "test: add margin collapsing test with real h2 and p elements"
```

---

### Task 6: Build and visually verify in simulator

**Step 1: Build and run the example app**

Use the `build_run_sim` MCP tool to build and launch the app in the iOS simulator.

**Step 2: Take a screenshot**

Use the `screenshot` MCP tool. Verify that:
- `h1` and `h2` headings have visible vertical spacing above and below
- `p` paragraphs have vertical spacing between them
- The spacing between `h2` and the content below it looks proportional (margin collapsing)
- Lists (`ul`/`ol`) have vertical spacing from surrounding content

**Step 3: Compare with web rendering if possible**

The native rendering should now have vertical rhythm matching the web more closely.

**Step 4: Fix and commit any visual issues found**
