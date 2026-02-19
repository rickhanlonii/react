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
