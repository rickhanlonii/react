# Layout QA State

## Last Full Run
- Date: 2026-02-18 (third run, 19 fixtures)
- Passed: 13/19 (automated diff baseline)
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
- `position-absolute`: PASS (5 elements) — fixed this session
- `text-inline`: FAIL (11 elements, 28 diffs — inline elements render as block)
- `flex-grow`: FAIL (8 elements, 8 diffs — incorrect flex-grow width distribution; fix in progress but may be regressing)
- `semantic-layout`: FAIL (15 elements, 18 diffs — span display mismatch, height cascading)
- `table-basic`: FAIL (20 elements, 57+ diffs — table display model not supported)
- `form-basic`: FAIL (11 elements, 51 diffs — input/button sizing defaults)
- `article-content`: FAIL (13 elements, 27 diffs — inline-as-block, anchor color)

## Visual Issues Found (not caught by automated diff)
1. **list-basic** — missing list markers. Web shows bullet points for `<ul>` and numbers (1. 2. 3.) for `<ol>`. Native shows text at correct positions but no bullets or numbers. Task #41.
2. **border-basic** and **border-padding** — individual border-side widths not rendering. When using shorthand `borderWidth`, borders render fine. When using `borderTopWidth`, `borderBottomWidth`, `borderLeftWidth`, `borderRightWidth` individually (without shorthand), no border renders on native. Task #42.

## Outstanding Fix Tasks
- ~~Task #1: Fix layout: list-basic fontSize — FIXED, verified PASS~~
- ~~Task #35: Fix layout: position-absolute — FIXED, verified PASS~~
- Task #3: Fix layout: flex-grow — 8 diffs (fix in progress, may be regressing)
- Task #4: Fix layout: text-inline — 28 diffs
- Task #5: Fix layout: semantic-layout — 18 diffs [blocked by #4]
- Task #6: Fix layout: article-content — 27 diffs [blocked by #4]
- Task #7: Fix layout: table-basic — 57 diffs
- Task #8: Fix layout: form-basic — 49 diffs
- Task #41: Fix layout: list-basic — visual: missing list markers (bullets/numbers)
- Task #42: Fix layout: border-basic, border-padding — visual: per-side border widths not rendering

## Notes
- 13 of 19 fixtures pass automated diff. 3 of those have visual issues (list-basic, border-basic, border-padding).
- position-absolute was fixed this session (task #35) and verified passing.
- flex-grow fix is in progress but team lead noted it may be regressing — needs re-QA after fix lands.
- text-inline and article-content share the same root cause: inline elements (strong, em, s) rendering as display:block instead of display:inline. Tasks #5 and #6 are blocked by #4.
- table-basic may be a fundamental gap — CSS table layout algorithm is not implemented in Yoga.
- form-basic has many small sizing diffs in input/button defaults.
- border visual issue root cause: UIKitMutationApplier.swift likely only applies border when shorthand `borderWidth` is set, ignoring individual side properties.

---
### Session log: 2026-02-18 (third run — post position-absolute fix)
- Ran all fixtures: 13/19 passing (up from 12/19)
- `position-absolute` now PASSES (was 8 diffs, fix in task #35 worked)
- Visual review of all 13 passing fixtures:
  - `div-basic`: PASS visual
  - `div-nested`: PASS visual
  - `p-text`: PASS visual
  - `headings`: PASS visual
  - `flex-row`: PASS visual
  - `flex-align`: not individually screenshotted (covered previously)
  - `flex-layout`: not individually screenshotted (covered previously)
  - `box-model`: PASS visual
  - `border-basic`: PASS automated, FAIL visual — second box missing border (individual border-side widths not rendering)
  - `border-padding`: PASS automated, FAIL visual — second box missing border (same issue as border-basic)
  - `flex-wrap`: PASS visual
  - `position-absolute`: PASS visual (fix verified)
  - `list-basic`: PASS automated, FAIL visual — missing list markers (bullets for ul, numbers for ol)
- Created task #41: Fix layout: list-basic — visual issue: missing list markers
- Created task #42: Fix layout: border-basic, border-padding — visual issue: individual border-side widths not rendering
