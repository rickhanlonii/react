# Claim ledger: store-vs-context.src.html

Audit of every claim on the page that isn't a bare generated number, done with the `claim-boundary-checker` method. Checked 2026-11-02 against build a3d8e745's `bench-data.json`.

**Evidence set:** `docs/use-store/data/bench-data.json` (`ctx.*`, `counts.main.*`, `typing.main.*`, `memory.*`, `method.*`); `fixtures/store-bench/src/apps/{store,context,context-split}.jsx`; `fixtures/store-bench/src/shared/views.jsx`; `fixtures/store-bench/README.md`; `benchmark-report.src.html` `#method` (lines 493-535); `explainer.src.html` `#performance` (line 525); `docs/use-store/tools/charts.mjs` (`ctx*` generators, lines 1136-1240); reconciler source (`ReactFiberNewContext.js`, `ReactFiberBeginWork.js`, `ReactFiberConcurrentUpdates.js`); `fixtures/store-bench/results/profiles/`. The author's `store-vs-context.claims.md` was used as a lead only.

**Notation:** `{key}` stands for `<span data-n="key"></span>`. Replacement wording has no bare digits, so it passes the check-docs digit rule.

**Verdicts:** supported / overreach (true at a narrower scope; narrower wording given) / unsupported / contradicted / non-factual (opinion or voice). The JSON at the end maps these to the validator's statuses (overreach → `uncertain`, contradicted → `unsupported`).

## Key semantics

- All timing keys on the page are `ctx.*`, and every `ctx.tally.{off,on}.*` source says "both without the compiler" or "both with the compiler". The page never uses `main.tally.context*` (store + compiler against Context's best setting). **Same-setting framing is correct throughout.**
- `ctx.tally.compilerGain.*` is the same variant with the compiler against without it. The page uses these keys only in "What the compiler buys each", which is correct.
- `counts.main.*.renders` counts only `Row`, `RowView`, `DetailsView` and `CountView` renders (`views.jsx:8-15`, `:62`, `:80`, `:95`). `App`, `Filter`, `FilterInput`, and the `Count` and `Details` wrappers aren't counted. The page, the generated `ctx-counts` caption ("every component render", `charts.mjs` `ctxCounts`) and `README.md` ("`renders` is every component render") all read it as every component. This matters for C3, C17, C20, C54, C55 and C62.
- Line 160 cites only `ctx.tally.off.vsContext.selection.{ties,total}` for "selection and filter ... each". The filter values happen to match (`filter.ties` = 6, `filter.total` = 6), but the filter half isn't sourced by a span.

## Header and lede

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C1 | Matches or beats a context per slice in every configuration, with and without the compiler | supported | `ctx.tally.off.vsContextSplit.all` matchOrBeat 42/42 (40 faster, 2 tie); `.on` 42/42 (42 faster) |
| C2 | Against one context with the compiler: 35 of 42, loses by at most 11% | supported | `ctx.tally.on.vsContext.all.{matchOrBeat,total}`, `.maxLossPct` (same-setting) |
| C3 | "Where every component reads the value that changed, use(store) and one context do the same work" | **overreach** | The counted renders are equal (selection 1,002/1,002 on; filter 1,502/1,502; churn 1,099/1,099; add/remove 1,001/1,001). But (a) the counter skips `App`, `Filter` and `Count`, and one context re-renders all three on every update (`context.jsx:58,78,85`), while store re-renders them only when `ids`, `filterInput` or `labels`/`filter` change. `Count` loops over every label. (b) The timing isn't the same: with the compiler, store is {ctx.tally.on.vsContext.structure.range} (1.3–2.2×) on add/remove and up to 1.4× on selection, while one context wins up to 11% on filter and churn. |
| C4 | Synthetic; no real-app data; experiment behind `enableStore`; nothing shipped | supported | `ReactFeatureFlags.js:117` `enableStore = __EXPERIMENTAL__` |
| C5 | Uses the same results as the benchmark report | supported | Every `ctx.tally.*` source is "main: 46 files (sources.main)", the same as the report's main suite |

## Summary

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C6 | One context holds all the state in a `useReducer` at the root, with one Provider | supported | `context.jsx:22,85,90-100` |
| C7 | A context per slice: its own Provider per slice, with rows in `memo` | supported | `context-split.jsx:22-28` (seven contexts), `:36` (`memo`), `:112-134`. Not stated on the page: all eight slices are `useState` in the root `App` (`:91-98`), so every update re-renders `App`. See C20. |
| C7b | "the way people usually do" | non-factual | Author judgment; `README.md` caveat "as people do". Keep it as voice. |
| C8 | Store: a store per entity, plus small stores for the selection, filter, expanded rows and details | supported | `store.jsx:89-101` (also `ids`, `labels` and `filterInput`; the list is incomplete but not wrong) |
| C9 | Each comparison is at the same compiler setting | supported | See "Key semantics" |
| C10 | Scoreboard ranges | supported | Generated `ctx.tally.{off,on}.{vsContext,vsContextSplit}.all.range` |
| C11 | The big wins are where few components read the change: entity, conditional reads | supported | Entity off 20–57×, on 3.1–9.3×; inline off 23–34×, on 2.8–4.0×; component off 27–43×, on 3.0–4.2× (vs one context) |
| C12 | "Where every row reads the change, use(store) and one context are close" | **overreach** | True without the compiler: selection 6 tie, filter 6 tie, churn ≤1.05×, add/remove ≤1.1×. With the compiler: add/remove is {ctx.tally.on.vsContext.structure.range} (1.3–2.2×) and selection is up to 1.4× (`ctx.tally.on.vsContext.selection.range`) |

## Why the approaches differ

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C13 | Context re-renders every consumer; a context per slice narrows that to the changed slice's consumers; store re-renders only readers of the changed store | supported | Explainer `#performance` (line 525); React semantics. It's about consumers: in `context-split.jsx` the state owner `App` also re-renders on every update. |
| C14 | Entity edit: 1 row with store, 1,000 with either context, because every row reads the entities | supported | `counts.main.entity.{store,context,context-split}.on.rows` = 1 / 1,000 / 1,000; `context-split.jsx:38` reads the whole `EntitiesContext` |
| C15 | Selection re-renders every row in all three | supported | `counts.main.selection.*.{off,on}.rows` = 1,000 for each |
| C16a | "So the timing mostly follows the renders. Where use(store) renders fewer components, it wins by a lot." | supported | Entity and conditional reads against one context |
| C16b | "Where all three render every row, the difference is small, and it depends on what each render costs" | **contradicted** (in part) | Equal counted renders in add/remove (1,001 each on), yet with the compiler store is 1.3–2.2× faster than one context and {ctx.tally.on.vsContextSplit.structure.range} (1.6–2.8×) faster than a context per slice. Selection against a context per slice: 1.2–1.7×. "Depends on what each render costs" isn't measured. The work the counter can't see differs (C3, C55). |
| C17 | In the conditional reads, a context per slice "renders as few components as use(store)" | **overreach** (minor) | Counted renders: inline 30/30 on, 31/30 off; component 10/10 on, 11/10 off. The counter skips `App`, which re-renders on every update in context-split, and without the compiler `Count` and `Filter` re-render too (the +1 is `CountView`). |
| C18 | Store is still faster there: {ctx.tally.on.vsContextSplit.details-inline.range} with the compiler | supported | 1.9–2.5× faster, 6/6 |
| C19 | When a context value changes, React searches the tree below the Provider for consumers; a store update goes straight to its readers | supported | `bailoutOnChildren` → `lazilyPropagateParentContextChanges` → `propagateParentContextChanges` walks the subtree for fibers whose `dependencies` include a changed context (`ReactFiberBeginWork.js` ~4021, `ReactFiberNewContext.js:379-470`). The walk is lazy, during render, when a parent bails out, but it's still a search. Store: `enqueueConcurrentRenderForLaneOnMountedFiber` marks each reader directly (`ReactFiberConcurrentUpdates.js:194-205`). |
| C20 | "I think that search is most of the difference, but it isn't profiled" | **uncertain** (the hedge is honest about profiling, but incomplete) | No profile exists: `results/profiles/` has 4 `.cpuprofile` files, all store variants. The hedge names one cause and leaves out a second visible one: context-split re-renders `App` (8 `useState`, 7 Providers) on every update, uncounted. Store also beats a context per slice by 1.2–2.8× with the compiler in scenarios where the counted renders are identical and every row is a consumer (selection, add/remove). That points to a per-update cost beyond the conditional reads, which the search alone doesn't obviously explain. |

## Without the compiler

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C21 | Every component that re-renders also re-renders its children unless they're in `memo` | supported (in these apps) | Off counts ≈ 2× on. General React has more exceptions: a passed-through element with the same identity bails out, as does the experimental same-element bailout (DCP-10). See Hedges. |
| C22 | That's where the difference in renders shows most | supported | Entity: context 2,001 off vs 1,001 on; store 2 both |
| C23 | Entity edit off range | supported | 20–57×, 6/6 |
| C24 | Inline read off, vs one context and vs per slice (rows in `memo`) | supported | 23–34×; 2.5–3.2×; `context-split.jsx:36` |
| C25 | Selection and filter tie one context in every configuration (6 of 6 each) | supported (key gap) | `ctx.tally.off.vsContext.{selection,filter}.ties` = 6, `.total` = 6. Only the selection keys are cited. In each, 3 of the 6 ties are restart-disagreement ties (`.split` = 3). |
| C26 | Every row reads the changed value in both, so both re-render every row and its children | supported | `counts.main.selection.{store,context}.off.renders` 2,000 / 2,001 |
| C27 | One context wins only in subscribe churn, by at most 5% | supported | `ctx.tally.off.vsContext.lostScenarios` = subscribe churn, `.maxLossPct` = 5% |
| C28 | The chart has every configuration; pick a scenario, size and throttle and compare compiler settings | supported | `charts.mjs` `ctxChart`: scenario, rows and CPU controls; on and off dots per variant |

## With the compiler

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C29 | A re-rendering component returns cached elements when their inputs are unchanged, so children don't re-render | supported | `README.md` counters (selection: 1,000 rows but 2 `RowView`s with the compiler); `counts.main.*.on` |
| C30 | That helps all three | supported | compilerGain: context 42/42 faster, context-split 42/42, store 34 faster / 7 tie / 1 slower |
| C31 | "and it shrinks the gaps" | **overreach** | It shrinks the big gaps: entity 20–57× → 3.1–9.3×, inline 23–34× → 2.8–4.0×. It widens the small ones. Against one context: selection 6 tie → up to 1.4×; add/remove up to 1.1× → 1.3–2.2×. Against a context per slice: selection 1.1× → 1.2–1.7×, filter 1.05–1.2× → 1.1–1.4×, churn up to 1.1× → 1.1–1.3×, add/remove 1.1× → 1.6–2.8×. |
| C32 | Entity, selection, add/remove ranges on | supported | Generated |
| C33 | Add/remove: every variant re-renders every row, so it mostly measures list reconciliation | supported (see Hedges) | `counts.main.structure.*.rows` = 1,000; report `#method` note. But store is 1.3–2.8× faster there with the compiler at identical renders. |
| C34 | "One context wins in filter and subscribe churn, by at most 11%" | **overreach** (minor) | It wins 3 of 6 filter and 4 of 6 churn configurations (`ctx.tally.on.vsContext.{filter,details-churn}.losses`); store wins 2 of each. "Wins in filter" reads as winning the scenario. |
| C35 | A context per slice never wins | supported | `ctx.tally.on.vsContextSplit.lostScenarios` = none |

## What the compiler buys each

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C36 | "The compiler helps Context as much as it helps use(store), and sometimes more" | **contradicted** | Per-configuration gain ratios (from the `ctx.<scenario>.n*.x*.compilerGain.*` values): one context gains more in 26/42 and store in 16/42; a context per slice gains more in 20/42 and store in 22/42. Store gains more on add/remove in all 6 ({ctx.tally.compilerGain.store.structure.range} vs {ctx.tally.compilerGain.context.structure.range} and {ctx.tally.compilerGain.context-split.structure.range}), at selection N=10,000 (12–13× vs 8.4–9.6×), and over the per-slice variant in selection and filter at every configuration. Context gains far more only on entity and the conditional reads. (The gain comparisons are point ratios with no verdict rule applied.) |
| C37 | It never makes either Context approach slower | supported | `ctx.tally.compilerGain.{context,context-split}.all` 42 faster, 0 tie, 0 slower |
| C38 | Gain ranges | supported | Generated |
| C39 | No help for store on entity edits, because only one row re-renders | supported | `compilerGain.store.entity` 6 tie; `counts.main.entity.store.{off,on}` 2 renders, 1 row |
| C40 | Store is slower with the compiler in the child-component conditional read, by at most 9% | supported | `ctx.tally.compilerGain.store.{lostScenarios,maxLossPct}` |
| C41 | "I think Context gains more because it re-renders more. Every component the compiler lets React skip is one that Context re-rendered, and that use(store) often didn't render at all." | **overreach** (hedge premise) | The premise "Context gains more" holds only for entity and the conditional reads, where Context's counts are ≫ store's. In the every-row scenarios the counts are identical, and store gains as much or more (C36). |

## Typing and memory

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C42 | Typing into the filter while {typing.main.rows} expensive rows re-filter in a transition | supported | `README.md` typing row; `views.jsx` `work.iterations` ("configurable so the responsiveness scenario can make rows expensive") |
| C43 | All three update the list in a transition | supported | `store.jsx:62-66`, `context.jsx:68-73`, `context-split.jsx:77-82` |
| C44 | One context also holds the input's value, so each key's urgent update re-renders every row that reads the context | supported | `context.jsx:69` (urgent `setFilterInput` in the same reducer state), `:31` (every `Row` reads `StateContext`) |
| C45 | p95 at 1×, off: one context, store, per slice | supported | Generated: 159.8 / 12.6 / 15.7 |
| C46 | With the compiler, one context drops to {typing.main.context.on.x1.p95} | supported | 20.5 ms |
| C47 | "use(store) was slower with the compiler than without it, at {typing.main.store.on.x1.p95} ms" | **overreach** | Only at 1× CPU (12.6 → 17.0). At 4×, store is faster with the compiler: `typing.main.store.off.x4.p95` 42.3 → `typing.main.store.on.x4.p95` 39.9. The paragraph's "at no throttling" is in the previous paragraph and doesn't clearly carry over. |
| C48 | The typing benchmark has far fewer samples than the main suite | supported | `typing.main.keys` = 19, "3 runs" in the source |
| C49 | Store uses more memory per row than either Context approach | supported | `ctx.memory.storeVs.*` is 1.17–1.47× at all 3 sizes × 2 settings |
| C50 | Ratios at N=10,000 with the compiler | supported | 1.34×, 1.29× |
| C51 | The compiler adds bytes per row for all three | supported | `memory.{store,context,context-split}.on.*.bytesPerRow` > `.off` at every size |

## Where Context ties or wins

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C52 | Ties without the compiler on selection and filter, with the same renders (2,000 vs 2,001) | supported | As C25, C26 |
| C53 | One context wins in {lostScenarios} with the compiler, by at most 11% | overreach (minor) | Same as C34 |
| C54 | In those scenarios every row reads the changed value with both, so they render the same components (1,502 vs 1,502) | supported (counted components) | `counts.main.filter.{store,context}.on.renders` 1,502/1,502; churn 1,099/1,099 |
| C55 | "The difference is in what each render costs" | **unsupported** | Per-render cost isn't measured. There are competing causes the counts can't see. Subscribe churn exists to isolate "mounting and unmounting N/10 readers (subscribe/unsubscribe churn)" (`README.md` scenarios table), a cost only store's subscription records pay. In filter, one context also re-renders the uncounted `App` and `Filter`. |
| C56 | Both Context approaches use less memory per row | supported | `memory.rank.*`: context and context-split are 1st and 2nd at every size and setting |
| C57 | A context per slice never beats use(store) at the same setting | supported | Both `lostScenarios` = none |

## Method and caveats

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| C58 | Same method as the benchmark report | supported | Same sources and verdict rule |
| C59 | One frozen React build | supported | Report `#method` "The build" |
| C60 | "times behind an ambient-CPU gate" | **overreach** | The main suite's first restart ran under the load-average gate (`method.gate.head.loadGated` = 14, source "main r1 (14)"; report `#method` "Only the first restart of the main suite ran under it"). Every `ctx.tally.*` uses the main suite, r1 included. |
| C61 | Verdicts compare means and need every browser restart to agree | supported | `method.verdictRule` (ties are within two standard errors, or restarts disagree) |
| C62 | "a counting build counts the renders" | **overreach** | It counts `Row`, `RowView`, `DetailsView` and `CountView` renders only (`views.jsx`). The same overreach is in the generated `ctx-counts` caption and `README.md`. |
| C63 | Each comparison holds the compiler setting fixed | supported | Key semantics |
| C64 | Production build; each update in `flushSync` | supported | `README.md` setup (`NODE_PROD`), scenarios ("Each update runs inside `flushSync`") |
| C65 | Only the typing benchmark measures transitions | supported | `README.md` scenarios table |
| C66 | Add/remove is low-signal; every variant re-renders every row | supported | Report `#method` notes; counts |
| C67 | The Context apps are written "the usual way" | non-factual | Author judgment; `README.md` "as people do" |
| C68 | A Context app tuned with more splitting or more memo could do better | non-factual | Hedged speculation. It's consistent with the code: context-split keeps every slice's state in `App` (C7). |
| C69 | These results come from the same runs as the benchmark report | supported | C5 |
| C70 | Explainer and report links (`#problem`, `#performance`, `#differences`, `#method`, `#typing-memory`, `#reproduce`) | supported | All anchors exist |

## Counts

72 entries (C1–C70, plus C7b and the C16 split into a and b): **supported 55** (4 of them with a scope note: C21, C25, C33, C54), **overreach 10** (C3, C12, C17, C31, C34, C41, C47, C53, C60, C62; C34 and C53 are the same sentence pattern), **contradicted 2** (C16b, C36), **unsupported 1** (C55), **uncertain 1** (C20, the profiling hedge), **non-factual 3** (C7b, C67, C68). The validator passes (`validate_claim_ledger.py`: valid, no errors).

## Required fixes

1. **C36 (contradicted), line 183.** Replace "The compiler helps Context as much as it helps use(store), and sometimes more. It never makes either Context approach slower." with: "The compiler helps Context far more than `use(store)` on entity edits and the conditional reads, where Context re-renders far more. Where every row re-renders, it helps all three about as much, and helps `use(store)` most on add / remove ({ctx.tally.compilerGain.store.structure.range}, against {ctx.tally.compilerGain.context.structure.range} for one context). It never makes either Context approach slower."
2. **C41 (hedge premise), line 193.** Replace "I think Context gains more because it re-renders more." with: "On entity edits and the conditional reads, I think Context gains more because it re-renders more."
3. **C16b (contradicted), line 148.** Replace "Where all three render every row, the difference is small, and it depends on what each render costs." with: "Where all three render every row, the gaps are smaller, but they don't follow the render counts. With the compiler, `use(store)` is {ctx.tally.on.vsContext.structure.range} on add / remove against one context, with the same rows rendered."
4. **C3 (lede), line 93.** Replace "Where every component reads the value that changed, `use(store)` and one context do the same work." with: "Where every row reads the value that changed, `use(store)` and one context re-render the same rows."
5. **C12, line 136.** Replace "Where every row reads the change, `use(store)` and one context are close." with: "Where every row reads the change, they're close without the compiler. With it, `use(store)` pulls ahead on add / remove ({ctx.tally.on.vsContext.structure.range}), and one context wins some filter and subscribe-churn runs."
6. **C31, line 171.** Replace "That helps all three, and it shrinks the gaps." with: "That helps all three. It shrinks the big gaps, on entity edits and the conditional reads, and widens some small ones, like add / remove."
7. **C47, line 200.** Replace "`use(store)` was slower with the compiler than without it, at {typing.main.store.on.x1.p95} ms." with: "At no throttling, `use(store)` was slower with the compiler than without it, at {typing.main.store.on.x1.p95} ms. At four-times throttling it was faster with it ({typing.main.store.off.x4.p95} ms to {typing.main.store.on.x4.p95} ms)." (If "four-times" reads badly, use a generated throttle label rather than a bare digit.)
8. **C55, line 209.** Replace "The difference is in what each render costs." with: "The difference is in work the render counts don't show: what each render costs, and in subscribe churn, `use(store)` subscribing and unsubscribing the details readers."
9. **C34 / C53, lines 177 and 209.** Replace "One context wins in {ctx.tally.on.vsContext.lostScenarios}" with: "One context wins {ctx.tally.on.vsContext.all.losses} configurations, in {ctx.tally.on.vsContext.lostScenarios}".
10. **C60, line 217.** Replace "times behind an ambient-CPU gate" with: "times behind a CPU gate (ambient CPU, except the main suite's first restart, which ran under the load-average gate it replaced)".
11. **C62 and C17, lines 150 and 217.** Replace "a counting build counts the renders" with "a counting build counts renders of the rows and the shared views". At line 150, replace "renders as few components as `use(store)`" with "re-renders as few rows and views as `use(store)`".
12. **C20 (hedge), line 150.** Replace "I think that search is most of the difference, but it isn't profiled." with: "I think that search is most of the difference, along with the root re-rendering to update its providers on every change, but neither is profiled."
13. **C25 key gap, line 160.** Cite the filter keys too, e.g. "({ctx.tally.off.vsContext.selection.ties} of {ctx.tally.off.vsContext.selection.total} and {ctx.tally.off.vsContext.filter.ties} of {ctx.tally.off.vsContext.filter.total})".
14. **Outside this page (report it; I didn't edit it):** the `ctx-counts` caption in `docs/use-store/tools/charts.mjs` (`ctxCounts`, "every component render") and `fixtures/store-bench/README.md` ("`renders` is every component render") have the same overreach as C62.

## Hedges to check

- **C20, "isn't profiled":** honest. No context profile exists (`results/profiles/` holds store-only cpuprofiles). But the belief is narrower than the evidence. A context per slice is slower than store in every compiler-on scenario, including identical-render ones (selection 1.2–1.7×, add/remove 1.6–2.8×). That suggests a per-update overhead, such as the `App` re-render with 8 hooks and 7 Providers, as well as the consumer search. A cpuprofile of `context-split` vs `store` on `details-inline` and `selection` at N=1,000 would settle it.
- **C33 / C66, "mostly measures list reconciliation":** the counts are identical, yet with the compiler store is 1.3–2.2× faster than one context and 1.6–2.8× faster than a context per slice. Without the compiler the gap is ≤1.1×. Whatever add/remove measures, it differs between variants with the compiler, so "low-signal" may undersell a real effect. Worth a look before leaning on it in C12 or C16.
- **C25 ties:** half the selection and filter ties without the compiler (3 of 6 each) are restart-disagreement ties, not within-two-SE ties. "Tie" is correct under the verdict rule.
- **C47, "I don't know why yet":** fine, but the 4× reversal suggests the 1× result may be noise on 19 keys × 3 runs. The existing "treat differences this small with care" covers it once the scope is fixed.
- **C21, "re-renders its children unless memo":** fine for these apps. In general React, a re-render also bails out on an element of the same identity (passed-through children, and the experimental same-element bailout, DCP-10). Optional narrowing: "re-renders the components it renders".
- **C68, "could do better":** well-hedged and consistent with the code. The obvious tuning is moving each slice's state out of `App`.
- **"I think" in C41:** keep the hedge, but scope it (fix 2).

## Validator ledger

```json
{
  "evidence_scope": "bench-data.json (build a3d8e745), store-bench apps and README, shared/views.jsx, benchmark-report #method, explainer #performance, charts.mjs ctx generators, reconciler source, results/profiles",
  "claims": [
    {"id": "C1", "claim": "Matches or beats a context per slice in every configuration, both settings", "status": "supported", "verdict": "supported", "evidence": "ctx.tally.{off,on}.vsContextSplit.all 42/42", "remedy": "keep"},
    {"id": "C2", "claim": "35 of 42 vs one context with the compiler, loses by at most 11%", "status": "supported", "verdict": "supported", "evidence": "ctx.tally.on.vsContext.all, maxLossPct", "remedy": "keep"},
    {"id": "C3", "claim": "Where every component reads the changed value, store and one context do the same work", "status": "uncertain", "verdict": "overreach", "evidence": "Equal counted renders; uncounted App/Filter/Count re-render in context; timing differs up to 2.2x with the compiler", "remedy": "qualify"},
    {"id": "C4", "claim": "Synthetic, experimental behind enableStore, not shipped", "status": "supported", "verdict": "supported", "evidence": "ReactFeatureFlags.js:117", "remedy": "keep"},
    {"id": "C5", "claim": "Same results as the benchmark report", "status": "supported", "verdict": "supported", "evidence": "sources.main 46 files", "remedy": "keep"},
    {"id": "C6", "claim": "One context: useReducer at the root, one Provider", "status": "supported", "verdict": "supported", "evidence": "context.jsx:22,85,90-100", "remedy": "keep"},
    {"id": "C7", "claim": "Context per slice: Provider per slice, memo rows", "status": "supported", "verdict": "supported", "evidence": "context-split.jsx:22-28,36,112-134", "remedy": "keep"},
    {"id": "C7b", "claim": "the way people usually do", "status": "non-factual", "verdict": "non-factual", "evidence": "README caveat", "remedy": "keep"},
    {"id": "C8", "claim": "Store per entity plus small stores", "status": "supported", "verdict": "supported", "evidence": "store.jsx:89-101", "remedy": "keep"},
    {"id": "C9", "claim": "Comparisons at the same compiler setting", "status": "supported", "verdict": "supported", "evidence": "ctx.tally sources", "remedy": "keep"},
    {"id": "C10", "claim": "Scoreboard ranges", "status": "supported", "verdict": "supported", "evidence": "generated", "remedy": "keep"},
    {"id": "C11", "claim": "Big wins on entity and conditional reads", "status": "supported", "verdict": "supported", "evidence": "ctx.tally ranges", "remedy": "keep"},
    {"id": "C12", "claim": "Where every row reads the change, store and one context are close", "status": "uncertain", "verdict": "overreach", "evidence": "On: structure 1.3-2.2x, selection up to 1.4x", "remedy": "qualify"},
    {"id": "C13", "claim": "Context re-renders consumers; split narrows; store re-renders readers", "status": "supported", "verdict": "supported", "evidence": "explainer #performance", "remedy": "keep"},
    {"id": "C14", "claim": "Entity: 1 row store, 1,000 either context", "status": "supported", "verdict": "supported", "evidence": "counts.main.entity.*.on.rows", "remedy": "keep"},
    {"id": "C15", "claim": "Selection re-renders every row in all three", "status": "supported", "verdict": "supported", "evidence": "counts.main.selection.*.rows", "remedy": "keep"},
    {"id": "C16a", "claim": "Timing mostly follows renders; fewer renders wins by a lot", "status": "supported", "verdict": "supported", "evidence": "entity/details vs one context", "remedy": "keep"},
    {"id": "C16b", "claim": "Where all render every row the difference is small and depends on per-render cost", "status": "unsupported", "verdict": "contradicted", "evidence": "structure on 1.3-2.2x / 1.6-2.8x at equal renders", "remedy": "qualify"},
    {"id": "C17", "claim": "Per slice renders as few components as store in conditional reads", "status": "uncertain", "verdict": "overreach", "evidence": "Counted 30/30, 10/10; App uncounted", "remedy": "qualify"},
    {"id": "C18", "claim": "Store still faster on inline read with the compiler", "status": "supported", "verdict": "supported", "evidence": "ctx.tally.on.vsContextSplit.details-inline", "remedy": "keep"},
    {"id": "C19", "claim": "Context searches below the Provider; store goes straight to readers", "status": "supported", "verdict": "supported", "evidence": "ReactFiberNewContext.js propagateParentContextChanges; ReactFiberConcurrentUpdates.js", "remedy": "keep"},
    {"id": "C20", "claim": "That search is most of the difference (not profiled)", "status": "uncertain", "verdict": "uncertain", "evidence": "No context profile; App re-render uncounted; split slower at identical renders", "remedy": "qualify"},
    {"id": "C21", "claim": "Without the compiler, re-renders cascade unless memo", "status": "supported", "verdict": "supported", "evidence": "counts off vs on", "remedy": "keep"},
    {"id": "C22", "claim": "Render difference shows most without the compiler", "status": "supported", "verdict": "supported", "evidence": "counts", "remedy": "keep"},
    {"id": "C23", "claim": "Entity off range", "status": "supported", "verdict": "supported", "evidence": "generated", "remedy": "keep"},
    {"id": "C24", "claim": "Inline read off ranges, memo rows", "status": "supported", "verdict": "supported", "evidence": "generated; context-split.jsx:36", "remedy": "keep"},
    {"id": "C25", "claim": "Selection and filter tie in every configuration", "status": "supported", "verdict": "supported", "evidence": "ctx.tally.off.vsContext.{selection,filter}.ties 6/6", "remedy": "source"},
    {"id": "C26", "claim": "Both re-render every row and its children", "status": "supported", "verdict": "supported", "evidence": "2,000 vs 2,001", "remedy": "keep"},
    {"id": "C27", "claim": "One context wins only in subscribe churn, at most 5%", "status": "supported", "verdict": "supported", "evidence": "ctx.tally.off.vsContext.lostScenarios", "remedy": "keep"},
    {"id": "C28", "claim": "Chart has every configuration with controls", "status": "supported", "verdict": "supported", "evidence": "charts.mjs ctxChart", "remedy": "keep"},
    {"id": "C29", "claim": "Compiler returns cached elements; children skip", "status": "supported", "verdict": "supported", "evidence": "README counters", "remedy": "keep"},
    {"id": "C30", "claim": "Compiler helps all three", "status": "supported", "verdict": "supported", "evidence": "compilerGain tallies", "remedy": "keep"},
    {"id": "C31", "claim": "Compiler shrinks the gaps", "status": "uncertain", "verdict": "overreach", "evidence": "Big gaps shrink; selection/structure gaps widen", "remedy": "qualify"},
    {"id": "C32", "claim": "On ranges", "status": "supported", "verdict": "supported", "evidence": "generated", "remedy": "keep"},
    {"id": "C33", "claim": "Add/remove re-renders every row, mostly list reconciliation", "status": "supported", "verdict": "supported", "evidence": "counts; report #method", "remedy": "keep"},
    {"id": "C34", "claim": "One context wins in filter and churn with the compiler", "status": "uncertain", "verdict": "overreach", "evidence": "3/6 filter, 4/6 churn", "remedy": "qualify"},
    {"id": "C35", "claim": "Per slice never wins with the compiler", "status": "supported", "verdict": "supported", "evidence": "lostScenarios none", "remedy": "keep"},
    {"id": "C36", "claim": "Compiler helps Context as much as store, sometimes more", "status": "unsupported", "verdict": "contradicted", "evidence": "Store gains more in 16/42 vs context, 22/42 vs split; all structure configs", "remedy": "qualify"},
    {"id": "C37", "claim": "Compiler never slows either Context approach", "status": "supported", "verdict": "supported", "evidence": "42/42 faster each", "remedy": "keep"},
    {"id": "C38", "claim": "Gain ranges", "status": "supported", "verdict": "supported", "evidence": "generated", "remedy": "keep"},
    {"id": "C39", "claim": "No compiler help for store on entity; one row", "status": "supported", "verdict": "supported", "evidence": "6 tie; counts", "remedy": "keep"},
    {"id": "C40", "claim": "Store slower with compiler in child conditional read, at most 9%", "status": "supported", "verdict": "supported", "evidence": "compilerGain.store.lostScenarios", "remedy": "keep"},
    {"id": "C41", "claim": "Context gains more because it re-renders more", "status": "uncertain", "verdict": "overreach", "evidence": "Premise only holds for entity and conditional reads", "remedy": "qualify"},
    {"id": "C42", "claim": "Typing setup", "status": "supported", "verdict": "supported", "evidence": "README; views.jsx", "remedy": "keep"},
    {"id": "C43", "claim": "All three update list in a transition", "status": "supported", "verdict": "supported", "evidence": "apps", "remedy": "keep"},
    {"id": "C44", "claim": "One context holds input value; urgent update re-renders rows", "status": "supported", "verdict": "supported", "evidence": "context.jsx:31,69", "remedy": "keep"},
    {"id": "C45", "claim": "Typing p95 off x1", "status": "supported", "verdict": "supported", "evidence": "generated", "remedy": "keep"},
    {"id": "C46", "claim": "One context drops with compiler", "status": "supported", "verdict": "supported", "evidence": "20.5 ms", "remedy": "keep"},
    {"id": "C47", "claim": "Store slower with compiler in typing", "status": "uncertain", "verdict": "overreach", "evidence": "1x only; 4x 42.3 -> 39.9", "remedy": "qualify"},
    {"id": "C48", "claim": "Typing has far fewer samples", "status": "supported", "verdict": "supported", "evidence": "19 keys x 3 runs", "remedy": "keep"},
    {"id": "C49", "claim": "Store uses more memory than either Context", "status": "supported", "verdict": "supported", "evidence": "ctx.memory.storeVs.* > 1 everywhere", "remedy": "keep"},
    {"id": "C50", "claim": "Memory ratios at N=10,000 on", "status": "supported", "verdict": "supported", "evidence": "generated", "remedy": "keep"},
    {"id": "C51", "claim": "Compiler adds bytes per row for all three", "status": "supported", "verdict": "supported", "evidence": "memory.*.bytesPerRow", "remedy": "keep"},
    {"id": "C52", "claim": "Ties off with same renders", "status": "supported", "verdict": "supported", "evidence": "counts", "remedy": "keep"},
    {"id": "C53", "claim": "One context wins with compiler in filter and churn (repeat)", "status": "uncertain", "verdict": "overreach", "evidence": "as C34", "remedy": "qualify"},
    {"id": "C54", "claim": "Same components render in filter and churn", "status": "supported", "verdict": "supported", "evidence": "1,502/1,502; 1,099/1,099 counted", "remedy": "keep"},
    {"id": "C55", "claim": "Difference is in what each render costs", "status": "unsupported", "verdict": "unsupported", "evidence": "Not measured; churn isolates subscribe cost; uncounted App/Filter", "remedy": "qualify"},
    {"id": "C56", "claim": "Context uses less memory", "status": "supported", "verdict": "supported", "evidence": "memory.rank.*", "remedy": "keep"},
    {"id": "C57", "claim": "Per slice never beats store", "status": "supported", "verdict": "supported", "evidence": "lostScenarios none both", "remedy": "keep"},
    {"id": "C58", "claim": "Same method as report", "status": "supported", "verdict": "supported", "evidence": "report #method", "remedy": "keep"},
    {"id": "C59", "claim": "One frozen build", "status": "supported", "verdict": "supported", "evidence": "report #method", "remedy": "keep"},
    {"id": "C60", "claim": "Times behind an ambient-CPU gate", "status": "uncertain", "verdict": "overreach", "evidence": "main r1 under load-average gate (method.gate.head.loadGated)", "remedy": "qualify"},
    {"id": "C61", "claim": "Verdicts compare means, restarts agree", "status": "supported", "verdict": "supported", "evidence": "method.verdictRule", "remedy": "keep"},
    {"id": "C62", "claim": "Counting build counts the renders", "status": "uncertain", "verdict": "overreach", "evidence": "views.jsx counts four components only", "remedy": "qualify"},
    {"id": "C63", "claim": "Compiler setting held fixed", "status": "supported", "verdict": "supported", "evidence": "key semantics", "remedy": "keep"},
    {"id": "C64", "claim": "Production build, flushSync", "status": "supported", "verdict": "supported", "evidence": "README", "remedy": "keep"},
    {"id": "C65", "claim": "Only typing measures transitions", "status": "supported", "verdict": "supported", "evidence": "README", "remedy": "keep"},
    {"id": "C66", "claim": "Add/remove low-signal", "status": "supported", "verdict": "supported", "evidence": "report #method", "remedy": "keep"},
    {"id": "C67", "claim": "Context apps written the usual way", "status": "non-factual", "verdict": "non-factual", "evidence": "author judgment", "remedy": "keep"},
    {"id": "C68", "claim": "Tuned Context app could do better", "status": "non-factual", "verdict": "non-factual", "evidence": "hedged speculation", "remedy": "keep"},
    {"id": "C69", "claim": "Same runs as report", "status": "supported", "verdict": "supported", "evidence": "C5", "remedy": "keep"},
    {"id": "C70", "claim": "Links resolve", "status": "supported", "verdict": "supported", "evidence": "anchors exist", "remedy": "keep"}
  ]
}
```
