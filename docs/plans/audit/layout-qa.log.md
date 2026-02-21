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

---
### Session log: 2026-02-19 (tenth run — 48 fixtures)
- Ran all 48 fixtures: **36/48 passing** (up from 35/35 — new fixtures added)
- 13 new fixtures added in this batch, 5 failing
- **QA completed for 4 fixtures:**
  - inline-text-extras: FAIL (30 diffs) — small/sub/sup elements not styled (no smaller font, no subscript/superscript positioning). mark element works (yellow bg). Task #128.
  - fieldset-legend: FAIL (60 diffs) — legend not positioned on fieldset border, legend width stretches to full container, fieldset has wrong borderRadius (4 vs 0). Task #129.
  - overflow-scroll: FAIL (59 diffs) — overflow:scroll not creating scrollable container, children laid out horizontally instead of vertically. Task #130.
  - textarea-select: FAIL (101+ diffs) — textarea/select element defaults wrong (height, padding, borderColor, borderRadius, backgroundColor), flex layout with textarea broken, width:'100%' not working. Task #131.
- Created fix tasks: #128 (inline-text-extras), #129 (fieldset-legend), #130 (overflow-scroll), #131 (textarea-select)

---
### Session log: 2026-02-19 (tenth run continued — 7 new fixtures QA'd)
- QA'd 7 new fixtures from layout-builder batch:
  - dl-dt-dd: FAIL (14 diffs, 5 real) — strong element renders block-width instead of inline. Visual near-pass. Task #132.
  - details-summary: FAIL (30 diffs) — details element not collapsed by default, no disclosure triangle. All content visible. Task #133.
  - dialog-element: FAIL (64 diffs) — dialog not hidden by default (should be display:none). All dialog content visible. Task #134.
  - table-semantic: FAIL (70 diffs) — column widths equal instead of content-proportional, row height diffs. Task #135.
  - blockquote-figure: FAIL (11 diffs) — figure height diff, borderLeftWidth extractor issue. Visual near-pass. Task #136.
  - hr-standalone: FAIL (10 diffs) — hr lines not visible in native, 200px hr not centered. Task #137.
  - address-element: FAIL (7 diffs, 5 real) — paragraph margin accumulation in footer address with fontSize:14. Task #138.
- Created fix tasks: #132-#138
- Total QA'd this session: 11 fixtures (4 previous + 7 new)
- Total fix tasks created this session: #128-#138 (11 tasks)

---
### 2026-02-19
- Completed: Full results poll and analysis of 48 fixtures
- Result: 33/48 passing (up from 36/48 — dl-dt-dd now passes, some regressions from stale build)
- Identified cross-cutting root cause: heading fontSize not applied (h1-h6 all render at 16px)
  - Affects: headings, semantic-layout, article-content, text-style-overrides, pre-element (5 fixtures)
  - Created task #148 for this issue
- Visual audit: headings fixture — all native headings same size, web shows correct hierarchy
- Many completed fix tasks (#128, #129, #133, #134, #136, #137, #138) need LayoutCompare rebuild to verify
- Pending fix tasks still open: #130 (overflow-scroll), #131 (textarea-select), #135 (table-semantic)

---
### 2026-02-19 (eleventh run — 48 fixtures, post heading-fontSize fix)
- Completed: Full results poll, analysis, and visual audit of all 11 failing fixtures
- Result: **37/48 passing** (up from 33/48)
- **Newly passing (4):** headings, semantic-layout, article-content, text-style-overrides — all fixed by heading fontSize correction
- **Visual audits performed (7 failing fixtures):**
  - pre-element: fontSize 16 vs 13 (monospace default), margins 16 vs 13. All backgrounds/colors correct.
  - inline-text-extras: sub/sup not vertically offset (appear at normal baseline). mark/small work correctly.
  - details-summary: Content paragraphs have 0 dimensions (not laid out). No disclosure triangles. flexWrap=wrap vs nowrap.
  - dialog-element: Both web/native render dialogs as hidden (correct). Button defaults differ: borderRadius 10 vs 0, padding 11 vs 6.
  - blockquote-figure: borderLeftWidth measurement anomaly. Heights differ slightly on figures/figcaptions. Content renders correctly.
  - fieldset-legend: Legend doesn't interrupt fieldset border in native (web has classic gap-in-border behavior). Negative marginTop applied.
  - hr-standalone: Constrained-width hr not centered (no auto margins). Styled hrs may not be visible.
  - address-element: Minor height/y diffs. Link underline styling differs (native shows underline, web doesn't).
- **New fixture detected:** percentage-sizes — "Failed to extract web layout" (needs rebuild)
- Created fix tasks: #5 (details-summary), #6 (table-semantic), #7 (textarea-select), #8 (fieldset-legend), #9 (pre-element), #10 (inline-text-extras), #11 (overflow-scroll), #12 (dialog-element), #13 (blockquote-figure), #14 (hr-standalone), #15 (address-element)

---
### 2026-02-19 (eleventh run continued — overflow-scroll fix + percentage-sizes)
- Completed: Re-QA of overflow-scroll fix + QA of new percentage-sizes fixture
- **overflow-scroll: PASS** (0 diffs, was 14) — fixer resolved margin issues inside scroll containers. Task #11 completed.
- **percentage-sizes: 2 diffs** (new fixture from layout-builder) — extractor false positives: minWidth/maxWidth percentage values not extracted (reported as 0). Visual audit PASS — all percentage widths, heights, nested percentages, and min/max constraints render correctly. Task #16 created.
- Updated count: **38/49 passing**
- 11 fixtures still failing with fix tasks #5-#10, #12-#16

---
### 2026-02-20 (twelfth run — 73 fixtures)
- Completed: Full results poll, analysis, and visual audit of 3 fixtures
- Result: **52/73 passing** (up from 38/49 — many new fixtures added and fixes landed)
- **Newly passing since last audit:**
  - form-basic: PASS (was 10 diffs)
  - overflow-with-absolute: PASS (was 9 diffs)
- **New failing fixtures:**
  - relative-position: 4 diffs (NEW — position:relative top/left offsets not applied)
  - mixed-position: 6 diffs (NEW — same root cause as relative-position)
- **Visual audits performed (3 fixtures):**
  - overflow-with-absolute: PASS metrics but VISUAL ISSUE — absolute children with semi-transparent colors invisible inside overflow:hidden containers. Green square (full opacity) renders fine.
  - mixed-position: CONFIRMED — relative positioning offsets not applied. Native ignores top/left on relative elements.
  - nested-borders: PASS — all nested colored borders render correctly in native.
- **Fix tasks created:**
  - Task #5: relative-position — 4 diffs (relative offsets not applied)
  - Task #6: mixed-position — 6 diffs (same root cause)
- Regressions noted: list-with-actions 78 diffs (was 37), button-styles 83 diffs (was 76)

---
### 2026-02-20 (twelfth run continued — visual audits + fix verification)
- Completed: 12 visual audits + re-QA of relative-position/mixed-position fixes
- Result: **54/73 passing** (up from 52 — relative-position and mixed-position fixed)
- **Fixes verified (tasks #5, #6):**
  - relative-position: PASS (0 diffs, was 4) — JS-only fix, auto-reloaded
  - mixed-position: PASS (0 diffs, was 6) — JS-only fix, auto-reloaded
  - NOTE: Metrics pass but visual rendering still broken — children invisible in position:relative containers (task #7)
- **Visual audits performed (12 fixtures):**
  - PASS: percentage-sizes, padding-margin-shorthands, flex-shorthand, nested-flex-contexts, nested-borders, flex-basis-sizes, wrap-with-sizes, zero-size-items, flex-auto-margins, flex-row-height
  - FAIL: absolute-in-flex (children invisible, task #7), absolute-sizing (children invisible, task #7)
- Created task #7: Fix visual — children invisible in position:relative containers (CRITICAL)
- Total visually audited: 30/73 (24 pass, 6 fail)

---
### 2026-02-20 session
- Completed: Visual audits of 20 additional passing fixtures
- Result: 45 pass visual audit, 5 fail visual audit, 53/74 total audited
- **Newly audited (all PASS):** div-basic, div-nested, p-text, flex-row, flex-layout, flex-wrap, flex-grow, flex-shrink, opacity, overflow-hidden, border-radius, text-style-overrides, z-index, gap-properties, border-color-sides, flex-align-extras, large-gap-values, table-basic, display-none, flex-direction-reverse, flex-wrap-reverse
- **Newly audited (FAIL):** nested-lists (no bullet/number markers), text-decoration-transform (text truncation on transformed text)
- **Previously failing now PASS:** border-color-sides — per-side colored borders now render correctly
- **Fix verification:** Tasks #1-3 fixes landed, caused form-basic regression. Task #9 reverted button defaults. form-basic back to passing.
- **Results after revert:** 54/74 passed. New fixture align-content added (42 diffs). input-varieties improved (61->45). table-semantic improved (37->32).
- Created task #8 (button regression) — resolved by task #9 revert

---
### 2026-02-20 session (continued — position fixture re-audits)
- Completed: Visual re-audits of 3 position-related fixtures (absolute-in-flex, absolute-sizing, overflow-with-absolute, mixed-position)
- Result: 56/74 total audited (45 pass, 8 fail)
- **Re-audited fixtures (all STILL FAIL):**
  - absolute-in-flex: ALL children (flow AND absolute) invisible inside position:relative containers. 0 diffs, visual-only bug.
  - absolute-sizing: ALL absolute children invisible. 0 diffs. Parent backgrounds render correctly.
  - overflow-with-absolute: Absolute children in overflow:hidden + position:relative invisible. BUT children in position:relative WITHOUT overflow:hidden DO render (green square visible in section 2). 0 diffs.
  - mixed-position: Absolute children invisible. BUT flow children with position:relative offsets DO render correctly (flex row section with top:-5 and top:5 works). 0 diffs.
- **Key finding**: Bug is specifically `position: absolute` children inside `position: relative` parents. Flow children with relative offsets work fine. UIKit view creation/insertion issue, not Yoga layout.
- Created task #13: Fix invisible children in position:relative containers (affects 5+ fixtures)
- align-content now shows 45 diffs (was 42)
- Sent findings to team-lead for layout-fixer assignment

---
### 2026-02-20 session (continued — failing fixture visual audits)
- Completed: Visual audits of 2 low-diff failing fixtures (details-summary, address-element)
- Result: 58/74 total audited (45 pass, 2 near-pass, 8 fail)
- **details-summary (1 diff):** NEAR-PASS
  - All text content, bold styling, borders, padding, background colors render correctly
  - Nested details/summary work correctly
  - Missing disclosure triangles on summary elements (similar to list-basic missing bullets)
  - Only diff: root.height 564 vs 547 (17px delta)
- **address-element (3 diffs):** NEAR-PASS
  - All text renders correctly with italic styling
  - Link underlines render correctly
  - Card borders render correctly
  - Only diffs: root.height +17, footer.height +17, address.height +3 — all minor height differences
- align-content now shows 51 diffs (confirmed via curl results endpoint)
- 16 fixtures remain unaudited (all failing with metric diffs)

---
### 2026-02-20 session (continued — rebuild monitoring)
- App rebuilt multiple times. align-content fixture removed from set (73 fixtures).
- Run 14: 54/73 passing. Same 19 failing fixtures, no changes.
- Run 15: 54/77 passing. 4 new fixtures added by layout-builder:
  - text-align-inherit (59 diffs) — NEW
  - align-baseline (55 diffs) — NEW
  - nested-inline-text (46 diffs) — NEW
  - max-width-text (43 diffs) — NEW
- Task #13 (position:relative invisible children) picked up by layout-fixer (in_progress)
- No fix changes landed yet. Monitoring continues.
- Total audited: 58/77 (45 pass, 2 near-pass, 8 fail, 19 unaudited)

---
### 2026-02-20 session (continued — task #13 verification)
- Task #13 (position:relative invisible children) marked COMPLETED by layout-fixer
- App rebuilt (new PID 11918). Run 16: 54/81 passing, 27 failing.
- 1 new fixture: overflow-radius (44 diffs)
- Re-audited all 5 position fixtures — ALL NOW PASS:
  - position-absolute: absolute children (pink, green, blue, orange) all visible, match web
  - absolute-in-flex: absolute overlay on flex row, corner-positioned absolutes all visible
  - absolute-sizing: top+bottom height, left+right width, all-edge insets all visible
  - mixed-position: absolute children visible, relative offsets correct, stacked absolutes visible
  - overflow-with-absolute: overflow:hidden clipping works correctly, absolute children visible
- Task #13 fix VERIFIED — all 5 fixtures promoted from "failing" to "passing" visual audit
- Total audited: 63/81 (50 pass, 2 near-pass, 3 fail, 18 unaudited)

---
### 2026-02-20 session (continued — failing fixture audits)
- App rebuilt again (PID 25374). Run 17: 54/81 passing, 27 failing.
- Some improvements: button-styles 83->76, text-align-inherit 59->49, input-varieties 45->44
- Audited 4 low-diff failing fixtures:
  - blockquote-figure (5 diffs): NEAR-PASS — text, italic styling, blue left border, image placeholder all correct. Only 3px y-offsets on second figure.
  - hr-standalone (9 diffs): NEAR-PASS — all hr lines render with correct colors/widths. Minor height/margin diffs on constrained-width hr.
  - fieldset-legend (8 diffs): NEAR-PASS — fieldset borders, legend on border, inputs render correctly. Only legend margin calculation diffs.
  - negative-margin (9 diffs): NEAR-PASS — negative margins create correct overlapping effects. Only default paragraph margin diffs inside stacked cards.
- Total audited: 67/81 (50 pass, 6 near-pass, 3 fail, 14 unaudited)

---
### 2026-02-20 session (continued — more fixture audits)
- Audited 5 more fixtures:
  - card-layout (12 diffs): NEAR-PASS — all card patterns (simple, action buttons, horizontal, grid) render correctly. Only 3px y-offsets in second card section.
  - dialog-element (13 diffs): FAIL — dialog content rendering issues, button borderRadius differences (web: 0, native: 10). Known button defaults issue.
  - stacked-sections (10 diffs): NEAR-PASS — hero section, 3 feature cards, about section, CTA button, footer all render correctly. Only 2-5px y-offset diffs from paragraph margin accumulation.
  - sidebar-content (12 diffs): NEAR-PASS — blue top bar, sidebar with nav items, content area with Dashboard heading and stats row all render correctly. Only 15-16px height/y diffs from paragraph margin accumulation in content area.
  - relative-position (0 diffs, passing): PASS — pink, green, blue/orange/purple boxes all positioned correctly with relative offsets. 9 elements, 0 diffs.
- Total audited: 72/81 (51 pass, 9 near-pass, 4 fail, 9 unaudited)
- Remaining unaudited: all have 19+ metric diffs, need layout-fixer improvements before audit is worthwhile

---
### 2026-02-20 session (continued — high-diff fixture audits)
- App rebuilt multiple times during session (PID 25374 -> 82594 -> 3716 -> 14564)
- Fixture count increased: 81 -> 82 -> 86 -> 89 (layout-builder adding fixtures)
- Score improved: 54/81 -> 54/82 -> 56/86 -> 57/86 -> 60/89
- list-basic now passing (was previously failing with no bullet markers)
- Audited 2 more fixtures:
  - inline-text-extras (19 diffs): FAIL — mark (yellow highlight) and small (reduced font) render correctly. But sub and sup elements do NOT render with vertical offset (subscript/superscript positioning not implemented in native). Text wrapping differs in combined paragraph. Root cause: native renderer lacks verticalAlign / baseline offset support for sub/sup.
  - text-in-flex (22 diffs): NEAR-PASS — all text-in-flex patterns render correctly (content-sized items, flexGrow equal distribution, text alignment left/center/right, mixed font sizes with alignItems center, text wrapping in constrained flex child, heading+paragraph in bordered container). Only 3-6px y-offset diffs from paragraph margin accumulation.
- Total audited: 74/89 (51 pass, 10 near-pass, 5 fail, 15 unaudited from original set + ~8 new fixtures unaudited)

---
### 2026-02-20 session (continued — more high-diff audits)
- Score now: 62/92 passed (fixture count grew to 92)
- text-decoration-transform now passing (was failing with text truncation)
- Audited 2 more fixtures:
  - textarea-select (26->31 diffs): NEAR-PASS — textareas render with correct borders/sizing, labels render correctly, select elements present. Primary issue is 18px y-offset from label default margins that cascades throughout the layout. All form elements recognizable and functional-looking.
  - holy-grail-layout (29 diffs): NEAR-PASS — header (dark bar, white "Header" text), three-column layout (Nav sidebar blue with 3 nav items, Main Content with heading/paragraph/placeholders, Aside sidebar orange with 2 items), footer all render correctly and match web. Diffs from 18px height difference in middle section (paragraph margins) and 2.3px width rounding on sidebar.
- Total audited: 76/92 (52 pass, 12 near-pass, 4 fail, 13 unaudited from original set + ~11 new fixtures unaudited)

---
### 2026-02-20 session (continued — results refresh)
- Score now: 62/92 passed (30 failing)
- New fixtures detected: border-radius-percentage (48 FAIL), flex-wrap-align-items (PASS), margin-in-flex (PASS) — total grew to 92
- Confirmed textarea-select visual audit: labels flow inline in native instead of block stacking. Native shows "Comment" left of textarea with "Description" to its right, while web stacks them vertically. This is a label display:inline vs display:block issue.
- Confirmed dialog-element: both web and native render blank (dialogs without open attribute). All 13 diffs are about button defaults (borderRadius 10 vs 0, padding, minHeight) in hidden dialog content. Classified as irreducible.
- Task #10 (percentage borderRadius fix) in progress by layout-fixer — will need re-QA when complete
- Note: SwiftUI List scroll-on-tap behavior makes precise fixture navigation difficult through automation tools. Successfully navigated to textarea-select and dialog-element for visual audit.

---
### 2026-02-20 session (continued — table-semantic and background-layers audits)
- Score now: 65/98 passed (fixture count grew to 98)
- Audited 2 more fixtures:
  - table-semantic (32 diffs): NEAR-PASS — Both tables render correctly. Table 1 "Student Grades" has caption, gray header row (Name/Subject/Grade), 3 data rows (Alice/Math/A, Bob/Science/B+, Carol/English/A-) with alternating bg. Table 2 has dark header (Item/Price white text), data rows (Widget/$10, Gadget/$25), and tfoot (Total/$35 bold). Diffs are th column width distribution differences (12-20px width diffs, cascading x-position diffs). Column widths differ between web and native but content is correct.
  - background-layers (32 diffs): NEAR-PASS — Nested backgrounds (dark teal/navy/blue/purple with "Deep" white text) render identically. Alternating rows, color grid, alert card, tinted status cards all present. Diffs are 3-5px y-offset per section accumulating to 21px total from paragraph default margins.
- Total audited: 79/98 (52 pass, 14 near-pass, 3 fail, 11 remaining high-diff original + ~16 new fixtures unaudited)

---
### 2026-02-20 session (continued — run 29, 111 fixtures)
- Score now: 79/111 passed (fixture count grew to 111)
- Major improvements from margin:0 fix and fixer work:
  - fixed-height-column: 50 -> 0 (now passing)
  - negative-margin: 9 -> 0 (now passing)
  - border-width-zero: 23 -> 0 (now passing)
  - overflow-radius: 44 -> 1 diff
  - align-baseline: 55 -> 5 diffs
  - text-align-inherit: 49 -> 17 diffs
  - nested-inline-text: 46 -> 13 diffs
  - max-width-text: 43 -> 21 diffs
  - color-inherit: 60 -> 27 diffs
- New passing fixtures from layout-builder: flex-gap-border, display-flex-none, opacity-nested, flex-reverse-gap, flex-align-content-wrap, nested-flex-grow, absolute-with-padding, flex-stretch-height, flex-wrap-gap-sizes, overflow-hidden-nested, flex-justify-content-column, flex-grow-shrink-combo
- New failing fixtures: border-uniform-vs-sides (15), nested-absolute (15), min-width-in-flex (5), position-relative-in-flex (2)
- Visual audits performed (7 new fixtures):
  - opacity-nested: PASS — all opacity layers and nested containers match web
  - flex-stretch-height: PASS — stretch alignment correctly fills tallest item
  - nested-flex-grow: PASS — complex nested flex-grow proportions match web
  - absolute-with-padding: PASS — absolute positioning within padded containers correct
  - flex-reverse-gap: PASS — reversed flex with gaps matches web
  - border-uniform-vs-sides: NEAR-PASS — all borders render correctly, 15 diffs are 3-4px cascading y/height
  - min-width-in-flex: NEAR-PASS — minWidth:0 not fully respected in native (45px width diff), otherwise correct
  - position-relative-in-flex: NEAR-PASS — minor 5px y-offset in wrapping flex section
  - list-with-actions: NEAR-PASS — all list item patterns render correctly, diffs from paragraph margin accumulation
- Total audited: 100/111 (68 pass, 21 near-pass, 4 fail, 11 unaudited)
