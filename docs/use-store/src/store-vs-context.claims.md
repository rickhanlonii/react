# Claims ledger: store-vs-context.src.html

Every claim on the page, with its source. Keys are from `bench-data.json` (build a3d8e745), checked 2026-11-02. "Same setting" means both sides without the compiler, or both with it (`ctx.*` keys). Counts are at `method.countsRows` rows.

## Header and summary

| Claim | Source |
|---|---|
| Matches or beats a context per slice in every configuration, at both settings | `ctx.tally.{off,on}.vsContextSplit.all.matchOrBeat` = `.total` (42/42); `.lostScenarios` = none |
| Against one context with the compiler: 35 of 42, loses by at most 11% | `ctx.tally.on.vsContext.all.{matchOrBeat,total}`, `ctx.tally.on.vsContext.maxLossPct` |
| Where every component reads the changed value, store and one context do the same work | `counts.main.{selection,filter,details-churn,structure}.{store,context}.{off,on}.renders` (equal within one render); gen `ctx-counts` |
| Synthetic, experiment, not shipped | Same as the benchmark report header |
| One context: useReducer at the root, one Provider | `fixtures/store-bench/src/apps/context.jsx`; `fixtures/store-bench/README.md:61` |
| A context per slice: a Provider per slice, memo rows | `context-split.jsx:22-28`; `README.md:62` |
| Store: a store per entity plus small stores | `store.jsx`; `README.md:59` |
| Scoreboard ranges, both settings | `ctx.tally.{off,on}.{vsContext,vsContextSplit}.all.range`; gen `ctx-scoreboard` |
| Big wins on entity edit and conditional reads; close where every row reads the change | `ctx.tally.*.{entity,details-inline,details-component}.range` vs `ctx.tally.*.vsContext.{selection,filter,details-churn}.range` |

## Why the approaches differ

| Claim | Source |
|---|---|
| Context re-renders every consumer; per slice narrows it; store re-renders readers | Explainer `#problem`, `#performance` |
| Entity edit: 1 row with store, 1,000 with either context (every row reads the entities) | `counts.main.entity.{store,context,context-split}.on.rows`; `context-split.jsx:22` (EntitiesContext) |
| Selection: every row in all three | `counts.main.selection.{store,context,context-split}.on.rows` |
| Timing mostly follows renders | gen `ctx-counts` vs gen `ctx-scoreboard` |
| Conditional reads: per slice renders as few as store, store still faster | `counts.main.details-inline.{store,context-split}.{off,on}.renders` (30/31, 30/30); `ctx.tally.on.vsContextSplit.details-inline.range` |
| Context searches below the Provider; store goes straight to readers | Explainer `#performance` ("Context, by comparison, walks the subtree looking for consumers") |
| "I think that search is most of the difference, but it isn't profiled" | Hedge: no profile exists for this comparison |

## Without the compiler

| Claim | Source |
|---|---|
| Without the compiler, re-renders cascade to children unless memo | React semantics; counts `.off.renders` ≈ 2× `.on` in the counts table |
| Entity edit vs one context | `ctx.tally.off.vsContext.entity.range` |
| Inline read vs one context and vs per slice | `ctx.tally.off.{vsContext,vsContextSplit}.details-inline.range` |
| Selection and filter tie one context in every configuration | `ctx.tally.off.vsContext.{selection,filter}.{ties,total}` (6/6) |
| One context wins only in subscribe churn, at most 5% | `ctx.tally.off.vsContext.lostScenarios`, `.maxLossPct` |

## With the compiler

| Claim | Source |
|---|---|
| Cached elements; children skipped; gaps shrink | `counts.main.*.on.renders` vs `.off`; `ctx.tally.on.*.all.range` vs `ctx.tally.off.*.all.range` |
| Entity edit, selection, add / remove ranges | `ctx.tally.on.vsContext.{entity,selection,structure}.range`, `ctx.tally.on.vsContextSplit.entity.range` |
| Add / remove mostly measures list reconciliation | `counts.main.structure.*.on.renders` equal; gen `ctx-scoreboard` caption |
| One context wins in filter and churn, at most 11%; per slice never | `ctx.tally.on.vsContext.{lostScenarios,maxLossPct}`; `ctx.tally.on.vsContextSplit.lostScenarios` = none |

## What the compiler buys each

| Claim | Source |
|---|---|
| Never makes either Context approach slower | `ctx.tally.compilerGain.{context,context-split}.lostScenarios` = none |
| Gain ranges per variant | `ctx.tally.compilerGain.{context,context-split,store}.all.range`; gen `ctx-compiler-gain` |
| No help for store on entity edits; only one row re-renders | `ctx.tally.compilerGain.store.entity.range` (6 tie); `counts.main.entity.store.{off,on}.rows` = 1 |
| Store slower in the child-component conditional read, at most 9% | `ctx.tally.compilerGain.store.{lostScenarios,maxLossPct}` |
| As much as store, sometimes more | `ctx.tally.compilerGain.context.entity.range` (6.0–7.9×) vs store's tie |
| "I think Context gains more because it re-renders more" | Hedge; supported by `counts.main.*.context.off.renders` ≫ store's in entity and conditional reads |

## Typing and memory

| Claim | Source |
|---|---|
| Typing setup: 10,000 rows, list in a transition in all three | `typing.main.rows`; `store.jsx:62-66`, `context.jsx:68-73`, `context-split.jsx:79` |
| One context holds the input's value, so each key's urgent update re-renders its consumers | `context.jsx:68-80` (`setFilterInput` and `use(StateContext).filterInput` in the same context); per slice uses `FilterInputContext` (`context-split.jsx:25,115`) |
| p95 values at 1× | `typing.main.{context,store,context-split}.off.x1.p95`, `typing.main.{context,store}.on.x1.p95` |
| Store slower with the compiler; cause unknown | `typing.main.store.{off,on}.x1.p95`; explicitly unexplained |
| Typing has far fewer samples | `typing.main.keys`; gen `typing-table` runs (benchmark report) |
| Store uses more memory per row than either Context; ratios at N=10,000 with the compiler | `ctx.memory.storeVs.{context,context-split}.on.n10000` (>1 at every size and setting) |
| The compiler adds bytes per row for all three | `memory.{store,context,context-split}.{off,on}.n10000.bytesPerRow` |

## Where Context ties or wins

| Claim | Source |
|---|---|
| Ties without the compiler, same renders on selection | `ctx.tally.off.vsContext.selection.ties`; `counts.main.selection.{store,context}.off.renders` (2,000 vs 2,001) |
| Wins with the compiler in filter and churn, same renders | `ctx.tally.on.vsContext.{lostScenarios,maxLossPct}`; `counts.main.filter.{store,context}.on.renders` |
| Context uses less memory | `ctx.memory.storeVs.*` |
| Per slice never wins | `ctx.tally.{off,on}.vsContextSplit.lostScenarios` = none |

## Method and caveats

| Claim | Source |
|---|---|
| Same method as the benchmark report (frozen build, ambient gate, restart rule, counting build) | `benchmark-report.claims.md` (Method); `method.verdictRule`, `method.gate.*` |
| Production build, flushSync, typing is the only transition measurement | `README.md:11-14,73,86` |
| Add / remove low signal | `README.md:85`; gen `ctx-scoreboard` caption |
| Context apps written the usual way; tuning could do better | `context.jsx`, `context-split.jsx`; `README.md:136` (memo on rows "as people do") |

## Edits to other pages

- `benchmark-report.src.html`, Controls, Context paragraph: one sentence added, linking `store-vs-context.html`.

## Audit fixes (`store-vs-context.claim-ledger.md`)

| Item | Claim now | Source |
|---|---|---|
| C36 | The compiler helps Context far more on entity edits and conditional reads; about as much where every row re-renders; store most on add / remove; never slows Context | `ctx.tally.compilerGain.{store,context}.structure.range`; `ctx.tally.compilerGain.{context,context-split}.lostScenarios` = none; per-config `ctx.*.compilerGain.*` |
| C41 | Hedge scoped to entity edits and conditional reads | `counts.main.{entity,details-inline,details-component}.context.off.renders` |
| C16b | Gaps where every row renders don't follow render counts: add / remove with the compiler | `ctx.tally.on.vsContext.structure.range`; `counts.main.structure.{store,context}.on.renders` (equal) |
| C3 | "re-render the same rows" | `counts.main.{selection,filter,details-churn,structure}.{store,context}.*.rows` |
| C12 | Close without the compiler; with it, store ahead on add / remove, one context wins some filter and churn configurations | `ctx.tally.off.vsContext.*.range`; `ctx.tally.on.vsContext.{structure.range,lostScenarios}` |
| C31 | Compiler shrinks big gaps, widens some small ones | `ctx.tally.off` vs `ctx.tally.on` `.{entity,details-inline,structure}.range` |
| C47 | Store typing slower with the compiler at 1×, faster at 4× | `typing.main.store.{off,on}.{x1,x4}.p95` |
| C55 | Difference is work the counts don't show, including subscribe churn's subscribe/unsubscribe | `README.md:84`; `counts.main.details-churn.*` equal renders |
| C34/C53 | One context wins 7 configurations, in filter and churn | `ctx.tally.on.vsContext.all.losses`, `.lostScenarios` |
| C60 | Gate: ambient CPU, except main restart 1 under the load-average gate | `method.gate.head.loadGated`; `method.gate.history` |
| C62/C17 | Counting build counts rows and shared views only | `fixtures/store-bench/src/shared/views.jsx:8-14,62,80,95` |
| C20 | Hedge adds the root re-render to update Providers, unprofiled | `context.jsx` (root `useReducer`), `context-split.jsx:96-115` (root state and Providers) |
| C25 | Filter tie keys cited | `ctx.tally.off.vsContext.filter.{ties,total}` |
| Note | The audit's C55 wording kept "what each render costs"; dropped per the orchestrator as unsupported | team lead, store-vs-context fixes item 8 |
| C36 (data-eng-2 keys) | The compiler speeds store up more than one context in 16 of 42 configurations (every add / remove), and more than a context per slice in 22 of 42 (every selection, filter and add / remove); two speedups, no noise test | `ctx.compilerGain.storeMore.{context,context-split}.all.{count,of}`, `.everyConfig` |
| C62 | Counted components named from the source | `method.countedComponents` |
