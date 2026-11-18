# use(store): overnight mission (started 2026-10-30, Ricky away)

**Read this first after any context compaction.** It is the source of truth for
what I'm doing, why, and when I'm done. Update the status log at the bottom
whenever something lands. Don't end the work early and don't change the
architecture direction. If a decision is genuinely Ricky's, record it under
"Decisions for Ricky" and keep going on everything else.

## Goal (Ricky's words, paraphrased)

Complete the work. That means:

1. **Review the implementation** as if Andrew Clark or Sebastian Markbåge wrote
   it, and simplify it.
2. **Verify it's correct for React.**
3. **Hill-climb performance** until use(store) + compiler is equal to or better
   than Zustand and Redux in all cases, with the compiler on.
4. **Finish the three in-flight workstreams:** the Redux scenario ports, the
   Zustand gap, and the context test copies.

## Done criteria (all must hold)

- **Perf, main suite.** In `fixtures/store-bench`, `store` with the compiler is
  at least as fast as the best of {zustand, redux} in all 6 scenarios × N =
  100/1k/10k × CPU 1×/4×. A tie is a difference within 2 standard errors, as
  `report.mjs` computes it.
- **Perf, ported Redux scenarios.** The same bar holds for the idiomatic
  `store` variant.
  - Any remaining loss needs a profile-backed explanation of why it's inherent
    to the API, plus the options, under "Decisions for Ricky".
  - Don't add selectors or change the API to win. Don't make a variant read
    less than its UI needs.
- **Tests.** Every `*UseStore-test*` and `*UseStoreContext-test*` passes on
  experimental, www-modern variant true and false, and stable (gated).
  - `node scripts/store-parity/check.js` reports 100%, and so does the context
    mode. (Retired on 2026-10-31: the copies were cleaned up, parity by title
    was dropped, and `scripts/store-parity/` was deleted. The `check.js`
    results in the log below are historical. See `STATUS.md`.)
  - `yarn flow dom-node` and `yarn linc` are clean.
- **Code.** An independent fresh-eyes review is done, and its findings are
  fixed or explicitly rejected with reasons. The code is simplified: prefer
  deleting code, no speculative abstraction, no allocations in hot paths,
  comments explain why.
- **Report.** Every benchmark is re-run on a quiet machine (no other agents
  running) against the final build. `docs/use-store/benchmark-report.html` is
  regenerated, including the new suites and the losses. The final summary for
  Ricky is in the last message.

## Architecture invariants (do NOT change direction)

From the original brief and `DECISIONS.md`:

- The API is `createStore(initial, reducer?)` + `use(store)` + `store.update(action)`.
- No selectors.
- `use()`, so reads can be conditional.
- **No fixup pass.** Readers join in-flight transitions by merging skipped lanes
  into `fiber.lanes`.
- **Per-root `StoreRecord`.** A lane-tagged update queue with useReducer
  rebasing rules. The reducer runs once per root, not once per component.
- **`seq` interleaving.** `root.storeRenderSeq` is set in `prepareFreshStack`;
  updates after it are invisible to the render.
- **Lanes.** Reads use entangled render lanes, and commit applies
  `finishedLanes | root.storeRenderLanes`.
- **Commit timing.** Subscriptions are made in the commit phase (insertion
  timing), and catch-up runs after mutation (`flushStoreCatchUps`).
- **Server.** Server and hydration read `store._initial`. Server Components
  throw.
- **Scope.** Optimistic stores and external interop are out of scope (v1).

Changing any of these needs an entry in `DECISIONS.md` plus a line under
"Decisions for Ricky". Optimizations must preserve them.

## Workstreams and agents

| Agent | Task | Owns |
|---|---|---|
| `redux-port` | Port `derived-selectors` (done; Redux wins vs plain store, `store-derived` workaround wins), then `rapid-dispatch`, `many-components-same-slice`, `deeptree-nested-hooks`. Fairness variants `redux-plain`, `redux-nofreeze`, `useDeferredValue` typing. Sweeps for partial compiler coverage and component width. | `fixtures/store-bench/src/redux-suite/`, new `src/apps/*` files, `dist-derived*` and similar. Builds against the FROZEN `react-builds/baseline`. |
| `zustand-gap` | Profile why Zustand wins selection, then hill-climb the implementation to parity in every scenario. Correctness gate: the full test suite. | `packages/` implementation, `build/oss-experimental` (only it runs `yarn build`), `dist-base`/`dist-opt`. |
| `outside-render-research` | Ricky asked: should stores be readable outside render? Read the referenced docs (PR 33215, reactwg 52/140/171/322/362/387/403, Jordan's doc and gists, react-concurrent-store) and report positions with quotes, plus a recommendation. | `docs/use-store/research/reading-outside-render.md` (read-only otherwise). |
| `derived-spike` | Ricky asked for a spike on shared derived data ("a shared cache, maybe via the compiler"). Prototype in userland: per-instance, derive-in-update, shared memo, client `cache()` semantics, hand-written compiler-emitted shared cache, a derived-store sketch. K sweep 5/20/50. | New variant files in `src/redux-suite/derived-selectors/apps/`, `docs/use-store/research/shared-derived-data.md`, `dist-spike*`. |
| `reviewer` | Fresh-eyes Seb/Andrew-bar review of the full `packages/` diff (store + same-element bailout). Read-only, plus scratch tests that prove defects. Findings are applied after zustand-gap releases the reconciler. | `docs/use-store/research/code-review.md`, `ScratchReview*-test.js` |
| `context-copies` | Copy every context-reading test case to `*UseStoreContext-test*`, translating context to stores, and add a `--context` mode to `check.js`. Failures go to `BLOCKERS.md`; it does not edit the implementation. | New test files, `scripts/store-parity/`, the `COPY_RULES.md` "Context copies" section. |

Coordination rules:
- **Isolation flags.** `build.mjs --react=<dir> --out=<dir>` and
  `run.mjs --dist=<dir> --label=<name>`.
- **Frozen baseline React.** `fixtures/store-bench/react-builds/baseline` is a
  copy of the pre-optimization build. Never modify it.
- **Snapshot of the implementation source** taken at overnight start:
  `/tmp/store-src-baseline/`. Use it to diff and review zustand-gap's changes.
- **Contention.** Agents running benchmarks concurrently compete for CPU, so
  only interleaved A/B comparisons count. Final numbers come from the quiet
  re-run (phase 3).
- **After any `yarn build`:** run `git checkout packages/shared/ReactVersion.js`.
  `yarn build` ALWAYS turns the compiler dist into a stub (via
  link-compiler.sh), so run `yarn workspace babel-plugin-react-compiler build`
  in `compiler/` after every React build, before bundling the bench.
- **Browser setup:** `BENCH_BROWSER=~/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  `BENCH_SINGLE_PROCESS=1`, and `dangerouslyDisableSandbox: true`.
- **Timing gate (revised 20:25).** Background load (Defender, DLP,
  Spotlight, an unrelated `~/meta/genui-rsc` test runner) keeps the 1-minute
  load at 15–25, so the "<12" gate starved every agent.
  - New rules: only ONE agent runs browser benchmarks at a time. Start below
    20; discard a run only if load went above 28.
  - Rely on interleaved A/B with ≥3 restarts.
  - Never run jest suites during timing.
- **Never** commit, push, or use external hosting.

## Phases

1. **Now:** the three agents run, and I relay their progress.
2. **After zustand-gap lands its optimizations:**
   - spawn a fresh-eyes reviewer, giving it the code and the invariants, not my
     conclusions;
   - simplify;
   - fix the context-copy blockers (only one agent edits `packages/` at a time);
   - re-run all suites and channels.
3. **Keep hill-climbing** while any done criterion fails: profile, change one
   thing, interleaved A/B, keep it only if it's faster and correct. If the
   store-level ideas run out, try reconciler-level ideas behind `enableStore`.
   - cheaper bailouts for components whose only change is a store read;
   - cheaper scheduling of N readers (fewer per-reader root walks);
   - zero allocation when reads are stable.
4. **Quiet-machine final runs** of every suite with the final build, the
   report, and the summary.

## Review notes so far (my read of the snapshot, before zustand-gap's changes)

- **The per-read hypothesis is outdated.** Effects are only pushed when the
  set of stores changes, and there's one `storeReads` array per component per
  render, not one record per read. Profile before assuming.
- **Dispatch cost scales with readers.** `dispatchStoreUpdate` calls
  `enqueueConcurrentRenderForLaneOnMountedFiber` for every reader, and each
  later walks to the root. That's O(readers × depth) per update, which is a
  likely part of the selection gap.
- **Hidden-class stability.** `FunctionComponentUpdateQueue.storeReads` and
  `storeInst` are optional (`?:`) in Flow. Check every place that creates the
  queue object, so the shape is the same everywhere.
- **Lookup cost.** `getStoreRecord` scans `store._records` linearly on every
  read, which is fine for one root. The dedupe scan in `useStore` is
  O(reads²) per component, also fine for small read counts.
- **`useStore` hot path.** It calls `getWorkInProgressRoot()` and
  `getIsHydrating()`, does the record lookup, checks the read cache, merges
  skipped lanes, then dedupes and pushes. Look for work to hoist or skip.

## Must-fix correctness work queued for phase 2

- **After the next coordinated `yarn build`** (only once zustand-gap is done):
  run the DevTools copies, which verifies B-20's react-debug-tools export
  (DevTools tests read `build/oss-experimental/react-debug-tools`):
  `yarn test --build --project devtools -r=experimental --ci`, on:
  - `packages/react-devtools-shared/src/__tests__/`:
    - `profilingStoreChangeDetection-test.js` (new)
    - `profilingCacheUseStoreContext-test.js`
    - `profilerChangeDescriptionsUseStoreContext-test.js`
    - `inspectedElementUseStoreContext-test.js`
    - for regressions: `profilingCache-test.js`, `profilingCacheUseStore-test.js`,
      `profilerChangeDescriptions-test.js`, `profilerChangeDescriptionsUseStore-test.js`
  - `packages/react-devtools-facade/src/__tests__/DevToolsFacadeUseStoreContext-test.js`

  Source-level verification already passed (context-copies, using a
  throwaway all-source jest config).
- **Only one `yarn build` at a time.** `build-all-release-channels.js` moves
  `./build` to a tmp dir and back while it runs.

- **B-18.** A reader that suspends before its first commit never subscribes,
  so a store update doesn't retry its Suspense boundary. For example,
  `use(use(store))` with a promise that never resolves hangs even after the
  store gets a resolved promise. The same gap applies to a new reader in
  primary children that suspends during an urgent update. Context doesn't
  have this problem, because it conservatively marks suspended boundaries
  under the Provider.
  - Fix direction: when a component suspends after reading stores, attach its
    store reads to the boundary's retry set (the way wakeables are), and
    subscribe the boundary when it commits in the fallback state. A store
    update then schedules a retry lane on the boundary.
  - Wait until zustand-gap is finished with the reconciler before making this
    change. Then un-gate the two `enableStore && TODO` cases in
    `ReactContextPropagationUseStoreContext-test`.

## Decisions for Ricky (don't block on these)

- **Closing the few-selectors crossover needs a design change.** Options:
  compiler-emitted pre-checks for `use(store) === id`-style reads (a
  selector generated by the compiler), or a reconciler "re-render lite" path
  for compiled components whose only change is a store read. Both are
  beyond tonight's scope. Details: `research/selection-floor.md`.
  `enableNoCloningMemoCache` doesn't help here (null result).
- **The few-selectors-per-row crossover.** When rows select only 1–2
  values, Zustand's cheap selectors beat re-render+bailout on fan-out reads
  (selection 1.2–1.4× slower). Partial compiler coverage multiplies this
  (90% coverage → 3× slower). Hill-climbing continues, but part of it may be
  inherent: the cost of running a component vs a property read. Positioning
  question: is "use the compiler, granular stores" enough, or do fan-out
  reads need a primitive?

- **Reducer errors without a render.** With no root reading the store,
  `store.update()` throws synchronously and doesn't apply the update. This
  reverses B-11 for that case only. A reducer error that no component
  rendered (e.g. the only reader is hidden) goes to `reportGlobalError` and
  is dropped (DCP-14).

- **`enableNoCloningMemoCache`: no perf case.** It's measured as noise on
  both the main suite and the sweeps (nocl/final 0.86–1.40, with the
  controls swinging just as much). The profile's "clone" cost was really
  first-touch loads. Not landed; the safety write-up is for reference
  only.

- **A general reconciler optimization (same-element bailout).** This is
  zustand-gap's main lever for selection parity.
  - In `updateFunctionComponent`: when a component returns the exact element
    its only child was rendered with (same props object, type and key), call
    `bailoutOnAlreadyFinishedWork` instead of reconciling. That skips
    `createWorkInProgress` and the child's `beginWork`.
  - Prototype result (selection, N=1k): store 0.227→0.181 ms, Zustand 0.183,
    store-single 0.157, context 0.183.
  - It affects every compiled function component, not just stores, so it
    lands behind its own feature flag and needs a full suite run.
  - It speeds up any compiled re-render, context included, so the
    comparison stays fair.

- **Reading outside render.** Research is done:
  `docs/use-store/research/reading-outside-render.md`.
  - No source settles it.
  - Seb's consistent position is that reads go through `use()` in a React
    scope.
  - #362 frames an outside read as the last committed value per root.
  - Jordan's PR 35449 adds `getState()` returning the head, and is stalled
    as "contentious".
  - The real fork is ownership: does React own the state, or is the store an
    independent source?
  - The researcher recommends: no committed or action-scoped read. If a read
    is added, make it the head with a DEV warning in render and reducers.
    Consider `subscribe` for persistence and URL sync.
  - No read fixes cross-store derived data. That belongs to the
    derived-data spike.

- **Cross-store transactions (Jordan's question).**
  - Independent writes to several stores rebase correctly. Every store is
    read with the same global `seq` and the same lanes, and updates to
    disjoint stores commute.
  - This is proven in `packages/react-reconciler/src/__tests__/ScratchMultiStoreRebase-test.js`:
    a transition updates a and b, then a sync `b*10` interrupts. The sync
    render shows 0,0 (never 1,0), then the rebase gives 1,10, the same as one
    combined store.
  - Move those cases into `ReactUseStore-test` in phase 2.
  - Dependent writes (B's next value computed from A) can't be expressed
    across stores. That state belongs in one store with a reducer.
  - A possible API addition: a multi-store update enqueued in each queue with
    the same `seq` and replayed against the other stores' states at that
    `seq`. The model already has what it needs. Not built.

- **Context-copy rule (a).** When the original's update has to pass a bailout
  (sCU false, memo, PureComponent), the copy keeps the parent re-render and
  batches `store.update` with it, so the bailout path is still exercised and
  the assertions are unchanged.
- **Context-copy rule (b).** One expectation change, in "context change
  propagates to Suspense fallback (memo boundary)": stores don't retry or
  prewarm primary children that don't read the store. Context does, because
  it conservatively marks fallback boundaries. I think the store behavior is
  more precise and correct.

- **Shared derived data (`derived-selectors`).** Plain use(store) derives per
  component: 40 computations vs Redux's 8, cached per argument. That makes it
  about 1.7× slower than Redux. Computing in the update (`store-derived`) beats
  Redux. Options:
  - (a) document "derive in the update" as the pattern. **Now known to tear
    under transitions** (derived-spike repro), so it's not recommendable as is;
  - (b) userland cross-component memoization;
  - (c) an API addition such as derived stores (in tension with "no selectors");
  - (d) compiler or runtime cross-instance caching.

  This is not fixable in the implementation alone.

  Full result (contended run, re-run quietly before quoting):
  - Redux+compiler beats store+compiler by 1.16–1.39× on score and comment
    updates.
  - The two tie on `mixed` at 1×.
  - `store-derived`+compiler beats Redux everywhere, at 0.6–0.7× its time.
  - Zustand loses to everything here (150–160 derivations per update).
  - Sharing is K=5 on one of four tiers, and the gap grows with K × the
    derivation cost.
- **Shared derived data: spike done** (`docs/use-store/research/shared-derived-data.md`).
  - Every identity-keyed sharing option is correct by construction (store
    values are immutable snapshots) and computes 8 derivations per update at
    any K. The options measured: userland weakMemo, client `cache()`
    (render-scoped or two-generation), compiler `sharedCall`, and a lazy
    derived store.
  - Each beats Redux, at 0.5–0.7× its time (contended run).
  - **`store-derived` tears.** I confirmed this in Jest:
    `ScratchMultiStoreRebase-test.js` shows an urgent commit rendering
    `score:0 total:1000 comments:1`.
  - The spike recommends:
    - drop store-derived as a pattern;
    - a React-owned client `cache()` scoped to a render (matching the
      per-request server lifetime, with bounded memory), with two
      generations as the fallback;
    - the compiler only as an accelerator: an adaptive pass behind a flag,
      which needs a runtime heuristic, since static rules can't tell
      expensive calls from cheap ones;
    - no derived stores in v1.
  - Open anomaly: compiler `sharedCall` is 70–90 µs slower than weakMemo on
    `mixed`. Profile it in the quiet phase. That first needs `--suite`
    support in zustand-gap's `profile.mjs`.
  - For Ricky: React's job or userland's? Lifetime, and reusing the name
    `cache` (Fizz `getCacheForType` throws today)? Fund the compiler
    experiment? Derived stores off the table for v1?
  - The quiet-phase full matrix command is in §7 of the report.
- **No way to read a store outside render.** `store-derived` has to keep a
  mutable `latest` mirror of the store in userland to compute derived data
  in its actions. Is a `store.getSnapshot()`-like read for event handlers
  and actions in scope? It's an ergonomics gap, not a perf one.
- **Compiler quirk (Ricky: follow-up later, not now).** `f(use(a), use(b), x)` isn't memoized, because the
  scope containing the second `use()` is flattened. Hoisting the reads into
  consts memoizes it. Users will write the inline form, so this matters for
  the "compiler + store" pitch. It's a compiler follow-up (check
  `FlattenScopesWithHooksOrUseHIR`); I'm not changing the compiler overnight.

## Status log

- **2026-10-31 06:20 local. MISSION COMPLETE.** Every done criterion holds.
  - **Main suite:** 36/36 configurations match or beat the best of
    Redux/Zustand.
  - **Ported Redux scenarios:** 3/4 win. derived-selectors loses because of
    shared derivations, which is inherent to the API; the options are under
    "Decisions for Ricky", and a shared cache is 1.5–1.9× faster than Redux.
  - **Tests:** the full suite is green on 4 channels (only B-2 fails),
    parity is 139/139 and context 53/53, and flow and linc are clean.
  - **Code:** the review was done, with 12 findings fixed and the code
    simplified.
  - **Report:** regenerated from gated runs on `react-builds/final` and
    published (`docs/use-store/benchmark-report.html`).
  - **Also documented:** the 2-read selection loss (an inherent floor,
    `research/selection-floor.md`) and the effect of partial compiler
    coverage.
  - Morning brief: `docs/use-store/SUMMARY.md`.

- **2026-10-31 05:50 local.** Step (e), the spike matrix, is done (24
  gated units, `results/smoke-spike-final-*`).
  - The fastest correct sharing option is 1.5–1.9× faster than Redux at
    K=5/20/50. Plain store loses up to 4.4× at K=50.
  - The sharedCall anomaly persists (mixed: 0.37 vs memo 0.27 ms); the
    profile is next.
  - The report includes the spike, and the interim report is re-published.
- **2026-10-31 05:30 local.** Drafted the morning brief
  `docs/use-store/SUMMARY.md`; finalize it after (e). Updated the
  explainer's open questions with the benchmark findings and caveats.
- **2026-10-31 05:15 local.** opt11 is reverted. The rebuilt source is
  byte-identical to `react-builds/final` (react-dom-client and react
  prod). Targeted 83/83, flow and prettier clean.
  - Kept the test-only spec "updates sibling readers whether or not a render
    is in progress".
  - nocl safety analysis is in DECISIONS.md: values are safe (writes are
    dependency-guarded), but referential identity isn't preserved across a
    discarded render, so effects re-fire and memo children re-render.
  - `research/selection-floor.md` is written.
  - (e), the spike matrix (gated) plus the sharedCall profile, has started.
- **2026-10-31 05:05 local.** opt11 REJECTED: sweep selection
  0.93–1.02 (~2%), main selection 1.00–1.03, under the 5% gate. All three
  trims are reverted; the final source stays opt9, so the final results stay
  valid.
  - The 2-read selection loss (1.3–1.4× vs zustand) is documented as an
    inherent floor in `research/selection-floor.md`, with the design paths
    for Ricky.
  - Next: (e) the spike matrix.
- **2026-10-31 04:55 local.** nocl gave no main-suite benefit either.
  opt11 = direct marking + presized storeReads + leaner compareStoreReads
  (83/83 targeted tests). Its sweeps and main A/B are running. Keep gate:
  ≥5% on sweep selection.
- **2026-10-31 04:20 local.** The reviewer approved opt10 (direct reader
  marking when no render is in progress).
  - Why it's correct: the merges commute, nothing resets lanes before
    `prepareFreshStack`, and React's eager-bailout path already relies on
    this.
  - Suspended or throttled commits are handled. A yielded render, another
    root, or a render-phase update still uses the queue.
  - Targeted suites: 265 passed. Nits: the name says "enqueue", and DEV
    loops twice.
  - Pending: zustand-gap's combined trims A/B and the ≥5% keep gate.
- **2026-10-31 04:35 local.** nocl is a NULL result on sweep selection
  (ratios 0.95–1.06). The ~20 ns attributed to the clone is really
  first-touch loads that happen anyway.
  - Store-specific overhead is ~35 ns/row (`use()` 18, finishStoreReads 5,
    marking 12) on top of React's ~85 ns re-render floor. Zustand: selectors
    50 + row bailout 28 + complete 9.
  - Removing all store overhead would only tie (~117 vs 119).
  - Decision:
    - try the three ≤5 ns trims together and keep them only if ≥5%;
    - if anything lands, rebuild final, re-run the full tests, and re-run
      the main suite + sweeps;
    - write `research/selection-floor.md`;
    - then (e).
- **2026-10-31 04:10 local.** Sweep-selection profile (c100-w8, 1k, 1×):
  store 152 vs zustand 119 ns per row, a gap of ~33 ns.
  - Ours only (~86 ns): memo-cache copy-on-write clone ~20, memo compares
    ~10, `use()`×2 18, renderWithHooks/finish ~26, marking 12.
  - Theirs only: selectors ~50.
  - The fiber visit and bailout cost is about the same for both.
  - Plan:
    1. measure nocl (Ricky's call; plus a written safety analysis);
    2. marking without the concurrent queue when idle (needs reviewer
       sign-off);
    3. `use()`/finish trims.
  - Expect ~1.1× without nocl, then quantify the inherent floor.
- **2026-10-31 03:48 local.** Step (g) done (18 units,
  `results/full-final-nobailout-*`).
  - Without `enableSameElementBailout`, selection is 1.2× slower to 1.2×
    faster vs the best (1 faster, 5 slower). Entity and filter are
    unchanged.
  - The interim report is published to
    `docs/use-store/benchmark-report.html`: final main suite, all suites,
    bailout-off disclosure, data-driven caveats.
  - Next: zustand-gap hill-climbs 2-read selection.
- **2026-10-31 03:00 local.** Step (d) done: all suites × 3 restarts on the
  final build (`results/smoke-q-*.json`).
  - Redux suites: rapid 1.4–2.1× faster than the best, mcss 1.3×, deeptree
    1.1–2.2×. derived-selectors is up to 1.2× slower vs Redux (5 slower, 1
    tie). Fairness: store wins all.
  - Typing p95 at 1×: store+c 15, redux-deferred+c 16, zustand-deferred+c
    19 ms. At 4×: store 45 vs 50–70.
  - **NEW LOSS: the sweeps.** Rows that read only 2 stores lose selection to
    Zustand by 1.2–1.4× at 100% coverage (store 0.144 vs zustand 0.111 at
    1k/1×). Partial coverage is far worse: 90/75/50% compiled is 3.0–3.4 /
    5.7–5.9 / 9.8–10.4× slower. Entity is fine everywhere.
  - Report caveats and the short version are updated, data-driven.
  - zustand-gap: (g) bailout-off first, then HILL-CLIMB 2-read selection
    (profile the per-row floor), then (e), (f).
- **2026-10-31 01:47 local.** FINAL MAIN SUITE DONE (42 gated units, 3
  restarts, final build).
  - Store+compiler matched or beat the faster of Redux/Zustand in 36/36
    configs (35 faster, 1 tie, 0 slower).
  - vs Redux: 36/36, from 1.8× (selection) to 19× (entity).
  - vs Zustand: 35/36 (selection: up to 1.5×, 1 tie).
  - Typing p95 at 1×: store+c 16 ms, zustand+c 35 ms, redux+c 62 ms.
  - Memory at 10k: store+c 2.85 KB/row, context+c 2.17, zustand+c 5.14,
    redux+c 8.45.
  - THE MAIN-SUITE PERF DONE CRITERION IS MET.
  - Report command:
    `ls results/full-final-r*.json | grep -v discarded | xargs node report.mjs`.
  - Remaining: (d) run-all-quiet, (e) spike matrix, (f) nocl, (g) bailout
    off, then the final report.
- **2026-10-31 00:20 local.** Final r1 preview (14 units):
  - store+compiler matched or beat the faster of Redux/Zustand in 36/36
    configs (35 faster, 1 tie), 36/36 vs Redux, 35/36 vs Zustand (1 tie).
  - The report narrative is now data-driven: the hero counts store vs the
    best selector library, and "Caveats" pulls derived-selectors and spike
    tallies from the suites plus bailout-off data from
    `full-final-nobailout*` / `NOBAILOUT_FILES`.
  - `findings.html` was rewritten as mechanisms only, with no stale numbers.
- **2026-10-30 23:40 local.** Step (c) now runs as 42 gated, resumable
  units: 3 restarts × (6 scenarios × 2 throttles + typing + memory), with
  up to 6 retries each.
  - `run.mjs` gained `--no-updates`, `--no-typing` and `--no-memory`.
  - Log: `/tmp/units-final.log`.
- **2026-10-30 23:32 local.** `final-r1` was discarded after 36 minutes
  (load passed 28). I told zustand-gap to gate per scenario × throttle per
  restart, with typing and memory as their own runs. All files start with
  `full-final-r`.
- **2026-10-30 23:05 local.** Step (c) is under way.
  - `--verify`: 14 bundles render identical DOM.
  - Counts: `results/counts-final-1793414973593.json`.
  - `--full` runs as 3 separately gated restarts
    (`results/full-final-r{1,2,3}-*.json`).
  - `report.mjs` now merges typing and memory across files and sums
    restarts.
  - Final report command (from `fixtures/store-bench`):
    `node report.mjs $(ls results/full-final-r*.json | grep -v discarded)`,
    with the default `SUITE_FILES` (`smoke-q-*`).
- **2026-10-30 22:50 local.** FULL `yarn test` is green except B-2 (3
  Node 25 Flight cases) on every channel:
  - experimental 475/477 suites (10528 tests);
  - www-modern variant=true 473/477 (2 skipped);
  - www-modern variant=false 475/477;
  - stable 475/477.

  Also check.js 139/139, --context 53/53, flow and linc. Output:
  `/tmp/t-final.txt`.
  - `react-builds/final` is frozen (byte-identical to opt9).
  - Step (c), the final main suite `--full`, has started.
  - The source is complete; the correctness done criterion is met.
- **2026-10-30 22:50 local.** Report generator extended.
  - New `fixtures/store-bench/report-suites.mjs` (every non-default suite,
    grouped by `env.suite`; the spike gets a "fastest correct sharing vs
    redux" column).
  - New `stats.mjs` holds the shared stats.
  - `report.mjs` includes the suites (default `results/smoke-q-*.json`, or
    `SUITE_FILES=`).
  - Added step (g) for zustand-gap: final numbers with
    `enableSameElementBailout` off (`react-builds/final-nobailout`) for
    disclosure.
  - After the final data: rewrite the report narrative (the
    "doesn't win (yet)" section is outdated) and copy it to
    `docs/use-store/benchmark-report.html`.
- **2026-10-30 22:35 local.** The N=100 4× "loss" was a warmup artifact
  (A/B used warmup=20). With warmup 50 / iterations 150, selection N=100 is
  0.95 (1×) and 0.92 (4×) of the best. Selection now wins every cell; the
  main-suite perf criterion is met, pending the quiet final run.
  - Profile at N=100 4×: store 82.6 µs vs zustand 93.6 µs per update. No
    fixed commit-path cost stands out.
  - Skipped the `use()` buffer trim (2–3%, adds complexity, touches B-18).
  - opt9 is the final source.
  - zustand-gap now runs the final sequence, alone:
    (a) full `yarn test` on 4 channels plus check/flow/linc;
    (b) freeze `react-builds/final`;
    (c) main suite `--full` (verify + counts + typing + memory);
    (d) `run-all-quiet.sh` with the final React;
    (e) the spike quiet matrix plus a sharedCall profile;
    (f) nocl as an experiment.
  - Me: extend report.mjs for all suites.
- **2026-10-30 22:25 local.** opt9 (sibling-lane-marking) KEPT: selection
  improves 3–7% at N≤1k.
  - Selection vs the best of zustand/redux: N=100 1× 0.89, N=100 4× 1.09
    (the last loss, within ±10% round spread), N=1k 0.95 / 0.99, N=10k
    0.82 / 0.63. Entity is flat.
  - store-single matches zustand at N=100 4×, so the remaining gap is the 3
    extra `use()` per row.
  - Next: a profile at N=100 and the `use()` trim.
- **2026-10-30 22:17 local.** zustand-gap had been idle 20 minutes after
  its opt8-vs-opt9 A/B finished (21:56) with no message, so I nudged it.
- **2026-10-30 21:50 local.** opt6-vs-opt8 A/B complete (108 groups,
  `results/ab-state-dist-opt6-dist-opt8.json`, contended but discard-gated).
  - No regression from the correctness fixes: opt8/opt6 is 0.85–1.14, noise.
  - Store opt8 vs the best of zustand/redux wins 32 of 36 cells. Losses are
    selection only: N=100 at 1× 1.03, N=100 at 4× 1.24, N=1k 1.05 at both
    speeds.
  - Selection at 10k is now 0.49–0.69. Other scenarios are 0.08–0.63.
  - Next target: per-update fixed costs at small N. Then opt9 (sibling
    marking), a profile of N=100 at 4×, and the `use()` trim.
- **2026-10-30 22:00 local.** The L2/ForwardRef patch is applied, with its
  store copy (parity 8/8). The focused run is 442/442.
  - opt8 = a full build of the current source.
  - The opt6-vs-opt8 regression A/B is running.
  - sibling-lane-marking was approved by the reviewer and will be applied
    next.
- **2026-10-30 21:55 local.** The reviewer approved both zustand-gap
  patches with no defects.
  - L2/ForwardRef is already applied; ReactSameElementBailout and ReactFresh
    pass 86/86.
  - sibling-lane-marking: the shortcut makes the same writes as a full walk
    when `update === null`, with the same return object and lane.
  - zustand-gap is building opt8.
- **2026-10-30 21:45 local.** The reviewer landed H1/H2/M1–M4/L1/L3–L6,
  B-18 and the simplifications (DCP-11 to DCP-16). All gates are green:
  UseStore 144–145 suites on 4 channels, ReactDOMStore 8/8, check.js 139/139
  and --context 53/53, flow, linc, prettier. Net source +148 lines (B-18 is
  ~139).
  - Semantics for Ricky: `store.update()` with no root reading the store now
    throws reducer errors synchronously and doesn't apply the update. A
    reducer error that no component rendered goes to `reportGlobalError` and
    the update is dropped.
  - I read the core diff (`ReactFiberStore.js`, `ReactStore.js`): the
    invariants hold.
  - The source lock is back with zustand-gap. Next: the L2/ForwardRef patch,
    the opt8 build, the opt6-vs-opt8 regression A/B, a floor profile, then a
    full `yarn test` on 4 channels.
  - The reviewer is now reviewing zustand-gap's two reconciler patches.
- **2026-10-30 21:30 local.** zustand-gap's bailout test copies are done:
  ReactSameElementBailoutUseStore (7 cases), the ReactFresh case, and a
  context copy, all passing on 4 channels. The parity check shows 0 missing
  for its files. The remaining 5 missing are the store spec suites the
  reviewer is excluding. When the L2/ForwardRef patch lands, its forwardRef
  case needs a store copy too.
- **2026-10-30 21:20 local.** The reviewer's code fixes are in. UseStore
  passes on www-modern true/false and stable; the experimental run and docs
  are pending.
  - Parity-check decision: exclude the store spec suites
    (ReactDebugHooksStore, profilingStoreChangeDetection). The bailout tests
    get use(store) copies, written by zustand-gap now (test files only),
    along with fixing its linc error.
- **2026-10-30 21:10 local.** zustand-gap is paused. Round-1 A/B cells
  were lost because results were only kept in memory; `ab.mjs` is now
  resumable (`results/ab-state-*.json`).
  - Patches ready in `fixtures/store-bench/experiments/`:
    - `same-element-bailout-l2-forwardref.patch`;
    - `sibling-lane-marking.patch`: skips repeated parent walks when N
      sibling readers are marked. Needs a careful review before landing;
    - `no-cloning-memo-cache-experimental.patch`: a PRODUCT CALL for Ricky.
      The flag says "Test this at Meta before enabling", so measure it only.
  - Builds ready: dist-opt7, dist-nocl.
  - The compiler dist had become a stub at 18:09 and was rebuilt; the bench
    bundles came out byte-identical.
  - Queue after the handback: opt5 vs opt6 matrix, opt6 vs opt7, opt6 vs
    nocl, a floor profile, then apply the kept patches and run the gates.
- **2026-10-30 21:02 local.** The reviewer is implementing (ReactFiberStore
  and Hooks edited at 20:55, tests at 21:00). Its jest run overlapped
  zustand-gap's A/B (load 63), so I paused the A/B until the source lock
  comes back. Correctness work is the critical path.
- **2026-10-30 20:50 local.** zustand-gap prepared the L2 + ForwardRef
  bailout patch (`fixtures/store-bench/experiments/same-element-bailout-l2-forwardref.patch`,
  `apply --check` clean, untested).
  - It touches only ReactFiberBeginWork. Apply it when the source lock comes
    back, then run the bailout, Fresh and UseStore suites plus flow.
  - Its A/B now retries per (scenario, N, throttle) cell.
- **2026-10-30 20:45 local.** Review done (`docs/use-store/research/code-review.md`):
  2 high, 4 medium, 6 low, each high/medium proven with a failing scratch
  test.
  - H1: a hydrating reader subscribes to a record the same commit drops.
  - H2: a hydrating reader never joins a pending transition, so it tears.
  - M1: an unmounted root stays reachable from its stores.
  - M2: the sweep drops a record that still has pending updates.
  - M3: a revealed Activity reads with its base lanes and tears.
  - M4: a reducer error poisons the store, and `_headQueue` grows without
    bound.
  - The same-element bailout is correct, except L2.
  - The reviewer now holds the source lock and is implementing all fixes,
    B-18 and the simplifications. zustand-gap only measures prebuilt dists
    and owns L2 later.
- **2026-10-30 20:35 local.** redux-port is DONE
  (`docs/use-store/research/redux-benchmarks.md`).
  - Redux beats idiomatic store only in derived-selectors.
  - Fairness: redux-plain and redux-nofreeze are within about 20% of redux,
    nowhere near store.
  - `useDeferredValue` removes Redux/Zustand's typing tail at 1×; store still
    leads at 4×.
  - The sweeps are built, DOM-verified and counted, but not timed.
  - Quiet phase: run `REACT=../../build/oss-experimental
    fixtures/store-bench/run-all-quiet.sh`. The default is the baseline, so
    the final build must be passed in. Combine with `summarize-runs.mjs`.
  - I corrected its doc to say `store-derived` tears.
- **2026-10-30 20:30 local.** B-20 is RESOLVED: all 9 DevTools files pass
  on the full build (38 passed, 7 skipped). zustand-gap's full opt5 vs opt6
  A/B is running alone with the relaxed gate. The cron stall check (job
  `1d48cabf`) runs every 15 minutes.
- **2026-10-30 20:25 local.** Starvation found: no agent messages for about
  2h.
  - redux-port finished only 2 of ~21 gated jobs, and zustand-gap's A/B
    never started, because each one's runs kept the load above the other's
    gate.
  - Fix: redux-port stops all browser runs and writes its final report
    (`docs/use-store/research/redux-benchmarks.md`) plus a
    `run-all-quiet.sh` for the quiet phase.
  - zustand-gap gets the machine, with the relaxed gate.
- **2026-10-30 ~23:05.** zustand-gap's full suites with the bailout:
  experimental 474/476, www-modern variant=true 472 (2 skipped), variant=false
  474/476. The only failures are B-2 (Node 25 Flight).
  - `ab.mjs` now has `--max-load` gating.
  - Next: stable, then a full build plus the DevTools profiler tests. I asked
    it to also run the B-20 DevTools file list on that build.
  - Then isolated A/B timing: opt5 vs opt6 across all 6 scenarios × 3 sizes ×
    2 CPU speeds, then `enableNoCloningMemoCache`.
- **2026-10-30 ~23:00.** zustand-gap: with `enableSameElementBailout` on,
  the full `yarn test` suites pass on experimental and on www-modern
  (variant true and false). The only failures are the 3 known Node 25 Flight
  tests (B-2, a pre-existing environment issue). Stable is running.
- **2026-10-30 ~22:45.** redux-port treats every earlier timing as ungated
  and is re-running all of them through a load-gated runner:
  - runner: `/tmp/derived-check/gated.sh`;
  - load log: `/tmp/derived-check/load.log`;
  - a run whose load went above 12 is discarded and retried.

  That covers derived/mcss/rapid/deeptree/fairness/typing/sweeps × 3
  interleaved restarts. The earlier numbers are directional only.
- **2026-10-30 ~22:40.** zustand-gap's `pkill -f scripts/jest/jest.js`
  (around 16:xx local) killed every jest process on the machine.
  context-copies verified after that, so the impact is low, and phase 2
  re-runs everything anyway.
  - The same-element bailout is being reworked to meet the guardrails:
    - its own flag;
    - an allow-list of child tags, excluding Profiler, Suspense, Offscreen,
      Activity, SuspenseList and ViewTransition;
    - it skips the parent profiler-timer stop and the dependencies reset in
      `bailoutOnAlreadyFinishedWork`;
    - a DEV exclusion when Fast Refresh resolves a newer type.
- **2026-10-30 ~22:35.** derived-spike progress.
  - Every sharing option computes 8 derivations per update at any K;
    plain store computes 8K.
  - **`store-derived` (compute in the update) TEARS under transitions.** A
    sync commit showed posts without the pending transition next to stats
    from it, reproduced with the mock scheduler. So it's not a safe
    recommendation.
  - Identity-keyed caches stay correct across an interrupted transition.
  - WeakMap, render-scoped and two-generation caches retain 0 old snapshots
    over 10k updates. A strong cache held 120 MB. WeakMap keying leaks for a
    (long-lived object, changing primitive) call.
  - Lookup costs 30–80 ns, so a compiler pass must not apply it to cheap
    calls.
  - **Machine load average is ~33 on 16 cores,** so all current timings are
    noisy. I cut the spike's matrix; its full matrix runs in the quiet
    phase.
- **2026-10-30 ~22:25.** zustand-gap interim report.
  - Profiles confirm hypothesis 1: the store vs store-single gap is
    per-`use()` bookkeeping.
  - Per-row floor: Row body ~45 ns, hooks ~20, RowView reconcile+clone+
    bailout ~60, marking ~18. Zustand pays ~100 for selectors plus ~45 for
    the fiber walk.
  - Kept changes:
    - flat `[record, value]` pairs plus one subscription effect instance
      (selection −12%, filter −9%);
    - commit only visits pending/unsubscribed records (entity@10k −19%);
    - no effect when the set of stores is unchanged (−2.5% at 10k);
    - dispatch skips the per-reader walk to the root (noise).
  - DCP-8 and DCP-9 are recorded. All gates pass.
  - Selection now: store ~0.22, Zustand ~0.186.
  - Next: land the same-element bailout behind a flag, then
    `enableNoCloningMemoCache`, then trim `use()` further.
  - The linc warning in `scripts/store-parity/context.js` is resolved; `yarn linc` passes.
- **2026-10-30 ~22:15.** context-copies finished the B-20 identity fix in
  source.
  - `react-debug-tools` gets one new export, `getStoreKeyOfHooksNode`,
    backed by a WeakMap, so nothing new is serialized. Change detection
    matches slot hooks by `id` and Store leaves by store key.
  - The debug-tools tests pass on all 4 channels.
  - The DevTools `--build` verification needs a full, consistent `yarn build`
    (it wipes `build/`), and the build-level run is pending (file list under
    B-20).
  - Checked: the frozen `react-builds/baseline` still uses `{record,
    value}` read objects, while the source uses `[record, value]` pairs. So
    the baseline build is the true pre-optimization reference. The
    `/tmp/store-src-baseline` snapshot (taken about 20 minutes after
    zustand-gap started) probably already includes its first change, so use
    `git diff` plus zustand-gap's report for review, not the snapshot alone.
- **2026-10-30 ~22:05.** deeptree-nested-hooks is done.
  - use(store)+compiler is 0.13–0.66× Redux's time. Renders are identical;
    Redux runs about 800 selectors per click.
  - Watch appendMany at 4×: store 18.0 vs Zustand 16.7 ms, with 30–40%
    restart noise. Re-check it in the quiet run.
  - The mount-time comparison isn't apples to apples: the store variant
    creates its strings already initialized, while Redux and Zustand dispatch
    600 mount effects. Don't headline it.
  - Results: `results/smoke-deeptree-1793395717732.json`.
- **2026-10-30 ~22:00.** context-copies is done.
  - 187 context-reading cases: 105 translated, 82 skipped with reasons.
  - Copy files pass on all 4 channels. `check.js --context` reports 52/52
    files done (7 excluded); the state check is still 138/138.
  - New blockers: B-18 (Suspense retry, must-fix, reconciler, phase 2),
    B-19 (Flight message, fixed by me), B-20 (DevTools crash on a dropped
    conditional read).
  - B-20: I added the crash guard. Identity matching is assigned to
    `context-copies`, since it's DevTools/debug-tools only.
  - Ricky's direction: the compiler gap is a later follow-up. Shared derived
    data needs a spike (`derived-spike`). Reading outside render needs
    research into the referenced docs (`outside-render-research`).
- **2026-10-30 ~21:45.** rapid-dispatch is done.
  - use(store)+compiler is 0.15–0.32× Redux's time and about 0.55–0.7× of
    Zustand's.
  - Renders are identical; Redux runs 750–4500 selectors per step.
  - Results: `results/smoke-rapid-1793393970648.json`.
  - deeptree-nested-hooks timing is next.
- **2026-10-30 ~21:35.** context-copies finished the core files.
  - ReactNewContext: 17 cases translated, 14 skipped.
  - ReactContextPropagation: 16 translated, 1 skipped, 2 gated on B-18.
  - All 4 channels green. Checker: `node scripts/store-parity/check.js --context`.
  - Moving on to the hooks, Suspense, Activity, lazy, StrictMode and
    incremental files.
- **2026-10-30 ~21:25.** many-components-same-slice is done.
  - 5000 readers, all of them change.
  - use(store)+compiler is 0.30–0.36× Redux's time and about 0.6–0.75× of
    Zustand's (contended run).
  - Results: `results/smoke-mcss-1793393712501.json`.
  - rapid-dispatch timing is next.
- **2026-10-30 ~21:10.** The `redux-port` derived-selectors report is in.
  - Suite code: `fixtures/store-bench/src/redux-suite/derived-selectors/`,
    selected with the `--suite=` flag in `build.mjs`, `run.mjs` and
    `run-jsdom.mjs`.
  - Results: `results/smoke-derived-1793393085578.json`.
  - It has started the follow-ups: three more scenarios, fairness variants,
    sweeps.
- **2026-10-30 ~20:40.** Three agents running. The derived-selectors smoke
  result is in (above). The mission file and compact instructions are written.
