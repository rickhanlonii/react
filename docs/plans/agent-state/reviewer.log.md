# Reviewer State

## Session Summary (2026-02-18)

### Reviews Completed
- **Task #34 — APPROVED**: Add fontSize 16 to ul/ol/li element defaults. Correct CSS default, consistent with existing patterns.
- **Task #36 — APPROVED**: Compute missing position offsets in LayoutExtractor. Test infrastructure fix only, math verified correct.
- **Task #43 — REJECTED**: Replace display:block with flexDirection:column in blockDefaults. Core insight correct but fix applied inconsistently — only blockDefaults changed while 19 other element defaults still use `display: "block"`. Created Task #44 for revision.
- **Task #80 — APPROVED**: Insertion-time flex context override (applyFlexContextOverride). Supersedes #43/#44 with a fundamentally better approach — overrides display:block to flex at child insertion time when parent is explicit flex container.

### In Progress / Pending
- (none)

## Review Decisions
- #34: APPROVED
- #36: APPROVED
- #43: REJECTED (Task #44 revision)
- #80: APPROVED (supersedes #44)
- #81: REJECTED then APPROVED after revision (Task #82 completed, committed cb68f35)
- #85: APPROVED (committed eb55473 + 2efa2b3)

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

---
### 2026-02-18 — Review #80
- Reviewed: `flex-grow` insertion-time override fix by layout-fixer (applyFlexContextOverride)
- Decision: APPROVED — committed as 57b70ec
- Rationale: Instead of modifying element defaults (rejected in #43), this fix adds `applyFlexContextOverride()` to `YogaStyleApplier` — called at insertion time from both `$$appendChild` (Bindings.swift) and `appendChild` (ShadowTreeBuilder.swift). When a block child is inserted into an explicit flex parent (`parentStyle["display"] == "flex"/"inline-flex"`), it overrides the child's Yoga display from `.block` to `.flex` and sets `flexDirection: column` to preserve block stacking. Correctly preserves explicit `flexDirection` (e.g. p/h1-h6 use row). Guard checks style dict (not Yoga property) to avoid false positives from Yoga's default `.flex`. 5 unit tests cover: block-in-flex, block-in-block (no-op), implicit-flex-parent (no-op), explicit flexDirection preserved, flex child unchanged. Integration test verifies correct 1:2:1 width distribution. Supersedes Task #44 (revision no longer needed).
- Recurring pattern: Insertion-time overrides are superior to modifying element defaults when behavior depends on parent context. The element's intrinsic defaults (display:block) should remain unchanged; the contextual behavior (flex participation) should be applied when the relationship is established.

---
### 2026-02-19 — Review #81
- Reviewed: `form-basic` ElementDefaults fix by layout-fixer (button/input/label/inline text defaults rework)
- Decision: REJECTED — revision needed (Task #82)
- Rationale: The diff contains two separable concerns:
  - **APPROVED parts**: strong/em routing fix, inline text elements removing `alignItems:"center"` and adding `fontSize:16`, span removing `display:"inline-block"`, label getting its own labelDefaults with `display:"inline"`, monospace removing `display:"inline-block"`, em-relative margin feature in mergedStyle(), blockquote/hr adding `fontSize:16`, a replacing `alignItems` with `fontSize`. All correct per CSS spec and reference descriptors.
  - **REJECTED parts**: (1) Button `display:"block"` — CSS buttons are `inline-block` per spec (MDN) and reference descriptor. `display:block` makes buttons stretch to full width outside flex parents. (2) Button removed `alignItems:"center"` and `justifyContent:"center"` — text won't be centered. Reference descriptor explicitly includes both.
  - Form control fontSize (11 vs 13.28) and dimension changes accepted conditionally — may match actual browser measurements even if reference says 13.28.
- Recurring pattern: When "fixing" values to match e2e browser measurements, verify the fix works for ALL usage contexts, not just the specific fixture being tested. Button display:block works in the flex-row fixture but breaks standalone buttons.

---
### 2026-02-19 — Review #82 (re-review after revision)
- Reviewed: form-basic button defaults revision by layout-fixer
- Decision: APPROVED — committed as cb68f35
- Rationale: Fixer restored `display: "inline-block"`, `alignItems: "center"`, and `justifyContent: "center"` on buttonDefaults. Tests correctly assert all three properties. All other changes from #81 (inline text fixes, em-relative margins, strong/em routing, label/span/monospace display fixes) were already approved and included in the commit.

---
### 2026-02-19 — Review #85
- Reviewed: lineHeight text measurement + display-none LayoutExtractor + anchor color removal
- Decision: APPROVED — committed as eb55473 (production) and 2efa2b3 (test infra)
- Changes reviewed:
  1. **lineHeight text measurement** (YogaTextMeasure, Bindings, ShadowTreeBuilder): Adds CSS line-height support. When lineHeight is set on a text node's parent, caps per-line measured height to lineCount * lineHeight. Principled approach — maps CSS concept directly. Math correct.
  2. **monospaceDefaults** (ElementDefaults): Added `alignSelf: "flex-start"` (prevents inline-like elements from stretching) and `lineHeight: 14` (Menlo at 13px). Both correct.
  3. **Anchor color removal** (ElementDefaults): Removed `color: "#007AFF"` from aDefaults. Was intentional iOS blue, but removing matches web default for e2e accuracy. Can be re-added as visual-only prop later.
  4. **display:inline mapping** (YogaStyleApplier): Maps "inline" to .inlineBlock (Yoga's closest approximation). Needed for label's display:inline default.
  5. **display-none LayoutExtractor** (test infra only): Correctly reports (0,0,0,0) for hidden nodes, reads margins from style dict (matching getComputedStyle). Refactored auto-margin resolution. Added per-corner borderRadius expansion.
- No regressions: Production changes are minimal and principled. Test infra changes improve extraction accuracy.
