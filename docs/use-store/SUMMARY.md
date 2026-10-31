# use(store): overnight summary (2026-10-31, final)

The morning brief. Details are in the linked docs. The full log is
`OVERNIGHT.md`. Nothing is committed.

## Headline

- **Main benchmark, with the compiler:** use(store) matched or beat the
  faster of Redux and Zustand in **36/36 configurations** (35 faster, 1 tie).
  That covers 6 scenarios, N = 100/1k/10k, and 1×/4× CPU. Report:
  [benchmark-report.html](benchmark-report.html).
- **The Redux team's own benchmarks** (`reduxjs/react-redux-benchmarks`,
  with their Redux code verbatim):
  - use(store) wins rapid-dispatch (1.4–2.1×), many-components-same-slice
    (1.3×) and deeptree-nested-hooks (1.1–2.2×), each vs the faster library.
  - It loses derived-selectors to Redux by up to 1.2×.
- **Correctness:** the full `yarn test` passes on experimental, www-modern
  (variant on and off) and stable. The only failures are the 3 pre-existing
  Node 25 Flight cases (B-2).
  - The parity checks: every state test has a use(store) copy (139/139
    files). Every context-reading test has a copy or a skip with a reason
    (53/53 files).

## Where it doesn't win (in the report's caveats)

1. **Rows that select only 1–2 values.**
   - Selection is 1.3–1.4× slower than Zustand. A few cheap selectors per row
     cost less than re-running a compiled component and bailing out.
   - Profiled: 152 vs 119 ns/row. Removing all store overhead would only
     tie. See [research/selection-floor.md](research/selection-floor.md).
   - Closing it needs a design change: compiler-emitted pre-checks, or a
     "re-render lite" reconciler path.
2. **Partially compiled apps.** At 90/75/50% compiled, selection is
   3/6/10× slower. Without the compiler, treat use(store) as a granular-store
   API.
3. **Shared expensive derived data.** Plain use(store) derives per component.
   A cache keyed on store snapshots fixes it and is correct under
   concurrency: the fastest correct option is 1.5–1.9× faster than Redux at
   5/20/50 readers per value. Plain use(store) loses by up to 4.4× at 50.
   Computing derived values in updates tears under transitions (tested).
   See [shared-derived-data.html](shared-derived-data.html) for the options
   with code, and [research/shared-derived-data.md](research/shared-derived-data.md)
   for the full analysis.
   A compiler-emitted shared call works, but it should only share calls made
   from multiple sites (§8).
4. **Selection relies on `enableSameElementBailout`** (DCP-10). It's a general
   reconciler optimization, behind its own flag, reviewed, with the full
   suite green. Without it, selection is 1.2× slower to 1.2× faster vs the
   faster library.

## What changed overnight

- **Performance (zustand-gap; every change measured by interleaved, load-gated A/B):**
  - flat store reads;
  - one subscription effect per component, pushed only when the set of
    stores changes;
  - commits visit only the records that need it;
  - the same-element bailout (DCP-10), plus its L2/forwardRef follow-up;
  - sibling lane marking.
  - Rejected: `enableNoCloningMemoCache` (no measurable benefit; safety
    analysis in DECISIONS.md) and three micro-trims (~2%, under the 5% bar).
- **A fresh-eyes code review** found 2 high, 4 medium and 6 low defects, each
  proven by a failing test. All are fixed (DCP-11 to DCP-16), with the tests
  moved into the suites. See [research/code-review.md](research/code-review.md).
  - H1/H2: hydration subscribes to a dropped record, and never joins a
    pending transition.
  - M1: an unmounted root leaks.
  - M2: dropping a record with pending updates leaks the transition early.
  - M3: a revealed Activity tears.
  - M4: a reducer error poisons the store.
  - B-18 (a Suspense boundary didn't retry on store updates) is fixed by
    having boundaries subscribe to the stores their suspended children read.
- **Context copies:** 187 context-reading cases; 105 translated, 82 skipped
  with reasons (subtree scoping, class readers, per-request server values,
  Server Components, context-only APIs).
  - Fixed along the way: B-19 (Flight message) and B-20 (a DevTools crash on
    a dropped conditional read, plus matching store reads by identity).
- **Benchmarks:**
  - 4 Redux-team scenarios ported;
  - fairness variants (plain Redux, no-freeze RTK);
  - `useDeferredValue` typing;
  - compiler-coverage and width sweeps;
  - the shared-derived-data spike.

  All final numbers are from a frozen build (`fixtures/store-bench/react-builds/final`)
  with load-gated, interleaved restarts.

## Decisions for you

The full list, with context, is in `OVERNIGHT.md` under "Decisions for
Ricky". In priority order:

1. **Shared derived data.** Is this React's job? Options: a React-owned client
   `cache()` scoped to a render (recommended by the spike), the compiler as
   an accelerator, or derived stores (not recommended for v1).
2. **Reading stores outside render.** The research is done
   ([research/reading-outside-render.md](research/reading-outside-render.md)).
   The real fork is ownership. If there's a read, the recommendation is a
   latest-value read with DEV warnings in render and reducers.
3. **The few-selectors crossover.** Is "compiler + granular stores" the
   guidance, or should we fund compiler pre-checks / re-render lite?
4. **`enableSameElementBailout`.** It's a general reconciler change. Review it
   as its own PR?
5. **Smaller items:**
   - `store.update()` with no readers throws reducer errors synchronously
     (DCP-14);
   - two context-copy translation rules;
   - cross-store transactions (Jordan's question): independent writes rebase
     correctly (tested), while dependent writes need one store or a future
     multi-store update.
6. **Compiler follow-up you deferred:** `f(use(a), use(b))` isn't memoized
   unless the reads are hoisted.

## How to check it yourself

- **Tests** (from the repo root):
  - `yarn test --r=experimental UseStore`
  - `yarn test --r=experimental ReactDOMStore`
  - `node scripts/store-parity/check.js`
  - `node scripts/store-parity/check.js --context`
- **Report** (from `fixtures/store-bench`):
  `ls results/full-final-r*.json | grep -v discarded | xargs node report.mjs`,
  then open `results/report.html`. The suites come from `results/smoke-q-*.json`.
- **Implementation:** `packages/react-reconciler/src/ReactFiberStore.js`,
  `ReactFiberHooks.js` (`useStore`, `finishStoreReads`), and
  `ReactFiberBeginWork.js` (the same-element bailout, DCP-10). Decisions are
  in `DECISIONS.md`.

## Next steps

See [NEXT_STEPS.md](NEXT_STEPS.md) for decisions needed, the derived-data plan (option A, then an option-B experiment), and the other follow-ups.
