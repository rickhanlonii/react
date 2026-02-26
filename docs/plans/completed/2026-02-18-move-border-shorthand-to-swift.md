# Move Border Shorthand Expansion to Swift

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove `expandStyleShorthands()` from JS (HostConfig.js and NativeFizzConfig.js) and move CSS `border` shorthand parsing to Swift, so all yoga/style props work happens natively.

**Architecture:** Currently, JS parses the CSS `border` shorthand (e.g., `"1px solid red"` → `{borderWidth: 1, borderColor: "red"}`) before passing props to Swift. This moves that parsing into `ElementDefaults.mergedStyle()` in Swift, which is already the single entry point for all style processing (CSR create, CSR clone, and SSR paths). The only JS-side style concern that remains is resolving Flight lazy references on the style prop, which is a JS runtime protocol concern and cannot be handled in Swift.

**Tech Stack:** Swift (ElementDefaults.swift), JS (HostConfig.js, NativeFizzConfig.js), XCTest, Jest

---

### Task 1: Add border shorthand expansion to ElementDefaults.swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift:157-175`

**Step 1: Add `expandBorderShorthand` helper method**

Add a private static method that parses the CSS `border` shorthand string and returns expanded individual properties. Place it before the `// MARK: - Default Dictionaries` section.

```swift
/// Expands CSS `border` shorthand (e.g. "1px solid red") into individual
/// borderWidth/borderColor properties. Returns the style unchanged if no
/// shorthand is present.
private static func expandBorderShorthand(_ style: [String: Any]) -> [String: Any] {
    guard let border = style["border"] as? String else {
        return style
    }

    var expanded = style
    expanded.removeValue(forKey: "border")

    // Parse: "<width> <style> <color>"
    // Color may contain spaces (e.g. "rgba(255, 0, 0, 0.4)"), so we parse
    // width and style tokens from the front, then treat the rest as color.
    let fullPattern = #"^(\d+(?:\.\d+)?(?:px|em|rem)?)\s+(\w+)\s+(.+)$"#
    if let match = border.range(of: fullPattern, options: .regularExpression) {
        let components = border[match]
        // Re-match with capture groups
        if let regex = try? NSRegularExpression(pattern: fullPattern),
           let result = regex.firstMatch(
               in: border,
               range: NSRange(border.startIndex..., in: border)
           ) {
            if let widthRange = Range(result.range(at: 1), in: border) {
                let widthStr = String(border[widthRange])
                // Strip unit suffix (px/em/rem) and parse as Double
                let numStr = widthStr.replacingOccurrences(
                    of: #"(px|em|rem)$"#,
                    with: "",
                    options: .regularExpression
                )
                if let width = Double(numStr) {
                    // Only set if user didn't provide explicit borderWidth
                    if expanded["borderWidth"] == nil {
                        expanded["borderWidth"] = width
                    }
                }
            }
            // result.range(at: 2) is border-style (e.g. "solid") — ignored
            if let colorRange = Range(result.range(at: 3), in: border) {
                if expanded["borderColor"] == nil {
                    expanded["borderColor"] = String(border[colorRange])
                }
            }
        }
    } else {
        // Fallback: try width-only ("1px") or width+color ("1px red")
        let simplePattern = #"^(\d+(?:\.\d+)?(?:px|em|rem)?)(?:\s+(.+))?$"#
        if let regex = try? NSRegularExpression(pattern: simplePattern),
           let result = regex.firstMatch(
               in: border,
               range: NSRange(border.startIndex..., in: border)
           ) {
            if let widthRange = Range(result.range(at: 1), in: border) {
                let widthStr = String(border[widthRange])
                let numStr = widthStr.replacingOccurrences(
                    of: #"(px|em|rem)$"#,
                    with: "",
                    options: .regularExpression
                )
                if let width = Double(numStr), expanded["borderWidth"] == nil {
                    expanded["borderWidth"] = width
                }
            }
            if result.range(at: 2).location != NSNotFound,
               let colorRange = Range(result.range(at: 2), in: border) {
                if expanded["borderColor"] == nil {
                    expanded["borderColor"] = String(border[colorRange])
                }
            }
        }
    }

    return expanded
}
```

**Step 2: Call `expandBorderShorthand` in `mergedStyle()`**

Modify `mergedStyle()` to expand border shorthands on the merged result. Since element defaults never use the `border` shorthand (they use individual `borderWidth`/`borderColor`), this only affects user-supplied styles.

```swift
public static func mergedStyle(
    for elementType: String,
    userStyle: [String: Any]?
) -> [String: Any] {
    let defaults = self.defaults(for: elementType)
    guard let userStyle = userStyle, !userStyle.isEmpty else {
        return defaults
    }
    guard !defaults.isEmpty else {
        return expandBorderShorthand(userStyle)
    }
    var merged = defaults
    for (key, value) in userStyle {
        merged[key] = value
    }
    return expandBorderShorthand(merged)
}
```

**Step 3: Run Swift tests**

Run: `npm run test:swift`
Expected: All existing tests pass (no border shorthand in existing tests)

---

### Task 2: Add Swift tests for border shorthand expansion

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift`

**Step 1: Add test cases for border shorthand**

Add these tests to the existing test class:

```swift
func testBorderShorthandFullParse() {
    // "1px solid red" → borderWidth: 1, borderColor: "red"
    let merged = ElementDefaults.mergedStyle(
        for: "div",
        userStyle: ["border": "1px solid red"]
    )
    XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
    XCTAssertEqual(merged["borderColor"] as? String, "red")
    XCTAssertNil(merged["border"])  // shorthand key removed
}

func testBorderShorthandWithFractionalWidth() {
    let merged = ElementDefaults.mergedStyle(
        for: "div",
        userStyle: ["border": "2.5px solid #333"]
    )
    XCTAssertEqual(merged["borderWidth"] as? Double, 2.5)
    XCTAssertEqual(merged["borderColor"] as? String, "#333")
}

func testBorderShorthandWithRgbaColor() {
    // Color with spaces: "rgba(255, 0, 0, 0.4)"
    let merged = ElementDefaults.mergedStyle(
        for: "div",
        userStyle: ["border": "1px solid rgba(255, 0, 0, 0.4)"]
    )
    XCTAssertEqual(merged["borderWidth"] as? Double, 1.0)
    XCTAssertEqual(merged["borderColor"] as? String, "rgba(255, 0, 0, 0.4)")
}

func testBorderShorthandWidthOnly() {
    let merged = ElementDefaults.mergedStyle(
        for: "div",
        userStyle: ["border": "3px"]
    )
    XCTAssertEqual(merged["borderWidth"] as? Double, 3.0)
    XCTAssertNil(merged["borderColor"])
}

func testBorderShorthandExplicitOverridesShorthand() {
    // Explicit borderWidth should take precedence over shorthand
    let merged = ElementDefaults.mergedStyle(
        for: "div",
        userStyle: ["border": "1px solid red", "borderWidth": 5]
    )
    XCTAssertEqual(merged["borderWidth"] as? Double, 5.0)  // explicit wins
    XCTAssertEqual(merged["borderColor"] as? String, "red")
}

func testNoBorderShorthandPassesThrough() {
    let merged = ElementDefaults.mergedStyle(
        for: "div",
        userStyle: ["borderWidth": 2, "borderColor": "blue"]
    )
    XCTAssertEqual(merged["borderWidth"] as? Double, 2.0)
    XCTAssertEqual(merged["borderColor"] as? String, "blue")
}
```

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: All tests pass, including new border shorthand tests

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift
git add packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift
git commit -m "feat: move border shorthand expansion to Swift ElementDefaults"
```

---

### Task 3: Remove expandStyleShorthands from HostConfig.js

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js:67-114,148,215`

**Step 1: Remove `expandStyleShorthands` function**

Delete the entire `expandStyleShorthands` function (lines 67-114) and its section comment (lines 67-70).

**Step 2: Update `createInstance` — resolve Flight lazy + strip children**

Replace the destructuring line:
```js
const {children, ...nativeProps} = expandStyleShorthands(props);
```

With Flight lazy resolution + simple destructuring:
```js
let resolvedProps = props;
// Resolve Flight lazy references — shared style objects may arrive as lazy
// wrappers from the Flight protocol that need JS-side resolution.
const style = props.style;
if (style != null && typeof style === 'object' && typeof style._init === 'function') {
  resolvedProps = {...props, style: style._init(style._payload)};
}
const {children, ...nativeProps} = resolvedProps;
```

**Step 3: Update `cloneInstance` — same lazy resolution**

Replace:
```js
const {children, ...nativeNewProps} = expandStyleShorthands(newProps);
```

With:
```js
let resolvedNewProps = newProps;
const newStyle = newProps.style;
if (newStyle != null && typeof newStyle === 'object' && typeof newStyle._init === 'function') {
  resolvedNewProps = {...newProps, style: newStyle._init(newStyle._payload)};
}
const {children, ...nativeNewProps} = resolvedNewProps;
```

**Step 4: Run JS tests**

Run: `npm test`
Expected: All JS tests pass

---

### Task 4: Remove expandStyleShorthands from NativeFizzConfig.js

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzConfig.js:35-73,116`

**Step 1: Remove `expandStyleShorthands` function**

Delete the function (lines 35-73) and its section comment (lines 35-37).

**Step 2: Update `pushStartInstance`**

Replace:
```js
const filteredProps = filterProps(expandStyleShorthands(props));
```

With:
```js
const filteredProps = filterProps(props);
```

SSR doesn't have Flight lazy references (server renders synchronously), and border shorthand expansion now happens in Swift when `ShadowTreeBuilder.openElement()` creates the `ShadowNodeWrapper`.

**Step 3: Run JS tests**

Run: `npm test`
Expected: All JS tests pass

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/renderer/HostConfig.js
git add packages/react-dom-native/src/server/NativeFizzConfig.js
git commit -m "refactor: remove JS-side style shorthand expansion, handled in Swift"
```

---

### Task 5: Rebuild the JS bundle

**Files:**
- Regenerate: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Resources/bundle.js`

**Step 1: Rebuild the bundle**

Run: `cd example && npm run build`

This rebuilds `bundle.js` from the modified HostConfig.js source.

**Step 2: Verify the bundle no longer contains expandStyleShorthands**

Search the regenerated bundle for `expandStyleShorthands` — it should not appear.

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Resources/bundle.js
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Resources/bundle.js.map
git commit -m "chore: rebuild bundle after removing JS style expansion"
```

---

### Task 6: Run full test suite

**Step 1: Run JS unit tests**

Run: `npm test`
Expected: All pass

**Step 2: Run Swift tests**

Run: `npm run test:swift`
Expected: All pass (including new border shorthand tests)

**Step 3: Run Fantom integration tests**

Run: `npm run test:fantom`
Expected: All pass — element defaults and border rendering still work

**Step 4: Run E2E layout comparison tests** (if available)

Run: `npm run test:e2e` (or however E2E tests are invoked)
Expected: Border fixtures (`border-basic`, `border-padding`) still match web rendering
