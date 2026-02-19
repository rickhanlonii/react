# Agent Team State

**Status**: Paused (session ended)
**Last updated**: 2026-02-18 (session 2 end)

## Metrics

- Fixtures: 19 total (10 original + 9 new from layout-builder)
- Passing: 13/19
- Failing: 6 (text-inline, article-content, semantic-layout, flex-grow, table-basic, form-basic)
- Demo pipeline: paused (user working on demo manually)
- Bugs fixed: 3 (list-basic fontSize, renderer.test.js infrastructure, position-absolute computed offsets)

## Layout Pipeline

6 fixtures failing. Layout-fixer needs to fix these before layout-builder writes more.

### Failing Fixtures Summary

1. **flex-grow** (8 diffs) — flex-grow proportions incorrect (1:2:1 ratio not distributed correctly; fixed+grow combo off by 8px)
2. **text-inline** (28 diffs) — inline elements (strong, em, s) rendering as block instead of inline; b/i/u missing fontSize; code display inline-block instead of inline
3. **article-content** (27 diffs) — strong/em as block; blockquote/hr/a missing fontSize; code fontSize/display wrong; link color #007AFF vs rgb(0,0,0)
4. **semantic-layout** (18 diffs) — span display inline-block vs block; span missing fontSize; cascading y-position errors from height diff
5. **form-basic** (49 diffs) — label display inline-block vs inline; input/button fontSize/height/padding diffs; button display/alignment/color diffs
6. **table-basic** (57 diffs) — table/thead/tbody/td/th display block vs table-*; column widths equal instead of content-proportional; fontSize missing on tr/td/th

### Previously Fixed
- list-basic: fontSize added to ul/ol/li defaults
- position-absolute: computed offset calculation in LayoutExtractor
- renderer.test.js: mock + timer + cleanup fixes

## Demo Pipeline

Paused — user is working on demo features manually.

## Next Actions

- **Layout Fixer**: Revert YogaStyleApplier attempt 2 changes, find targeted fix for flex-grow (only override display:block for nodes with flexGrow > 0). Then move to text-inline.
- Layout Builder: Wait until failures drop below threshold
- Layout QA: Re-test after each fix
- Reviewer: Review fixes as they come in

## Session 2 Notes

- flex-grow fix attempted twice, both failed:
  - Attempt 1: Changed blockDefaults display:block → flexDirection:column → 0/19 (flexDirection diffs everywhere)
  - Attempt 2: YogaStyleApplier converts display:block → flex-column at Yoga level → 10/19 (lost margin collapsing)
- Core tension: Yoga block layout gives margin collapsing but ignores flexGrow; flex-column gives flexGrow but loses margin collapsing
- Need targeted approach that only overrides for flex children with flexGrow
- Visual bugs found by QA: missing list markers (list-basic), missing per-side borders (border-basic/border-padding)
- **YogaStyleApplier.swift may still have attempt 2 changes that need reverting**
