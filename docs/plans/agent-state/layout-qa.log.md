# Layout QA State

## Last Full Run
- Date: 2026-02-18 (fourth run, 25 fixtures)
- Passed: 15/25 (automated diff baseline)
- Visual issues found in 3 passing fixtures (see below)

## Fixture Results (automated diff)
- `div-basic`: PASS (2 elements)
- `p-text`: PASS (3 elements)
- `headings`: PASS (7 elements)
- `box-model`: PASS (5 elements)
- `div-nested`: PASS (4 elements)
- `flex-layout`: PASS (4 elements)
- `flex-row`: PASS (4 elements)
- `flex-align`: PASS (4 elements)
- `border-padding`: PASS automated, FAIL visual (6 elements)
- `border-basic`: PASS automated, FAIL visual (5 elements)
- `flex-wrap`: PASS (6 elements)
- `list-basic`: PASS automated, FAIL visual (9 elements)
- `position-absolute`: PASS (5 elements)
- `flex-shrink`: PASS (13 elements) — NEW, all flex shrink ratios correct
- `opacity`: PASS (7 elements) — NEW, all opacity levels correct
- `overflow-hidden`: FAIL (7 elements, 1 diff — 4px text height, overflow clipping works visually)
- `text-inline`: FAIL (11 elements, 28 diffs — inline elements render as block)
- `flex-grow`: FAIL (8 elements, 8 diffs — incorrect flex-grow width distribution)
- `semantic-layout`: FAIL (15 elements, 18 diffs — span display mismatch, height cascading)
- `table-basic`: FAIL (20 elements, 64 diffs — table display model not supported)
- `form-basic`: FAIL (11 elements, 51 diffs — input/button sizing defaults)
- `article-content`: FAIL (13 elements, 27 diffs — inline-as-block, anchor color)
- `margin-auto`: FAIL (7 elements, 11 diffs — margin auto not implemented)
- `text-style-overrides`: FAIL (11 elements, 15 diffs — p margin defaults not em-relative)
- `border-radius`: FAIL (6 elements, 9 diffs — per-corner radii not implemented)

## Visual Issues Found (not caught by automated diff)
1. **list-basic** — missing list markers. Web shows bullet points for `<ul>` and numbers (1. 2. 3.) for `<ol>`. Native shows text at correct positions but no bullets or numbers. Task #41.
2. **border-basic** and **border-padding** — individual border-side widths not rendering. When using shorthand `borderWidth`, borders render fine. When using `borderTopWidth`, `borderBottomWidth`, `borderLeftWidth`, `borderRightWidth` individually (without shorthand), no border renders on native. Task #42.

## New Fixture Analysis (fourth run)

### overflow-hidden (FAIL - 1 diff)
- The overflow:hidden clipping itself works correctly on native. Visually verified.
- The 1 diff is a 4px height difference on a `<p>` element inside the clipped container (native=96 vs web=100). This is a pre-existing p text height issue, not an overflow bug.
- **Verdict**: Near-pass. Overflow feature works. Minor text sizing diff.

### flex-shrink (PASS - 0 diffs)
- All 13 elements match perfectly across 4 test cases: equal shrink, flexShrink:0, unequal shrink ratios (1:3), and flexBasis with flexGrow.
- **Verdict**: Full pass.

### margin-auto (FAIL - 11 diffs)
- `margin: 'auto'` values are not computing on native at all. All margin-auto values report native=0 instead of the computed auto value.
- Horizontal centering (marginLeft/marginRight auto), right-alignment (marginLeft auto), and flex vertical centering (marginTop/marginBottom auto) all fail.
- **Root cause**: The style pipeline likely does not handle the string value `'auto'` for margin properties — it probably parses it as 0 or ignores it. Yoga does support `YGValueAuto` but the JS-to-Swift bridge needs to pass it correctly.
- **Fix needed**: Handle `'auto'` string values for margin properties in YogaStyleApplier.swift

### text-style-overrides (FAIL - 15 diffs)
- All 15 diffs are margin-related on `<p>` and `<h2>` elements. The text styling features (fontSize, color, fontWeight, textAlign) all appear to work correctly.
- The issue: web `<p>` uses `margin: 1em 0` (margin scales with fontSize), so a `<p style={{fontSize: 24}}>` has 24px top/bottom margins. Native uses a fixed 16px margin regardless of fontSize.
- **Root cause**: Element defaults for `<p>` use fixed pixel margins instead of em-relative margins. Same for `<h2>`.
- **Fix needed**: Either implement em-relative default margins, or adjust the fixture to use explicit margins (to test text styling without margin interference).

### border-radius (FAIL - 9 diffs)
- Uniform `borderRadius` works (box 0 renders correctly).
- Circle (borderRadius = half of size) works (box 1 renders correctly).
- **Per-corner border radius** (`borderTopLeftRadius`, `borderTopRightRadius`, etc.) does NOT work — native reports borderRadius=0 for per-corner values. This is the same pattern as per-side border widths (task #42).
- **Border + borderRadius** box: native reports borderWidth on all sides (3px each) while web reports 0, and the native box is 6px larger (106x66 vs 100x60) — border is being added to the layout dimensions instead of being inside.
- Pill shape (large radius on short element) works.
- **Root cause**: Per-corner border radius properties not being applied in YogaStyleApplier.swift or UIKitMutationApplier.swift. The LayoutExtractor may also not extract per-corner values.
- **Fix needed**: Handle borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius in the style pipeline.

### opacity (PASS - 0 diffs)
- All 7 elements match: opacity 1.0, 0.5, 0.2, container with 0.5, and opacity 0.
- **Verdict**: Full pass.

## Outstanding Fix Tasks
- ~~Task #1: Fix layout: list-basic fontSize — FIXED, verified PASS~~
- ~~Task #35: Fix layout: position-absolute — FIXED, verified PASS~~
- Task #3: Fix layout: flex-grow — 8 diffs (fix in progress)
- Task #4: Fix layout: text-inline — 28 diffs
- Task #5: Fix layout: semantic-layout — 18 diffs [blocked by #4]
- Task #6: Fix layout: article-content — 27 diffs [blocked by #4]
- Task #7: Fix layout: table-basic — 64 diffs
- Task #8: Fix layout: form-basic — 51 diffs
- Task #41: Fix layout: list-basic — visual: missing list markers (bullets/numbers)
- Task #42: Fix layout: border-basic, border-padding — visual: per-side border widths not rendering
- NEW: margin-auto — 11 diffs (margin auto not implemented)
- NEW: text-style-overrides — 15 diffs (p margin defaults not em-relative)
- NEW: border-radius — 9 diffs (per-corner radii not implemented, border sizing)
- overflow-hidden — 1 diff (minor text height, feature works)

## Notes
- 15 of 25 fixtures pass automated diff. 3 of those have visual issues (list-basic, border-basic, border-padding).
- The 6 new fixtures added: overflow-hidden, flex-shrink, margin-auto, text-style-overrides, border-radius, opacity.
- 2 new fixtures pass cleanly: flex-shrink and opacity.
- overflow-hidden is a near-pass (1 minor diff, feature works correctly).
- margin-auto is a new fundamental gap — Yoga supports auto margins but the style bridge doesn't handle the 'auto' string value.
- text-style-overrides diffs are all margin-related, not text styling issues. The text features work.
- border-radius per-corner issue is similar to the per-side border width issue in task #42 — likely same root cause in the style applier.
- Demo QA (tasks #17, #18) was blocked by an SSR boundary reveal bug — Tabs and Accordion Suspense boundaries never resolve. Reported as task #59.

---
### Session log: 2026-02-18 (fourth run — 25 fixtures)
- Ran all 25 fixtures: 15/25 passing (up from 13/19)
- New fixtures: overflow-hidden, flex-shrink, margin-auto, text-style-overrides, border-radius, opacity
- New passes: flex-shrink (13 elements), opacity (7 elements)
- New fails: overflow-hidden (1 diff, near-pass), margin-auto (11 diffs), text-style-overrides (15 diffs), border-radius (9 diffs)
- Visually verified overflow-hidden: clipping works correctly, diff is minor text height
- Attempted demo QA for Tabs (#17) and Accordion (#18) — blocked by SSR boundary bug, reported to team lead

---
### Session log: 2026-02-18 (fifth run — 29 fixtures, post-fix re-QA)
- Ran all 29 fixtures: 19/29 passing (up from 15/25)
- **Fixes verified PASS** (tasks #62-#66):
  - `overflow-hidden`: PASS (0 diffs, was 1) — fix #65 resolved text height diff. Visual audit PASS.
  - `margin-auto`: PASS (0 diffs, was 11) — fix #63 resolved auto margin handling. Visual audit PASS.
  - `text-style-overrides`: PASS (0 diffs, was 15) — fix #66 resolved em-relative margins. Visual audit PASS.
  - `border-radius`: PASS (0 diffs, was 9) — fix #64 resolved per-corner radius. Visual audit PASS.
- **Improved but still failing** (inline fix #62):
  - `text-inline`: 4 diffs (down from 28) — remaining: small x offsets on u[2] and s[2] (~2px), code element y/height mismatch (6px)
  - `semantic-layout`: 9 diffs (down from 18) — remaining: cascading y offsets from margin differences (~18-25px deltas)
  - `article-content`: 3 diffs (down from 27) — remaining: code element y/height (same 6px issue), anchor color (#007AFF vs rgb(0,0,0))
- **New fixtures (4) — ALL BLOCKED**:
  - `display-none`: "Failed to extract web layout" — web WKWebView not loading new fixtures
  - `flex-direction-reverse`: "Failed to extract web layout"
  - `flex-align-extras`: "Failed to extract web layout"
  - `min-max-size`: "Failed to extract web layout"
  - Root cause: app needs rebuild to pick up new fixture JS in WKWebView bundle
- **Still failing (unchanged)**:
  - `flex-grow`: 8 diffs (flex-grow distribution wrong)
  - `table-basic`: 64 diffs (table display model not supported)
  - `form-basic`: 58 diffs (input/button sizing defaults)
- Visual audit of display-none native rendering: display:none elements correctly hidden, visible elements properly positioned. Cannot compare with web until rebuild.

---
### Session log: 2026-02-18 (sixth run — 29 fixtures, post-rebuild)
- App rebuilt. Ran all 29 fixtures: 18/29 passing.
- **New passes (4):**
  - `flex-grow`: PASS (0 diffs, was 8) — flex-grow distribution fixed
  - `flex-direction-reverse`: PASS (16 elements, 0 diffs) — NEW fixture, visual audit PASS
  - `flex-align-extras`: PASS (19 elements, 0 diffs) — NEW fixture, visual audit PASS
  - `min-max-size`: PASS (15 elements, 0 diffs) — NEW fixture, visual audit PASS
- **REGRESSIONS (6 fixtures, all margin-related):**
  - `p-text`: FAIL (3 diffs, was PASS) — p default margins adding y offsets
  - `headings`: FAIL (7 diffs, was PASS) — heading margins cascading
  - `box-model`: FAIL (5 diffs, was PASS) — margin y offsets
  - `list-basic`: FAIL (9 diffs, was PASS) — ul/ol margins wrong
  - `text-inline`: 14 diffs (was 4) — p default margins adding y offsets
  - `text-style-overrides`: FAIL (11 diffs, was PASS) — em-relative margin fix (#66) reverted or overridden
  - Created task #78 for regression fix
- **New fixture with diffs:**
  - `display-none`: FAIL (4 diffs) — hidden container child y position wrong, margin styles missing. Task #79.
- **Still failing (unchanged):**
  - `semantic-layout`: 9 diffs (margin cascading)
  - `article-content`: 3 diffs (code height + anchor color)
  - `table-basic`: 68 diffs (table display model)
  - `form-basic`: 58 diffs (input/button sizing)
- Completed visual audits: flex-direction-reverse, flex-align-extras, min-max-size (tasks #72-#74 completed)
- Regression root cause: default margins on p, h1-h6, ul, ol changed or reverted since last build

---
### Session log: 2026-02-18 (seventh run — 29 fixtures, baseline verification)
- Ran all 29 fixtures: **23/29 passing** (up from 18/29)
- Margin regression (#78) RESOLVED — p-text, headings, box-model, list-basic, text-style-overrides all restored to PASS
- text-inline also restored to 4 diffs (was 14 during regression)
- **Passing (23):** div-basic, div-nested, p-text, headings, flex-row, flex-align, flex-layout, box-model, border-basic, border-padding, position-absolute, flex-wrap, flex-grow, flex-shrink, opacity, overflow-hidden, margin-auto, border-radius, text-style-overrides, list-basic, flex-direction-reverse, flex-align-extras, min-max-size
- **Failing (6):**
  - text-inline: 4 diffs (code element height 20 vs 14, minor x offsets ~2px)
  - semantic-layout: 9 diffs (cascading y offsets from margin differences ~18-25px)
  - article-content: 3 diffs (code height + anchor color #007AFF vs black)
  - display-none: 4 diffs (child positioning in hidden container, margin style reporting)
  - table-basic: 64 diffs (table display model not supported)
  - form-basic: 58 diffs (input/button sizing defaults)

---
### Session log: 2026-02-19 (eighth run — 35 fixtures)
- Ran all 35 fixtures: **25/35 passing** (up from 23/29)
- 6 new fixtures added: nested-lists, relative-position, border-color-sides, flex-wrap-reverse, z-index, gap-properties
- **display-none: PASS** (was 4 diffs) — fix verified, visual audit PASS. Task #79 completed.
- **article-content: improved** — 2 diffs (was 3), anchor color fix applied. Remaining: code[0] y position (7px) and lineHeight extraction diff.
- **form-basic: improved** — 20 diffs (was 58). Button revision (#82) applied. Remaining: 4px height offset, border/backgroundColor color format diffs, display:inline-block vs block, alignItems/justifyContent center vs normal.
- **New fixture passes (1):** flex-wrap-reverse (10 elements, 0 diffs, visual audit PASS)
- **New fixture near-passes (2):**
  - z-index: 4 diffs — visual audit PASS, all diffs are extractor false positives (computed position offsets). Task #101.
  - gap-properties: 2 diffs — visual audit PASS, rowGap/columnGap not reported as gap by extractor. Task #102.
- **New fixture fails (3):**
  - nested-lists: 47 diffs — nested lists render beside parent text instead of below, missing margins, wrong indentation. Task #98.
  - relative-position: 10 diffs — position:relative offsets (top/left) not applied. Task #99.
  - border-color-sides: 1 automated diff + 2 visual-only mismatches — per-side border colors not implemented. Task #100.
- **Passing (25):** div-basic, div-nested, p-text, headings, flex-row, flex-align, flex-layout, box-model, border-basic, border-padding, position-absolute, flex-wrap, flex-grow, flex-shrink, opacity, overflow-hidden, margin-auto, border-radius, text-style-overrides, list-basic, flex-direction-reverse, flex-align-extras, min-max-size, display-none, flex-wrap-reverse
- **Failing (10):**
  - text-inline: 4 diffs (code element y/lineHeight)
  - semantic-layout: 9 diffs (cascading y offsets from margin differences)
  - article-content: 2 diffs (code y position + lineHeight extraction)
  - form-basic: 20 diffs (height offset, color formats, button display/alignment)
  - table-basic: 57 diffs (table display model not supported)
  - nested-lists: 47 diffs (nested list layout broken)
  - relative-position: 10 diffs (relative offsets not applied)
  - border-color-sides: 1 diff + visual mismatches (per-side colors not applied)
  - z-index: 4 diffs (extractor false positives, visual PASS)
  - gap-properties: 2 diffs (extractor reporting, visual PASS)
- Created fix tasks: #98 (nested-lists), #99 (relative-position), #100 (border-color-sides), #101 (z-index extractor), #102 (gap-properties extractor)

---
### Session log: 2026-02-19 (ninth run — 35 fixtures, full pass)
- Ran all 35 fixtures: **35/35 passing** (up from 25/35)
- ALL previously-failing fixtures now pass automated diff (0 diffs each):
  - text-inline: PASS (was 4 diffs)
  - semantic-layout: PASS (was 9 diffs)
  - article-content: PASS (was 2 diffs)
  - form-basic: PASS (was 20 diffs)
  - table-basic: PASS (was 57 diffs)
  - nested-lists: PASS (was 47 diffs)
  - relative-position: PASS (was 10 diffs)
  - border-color-sides: PASS (was 1 diff)
  - z-index: PASS (was 4 diffs)
  - gap-properties: PASS (was 2 diffs)
- Completed fix tasks: #98 (nested-lists), #99 (relative-position), #101 (z-index), #102 (gap-properties), #76 (semantic-layout), #42 (per-side border widths)
- **Visual audits performed (10 fixtures):**
  - table-basic: PASS — all columns, bold headers, alternating row background match
  - form-basic: PASS — labels, inputs, buttons match (minor platform input styling differences expected)
  - nested-lists: FAIL (visual) — list markers (bullets/numbers) missing on native (task #41)
  - relative-position: PASS — all offsets (positive, negative, siblings unaffected) match
  - border-color-sides: FAIL (visual) — per-side border colors not applied, all borders uniform color (task #100)
  - text-inline: PASS — bold, italic, underline, strikethrough, code all render correctly inline
  - semantic-layout: PASS — backgrounds, headings, nav row, aside border, footer all match
  - article-content: PASS with notes — hr may not render as visible line, anchor has underline on native without href
  - z-index: FAIL (visual) — positive z-index stacking correct, but zIndex:-1 does not render behind parent background (task #107)
  - gap-properties: PASS — rowGap, columnGap, mixed gaps with wrapping all match
  - border-basic: PASS — per-side border widths now render correctly (task #42 resolved)
  - border-padding: PASS — borders + padding + per-side widths all correct
- **Remaining visual issues (3):**
  - Task #41: list-basic + nested-lists — missing list markers (bullets/numbers)
  - Task #100: border-color-sides — per-side border colors not applied
  - Task #107: z-index — negative z-index (-1) doesn't render behind parent background
