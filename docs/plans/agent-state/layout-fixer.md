# Layout Fixer State

## Bugs Fixed
- `list-basic` / `fontSize`: ul/ol/li missing fontSize:16 in ElementDefaults -> added fontSize:16 to listDefaults and liDefaults (ElementDefaults.swift:382,390)
- `renderer.test.js` / test infrastructure: fixed pre-existing test failures — added missing $$setInstanceHandle mock, added jest.useFakeTimers to hydrateRoot tests to prevent async scheduler leaks, added root.unmount() cleanup
- `position-absolute` / computed position offsets: LayoutExtractor only reported explicitly-set position values, not CSS-computed opposites -> added computed offset calculation for positioned elements (LayoutExtractor.swift)

## Currently Working On
- `flex-grow` fix — 2 attempts failed, both reverted (see below)
- `text-inline` — not yet started (28 diffs)

## Current File State
- `YogaStyleApplier.swift`: REVERTED to original (display:block -> YGNodeStyleSetDisplay .block)
- `ElementDefaults.swift`: REVERTED to original (blockDefaults has display:"block")
- `ElementDefaultsTests.swift`: REVERTED to original (all tests check display:"block")
- `YogaStyleApplierTests.swift`: HAS CHANGES — testFlexGrowDistribution expects correct 93.5/187/93.5 distribution (WILL FAIL with current display:block behavior, needs updating to document the bug). Also added testBlockDefaultsStackVerticallyAndStretch (passes).

## Attempts for flex-grow

### Attempt 1: Change blockDefaults (REJECTED)
Changed `blockDefaults` from `["display": "block", "fontSize": 16]` to `["flexDirection": "column", "fontSize": 16]` in ElementDefaults.swift. Updated all tests.

**Result**: 0/19 passing. Native reports `flexDirection: "column"` in style dict but web getComputedStyle reports "row" for non-flex elements, creating diffs on every block element.

**Status**: Fully reverted.

### Attempt 2: YogaStyleApplier global override (REJECTED)
In YogaStyleApplier.swift, when encountering display:"block", set flexDirection:column on Yoga node instead of display:block. Style dict still says "block" for e2e comparison.

**Result**: 10/19 passing (down from 13/19). Broke margin collapsing for p-text, headings, list-basic, box-model. Yoga's calculateBlockLayout() collapses margins; flex-column does NOT.

**Status**: Reverted.

## Root Cause Analysis

Yoga's `calculateBlockLayout()` (CalculateLayout.cpp:1736-1752) does two things that flex-column layout does not:
1. **Margin collapsing** between adjacent block children (needed for headings, paragraphs, lists)
2. **Ignores flexGrow** on children (the bug we're trying to fix)

CSS handles this by overriding display:block with flex formatting context when an element is a direct child of a flex container. Yoga does NOT do this — it always uses the child's own display mode.

A global replacement of display:block breaks margin collapsing (point 1). The fix must be **targeted**.

## Recommended Next Approach

**Insertion-time override** (approach #1 from team lead): When a child is inserted into a parent via `$$appendChild` or `ShadowTreeBuilder.appendChild`, check if the parent is a flex container (has display:flex or display:inline-flex). If so, and the child has `display: block` from defaults (not user-specified), override the child's Yoga display from block to flex and set flexDirection:column. This preserves margin collapsing for block-in-block contexts while fixing flexGrow in flex contexts.

Key code locations:
- `Bindings.swift:464` — `$$appendChild` (reconciler path)
- `ShadowTreeBuilder.swift:269` — `appendChild` (SSR path)
- Both call `YGNodeInsertChild` — add display override logic before/after this call
- Need to differentiate default vs user display — could check if the user style dict has display set, or track it as a flag on ShadowNodeWrapper

Alternative simpler approach: Only skip display:block in YogaStyleApplier when `flexGrow > 0` is also in the style. This is less correct (doesn't fix all cases) but much simpler and likely sufficient for the flex-grow fixture.

## blockDefaults affects
div, main, section, article, nav, header, footer, aside, form, details, search, figcaption, table/thead/tbody/tfoot, picture, hgroup, center, optgroup, dt, and unknown elements
