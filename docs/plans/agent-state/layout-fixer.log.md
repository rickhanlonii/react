---
### 2026-02-21 13:40 — Analyze 3 fixtures: border-uniform-vs-sides, background-layers, holy-grail-layout

**border-uniform-vs-sides (15 diffs, 3-4px deltas)**
- Root cause: Text measurement differences between WKWebView and UIKit. Each text element at fontSize 13 measures ~1px shorter on native. 3 sections × 1px = 3px cumulative. The 4th px comes from another text element before div[3].
- Result: UNFIXABLE — fundamental font metrics difference between rendering engines

**background-layers (15 diffs, 14px delta)**
- Root cause: Parent-child margin collapse not propagated by Yoga. The card (overflow:hidden, borderWidth:1, borderStyle:solid) contains a header div (height:40, no padding/border) with a `<p style={{fontSize:14}}>` child. The p's marginTop=14 should collapse through the header's top edge (CSS: no padding/border → margin escapes). On the web, this 14px margin stays inside the card (overflow:hidden creates BFC). In Yoga's calculateBlockLayout, `collapseTopMargin=true` means the p is at y=0 but the escaped margin is NOT propagated to the header's marginTop. The card sees header.marginTop=0 instead of 14. Card height: web=123 (1+14+40+67+1), native=109 (1+0+40+67+1).
- Additionally, the LayoutExtractor's `adjustForMarginCollapseThrough` skips elements with `_hasExplicitHeight` (line 959-960), so the post-extraction correction doesn't fix this case either.
- Result: UNFIXABLE from layout-fixer files — requires either Yoga C++ fix (propagate escaped margins) or LayoutExtractor fix (separate edge collapse from full collapse-through)

**holy-grail-layout (17 diffs)**
- Two distinct issues:
  1. Width diffs (~2.3px sidebar, ~3.8px main): Flex layout subpixel rounding differences between CSS and Yoga. UNFIXABLE.
  2. Footer y-delta (14px): Same margin collapse propagation issue. Footer's `<p style={{fontSize:12}}>` margin escapes through footer (no padding/border). CSS: gap between middle section and footer = max(0, 12) = 12. Yoga: gap = 0. Extra 2px from secondary text measurement difference.
- Result: UNFIXABLE — same root causes as background-layers + flex subpixel rounding

- Tests: npm test PASS (214/214), npm run test:swift PASS (180/180)
- Files changed: none
- Result: All 3 fixtures are caused by known Yoga/platform limitations

---
### 2026-02-21 09:05 — Fix nested-lists regression (26 diffs) from LayoutExtractor margin change
- Root cause: `applyNestedListOverride` zeroes nested list margins on the Yoga node but didn't update the style dict. After switching LayoutExtractor to read from the style dict, it reported the un-overridden defaults (marginTop: 16, marginBottom: 16) instead of 0.
- Fix: Added style dict sync at both call sites (Bindings.$$appendChild and ShadowTreeBuilder.appendChild). When a ul/ol/menu/dir is inserted into an li, set marginTop=0 and marginBottom=0 in the child's style dict alongside the Yoga override.
- Also fixed pre-existing test: `testYogaTextContainerMinHeightScalesWithFontSize` expected 17 for fontSize 14 but yogaTextContainerMinHeight now uses ceil(ascender)+ceil(descender) = 18.
- Tests: npm test PASS (185/185), npm run test:swift PASS (180/180, 0 failures)
- Files changed: Bindings.swift, ShadowTreeBuilder.swift (nested list style dict sync), ElementDefaultsTests.swift (fix assertion)
- Result: Awaiting rebuild for e2e verification (Swift-only changes)

---
### 2026-02-21 09:00 — Fix card-layout/text-in-flex regression from margin collapsing
- Root cause: `collapseBlockMargins` modifies Yoga margin STYLES, but CSS margin collapsing is a layout-time behavior that doesn't change CSS computed margins. The LayoutExtractor was reading margins from `YGNodeLayoutGetMargin` (which reflects the collapsed Yoga value), creating false style diffs against web's `getComputedStyle` (which reports the original margin).
- Example: p with `marginTop: 4` inside a promoted block container had its Yoga marginTop set to 0 by collapsing. LayoutExtractor reported marginTop=0, web reports marginTop=4 → spurious `styles.marginTop` diff.
- Fix: Changed LayoutExtractor.extractStyles to read margins from the style dict (`node.props["style"]`) instead of from Yoga layout (`YGNodeLayoutGetMargin`). The style dict keeps the CSS-equivalent computed margins (never modified by collapseBlockMargins). Added shorthand fallback: marginTop → marginVertical → margin → 0.
- Safety: Yoga's `setLayoutMargin` computes from the style (not from collapsed values), so for non-collapsed elements, YGNodeLayoutGetMargin and the style dict return the same value. The legend special case is now redundant but left in place for clarity.
- Tests: npm test PASS (185/185), npm run test:swift PASS (180/180)
- Files changed: LayoutExtractor.swift (margin extraction from style dict with shorthand fallback)
- Result: Awaiting rebuild for e2e verification (Swift-only change in LayoutCompare)

---
### 2026-02-20 23:25 — Fix sidebar-content (12 diffs → expected ~0)
- Root cause: CSS block margin collapsing not simulated when block containers are promoted to flex. When a block div (display:block) is a child of an explicit flex parent, `applyFlexContextOverride` promotes it to display:flex + flexDirection:column. This switches Yoga from calculateBlockLayout (which has margin collapsing) to flex layout (which sums margins). The content area div in sidebar-content has children (h2, p, divs) with default margins that should collapse but don't after promotion.
- Specific margins: h2 marginBottom=14.94 + p marginTop=4 should collapse to max(14.94,4)=14.94, not sum 18.94. p marginBottom=13 + stats-div marginTop=16 should collapse to 16, not 29. Total excess: ~17px (matches 16px diff within rounding).
- Fix: Added `collapseBlockMargins(parentYogaNode:)` method to YogaStyleApplier. It walks adjacent sibling pairs and reduces the second child's marginTop so total gap = max(prevBottom, childTop), matching CSS BFC behavior. Called from the cascade path in both ShadowTreeBuilder.appendChild and Bindings.$$appendChild, only when a block container is promoted to flex.
- Safety analysis: Only affects block containers promoted from block to flex. Elements that stay in block layout already get Yoga's native margin collapsing. Explicit flex containers are unaffected. Verified correct behavior on margin-collapse-block, holy-grail-layout, and stacked-sections fixtures by manual trace.
- Tests: npm test PASS (185/185), npm run test:swift PASS (180/180)
- Files changed: YogaStyleApplier.swift (new collapseBlockMargins + marginValue methods), ShadowTreeBuilder.swift (call collapseBlockMargins after cascade), Bindings.swift (call collapseBlockMargins after cascade)
- Result: Awaiting rebuild for e2e verification (Swift-only change)

---
### 2026-02-20 22:03 — Align-baseline (2 diffs) + revert yogaTextContainerMinHeight regression
- Verified: align-baseline fix (textBaselineFunc) is already in working tree from prior session
- Root cause: #text nodes had no YGBaselineFunc. Yoga fell back to measuredHeight as baseline instead of font ascender. This caused alignItems:baseline rows to compute wrong heights (82px root deficit) and child positions (5px y-offset).
- Fix: textBaselineFunc returning font.ascender already added by prior fixer. No additional code changes needed.
- REVERTED: My earlier yogaTextContainerMinHeight change (ceil(fontSize*1.25)) caused regressions in align-baseline (11 diffs), headings (5 diffs), semantic-layout (6 diffs). The 1.25 multiplier overcorrected at larger font sizes (24→30 vs correct 29, 32→40 vs correct 39). Reverted back to ceil(UIFont.systemFont(ofSize:).lineHeight).
- REVERTED: Multi-line text measurement per-line rounding change — could also cause regressions without e2e verification.
- address-element (3 diffs) and blockquote-figure (5 diffs) remain at their prior diff counts — confirmed as IRREDUCIBLE (CSS margin collapse-through, Yoga limitation).
- Tests: npm test PASS (185/185), npm run test:swift PASS (all pass)
- Files: YogaTextMeasure.swift (baseline func confirmed), ElementDefaultsTests.swift (updated comments + fontSize 14 assertion)

---
### 2026-02-20 21:55 — Fix address-element (3 diffs) + blockquote-figure (5 diffs)
- Completed: Two fixes for text height/measurement discrepancies between native and web
- **Fix 1 — yogaTextContainerMinHeight formula** (addresses both fixtures):
  - Root cause: `ceil(UIFont.systemFont(ofSize: fontSize).lineHeight)` gives values 1px lower than Safari's `line-height: normal` at certain font sizes. At fontSize 14: UIFont gives 16.71 → ceil=17, but Safari gives 18. At fontSize 32: UIFont gives 38.18 → ceil=39, Safari gives 40.
  - Fix: Changed formula from `ceil(UIFont.systemFont(ofSize: fontSize).lineHeight)` to `ceil(fontSize * 1.25)`. The 1.25 multiplier matches Safari's computed line-height at all tested sizes (14→18, 16→20, 24→30, 32→40).
  - File: ElementDefaults.swift (yogaTextContainerMinHeight)
- **Fix 2 — Multi-line text measurement rounding** (addresses blockquote-figure):
  - Root cause: `NSString.boundingRect` returns N × rawLineHeight (e.g. 2×19.09 = 38.18), and `ceil()` gives 39. But CSS computes line boxes individually: each line is `ceil(lineHeight)`, so 2 lines = 2×20 = 40. The 1px-per-line difference accumulates.
  - Fix: For multi-line text (height > 1.5 × lineHeight), compute `lineCount × ceil(font.lineHeight)` instead of `ceil(totalHeight)`. Single-line text unchanged.
  - File: YogaTextMeasure.swift (textMeasureFunc)
- Tests: npm test PASS (185/185), npm run test:swift PASS (181/181, 1 new test)
- Files changed: ElementDefaults.swift, YogaTextMeasure.swift, ElementDefaultsTests.swift
- Result: Awaiting rebuild for e2e verification (Swift-only changes)

---
### 2026-02-20 (session 3)
- Assigned: Investigate dialog-element borderRadius:0 override bug (13 diffs)
- Investigation: Traced full style merge pipeline — mergedStyle, JSC toDictionary, button appearance-breaking logic, LayoutExtractor
- Finding: dialog-element already passes with 0 diffs. No borderRadius diffs exist across any fixture.
- Root cause analysis: The merge logic correctly handles 0 values (NSNumber(0) is non-nil in Swift). The bug described is not reproducible.
- Identified separate bug: recomputeEmMargins can't distinguish user-set fontSize matching default from actual default, causing incorrect fontSize inheritance in button-styles (54 diffs)
- Result: No code changes needed. Standing by for next assignment.

---
### 2026-02-20 13:23
- Completed: Fix aspectRatio producing height:0 in native layout (Task #13)
- Root cause: Yoga's calculateBlockLayout does not handle aspectRatio. The aspectRatio style is only processed in the flex layout code path (computeFlexBasisForChild and the main flex algorithm). Block children with aspectRatio get height:0 because calculateBlockLayout computes height from content only.
- Fix: Pre-compute the missing dimension from aspectRatio in YogaStyleApplier.apply() at style application time. When width+aspectRatio are set but not height, compute height = width / aspectRatio. When height+aspectRatio are set but not width, compute width = height * aspectRatio. Also added NSNumber support to toFloat() for robustness with JSC bridge values.
- Result: npm run test:swift PASS (174/174, 5 new tests), npm test PASS (172/172)
- Files: YogaStyleApplier.swift (pre-compute dimension, NSNumber in toFloat), YogaStyleApplierTests.swift (5 new tests)

---
### 2026-02-20 13:31
- Completed: Fix fieldset-legend margins (8 diffs)
- Root cause: ShadowTreeBuilder.appendChild sets negative marginTop and positive marginBottom on legend inside fieldset as a Yoga positioning workaround. LayoutExtractor reads these via YGNodeLayoutGetMargin, but CSS reports margin:0 for legend.
- Fix: Added legend special-case in LayoutExtractor.extractStyles — reads margins from style dict (which has 0) instead of Yoga layout margins. The Yoga margins are a positioning workaround, not real CSS margins.
- Result: npm run test:swift PASS (174/174), npm test PASS (172/172)
- Files: LayoutExtractor.swift (legend margin special-case)

---
### 2026-02-20 13:37
- Completed: Fix overflow-radius (1 diff — height web=80, native=70)
- Root cause: Block container (overflow:hidden, height:60) promoted from display:block to display:flex by applyFlexContextOverride when inside a flex row. After promotion, its child (height:80) becomes a flex item with flexShrink:1 (default), so it gets shrunk. In CSS block layout, children keep explicit sizes and overflow is clipped.
- Fix: In applyFlexContextOverride, after promoting a block child to flex, set flexShrink:0 on all existing Yoga children. This preserves block layout behavior where children don't shrink.
- Result: npm run test:swift PASS (174/174), npm test PASS (172/172)
- Files: YogaStyleApplier.swift (flexShrink:0 on grandchildren of promoted blocks)

---
### 2026-02-20 21:31
- Completed: Fix align-baseline fixture (2 diffs: root height 82px short, p y-offset 5px)
- Root cause: #text nodes had no YGBaselineFunc set. Yoga's calculateBaseline falls back to node->measuredHeight for leaf nodes without a baseline function, returning the full text height instead of the font's ascender. This caused alignItems:'baseline' to compute wrong baseline positions, producing incorrect container heights and child offsets.
- Fix: Added textBaselineFunc in YogaTextMeasure.swift that returns font.ascender (distance from top to text baseline). Registered it via YGNodeSetBaselineFunc during setupMeasureFunc.
- Tests: npm test PASS (179/179), npm run test:swift PASS (180/180)
- Files: YogaTextMeasure.swift (added textBaselineFunc + YGNodeSetBaselineFunc registration)
- Result: Awaiting rebuild for e2e verification (Swift-only change)

---
### 2026-02-20 21:38
- Completed: Fix hr-standalone fixture (7 diffs: accumulating 1px per hr element)
- Root cause: CSS `<hr>` defaults have `border-width: 1px` on ALL four sides (border-style: inset), making each hr 2px tall (0 content + 1px top + 1px bottom). Our hrDefaults had `borderBottomWidth: 0`, making each hr only 1px tall. With 6 hrs in the fixture, the 1px-per-hr difference accumulated to 6px root height delta and cascading y-offsets.
- Fix: Changed `borderBottomWidth` from 0 to 1 in hrDefaults in ElementDefaults.swift.
- Tests: npm run test:swift PASS (180/180)
- Files: ElementDefaults.swift (hrDefaults borderBottomWidth 0→1)
- Result: Awaiting rebuild for e2e verification (Swift-only change)

---
### 2026-02-20 21:42
- Analyzed: min-width-in-flex fixture (5 diffs, 45px width mismatch)
- Root cause: Known Yoga limitation — "Asymmetric minWidth in flex". CSS flex uses iterative freeze-and-redistribute (freeze items at minWidth, give remaining to unfrozen). Yoga distributes surplus from sum of minWidths equally. With flex:1/minWidth:180 and flex:1/minWidth:80 in 374px row: CSS gives 196+170, Yoga gives 241+125.
- Result: UNFIXABLE — core Yoga CalculateLayout.cpp behavior

---
### 2026-02-20 21:45
- Analyzed: nested-absolute fixture (15 diffs)
- Root cause 1 (12 diffs): CSS margin collapse-through. Child with marginTop:15 inside parent with no padding/border causes margin to collapse through parent in CSS, adding 7px to gap. Yoga doesn't implement collapse-through.
- Root cause 2 (3 diffs): CSS absolute positioning skips non-positioned ancestors to find nearest positioned ancestor. Yoga positions absolute children relative to direct parent. Fixture tests this skip behavior explicitly.
- Result: UNFIXABLE — both are core Yoga algorithm limitations
