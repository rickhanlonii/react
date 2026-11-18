# use(store) vs Redux: scenarios from react-redux-benchmarks, fairness controls, sweeps

Status: 2026-10-30. Harness in `fixtures/store-bench`. Every bundle was built against the frozen `react-builds/baseline` React.

**Every timing number here is directional.** It was measured on a contended machine: another agent's browser benchmarks, a jest run that pushed the load average to 161 on 16 cores, and background processes holding the load at 15–25. The only exceptions are the two runs marked *gated* (one restart each, with the 1-minute load average ≤ 12 for the whole run). The render, selector and derivation counts are deterministic and don't depend on load. Re-run everything with `fixtures/store-bench/run-all-quiet.sh` on a quiet machine before quoting numbers.

## Summary

| Question | Answer |
|---|---|
| Does Redux beat idiomatic `use(store)` anywhere? | **Yes: `derived-selectors`, on score and comment updates.** Redux+compiler is 1.16–1.39× faster on the mean, because 5 components share each category's stats. `createSelector` computes them 8 times per update; per-instance compiler memoization computes them 40 times. |
| Does the workaround close it? | It closes the perf gap (0.57–0.69× of redux+compiler), **but `store-derived` is incorrect: it tears under transitions** (confirmed in Jest, `ScratchMultiStoreRebase-test.js`; see `shared-derived-data.md`). The correct fixes are the identity-keyed shared caches in `shared-derived-data.md`, which are also 0.5–0.7× of Redux. |
| Other ported scenarios | store wins everywhere: rapid-dispatch 0.15–0.32×, many-components-same-slice 0.30–0.42×, deeptree-nested-hooks 0.13–0.66× of redux+compiler. The work saved is the per-dispatch selector fan-out (500–5000 selector calls per update). |
| Is RTK/Immer the reason Redux loses? | No. `redux-plain` (hand-written reducer) and `redux-nofreeze` land within about 20% of `redux` (mostly slightly faster, sometimes slower) and far from `store`. The entity update is the only consistent case: about 15% faster without Immer or freezing. |
| Does `useDeferredValue` fix typing for uSES libraries? | Mostly. At 1× CPU, redux-deferred and zustand-deferred have p95 latencies of 16–20ms, against store's 15ms, down from 35–137ms. At 4× CPU, store stays ahead (p50 about 40ms vs 52–61ms). |
| Sweeps (compiler coverage, row width) | Built and DOM-verified, with counts. **No timing:** the run was stopped by the load spike and then by the stop order. |

## Harness changes

- `--suite=<name>` on `build.mjs`, `run.mjs` and `run-jsdom.mjs`. Suites are listed in `src/redux-suite/suites.mjs`. The default suite is unchanged and still passes `build.mjs --count && run-jsdom.mjs` (14 bundles, checked against the baseline).
- Suite variants can set `entry` and `define` (used by the sweeps).
- `run-jsdom.mjs` gained `--dist` and `--steps`, and it averages counts over `--steps` updates when a bundle exposes `countSteps`.
- The ported suites use `src/redux-suite/common/harness.jsx`. It has the same `window.__bench` API, plus three differences:
  - **Fixed batch:** every variant runs exactly `warmup + iterations × batch` steps. State accumulates in these scenarios (comments, strings, logs), and the default adaptive batch would leave faster variants with more data.
  - **Textarea snapshot:** textarea values are added to the DOM hash, because innerHTML doesn't show updated values.
  - **Averaged counts:** `countSteps` averages the counts over many steps.
- Each step is one browser task, timed inside `flushSync`. Timers weren't cross-origin isolated (100µs resolution), so steps are batched. Steps under about 30µs (store thunkBurst, appendRandomChar) are still coarse.

## Ported scenarios (reduxjs/react-redux-benchmarks, MIT, maintained by the Redux team)

The rules for every ported suite:
- **redux:** their state, selectors, components and update pattern are kept as written, converted from TS to JSX. The only changes are a seeded `Math.random`, a deterministic `Date.now`, a per-mount store, dropping their timing middleware and `<Profiler>`, and `counted()`/`derivation()` wrappers that are no-ops outside the counting build.
- **store:** written idiomatically. **zustand:** one store with selectors.
- **Verification:** DOM is identical across all bundles, compiler on and off. Checked with `run-jsdom.mjs`, `run.mjs --verify` (Chrome), and a 300–600-step per-step hash comparison.

### derived-selectors

- **Data:** 100 users, 500 posts, 1000+ comments. 200 `React.memo` components:
  - 50 PostCard: a post by id.
  - 60 PostWithComments: a post plus its comment count, from `createSelector`.
  - 50 UserPostList: a user's posts, filtered and sorted.
  - 40 CategoryStats: 8 categories × 5 readers. This is the only tier that shares results.
- **Updates:** 60% a post's score, 25% a new comment, 15% a user's role. Nothing renders users.
- **Variants:**
  - `store`: a store per collection, derived values computed in components.
  - `store-derived` (workaround): category stats computed in the action. Stores can't be read outside render, so the actions keep a mirror of the latest posts and comments.
  - `zustand`: derivations in selectors with `useShallow`, the README pattern.

Counts per update (+compiler; renders / selector calls / derivations):

| scenario | redux | store | store-derived | zustand |
|---|---|---|---|---|
| mixed | 81.5 / 200 / 53.5 | 148.5 / 0 / 81.4 | 148.5 / 0 / 53.4 | 4.8 / 210 / 159 |
| score | 90.2 / 200 / 58.1 | 200 / 0 / 90.0 | 200 / 0 / 58.0 | 5.7 / 211 / 161 |
| comment | 100 / 200 / 68.0 | 100 / 0 / 100 | 100 / 0 / 68.0 | 5.1 / 210 / 160 |
| role | 0 / 200 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 200 / 150 |

Timing, mean ms per update over 3 restarts (directional, contended):

| variant | mixed 1× / 4× | score 1× / 4× | comment 1× / 4× | role 1× / 4× |
|---|---|---|---|---|
| redux | 0.53 / 2.68 | 0.43 / 2.31 | 0.80 / 3.70 | 0.058 / 0.238 |
| redux +compiler | 0.46 / 2.97 | 0.39 / 1.91 | 0.78 / 3.53 | 0.054 / 0.264 |
| store | 0.60 / 2.80 | 0.53 / 2.68 | 0.90 / 4.50 | 0 / 0 |
| store +compiler | 0.47 / 2.41 | 0.46 / 2.56 | 1.08 / 4.92 | 0 / 0 |
| store-derived | 0.40 / 1.85 | 0.37 / 1.62 | 0.53 / 2.78 | 0 / 0 |
| store-derived +compiler | 0.28 / 1.71 | 0.26 / 1.10 | 0.54 / 2.45 | 0 / 0 |
| zustand | 0.73 / 3.75 | 0.63 / 3.40 | 1.12 / 5.93 | 0.37 / 1.88 |
| zustand +compiler | 0.72 / 4.10 | 0.60 / 2.92 | 1.07 / 5.50 | 0.36 / 2.09 |

**Why Redux wins on score and comment updates:**
- store+compiler computes the category stats 40 times per update; `createSelector` computes them 8 times.
- One computation costs about 15µs (Node microbenchmark, 1250 comments), so the extra 32 cost about 0.5ms. That matches the gap.
- store's extra renders (200 vs 90 on score updates) bail out cheaply with the compiler. The derivations are the cost.
- On `mixed`, store ties Redux at 1× because role updates (15% of the mix) cost store nothing and cost Redux 200 selector calls.
- The gap scales with K (readers per derived value) × the cost of the derivation. This scenario has K = 5 on one of four tiers.
- Medians favor store more than means do. store's distribution has a tail, probably GC from 40 × (filter arrays + Set) per update.

**Unrepresentative or uncertain:**
- Role updates and the unused `ui` slice favor store.
- Redux re-renders all 60 tier-2 components on every comment, because `{...post, commentCount}` is a new object. That's their code.
- store reads whole collections, so PostCard and PostWithComments re-render on any post change. Per-post stores would cut renders but force tiers 3 and 4 to read 500 stores.
- zustand deriving in its selectors is the README pattern. Deriving in components would behave like store.
- Compiler quirk: `f(use(a), use(b), x)` isn't memoized, because the scope containing the second `use` is flattened. Hoisting the reads into consts fixes it. The port uses the hoisted form, which doesn't change these counts.

### rapid-dispatch

- **Components:** 500 `React.memo` components: 200 items, 150 total counters, 100 lastUpdated, 50 log count.
- **Tasks:**
  - 40% syncBurst: 5 dispatches, plus a 4-dispatch listener cascade.
  - 30% thunkBurst: 1 dispatch, then 2 more as the next step (their `setTimeout(0)`).
  - 30% listenerCascade: incrementA, then RTK listener middleware dispatches B, C, updateTotal and append. The listener effects run synchronously inside `dispatch`.
- **Variants:**
  - `store`: a store per item, plus lastUpdated, counters and log stores. The cascade is plain function calls.
  - `zustand`: one store, a `setState` per action.

Counts: renders are identical in every variant (mixed 117.8, syncBurst 301, thunk 1, cascade 200). Selector calls per step:

| scenario | redux+compiler | zustand | store |
|---|---|---|---|
| mixed | 2032 | 2268 | 0 |
| syncBurst | 4500 | 5102 | 0 |
| thunk step | 750 | 752 | 0 |
| cascade | 2500 | 2900 | 0 |

Timing, mean ms per step:

| variant | mixed 1× / 4× | syncBurst 1× / 4× | cascade 1× / 4× | thunk 1× / 4× |
|---|---|---|---|---|
| redux +compiler (contended, 3 restarts) | 0.32 / 1.47 | 0.65 / 3.26 | 0.34 / 1.90 | 0.10 / 0.59 |
| store +compiler (contended) | 0.08 / 0.40 | 0.17 / 0.74 | 0.11 / 0.47 | 0.02 / 0.09 |
| zustand +compiler (contended) | 0.14 / 0.64 | 0.29 / 1.34 | 0.16 / 0.77 | 0.03 / 0.16 |
| redux +compiler (**gated**, 1 restart) | 0.29 / 1.18 | 0.59 / 2.72 | 0.33 / 1.37 | 0.089 / 0.42 |
| store +compiler (**gated**) | 0.08 / 0.32 | 0.15 / 0.65 | 0.10 / 0.42 | 0.016 / 0.070 |
| zustand +compiler (**gated**) | 0.13 / 0.53 | 0.26 / 1.09 | 0.15 / 0.65 | 0.032 / 0.138 |

Without the compiler, every variant is within noise of these numbers. store is 0.15–0.32× of redux+compiler in both the contended and the gated runs. The cost is the per-dispatch fan-out: every dispatch runs all 500 selectors.

### many-components-same-slice

5000 components each read `state.counter`, and every update increments it, so every variant re-renders all 5000. Selector calls per update: redux 5000 (10000 without the compiler), zustand 15000, store 0.

| variant | 1× contended | 4× contended | 1× **gated** | 4× **gated** |
|---|---|---|---|---|
| redux | 4.72 | 21.7 | 3.48 | 17.3 |
| redux +compiler | 4.93 | 23.9 | 3.62 | 17.5 |
| store | 1.47 | 7.05 | 1.38 | 5.89 |
| store +compiler | 1.78 | 7.41 | 1.51 | 6.48 |
| zustand | 2.33 | 11.7 | 1.97 | 8.86 |
| zustand +compiler | 2.32 | 9.92 | 2.10 | 9.48 |

Renders are identical, so the gap is per-subscriber overhead:
- react-redux's Subscription notify loop;
- `useSyncExternalStoreWithSelector`'s extra hooks and memoized selector on each of the 5000 re-renders.

The compiler doesn't help any variant here, because every value changes.

### deeptree-nested-hooks

- **Components:** 200 recursive trees, 15 levels deep: 3000 Slice components, 600 TextDisplay (a string selector plus a textarea) and 200 Counters.
- **App and updates:** App is a `connect()`ed class. Each TextDisplay initializes its string from a mount effect. Updates come from clicking 5 buttons in their interval order (26, 74, 206, 386 and 502ms).
- **appendMany bug:** their appendMany writes numeric keys into the strings state. That's a bug, kept as written. Numeric keys enumerate first, so after the first call they shift which strings get appended. The store variant replicates this by tracking the Redux key order, documented in the file.

Counts: renders are identical (1 per single-counter or single-string click, 40, 67 and 150 for the bulk buttons, about 11 for mixed). Selector calls per click: redux about 800, zustand 794–1100, store 0.

Timing, mean ms per click, +compiler (directional, contended):

| scenario | redux | store | zustand |
|---|---|---|---|
| mixed 1× / 4× | 0.34 / 1.89 | 0.14 / 0.82 | 0.21 / 1.11 |
| incrementRandom | 0.121 / 0.85 | 0.036 / 0.18 | 0.060 / 0.33 |
| appendRandomCharacter | 0.174 / 1.13 | 0.031 / 0.14 | 0.059 / 0.34 |
| incrementFifth | 0.75 / 3.74 | 0.44 / 2.23 | 0.60 / 3.02 |
| incrementThird | 1.25 / 6.98 | 0.74 / 3.66 | 1.00 / 6.03 |
| appendMany | 4.92 / 27.2 | 3.09 / 18.0 | 3.43 / 16.7 |

Mount time (median): redux 55ms at 1× and 242ms at 4×, store 16 / 68ms, zustand 81 / 375ms. Redux and zustand pay for 600 mount-effect dispatches, each running every selector.

## Fairness controls (main entity-list scenarios, N=1000)

- `redux-plain`: a hand-written immutable reducer (`shared/updates.js`), `legacy_createStore`, reselect. No RTK or Immer.
- `redux-nofreeze`: the same as `redux`, with `setAutoFreeze(false)`.

Both render the same DOM and make the same selector calls as `redux` in every scenario (for example, selection: 4 renders and 5003 selectors with the compiler).

Mean ms per update over 3 restarts (directional, contended):

| scenario | redux+c | redux-plain+c | redux-nofreeze+c | store+c | zustand+c |
|---|---|---|---|---|---|
| entity 1× / 4× | 0.56 / 4.34 | 0.48 / 3.06 | 0.48 / 3.09 | 0.057 / 0.27 | 0.28 / 1.90 |
| selection | 0.34 / 1.80 | 0.32 / 1.69 | 0.35 / 3.16 | 0.25 / 1.08 | 0.19 / 0.95 |
| filter | 1.91 / 12.0 | 1.82 / 10.2 | 1.85 / 9.54 | 0.53 / 2.66 | 0.92 / 5.32 |
| details-inline | 0.36 / 2.14 | 0.36 / 2.68 | 0.37 / 2.50 | 0.065 / 0.30 | 0.20 / 1.30 |
| details-component | 0.32 / 2.31 | 0.33 / 1.77 | 0.33 / 1.97 | 0.061 / 0.28 | 0.17 / 0.81 |
| structure | 3.36 / 15.9 | 3.02 / 16.6 | 3.06 / 15.4 | 0.28 / 1.23 | 1.22 / 5.77 |

RTK and Immer aren't why Redux loses. Removing them saves about 15% on entity updates and is noise elsewhere. As in the main report, selection is store's weak case against zustand: 0.25 vs 0.19ms at 1×.

## Typing with useDeferredValue (N=10000, expensive rows)

- `redux-deferred` and `zustand-deferred` dispatch one urgent filter value.
- The list reads it through `useDeferredValue` and passes it to `memo`'d rows. Rows compute `matches` from the prop instead of a selector.
- These variants run only the typing scenario. Under `flushSync` the deferred render hasn't happened yet.

Keydown to next frame, 3 runs × 19 keys pooled (directional, contended):

| variant | 1× p50 / p95 | 4× p50 / p95 |
|---|---|---|
| store | 12.3 / 14.5 | 39.4 / 54.2 |
| store +compiler | 12.6 / 15.1 | 41.5 / 58.1 |
| redux | 20.7 / 136.7 | 109.3 / 1165.6 |
| redux +compiler | 24.8 / 62.6 | 91.3 / 250.8 |
| redux-deferred | 16.2 / 18.2 | 57.9 / 69.0 |
| redux-deferred +compiler | 12.0 / 16.6 | 61.4 / 87.2 |
| zustand | 13.2 / 107.0 | 76.2 / 560.0 |
| zustand +compiler | 13.0 / 34.6 | 69.2 / 158.0 |
| zustand-deferred | 13.8 / 16.0 | 51.6 / 63.0 |
| zustand-deferred +compiler | 9.6 / 19.6 | 51.5 / 62.0 |

`useDeferredValue` removes the long tail for both libraries and gets close to store at 1×. At 4×, store's p50 and p95 are still about 20–30% lower. These runs overlapped the start of the load spike (17:41–17:43), so treat them as the least reliable numbers here.

## Sweeps (built and verified, not timed)

`src/apps/sweep-{store,redux,zustand}.jsx` and `sweep-views.jsx`. Each variant is named `<lib>-c<coverage>-w<width>`:

- **Coverage:** `__COVERAGE__`% of rows render a compiled Row and row view. The rest render copies marked `'use no memo'`, picked by `(index × 61) % 100 < coverage` so every block of 100 rows has exactly that many. The builds without the compiler are the 0% point.
- **Width:** the row view takes `__WIDTH__` props: `selected` plus that many minus one entity fields, passed as explicit JSX attributes so the compiled Row compares each one.
- **Configurations:** coverage 100/90/75/50 at width 8, and width 4/8/16 at 100% coverage.

DOM is identical within each width (jsdom).

Counts, N=1000, renders / Row renders / selector calls:

| scenario | store +compiler | store (no compiler) | redux +compiler | zustand +compiler |
|---|---|---|---|---|
| selection, c100 | 1002 / 1000 / 0 | 2000 / 1000 / 0 | 4 / 2 / 2001 | 4 / 2 / 2007 |
| selection, c90 | 1102 / 1000 / 0 | | 4 / 2 / 2001 | 4 / 2 / 2007 |
| selection, c75 | 1252 / 1000 / 0 | | 4 / 2 / 2001 | 4 / 2 / 2007 |
| selection, c50 | 1502 / 1000 / 0 | | 4 / 2 / 2001 | 4 / 2 / 2007 |
| entity, any | 2 / 1 / 0 | 2 / 1 / 0 | 2 / 1 / 2001 | 2 / 1 / 2004 |

Width doesn't change the counts. It changes how many props the compiled Row compares before bailing out. Every uncompiled row adds a row-view render (with its `expensiveLabel` work) to every selection update for store. For redux and zustand, coverage only matters for the 2 rows that re-render. **Timing is still needed:** `run-all-quiet.sh` includes it.

## Load gating

After the lead's request, timing jobs ran through a gate:
- each job waited for the 1-minute load average to be ≤ 12;
- a sampler logged the load every 15s;
- a job was discarded and re-run if the load went above 12 at any point while it ran.

In about 2 hours, only `many-components-same-slice` r1 and `rapid-dispatch` r1 passed. 11 attempts were discarded, with peak loads of 13–52. The gated results agree with the contended runs for those two suites (same ratios within a few percent). Results are in `fixtures/store-bench/results/`:
- `smoke-g-*`: gated runs.
- `*.discarded-load*.json`: rejected attempts.
- `smoke-{derived,mcss,rapid,deeptree,fairness,typing1-3}-*.json`: the contended runs.

## Reproduce

Full quiet re-run of every suite, with restarts interleaved across suites and optional load gating:

```
cd fixtures/store-bench
BENCH_BROWSER=/path/to/chrome ./run-all-quiet.sh                 # REACT=react-builds/baseline by default
RESTARTS=5 LOAD_LIMIT=4 BENCH_BROWSER=... ./run-all-quiet.sh
node summarize-runs.mjs q-derived-selectors                      # combine restarts for one suite
```

Individual steps, for example:

```
node build.mjs --suite=derived-selectors --react=react-builds/baseline --count --out=dist-derived-count
node run-jsdom.mjs --suite=derived-selectors --dist=dist-derived-count
node build.mjs --suite=derived-selectors --react=react-builds/baseline --out=dist-derived
node run.mjs --verify --suite=derived-selectors --dist=dist-derived-count
node run.mjs --smoke --suite=derived-selectors --dist=dist-derived --label=derived --throttle=1,4 --iterations=200 --warmup=50 --restarts=3
```

`run-all-quiet.sh` hasn't been run end to end. Each command in it was run individually during this work.

## Files

- **Changed:** `fixtures/store-bench/build.mjs` (`--suite`, per-variant `entry`/`define`), `run.mjs` (`--suite`, a derivations column in `--counts`), `run-jsdom.mjs` (`--suite`, `--dist`, `--steps`), `README.md` (an "Other suites" section).
- **Added:**
  - `run-all-quiet.sh`, `summarize-runs.mjs`
  - `src/redux-suite/`:
    - `suites.mjs`
    - `common/{harness.jsx,instrument.js,random.js}`
    - `derived-selectors/`, `rapid-dispatch/`, `many-components-same-slice/`, `deeptree-nested-hooks/`
  - `src/apps/{redux-plain,redux-nofreeze,redux-deferred,zustand-deferred,sweep-store,sweep-redux,sweep-zustand,sweep-views}.jsx`
- `derived-selectors-spike` (in `suites.mjs`, plus extra apps under `derived-selectors/`) belongs to the shared-derived-data spike, not to this work.
