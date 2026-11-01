# use(store): next steps

2026-10-31. Covers what comes after the overnight work (see `SUMMARY.md` for
what was done), the derived-data discussion, and the signals review. Items are
ordered by priority within each section. Nothing is committed yet.

## 0. Where things stand (updated 2026-10-31, after the HostRoot redesign)

- **The implementation is complete behind `enableStore`,** in local WIP commits on `rh/use-store`.
  - **The HostRoot owns store state** (DCP-17), and transition updates to stores nobody reads are held (DCP-18/20).
  - **Reducer errors are reported unless a committed boundary logs them** (DCP-19).
- **Fixed since the overnight run:**
  - five bugs from a correctness review: subscribing when a render bails out, dispatch atomicity, lost lanes (×2), and DevTools running reducers;
  - the ponyfill-port bug (#6);
  - ten findings from four review passes on the redesign;
  - a React StrictMode bug, where effects under a newly mounted non-strict parent weren't double invoked.
- **Perf against the pre-redesign build** (react-builds/final vs hostroot5, 7 interleaved rounds): every cell within ±2%.
  - Mount is equal or faster.
  - Memory is +1.5% per row (the per-record `StoreState`).
  - Typing latency during a transition is unchanged.
- **Against Redux and Zustand, with the compiler:**
  - **Main suite:** 36/36. Selection is 0.52–1.00×; everything else is 0.11–0.59×.
  - **Redux-team suites:**
    - rapid-dispatch: all win, 0.53–0.64×;
    - many-components-same-slice: wins, about 0.75×;
    - deeptree: 11/12, with `appendMany` x1 tied (worse mean, better median);
    - derived-selectors with `store-memo` (userland `weakMemo`): all win, 0.68–0.78×. Plain `store` still loses 3 of 4 by up to 1.23×, so sharing derived data through `weakMemo` is the recommended pattern.
  - **Sweeps (selection with one or two reads per row):** plain `store` keeps the selection floor (1.3–1.5× slower than Zustand with the full compiler; worse with partial coverage).
    - **`store-keyed` wins all 48 configurations at about 0.5×,** with or without the compiler. It selects through a `weakMemo`'d store per row, so only the two changed rows re-render.
    - That's the userland equivalent of a keyed selector (Solid's `createSelector`), and it removes both the selection floor and the partial-coverage cliff for selection.
- **The test copies are being cleaned up** (plan: ~/.claude/plans/vivid-squishing-river.md): parity by title is retired, and copies are folded into store spec files or base files.

## 1. Decisions needed

| # | Decision | Recommendation | Background |
|---|---|---|---|
| D1 | How should shared derived data work? | **Option A:** a client `cache()` scoped to a render, memoization only (§3) | `shared-derived-data.html`, `research/shared-derived-data.md` |
| D2 | Client `cache()` lifetime and mechanism | A new render-scoped root (`getRenderCache()`), **not** the removed `<Cache>`/`CacheContext` design | §3.2. Background: #27977, #28698, reactwg #53/#72 |
| D3 | Which A form to teach | **Pass the reads in** as the default: `cache(fn)(use(a), use(b), arg)`. The handle form `use(family(arg))` is a follow-up | §3.1 |
| D4 | Pursue option B (dependency-tracked entries that skip readers)? | **A flagged experiment only**, gated on real-app data | §4. `research/signals-review.md` (includes prior art #20646, #30407/#31806, #171, #296) |
| D5 | Reading stores outside render | **Don't ship a derived read.** A handler uses its render closure or an updater. If forced, a committed `peek(root)`, never the latest value | `research/reading-outside-render.md`, signals review |
| D6 | `enableSameElementBailout` | Review and roll out **as its own PR**, separate from stores | DCP-10 |
| D7 | `enableNoCloningMemoCache` | **Don't enable for stores:** no measured benefit, and an identity-loss risk | DECISIONS.md, "Finding: enableNoCloningMemoCache…" |
| D8 | Store reducer errors when nothing reads the store | Accept DCP-14: `store.update()` throws synchronously and the update isn't applied | DCP-14 |
| D9 | Two context-copy translation rules | Accept (bailout parent re-render kept; Suspense retry not prewarmed) | `DESIGN.md`, "Differences from context" |

**Ask Seb directly:**
- Do general, parameterized derived computations evaluated in render (B's
  entries) escape "selectors just didn't make sense" (#296)?
- His view on a latest-value read outside render.

## 2. Before sharing beyond the team

1. **Re-run the benchmarks on a quiet machine.** The overnight runs were
   load-gated, but the laptop had background load (Defender, DLP, other
   projects). From `fixtures/store-bench`:
   - `REACT=react-builds/final ./run-all-quiet.sh`;
   - plus the main suite's `--full` units;
   - then `node report.mjs`.
2. **Get real-app data, the lesson of #31806.**
   - What fraction of the target Meta surfaces is compiled? The coverage cliff
     (90% compiled means 3× slower selection) depends on it.
   - Dogfood on one store-heavy www surface (a Recoil or context-selector
     replacement), and measure renders and interaction latency against the
     current implementation.
3. **Land the PR stack in reviewable pieces:**
   - the store core;
   - Fizz, Flight and DevTools;
   - the same-element bailout (D6);
   - the test copies;
   - the parity tooling;
   - the benchmark fixture.

## 3. Derived data: ship option A

### 3.1 The A forms

**Default: pass the reads in.**
```js
const getStats = cache(computeStats);

function CategoryStats({category, expanded}) {
  if (!expanded) return null;
  const stats = getStats(use(posts), use(comments), category); // conditional, shared
  ...
}
```
- Identity keys, so no tracking and no replay. It's compiler-correct (the
  snapshots are arguments) and conditional-friendly.
- It computes 8 times per update instead of 8×K. The userland equivalent
  measured 1.5–2.1× faster than Redux.
- **Costs:**
  - Call sites have to know the dependencies.
  - Wrapping it in a custom Hook (`useCategoryStats`) makes it unconditional
    under the rules of hooks (see §5.3).
  - No path to B.

**Follow-up: the handle form.**
```js
const categoryStats = cache(category => {
  const posts = use(postsStore);
  const comments = use(commentsStore);
  return computeStats(posts, comments, category);
});

const stats = use(categoryStats(category)); // conditional, encapsulated
```
- It encapsulates the dependencies, is conditional because it's `use()`, and
  is compiler-correct, since the compiler memoizes handle creation by
  argument, which is valid.
- **Runtime it needs:**
  - record the store reads on the entry when it misses;
  - replay them into the caller's subscriptions on a hit;
  - allow only slotless reads inside the cached function (`use(store)`;
    `use(context)` checked on lookup);
  - throw for `useState` and `use(promise)` inside it.
- It keeps the door open to B with no API change: "the handle is the hinge".

### 3.2 Implement a render-scoped client `cache()`

The full implementation plan is in [CACHE_PLAN.md](CACHE_PLAN.md).

1. Add `getRenderCache()` to the async dispatcher.
   - It returns a trie root stored on the root being rendered, created in
     `prepareFreshStack` and dropped when the render restarts or commits.
   - Optionally keep the last committed generation, for components that mount
     later.
2. Route the client `cache(fn)` through it. Reuse the trie walk from
   `ReactCacheImpl.js`. No `CacheContext`, no `<Cache>`, no refcounting, no
   `AbortSignal`.
3. **Fizz:** a per-request map, replacing `getCacheForType`, which throws
   there today. Flight is unchanged.
4. **Outside render** (no dispatcher), keep today's behavior: call `fn`.
5. Put it behind a new flag. `disableClientCache` stays on for the old path.
   Delete the vestigial `CacheContext` path in `getCacheForType` when it's safe.

**Tests:**
- sharing across components in a render;
- an interrupted transition gets a fresh cache;
- a render that yields and resumes keeps its cache;
- two roots never share;
- calls outside render aren't cached;
- StrictMode;
- an error thrown from the cached function (cache it like the server does, or
  don't — decide);
- the long-lived-object leak case is bounded.

**Measure:** the real API on `derived-selectors` (K = 5/20/50), next to the
userland stand-in (`store-cache-render`).

### 3.3 Then the handle form (after D3)

The read recording and replay from §3.1, the slotless-only dispatcher inside
cached functions, handle lifetime (refcount by committed readers and evict at
zero, which bounds primitive-keyed families), and context validation on
lookup.

**Tests:**
- a store update re-renders every subscriber after a cache hit;
- a conditional `use(handle)`;
- a reader that suspends behind a handle subscribes its boundary (DCP-16
  extended);
- a hidden Activity reader.

## 4. Option B: a flagged experiment

Only after A ships, and only with real-app data in hand. Design notes from the
signals review:

- **Push-pull, the same shape as `useState`:**
  - an eager check at dispatch, only when every store the entry reads has an
    empty queue (like `dispatchSetState`'s `fiber.lanes === NoLanes` guard).
    Abort to lazy on a non-empty queue, a suspend or a throw; never throw at
    the dispatch site;
  - otherwise mark entries dirty and validate them at the render's cut.
- **Correctness requirements found in review:**
  - the cutoff baseline is **per reader** (`(entry, value)` pairs on the
    fiber, like `storeReads`), not per entry. Otherwise a hidden Activity
    reader is skipped and tears when revealed;
  - dependency sets per (entry, root), swapped at the **root's commit**;
  - DCP-16 collects entries;
  - one evaluation mode per propagation.
- **"Re-render lite":** skip calling a component when every entry it reads is
  unchanged.
  - It works **without the compiler**, which is the runtime answer to the
    partial-coverage cliff in fan-out lists.
  - The closest precedent is `memo`'s props comparison.
- **Equality:** `Object.is` by default, with an opt-in `equals` **on handles
  only** (for filtered id lists).
- **Not yet:** a keyed index (Solid's `createSelector`, O(changed)). Gate it on
  a 10k-row selection run with a pending transition, which forces the lazy
  path.
- **Pitch it to the team** as "Andrew's useMemo-with-hooks idea (#171, Dec 2023
  tweets), made evaluable without running the component". Lead with Sophie's
  question from #296. Our floor data shows that skipping work *after* the body
  runs is what compiled use(store) already does; the win only comes from not
  running the component.
- **Success criteria:**
  - the selection floor closes on the sweeps (2 reads per row) and the
    partial-coverage sweep;
  - no regression elsewhere;
  - a measurable win on a real surface (the #31806 bar).

## 5. Other engineering follow-ups

1. **Compiler: `f(use(a), use(b), x)` isn't memoized** (the scope is
   flattened). Hoisted reads work. This must be fixed before people learn the
   wrong idiom; it also affects §3.1's default form.
   (`FlattenScopesWithHooksOrUseHIR`.)
2. **Compiler and lint awareness of handles.** Make sure
   `use(family(args))` compiles optimally (memoize handle creation, keep `use`
   reactive), and lint doesn't flag the `use()` calls inside a `cache()`d
   function. Decide how lint treats them.
3. **Conditional calls to `use()`-only custom Hooks.** A custom Hook whose
   body only calls `use()` is safe to call conditionally at runtime, but lint
   forbids it. Decide between a convention or marker for such Hooks, or
   steering encapsulation toward handles (§3.1). This is the store version of
   Dan's custom-Hook point in #296.
4. **Cross-store transactions (Jordan's question).**
   - Independent writes already rebase correctly (tested).
   - **Spike:** `read(otherStore)` inside reducers, returning the other
     store's value at the update's sequence number under the render's lanes.
   - Prove it with a rebasing test for "read record X, write the list" while
     an urgent update interrupts a pending transition.
   - For a sorted list, recommend deriving the order in render, which is
     correct today.
5. **The selection floor without B.** The two remaining design paths
   (compiler-emitted pre-checks; re-render lite driven by compiler metadata)
   are covered by B (§4). Don't pursue them separately.
6. **The DevTools Profiler detail view** filters hooks by `id` while change
   indices count `Store` and `Context` nodes, so it falls back to the short
   text. This is a pre-existing mismatch; fix it if store debugging matters.
7. **Optimistic stores** (with #416) and **external interop / observables**
   (#403) stay out of v1.

## 6. Open questions

- What fraction of real Meta surfaces is compiled? (This decides how much the
  coverage cliff matters.)
- Do apps really have the "few values per row, wide fan-out" pattern where
  selection loses, or is it already avoided, as #31806 found for context?
- Does a TC39 `Signal.State` → store bridge (through a `Watcher`) pick up the
  ambient transition lane? (Only relevant if interop comes back.)
- Which client `cache()` lifetime: render-scoped, or two generations? Decide
  from real-app recomputation data.

## References

- **Overnight results:** `SUMMARY.md`, `OVERNIGHT.md`, `benchmark-report.html`.
- **Design:** `DESIGN.md`, `DECISIONS.md` (DCP-1 to DCP-16).
- **Derived data:** `shared-derived-data.html`, `research/shared-derived-data.md`.
- **Signals review and prior art:** `research/signals-review.md`.
- **Reading outside render:** `research/reading-outside-render.md`.
- **Selection floor:** `research/selection-floor.md`.
- **Code review:** `research/code-review.md`.
- **Benchmarks:** `research/redux-benchmarks.md`, `fixtures/store-bench/README.md`.
