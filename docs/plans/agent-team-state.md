# Agent Team State

**Last updated**: 2026-02-21T14:10

## Metrics
- Fixtures: 127 total, 106 passing, 21 failing
- Pass rate: 83.5%
- Session gains: +8 (from 98)

## Newly Passing This Session
- align-baseline (textBaselineFunc)
- hr-standalone (borderBottomWidth)
- blockquote-figure (margin collapse + LayoutExtractor)
- address-element (margin collapse + LayoutExtractor)
- text-align-inherit (margin collapse + LayoutExtractor)
- card-layout (LayoutExtractor margin reading)
- sidebar-content (margin collapse)
- list-with-actions (margin collapse)

## Near-Pass (1 diff)
- color-inherit (1 diff) — width diff on span
- stacked-sections (1 diff) — tiny text rounding

## Remaining Failures
| Fixture | Diffs | Category |
|---------|-------|----------|
| button-styles | 54 | unsupported element |
| form-grid | 41 | unsupported element |
| input-varieties | 38 | unsupported element |
| padding-only-sizing | 37 | investigate |
| table-semantic | 32 | unsupported element |
| align-self-all-values | 28 | investigate |
| textarea-select | 26 | unsupported element |
| margin-padding-combos | 25 | investigate |
| self-sizing-text | 23 | text measurement |
| max-width-text | 21 | text measurement |
| inline-text-extras | 19 | text measurement |
| holy-grail-layout | 17 | margin collapse partial |
| nested-absolute | 15 | Yoga limitation |
| border-uniform-vs-sides | 15 | investigate |
| background-layers | 15 | investigate |
| nested-inline-text | 13 | text measurement |
| text-in-flex | 8 | investigate |
| overflow-scroll-flex | 7 | CSS strut |
| min-width-in-flex | 5 | Yoga limitation |
| color-inherit | 1 | near-pass |
| stacked-sections | 1 | near-pass |

## Pipeline Status
- Layout: Fixer delivering strong results, continuing with remaining failures

## Agent Status
| Role | Actual Name | Status | Current Task |
|------|-------------|--------|-------------|
| layout-builder | layout-builder-3 | idle | waiting |
| layout-qa | layout-qa-3 | idle | audits complete |
| layout-fixer | layout-fixer-4 | working | next assignment |
| layout-fixer (old) | layout-fixer-3 | zombie | color-inherit fix delivered |
| reviewer | reviewer-3 | idle | waiting |
