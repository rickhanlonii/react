# Layout Builder State

## Completed

### Fixture Batch 1 (5 fixtures)

Surveyed existing coverage (10 fixtures) and identified gaps. Created 5 new fixtures:

1. **text-inline** — Inline text styling: `<b>`, `<i>`, `<u>`, `<strong>`, `<em>`, `<s>`, `<code>` inside `<p>` elements
2. **list-basic** — Unordered (`<ul>`) and ordered (`<ol>`) lists with `<li>` children
3. **position-absolute** — Absolute positioning with `top`/`left`/`right`/`bottom` offsets inside a relative container
4. **flex-wrap** — Flex row with `flexWrap: 'wrap'` and `gap`, items wrapping to next line
5. **flex-grow** — `flexGrow` distribution (1:2:1 ratio, and fixed+grow combo)

### Fixture Batch 2 (4 fixtures)

Created 4 fixtures covering semantic, table, form, and article elements:

1. **semantic-layout** — Full page skeleton: `<header>`, `<nav>`, `<main>`, `<section>`, `<aside>`, `<footer>` with nested text content
2. **table-basic** — Table with `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` (3 columns, 3 data rows, alternating row color)
3. **form-basic** — Form with `<label>`, `<input>`, and `<button>` elements in vertical layout with flex row for buttons
4. **article-content** — Article with `<h1>`, `<p>`, `<blockquote>`, `<code>`, `<hr>`, and `<a>` link

All registered in `tests/e2e/fixtures/index.js`.

## Coverage Matrix

| Category | Covered | Remaining Gaps |
|----------|---------|----------------|
| div basics | div-basic, div-nested | - |
| text | p-text, headings, text-inline, article-content | color/fontSize overrides |
| semantic | semantic-layout, article-content | details/summary, dialog |
| flex direction | flex-row, flex-layout | column-reverse, row-reverse |
| flex alignment | flex-align | align-self, space-around, space-evenly |
| flex sizing | flex-grow | flex-shrink, flex-basis |
| flex wrap | flex-wrap | wrap-reverse |
| box model | box-model | margin-auto |
| border | border-basic, border-padding | border-radius, border-color per-side |
| position | position-absolute | relative with offsets |
| lists | list-basic | nested lists, dl/dt/dd |
| tables | table-basic | colspan/rowspan, caption |
| forms | form-basic | textarea, select, fieldset/legend |
| inline elements | text-inline, article-content | mark, small, sub/sup |
| overflow | - | overflow hidden/scroll |
| display | - | display none, inline-block |
| blockquote/hr | article-content | pre |

---

### 2026-02-18 — Session end (waiting for fixes)

**Status:** Blocked — waiting for 6 failing fixtures to be fixed by layout-fixer and verified by layout-qa before writing new fixtures.

**Known failing fixtures (pending fix/QA):**
- list-basic — missing list markers (bullets/numbers)
- border-basic — individual border-side widths not rendering
- border-padding — individual border-side widths not rendering
- Plus 3 additional fixtures identified by the team lead as failing

**Next targets for Batch 3 (in priority order):**
1. **overflow** — `overflow: 'hidden'` and `overflow: 'scroll'` (completely uncovered)
2. **display** — `display: 'none'`, inline-block behavior (completely uncovered)
3. **flex-shrink** — flex shrink ratios, flex-basis values (gap in flex sizing)
4. **margin-auto** — centering with `margin: 'auto'` (gap in box model)
5. **border-radius** — rounded corners, per-side border-color (gap in borders)
6. **text-style-overrides** — color/fontSize overrides on text elements (gap in text)

**Total fixtures written:** 9 (batches 1+2), all registered in index.js
**Total fixtures in project:** 19 (10 pre-existing + 9 new)

---

### 2026-02-18 — Batch 3 (6 fixtures)

Created 6 new fixtures covering previously uncovered style properties:

1. **overflow-hidden** — overflow: hidden clipping vs visible (default); child larger than parent, text clipping
2. **flex-shrink** — flex shrink ratios (equal, 0, 1:3), flexBasis with flexGrow
3. **margin-auto** — margin auto centering (horizontal, right-align, left-align, flex vertical/horizontal)
4. **text-style-overrides** — fontSize, color, fontWeight, textAlign overrides on p and h2
5. **border-radius** — uniform, per-corner, circle, pill, with border
6. **opacity** — opacity 1, 0.5, 0.2, 0 (invisible), and on containers with children

All registered in `tests/e2e/fixtures/index.js`. QA tasks created: #52-#58.
Sent to layout-qa-3 for testing.

**Coverage update:**
- overflow: NOW COVERED (overflow-hidden)
- flex sizing: NOW COVERED (flex-shrink adds to flex-grow)
- box model: NOW COVERED (margin-auto adds to box-model)
- text: NOW COVERED (text-style-overrides fills color/fontSize gap)
- border: PARTIALLY COVERED (border-radius added; per-side color still uncovered)
- opacity: NOW COVERED (new category)

**Remaining gaps for Batch 4:**
1. display none — hiding elements with display: 'none'
2. flex direction reverse — column-reverse, row-reverse
3. flex alignment extras — align-self, space-around, space-evenly
4. nested lists — ul inside li, ol inside li
5. relative position with offsets
6. per-side border color
7. min/max width/height constraints

**Batch 3 QA results (from layout-qa-3):**
- PASS: flex-shrink (0 diffs), opacity (0 diffs)
- FAIL: overflow-hidden (1 diff, minor text height), margin-auto (11 diffs, 'auto' not handled), text-style-overrides (15 diffs, p margins not em-relative), border-radius (9 diffs, per-corner props not applied)
- Fix tasks created: #63 (margin-auto), #64 (border-radius per-corner), #65 (overflow-hidden minor), #66 (text-style-overrides p margins)

**Status:** Paused — waiting for fixer to catch up on pending fix tasks before writing Batch 4.

**Total fixtures written:** 15 (batches 1+2+3), all registered in index.js
**Total fixtures in project:** 25 (10 pre-existing + 15 new)

---

### 2026-02-18 — Batch 4 (4 fixtures)

Batch 3 fixes all completed (#63-#66). Proceeded with Batch 4 covering 4 previously uncovered categories:

1. **display-none** — display: 'none' hides elements and removes from layout flow; tests hidden between visible, hidden in flex row, hidden container with children
2. **flex-direction-reverse** — row-reverse and column-reverse flex directions; tests item ordering, with flexGrow, with gap
3. **flex-align-extras** — space-around, space-evenly justifyContent, alignSelf overrides (center, flex-end, stretch) in row and column
4. **min-max-size** — minWidth, maxWidth, minHeight, maxHeight constraints; alone, together, with flexGrow, maxHeight+overflow

All registered in `tests/e2e/fixtures/index.js`. QA tasks created: #71-#74.
Sent to layout-qa-4 for testing.

**Coverage update:**
- display: NOW COVERED (display-none)
- flex direction: NOW COVERED (flex-direction-reverse adds column-reverse, row-reverse)
- flex alignment: NOW COVERED (flex-align-extras adds space-around, space-evenly, alignSelf)
- min/max sizing: NOW COVERED (min-max-size, new category)

**Remaining gaps for Batch 5:**
1. nested lists — ul inside li, ol inside li
2. relative position with offsets
3. per-side border color
4. flex wrap-reverse
5. text-decoration, text-transform, line-height
6. z-index stacking order
7. gap (rowGap vs columnGap separately)

**Batch 4 QA results (from layout-qa-4):**
- PASS: flex-direction-reverse (0 diffs), flex-align-extras (0 diffs), min-max-size (0 diffs)
- FAIL: display-none (4 diffs, minor — child positioning inside hidden container, margin style reporting). Fix task: #79

**Status:** On standby — team lead instructed to wait for fix backlog to clear before writing Batch 5.

**Total fixtures written:** 19 (batches 1+2+3+4), all registered in index.js
**Total fixtures in project:** 29 (10 pre-existing + 19 new)

---

### 2026-02-19 — Batch 5 (6 fixtures)

Created 6 new fixtures covering remaining gaps from the coverage matrix:

1. **nested-lists** — Nested ul inside li, nested ol inside li, mixed (ol inside ul)
2. **relative-position** — position:relative with top/left offsets, negative offsets, relative not affecting sibling layout
3. **border-color-sides** — Per-side border colors (borderTopColor/Right/Bottom/Left), mixed uniform+override, thick per-side
4. **flex-wrap-reverse** — flexWrap: 'wrap-reverse' (items wrap upward), with alignItems
5. **z-index** — Z-index stacking order with overlapping absolute children, negative z-index
6. **gap-properties** — rowGap only, columnGap only, different rowGap/columnGap in wrapping row

All registered in `tests/e2e/fixtures/index.js`. QA tasks created: #92-#97.

**Coverage update:**
- lists: NOW FULLY COVERED (nested-lists adds nesting to list-basic)
- position: NOW FULLY COVERED (relative-position adds to position-absolute)
- border: NOW FULLY COVERED (border-color-sides fills per-side color gap)
- flex wrap: NOW FULLY COVERED (flex-wrap-reverse adds wrap-reverse)
- z-index: NOW COVERED (new category)
- gap: NOW COVERED (gap-properties tests rowGap/columnGap separately)

**Remaining gaps for Batch 6:**
1. text-decoration, text-transform, line-height
2. details/summary, dialog
3. textarea, select, fieldset/legend
4. mark, small, sub/sup
5. pre element
6. overflow scroll

**Total fixtures written:** 25 (batches 1-5), all registered in index.js
**Total fixtures in project:** 35 (10 pre-existing + 25 new)

---

### 2026-02-19 — Batch 6 (6 fixtures)

Created 6 new fixtures covering the remaining gaps from the coverage matrix:

1. **text-decoration-transform** — textDecorationLine (underline, line-through), textTransform (uppercase, lowercase, capitalize), lineHeight, letterSpacing, and combined styles
2. **pre-element** — `<pre>` with monospace font (Menlo), default margins, custom bg/colors, dark theme, overflow:hidden+maxHeight
3. **inline-text-extras** — `<mark>` (yellow highlight), `<small>` (smaller font), `<sub>` (subscript), `<sup>` (superscript), combinations, custom colors, nesting
4. **fieldset-legend** — `<fieldset>` with `<legend>`, custom borderColor, fieldset without legend, nested fieldsets
5. **overflow-scroll** — overflow:scroll vertical (content taller), horizontal (content wider), with text, with border, no-overflow case
6. **textarea-select** — `<textarea>` (basic, custom size, styled), `<select>` (basic, custom width), side-by-side in flex row, complete feedback form

All registered in `tests/e2e/fixtures/index.js`. QA tasks created: #109-#114.

**Coverage update:**
- text decoration/transform: NOW COVERED (text-decoration-transform)
- pre element: NOW COVERED (pre-element)
- inline extras: NOW COVERED (inline-text-extras covers mark, small, sub, sup)
- fieldset/legend: NOW COVERED (fieldset-legend)
- overflow scroll: NOW COVERED (overflow-scroll adds to overflow-hidden)
- textarea/select: NOW COVERED (textarea-select adds to form-basic)

**Updated Coverage Matrix:**

| Category | Covered | Remaining Gaps |
|----------|---------|----------------|
| div basics | div-basic, div-nested | - |
| text | p-text, headings, text-inline, article-content, text-style-overrides, text-decoration-transform | - |
| semantic | semantic-layout, article-content | details/summary, dialog |
| flex direction | flex-row, flex-layout, flex-direction-reverse | - |
| flex alignment | flex-align, flex-align-extras | - |
| flex sizing | flex-grow, flex-shrink | - |
| flex wrap | flex-wrap, flex-wrap-reverse | - |
| box model | box-model, margin-auto | - |
| border | border-basic, border-padding, border-radius, border-color-sides | - |
| position | position-absolute, relative-position | - |
| lists | list-basic, nested-lists | dl/dt/dd |
| tables | table-basic | colspan/rowspan, caption |
| forms | form-basic, fieldset-legend, textarea-select | - |
| inline elements | text-inline, article-content, inline-text-extras | - |
| overflow | overflow-hidden, overflow-scroll | - |
| display | display-none | - |
| blockquote/hr | article-content, pre-element | - |
| opacity | opacity | - |
| min/max sizing | min-max-size | - |
| z-index | z-index | - |
| gap | gap-properties | - |

**Total fixtures written:** 31 (batches 1-6), all registered in index.js
**Total fixtures in project:** 41 (10 pre-existing + 31 new)

---

### 2026-02-19 — Fixture 39: percentage-sizes
- Completed: Created `percentage-sizes` fixture testing percentage-based width, height, minWidth, maxWidth
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/percentage-sizes.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: width as % (100%, 50%, 25%), row split (33%/34%/33%), height as % inside explicit-height parent, nested percentages (50% of 50%), minWidth/maxWidth as %

---

### 2026-02-19 — Fixture 40: nested-flex-contexts
- Completed: Created `nested-flex-contexts` fixture testing nested flex containers
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/nested-flex-contexts.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: row-in-column, column-in-row, row-in-row, different justifyContent at each level (flex-start/center/flex-end in space-between parent), three-level nesting with flexGrow ratios

---

### 2026-02-19 — Batch 7 (4 fixtures)

Created 4 new fixtures in batch mode:

1. **absolute-in-flex** — position:absolute children inside flex containers: removed from flow, full overlay, four corners, absolute not affecting flex sizing
2. **card-layout** — Real-world card patterns: simple card (image+title+desc), action card with buttons, horizontal card (image left, content right), card grid (two side-by-side)
3. **padding-margin-shorthands** — Padding/margin shorthand + per-side overrides, nested padding accumulation, padding+border+content sizing, zero padding reset
4. **flex-basis-sizes** — flexBasis initial size, flexBasis+flexGrow from different bases, flexBasis 0 for equal distribution, flexBasis in column, flexBasis vs width precedence, flexBasis+flexShrink

Note: Originally planned aspect-ratio but YogaStyleApplier doesn't support aspectRatio yet. Originally planned paddingHorizontal/paddingVertical fixture but these are RN-only shorthands not valid in CSS (web comparison would fail). Rewrote to use standard CSS padding/margin shorthand + per-side overrides.

All 4 registered in `tests/e2e/fixtures/index.js`.

**Total fixtures written:** 44 (batches 1-7)
**Total fixtures in project:** 54

---

### 2026-02-19 — Batch 8 (4 fixtures)

Created 4 new fixtures:

1. **holy-grail-layout** — Classic holy grail pattern: header, left sidebar (nav links), main content (grows), right sidebar (aside), footer. Tests flexGrow in row with fixed-width sidebars.
2. **text-in-flex** — Text elements inside flex containers: text-sized flex items, flexGrow text items, text alignment in flex column, mixed font sizes with alignItems:center, text wrapping in constrained flex child, heading+paragraph in bordered container.
3. **flex-shorthand** — The `flex` property shorthand: equal distribution (flex:1), proportional (1:2:1), flex:0 with fixed width, column direction, flex:1 with padding, mixed fixed+flex.
4. **stacked-sections** — Real-world stacked page: hero section with centered title, three-column feature row with icon circles, content section with heading+paragraph+placeholder, CTA section with button, footer.

Note: Checked alignContent and borderStyle — neither supported in YogaStyleApplier, so skipped.

All 4 registered in `tests/e2e/fixtures/index.js`.

**Total fixtures written:** 48 (batches 1-8)
**Total fixtures in project:** 58

---

### 2026-02-19 — Batch 9 (5 fixtures)

Created 5 new fixtures focusing on real-world patterns and property interactions:

1. **sidebar-content** — Two-column app layout: top bar, sidebar with nav items + borderRight separator, content area with heading+stats row+placeholder, sidebar fixed width with content flexGrow.
2. **form-grid** — Registration form: two-column flex rows (first/last name, city/zip with 2:1 ratio), full-width email row, right-aligned button row (cancel + submit). Tests label+input pairs in flex grid.
3. **list-with-actions** — List items with avatar circles, text (title+subtitle) in flex:1, action buttons on right. One item has two action buttons in nested flex row. Last item has badge circle with count.
4. **nested-borders** — Nested elements with borders at each level (3 levels), different border widths per level, border+borderRadius nesting, borders in flex row children, per-side borders nested (top/bottom outer, left/right inner).
5. **mixed-position** — Combining relative+absolute: relative parent with absolute child, relative with offset + absolute child, overlapping absolute children (staggered), relative children in flex row with offsets, absolute inside relative inside relative (3 levels).

All 5 registered in `tests/e2e/fixtures/index.js`.

**Total fixtures written:** 53 (batches 1-9)
**Total fixtures in project:** 63

---

### 2026-02-19 — Batch 10 (5 fixtures)

Created 5 new fixtures focusing on edge cases and property interactions:

1. **overflow-with-absolute** — overflow:hidden clipping absolute children that extend beyond parent, overflow:visible comparison, overflow:hidden on flex container, overflow:hidden+borderRadius for rounded clipping.
2. **flex-auto-margins** — margin auto inside flex containers: marginLeft:auto pushes right, marginRight:auto pushes left, both auto centers, marginTop:auto pushes to bottom in column, header+spacer+footer pattern.
3. **input-varieties** — Input styling patterns: basic bordered, thick border, background-only, inline label+input in flex row, side-by-side inputs (1:2 ratio), input+button combo with shared border radius.
4. **background-layers** — Nested backgrounds creating depth (dark theme 4 levels), alternating light/dark rows, color grid (4x2 with percentage widths + wrap), card with colored header, tinted status cards (info/success/warning/error).
5. **wrap-with-sizes** — Flex wrap with varying widths that wrap naturally, varying heights in wrap row, wrap with flexGrow+minWidth items, tag/chip wrap pattern (pill-shaped labels).

All 5 registered in `tests/e2e/fixtures/index.js`.

**Total fixtures written:** 58 (batches 1-10)
**Total fixtures in project:** 68

---

### 2026-02-19 — Batch 11 (5 fixtures)

Created 5 new fixtures focusing on edge cases and thorough property coverage:

1. **zero-size-items** — Zero-width/height items in flex: gap still applies, zero-size with border (border visible), zero-size with padding (padding creates size), zero-width items with flexGrow (grow from 0).
2. **large-gap-values** — Large gap in row (items squeezed), large gap in column, gap+padding combined, asymmetric rowGap/columnGap in wrapping containers.
3. **flex-row-height** — Cross-axis height behavior: stretch (default), flex-start, flex-end, center alignments with different-height children, alignSelf overrides within flex-start container.
4. **absolute-sizing** — Absolute positioning where top+bottom defines height, left+right defines width, all four edges with insets, accent stripe pattern, positioned from right/bottom edges.
5. **button-styles** — Button element patterns: primary (full-width), outline, small/medium/large sizes, pill-shaped, vertical button group, icon+text combo buttons.

All 5 registered in `tests/e2e/fixtures/index.js`.

**Total fixtures written:** 63 (batches 1-11)
**Total fixtures in project:** 73

---

### 2026-02-20 — Fixture 64: align-content
- Completed: Created `align-content` fixture testing alignContent in wrapped flex containers
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/align-content.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: alignContent with all 6 values (flex-start, flex-end, center, space-between, space-around, stretch) in flex-wrap row containers with fixed height (200) and 5 colored boxes that wrap to 2 lines
- Note: Fixture was later removed from index.js due to issues; align-content support was added to YogaStyleApplier separately

---

### 2026-02-20 — Fixture 65: align-baseline
- Completed: Created `align-baseline` fixture testing alignItems:baseline in flex rows
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/align-baseline.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: baseline alignment with different font sizes, different padding, flex-start comparison, mixed elements (h3/p/nested), different-height containers with text
- All containers use display:'flex' and width:374 per team conventions

---

### 2026-02-20 — Fixture 66: max-width-text
- Completed: Created `max-width-text` fixture testing maxWidth constraining text wrapping
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/max-width-text.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: maxWidth on container (text wraps), maxWidth on paragraph directly, maxWidth in flex row (capped + grow), maxWidth + overflow:hidden, minWidth + maxWidth on flex items

---

### 2026-02-20 — Fixture 67: nested-inline-text
- Completed: Created `nested-inline-text` fixture testing span elements inside p
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/nested-inline-text.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: span with color, multiple styled spans, nested spans, span with backgroundColor, different fontSize spans, span overriding parent styles, mixed inline elements (b/span/i), wrapping text with styled spans

---

### 2026-02-20 — Fixture 68: text-align-inherit
- Completed: Created `text-align-inherit` fixture testing textAlign inheritance from parent containers
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/text-align-inherit.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: default left, center on container, right on container, center with multiple children, child overriding parent textAlign, nested container inheritance, right with mixed text elements

---

### 2026-02-20 — Fixture 69: fixed-height-column
- Completed: Created `fixed-height-column` fixture testing flex column with explicit height
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/fixed-height-column.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: flexGrow ratios (1:2:1), fixed header/footer with grow middle, flexShrink ratios when overflowing, equal grow with gap, justifyContent space-between in column

---

### 2026-02-20 — Fixture 70: color-inherit
- Completed: Created `color-inherit` fixture testing color inheritance from parent containers
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/color-inherit.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: color on parent inherited by children, child override, nested containers with different colors, heading inheritance, inline span overrides, three nesting levels with color changes

---

### 2026-02-20 — Fixture 71: negative-margin
- Completed: Created `negative-margin` fixture testing negative margin values
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/negative-margin.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: negative marginTop overlap, negative marginLeft in flex row, negative margin expanding beyond padding, stacked overlapping cards, negative marginBottom, negative margin cancelling gap

---

### 2026-02-20 — Fixture 72: overflow-radius
- Completed: Created `overflow-radius` fixture testing overflow:hidden + borderRadius clipping
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/overflow-radius.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: rounded card clipping, circle avatars, pill shape, no-overflow comparison, per-corner radius clipping, border+radius+overflow combined

---

### 2026-02-20 — Fixture 73: border-width-zero
- Completed: Created `border-width-zero` fixture testing borderWidth: 0 edge cases
- Result: Sent to layout-qa for QA
- Files: created `tests/e2e/fixtures/border-width-zero.jsx`, updated `tests/e2e/fixtures/index.js`
- Tests: borderWidth 0 vs no border (identical layout), per-side zero (top/sides only, horizontal only), siblings with/without borders, flex children with mixed border presence (0/1/2), nested outer border with inner borderWidth 0
- Design: Avoided margin collapse and form controls to minimize irreducible diffs

---

### 2026-02-20 — Batch 12 (3 new fixtures + 1 re-registration)
- Completed: Wrote 3 new fixtures and re-registered align-content
- Result: Sent to layout-qa for QA
- Files: created self-sizing-text.jsx, line-height-variations.jsx, flex-column-width.jsx; re-registered align-content.jsx; updated index.js
- Fixtures:
  1. **self-sizing-text** — containers sized by text content (no explicit dims), stacked lines, mixed font sizes, text in flex row, text with padding+border, constrained width wrap, nested self-sizing
  2. **line-height-variations** — lineHeight tight/loose/mixed, different lineHeights in same container, same lineHeight with different fontSizes, lineHeight affecting flex row height
  3. **flex-column-width** — flex column child widths: stretch default, explicit widths, alignItems center/flex-end, mixed stretch+explicit, alignSelf overrides, percentage widths
  4. **align-content** (re-registered) — alignContent in wrapped flex containers with all 6 values
- Design: All use div instead of p for text content per team-lead guidance to avoid margin collapse false positives

---

### 2026-02-20 — Batch 13 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 12: line-height-variations PASS, flex-column-width PASS, align-content PASS. self-sizing-text 23 diffs (margin collapse), border-width-zero 23 diffs (margin collapse from p elements in earlier fixture).
- Files: created row-gap-column.jsx, nested-percentage.jsx, flex-grow-shrink-combo.jsx; updated index.js
- Fixtures:
  1. **row-gap-column** — rowGap in flex column: basic spacing, large gap, zero gap, columnGap (no effect in column), gap+padding, gap with flexGrow in fixed-height column
  2. **nested-percentage** — nested percentage widths/heights: 50% of 50%, 75% of 66%, three levels deep, percentage height, percentages in flex row, mirrored bars
  3. **flex-grow-shrink-combo** — combined flexGrow+flexShrink: ratios with basis, flexShrink 0, fixed+flexible, 1:3 shrink, column grow+shrink, grow from different bases with gap
- Design: All avoid p elements and form controls to prevent irreducible diffs

---

### 2026-02-20 — Batch 14 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 13: all 3 PASS (row-gap-column, nested-percentage, flex-grow-shrink-combo). Running total: 60 passing out of 89.
- Files: created margin-in-flex.jsx, border-radius-percentage.jsx, flex-wrap-align-items.jsx; updated index.js
- Fixtures:
  1. **margin-in-flex** — margins in flex containers (no collapse): horizontal/vertical, margin+gap, asymmetric, cross-axis margins
  2. **border-radius-percentage** — percentage borderRadius: 50% circle, ellipse, 25%, 10%, per-corner, with overflow:hidden, vs fixed
  3. **flex-wrap-align-items** — alignItems in wrapping flex rows: stretch, flex-start, center, flex-end, alignSelf overrides, equal-height wrap
- Design: All avoid p elements and form controls

---

### 2026-02-20 — Batch 15 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 14: margin-in-flex PASS, flex-wrap-align-items PASS, border-radius-percentage 48 diffs (percentage values not converting to pixels). Running total: 62 passing out of 92.
- Files: created padding-border-sizing.jsx, absolute-centering.jsx, flex-min-height.jsx; updated index.js
- Fixtures:
  1. **padding-border-sizing** — padding and border affecting element size: width+padding, width+border, combined, asymmetric padding/border, nested accumulation, flex children with different combos
  2. **absolute-centering** — centering with absolute position: equal insets, fill (all edges 0), overlay with opacity, corners+center, card with padding+border, horizontal centering
  3. **flex-min-height** — minHeight in flex: container minHeight, flexGrow filling remaining space, children with different minHeights, content exceeding minHeight, minHeight+maxHeight, nested flex columns
- Design: All avoid p elements, form controls, and percentage borderRadius

---

### 2026-02-20 — Batch 16 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 15: all 3 PASS (padding-border-sizing, absolute-centering, flex-min-height). Running total: 65 passing out of 95.
- Files: created display-flex-none.jsx, nested-absolute.jsx, flex-gap-border.jsx; updated index.js
- Fixtures:
  1. **display-flex-none** — display:none in flex: hidden container, hidden children in row/column, multiple hidden, all children hidden (collapse)
  2. **nested-absolute** — nested absolute positioning: abs-in-abs, three levels, skipping non-positioned parent, mirrored siblings, overflow:hidden clip
  3. **flex-gap-border** — gap with bordered flex items: gap+border, gap 0, column, different widths, mixed bordered/non-bordered, border+padding
- Design: All avoid p elements, form controls, and percentage borderRadius
- Note: Checked for flex order support — not in YogaStyleApplier, so skipped

---

### 2026-02-20 — Batch 17 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 16: display-flex-none PASS, flex-gap-border PASS, nested-absolute 15 diffs (y-position issues, may be real bug). Running total: 67 passing out of 98.
- Files: created opacity-nested.jsx, flex-reverse-gap.jsx, border-uniform-vs-sides.jsx; updated index.js
- Fixtures:
  1. **opacity-nested** — nested opacity: parent affects children, multiplication (0.5*0.5), side-by-side levels, with border, child opacity 1 inside parent 0.3, opacity 0
  2. **flex-reverse-gap** — gap with reverse: row-reverse+gap, vs normal comparison, column-reverse+gap, with flexGrow, column-reverse fixed height, row-reverse+wrap
  3. **border-uniform-vs-sides** — uniform vs per-side borders: same total, thick top, left accent, bottom divider, different widths, with radius, flex items with accents
- Design: All avoid p elements, form controls, and percentage borderRadius

---

### 2026-02-20 — Batch 18 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 17: opacity-nested PASS, flex-reverse-gap PASS, border-uniform-vs-sides 15 diffs (margin collapse from text). Running total: 69 passing out of 101.
- Files: created flex-align-content-wrap.jsx, position-relative-in-flex.jsx, nested-flex-grow.jsx; updated index.js
- Fixtures:
  1. **flex-align-content-wrap** — alignContent + alignItems combined in wrapping flex: center+start, space-between+center, flex-end+stretch, space-around+flex-end, stretch default
  2. **position-relative-in-flex** — relative position offsets on flex children: row, column, staggered, negative, with flexGrow, in wrapping flex
  3. **nested-flex-grow** — flexGrow at multiple nesting levels: row>column, three levels, fixed+grow, equal grow grid
- Design: All pure layout with no text, no p, no form controls, no percentage borderRadius

---

### 2026-02-20 — Batch 19 (3 new fixtures)
- Completed: Wrote 3 new fixtures
- Result: Sent to layout-qa for QA. QA results from batch 18: flex-align-content-wrap PASS, nested-flex-grow PASS, position-relative-in-flex 2 minor y diffs. Running total: 71 passing out of 104.
- Files: created flex-stretch-height.jsx, absolute-with-padding.jsx, flex-wrap-gap-sizes.jsx; updated index.js
- Fixtures:
  1. **flex-stretch-height** — cross-axis stretch: default (match tallest), with content, vs flex-start, column stretch, alignSelf:stretch, nested flex
  2. **absolute-with-padding** — absolute in padded parents: offset, top/left 0, fill, asymmetric padding, nested, corner badges
  3. **flex-wrap-gap-sizes** — flex wrap with gap and varying sizes: natural wrap, many small items, large gap, mixed heights, single-per-row, mixed row counts
- Design: All pure layout with no text, no p, no form controls

---

### 2026-02-20 — Fixture 98: min-width-in-flex
- Completed: Wrote min-width-in-flex fixture
- Result: Pending QA
- Files: created min-width-in-flex.jsx; updated index.js
- Fixture: **min-width-in-flex** — minWidth in flex containers: prevents shrinking, all children with minWidth+shrink, minWidth > flexBasis, with flexGrow ratios, cross-axis in column, minWidth:0 allowing full shrink, nested flex with minWidth at different levels

---

### 2026-02-20 — Fixture 99: overflow-hidden-nested
- Completed: Wrote overflow-hidden-nested fixture
- Result: Pending QA
- Files: created overflow-hidden-nested.jsx; updated index.js
- Fixture: **overflow-hidden-nested** — nested overflow:hidden clipping: grandchild clipped by outer, both levels clip independently, inner only clips, three levels deep, flex container with overflowing children, nested with borderRadius at different levels

---

### 2026-02-20 — Fixture 100: flex-justify-content-column
- Completed: Wrote flex-justify-content-column fixture
- Result: Pending QA
- Files: created flex-justify-content-column.jsx; updated index.js
- Fixture: **flex-justify-content-column** — all justifyContent values in flex column: flex-start, flex-end, center, space-between, space-around, space-evenly

---

### 2026-02-20 — Fixture 101: max-height-in-flex
- Completed: Wrote max-height-in-flex fixture
- Result: Pending QA
- Files: created max-height-in-flex.jsx; updated index.js
- Fixture: **max-height-in-flex** — maxHeight in flex: container limit with overflow, cross-axis in row, main-axis in column, flexGrow capped by maxHeight, minHeight+maxHeight combo, nested flex containers

---

### 2026-02-20 — Fixture 102: border-radius-with-content
- Completed: Wrote border-radius-with-content fixture
- Result: Pending QA
- Files: created border-radius-with-content.jsx; updated index.js
- Fixture: **border-radius-with-content** — borderRadius with content inside: padded children, border+content, circle with overflow clip, per-corner with flex row, nested radius levels, pill shape with flex content, card pattern with rounded top

---

### 2026-02-20 — Fixtures 103-104: width-height-auto, margin-collapse-block
- Completed: Wrote 2 fixtures completing batch of 3
- Result: Pending QA
- Files: created width-height-auto.jsx, margin-collapse-block.jsx; updated index.js
- Fixtures:
  1. **width-height-auto** — auto sizing: block stretch to parent, content height, auto in flex row/column, mixed explicit+auto, maxWidth constraint, nested auto sizing
  2. **margin-collapse-block** — margin behavior between block siblings: adjacent vertical margins, different sizes, three siblings, parent-child margin, flex column (no collapse), gap vs margins comparison

---

### 2026-02-20 — Fixtures 105-107: aspect-ratio-in-flex, border-style-variations, absolute-z-index-stacking
- Completed: Wrote 3 new fixtures
- Result: Pending QA
- Files: created aspect-ratio-in-flex.jsx, border-style-variations.jsx, absolute-z-index-stacking.jsx; updated index.js
- Fixtures:
  1. **aspect-ratio-in-flex** — aspectRatio: fixed width, square, in flex row with different ratios, with flexGrow, in column, maxHeight constraint, with content
  2. **border-style-variations** — border styles: solid thin/thick, per-side widths+colors, with padding, with radius, in flex row, top-only separator, nested 3 levels
  3. **absolute-z-index-stacking** — z-index with absolute: ascending, descending, same z-index document order, z-index 0 vs none, negative z-index, multiple layers

---

### 2026-02-20 — Fixtures 108-110: align-self-all-values, padding-only-sizing, overflow-scroll-flex
- Completed: Wrote 3 new fixtures
- Result: Pending QA
- Files: created align-self-all-values.jsx, padding-only-sizing.jsx, overflow-scroll-flex.jsx; updated index.js
- Fixtures:
  1. **align-self-all-values** — all alignSelf values (auto, flex-start, flex-end, center, stretch) in row and column directions, override parent alignItems, stretch with explicit height
  2. **padding-only-sizing** — elements sized purely by padding: uniform, per-side, empty boxes, with border, nested accumulation, in flex row, horizontal-only, vertical-only
  3. **overflow-scroll-flex** — overflow scroll in flex contexts: vertical scroll column, horizontal scroll row with flexShrink:0, scroll with flexGrow children, scroll inside flex item, nested scroll containers
