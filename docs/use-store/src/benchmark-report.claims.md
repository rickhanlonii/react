# Claims ledger: benchmark-report.src.html

Every claim in `benchmark-report.src.html`, by section, with its source: a `bench-data.json` key (cited in the page as `data-n` or drawn by a `gen:` block), a file and line, a DCP, or a test. "Gen" means the claim restates what a generator draws from the same data. Keys were checked against `bench-data.json` as of 2026-11-02 01:03 (build a3d8e745, compiler c59ecf06d45b47db). Claims marked **data-dependent** name a fact that comes from the current data but is written in words (which scenarios lose, "most", "all but one"). Re-check them whenever the data is regenerated.

## Header

| Claim | Source |
|---|---|
| Matches or beats the faster of Redux and Zustand in 39 of 42 main-suite configurations | `main.tally.selectors.all.matchOrBeat`, `.total` |
| Loses 3, all in one scenario (selection) | `main.tally.selectors.all.losses`; `main.tally.selectors.selection.range` (3 slower); every other scenario's `.matchOrBeat` = 6/6. **Data-dependent** |
| Outside selection, a recommended pattern wins in the same configurations; for selection, it wins every configuration where it was measured, in a separate sweep | `suite.derived-selectors.tally.store-memo.*`, `spike.tally.store-memo.*`; `sweep.tally.store-keyed.selection.*`. Keyed selection was timed only in the sweeps (pass 1 H2) |
| Synthetic, no real-app data, experiment behind `enableStore`, not shipped | Explainer `src/explainer.src.html:113-115` (same wording), `packages/shared/ReactFeatureFlags.js` (`enableStore`) |

## The claim and the scoreboard

| Claim | Source |
|---|---|
| Selector libraries run every mounted selector on every update | `fixtures/store-bench/README.md:5`; counts: `counts.main.entity.redux.on.selectors` (4,003 at N=1k) |
| `use(store)` re-renders readers of the changed store; the compiler skips unchanged output | Explainer `#performance`; `counts.main.selection.store.on.renders` (1,002 = 1,000 rows + 2 RowViews) |
| Each library at its own faster compiler setting | `KEYS.md` "Comparisons" note; `main.*.best` keys show both settings |
| Entity edit, add/remove and conditional-read ranges | `main.tally.selectors.{entity,structure,details-inline}.range` |
| Selection range; selectors re-render only two rows | `main.tally.selectors.selection.range`; `counts.main.selection.{redux,zustand}.on.rows` = 2 |
| Granular control: own column, not in the headline, loses 6 of 42, mostly selection | `losses.granular.count`, `.of`; gen `losses-table` (5 selection, 1 details-churn). **Data-dependent** |
| Keyed selection isn't in the main suite; nobailout has its own section | `report-data.mjs` HEADLINE_OPPONENTS / KEYS.md header; `sweep.tally.store-keyed.*` |

### What changed since the last report

| Claim | Source |
|---|---|
| Old headline: 36 of 36 on the final build | `history.final.tally.selectors.all.matchOrBeat`, `.total` (set `history-final`) |
| Fix 1: selector rows had an inline-details selector in every scenario; now only `details-inline` uses `RowWithInlineDetails` | commit 7de5a12d94 (`fixtures/store-bench/src/apps/{redux,zustand,zustand-granular}.jsx`); `README.md:75` |
| Fix 2: Zustand's count ran the O(N) loop in a selector on every update; now selects inputs and counts in render | commit 7de5a12d94, `fixtures/store-bench/src/apps/zustand.jsx:79-89` and the removed `selectCount` |
| Both fixes remove work only the selector apps did; neither timed on its own | commit 7de5a12d94: one selector per row and one O(N) selector per update removed from the selector variants only (reviewer wording, checkpoint 2) |
| The review added subscribe churn | `README.md:84`; `history.final.scenarios` = 6 vs seven now |

## The code compared

| Claim | Source |
|---|---|
| Code is extracted from the measured sources at build time, instrumentation stripped | `docs/use-store/sandbox/API.md` section 7; `tools/build-docs.mjs:139-166` |
| Same `RowView`/`CountView`, same DOM | `README.md:69`; `run-jsdom.mjs`, `run.mjs --verify` |
| Store: a store per entity plus selection, filter, expanded, details stores; a row reads four; details only when expanded | `fixtures/store-bench/src/apps/store.jsx:20-34`; `README.md:59` |
| Redux: four selectors per row on every update | `redux.jsx:90-97`; `counts.main.entity.redux.on.selectors` ≈ 4 × 1,000 |
| Zustand count from two selectors in render | `zustand.jsx:79-89` |
| Granular: each entity its own Zustand store | `zustand-granular.jsx:28-31`; `README.md:65` |
| Compiled Row uses compiler c59ecf06d45b47db, the one the benchmarks used | `build.compiler`; `shasum -a 256 compiler/packages/babel-plugin-react-compiler/dist/index.js` = c59ecf06d45b47db… (checked 2026-11-02). If the compiler dist is rebuilt, this sentence must be re-checked |
| The compiled Row returns the cached element when inputs didn't change | gen `code:…store.jsx#Row {"compiled": true}` (`t5 = $[14]`) |

## Method and build

| Claim | Source |
|---|---|
| One frozen build, version, `react-builds/head`, production bundles | `build.version`, `build.sha`; `README.md:11-14` (NODE_PROD); `run-report-matrix.sh:5-7` |
| Each result file records its build; G5 fails otherwise | `tools/check-numbers.mjs:12-15` |
| Library versions | `lib.*` |
| Headless shell, CPU, Node, Playwright | `method.browser`, `method.cpu`, `method.node`; `README.md:40` |
| Each update one task in `flushSync` | `README.md:73` |
| 42 configurations: seven scenarios × sizes × throttles | `method.configs`, `method.sizes`, `method.throttles`; seven = `README.md:79-85` |
| Warm-up, iterations, restarts, shuffled order, total timed updates | `method.warmup`, `method.iterations`, `method.restarts`, `method.timedUpdates`; `README.md:53` (randomized order) |
| Ambient-CPU gate: start at ≤ 3.5 cores, discard above 4.5 mean | `method.gate.ambientStart`, `method.gate.ambientDiscard`; `run-report-matrix.sh:10-14,54-55,115,134`; `ambient-cpu.mjs:1-3` |
| Head build timing units (100), of which those under the ambient gate (86) have an ambient record; median and max of mean ambient | `method.gate.head.timedFiles`, `method.gate.head.ambientGated`, `method.gate.head.ambientMean.{median,max}`; `run-report-matrix.sh:56,137` |
| Replaced a load-average gate that counted the benchmark's own load | `method.gate.history`; `ambient-cpu.mjs:1-3` |
| Only main restart 1 ran under the old gate (14 units) | `method.gate.head.loadGated`; `method.gate.history` ("used by main restart 1 (14 files)") |
| Verdicts: means, two standard errors, every restart must agree, otherwise a tie; ratio of means | `method.verdictRule`; `KEYS.md` "Comparisons" note |
| A median can be lower on the slower side | gen `losses-table` caption, e.g. `derived-selectors · score · 1×` (store median 0.290 < 0.340, mean 0.415 > 0.359) |
| "Faster of Redux and Zustand" switches compiler setting | `main.selection.n1000.x1.best` (zustand without the compiler) vs `main.selection.n100.x1.best` (zustand + compiler) |
| Counting build: counters, deterministic, not timed or gated; DOM checked in jsdom and Chrome first | `README.md:90-99`; `run-report-matrix.sh:159-195` (verify, then ungated counts) |
| `structure` is low-signal: every variant re-renders every row | `README.md:85`; `counts.main.structure.*.on.rows` = 1,000 for every variant |
| `role` is an unread update, counted as no work | `research/redux-benchmarks.md:43` ("Nothing renders users"); `report-data.mjs:156-161`; `counts.derived-selectors.role.store.on.derivations` = 0 |
| List caught up after = start of typing until the list shows the full text, typing included | KEYS.md `typing.<which>.<variant>.<compiler>.x<throttle>.settle`; gen `typing-table` column |

## The main scenarios

| Claim | Source |
|---|---|
| Scenario table (update, what it isolates) | `README.md:77-85` |
| Chart and grid contents | gen `main-chart`, `main-verdicts` |
| Entity: 1 row with store vs 4,003 Redux selector calls | `counts.main.entity.store.on.rows`, `counts.main.entity.redux.on.selectors` |
| Inline conditional read: 30 renders, no selector calls; Redux the same renders and 4,003 calls | `counts.main.details-inline.{store,redux}.on.{renders,selectors}` (both 30 renders) |
| Selection: 1,000 rows vs 2 | `counts.main.selection.{store,zustand}.on.rows` |
| Subscribe churn new; every row re-renders (1,000 vs 99); a tenth mount or unmount a reader; matches or beats in every configuration | `counts.main.details-churn.{store,redux}.on.rows`; `README.md:84`; `main.tally.selectors.details-churn.range`, `.matchOrBeat` = 6/6 |
| store-single is the worst case and beats in most configurations | `README.md:7,60`; `main.tally.single-selectors.all.range` (26 faster, 9 tie, 7 slower). **Data-dependent** ("most") |
| Without the compiler, selection loses badly | `main.tally.nocompiler-selectors.selection.range` |
| Context per slice: every configuration | `main.tally.context-split.all.range`, `.matchOrBeat` = 42/42 |
| One context: range; loses only in the listed scenarios; biggest loss | `main.tally.context.all.range`, `main.tally.context.lostScenarios`, `main.tally.context.maxLoss` (generated; no longer data-dependent words) |
| Same renders for store and one context in those scenarios | `counts.main.{filter,details-churn}.{store,context}.on.renders` (1,502/1,502 and 1,099/1,099). Re-check if `lostScenarios` changes |

## The ported Redux benchmarks

| Claim | Source |
|---|---|
| Four scenarios from reduxjs/react-redux-benchmarks, Redux code as written, seeded randomness, timed in flushSync | `README.md:112` |
| Suite ranges | `suite.rapid-dispatch.tally.store.range`, `suite.many-components-same-slice.tally.store.range`, `suite.deeptree-nested-hooks.tally.store.range`, `suite.derived-selectors.tally.{store,store-memo}.range` |
| RTK uses Immer, which freezes by default; idiomatic, kept | `README.md:135` |
| Fairness controls at the middle size with `redux-plain` and `redux-nofreeze` | `README.md:129`; `run-report-matrix.sh:75` (`--n=1000 --variants=redux,redux-plain,redux-nofreeze`: the control times only the Redux variants) |
| Turning off RTK or auto-freeze speeds Redux up; only moves the Redux column; faster of Redux/Zustand is Zustand in every main config; control times only Redux | `suite.fairness.control.{redux-plain,redux-nofreeze}.range`; every `main.*.best` is a Zustand setting; `run-report-matrix.sh:75` |

## Shared derived data

| Claim | Source |
|---|---|
| Plain store computes once per component; weakMemo once per snapshot | `counts.derived-selectors-spike.score-k50.{store,store-memo}.on.derivations` (450 vs 58) |
| store-memo beats Redux in every spike configuration with work | `spike.tally.store-memo.wins` = `.total`; `spike.tally.store-memo.range` |
| createSelector shares; compiler memoizes per instance | `research/shared-derived-data.md:1-5,223-230` |
| Score update: Redux 58.1, store 90; with most readers 450 vs 58.1 | `counts.derived-selectors.score.{redux,store}.on.derivations`, `counts.derived-selectors-spike.score-k50.{store,redux}.on.derivations` |
| Store values are treated as immutable snapshots (a convention, like state; mutating in place breaks it); every reader in a render gets the same snapshot object | `research/shared-derived-data.md:144-165` (§4, "Within a root, every reader in a render gets the same snapshot object"); DCP-17 (explainer index) |
| Computing in the update tears; reproduced with the real reconciler | `research/shared-derived-data.md:16,160,232-241`; `fixtures/store-bench/spike-shared-derived/concurrency.mjs:266-313`; test `ReactUseStore-test.js:1459` ("a value derived from several stores outside of render tears with a pending transition") |
| Options table | `research/shared-derived-data.md:221-352` (§5); stand-in notes: `apps/store-compiled-shared.jsx:1-9`, `apps/store-derived-lazy.jsx`, `shared-memo.js` (generationalMemo) |
| Every sharing option has the same derivation count as createSelector | `research/shared-derived-data.md:12,62` ; `counts.derived-selectors-spike.*.store-memo.on.derivations` = Redux's |
| weakMemo: identity trie, WeakMap for objects, Map for primitives, like server cache(); collected with the snapshot | `shared-memo.js:15-20,52-66` |
| One line at module scope + call in render | `apps/store-memo.jsx:28,67-71` |
| Read the stores in render and pass the snapshots to the shared function | `apps/store-memo.jsx:67-71`. (The earlier "inline f(use(a), use(b)) isn't memoized" claim was false and is removed: compiler fixture `use-operator-store-derived-value`, NEXT_STEPS §5.1 corrected) |
| Snapshot arguments first | `research/shared-derived-data.md:243-256` (costs) |
| Compiler still memoizes per instance; shared cache only checked on change | `apps/store-memo.jsx:6-8` |
| How React should share is open; render-scoped cache() leading | Explainer `src/explainer.src.html` (#derived, same wording); `research/shared-derived-data.md:353-389` |
| Ported suite: store range, store-memo range | `suite.derived-selectors.tally.{store,store-memo}.range` |
| Spike: plain store falls behind with more readers; store-memo ahead; fastest sharing option range | `spike.tally.store.{k20,k50}.range`, `spike.tally.store-memo.range`, `spike.tally.sharing.range` |

## Selection and compiler coverage

| Claim | Source |
|---|---|
| Selection is the floor of a model without selectors | `research/selection-floor.md:44-45`; DECISIONS.md "Finding: what's left of the gap to Zustand is the reconciler, not the store" |
| Main-suite store selects without keys | `store.jsx:23` (`use(s.selected) === id`) |
| Table: rows, selector calls, medians at N=1k, 1× | `counts.main.selection.{store,zustand,redux,zustand-granular}.on.{rows,selectors}`; `main.selection.n1000.x1.{store,zustand,redux,zustand-granular}.on.median` |
| Cached element for all but two; bailout skips reconciling | `counts.main.selection.store.on.renders` = 1,002; DCP-10; `ReactSameElementBailout-test.js` |
| Verdict 1.1× slower | `main.selection.n1000.x1.verdict` |
| Profile: fiber visit a wash; difference is running the component; removing store work ≈ tie; trims reverted | `research/selection-floor.md:16-46` (profile of sweeps c100-w8 on the final build) |
| "I don't think a store-side optimization changes this" | Hedge, matches explainer `#selection-floor` and `selection-floor.md:44` |
| Keyed selection: a store per row from weakMemo; select updates two stores | `sweep-store-keyed.jsx:1-7,165-181` |
| Like Solid's createSelector | `sweep-store-keyed.jsx:5` |
| Primitive id keeps stores in a Map while `selectedStoreFor` lives; created per mount | `shared-memo.js:36-47`; `sweep-store-keyed.jsx:21-23,165` |
| Sweeps: two stores per row, compiler coverage and props, middle size, four libraries | `README.md:131`; KEYS.md `sweep.*` (N=1,000) |
| store-keyed wins 14/14 selection and entity, with and without the bailout | `sweep.tally.store-keyed.{selection,entity}.{wins,total}`; `nobailout.sweep.tally.store-keyed.selection.{wins,total}` |
| Plain store wins every entity sweep, loses every selection sweep; ranges at c100, c50, c0 | `sweep.tally.store.{entity,selection}.*`; `sweep.selection.{c100-w8,c50-w8,c0-w8}.store.range` |
| Uncompiled readers re-render children | Explainer `#other-costs`; counts `losses-table` sweep rows (c50: 1,502 renders vs 1,002 at c100) |
| Two design changes, not implemented | `research/selection-floor.md:46-61` |

## Without the same-element bailout

| Claim | Source |
|---|---|
| Same-element bailout behavior; reconciler change; every function component; own flag; first PR in the stack | DCP-10 (`DECISIONS.md:127-150`); `docs/use-store/STACK.md:7,48` |
| Main suite at the two larger sizes and the sweeps on `react-builds/head-nobailout` | `run-report-matrix.sh:18-22`; gen `nobailout-table` rows (N=1,000 and N=10,000 only) |
| Same 28 configs: 26 with the bailout, 24 without | `nobailout.main.tally.withBailout.matchOrBeat`, `nobailout.main.tally.all.matchOrBeat`, `.total` |
| Bailout's effect on selection | `nobailout.main.bailoutGain.selection.range` |
| Without it, selection range | `nobailout.main.tally.selection.range` |
| Keyed selection still 14/14 | `nobailout.sweep.tally.store-keyed.selection.{wins,total}` |

## Typing and memory

| Claim | Source |
|---|---|
| Keys and rows | `typing.main.keys`, `typing.main.rows` |
| Every variant updates input right away and the list in a transition | `store.jsx:62-66`, `zustand.jsx:91-97`, `redux.jsx:148-155`, `context.jsx:70`, `context-split.jsx:79`, `store-single.jsx:64`, `zustand-granular.jsx:92` |
| useSyncExternalStore renders synchronously in a transition | `zustand.jsx:93` comment; `README.md:86` |
| p95 at 4× with the compiler | `typing.main.{store,zustand,redux}.on.x4.p95` |
| useDeferredValue variants close most of the gap | `typing.suite.{store,zustand-deferred,redux-deferred}.on.x4.p95`; `README.md:130` |
| Memory: bytes per row at N=10k, compiler on; context least; store's place; mount times | `memory.{store,zustand,redux,context}.on.n10000.bytesPerRow`, `memory.rank.on.n10000`, `memory.storePlace.on.n10000` (holds at every size, compiler on and off, per data-eng-2), `memory.{store,redux}.on.n10000.mountMs` |

## Where it doesn't win

| Claim | Source |
|---|---|
| 41 losses in total | `losses.all.count` |
| Main vs headline: 3 of 42, all selection | `losses.main.count`, `.of`; gen `losses-table`. **Data-dependent** ("all selection") |
| Granular: 6 of 42, all but one selection, the exception churn at N=100 | `losses.granular.count`, `.of`; gen `losses-table`. **Data-dependent** |
| Keyed expanded store would apply the same fix, not measured | Reasoning by analogy with keyed selection; explicitly marked unmeasured |
| Suites: 6 of 38, all derived selectors; store-memo 6 of 6 | `losses.suites.*`; `suite.derived-selectors.tally.store-memo.{wins,total}` |
| Sweeps: 14 of 56, all selection; keyed wins all | `losses.sweeps.*`; `sweep.tally.store-keyed.selection.wins` |
| Spike: 12 of 32, all plain store; store-memo 12 of 12 | `losses.spike.*`; `spike.tally.store-memo.{wins,total}` |
| Medians vs means | `method.verdictRule`; gen `losses-table` caption |

## Caveats

| Claim | Source |
|---|---|
| One machine, one browser | `method.cpu`, `method.browser` |
| flushSync measures synchronous work; only typing measures transitions | `README.md:73,86` |
| Wins depend on the compiler | `main.tally.nocompiler-selectors.all.range` |
| Main-suite selection depends on the bailout, its own PR, first in the stack | `nobailout.main.tally.selection.range` vs `main.tally.selectors.selection.range`; `docs/use-store/STACK.md:7` |
| Hand-tuned selector app does better (granular control) | `main.tally.zustand-granular.selection.range` |
| Typing and memory have fewer runs | gen `typing-table`, `memory-chart` (runs = 3) vs `method.samples` |
| The compiler doesn't memoize a value built across `use()` calls (push in a loop, a loop over stores) because the scope with `use()` is flattened; a call on values read with `use()` is memoized | `compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler/use-operator-store-derived-value.js`; `docs/use-store/NEXT_STEPS.md:206-212` (corrected 2026-11-01); reviewer, checkpoint 2 |
| Headline compares against idiomatic RTK; leaner setups are faster in some configs; at 1,000 rows no verdict flips; other sizes unmeasured | `suite.fairness.control.*.range`; `suite.fairness5.tally.fastestRedux.{matchOrBeat,total}`; `run-report-matrix.sh:86` |

## How to reproduce

| Claim | Source |
|---|---|
| Install libraries with yarn in fixtures/store-bench | `README.md:19-22` |
| run-report-matrix.sh: build, verify, count, resumable timing units; MATRIX=nobailout | `run-report-matrix.sh:2-34` |
| ambient-cpu.mjs: CPU outside the process tree; waited on, sampled, logged | `ambient-cpu.mjs:1-5`; `run-report-matrix.sh:95-137` |
| report-data.mjs writes bench-data.json from pinned results; --check | `report-data.mjs:1-6` |
| build-docs and check-docs | `docs/use-store/sandbox/API.md` sections 6-7 |
| Full matrix takes hours | Plan (`~/.claude/plans/i-have-a-large-velvety-aurora.md:99`, "about 2 hours") |

## Sizes and no-work counts (added after the size keys landed)

| Claim | Source |
|---|---|
| Counting build, fairness and selection table at 1,000 rows | `method.countsRows` |
| Sweeps at 1,000 rows | `sweep.rows` |
| Nobailout main suite at 1,000 and 10,000 rows | `nobailout.sizes` |
| Derived-selectors has 5 readers per category, the spike 20 and 50 | `spike.defaultK`, `spike.ks` |
| Ranges exclude the `role` configurations (no work) | `suite.derived-selectors.tally.*.{rangeWork,noWork}`, `spike.tally.*.{rangeWork,noWork}` |

## Fairness-5 and the idiomatic-Redux definition (checkpoint 2)

| Claim | Source |
|---|---|
| The headline's Redux is idiomatic RTK (configureStore, createSlice, Immer auto-freeze) with react-redux; leaner setups compared separately | `method.headlineRedux`; `fixtures/store-bench/src/apps/redux.jsx` |
| Faster of Redux and Zustand is Zustand in every main config, so the control moves only the Redux column | every `main.*.n*.x*.best` is a Zustand setting |
| Fairness-5 timed store, Zustand and the three Redux setups together at 1,000 rows | `run-report-matrix.sh:86` (`EXTRA_SUITES='fairness5:fairness|--n=1000 ...'`); `method.countsRows` |
| Store matches or beats the fastest Redux setup in 14 of 14, range | `suite.fairness5.tally.fastestRedux.{matchOrBeat,total,range}`; `losses.fairness.count` = 0 |
| Against Zustand in that run, the same selection losses as the main suite | `suite.fairness5.tally.zustand.range` (2 slower, both selection per data-eng-2: `suite.fairness5.selection.x{1,4}.vsZustand`) |
| Caveat: only 1,000 rows measured with leaner Redux | `run-report-matrix.sh:86` |

## Pass 1 fixes (claim audit, `benchmark-report.claim-ledger.md`)

| Item | Claim now | Source |
|---|---|---|
| W2 | Fairness fixes and the build both changed; fixes likely main cause by inspection; neither isolated | commit 7de5a12d94; `history.final.*` source note (predates the HostRoot redesign). The ledger's suggested A/B sentence was not used: `data/ab-prhead-vs-stack-20261101.txt` compares e31a6640 with the stack, not the final build with head |
| M1 | One frozen build, except the no-bailout section (same commit, flag off) | `run-report-matrix.sh:18-22` |
| M7 | 100 timing units, 86 with an ambient record | `method.gate.head.timedFiles`, `method.gate.head.ambientGated`, `method.gate.head.loadGated` |
| M13 | Counting build runs at 1,000 rows | `method.countsRows` |
| MS5 | Rows still run; cached element; React skips below | `counts.main.selection.store.on.{rows,renders}` |
| MS6, CV3 | No compiler loses where store rows re-render and selector rows don't (selection, churn); wins add / remove | `main.tally.nocompiler-selectors.{selection,details-churn,structure}.range` |
| P2, CV5 | Store variants follow the explainer's patterns; selector variants follow their docs | `README.md:112-121`; explainer `#patterns` |
| D4 | Same snapshot within a root | `research/shared-derived-data.md:163-165` (across roots, updater functions give each root its own snapshot) |
| D7 | Same work; timings differ, no option fastest everywhere | `spike.*.sharing.variant` (varies by configuration) |
| SE1 | Gap is in running the component, per a two-store-row profile | `research/selection-floor.md:16-46` |
| SE4 | Verdict opponent is Zustand without the compiler, median shown | `main.selection.n1000.x1.zustand.off.median`, `main.selection.n1000.x1.best` |
| SE5 | Profile and trims on the previous build | `research/selection-floor.md:3-15,38-43` (`react-builds/final`, `opt11`) |
| B4 | Bailout helps selection, churn, add / remove; cross-run, not interleaved | `nobailout.main.bailoutGain.{selection,details-churn,structure}.range`; ledger hedge (00:11-00:42 vs earlier head runs) |
| CV4 | Selection and churn depend on the bailout | `nobailout.main.details-churn.n1000.x4.verdict` vs head |
| L1 | Losses count scoped to the result comparisons; controls excluded | `losses.all.count` and the `losses.*` areas (no control areas) |
| L2, L4, H2 | Keyed selection only timed in the sweeps | `sweep.tally.store-keyed.*`; no main or granular keyed variant exists |
| CV8 | Fewer samples, not fewer runs | `typing.main.keys`, `method.restarts`; gen `typing-table`, `memory-chart` runs |
| R1 | Extra invocations for fairness5 and extra restarts | `run-report-matrix.sh:16,86` |
| R4 | "any digit" | `tools/check-numbers.mjs:22-25` |
| M5 | Default restarts, except selection and churn at 1× (five, every size), extra because the first three disagreed near parity; two headline losses are there; restart rule applies | `method.restartsDefault`, `method.restartsExtra`, `method.restartsExtraUnits`; `run-report-matrix.sh:16`; `method.verdictRule` |
| M14 | DOM checked after each replayed update, jsdom and Chrome, sweeps Chrome only | `run-report-matrix.sh:159-185`; `README.md:50` |
| SE4 | Selection table shows Zustand at its faster setting (no compiler), the verdict's opponent; other rows labeled with the compiler | `main.selection.n1000.x1.{bestMedian,bestVariant,bestCompiler}`; `counts.main.selection.zustand.off.{rows,selectors}` |
| L1 | Loses 41 of 224 counted comparisons | `losses.all.{count,of}`; `losses.scope`; controls in `losses.control.*` |
| L2/L4 (reviewer wording) | Keyed selection, which wins every selection sweep, is the pattern; not timed in the main suite or against the granular control | `sweep.tally.store-keyed.selection.*` |
| B4 flips | The bailout changes four headline verdicts, two in selection and two in subscribe churn | `nobailout.main.flipCount`, `nobailout.main.flipScenarios`, `nobailout.main.flips` |
| M14 count | Replays 20 updates per scenario | `method.verifySteps` |
| Pass 2 B1 | "Every number above uses the same-element bailout" holds: the no-bailout sweep sentence was removed from #sweeps (it duplicated "Keyed selection doesn't need it" in #bailout) | `nobailout.sweep.tally.store-keyed.selection.{wins,total}` cited only in #bailout |
| (orchestrator) | line 152 fastest-Redux tally | added 'at <method.countsRows> rows' scope: fairness5 only ran at that size (pass 3 declined it as scope) |

## Counting-build wording (store-vs-context audit C62)

| Claim | Source |
|---|---|
| The counting build counts Row, RowView, DetailsView and CountView renders, not every component | `fixtures/store-bench/src/shared/views.jsx:8-14,62,80,95`; `countRender('row')` in each app's `Row` |
| "counted renders" in What each update does and the counting-build paragraph | `counts.main.details-inline.store.on.renders` |
| Counted components named from the source | `method.countedComponents` |
