# Claim ledger: benchmark-report.src.html (pass 1, claim boundaries)

An independent audit of every non-generated claim in `docs/use-store/src/benchmark-report.src.html`, checked against the data (`bench-data.json`, queried per key), the run logs (`fixtures/store-bench/results/head-units.log`, `head-ambient.jsonl`, `headnb-units.log`), the benchmark sources, and the design docs. The author's `benchmark-report.claims.md` was used as a lead only.

Verdicts: **supported**, **overreach** (true at a narrower scope; replacement wording is under "Required fixes"), **unsupported** (nothing in the evidence backs it), **contradicted** (the evidence says otherwise). Line numbers are in the src file as of 2026-11-02.

Every `data-n` key on the page (131) exists and has a source. Key meanings were checked against the sentences that use them. One key is attached to the wrong comparison (SE4).

## Header (lines 93-101)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| H1 | "matches or beats ... 39 of 42 ... loses 3, all of them in one scenario: changing which row is selected" | supported | `main.tally.selectors.all.{matchOrBeat,total,losses}`; `main.tally.selectors.selection.losses` = 3, every other scenario `.losses` = 0 |
| H2 | "Almost every place it loses has a recommended pattern that wins, and this page shows both" | **overreach** | Derived-data losses: `store-memo` wins the same configurations (`suite.derived-selectors.tally.store-memo.wins` 6/6, `spike.tally.store-memo.wins` 12/12). Selection losses: keyed selection was timed only in the sweeps (two-store rows, N=1,000, `sweep.rows`), never in the main suite and never against `zustand-granular`. One main loss is at N=100 (`main.selection.n100.x1.verdict` = 1.1× slower). The page shows the loss and the pattern's win in different benchmarks. See L2/L4 |
| H3 | Synthetic, no real-app data, behind `enableStore`, not shipped | supported | `packages/shared/ReactFeatureFlags.js`; `NEXT_STEPS.md` §0 |

## The claim and the scoreboard (lines 125-137)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| S1 | Selector libraries "subscribe each component with a selector, and every selector runs on every update" | supported | `counts.main.entity.redux.on.selectors` = 4,003 at N=1,000; react-redux 9.3.1 and Zustand 5.0.16 both subscribe through `useSyncExternalStore` (`node_modules/react-redux/dist/react-redux.mjs`, `zustand/esm/react.mjs`) |
| S2 | "A store update re-renders the components that read that store, and the compiler skips the parts of their output that didn't change" | supported | `counts.main.selection.store.on.renders` = 1,002 (1,000 rows + 2 `RowView`s) |
| S3 | Headline uses each library "at its own faster compiler setting" | supported | `main.*.best`: 25 "zustand + compiler", 17 "zustand without the compiler" |
| S4 | Entity, add/remove, conditional-read ranges | supported | `main.tally.selectors.{entity,structure,details-inline}.range` |
| S5 | "selectors re-render only the two rows whose selection changed" | supported | `counts.main.selection.{redux,zustand}.on.rows` = 2 |
| S6 | Granular control loses "6 of 42 ... mostly on selection" | supported | `main.tally.zustand-granular.selection.losses` = 5, `.details-churn.losses` = 1 |
| S7 | Keyed selection is measured in the sweeps, not the main suite | supported | `run-report-matrix.sh` SCENARIOS/SUITES; `sweep.tally.store-keyed.*` |

### What changed since the last report (lines 141-148)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| W1 | Last report: 36 of 36 on the final build | supported | `history.final.tally.selectors.all.{matchOrBeat,total}` |
| W2 | "It changed because a review of the benchmark code found two things that were unfair to the selector libraries, and fixed them" | **overreach** | The source of `history.final.*` itself says the old run "predates the HostRoot redesign **and** the benchmark fairness fix". The React build changed too (final → a3d8e745, DCP-17 plus the PR-readiness changes). A/B runs of those build changes measured "every cell within ±2%" (`NEXT_STEPS.md:17`, final vs hostroot5) and 0.94-1.03 (`STACK.md` Performance, with selection drifting +1.8%). So the fixes are the likely cause, but "because" asserts a cause that wasn't isolated (W6) and hides the build change |
| W3 | Fix 1: selector rows had an inline-details selector in every scenario; now only the inline scenario | supported | commit 7de5a12d94, `zustand.jsx`/`redux.jsx`/`zustand-granular.jsx` diff (`detailsMode` default 'inline' → 'component', `RowWithInlineDetails` added) |
| W4 | Fix 2: Zustand's count looped over every label in a selector on every update; now counts in render | supported | commit 7de5a12d94, `selectCount` removed from `zustand.jsx` |
| W5 | "Both fixes remove work that only the selector apps were doing" | supported | The same commit changed the store/context `detailsMode` default too, but no rows are expanded outside the details scenarios (`src/shared/scenarios.js`: only `details-*` call `expandEvery`), so it doesn't change store work |
| W6 | "Neither was timed on its own" | supported (author statement) | No artifact either way. Low stakes |
| W7 | The review added subscribe churn | supported | `history.final.scenarios` = 6; commit 7de5a12d94 message |

## The code compared (lines 154-186)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| C1 | Code is taken from the measured sources at build time, instrumentation removed | supported | `tools/build-docs.mjs` (compiler at `compiler/.../dist/index.js`) |
| C2 | Same `RowView`/`CountView`, same DOM | supported | `README.md` Variants; `run-jsdom.mjs`, `run.mjs --verify` |
| C3 | A store row "reads four stores", the details store only when expanded | supported | `src/apps/store.jsx` `Row`: entity, selected, filter, expanded; `details` inside `if (expanded)` |
| C4 | Redux: "Every row runs four selectors on every update" | supported | `redux.jsx` `Row`; `counts.main.entity.redux.on.selectors` = 4,003 |
| C5 | Zustand count computed in render from two selectors | supported | `zustand.jsx` `Count` |
| C6 | Granular: each entity its own Zustand store; an edit notifies only that entity's subscribers | supported | `zustand-granular.jsx` `useStore(box.entities.get(id), ...)` |
| C7 | Compiled `Row` uses compiler `c59ecf06d45b47db`, the build the benchmarks used | supported | `shasum -a 256 compiler/packages/babel-plugin-react-compiler/dist/index.js` = `c59ecf06d45b47db…` (re-checked today); `build.compiler` from every pinned file's `env.compiler`. Re-check after any compiler rebuild |

## Method and build (lines 191-221)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| M1 | "Every result on this page comes from one frozen React build, React … (`react-builds/head`)" | **overreach** | Exceptions on this page: the no-bailout section (`react-builds/head-nobailout`, same sha with `enableSameElementBailout = false`, per its `BUILD.json`); the CPU profile and the reverted trims in "Why selection loses" (`react-builds/final` and `opt11`, `research/selection-floor.md:10-12,40-44`); the tearing repro (`concurrency.mjs` ran on "the real baseline build", `research/shared-derived-data.md` §4); and the history headline (labeled) |
| M2 | Each result file records its build; the number check fails on a different one | supported | `tools/check-numbers.mjs:11-15,221-240` (history sets exempt) |
| M3 | Library, browser, CPU, Node versions | supported | `lib.*`, `method.{browser,cpu,node}` |
| M4 | Each update one browser task in `flushSync` | supported | `README.md` Scenarios |
| M5 | "Each configuration gets 50 warm-up updates and then 200 timed ones, in each of 3 browser restarts" | **contradicted** | `report-sources.json` main set: `selection-x1` and `details-churn-x1` have restarts r1-r5; the other 12 units have r1-r3. `head-units.log` 00:45:58: "extra restarts r4,r5 for main selection-x1 and details-churn-x1 (spread check: restarts disagreed within +/-4% of parity)". `method.restarts` is a *median* over configurations. So 6 of 42 configurations got 5 restarts, added after looking at results, and 2 of the 3 headline losses (`selection.n100.x1`, `selection.n1000.x1`) are in them. The page doesn't say so |
| M6 | Gate: start at ≤ 3.5 cores, discard above a 4.5 mean | supported | `head-units.log` 21:39:14; `run-report-matrix.sh` `unit()` |
| M7 | "Ambient CPU is logged for every unit. Across the 86 units of the head build…" | **contradicted** | The head build has 100 pinned timed units (main 46, typing 3, memory 3, suites 15, spike 24, fairness5 3, typing-suite 3, sweeps 3). `head-ambient.jsonl` has 86 records and no main r1 record: the 14 load-gated units have no ambient log. The 86 are the ambient-gated units, not all units |
| M8 | Load-average gate replaced; only main restart 1 ran under it (14 units) | supported | `head-units.log` lines 9-31; `method.gate.head.loadGated`; KEYS.md `method.gate.history` |
| M9 | Verdict rule: means, two standard errors, every restart must agree, otherwise a tie; ratio of means | supported | `stats.mjs` `compare` (2 × combined SEM); `report-suites.mjs` `agreedCompare` |
| M10 | A median can be lower on the slower side | supported | gen `losses-table` (e.g. derived-selectors score 1×) |
| M11 | "The faster of Redux and Zustand" switches compiler setting | supported | `main.selection.n1000.x1.best` (off) vs `main.selection.n100.x1.best` (on) |
| M12 | Idiomatic Redux (RTK, auto-freeze on, react-redux) "is what the `react-redux` docs recommend" | supported | `node_modules/react-redux/README.md:14-16` (templates with RTK and react-redux). Auto-freeze is RTK's default, not a docs recommendation; the sentence reads fine as the setup |
| M13 | "Even against the fastest of the three in each configuration, `use(store)` matches or beats Redux in 14 of 14" | **overreach** | Only at N=1,000 (`run-report-matrix.sh` EXTRA_SUITES `--n=1000`). The fairness section and caveats say so; this sentence doesn't, and "14 of 14" next to the 42-configuration suite reads as complete |
| M14 | "Before any timing, every variant is checked to render the same DOM after every update, in jsdom and in Chrome" | **overreach** | `run.mjs --verify` replays 20 updates per scenario (`README.md`), not every update. The sweeps are checked in Chrome only, within a row width, and typing in jsdom for 3 scenarios (`run-report-matrix.sh` verify block). No log artifact records that the verify step ran for the head build (`head-units.log` starts at the counts) |
| M15 | `structure` is low-signal; every variant re-renders every row | supported | `counts.main.structure.*.on.rows` = 1,000 for all seven variants |
| M16 | `role`: nothing renders users, DOM never changes, store does nothing, counted as no work | supported | `counts.derived-selectors.role.store.on.{renders,derivations,selectors}` = 0; `report-data.mjs` `judge` (`unread`) |
| M17 | "List caught up after" includes the typing | supported | `run.mjs:499-512`; `charts.mjs:1006` |

## The main scenarios (lines 226-270)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| MS1 | Scenario table (updates, what each isolates; churn "expand every tenth row, then collapse them") | supported | `README.md` Scenarios; `src/shared/scenarios.js` (`details-churn` collapses all but the first, hence 99 rows) |
| MS2 | Entity 1 row vs 4,003 selector calls; inline read 30 renders, no selectors, Redux 30 and 4,003; selection 1,000 vs 2 rows | supported | `counts.main.{entity,details-inline,selection}.*` |
| MS3 | Churn: every row re-renders (1,000 vs 99), a tenth mount or unmount a reader, matches or beats in every configuration | supported | `counts.main.details-churn.{store,redux}.on.rows`; `main.tally.selectors.details-churn.losses` = 0 |
| MS4 | `store-single` is the worst case for stores and beats the headline in most configurations | supported | `README.md:7`; `main.tally.single-selectors.all.range` (26 of 42 faster) |
| MS5 | "The compiler skips the rows whose output didn't change." | **contradicted** | The page's own counts: with the compiler every row still renders (`counts.main.selection.store.on.rows` = 1,000). The compiler returns the cached element, so only `RowView` is skipped (`renders` = 1,002). Lines 184 and 391 say this correctly |
| MS6 | "Without the compiler, `use(store)` loses badly wherever every row re-renders, for example selection" | **contradicted** | In add/remove every variant re-renders every row (`counts.main.structure.*.on.rows` = 1,000), and the uncompiled store *wins*: `main.tally.nocompiler-selectors.structure.range` = 1.4-1.8× faster. The losses are where store rows re-render and selector rows don't: selection 7.7-13×, churn 3.5-4.4× (`…details-churn.range`), filter 1.1-1.4× |
| MS7 | Beats a context per slice everywhere; one-context range; loses to one context only in the listed scenarios, with the same renders | supported | `main.tally.context-split.all.losses` = 0; `main.tally.context.lostScenarios`; `counts.main.{filter,details-churn}.{store,context}.on.renders` (1,502/1,502, 1,099/1,099) |

## The ported Redux benchmarks (lines 275-300)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| P1 | Four scenarios from react-redux-benchmarks; the Redux code as written; seeded randomness; `flushSync` | supported | `README.md` "Ported from react-redux-benchmarks" |
| P2 | "the `use(store)` and Zustand variants are written the way each library's docs suggest" | **overreach** | `use(store)` has no docs; the README calls the store variant "idiomatic `use(store)`". The Zustand variant "runs its derivations unmemoized in selectors, as its docs show" (README), which can't be checked offline. Same issue at line 485 (CV5) |
| P3 | Suite ranges (rapid dispatch, many components, deep tree, derived) | supported | `suite.*.tally.*` |
| P4 | The faster of Redux and Zustand is Zustand in every main configuration, so the fairness controls only move the Redux column | supported | all 42 `main.*.best` are Zustand settings |
| P5 | fairness5: 14 of 14 against the fastest Redux; against Zustand "the same selection losses as the main suite" | supported | `suite.fairness5.selection.x{1,4}.vsZustand` = 1.1× slower; main at N=1,000: `main.selection.n1000.x{1,4}.verdict` = 1.1× slower |

## Shared derived data (lines 305-368)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| D1 | Plain `use(store)` computes once per component; `weakMemo` once per snapshot | supported | `counts.derived-selectors-spike.score-k50.{store,store-memo}.on.derivations` (450 vs 58) |
| D2 | `store-memo` beats Redux in every spike configuration with work | supported | `spike.tally.store-memo.{wins,total}` = 12/12 |
| D3 | Derivation counts 58.1 / 90 / 450 / 58.1 | supported | `counts.derived-selectors*.score*` keys; key meanings match |
| D4 | Snapshots are immutable by convention; every reader in a render gets the same snapshot object | supported | `research/shared-derived-data.md` §4 ("Within a root, every reader in a render gets the same snapshot object"); DCP-17. See "Hedges" (the evidence predates DCP-17, and it holds within one root) |
| D5 | Computing in the update tears; `concurrency.mjs` reproduces it with the real reconciler | supported | `spike-shared-derived/concurrency.mjs:268-316`; `research/shared-derived-data.md` §4 table |
| D6 | Options table (correctness and costs) | supported | `research/shared-derived-data.md` §5; `apps/store-compiled-shared.jsx` header |
| D7 | "Every option that shares computes the same number of derivations … as `createSelector` … so performance doesn't separate them" | **overreach** | Counts match (58 for every sharing variant vs 58.1, `counts.derived-selectors-spike.score-k50.*`). Timings do differ: in comment-k50 the fastest option (`store-compiled-shared-site`) is 1.7× faster than Redux while `store-memo` is 1.4× (`spike.comment.k50.x{1,4}.*.verdict`), and the fastest option varies by configuration (`spike.*.sharing.variant`). The counts don't separate them; the timings do somewhat, with no consistent winner |
| D8 | `weakMemo`: identity trie, WeakMap for objects, Map for primitives, like server `cache()`; collected with the snapshot | supported | `shared-memo.js:15-66` |
| D9 | The compiler memoizes the call per instance, so the shared cache is checked only when a snapshot changes | supported | `apps/store-memo.jsx` header; `NEXT_STEPS.md` §5.1 (corrected 2026-11-01) |
| D10 | How React should share is open; a render-scoped client `cache()` is the leading option | supported (status statement) | `research/shared-derived-data.md` §5-6 |
| D11 | Ported-suite ranges exclude the 2 `role` configurations, unread with no work for any store variant | supported | `suite.derived-selectors.tally.store.noWork`; `report-data.mjs` `judge` |
| D12 | "The fastest correct sharing option … a little ahead of `store-memo` … what you'd expect from taking the best of several" | supported | `report-suites.mjs` `SHARING` excludes `store-derived`. It includes `store-compiled-shared-site`, which isn't in the options table (see Hedges) |

## Selection and compiler coverage (lines 373-418)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| SE1 | "Selection is where `use(store)` loses, and that's the floor of a model without selectors, not a bug" | **overreach** | The floor analysis (`research/selection-floor.md`) profiles the two-store sweep rows on the final build. The main suite's four-store rows weren't profiled, and that note still says "The main suite isn't affected … store wins every configuration there" (line 10). That's stale on head, and the footer cites the note. Plausible, but an inference for the main suite |
| SE2 | Keyed selection "wins every configuration where it was measured" | supported | `sweep.tally.store-keyed.{selection,entity}.wins` = 14/14 each; `nobailout.sweep.tally.store-keyed.selection.wins` = 14/14 |
| SE3 | Table: rows, selector calls, medians at N=1,000, 1×, with the compiler | supported | `counts.main.selection.*.on.*`; `main.selection.n1000.x1.*.on.median` |
| SE4 | "Zustand re-renders two rows … That verdict is 1.1× slower" | **overreach (key misattached)** | `main.selection.n1000.x1.verdict` compares with `best` = "zustand **without** the compiler" (median 0.150, `main.selection.n1000.x1.zustand.off.median`). The table's Zustand row is Zustand *with* the compiler (0.155). The reader will take the verdict to be against the row shown |
| SE5 | CPU profile: the fiber visit is about the same, the difference is running the component, removing all store work ≈ a tie | supported in substance, **overreach on the build** | `research/selection-floor.md:16-35` (152 vs 119 µs; 112 without store work). The profile is from `react-builds/final` with an unminified production build, not the head build the page says everything comes from (M1) |
| SE6 | Store-side trims measured too small, reverted | supported | `selection-floor.md:40-44` (~2%, under the 5% bar) |
| SE7 | Keyed: stores created on demand by `weakMemo`, two update per selection, like Solid's `createSelector`, Map lifetime, created per mount | supported | `sweep-store-keyed.jsx:1-24,155-181`; `shared-memo.js` |
| SE8 | Sweeps: two stores per row, coverage and props varied at 1,000 rows, four variants | supported | `README.md` sweeps row; `report-data.mjs:332` (7 configs × 2 throttles = 14) |
| SE9 | Keyed 14/14 selection and entity; 14/14 without the bailout | supported | as SE2 |
| SE10 | Plain store wins every entity sweep and loses every selection sweep; c100/c50/c0 ranges | supported | `sweep.tally.store.{entity,selection}.*`; `sweep.selection.c{100,50,0}-w8.store.range` |
| SE11 | "With keyed selection, coverage doesn't matter" | supported | `sweep.selection.c{0,50,75,90,100}-w8.store-keyed.range` = 1.8-2.1× faster throughout |
| SE12 | Two design changes, neither implemented, both compiler and reconciler | supported | `selection-floor.md` last section |

## Without the same-element bailout (lines 423-435)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| B1 | Bailout behavior; a reconciler change; runs for every function component; own flag; first PR in the stack | supported | DCP-10 (`DECISIONS.md:127-145`); `STACK.md` table |
| B2 | Main suite at 1,000 and 10,000 rows, and the sweeps, on `head-nobailout`; not in the headline | supported | `nobailout.sizes`; `run-report-matrix.sh` MATRIX=nobailout |
| B3 | Same 28 configurations: 26 with the bailout, 24 without | supported | `nobailout.main.tally.{withBailout.matchOrBeat,all.matchOrBeat,all.total}` |
| B4 | "Selection is where it matters." | **overreach** | The bailout speeds up churn as much (`nobailout.main.bailoutGain.details-churn.range` = 1.1-1.2× faster, 4 of 4) and add/remove too (`…structure.range` = 1.2× faster, 4 of 4); selection gets up to 1.3× (3 of 4). The two verdicts that flip are one selection (`nobailout.main.selection.n10000.x1.verdict` = 1.2× slower vs tie with it) and one **subscribe churn** (`nobailout.main.details-churn.n1000.x4.verdict` = 1.1× slower vs 1.2× faster with it) |
| B5 | Keyed selection doesn't need it | supported | `nobailout.sweep.tally.store-keyed.selection.wins` = 14/14 |

## Typing and memory (lines 442-456)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| T1 | A store update in a transition can be interrupted; Redux and Zustand read through `useSyncExternalStore`, which renders synchronously inside a transition | supported | `store.jsx` `onFilterChange`; react-redux and Zustand `useSyncExternalStore` (node_modules); React's documented uSES fallback to a blocking update |
| T2 | p95 at 4× with the compiler | supported | `typing.main.{store,zustand,redux}.on.x4.p95` |
| T3 | `useDeferredValue` versions close most of the gap | supported | `typing.suite.*.on.x4.p95`. The comparison mixes runs (see Hedges) |
| T4 | Memory: heap growth after GC divided by rows; per-row figures; one context least; store's place; mount times | supported | `run.mjs:247-250,531-545` (`HeapProfiler.collectGarbage`); `memory.rank.on.n10000` |

## Where it doesn't win (lines 461-472)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| L1 | "Across every benchmark on this page, the store side loses 41 comparisons" | **contradicted** | `losses.all.count` sums six areas only (KEYS.md `losses.<area>.count`: main, granular, suites, fairness, sweeps, spike). The page also reports losses to one context (`main.tally.context.all.losses` = 7), for one store (`main.tally.single-selectors.all.losses` = 7), without the compiler (`main.tally.nocompiler-selectors.all.losses` = 18), without the bailout (4 of 28), and to Zustand in the fairness run (2) |
| L2 | "In every area, a recommended pattern wins, with one small exception against the granular control" | **overreach** | True for derived data (same configurations). For selection, keyed selection wins only in the sweeps (N=1,000, two-store rows); it was never timed in the main suite, at N=100 or 10,000, or against `zustand-granular` |
| L3 | Main suite: 3 of 42, all selection; keyed wins every selection sweep | supported | `losses.main.*`; `main.selection.*.verdict`; SE2 |
| L4 | Granular control: 6 of 42, all but one selection, "with the same fix" | **unsupported** | No run times `store-keyed` against `zustand-granular` (the sweeps compare against the faster of Redux and Zustand, `report-data.mjs:333`). The granular losses include N=100 and N=10,000 (`main.selection.n{100,10000}.x4.vsGranular`), where keyed selection wasn't run at all. Note the granular control is itself a keyed design for entities |
| L5 | Ported suites: 6 of 38, all derived selectors with plain store; `weakMemo` 6 of 6 | supported | `losses.suites.*`; `suite.derived-selectors.tally.store.rangeWork` (all slower) |
| L6 | Fairness against the fastest Redux: 0 of 14 | supported | `losses.fairness.*` |
| L7 | Sweeps: 14 of 56, all selection with plain store; keyed wins all | supported | `sweep.tally.store.selection.losses` = 14 |
| L8 | Spike: 12 of 32, all plain store; `weakMemo` 12 of 12 | supported | `losses.spike.*`; `spike.tally.store-memo.*` |
| L9 | A keyed expanded-rows store would apply the same fix, not measured | supported (labeled as unmeasured) | — |

## Caveats (lines 480-488)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| CV1 | One machine, one browser | supported | `method.cpu`, `method.browser` |
| CV2 | `flushSync` measures synchronous work; only typing measures transitions | supported | `README.md` |
| CV3 | "Without it, `use(store)` loses wherever every reader re-renders" | **contradicted** | As MS6: add/remove re-renders every reader and the uncompiled store wins it 1.4-1.8× |
| CV4 | Main-suite selection depends on the same-element bailout | supported | B3/B4. It omits subscribe churn, which also flips (see Hedges) |
| CV5 | "Each library is written the way its docs suggest" | **overreach** | As P2 |
| CV6 | The compiler doesn't memoize a value built across `use()` calls; a call on values read with `use()` is memoized | supported | `NEXT_STEPS.md` §5.1; fixtures `use-operator-store-derived-value`, `use-operator-store-conditional-loop` |
| CV7 | Leaner Redux faster in some configurations; only 1,000 rows measured; no verdict flips there | supported | `suite.fairness.control.*.range` (6 faster each); `suite.fairness5.tally.fastestRedux.*` |
| CV8 | "The typing and memory benchmarks have fewer runs than the main suite" | **contradicted** | Typing, typing-suite and memory each have 3 runs (`report-sources.json`: 3 files each); the main suite has 3 restarts (5 for 6 configurations). What they have fewer of is samples: 19 keys per typing run (`typing.main.keys`) and one measurement per memory run, against `method.samples` = 600 per main configuration |

## How to reproduce (lines 494-503)

| ID | Claim | Verdict | Source |
|---|---|---|---|
| R1 | "`./run-report-matrix.sh` runs every benchmark this page cites on the frozen build" | **overreach** | The default run omits fairness5 (needs `EXTRA_SUITES='fairness5:fairness\|--n=1000 …'`, `run-report-matrix.sh:84-86`) and the extra r4/r5 restarts (needs `RESTARTS=5 RESTART_FROM=4 ONLY='-(selection\|details-churn)-x1$'`, header lines 16-17). The profile and the history run aren't reproduced by it either |
| R2 | `ambient-cpu.mjs`: CPU outside the process tree; waited on, sampled, logged per unit | supported | `run-report-matrix.sh` `unit()` |
| R3 | `report-data.mjs` writes bench-data.json from pinned files; `--check` | supported | `report-data.mjs` header |
| R4 | `check-docs.mjs` "fails on any number in the prose that isn't generated" | **overreach** | `check-numbers.mjs` rule 5 checks *digits* outside exempt elements, with an allowlist and `data-lit`. Spelled-out numbers ("seven scenarios", "four selectors", "one in twenty", "four times CPU throttling") pass unchecked |
| R5 | The full matrix takes hours | supported | `head-units.log` 20:39 → 01:23, plus `headnb-units.log` 00:11 → 00:42 |

## Tally

108 claims: **85 supported**, **15 overreach**, **1 unsupported**, **7 contradicted**.

- Contradicted: M5, M7, MS5, MS6, L1, CV3, CV8.
- Unsupported: L4.
- Overreach: H2, W2, M1, M13, M14, P2, D7, SE1, SE4, SE5, B4, L2, R1, R4, CV5.

## Required fixes

In order of severity. Where a number has no key yet, the author needs to add one (or use words), because check-numbers rejects bare digits.

1. **M5, line 197: disclose the extra restarts.** Replace "in each of N browser restarts, with the order shuffled" with:
   > …in each of <span data-n="method.restarts"></span> browser restarts, with the order shuffled. Selection and subscribe churn at 1× CPU got two more restarts, because their first three disagreed within a few percent of parity. Two of the three headline losses are in those configurations.

   This needs a key for the extra restarts, or the words "two more". The run was adaptive, and a reader who knows statistics will want to know.
2. **L1, line 461: scope the 41.**
   > Across the comparisons this page counts as results (the headline, the granular control, the ported suites, the fairness run against Redux, the sweeps and the spike), the store side loses <span data-n="losses.all.count"></span>. The controls (one store, no compiler, Context, no bailout) have their own sections and aren't counted here.
3. **H2 (line 93), L2 (line 461), L4 (line 465): say where the pattern was measured.**
   - Lede: "Almost every place it loses has a recommended pattern that wins, and this page shows both." becomes:
     > For every loss outside selection, a recommended pattern wins in the same configurations. For selection, the recommended pattern wins every configuration where it was measured, in a separate sweep.
   - Line 461: "In every area, a recommended pattern wins, with one small exception against the granular control:" becomes:
     > For shared derived data, the recommended pattern wins in the same configurations. For selection, keyed selection wins every sweep, but it wasn't timed in the main suite or against the granular control:
   - Line 465: replace "with the same fix" with:
     > Keyed selection should apply here too, but it wasn't timed against the granular control.
4. **MS6 (line 261) and CV3 (line 483): no-compiler losses aren't "wherever every row re-renders".**
   - Line 261:
     > Without the compiler, `use(store)` loses badly where its rows re-render and the selector apps' rows don't: selection (<span data-n="main.tally.nocompiler-selectors.selection.range"></span>) and subscribe churn (<span data-n="main.tally.nocompiler-selectors.details-churn.range"></span>). Where every variant re-renders every row, in add / remove, it still wins.
   - Line 483:
     > Without it, `use(store)` loses wherever its readers re-render and the selector apps' don't (see the controls).
5. **MS5, line 261.** Replace "The compiler skips the rows whose output didn't change." with:
   > With the compiler, a row whose output didn't change still runs, but returns its cached element, so React skips everything below it.
6. **M7, line 199.** Replace "Ambient CPU is logged for every unit. Across the 86 units of the head build," with:
   > Ambient CPU is logged for every unit that ran under this gate. Across those <span data-n="method.gate.head.units"></span> units,
7. **CV8, line 488.** Replace it with:
   > The typing and memory benchmarks have far fewer samples than the main suite: <span data-n="typing.main.keys"></span> keys per typing run and one measurement per memory run, over three runs. Each table shows how many runs.
8. **SE4, line 391.** Name the opponent of the verdict:
   > At its faster setting here, without the compiler, Zustand's median is <span data-n="main.selection.n1000.x1.zustand.off.median"></span> ms, and the verdict is <span data-n="main.selection.n1000.x1.verdict"></span>.
9. **B4, line 429.** Replace "Selection is where it matters." with:
   > It helps wherever every row re-renders: selection (<span data-n="nobailout.main.bailoutGain.selection.range"></span>), subscribe churn (<span data-n="nobailout.main.bailoutGain.details-churn.range"></span>) and add / remove (<span data-n="nobailout.main.bailoutGain.structure.range"></span>). It flips two verdicts, one in selection and one in subscribe churn.

   Then keep the "Without it, selection is…" sentence. Line 484 (CV4) should say "Selection and subscribe churn in the main suite depend on…".
10. **W2, line 141.** Replace "It changed because a review … and fixed them:" with:
    > Since then, a review of the benchmark code found two things that were unfair to the selector libraries and fixed them. The React build changed too, but A/B runs of the build changes measured every cell within a few percent, so the fixes are the likely cause:

    Line 148 already says neither fix was timed on its own; keep it.
11. **M1 (line 193) and SE5 (line 393): name the exceptions to "one frozen build".**
    - Line 193:
      > Every benchmark result on this page comes from one frozen React build…, except the section without the same-element bailout, which uses the same commit with only that flag off.
    - Line 393: "A CPU profile of the same case in the sweeps (below)" becomes:
      > A CPU profile of the same case on the previous build, in the sweeps (below),

      The trims sentence should also say they were measured on that build.
12. **R1, line 497.** Add the two invocations the default run skips:
    > `EXTRA_SUITES='fairness5:fairness|--n=1000 --throttle=1,4 --iterations=200 --warmup=50'` adds the leaner-Redux run, and `RESTARTS=5 RESTART_FROM=4 ONLY='-(selection|details-churn)-x1$'` adds the extra restarts.
13. **M14, line 213.** Replace "every variant is checked to render the same DOM after every update, in jsdom and in Chrome" with:
    > every variant is checked to render the same DOM after each of 20 replayed updates per scenario, in jsdom and in Chrome (the sweeps in Chrome only).
14. **M13, line 209.** Add "at <span data-n="method.countsRows"></span> rows" after "in each configuration".
15. **SE1, line 373.** Qualify it:
    > …that's the floor of a model without selectors, not a bug: a profile of two-store rows (below) puts the gap in running the component, not in the store.

    Separately, `research/selection-floor.md:10` ("The main suite isn't affected … store wins every configuration there") is stale and the footer links it. Fix the note, or don't cite it for the main suite.
16. **D7, line 340.** Replace "so performance doesn't separate them" with:
    > so the work doesn't separate them. Their timings differ somewhat by configuration, with no option fastest everywhere.
17. **P2 (line 275) and CV5 (line 485).** Replace "written the way each library's docs suggest" with:
    > The `use(store)` variants follow the explainer's patterns, and the Zustand variants follow its docs.
18. **R4, line 500.** Replace "any number" with "any digit".

## Hedges to check

- **Cross-run comparisons.**
  - The bailout gains compare the no-bailout run (00:11-00:42) with head runs from hours earlier. They weren't interleaved.
  - Typing compares the store's p95 from `typing.main` (39.9) with the deferred variants from `typing.suite` (store 44.2 there).
  - Both are fine for "most of the gap" and "up to 1.3×", but the page shouldn't present them as paired.
- **D4, the snapshot invariant.** The cited evidence (`concurrency.mjs`, "readStoreRecord caches per render") predates DCP-17, which moved store state onto the HostRoot. Confirm that a current test in `ReactUseStore-test.js` pins "every reader in a render gets the same snapshot". Also, it holds within one root: across roots, an updater function gives each root its own snapshot (`shared-derived-data.md` §4).
- **M14.** No artifact shows that the verify step ran for the head build, because `head-units.log` starts at the counts. Confirm it, or record it in the log.
- **M12, "what the react-redux docs recommend".** The react-redux README recommends the RTK templates. Auto-freeze is RTK's default, not something the docs recommend. That's fine as written, but don't strengthen it.
- **P2/CV5, the Zustand docs.** "As its docs show" (README) couldn't be checked offline.
- **D12.** The "sharing" set includes `store-compiled-shared-site`, which isn't in the options table, and it's the fastest in 5 of 16 spike configurations.
- **CV4.** Main-suite subscribe churn also depends on the bailout: `details-churn.n1000.x4` goes from 1.2× faster to 1.1× slower without it.
- **Other run settings.** many-components-same-slice uses 100 timed updates after 20 warm-ups, and the spike 100 after 30 (`run-report-matrix.sh:72,212`). The page only claims 200/50 for the main suite, which is correct. Don't generalize it.
- **The author's ledger is stale in places.** `benchmark-report.claims.md:61` says 83 head units, but the data says 86. Line 11 says keyed selection and `weakMemo` "cover every loss except one", which is the L2/L4 overreach.
- **The compiler hash (C7)** matches today. Re-check it after any `yarn build` or compiler rebuild, since the compiled `Row` is generated at page-build time.
