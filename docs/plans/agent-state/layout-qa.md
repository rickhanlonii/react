# Layout QA — Current State

**Status**: COMPLETE — all 100 passing fixtures visually audited
**Blocked on**: Awaiting rebuild after fixer completes address-element and blockquote-figure fixes

## Latest Results (127 fixtures)
- Passing: 100/127 (79%)
- Failing: 27 fixtures
- Visual audits completed: 100/100 passing fixtures

## Visual-only failures (not caught by automated diff)
- list-basic: no bullet/number markers
- nested-lists: no bullet/number markers
- details-summary: no disclosure triangle markers
- text-decoration-transform: text truncation with text-transform/letter-spacing
- pre-element: whitespace/newline handling differs
- border-style-variations: dashed/dotted borders render as solid
- article-content: `<a>` underline (minor)
- form-basic: placeholder color (minor)

## Known unfixable (Yoga core limitations)
- min-width-in-flex (#38): 5 diffs — Yoga limitation
- nested-absolute (#39): 15 diffs — Yoga limitation

## Next
- Awaiting rebuild after fixer completes address-element + blockquote-figure
- Re-run tests and audit any newly passing fixtures
