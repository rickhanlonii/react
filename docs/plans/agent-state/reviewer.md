# Reviewer State

## Session Summary (2026-02-18)

### Reviews Completed
- **Task #34 — APPROVED**: Add fontSize 16 to ul/ol/li element defaults. Correct CSS default, consistent with existing patterns.
- **Task #36 — APPROVED**: Compute missing position offsets in LayoutExtractor. Test infrastructure fix only, math verified correct.
- **Task #43 — REJECTED**: Replace display:block with flexDirection:column in blockDefaults. Core insight correct but fix applied inconsistently — only blockDefaults changed while 19 other element defaults still use `display: "block"`. Created Task #44 for revision.

### In Progress / Pending
- **Task #44** (created by reviewer): Revision needed for blockDefaults fix. Fixer must apply `display:block` removal consistently across all 19+ element defaults, or verify with Yoga tests that `display: block` + explicit `flexDirection` doesn't trigger block layout path.

## Review Decisions
- #34: APPROVED
- #36: APPROVED
- #43: REJECTED (Task #44 revision)

## Recurring Patterns
- Fixes to shared/foundational defaults (like blockDefaults) must be checked for consistency across ALL element types that share the same property. The blockDefaults fix was correct in isolation but incomplete — 19 other dicts still had `display: "block"`.

---
### 2026-02-18 — Review #34
- Reviewed: `list-basic` layout fix by layout-fixer (fontSize 16 for ul/ol/li)
- Decision: APPROVED
- Rationale: 16px is the CSS default font-size inherited from body. The fix adds `fontSize: 16` to `listDefaults` and `liDefaults` in ElementDefaults.swift, matching the existing pattern used by `blockDefaults`, `pDefaults`, and heading defaults. Tests updated appropriately. No regressions — only affects ul/ol/li/menu elements, and user styles still override via mergedStyle().

---
### 2026-02-18 — Review #36
- Reviewed: `position-absolute` e2e extractor fix by layout-fixer-2 (compute missing position offsets)
- Decision: APPROVED
- Rationale: CSS getComputedStyle auto-computes opposite position offsets for positioned elements. The fix adds this computation to LayoutExtractor.swift (test infrastructure, not production rendering). Math is correct: `right = parentWidth - x - width`, `bottom = parentHeight - y - height`. Guard conditions prevent computation when parent dimensions are unknown. No impact on non-positioned elements or the root node.

---
### 2026-02-18 — Review #43
- Reviewed: `flex-grow` layout fix by layout-fixer (replace display:block with flexDirection:column in blockDefaults)
- Decision: REJECTED — revision needed (Task #44)
- Rationale: Core insight is correct — Yoga's `display: block` triggers `calculateBlockLayout()` which breaks flex-grow. However, the fix only changes `blockDefaults` while 19 other element defaults still use `display: "block"` and would exhibit the same bug when used as flex children. Fix must be applied consistently across all element defaults, or the fixer must verify (with tests) that elements with both `display: block` + explicit `flexDirection` don't trigger the block layout path.
- Recurring pattern: Fixes to shared/foundational defaults need to be checked for consistency across ALL element types that share the same property.
