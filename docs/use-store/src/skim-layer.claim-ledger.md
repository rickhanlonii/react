# Claim ledger: the skim layer (dashboard, benchmark report, Context page)

Scope: only the new skimmable layer. That's the stat tiles and their labels, the bold takeaways, the card headings, the verdict-grid captions, and the dashboard's "Explain →" targets. Everything else was audited in `benchmark-report.claim-ledger.md` and `store-vs-context.claim-ledger.md`.

Evidence: `bench-data.json` values (build a3d8e745, queried 2026-11-02), the renderers in `tools/charts.mjs` (`statTiles`, `lossesTable`, `scoreboard`), the page sources, and the two earlier ledgers. What's new was found by diffing against `/tmp/bench.src.pre-skim.html` and `/tmp/ctx.src.pre-skim.html`. Method: `writing-quality:claim-boundary-checker`. The JSON ledger is at the end and passes `validate_claim_ledger.py`.

Statuses: **supported**, **uncertain** (true only at a narrower scope than the line states, or the line lost a locked scope word), **unsupported** (no key backs it at the stated scope).

## Counts

| Page | Items | Supported | Uncertain | Unsupported |
|---|---|---|---|---|
| Dashboard | 6 tiles, 23 cards (24 rows: the losses card has two), links, footer | 26 | 4 | 2 |
| Benchmark report | 5 tiles, 13 bold lines or callouts | 10 | 8 | 0 |
| Context page | 4 tiles, 6 bold lines | 7 | 3 | 0 |

Dashboard links: all 23 "Explain →" targets land on the section that explains that card (see D-L).

## 1. Dashboard (`dashboard.src.html`)

### Stat tiles

| ID | Tile (label · key · note) | Verdict | Evidence |
|---|---|---|---|
| D-T1 | Main suite, matches or beats · 39/42 · against the faster of Redux and Zustand, with the compiler | supported | `main.tally.selectors.all.{matchOrBeat,total}` |
| D-T2 | Main suite, losses · 3 · all in selection, when every row reads the selection | supported | `.losses` = 3. `main.tally.selectors.selection.losses` = 3, every other scenario 0. The main suite's rows all read the selection by design |
| D-T3 | Keyed selection, selection sweeps · 14/14 · won (it isn't timed in the main suite) | supported | `sweep.tally.store-keyed.selection.{wins,total}`. Keeps the locked scope words |
| D-T4 | weakMemo, derived-data spike · 12/12 · configurations that do any work, won against Redux | supported | `spike.tally.store-memo.{wins,total}`. The total leaves out `noWork` = 4. Keeps the scope words |
| D-T5 | One context, matches or beats · 35/42 · with the compiler, and a context per slice never wins | supported | `ctx.tally.on.vsContext.all`. `ctx.tally.{on,off}.vsContextSplit.all.losses` = 0 |
| D-T6 | **Every loss counted** · 41/224 · across the headline, the granular control, the suites, the fairness run, the sweeps, and the spike | **unsupported (label)** | `losses.all` sums six areas only (`losses.scope`). It leaves out the controls: one context 7, one store 7, no compiler 18, no bailout 4, and **the fairness run against Zustand, 2** (`losses.control.fairness5Zustand`). So "every loss" is wrong, and "the fairness run" is too broad. This is prior finding L1 again, now in a label |

### Cards

| ID | Card | Heading / takeaway | Verdict | Evidence |
|---|---|---|---|---|
| D-C1 | scoreboard | Entity edit re-renders one row instead of a selector per row (2.4–9.2×) | supported | `main.tally.selectors.entity.range`. The heading scopes the comparison |
| D-C2 | verdicts | "It loses when the selection changes: 1.1× slower to 1.4× faster (1 faster, 2 tie, 3 slower)" | **uncertain** | It loses 3 of the 6 selection configurations (`main.tally.selectors.selection.{losses,total}`). On a card titled "Which configurations does it lose?", "It loses when the selection changes" reads as every time, and the range in the same line contradicts it |
| D-C3 | main chart | "Adding or removing a row is 2.9–7.8× faster, and conditional reads are 2.4–4.2× faster" | **uncertain** | These ranges are against the faster of Redux and Zustand, but the card charts every variant and the line names no comparison. Add / remove is low-signal (key source note: same render work for every variant, mostly list reconciliation; the report's caveats say so) |
| D-C4 | controls | "One store holding everything, with no selectors, still beats … in most configurations" | **uncertain** | The key is `store-single` *with* the compiler (`main.tally.single-selectors.all`), but the card is headed "one store, and no compiler", so a reader can take the result as uncompiled. 26/42 faster does support "most" |
| D-C5 | counts | 1 row vs 4,003 selector calls | supported | `counts.main.entity.store.on.rows`, `counts.main.entity.redux.on.selectors`. The heading says "from the counting build" |
| D-C6 | sweeps | Heading "Keyed selection wins every selection sweep". Takeaway 14/14 selection, 14/14 entity | supported | `sweep.tally.store-keyed.{selection,entity}` |
| D-C7 | losses | Heading "**Every loss**, with what each side did" | **unsupported** | `lossesTable` renders only the six counted areas (`charts.mjs:1120-1127`). The controls are excluded, as in D-T6 |
| D-C7b | losses | Takeaway: main suite 3 of 42, all selection, keyed selection not timed in the main suite | supported | `losses.main`. Keeps "it isn't timed in the main suite" |
| D-C8 | derived | Heading "weakMemo turns the losses into wins". Plain 1.1–1.4× slower, store-memo 1.3–1.5× faster | supported | `suite.derived-selectors.tally.store` losses 6/6, `store-memo` wins 6/6 (2 no-work excluded from both) |
| D-C9 | spike | Heading "With more readers per category, plain falls further behind". store-memo ahead of Redux | supported | `spike.tally.store.k20.rangeWork` 2.1–2.5× slower, `k50` 3.6–4.5× slower. `spike.tally.store-memo.rangeWork` 1.4–1.9× faster |
| D-C10 | ctx scoreboard | Heading "At the same compiler setting, a context per slice never wins". 35 of 42, at most 11% in the rest | supported | `vsContextSplit` losses 0 at both settings. `ctx.tally.on.vsContext` has 7 losses, 0 ties, `maxLossPct` 11% |
| D-C11 | ctx gain | "The compiler helps Context far more than use(store) on entity edits and the conditional reads, where Context re-renders many more components" | **uncertain** | True for one context: gain 6.0–7.9× entity and 8.7–12× inline, against store's tie and 1.1–1.3×. For a context per slice on the conditional reads, the gain is 1.3–1.8× (inline) and 1.3–1.7× (component), against store's 1.1–1.3× and about 1×. That isn't "far more", and it renders the same components as store there (30 and 10 counted renders each). True for both Context approaches on entity edits |
| D-C12 | ctx chart | Without the compiler, ranges against one context and against a context per slice | supported | `ctx.tally.off.{vsContext,vsContextSplit}.all.range` |
| D-C13 | ctx verdicts | One context wins 7 with the compiler, in filter and subscribe churn, by at most 11% | supported | `ctx.tally.on.vsContext.{all.losses,lostScenarios,maxLossPct}` |
| D-C14 | ctx counts | Heading and takeaway: where every row reads the change, they render the same rows | supported | `counts.main.{selection,filter,structure,details-churn}.*.on.rows` = 1,000 for all three |
| D-C15 | rapid dispatch | 1.5–1.9× faster | supported | `suite.rapid-dispatch.tally.store.range` (against the fastest of Redux and Zustand; not named, see recommendations) |
| D-C16 | same counter | 1.2× faster | supported | `suite.many-components-same-slice.tally.store.range` |
| D-C17 | deep tree | up to 2.2× faster (11 faster, 1 tie) | supported | `suite.deeptree-nested-hooks.tally.store.range` |
| D-C18 | fairness | Hand-written reducer and no-freeze ranges against Redux Toolkit | supported | `suite.fairness.control.{redux-plain,redux-nofreeze}.range` |
| D-C19 | fairness5 | At 1,000 rows, 14 of 14 against the fastest Redux setup | supported | `suite.fairness5.tally.fastestRedux`. Report `#fairness`: "at countsRows rows". Keeps the locked "at … rows" |
| D-C20 | bailout | Over the same 28, 26 with the bailout and 24 without | supported | `nobailout.main.tally.*` ("the same" has no antecedent on the dashboard, see recommendations) |
| D-C21 | typing | p95 at 4×, with the compiler: 39.9 / 131.7 / 193.5 ms | supported | `typing.main.{store,zustand,redux}.on.x4.p95` |
| D-C22 | typing suite | Heading "With useDeferredValue, the selector libraries close most of the gap". Takeaway on `startTransition` | supported | `typing.suite.*.on.x4.p95` 44.2 / 49.1 / 61.1. Mixes runs (prior T3 hedge) |
| D-C23 | memory | Largest size with the compiler: 2,901 / 4,549 / 7,191 bytes per row | supported | `memory.*.on.n10000.bytesPerRow`. n10000 is the largest size |
| D-L | links | Each "Explain →" target | supported | `#claim` (scoreboard + "What the scoreboard compares"), `#main` (verdict grid, main chart), `#controls`, `#work`, `#sweeps` (sweep chart), `#losses` (losses table), `#derived-results` (spike chart and derived-selectors table, both under it), Context `#summary` (ctx-scoreboard), `#compiler-gain`, `#no-compiler` (ctx-chart; the takeaway is the no-compiler result), `#context-wins` (explains the 7 losses; `#compiler` would also do), `#why` (ctx-counts), `#redux-suites` ×3, `#fairness` ×2, `#bailout`, `#typing` ×2 (both tables under it), `#memory` |
| D-F | footer | Synthetic benchmarks, no real-app data yet | supported | Report header note, `#caveats` |

## 2. Benchmark report (`benchmark-report.src.html`)

### "At a glance" tiles (keys mode: matchOrBeat/total, the sub-line, and a loss status)

| ID | Label · key | Verdict | Evidence |
|---|---|---|---|
| B-T1 | "vs the faster of Redux and Zustand" · `main.tally.selectors.all` 39/42, "3 slower" | supported | It's the headline, with the scoreboard below. Optional: name the main suite (see recommendations) |
| B-T2 | "Keyed selection, selection sweeps" · `sweep.tally.store-keyed.selection` 14/14 | supported | The label says "sweeps", so it doesn't claim the main suite |
| B-T3 | "weakMemo, shared derived data" · `spike.tally.store-memo` 12/12, sub `rangeWork` | **uncertain** | The key is store-memo **against Redux only**, **in the spike only**, and the 12 **leave out 4 no-work configurations**. The label says none of this, and it sits next to a tile against the faster of Redux and Zustand. It drops the locked "that does any work" |
| B-T4 | "vs the fastest Redux setup" · `suite.fairness5.tally.fastestRedux` 14/14 | **uncertain** | The fairness run is one size, 1,000 rows (prior M13). The label names neither the run nor the size, and 14/14 beside the 42-configuration tile reads as complete |
| B-T5 | "vs a Zustand store per entity" · `main.tally.zustand-granular.all` 36/42, "6 slower" | supported | It matches `losses.granular`. `#losses` explains the granular losses |

### Bold takeaways and the callout

| ID | Line | Verdict | Evidence |
|---|---|---|---|
| B-1 | NEW. "Entity edits, adding or removing a row, and conditional reads win by wide margins: 2.4–9.2×, 2.9–7.8×, 2.4–4.2× faster." | **uncertain** | The numbers are right (`main.tally.selectors.{entity,structure,details-inline}.range`), but they're against the faster of Redux and Zustand, and the compact scoreboard directly above shows every column (Redux, Zustand, both Contexts, granular). Add / remove is the scenario the page itself calls low-signal (line 615, "mostly measures list reconciliation"), and here it's billed as a wide-margin win with no caveat |
| B-2 | NEW (unbolded follow-on). "The only scenario with losses is selection." | **uncertain** | That holds for the headline only. The same scoreboard shows one context losing in filter and subscribe churn (`main.tally.context.{filter,details-churn}.losses` = 3, 4), and the granular control losing one subscribe churn (`main.tally.zustand-granular.details-churn.losses` = 1) |
| B-3 | Callout. "The headline is lower than the last report's." | **uncertain** | The share fell, from 36/36 to 39/42 (`history.final.tally.selectors.all`), but the count *rose*, from 36 to 39. An unnumbered "lower" right after a "39/42" tile invites the wrong reading. The rest of the callout is supported (prior W-series). It doesn't attribute the cause, so it doesn't need "neither change was isolated" |
| B-4 | NEW. "The only scenario with losses is selection. Every other scenario matches or beats the faster of Redux and Zustand in every configuration." (`#main`) | supported | `main.tally.selectors.*.losses` = 0 except selection = 3. `matchOrBeat` 39 = 42 − 3, so no other non-win. It sits under the headline verdict grid and names the comparison |
| B-5 | `#work`. 1 row vs 4,003 selector calls | supported | `counts.main.entity` |
| B-6 | `#controls`. store-single still beats the faster of Redux and Zustand in most configurations | supported | 26 faster, 9 tie, 7 slower. See the recommendation on "with the compiler" |
| B-7 | `#fairness`. "Against the fastest Redux setup in each configuration, use(store) matches or beats it in 14 of 14, by 1.4–10×." | **uncertain** | It lost the locked "at … rows" scope. In the pre-skim text, the sentence followed "at <countsRows> rows" (old line 267), and prior fix M13 required the size. Now the size is only inside the collapsed details |
| B-8 | `#selection`. "Selection is where use(store) loses - that's the floor of a model without selectors, not a bug." | **uncertain** | Prior SE1 (overreach) was fixed by putting the scope inside this sentence: "…not a bug: a profile of two-store rows (below) puts the gap in running the component". The restructure moved the scope out of the bold, so the bold line is back to the unscoped SE1 claim |
| B-9 | `#sweeps`. Keyed selection wins every selection and entity configuration (14/14 each) | supported | `sweep.tally.store-keyed.*`. "Every configuration" is bounded by the sweep chart and section |
| B-10 | NEW. "Plain use(store) loses only on derived selectors (6 configurations), and with weakMemo it wins those too." | **uncertain (overreach as a skim line)** | It's true within the four ported suites: `losses.suites` = 6 of 38, all derived selectors. Rapid dispatch 1.5–1.9×, same counter 1.2×, and deep tree 11 faster, 1 tie are all wins, and `store-memo` wins 6/6. **The only scope is the h2 above it.** The sentence itself says "only", and read alone it's false: plain `use(store)` also loses main-suite selection (3), every selection sweep (`sweep.tally.store.selection.losses` 14/14), and every spike configuration that does work (`spike.tally.store.losses` 12/12). On a skim layer the bold line has to carry its own scope |
| B-11 | `#derived`. weakMemo beats Redux in every spike configuration that does any work | supported | `spike.tally.store-memo` 12/12, `noWork` 4. Keeps the locked scope words |
| B-12 | `#bailout`. 26 with the bailout and 24 without, over 28 | supported | `nobailout.main.tally.*` |
| B-13 | `#typing`. p95 at 4× with the compiler, and the "list caught up after" definition | supported | `typing.main.*.on.x4.p95`. The second sentence is a definition, not a result (bolding it is an editorial choice) |

## 3. Context page (`store-vs-context.src.html`)

All six bold lines were promoted from audited prose. The checks here are whether promotion stripped context.

| ID | Item | Verdict | Evidence |
|---|---|---|---|
| C-T1 | "vs a context per slice, with the compiler" · 42/42 | supported | `ctx.tally.on.vsContextSplit.all` |
| C-T2 | "vs one context, with the compiler" · 35/42, 7 slower | supported | `ctx.tally.on.vsContext.all` |
| C-T3 | "vs a context per slice, without the compiler" · 42/42 | supported | `ctx.tally.off.vsContextSplit.all` (40 faster, 2 tie) |
| C-T4 | "vs one context, without the compiler" · 39/42, 3 slower | supported | `ctx.tally.off.vsContext.all` (24 faster, 15 tie, 3 slower). All four are same-setting comparisons, as the page says |
| C-1 | "The big wins are where few components read the change: editing one entity, and the conditional reads." | **uncertain** | Prior C11's evidence was against one context only, where it holds at both settings (entity 20–57× / 3.1–9.3×, conditional reads 23–43× / 2.8–4.2×, everything else ≤ 2.2×). It now sits under a scoreboard with both Context approaches. Against a context per slice with the compiler, add / remove (1.6–2.8×) is as big as the conditional reads (1.8–2.5×), and a context per slice renders as few components as store on the conditional reads |
| C-2 | "So the timing mostly follows the renders. Where use(store) renders fewer rows and views, it wins by a lot." | supported | Prior C16a. Note: it's now the first line of `#why`, *before* the counts it concludes from, so "So" has no antecedent (see recommendations) |
| C-3 | "One context wins only in subscribe churn, by at most 5%." | **uncertain** | True without the compiler (`ctx.tally.off.vsContext.{lostScenarios,maxLossPct}`), but the line doesn't name a setting. The paragraph and chart between it and the h2 compare both settings, and the next bold line says one context wins in "filter and subscribe churn". Read in sequence, the skim layer contradicts itself |
| C-4 | "One context wins 7 configurations, in filter and subscribe churn, by at most 11%. A context per slice never wins." | supported | `ctx.tally.on.vsContext.*`. `vsContextSplit` losses 0. It's directly under the "With the compiler" h2 |
| C-5 | "The compiler helps Context far more than use(store) on entity edits and the conditional reads, where Context re-renders many more components." | **uncertain** | As D-C11: true for one context, and for a context per slice only on entity edits |
| C-6 | Typing without the compiler at 1×: 159.8 / 12.6 / 15.7 ms | supported | `typing.main.{context,store,context-split}.off.x1.p95` |

## Required fixes

### Dashboard (`dashboard.src.html`)

1. **D-T6.** Change the tile's `label` to `"Losses in the counted results"` and its `note` to `"across the headline, the granular control, the ported Redux suites, the fairness run against Redux, the sweeps, and the spike (the controls aren't counted)"`.
2. **D-C7.** Change the heading to: `Every counted loss, and what it lost to`.
3. **D-C2.** Change the takeaway to:
   > All of its losses are when the selection changes: <span data-n="main.tally.selectors.selection.losses"></span> of the <span data-n="main.tally.selectors.selection.total"></span> selection configurations (<span data-n="main.tally.selectors.selection.range"></span>).
4. **D-C3.** Change the takeaway to:
   > Against the faster of Redux and Zustand, adding or removing a row is <span data-n="main.tally.selectors.structure.range"></span>, and conditional reads are <span data-n="main.tally.selectors.details-inline.range"></span>. Add / remove mostly measures list reconciliation, because every variant re-renders every row.
5. **D-C4.** Change the takeaway to:
   > With the compiler, one store holding everything, with no selectors, still beats the faster of Redux and Zustand in most configurations: <span data-n="main.tally.single-selectors.all.range"></span>.
6. **D-C11.** Change the takeaway to (and make the same change on the Context page, C-5):
   > The compiler helps one context far more than <code>use(store)</code> on entity edits and the conditional reads, where one context re-renders many more components. It helps a context per slice far more only on entity edits.

### Benchmark report (`benchmark-report.src.html`)

7. **B-10.** Give the line its own scope:
   > <strong>In the ported Redux suites, plain <code>use(store)</code> loses only on derived selectors (<span data-n="suite.derived-selectors.tally.store.losses"></span> configurations), and with <code>weakMemo</code> it wins those too.</strong>
8. **B-1 and B-2.** Change the opening takeaway to:
   > <strong>Against the faster of Redux and Zustand, entity edits, adding or removing a row, and conditional reads win by wide margins: …, …, and ….</strong> Add / remove mostly measures list reconciliation (see <a href="#caveats">caveats</a>). Against them, the only scenario with losses is <span data-n="main.tally.selectors.lostScenarios"></span> (see <a href="#selection">selection</a>).
9. **B-7.** Restore the size:
   > <strong>At <span data-n="method.countsRows"></span> rows, against the fastest Redux setup in each configuration, <code>use(store)</code> matches or beats it in … of …, by ….</strong>
10. **B-8.** Bring SE1's scope back into the bold line:
    > <strong>Selection is where <code>use(store)</code> loses. A profile of two-store rows (below) puts the gap in running the component, not in the store, which is the floor of a model without selectors, not a bug.</strong> The fix is keyed selection, and it wins every configuration where it was measured.
11. **B-3.** Put the numbers in the callout:
    > <strong>The headline is lower than the last report's:</strong> <span data-n="main.tally.selectors.all.matchOrBeat"></span> of <span data-n="main.tally.selectors.all.total"></span> configurations, against <span data-n="history.final.tally.selectors.all.matchOrBeat"></span> of <span data-n="history.final.tally.selectors.all.total"></span>. A review fixed two places … (rest unchanged)
12. **B-T3.** Change the tile label to `"weakMemo vs Redux, spike configurations that do work"`.
13. **B-T4.** Change the tile label to `"Fairness run, vs the fastest Redux setup"`. With fix 9, the size appears in the bold line under `#fairness`.

### Context page (`store-vs-context.src.html`)

14. **C-3.** Change the line to:
    > <strong>Without the compiler, one context wins only in <span data-n="ctx.tally.off.vsContext.lostScenarios"></span>, by at most <span data-n="ctx.tally.off.vsContext.maxLossPct"></span>.</strong>
15. **C-1.** Change the line to:
    > <strong>Against one context, the big wins are where few components read the change: editing one entity, and the conditional reads.</strong>
16. **C-5.** Use the same wording as fix 6.

### Recommended (not claim errors)

- **C-4:** start it with "With the compiler," so the skim layer pairs with fix 14.
- **C-2:** drop "So". The line now comes before the counts it concludes from.
- **B-6:** add "with the compiler". The h3 says "no compiler", the same issue as D-C4.
- **B-T1:** label it "Main suite, vs the faster of Redux and Zustand".
- **D-C15 to D-C17:** add "against the fastest of Redux and Zustand" to the ranges.
- **D-C20:** "Over the same N configurations" has no antecedent on the dashboard. Use "Over the N configurations the build without the bailout measured".

## JSON ledger

```json
{
  "evidence_scope": "bench-data.json values (build a3d8e745, queried 2026-11-02), tools/charts.mjs renderers (statTiles, lossesTable, scoreboard), the page sources, and the earlier ledgers benchmark-report.claim-ledger.md and store-vs-context.claim-ledger.md",
  "claims": [
    {"id": "D-T1", "claim": "Main suite, matches or beats 39/42, vs the faster of Redux and Zustand, with the compiler", "status": "supported", "evidence": "main.tally.selectors.all.{matchOrBeat,total}", "remedy": "keep"},
    {"id": "D-T2", "claim": "Main suite, losses 3, all in selection, when every row reads the selection", "status": "supported", "evidence": "main.tally.selectors.all.losses = 3; selection.losses = 3, every other scenario 0", "remedy": "keep"},
    {"id": "D-T3", "claim": "Keyed selection, 14/14 selection sweep configurations won (not timed in the main suite)", "status": "supported", "evidence": "sweep.tally.store-keyed.selection.{wins,total}", "remedy": "keep"},
    {"id": "D-T4", "claim": "weakMemo, 12/12 spike configurations that do any work, won against Redux", "status": "supported", "evidence": "spike.tally.store-memo.{wins,total}; noWork = 4 excluded", "remedy": "keep"},
    {"id": "D-T5", "claim": "One context, 35/42 with the compiler; a context per slice never wins", "status": "supported", "evidence": "ctx.tally.on.vsContext.all; ctx.tally.{on,off}.vsContextSplit.all losses = 0", "remedy": "keep"},
    {"id": "D-T6", "claim": "Every loss counted, 41/224, across the headline, granular, suites, fairness run, sweeps, spike", "status": "unsupported", "evidence": "losses.all sums six areas only; controls excluded (context 7, single store 7, no compiler 18, no bailout 4, fairness run vs Zustand 2)", "remedy": "qualify"},
    {"id": "D-C1", "claim": "Scoreboard: editing one entity re-renders one row instead of running a selector in every row (2.4-9.2x)", "status": "supported", "evidence": "main.tally.selectors.entity.range; counts.main.entity", "remedy": "keep"},
    {"id": "D-C2", "claim": "Verdict grid: It loses when the selection changes", "status": "uncertain", "evidence": "selection: 1 faster, 2 tie, 3 slower; loses 3 of 6", "remedy": "qualify"},
    {"id": "D-C3", "claim": "Main chart: adding or removing a row is 2.9-7.8x faster, conditional reads 2.4-4.2x faster", "status": "uncertain", "evidence": "Ranges are vs the faster of Redux and Zustand, but the card charts every variant and names no comparator; structure is low-signal (key source note)", "remedy": "qualify"},
    {"id": "D-C4", "claim": "Controls: one store, no selectors, still beats the faster of Redux and Zustand in most configurations", "status": "uncertain", "evidence": "main.tally.single-selectors.all is store-single WITH the compiler; card heading says 'no compiler'", "remedy": "qualify"},
    {"id": "D-C5", "claim": "Counts: entity edit re-renders 1 row with use(store), Redux makes 4,003 selector calls", "status": "supported", "evidence": "counts.main.entity.store.on.rows, counts.main.entity.redux.on.selectors", "remedy": "keep"},
    {"id": "D-C6", "claim": "Keyed selection wins every selection sweep; 14/14 selection, 14/14 entity", "status": "supported", "evidence": "sweep.tally.store-keyed.{selection,entity}", "remedy": "keep"},
    {"id": "D-C7", "claim": "Heading: Every loss, with what each side did", "status": "unsupported", "evidence": "lossesTable renders six areas only (charts.mjs:1120-1127); controls excluded", "remedy": "qualify"},
    {"id": "D-C7b", "claim": "Losses: main suite 3 of 42, all selection; keyed selection isn't timed in the main suite", "status": "supported", "evidence": "losses.main", "remedy": "keep"},
    {"id": "D-C8", "claim": "weakMemo turns the derived-selectors losses into wins; plain 1.1-1.4x slower, store-memo 1.3-1.5x faster", "status": "supported", "evidence": "suite.derived-selectors.tally.store losses 6/6, store-memo wins 6/6", "remedy": "keep"},
    {"id": "D-C9", "claim": "Spike: plain falls further behind with more readers; store-memo stays ahead of Redux", "status": "supported", "evidence": "spike.tally.store.k20 2.1-2.5x slower, k50 3.6-4.5x slower; store-memo.rangeWork", "remedy": "keep"},
    {"id": "D-C10", "claim": "Ctx scoreboard: same setting, per-slice never wins; 35 of 42 vs one context, at most 11% in the rest", "status": "supported", "evidence": "ctx.tally.on.vsContext.all, maxLossPct; vsContextSplit losses 0 both settings", "remedy": "keep"},
    {"id": "D-C11", "claim": "The compiler helps Context far more than use(store) on entity edits and the conditional reads, where Context re-renders many more components", "status": "uncertain", "evidence": "True for one context. Context per slice on conditional reads: gain 1.3-1.8x vs store 1.1-1.3x, and it renders the same 30/10 components as store", "remedy": "qualify"},
    {"id": "D-C12", "claim": "Ctx chart: without the compiler, vs one context and vs per slice ranges", "status": "supported", "evidence": "ctx.tally.off.{vsContext,vsContextSplit}.all.range", "remedy": "keep"},
    {"id": "D-C13", "claim": "One context wins 7 configurations with the compiler, in filter and subscribe churn, by at most 11%", "status": "supported", "evidence": "ctx.tally.on.vsContext.{all.losses,lostScenarios,maxLossPct}", "remedy": "keep"},
    {"id": "D-C14", "claim": "Where every row reads the change, they render the same rows", "status": "supported", "evidence": "counts.main.{selection,filter,structure,details-churn}.{store,context,context-split}.on.rows = 1,000", "remedy": "keep"},
    {"id": "D-C15", "claim": "Rapid dispatch 1.5-1.9x faster", "status": "supported", "evidence": "suite.rapid-dispatch.tally.store.range (vs fastest of Redux/Zustand)", "remedy": "keep"},
    {"id": "D-C16", "claim": "Many components reading the same counter 1.2x faster", "status": "supported", "evidence": "suite.many-components-same-slice.tally.store.range", "remedy": "keep"},
    {"id": "D-C17", "claim": "Deep tree up to 2.2x faster (11 faster, 1 tie)", "status": "supported", "evidence": "suite.deeptree-nested-hooks.tally.store.range", "remedy": "keep"},
    {"id": "D-C18", "claim": "Hand-written reducer and auto-freeze off vs Redux Toolkit ranges", "status": "supported", "evidence": "suite.fairness.control.{redux-plain,redux-nofreeze}.range", "remedy": "keep"},
    {"id": "D-C19", "claim": "At 1,000 rows, matches or beats the fastest Redux setup in 14 of 14", "status": "supported", "evidence": "suite.fairness5.tally.fastestRedux; report #fairness 'at countsRows rows'", "remedy": "keep"},
    {"id": "D-C20", "claim": "Over the same 28 configurations, 26 with the bailout, 24 without", "status": "supported", "evidence": "nobailout.main.tally.{all.total,withBailout.matchOrBeat,all.matchOrBeat}", "remedy": "keep"},
    {"id": "D-C21", "claim": "Typing p95 at 4x with the compiler: 39.9 / 131.7 / 193.5 ms", "status": "supported", "evidence": "typing.main.{store,zustand,redux}.on.x4.p95", "remedy": "keep"},
    {"id": "D-C22", "claim": "With useDeferredValue the selector libraries close most of the gap", "status": "supported", "evidence": "typing.suite.*.on.x4.p95 (44.2 / 49.1 / 61.1); mixes runs, prior T3", "remedy": "keep"},
    {"id": "D-C23", "claim": "Memory at the largest size with the compiler: 2,901 / 4,549 / 7,191 bytes per row", "status": "supported", "evidence": "memory.*.on.n10000.bytesPerRow; n10000 is the largest size", "remedy": "keep"},
    {"id": "D-L", "claim": "All 23 Explain links land on the section that explains that card", "status": "supported", "evidence": "Anchors and gen blocks located in both page sources", "remedy": "keep"},
    {"id": "D-F", "claim": "Synthetic benchmarks, no real-app data yet", "status": "supported", "evidence": "report header note and #caveats", "remedy": "keep"},
    {"id": "B-T1", "claim": "Tile: vs the faster of Redux and Zustand 39/42", "status": "supported", "evidence": "main.tally.selectors.all", "remedy": "keep"},
    {"id": "B-T2", "claim": "Tile: Keyed selection, selection sweeps 14/14", "status": "supported", "evidence": "sweep.tally.store-keyed.selection", "remedy": "keep"},
    {"id": "B-T3", "claim": "Tile: weakMemo, shared derived data 12/12", "status": "uncertain", "evidence": "spike.tally.store-memo is vs Redux only, spike only, and the total leaves out 4 no-work configurations; the label says none of that, next to a faster-of-Redux-and-Zustand tile", "remedy": "qualify"},
    {"id": "B-T4", "claim": "Tile: vs the fastest Redux setup 14/14", "status": "uncertain", "evidence": "suite.fairness5 runs at 1,000 rows only (prior M13); label names no run or size", "remedy": "qualify"},
    {"id": "B-T5", "claim": "Tile: vs a Zustand store per entity 36/42", "status": "supported", "evidence": "main.tally.zustand-granular.all; status 6 slower = losses.granular", "remedy": "keep"},
    {"id": "B-1", "claim": "Entity edits, adding or removing a row, and conditional reads win by wide margins", "status": "uncertain", "evidence": "Ranges are vs the faster of Redux and Zustand, but the scoreboard above shows every column; structure is low-signal (report caveat line 615)", "remedy": "qualify"},
    {"id": "B-2", "claim": "The only scenario with losses is selection (after the full scoreboard)", "status": "uncertain", "evidence": "True for the headline only; the scoreboard above shows one context losing filter/churn and granular losing churn", "remedy": "qualify"},
    {"id": "B-3", "claim": "The headline is lower than the last report's", "status": "uncertain", "evidence": "Share fell (36/36 to 39/42) but the count rose from 36 to 39; unnumbered 'lower' next to a 39 tile reads wrong", "remedy": "qualify"},
    {"id": "B-4", "claim": "#main: only selection has losses; every other scenario matches or beats in every configuration", "status": "supported", "evidence": "main.tally.selectors.*.losses = 0 except selection; matchOrBeat 39 = 42 - 3", "remedy": "keep"},
    {"id": "B-5", "claim": "#work: 1 row vs 4,003 selector calls", "status": "supported", "evidence": "counts.main.entity", "remedy": "keep"},
    {"id": "B-6", "claim": "#controls: store-single still beats the faster of Redux and Zustand in most configurations", "status": "supported", "evidence": "main.tally.single-selectors.all.range 26 faster, 9 tie, 7 slower", "remedy": "keep"},
    {"id": "B-7", "claim": "#fairness: matches or beats the fastest Redux setup in 14 of 14", "status": "uncertain", "evidence": "Lost the locked 'at 1,000 rows' scope (prior M13); the size is now only inside the details", "remedy": "qualify"},
    {"id": "B-8", "claim": "Selection is where use(store) loses - the floor of a model without selectors, not a bug", "status": "uncertain", "evidence": "Prior SE1 scoped it inside the sentence to the two-store-row profile; the bold sentence dropped that scope", "remedy": "qualify"},
    {"id": "B-9", "claim": "Keyed selection wins every selection and entity configuration (14/14 each)", "status": "supported", "evidence": "sweep.tally.store-keyed.{selection,entity}", "remedy": "keep"},
    {"id": "B-10", "claim": "Plain use(store) loses only on derived selectors (6), and with weakMemo it wins those too", "status": "uncertain", "evidence": "True within the ported suites (losses.suites 6/38, all derived selectors). As a standalone line it is false: plain store also loses main selection (3), sweeps (14) and the spike (12)", "remedy": "qualify"},
    {"id": "B-11", "claim": "weakMemo beats Redux in every spike configuration that does any work", "status": "supported", "evidence": "spike.tally.store-memo wins 12/12, noWork 4", "remedy": "keep"},
    {"id": "B-12", "claim": "Bailout: 26 with, 24 without, over 28", "status": "supported", "evidence": "nobailout.main.tally", "remedy": "keep"},
    {"id": "B-13", "claim": "Typing p95 at 4x with the compiler", "status": "supported", "evidence": "typing.main.*.on.x4.p95", "remedy": "keep"},
    {"id": "C-T1", "claim": "Tile: vs a context per slice, with the compiler 42/42", "status": "supported", "evidence": "ctx.tally.on.vsContextSplit.all", "remedy": "keep"},
    {"id": "C-T2", "claim": "Tile: vs one context, with the compiler 35/42", "status": "supported", "evidence": "ctx.tally.on.vsContext.all", "remedy": "keep"},
    {"id": "C-T3", "claim": "Tile: vs a context per slice, without the compiler 42/42", "status": "supported", "evidence": "ctx.tally.off.vsContextSplit.all (40 faster, 2 tie)", "remedy": "keep"},
    {"id": "C-T4", "claim": "Tile: vs one context, without the compiler 39/42", "status": "supported", "evidence": "ctx.tally.off.vsContext.all (24 faster, 15 tie, 3 slower)", "remedy": "keep"},
    {"id": "C-1", "claim": "The big wins are where few components read the change: entity, conditional reads", "status": "uncertain", "evidence": "Holds against one context at both settings (prior C11 evidence is vs one context only). Against a context per slice with the compiler, add/remove (1.6-2.8x) matches the conditional reads (1.8-2.5x)", "remedy": "qualify"},
    {"id": "C-2", "claim": "The timing mostly follows the renders; fewer renders wins by a lot", "status": "supported", "evidence": "prior C16a; entity and conditional reads vs one context, entity vs per slice", "remedy": "keep"},
    {"id": "C-3", "claim": "One context wins only in subscribe churn, by at most 5%", "status": "uncertain", "evidence": "True without the compiler (ctx.tally.off.vsContext.lostScenarios). The line names no setting and the next bold line says one context wins in filter and subscribe churn", "remedy": "qualify"},
    {"id": "C-4", "claim": "One context wins 7, in filter and subscribe churn, by at most 11%; a context per slice never wins", "status": "supported", "evidence": "ctx.tally.on.vsContext; vsContextSplit losses 0", "remedy": "keep"},
    {"id": "C-5", "claim": "The compiler helps Context far more on entity edits and the conditional reads, where Context re-renders many more components", "status": "uncertain", "evidence": "As D-C11", "remedy": "qualify"},
    {"id": "C-6", "claim": "Typing without the compiler at 1x: 159.8 / 12.6 / 15.7 ms", "status": "supported", "evidence": "typing.main.{context,store,context-split}.off.x1.p95", "remedy": "keep"}
  ]
}
```
