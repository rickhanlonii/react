# Claims ledger: dashboard.src.html

The dashboard is the complete results page: one `results-table` per suite. Its prose only describes what each suite measures, and every value in it is a `data-n` span from `bench-data.json` (build a3d8e745), checked 2026-11-02. The earlier card layout and its claims were removed when the page became the results tables.

## Suite descriptions

| Section | Statement | Source |
|---|---|---|
| Intro | Every result for every variant, with and without the React Compiler, one table per suite | `results-table` with no `columns` or `rows` filter on every suite |
| Main suite | A list of rows with a selection, a filter, and rows that expand to show details. One kind of update per scenario at `method.sizes` rows, with no CPU slowdown and with a four times CPU slowdown | report `#main`; `method.sizes`, `method.throttles` |
| Memory | Heap growth when the rows mount, after garbage collection, divided by the number of rows | report `#memory` |
| Typing | Types `typing.main.keys` keys into the filter while `typing.main.rows` expensive rows re-filter; latency from the key press to the next frame | report `#typing` ("Latency is keydown to the next frame") |
| Typing with `useDeferredValue` | The same typing test, with Redux and Zustand versions that show the list through `useDeferredValue` | report `#typing`; variants `redux-deferred`, `zustand-deferred` |
| Without the bailout | The main suite at `nobailout.sizes` rows on the same build with the bailout off. The bailout skips a component that returns the exact element it returned last time | report `#bailout` ("When a component returns the exact element it returned last time, React skips reconciling it"), `#build` |
| Every Redux setup | The main scenarios at `method.countsRows` rows with Redux Toolkit, a hand-written reducer, and auto-freeze off, timed in one run with `use(store)` and Zustand | report `#fairness` |
| Derived selectors | From the Redux team's benchmarks. Many components show expensive data derived from the same state. `store-memo` shares the derivation with `weakMemo` | report `#redux-suites`, `#derived-results`; style sheet variant table |
| More readers of derived data | The derived-selectors test with `spike.ks` readers per category, plus other ways to share the derived data | report `#derived-results`; KEYS.md `spike-chart` |
| Sweeps | Rows that read only their own data and the selection, at `sweep.rows` rows. One sweep varies compiler coverage, the other props per row | report `#sweeps` ("rows that read only two stores: their entity and the selection") |
| Rapid dispatch | From the Redux team's benchmarks. Bursts of updates per task, including a Redux Toolkit listener cascade | report `#redux-suites` |
| Many components, one counter | From the Redux team's benchmarks. Many components read the same counter | report `#redux-suites` |
| Deep tree | From the Redux team's benchmarks. A deep tree of nested components with counters at the leaves | report `#redux-suites` ("A deep tree with nested Hooks and counters at the leaves") |

## Footer

| Claim | Source |
|---|---|
| Synthetic benchmarks, small apps built to isolate one thing each, no data from a real app yet | report header note and `#caveats` |
