# Claims ledger: dashboard.src.html

Every takeaway line, tile note and card heading that states a result, with its source. Each takeaway is an existing claim from a report, quoted or trimmed without moving a scope word. Keys are from `bench-data.json` (build a3d8e745), checked 2026-11-02.

## Stat tiles

| Tile | Source |
|---|---|
| Main suite, matches or beats X of Y, against the faster of Redux and Zustand, with the compiler | `main.tally.selectors.all.{matchOrBeat,total}`; benchmark report lede |
| Main suite, losses, all of them in selection, when every row reads the selection | `main.tally.selectors.all.losses`; report lede ("all of them in one scenario: changing which row is selected, when every row reads the selection") |
| Selection sweeps, keyed selection wins: X of Y configurations won (it isn't timed in the main suite) | `sweep.tally.store-keyed.selection.{wins,total}`; report `#sweeps`, `#losses` ("it isn't timed in the main suite") |
| Derived-data spike, weakMemo wins: X of Y configurations that do any work, won against Redux | `spike.tally.store-memo.{wins,total}` (total leaves out `spike.tally.store-memo.noWork`); report `#derived` ("every configuration of the spike (below) that does any work") |
| One context, matches or beats: X of Y with the compiler, a context per slice never wins | `ctx.tally.on.vsContext.all.{matchOrBeat,total}`; Context page lede and `#context-wins` ("A context per slice never beats `use(store)` at the same compiler setting") |
| Counted results, losses: X of Y across the headline, the granular control, the ported Redux suites, the fairness run against Redux, the sweeps, and the spike (the controls aren't counted) | `losses.all.{count,of}`; report `#losses` (area list) |

## Card takeaways

| Card | Takeaway | Source |
|---|---|---|
| Scoreboard | Editing one entity re-renders one row instead of running a selector in every row (range) | report `#claim` bullet one; `main.tally.selectors.entity.range` |
| Verdict grid | All of its losses are when the selection changes: X of the Y selection configurations (range) | report `#claim` bullet two; `main.tally.selectors.selection.{losses,total,range}` (skim audit D-C2) |
| Main chart | Against the faster of Redux and Zustand, adding or removing a row is range, and conditional reads are range. Add / remove mostly measures list reconciliation, because every variant re-renders every row | report `#claim` bullet one; `main.tally.selectors.{structure,details-inline}.range` |
| Controls | With the compiler, one store holding everything, with no selectors, still beats the faster of Redux and Zustand in most configurations: range | report `#controls`; `main.tally.single-selectors.all.range` |
| Counts | Editing an entity re-renders N row with `use(store)`, while Redux makes N selector calls to find the same row | report `#work`; `counts.main.entity.store.on.rows`, `counts.main.entity.redux.on.selectors` |
| Sweeps | Keyed selection wins every selection configuration (X of Y), and every entity configuration (X of Y) | report `#sweeps`; `sweep.tally.store-keyed.{selection,entity}.{wins,total}` |
| Losses | Main suite against the faster of Redux and Zustand: X of Y, all selection. Keyed selection is the pattern for this, but it isn't timed in the main suite | report `#losses` bullet one; `losses.main.{count,of}` |
| Derived selectors | Plain `use(store)` is range against the fastest of Redux and Zustand. With `weakMemo` (`store-memo`) it's range | report `#derived-results`; `suite.derived-selectors.tally.{store,store-memo}.rangeWork` |
| Spike | `store-memo` stays ahead of Redux (range), and plain `use(store)` falls further behind as the readers grow | report `#derived-results`; `spike.tally.store-memo.rangeWork`, `spike.tally.store.{k20,k50}.rangeWork` |
| Context scoreboard | With the compiler, it matches or beats one context in X of Y configurations, and loses by at most Z in the rest | Context page lede; `ctx.tally.on.vsContext.all.{matchOrBeat,total}`, `ctx.tally.on.vsContext.maxLossPct` |
| Context verdict grid | One context wins N configurations with the compiler, in <scenarios>, by at most Z | Context page `#context-wins` bullet two; `ctx.tally.on.vsContext.{all.losses,lostScenarios,maxLossPct}` |
| Context counts | Where every row reads the value that changed, `use(store)` and one context re-render the same rows | Context page lede; gen `ctx-counts` |
| Context chart | Without the compiler, `use(store)` against one context is range, and against a context per slice it's range | Context page `#summary` bullet one; `ctx.tally.off.{vsContext,vsContextSplit}.all.range` |
| Compiler gain | The compiler helps one context far more than `use(store)` on entity edits and the conditional reads, where one context re-renders many more components. It helps a context per slice far more only on entity edits | Context page `#compiler-gain`; `ctx.tally.compilerGain.{store,context,context-split}.{entity,details-inline,details-component}.range` (skim audit D-C11) |
| Rapid dispatch | Rapid dispatch (bursts of dispatches per task, including a Redux Toolkit listener cascade), against the fastest of Redux and Zustand: range | report `#redux-suites`; `suite.rapid-dispatch.tally.store.range` |
| Same counter | Many components reading the same counter, against the fastest of Redux and Zustand: range | report `#redux-suites`; `suite.many-components-same-slice.tally.store.range` |
| Deep tree | A deep tree with nested Hooks and counters at the leaves, against the fastest of Redux and Zustand: range | report `#redux-suites`; `suite.deeptree-nested-hooks.tally.store.range` |
| Fairness | Against Redux Toolkit, the hand-written reducer is range, and turning off auto-freeze is range | report `#fairness`; `suite.fairness.control.{redux-plain,redux-nofreeze}.range` |
| Fairness, every variant | At N rows, against the fastest Redux setup in each configuration, `use(store)` matches or beats it in X of Y | report `#fairness`; `method.countsRows`, `suite.fairness5.tally.fastestRedux.{matchOrBeat,total}` |
| Without the bailout | Over the N configurations the build without the bailout measured, `use(store)` with the compiler matches or beats the faster of Redux and Zustand in X with the bailout, and in Y without it | report `#bailout` bullet one; `nobailout.main.tally.{all.total,withBailout.matchOrBeat,all.matchOrBeat}` |
| Typing | With four times CPU throttling and the compiler, the slowest one in twenty keys (`p95`) took X ms with `use(store)`, Y ms with Zustand, and Z ms with Redux | report `#typing`; `typing.main.{store,zustand,redux}.on.x4.p95` |
| Typing suite | With the compiler and no CPU throttling, the slowest one in twenty keys (`p95`) took X ms with `use(store)`, Y ms for Zustand with `useDeferredValue`, and Z ms for Redux with it. With four times CPU throttling, it was A, B, and C ms | `typing.suite.{store,zustand-deferred,redux-deferred}.on.{x1,x4}.p95`; report `#typing` |
| Memory | With the compiler at the largest size, `use(store)` uses X bytes per row, against Y for Zustand and Z for Redux | report `#memory`; `memory.{store,zustand,redux}.on.n10000.bytesPerRow` |

## Card headings that state a result

Every heading is the answer, as a statement. Checked against the keys on 2026-11-02.

| Heading | Source |
|---|---|
| `use(store)` matches or beats the faster selector library outside selection | `main.tally.selectors.<sc>.matchOrBeat` = `.total` for every scenario but selection |
| Its only headline losses are selection configurations | `main.tally.selectors.selection.losses` = `main.tally.selectors.all.losses` |
| It wins every conditional-read and add / remove configuration | `main.tally.selectors.{details-inline,details-component,structure}.wins` = `.total` |
| With the compiler, even one store wins most configurations | `main.tally.single-selectors.all.{wins,total}` (26 of 42) |
| Entity edits render one row, while selectors run in every row | `counts.main.entity.store.on.rows`, `counts.main.entity.redux.on.selectors` |
| Keyed selection wins every selection sweep | `sweep.tally.store-keyed.selection.wins` = `.total` |
| Almost every counted loss is selection or unshared derived data | `losses.{main,granular,suites,fairness,sweeps,spike}.count`: all selection or plain derived data except the granular subscribe-churn loss (report `#losses`) |
| `weakMemo` turns the derived-data losses into wins | `losses.suites.count` (all plain derived selectors), `suite.derived-selectors.tally.store-memo.wins` = `.total` |
| With more readers, plain `use(store)` falls further behind | report `#derived-results`; `spike.tally.store.{k20,k50}.rangeWork` |
| A context per slice never wins at the same setting | `ctx.tally.{off,on}.vsContextSplit.all.losses` = 0 |
| On entity edits, the compiler helps Context far more | skim audit D-C11: true for both Context approaches on entity edits |
| Without the compiler, one context wins only in subscribe churn | `ctx.tally.off.vsContext.lostScenarios`; Context page `#no-compiler` |
| With the compiler, one context wins only filter and subscribe churn | `ctx.tally.on.vsContext.lostScenarios` |
| Where every row reads the change, all render the same rows | `counts.main.{selection,filter,structure,details-churn}.*.on.rows` equal for all three (skim audit D-C14) |
| `use(store)` wins every rapid-dispatch configuration | `suite.rapid-dispatch.tally.store.wins` = `.total` |
| `use(store)` wins with many components reading one counter | `suite.many-components-same-slice.tally.store.wins` = `.total` |
| `use(store)` matches or beats every deep-tree configuration | `suite.deeptree-nested-hooks.tally.store.losses` = 0 |
| Leaner Redux setups are sometimes faster than Redux Toolkit | `suite.fairness.control.{redux-plain,redux-nofreeze}.range` (some faster, the rest tie) |
| At N rows, a leaner Redux flips no verdict | `method.countsRows`; report `#caveats` ("no verdict flips"); `suite.fairness5.tally.fastestRedux.matchOrBeat` = `.total` |
| The bailout helps most on selection, subscribe churn, and add / remove | `nobailout.main.bailoutGain.{selection,details-churn,structure}.range` (mostly or all faster) against the other scenarios, mostly ties (e.g. `.filter.range`); team-lead check #26 |
| Store updates in a transition let typing interrupt the list | report `#typing` ("React can interrupt the list render to handle the next key") |
| With `useDeferredValue`, selector libraries are competitive with no CPU throttling | `typing.suite.{store,zustand-deferred,redux-deferred}.on.x1.{p50,p95}`: Redux with it is lower at both, Zustand with it is lower at p50 and higher at p95. At x4, `use(store)` is lowest at both. Point values, few samples (report `#caveats`); team-lead check #29 |
| `use(store)` uses less memory per row than Redux or Zustand | `memory.{store,zustand,redux}.{off,on}.{n100,n1000,n10000}.bytesPerRow`: store lowest at every size and setting |

## Footer

| Claim | Source |
|---|---|
| Synthetic benchmarks, small apps built to isolate one thing each, no data from a real app yet | report header note and `#caveats` |
