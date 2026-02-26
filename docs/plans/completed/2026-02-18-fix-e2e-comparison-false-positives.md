# Fix E2E Comparison False Positives

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate false-positive diffs in the E2E layout comparison pipeline so that fixtures with no real layout differences pass (0 diffs), and only genuine implementation gaps surface.

**Architecture:** Most failures are comparison-framework issues — the comparer does exact string matching on semantically-identical values in different formats (colors, fontWeight). Fix by normalizing values in `LayoutComparer.swift` before comparing, and fixing the native extractor to expand `gap` into `rowGap`/`columnGap`. The remaining diffs (per-side borders, heading height) are real implementation gaps that should remain visible.

**Tech Stack:** Swift (LayoutComparer.swift, LayoutExtractor.swift), JavaScript (entry.js)

---

## Current State: 0/10 passed, 56 diffs

| Issue | Diffs | Fixtures | Type |
|-------|-------|----------|------|
| Color format (`rgb()` vs `#hex`) | 27 | 9/10 | False positive |
| flexWrap (`nowrap` vs `wrap`) | 8 | 2 (p-text, headings) | Known divergence |
| fontWeight (`700` vs `bold`) | 6 | 1 (headings) | False positive |
| Gap expansion (`rowGap`/`columnGap` missing) | 2 | 1 (flex-row) | Extractor bug |
| Per-side border widths (not implemented) | 8 | 2 (border-basic, border-padding) | Real gap |
| Heading height (1.95px delta) | 1 | 1 (headings) | Real gap |

**After this plan:** 4 fixtures should show real diffs only (headings: 1 height diff, flex-row: 0, border-basic: 4 border diffs, border-padding: 4 border diffs). The other 6 fixtures should pass with 0 diffs.

**Expected result: 6/10 passed** (up from 0/10).

---

### Task 1: Normalize color format in LayoutComparer

The biggest source of noise — 27 of 56 diffs. Web's `getComputedStyle` returns `rgb(r, g, b)`, native stores `#rrggbb`. Both represent the same color.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutComparer.swift`

**Step 1: Add a color normalization helper**

Add this helper function inside `enum LayoutComparer`, before the `compare` method:

```swift
/// Normalize color strings to a common format for comparison.
/// Converts "rgb(r, g, b)" → "#rrggbb" so web and native values match.
private static func normalizeColor(_ color: String) -> String {
    // Match rgb(r, g, b) pattern
    let trimmed = color.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("rgb(") && trimmed.hasSuffix(")") {
        let inner = trimmed.dropFirst(4).dropLast(1)
        let parts = inner.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        if parts.count == 3 {
            return String(format: "#%02x%02x%02x", parts[0], parts[1], parts[2])
        }
    }
    return trimmed
}
```

**Step 2: Add a set of color properties and normalize before comparison**

In the string comparison loop, add normalization for color properties. Replace the existing string comparison block (lines ~100-112) with:

```swift
// Compare string style properties (only when both sides have values)
let stringStyleProps = [
    "display", "flexDirection", "alignItems", "justifyContent",
    "flexWrap", "fontWeight",
    "overflow", "position", "textAlign",
    "color", "backgroundColor", "borderColor"
]

let colorProps: Set<String> = ["color", "backgroundColor", "borderColor"]

for prop in stringStyleProps {
    if let webStr = web.styles[prop]?.stringValue,
       let nativeStr = native.styles[prop]?.stringValue {
        let webNorm = colorProps.contains(prop) ? normalizeColor(webStr) : webStr
        let nativeNorm = colorProps.contains(prop) ? normalizeColor(nativeStr) : nativeStr
        if webNorm != nativeNorm {
            diffs.append(LayoutDiff(
                path: path,
                property: "styles.\(prop)",
                webString: webStr,
                nativeString: nativeStr
            ))
        }
    }
}
```

**Step 3: Build and run**

```bash
node tests/e2e/scripts/build.js
```
Then `build_run_sim` via MCP, tap "Run All", capture logs.

**Expected:** 27 color diffs eliminated. Remaining: 29 diffs.

**Step 4: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutComparer.swift
git commit -m "e2e: normalize color formats in layout comparer"
```

---

### Task 2: Normalize fontWeight in LayoutComparer

CSS returns fontWeight as numeric string ("700"), native uses keyword ("bold"). These are equivalent: `bold` = `700`, `normal` = `400`.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutComparer.swift`

**Step 1: Add fontWeight normalization helper**

Add inside `enum LayoutComparer`, near the color normalizer:

```swift
/// Normalize fontWeight keywords to numeric equivalents.
/// CSS: "normal" = "400", "bold" = "700".
private static func normalizeFontWeight(_ value: String) -> String {
    switch value {
    case "normal": return "400"
    case "bold": return "700"
    default: return value
    }
}
```

**Step 2: Apply normalization in the string comparison loop**

Update the comparison to also normalize fontWeight. Change the normalization line in the loop:

```swift
let webNorm: String
let nativeNorm: String
if colorProps.contains(prop) {
    webNorm = normalizeColor(webStr)
    nativeNorm = normalizeColor(nativeStr)
} else if prop == "fontWeight" {
    webNorm = normalizeFontWeight(webStr)
    nativeNorm = normalizeFontWeight(nativeStr)
} else {
    webNorm = webStr
    nativeNorm = nativeStr
}
```

**Step 3: Build and run**

`build_run_sim` via MCP, tap "Run All", capture logs.

**Expected:** 6 fontWeight diffs eliminated. Remaining: 23 diffs.

**Step 4: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutComparer.swift
git commit -m "e2e: normalize fontWeight in layout comparer"
```

---

### Task 3: Exclude flexWrap from comparison for text elements

Native intentionally sets `flexWrap: "wrap"` on `<p>` and `<h1>`–`<h6>` to emulate CSS block text wrapping in Yoga's flex model. CSS default is `"nowrap"`. This isn't a bug — it's a deliberate architectural choice. The comparer should skip flexWrap on these elements.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutComparer.swift`

**Step 1: Add element type to the compare method and skip flexWrap for text elements**

The `compare` method needs to know the element type. The `path` includes it (e.g. `root > h1[0]`) but extracting it is fragile. Instead, pass the `LayoutNode.type` and skip the comparison.

Add a set of text-container elements and check in the loop:

```swift
// Elements that intentionally diverge on flexWrap (use "wrap" in Yoga to emulate CSS block text wrapping)
let flexWrapExcluded: Set<String> = ["p", "h1", "h2", "h3", "h4", "h5", "h6"]
```

Then wrap the flexWrap comparison with a guard. In the string comparison loop, before the normalization, add:

```swift
if prop == "flexWrap" && flexWrapExcluded.contains(web.type) {
    continue
}
```

This goes right after the `for prop in stringStyleProps {` line, before the `if let webStr = ...` check.

**Step 2: Build and run**

`build_run_sim` via MCP, tap "Run All", capture logs.

**Expected:** 8 flexWrap diffs eliminated. Remaining: 15 diffs.

**Step 3: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutComparer.swift
git commit -m "e2e: skip flexWrap comparison on text container elements"
```

---

### Task 4: Fix gap expansion in native extractor

When a fixture sets `gap: 10`, CSS expands this to `rowGap: 10` + `columnGap: 10` in `getComputedStyle`. The native style dict only has `gap`, not the expanded properties. Fix the native extractor to mirror CSS expansion.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutExtractor.swift`

**Step 1: Add gap expansion logic**

In `extractStyles(from:)`, after the existing gap extraction lines (lines ~102-105), add fallback logic: if `rowGap`/`columnGap` aren't explicitly set but `gap` is, use the `gap` value:

Replace the gap extraction block:

```swift
// Flex container spacing
if let v = styleDict["gap"] as? NSNumber { styles["gap"] = .number(v.doubleValue) }
if let v = styleDict["rowGap"] as? NSNumber { styles["rowGap"] = .number(v.doubleValue) }
if let v = styleDict["columnGap"] as? NSNumber { styles["columnGap"] = .number(v.doubleValue) }
```

With:

```swift
// Flex container spacing — expand gap to rowGap/columnGap like CSS does
let gapValue = styleDict["gap"] as? NSNumber
if let v = gapValue { styles["gap"] = .number(v.doubleValue) }
if let v = styleDict["rowGap"] as? NSNumber {
    styles["rowGap"] = .number(v.doubleValue)
} else if let v = gapValue {
    styles["rowGap"] = .number(v.doubleValue)
}
if let v = styleDict["columnGap"] as? NSNumber {
    styles["columnGap"] = .number(v.doubleValue)
} else if let v = gapValue {
    styles["columnGap"] = .number(v.doubleValue)
}
```

**Step 2: Rebuild bundles and run**

```bash
node tests/e2e/scripts/build.js
```
Then `build_run_sim` via MCP, tap "Run All", capture logs.

**Expected:** 2 gap diffs eliminated. Remaining: 13 diffs.

**Step 3: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutExtractor.swift
git commit -m "e2e: expand gap to rowGap/columnGap in native extractor"
```

---

### Task 5: Final verification

**Step 1: Full run**

```bash
node tests/e2e/scripts/build.js
```
`build_run_sim`, tap "Run All", capture logs, screenshot.

**Expected results (13 remaining diffs, all real):**

| Fixture | Diffs | Details |
|---------|-------|---------|
| div-basic | 0 | PASS |
| div-nested | 0 | PASS |
| p-text | 0 | PASS |
| headings | 1 | height delta 1.95px (real) |
| flex-row | 0 | PASS |
| flex-align | 0 | PASS |
| flex-layout | 0 | PASS |
| box-model | 0 | PASS |
| border-basic | 4 | per-side border widths (real, known limitation) |
| border-padding | 8 | per-side border widths (real, known limitation) |

**Expected: 7/10 passed** (div-basic, div-nested, p-text, flex-row, flex-align, flex-layout, box-model).

**Step 2: Commit any remaining changes**

```bash
git add -A tests/e2e/
git commit -m "e2e: fix comparison false positives — 7/10 fixtures passing"
```

---

## Out of Scope (real implementation gaps for future work)

These are genuine differences that remain visible as diffs:

1. **Per-side border widths** — native only supports uniform `borderWidth` via `CALayer.borderWidth`. Implementing per-side requires custom drawing (e.g., `CAShapeLayer` or `drawRect`).
2. **Heading height (1.95px)** — cumulative margin rounding across 6 headings. Minor but real.
