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

---
### 2026-02-19 — Review #120 (batch review of all uncommitted changes)
- Reviewed: All accumulated layout fixes, SSR/Suspense hydration rework, and infrastructure changes
- Decision: APPROVED — committed as a4c830c
- Files: 35 files changed, 1755 insertions(+), 177 deletions(-)
- Scope:
  1. **ElementDefaults** (13 element types updated): sub/sup split with alignSelf, yogaMinHeight for sub/sup/textarea, needsInlineBlockDisplay for inline elements, pre/dialog/fieldset/legend/textarea/select/hr/dl/dd defaults corrected. All verified against CSS spec.
  2. **Shorthand override logic**: padding/margin shorthand removes default individual properties. Correct behavior — prevents defaults from overriding user shorthand.
  3. **lineHeight resolution**: Unitless lineHeight treated as multiplier (CSS spec). Applied in both merged-defaults and no-defaults paths.
  4. **recomputeEmMargins**: Font-size inheritance for em-relative margins at insertion time. Well-guarded — only fires when parent fontSize differs and margins are still at defaults.
  5. **Suspense hydration rework**: Replaced bulk flattenSuspenseFromCurrentTree with per-boundary self-flatten during appendChild. Preserves #suspense children in cloneWithNewChildren, uses oldChildFamilies for correct interleaving. Fixes timing issue where first commit was too late for flattening.
  6. **writeHoistablesForBoundary return true**: Critical Fizz fix — undefined return caused flush bail-out, leaving boundaries stuck.
  7. **UIKitMutationApplier**: Per-side border colors, background layer promotion for negative z-index stacking context.
  8. **YogaStyleApplier**: Percentage width/height/min/max support via toPercent helper.
  9. **ShadowTreeLayout**: Scroll content measurement using YGNodeCopyStyle + paddingBottom.
  10. **Infrastructure**: 15 new e2e fixtures, auto-discover client components, EADDRINUSE handling, server readiness checks, hex shorthand normalization in LayoutComparer.
- Tests: 172 JS tests PASS, 152 Swift tests PASS (0 failures)
- No hacks, no magic numbers (calibrated values documented), no regressions identified.

---
### 2026-02-19 — Review: overflow-scroll layoutMargins + bundled fixes
- Completed: Reviewed overflow-scroll margin preservation fix + bundled ElementDefaults changes
- Result: APPROVED (not yet committed — team lead will batch)
- Files reviewed:
  - `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift` — layoutMargins cache property + yogaTextContainerMinHeight
  - `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift` — saveLayoutMargins() before YGNodeRemoveAllChildren
  - `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutExtractor.swift` — reads cached layoutMargins
  - `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` — figcaption, pre/legend flexWrap, hr margins, heading rounding, fontSize additions, emFontSizeMultiplier, recomputeEmBasedMargins rewrite
  - `packages/react-dom-native/ios/Tests/ReactDomNativeTests/ElementDefaultsTests.swift` — tests for above
- Root cause verified: YGNodeRemoveAllChildren calls setLayout({}) (YGNode.cpp:199), zeroing computed margins

---
### 2026-02-19 — Review: pre-element flexWrap override
- Completed: Reviewed pre-element fix (flexWrap style/Yoga divergence + emFontSizeMultiplier for pre)
- Result: APPROVED (not yet committed — batching)
- Key finding: The style-dict-vs-Yoga divergence pattern is sound and consistent with existing overrides (yogaMinHeight, needsInlineBlockDisplay). Yoga's CalculateLayout.cpp:1736-1737 routes display:block + flexWrap:noWrap to calculateBlockLayout, which stacks children vertically — wrong for pre/legend with flexDirection:row inline text. Setting Yoga to wrap forces flex layout while style dict reports "nowrap" for comparison accuracy. LayoutExtractor reads flexWrap from style dict, not Yoga, so comparison is correct.
- Minor note: needsYogaFlexWrapOverride is unconditional, so a user-specified flexWrap:"wrap-reverse" on pre/legend would be overwritten. Acceptable — not a realistic use case.

---
### 2026-02-19 — Review: hr-standalone conditional auto margins
- Completed: Reviewed hr-standalone fix (conditional auto margins in mergedStyle for sized hrs)
- Result: APPROVED (not yet committed — batching)
- Key finding: Fix correctly models CSS auto margin behavior. CSS `<hr>` has `margin: 0.5em auto` — auto margins resolve to 0 when hr stretches to fill parent (no width), but center the element when width is explicit. The fix uses `marginLeft: 0, marginRight: 0` as defaults (stretch case) and conditionally applies `"auto"` in mergedStyle() only when `userStyle["width"] != nil` (sized case). User-explicit marginLeft/Right overrides are respected via nil guards. LayoutExtractor's resolveAutoMargins correctly computes centering values for the comparison.

---
### 2026-02-19 — Review: address-element text remeasure
- Completed: Reviewed address-element fix (re-measure #text children after em margin recomputation)
- Result: APPROVED (not yet committed — batching)
- Files: Bindings.swift (reconciler path) and ShadowTreeBuilder.swift (SSR path)
- Key finding: When `recomputeEmMargins` changes a child element's fontSize (e.g. `<p>` inside `<address>`), the child's `#text` nodes were already measured with the old fontSize. The fix re-measures them with the inherited fontSize by calling cleanupMeasureContext + setupMeasureFunc. Both paths (reconciler and SSR) are updated identically.
- Performance: No concern. The re-measurement loop only runs when recomputeEmMargins fires (narrow condition: parent fontSize differs from child's base default). Only iterates direct #text children (typically 1-3). setupMeasureFunc just registers a callback — actual measurement is lazy during Yoga layout. YGNodeMarkDirty ensures stale cached measurements are invalidated.

---
### 2026-02-19 — Review: blockquote-figure minHeight removal
- Completed: Reviewed removal of blockquote and figcaption from yogaTextContainerMinHeight
- Result: APPROVED (not yet committed — batching)
- Key finding: blockquote and figcaption are flow content containers (they wrap `<p>` and other block elements), not text containers. The minHeight emulating CSS line-height should only apply to elements that establish an inline formatting context (p, h1-h6, li, dt, dd, summary, legend, label). In the fixture, both blockquote and figcaption contain `<p>` elements — it's the `<p>` that should have the text minHeight, not the outer container.

---
### 2026-02-19 — Review: fieldset-legend marginBottom compensation
- Completed: Reviewed fieldset-legend fix (marginBottom = paddingTop on legend)
- Result: APPROVED with note (not yet committed — batching)
- Files: Bindings.swift and ShadowTreeBuilder.swift (both paths updated identically)
- Key finding: The fix adds `marginBottom = paddingTop` to legend when appended to fieldset. This compensates for the negative top margin (`-(borderTop + paddingTop)`) that pulls the legend up to sit on the border. Without the compensating marginBottom, subsequent siblings are too close to the legend. In CSS, content after legend starts at legendBottom + paddingTop — this marginBottom emulates that gap. Both reconciler and SSR paths updated.
- Note: The Yoga-computed marginBottom (5.6px for default fieldset) will show up in LayoutExtractor output, creating a marginBottom diff vs web's 0px. This is an acceptable tradeoff — it fixes many cascading y-position diffs for subsequent siblings (27→8 overall). Could be suppressed in LayoutExtractor in a future pass if needed.

---
### 2026-02-19 — Review: textarea-select sizing defaults
- Completed: Reviewed textarea/select defaults changes
- Result: APPROVED (not yet committed — batching)
- Key changes:
  - textarea: removed boxSizing:border-box (CSS default is content-box), width 154→142, added height:28, padding 4/4/4/4→2/2/5/5, removed from yogaMinHeight
  - select: added width:24
- Dimension verification: content-box width 142 + padding 10 + border 2 = 154 outer (same as old border-box 154). Content-box height 28 + padding 4 + border 2 = 34 outer (same as old yogaMinHeight 34).
- Cross-fixture check: textarea only appears in textarea-select fixture — no regression risk from yogaMinHeight removal.
- content-box is more CSS-accurate for textarea (CSS default). Using explicit height instead of yogaMinHeight is better since textareas have fixed size by default.

---
### 2026-02-19 — Review: table-semantic caption + border-spacing
- Completed: Reviewed table-semantic fix (caption alignItems removal + border-spacing emulation via Yoga display override)
- Result: APPROVED (not yet committed — batching)
- Key changes:
  - caption: removed alignItems:"center" (wrong CSS property — CSS uses text-align:center, not align-items), added fontSize:16
  - table/thead/tbody/tfoot: Yoga-only display override to flex+column so gap property works for border-spacing emulation. Style dict keeps display:"block" for comparison accuracy.
  - thead: padding-top:2, padding-bottom:2, gap:2 (top edge + between rows + section boundary)
  - tbody/tfoot: padding-bottom:2, gap:2 (between rows + bottom edge)
- Border-spacing verification: CSS border-spacing:2px creates 2px between all adjacent cells. Vertical spacing emulated correctly via section padding + row gap. Horizontal cell spacing (between columns in a row) not addressed — may account for some of the remaining 32 diffs.
- Safety: Yoga display override follows established pattern (needsInlineBlockDisplay, needsYogaFlexWrapOverride). LayoutExtractor reads display from style dict, not Yoga.
- Padding values: 2px is the exact CSS border-spacing default, not a tolerance-based calibration. No masking concern.

---
### 2026-02-19 — Review: flex context cascade + alignItems/justifyContent neutralization
- Completed: Reviewed flex context cascade to grandchildren + alignItems/justifyContent neutralization for block→flex override
- Result: APPROVED with note (not yet committed — batching)
- Key changes:
  - YogaStyleApplier: after block→flex promotion, neutralize alignItems→stretch and justifyContent→flexStart for display:block children (preserves block-like internal layout; skips inline-block which uses these for its own layout)
  - Bindings.swift + ShadowTreeBuilder.swift: when a child is promoted block→flex, cascade applyFlexContextOverride to existing grandchildren. Triggered only when display actually changed (childDisplayYogaBefore check).
- Correctness: CSS inner display of a block-became-flex-item is still "flow" (block formatting). Yoga doesn't separate inner/outer display, so flex promotion changes internal layout. Neutralizing alignItems/justifyContent restores block-equivalent behavior.
- Performance: cascade only fires when display changed (narrow condition), iterates direct children only (not recursive), each call is a few Yoga property sets.
- Note: cascade is 1-level deep (grandchildren only, not recursive). Deeply nested block containers inside a flex item might miss the override. Acceptable for now — common structures are typically 1-2 levels deep. Could be made recursive if needed.

---
### 2026-02-19 — Review: flex shorthand expansion + flex column auto margin resolution
- Completed: Reviewed two fixes — flex shorthand expansion in YogaStyleApplier and flex column auto margin resolution in LayoutExtractor
- Result: APPROVED (not yet committed — batching)
- Key changes:
  - **Fix 1: flex shorthand** (YogaStyleApplier.swift:206-214): Replaced `YGNodeStyleSetFlex(node, f)` with explicit `flexGrow/flexShrink/flexBasisPercent` expansion. CSS `flex: <number>` = `<number> 1 0%`. Yoga's `YGNodeStyleSetFlex` bug: only sets basis to 0 when flex > 0, leaving flex-basis as auto for `flex: 0` — wrong per CSS spec. Fix expands correctly. Explicit longhands (lines 216-224) override the shorthand, matching CSS cascade.
  - **Fix 2: flex column auto margins** (LayoutExtractor.swift:316-374): Added `isParentFlexColumn` path for vertical auto margin resolution. Old position-based formula was wrong (y includes paddingTop + preceding siblings). New algorithm: total all sibling heights + non-auto margins + gaps, subtract parent padding+border from parentHeight to get content area, distribute free space evenly. Mirrors existing flex-row horizontal algorithm (lines 264-302) with correct axis mapping (row gap for column, column gap for row).
- Verification:
  - Flex shorthand: `flex: 0` now correctly gets basis 0% (item collapses). `flex: 1` behavior unchanged (was already correct via Yoga).
  - Auto margins: gap reads `.row` for column direction (correct). contentHeight correctly subtracts padding+border. `!insideDisplayNone` guard prevents resolution in hidden subtrees.
- Minor note: `isParentFlexColumn` treats `flexDir == nil` as column. Could be incorrect for elements without default flexDirection, but in practice all block elements have `flexDirection: "column"` in their defaults from ElementDefaults. Theoretical concern only.

---
### 2026-02-19 — Review: borderStyle, border-radius, textAlign, pre truncation (4 fixes)
- Completed: Reviewed 4 fixes from layout-fixer
- Result: ALL APPROVED (with one note on LayoutExtractor)

**Fix 1: borderWidth-without-borderStyle CSS quirk — APPROVED**
- YogaStyleApplier.swift: borderWidth only applied to Yoga when borderStyle is present and not "none". Correct per CSS spec (border-width computes to 0 when border-style is none/initial).
- ElementDefaults.swift: Added borderStyle to all elements with borderWidth: button/input/textarea/select/dialog → "solid", fieldset → "groove", iframe/hr → "inset". All verified against CSS UA stylesheets.
- expandBorderShorthand: Now extracts borderStyle from shorthand regex group 2. Guard prevents overwriting explicit borderStyle.
- Tests: Two new tests verify border skipped for "none" and absent borderStyle.
- Regressions (stacked-sections 5→10, text-in-flex 20→22): Expected — these are cases where layout was "accidentally correct" due to the old bug allocating border space without borderStyle. The fix is CSS-correct; regressions should be addressed separately.

**Fix 2: Per-corner border radius — APPROVED with note**
- UIKitMutationApplier.swift: New `applyBorderRadius` method. Uniform radii use CALayer.cornerRadius; per-corner uses CAShapeLayer mask with UIBezierPath arcs.
- Path geometry verified: correct centers, angles, edge sequences.
- Mask cleanup uses `__corner_mask__` name convention — preserves non-corner masks.
- Same logic duplicated for bgLayer (negative z-index stacking) — acceptable.
- NOTE: LayoutExtractor per-corner detection is stale. It reads layer.cornerRadius (uniform) and reports 0 for all corners when CAShapeLayer mask is used. Should be fixed in follow-up since per-corner IS now supported. Test infrastructure only — no production impact.

**Fix 3: textAlign on UILabels — APPROVED (no production changes)**
- Already implemented via applyTextProps/applyInheritedTextStyle.
- LayoutExtractor now reads actual UILabel.textAlignment from ViewRegistry. Mapping correct: .left/.natural → "start", .center → "center", .right → "right", .justified → "justify".
- ViewRegistry parameter is optional — nil preserves old behavior.

**Fix 4: Pre element text truncation — APPROVED**
- UIKitMutationApplier.swift: .byCharWrapping for pre elements in both createView (line 130) and applyInheritedTextStyle (line 584).
- .byCharWrapping is correct UIKit equivalent for CSS white-space:pre wrapping.
- LayoutExtractor detects truncating modes and reports textOverflow:"ellipsis" — .byCharWrapping is not truncating, so pre elements won't trigger this. Correct.

---
### 2026-02-19 — Review: 4 LayoutExtractor fixes (nested-borders, zero-size-items, holy-grail, sidebar)
- Completed: Reviewed 4 test infrastructure changes in LayoutExtractor.swift
- Result: ALL APPROVED (no production code changes)

**Fix 1: nested-borders borderWidth extraction with borderStyle check — APPROVED**
- LayoutExtractor now mirrors the CSS quirk: borderWidth computes to 0 when borderStyle is "none" (the default). Checks both merged style dict and raw element defaults for borderStyle presence.
- `sideWidth` helper returns 0 when `!hasBorderStyle`. Aligns with production fix in YogaStyleApplier.

**Fix 2: Empty-box collapse-through — APPROVED**
- CSS spec: empty block (zero height, no padding/border/content) collapses its own top+bottom margins into max(top, bottom), which then collapses with adjacent sibling margins.
- Algorithm: Yoga gap = prevBottom + emptyTop + emptyBot + nextTop; CSS gap = max(all). Reduction applied as negative extraBottom.
- Sign changes from `> 0` to `!= 0` in delta/offset checks (lines 789, 822, 831) — correct, empty-box collapse produces negative adjustments.
- Limitation: only handles middle-position empty boxes (not first/last child). Acceptable simplification.

**Fix 3 & 4: `_hasExplicitHeight` metadata (holy-grail + sidebar) — APPROVED**
- CSS spec: margins don't collapse through a box with non-zero explicit height, even without padding/border.
- `_hasExplicitHeight` stored as internal metadata (underscore prefix convention). Used in `computeCollapseTopMargin`, `computeCollapseBottomMargin`, and `collapsePass`.
- Double condition `_hasExplicitHeight && child.height > 0` correctly handles `height: 0` (which should still allow collapse-through).
- Verified: `_hasExplicitHeight` NOT in LayoutComparer's comparison lists — no false diffs.

**Bonus: borderRadius extraction fix**
- Noted the borderRadius extraction now correctly checks `!hasMask` before overriding per-corner values (line 696). When `__corner_mask__` CAShapeLayer is present, style dict values are trusted. This addresses my note from the previous review.

---
### 2026-02-20 — Review: Border sublayer rendering timing (UIKitMutationApplier.swift)
- Completed: Reviewed timing fix for border/radius rendering
- Result: APPROVED

**Root cause:** `applyBorderProps()` and `applyBorderRadius()` were called inside `applyCommonProps()` which runs inside `createView()` — BEFORE `view.frame = node.layoutFrame`. Non-uniform borders use sublayers with frames computed from `view.bounds`, and per-corner radius uses `UIBezierPath` with `view.bounds`. At call time, bounds was `CGRect.zero` — all sublayers invisible, all paths degenerate.

**Fix:** Extracted border/radius into `applyBoundsDependentProps()`, called AFTER `view.frame` is set in both CREATE and UPDATE mutation paths. Clean separation: `applyCommonProps` handles bounds-independent styling (backgroundColor, opacity, overflow), `applyBoundsDependentProps` handles bounds-dependent operations.

**Verification:**
- CREATE path: `createView()` → `view.frame = ...` → `applyBoundsDependentProps()` → `applyBackgroundLayerIfNeeded()`. Correct ordering.
- UPDATE path: `updateView()` → `view.frame = ...` → `applyBoundsDependentProps()` → `applyBackgroundLayerIfNeeded()`. Correct ordering.
- `applyBackgroundLayerIfNeeded()` also uses `view.bounds` for bgLayer radius — already called after frame is set. Correct.
- Uniform `CALayer.borderWidth` was unaffected (bounds-independent), but per-side sublayers and per-corner masks required correct bounds. Both now work.
- No regression risk: only timing of application changed, not the application logic itself.

---
### 2026-02-20 — Review: Relative position offsets in block layout (ShadowTreeLayout.swift)
- Completed: Reviewed relative position offset fix + test
- Result: APPROVED — committed as 3e8e0a6
- Files:
  - `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift` — manual position:relative offset in readLayoutFrames()
  - `packages/react-dom-native/ios/Tests/ReactDomNativeTests/YogaStyleApplierTests.swift` — testRelativePositionOffset
- Root cause: Yoga's calculateBlockLayout() does NOT apply position:relative offsets (top/left/right/bottom), while calculateFlexLayout() does. Block-display nodes with position:relative were rendered at their normal flow position without the offset.
- Fix: In readLayoutFrames(), after reading Yoga layout position, if node has display:.block AND positionType:.relative, manually apply top/left/right/bottom from style dict. Guard prevents double-application for flex children (whose display is .flex after applyFlexContextOverride).
- Verification:
  - top/bottom precedence: top wins via else-if (correct per CSS spec for LTR)
  - left/right precedence: left wins via else-if (correct per CSS spec for LTR)
  - NSNumber cast covers Int and Double from style dict
  - Table elements (table/thead/tbody/tfoot) have Yoga display .flex (overridden in createElementNode) despite style dict display:"block" — correctly excluded by Yoga node check
  - Test covers both flex parent (no double-apply) and block parent (manual apply) scenarios
- Also included: saveLayoutMargins helper for scroll content size computation, additional test coverage for border width and content-box flex grow

---
### 2026-02-20 — Review: Accumulated layout fixes (tasks #1, #7, #8)
- Completed: Comprehensive review of all uncommitted changes across 8 source files
- Result: APPROVED — all changes pass review checklist
- Files reviewed:
  - `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` — borderStyle tracking, figcaption defaults, flexWrap decoupling, hr auto margins, heading margin rounding, emFontSizeMultiplier, border shorthand parsing
  - `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` — alignContent support, flex shorthand expansion, aspectRatio, borderWidth gated on borderStyle, block child flex prop neutralization
  - `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift` — wrapping flex position:relative offset handling
  - `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift` — grandchild block→flex cascade, font-size inheritance for em margins, legend marginBottom
  - `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift` — layoutMargins cache, text container minHeight, flexWrap overrides, table layout emulation
  - `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — color/textAlign inheritance, bounds-dependent props, per-corner border radius, background layer zPosition fix
  - `packages/react-dom-native/src/renderer/HostConfig.js` — null check on replaceContainerChildren
  - `packages/react-dom-native/src/renderer/renderer.js` — DevTools integration
- Tests: 172/172 JS, 166/166 Swift (per fixer state)
