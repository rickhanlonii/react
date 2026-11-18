# Shared derived data without selectors

Spike for Ricky, 2026-10-30. The question: `use(store)` has no selectors, and the compiler memoizes derived values per component instance. How should K components that derive the same value from the same snapshots share one computation?

Sections 1–4 are results. Section 5 is per-option analysis. Section 6 is the recommendation, kept separate. Section 7 lists the files and commands.

**Contention warning.** The timing comes from one reduced, interleaved run on a contended machine (load average about 30 on 16 cores while other agents ran jest and benchmarks). It covers K=5 and K=50, 1× CPU, 1 restart and 7 variants. It's only good for direction and rough magnitude. The full matrix (all variants, K=5/20/50, 1× and 4×, 3 restarts) is queued for the quiet phase; the command is in §7 under "Quiet re-run". Derivation counts, DOM checks, the concurrency test and the memory test don't depend on load.

## 0. Summary of results

- **Sharing closes the gap and then some** (reduced, contended run; direction only):
  - Plain `store` is 1.1–1.75× Redux at K=5 and 3.1–4.4× at K=50.
  - Every sharing variant is 0.55–0.76× Redux at K=5 and 0.46–0.65× at K=50, on `score`, `comment` and `mixed`.
  - Going from K=5 to K=50 adds about 0.1 ms per update to the sharing variants, and 2–2.6 ms to plain `store`.
- **Every sharing option computes 8 stats per update, the same as `createSelector`, at any K.** Plain `use(store)` + compiler computes one per reader: 8K per update (K readers × 8 categories).
- **Option 2 (`store-derived`, compute in the update) tears under transitions.** I reproduced it with the real build: a sync commit showed posts without a pending transition next to stats computed from that transition's posts. It is fast, but it isn't correct.
- **Options 3–6 are correct under concurrency by construction.** They cache by the identity of immutable snapshots, so two renders at different cuts use different keys. I tested this by pausing a transition mid-render, committing a sync update over it, and restarting it.
- **Every option except a never-evicted strong cache stays flat in memory** (heap growth under 1 MB, which is within noise). WeakMap keying, render-scoped and two-generation caches all retained 0 old snapshots after 10k updates. A strong cache with no eviction held all 10,000 (120 MB). WeakMap keying leaks only when a long-lived object is followed by a primitive that keeps changing (1.6 MB per 10k distinct values). reselect warns about exactly this case in dev.
- **The compiler-emitted version gets the same derivation count as userland `weakMemo`, with no user code.** It also routes the two unshared derivations through the cache, as a pass that can't see cost would.
  - That costs nothing measurable on `score` and `comment`.
  - On `mixed` it's a reproducible 70–90 µs per update (0.37 vs 0.28–0.30 ms), which is unexplained and needs a profile.
  - In Node, a lookup costs about 30 ns on a hit and 60–80 ns on a miss, against about 15 µs per derivation. A pass needs a heuristic that skips cheap or unshared calls (§5).

## 1. Setup

- **Data and updates:** the `derived-selectors` scenario from react-redux-benchmarks, unchanged (500 posts, 1000+ comments, 200 components in four tiers). Only Tier 4 (`CategoryStats`) has sharing. Tiers 2 and 3 derive per id, and no two components share an id.
- **K sweep:** the new scenarios `mixed-k20`, `score-k50`, etc. mount K `CategoryStats` per category instead of 5. The harness sets `TIER4_COUNT` before each mount, so every existing variant runs them unchanged. The default suite and scenarios are untouched.
- **Builds:** against the frozen `react-builds/baseline`, compiler on (`panicThreshold: 'all_errors'`).
- **Timing (reduced run):** headless shell, single process, 1× CPU, 100 samples × batch 10 after 30 warmup steps, 1 browser restart with randomized order. Scenarios `score`, `comment` and `mixed` at K=5 and K=50. A full 3-restart run was started, then stopped at about 190 of 720 configurations to cut load on the shared machine. It saved no results.
- **Correctness:** all 24 bundles (12 variants × compiler on/off) render byte-identical DOM in all 12 scenarios in jsdom (`run-jsdom.mjs`). The first 20 bundles were also checked in Chrome (`run.mjs --verify`). `store-cache-render` and `store-compiled-shared-site` were added after that run.

| Variant | Option | What the user writes |
|---|---|---|
| `redux` | reference | `createSelector` with weakMapMemoize (reselect 5), `useSelector` |
| `zustand` | reference | a selector per component, so every selector derives on every update |
| `store` | 1 | `getCategoryStats(use(posts), use(comments), category)` |
| `store-compiled` | 1 (control) | the compiler's output for `store.jsx`, checked in |
| `store-derived` | 2 | stats computed in the action from a userland `latest` mirror, kept in a store |
| `store-memo` | 3 | `const getShared = weakMemo(getCategoryStats)` at module scope |
| `store-reselect` | 3 | the same with reselect's `weakMapMemoize`, no `createSelector` |
| `store-cache-gen` | 4 | a client `cache()` stand-in: strong Maps, two generations (current render + last committed) |
| `store-cache-render` | 4 | the same with one generation: scoped to a render |
| `store-compiled-shared` | 5 | `store-compiled.jsx` with every qualifying memoized call routed through `sharedCall(fn, ...args)` |
| `store-compiled-shared-site` | 5 | the same with one lazily created cache per callsite |
| `store-derived-lazy` | 6 | a derived-store stand-in: `useDerived(createDerivedStore([posts, comments], getAllCategoryStats))[category]` |

## 2. Results

### Derivations per update (compiled builds, averaged over 200 updates)

From `run-jsdom.mjs` (the counting build). Every sharing variant has the same count, so they're grouped.

| Scenario | K | redux | zustand | store, store-compiled | store-derived | every sharing variant (3–6) |
|---|---:|---:|---:|---:|---:|---:|
| score | 5 | 58.1 | 161.2 | 90.0 | 58.0 | 58.0 |
| score | 20 | 58.1 | 311.0 | 210.0 | 58.0 | 58.0 |
| score | 50 | 58.1 | 610.7 | 450.0 | 58.0 | 58.0 |
| comment | 5 | 68.0 | 160.3 | 100.0 | 68.0 | 68.0 |
| comment | 20 | 68.0 | 310.3 | 220.0 | 68.0 | 68.0 |
| comment | 50 | 68.0 | 610.3 | 460.0 | 68.0 | 68.0 |
| mixed | 5 | 53.5 | 159.4 | 81.4 | 53.4 | 53.4 |
| mixed | 20 | 53.5 | 305.4 | 186.4 | 53.4 | 53.4 |
| mixed | 50 | 53.5 | 597.3 | 396.4 | 53.4 | 53.4 |
| role | any | 0 | 150–510 | 0 | 0 | 0 |

How to read it:
- In `score`, 50 of the derivations are Tier 3 (`getPostsByUser`, unshared, 50 users) and the rest is Tier 4: 8 shared vs 8K per instance.
- In `comment`, 60 are Tier 2 (`getCommentCount`, unshared).
- Renders are the same for every `use(store)` variant (e.g. 200 / 320 / 560 for `score`), plus 1 for the `CacheGeneration` component in the two `store-cache-*` variants.
- `store-derived-lazy` computes all 8 categories when any reader needs one. Here every category is mounted, so it's 8.

### Timing

Reduced run: `results/smoke-spike-reduced-1793397258101.json`, 1× CPU, 1 restart, median ms per update with the ratio to Redux in the same run. Medians land on 0.01 ms steps because single-process mode has 100 µs timers; the harness batches 10 updates per sample to compensate.

| Variant | score K=5 | score K=50 | comment K=5 | comment K=50 | mixed K=5 | mixed K=50 |
|---|---:|---:|---:|---:|---:|---:|
| redux | 0.42 (1.00) | 0.72 (1.00) | 0.64 (1.00) | 0.85 (1.00) | 0.49 (1.00) | 0.82 (1.00) |
| store (1) | 0.46 (1.10) | 2.64 (3.67) | 1.12 (1.75) | 3.74 (4.40) | 0.55 (1.12) | 2.54 (3.10) |
| store-derived (2, tears) | 0.26 (0.62) | 0.37 (0.51) | 0.42 (0.66) | 0.63 (0.74) | 0.28 (0.57) | 0.37 (0.45) |
| store-memo (3) | 0.27 (0.64) | 0.40 (0.56) | 0.43 (0.67) | 0.55 (0.65) | 0.28 (0.57) | 0.39 (0.48) |
| store-cache-gen (4) | 0.28 (0.67) | 0.40 (0.56) | 0.43 (0.67) | 0.54 (0.64) | 0.27 (0.55) | 0.38 (0.46) |
| store-compiled-shared (5) | 0.28 (0.67) | 0.41 (0.57) | 0.44 (0.69) | 0.53 (0.62) | **0.37 (0.76)** | **0.48 (0.59)** |
| store-derived-lazy (6) | 0.27 (0.64) | 0.37 (0.51) | 0.43 (0.67) | 0.52 (0.61) | 0.28 (0.57) | 0.38 (0.46) |

- **The sharing variants are within noise of each other, except option 5 on `mixed`.** `store-derived` (option 2) isn't faster than the correct options in any meaningful way.
- **Option 5 on `mixed` is a real, unexplained cost.** `store-compiled-shared` is 70–90 µs per update slower than `store-memo` on `mixed`, at both K. It reproduced in two follow-up runs (2 restarts each): 0.37 vs 0.29 ms, then 0.37 vs 0.30 ms. It does not show on `score` or `comment` alone (0.28 vs 0.28, 0.42 vs 0.46).
  - The only difference from `store-memo` is that the unshared Tier 2 and Tier 3 calls (`getCommentCount`, `getPostsByUser`) also go through the cache. That's about 45 shared-cache misses per `mixed` update, which works out to ~1.6 µs per miss. The Node microbenchmark says 60–80 ns.
  - It isn't the single app-wide trie: `store-compiled-shared-site`, with one cache per callsite, measured 0.39 ms in the same run.
  - My guess is GC work on the WeakMap/Map entries created per snapshot per callee, but I didn't profile it (`profile.mjs` doesn't support suites). Profile it in the quiet phase.
  - Either way, it's evidence that sharing calls that never hit isn't free. See the heuristic in §5.
- **`store-cache-render` and `store-compiled-shared-site` aren't in the reduced run.** `store-cache-render` runs the same code as `store-cache-gen` with an empty previous generation.

## 3. Lookup cost and memory

### Cost of a shared lookup (`lookup-cost.mjs`, Node, per call)

| | miss (lookup + insert) | hit |
|---|---:|---:|
| direct call, no cache | 4 ns | 3 ns |
| `weakMemo` | 58 ns | 27 ns |
| `sharedCall` (callee as the first key) | 77 ns | 31 ns |
| reselect `weakMapMemoize` | 226 ns | 19 ns |
| `generationalMemo` (strong Maps) | 57 ns | 20 ns |

What this means:
- The compiled code checks the per-instance slots first, so the shared cache is only consulted when an instance's inputs changed.
- In this benchmark a derivation costs about 15 µs, so a lookup is noise.
- The compiler can't see cost, though. Say 1,000 rows each derive something cheap from a store that changed. Routing all of them through a shared cache adds 60–80 µs per update. That's the same order as the whole remaining reconciler overhead in the `selection` benchmark (about 45 µs, DECISIONS.md "Finding: what's left of the gap...").

### What each lifetime retains (`memory.mjs`, 10,000 updates, 8 categories × 5 readers)

| Cache | Heap growth after GC | Old posts snapshots still alive (sampled 1 in 10) |
|---|---:|---:|
| none (per instance) | 0.4 MB | 0 |
| `weakMemo(posts, comments, category)` | 0.2 MB | 0 |
| `weakMemo(category, posts, comments)` (primitive first) | 0.9 MB | 0 |
| `sharedCall(fn, posts, comments, category)` | 0.4 MB | 0 |
| reselect `weakMapMemoize` | 0.4 MB | 0 |
| two generations | 0.4 MB | 0 |
| one generation (render-scoped) | 0.3 MB | 0 |
| strong Map trie, never evicted | 119.6 MB | 10,000 |
| `weakMemo(LIST, query)`, long-lived object + new string every update | 1.6 MB | n/a (grows linearly) |
| reselect `weakMapMemoize(LIST, query)` | 1.6 MB | n/a (grows; reselect warns in dev after 1,000 values) |
| two generations, `(LIST, query)` | 0.3 MB | n/a |

- **The rule for WeakMap keying:** an entry lives as long as every object on its path. Snapshot arguments make entries die with their snapshots.

**The leak case: a long-lived object followed by a primitive that keeps changing.** Examples are `search(CONSTANT_LIST, query)`, `format(config, timestamp)`, or a primitive-only call like `formatPrice(cents)`. The long-lived object (or the trie root) never dies, so its primitive Map gains an entry for every new value, and each entry holds its result. It grew 1.6 MB per 10k values here, without bound. reselect 5 ships a dev warning for exactly this (`cacheSizeCheck`, after 1,000 distinct values).

How each option handles it:

| Option | The leak case |
|---|---|
| 1. Per instance | no leak: one slot per instance, freed on unmount |
| 2. Compute in the update | no leak: one value |
| 3. `weakMemo` / `weakMapMemoize` | **leaks.** The user must avoid it: put snapshots first, and don't wrap calls whose only object is long-lived. reselect warns in dev, and its `maxSize` / `lruMemoize` bound it. |
| 4a. `cache()` keyed by identity in the root `Cache` (the existing impl) | **leaks** until `useCacheRefresh` replaces the `Cache` |
| 4b. `cache()` scoped to a render | no leak: everything is dropped after the render (0.3 MB, flat) |
| 4c. `cache()` with two generations | no leak: bounded by two renders (0.3 MB, flat) |
| 5. Compiler-emitted | depends on the runtime it targets. A module-global trie (what `sharedCall` does) leaks. Qualification rule 4 (a reactive object argument, keyed first) excludes primitive-only calls, but not "long-lived object + primitive", because a reactive prop can be a long-lived object. With a render-scoped runtime, there's no leak. |
| 6. Derived stores | no leak: one value per record, dropped with the record. A parameterized family of derived stores has the same problem as 3. |

## 4. Correctness under concurrency

`spike-shared-derived/concurrency.mjs` uses the real baseline build, jsdom and the mock scheduler. 12 readers (4 categories × 3) each call the shared derivation every render (uncompiled, so there's no per-instance memo).

The sequence:
1. A transition updates `posts`. 4 readers render at the transition's cut, then the render is paused.
2. A sync update to `comments` commits over it, at a cut with the new comments but the old posts.
3. The transition restarts and commits.

At every commit, every reader's text must equal the stats computed directly from that commit's values, and the derivation count must equal the number of distinct (cut, category) pairs.

| Cache | Mount | Paused transition | Sync commit | Transition commit | Interrupted cut still cached? |
|---|---|---|---|---|---|
| `weakMemo` (option 3 / identity-keyed `cache()`) | ok, 4 | ok, +2 | ok, +4 | ok, +4 | yes (while the snapshots are alive) |
| two generations (option 4) | ok, 4 | ok, +2 | ok, +4 | ok, +4 | no (evicted) |
| render-scoped (option 4) | ok, 4 | ok, +2 | ok, +4 | ok, +4 | no (evicted) |
| `store-derived` pattern (option 2) | | | **torn:** `score:0` (transition not rendered) next to stats that include the transition's score | | |

Other findings:
- **Within a root, every reader in a render gets the same snapshot object.** `readStoreRecord` caches per render, and that's what makes identity keys hit.
- **Across roots, sharing depends on identity.** With `store.update(value)`, two roots share entries (4 derivations for 4 categories). With an updater function, each root's record runs the reducer itself and gets its own snapshot, so the work doubles (8). That's still correct, just not shared.
- **Rebasing can produce a new identity for the same logical value.** The read reuses the eager state when the base matches, so this is rare. When it happens, it's a cache miss, not a bug.

The `store-derived` tear is the case reasoned through in `reading-outside-render.md` ("Worked example"). Here it's reproduced with the real reconciler.

### The `store-derived` tear, as a test

This is the case from `computedInTheUpdate()` in `concurrency.mjs`, transcribed into the shape it would take in `ReactUseStore-test.js`. The logic ran in `concurrency.mjs` (baseline build, jsdom, mock scheduler). This Jest form hasn't been run.

```js
it('derived data computed in an action tears with a pending transition', async () => {
  // The store-derived pattern: a userland mirror of the head, and the derived
  // value written to its own store in the same action as its sources.
  const latest = {posts: [{id: 0, score: 0, category: 'a'}], comments: []};
  const derive = (posts, comments) => ({
    total: posts.reduce((sum, p) => sum + p.score, 0),
    comments: comments.length,
  });
  const posts = createStore(latest.posts);
  const comments = createStore(latest.comments);
  const stats = createStore(derive(latest.posts, latest.comments));

  function Score() {
    return <Text text={'score:' + use(posts)[0].score} />;
  }
  function Stats() {
    const {total, comments: count} = use(stats);
    return <Text text={`total:${total} comments:${count}`} />;
  }
  const root = ReactNoop.createRoot();
  await act(() => root.render(<><Score /><Stats /></>));
  assertLog(['score:0', 'total:0 comments:0']);

  // A transition changes a score. It's still pending...
  React.startTransition(() => {
    latest.posts = [{...latest.posts[0], score: 1000}];
    posts.update(latest.posts);
    stats.update(derive(latest.posts, latest.comments));
  });
  // ...when an urgent update to another source commits.
  ReactNoop.flushSync(() => {
    latest.comments = [...latest.comments, {id: 1, postId: 0}];
    comments.update(latest.comments);
    stats.update(derive(latest.posts, latest.comments));
  });

  // The sync commit doesn't include the transition, so Score shows 0. The
  // derived value was computed from the head, which does include it. A
  // consistent commit would show total:0.
  assertLog(['score:0', 'total:1000 comments:1']);
});
```

- **Why it happens.** Each store's queue is lane-correct on its own. But the urgent `stats` update carries a value computed from `posts` at the head, including the transition. Nothing can derive it from the urgent render's cut, because the derivation ran outside render.
- **Why there's no way around it here.** Reading at the committed value instead, or adding a read-outside-render API, doesn't help: the urgent update would then miss the transition when that commits. Only deriving during render, or one store with one reducer, is consistent.
- **Measured run.** `concurrency.mjs` printed: `TORN the sync commit shows score:0 (transition not rendered) next to a:10:21:1452 (consistent with that: a:10:21:452)`.

## 5. Options

### Option 1: per-instance derivation (`store`, the baseline)

- **Concurrency:** trivially correct.
- **Memory:** compiler slots, freed on unmount.
- **What the user writes:** plain code.
- **API:** none.
- **Cost:** the shared part grows as K × the derivation cost (450 vs 58 derivations at K=50).
- **Related quirk:** OVERNIGHT.md notes that `f(use(a), use(b), x)` written inline isn't memoized at all, because of scope flattening. Any compiler-based fix inherits that.

### Option 2: compute in the update (`store-derived`)

- **Concurrency:** wrong.
  - The derivation runs on the head (the userland `latest` mirror), not on the cut a render reads.
  - With a pending transition on one source and a sync update on another, the sync commit shows stats that include the transition's data next to readers that don't (§4).
  - Fixing it means putting the sources and the derived value in one store with one reducer, which gives up granularity.
- **Memory:** one value.
- **What the user writes:** a mutable `latest` mirror and a second `update` call in every action that touches a source. The stats for unmounted categories are computed too.
- **API:** none, or a read outside render (see `reading-outside-render.md`, which reaches the same conclusion: a read doesn't make this correct).
- **"No selectors":** fits, but only by moving the work out of React.

### Option 3: userland shared memo (`store-memo`, `store-reselect`)

- **Concurrency:** correct by construction (§4). The snapshots are immutable, and different cuts are different keys.
- **Memory:**
  - Fine when the snapshot arguments are objects (WeakMap).
  - A Map under a long-lived object, or a primitive-only call, grows forever.
  - The cache is module-global, so it's shared across roots, tests and SSR requests. That's fine with WeakMap keys, but surprising.
- **What the user writes:** one line at module scope, `const getShared = weakMemo(getCategoryStats)`, plus a call. It works today with reselect's `weakMapMemoize`.
- **API:** none in React.
- **"No selectors":** good. It memoizes a plain function of values already read with `use()`. Readers still re-render when a source changes. There's no subscription, equality function or input selector.
- **Costs:**
  - Users have to know to do it, and to put snapshot arguments first.
  - Impurity is amplified. A function that reads hidden mutable state (a global locale, `Date.now()`) now returns stale results to newly mounted instances, not just to re-renders of one instance.
  - Result identity is shared across components.

### Option 4: a React-provided client `cache()`

> **Update (2026-10-31): the current state of the client cache.** Client caching was removed from `cache()` in Jan 2024, because "the lifetime of the cache is more complex than on the server" (#27977). `disableClientCache` was then enabled everywhere (#28846), and the unshipped `<Cache>` element was removed (#28698). The `CacheContext`/`getCacheForType` path described below is vestigial code behind that flag, not a design to revive.
>
> The recommendation is therefore a new, decoupled render-scoped root: a `getRenderCache()` on the async dispatcher, reset in `prepareFreshStack`, with no `<Cache>` boundary, `CacheContext` or refcounting. Background:
> - reactwg #53, "Global Memo === Cache" (Seb proposed client `<Cache>` for CPU memoization, with reservations; the thread got stuck on keying);
> - reactwg #72, "Cache without Signals" (`cache(fn, ...args)` with a "render's contextual cache" on the client).

What exists today:
- On the client, `cache` from `'react'` is a no-op. `disableClientCache` is `true` in every channel, and the baseline bundle has `exports.cache = function (fn) { return function () { return fn.apply(null, arguments); }; }`.
- Behind the flag, `ReactCacheImpl.js` is already the same identity trie as `weakMemo` (objects in a WeakMap, primitives in a Map). It stores it in `dispatcher.getCacheForType`.
  - On the client that's `readContext(CacheContext)`: the root's or nearest boundary's `Cache`, which lives until `useCacheRefresh`. It also adds a context dependency on every call.
  - In Flight it's the request's cache, `getCache(request)`, so it's per request.
  - Fizz's `getCacheForType` throws "Not implemented", so turning the client cache on needs a Fizz story.

The three lifetimes:

| Lifetime | Concurrency | Memory | Cross-render hits | Notes |
|---|---|---|---|---|
| Keyed by snapshot identity, stored per root `Cache` (the existing impl) | correct | bounded for snapshot args; primitive-only and long-lived-object paths grow until refresh | yes (a component that mounts later with the same snapshots hits) | identical to option 3, scoped to a root |
| Scoped to a render (cleared in `prepareFreshStack` or at commit) | correct; per root, and nothing outlives the render | bounded by one render's entries, any key type | no, but the per-instance compiler slots cover re-renders of the same instance | can't return a stale result computed before the current render |
| Two generations (current render + last committed) | correct | bounded by two renders' entries | from the last commit only | the middle ground |

- **Measured:** the derivation counts are identical across the three (58 / 68 / 53.4). Timing: see §2.
- **Userland cost:** `store-cache-*` pay for one extra component render per update to rotate the generation. React would rotate at commit for free.
- **What the user writes:** `export const getCategoryStats = cache((posts, comments, category) => ...)`. The same code would run on the server per request.
- **API:** no new export, but new client semantics for an existing one. Today `cache` is documented as server-only (per request), with a client no-op "until a future major". Its client lifetime would differ from the server's, which is worth naming explicitly.
- **"No selectors":** good, for the same reasons as option 3. It is a React-owned version of option 3 with a lifetime React controls.

### Option 5: compiler-emitted shared memoization (`store-compiled-shared`)

**What it would emit.** The real compiler output for `CategoryStats` already wraps the call in a scope keyed on `[category, comments, posts]`. The change keeps that per-instance check and goes to a shared cache only on a miss:

```js
if ($[0] !== category || $[1] !== comments || $[2] !== posts) {
  const stats = _sharedCall(getCategoryStats, posts, comments, category); // was getCategoryStats(...)
  t3 = stats.postCount;
  t5 = stats.avgScore.toFixed(1);
  ...
```

- **Measured:** the same derivations as `store-memo` (58 / 68 / 53.4). That includes routing Tier 2 and Tier 3 (unshared) through the cache, as a pass that can't see cost would. Timing: see §2.
- **Keying:** by callee identity, not callsite. The callee is module-scope, so its identity is stable, and two callsites (or files) that call the same function with the same arguments share. Callsite keys only lose hits.

**Which calls qualify.** The compiler has most of the facts already:
1. **The callee is a module-scope or imported binding** (`LoadGlobal` in HIR). Closures created in render capture reactive values, and their identity changes every render. Methods on reactive objects are out, and so are hooks and `use`.
2. **Every argument is frozen or primitive.** `use()` results, props and hook returns are `ValueKind.Frozen` (`use` is declared with `returnValueKind: ValueKind.Frozen` in `Globals.ts`). Mutable locals (a `[a, b]` literal built in render) have a fresh identity per instance and never hit.
3. **The result isn't mutated after the call.** The result's mutable range ends at the call instruction. If it's passed to something that may mutate it (the default `MutateTransitiveConditionally` for unknown calls) or written to, sharing is unsafe. Today the compiler just grows the scope in that case.
4. **At least one argument is a reactive object, keyed first.** That keeps primitive-only calls (`formatPrice(cents)`) out of an unbounded Map. It doesn't help with long-lived objects, which is why the lifetime matters (below).

**What the existing assumptions already cover and what's new.** `MUTABILITY_ALIASING_MODEL.md` says unknown functions are assumed idempotent, so per-instance memoization already relies on "same arguments, same result". Sharing adds three assumptions, and they are real behavior changes for code that bends the rules today:
- **Across time.** A newly mounted instance gets a result that another instance computed earlier. Per-instance memoization never does that: a fresh instance always computes. Functions that read a mutable global (a locale, feature config, `Date.now()`) go stale for new mounts.
- **Across components.** K components share one result object. Mutating it outside render (in an effect or an event handler) is already a Rules violation, but the blast radius goes from one instance to every reader.
- **Call count.** Side effects inside the function (logging, metrics) run fewer times. Errors need a policy: React's `cache` caches the thrown error, and `weakMemo` doesn't.

**Cost, and the heuristic it forces.** Sharing a call adds 60–80 ns per per-instance miss in Node (§3). In the browser, routing two never-hit callees through the cache cost 70–90 µs per `mixed` update (§2), which is far more than the microbenchmark predicts. A pass therefore has to skip calls that are cheap or never shared. The compiler compiles one file at a time and has no cost model, so I'd layer the rules, cheapest first:

1. **Opt-in beats inference.** If the callee is wrapped in `cache()` (or React's equivalent), the user has already said "expensive and shared". The compiler only needs to keep its per-instance check in front, which costs nothing. This covers imported functions, whose bodies the compiler can't see.
2. **Static cost, for same-module callees only.** The compiler can see the body of a function declared in the same file. Share only if the body does work proportional to an argument's size: a loop, or an array iteration method (`filter`, `map`, `reduce`, `sort`, `forEach`, `find`...) over a parameter or something derived from one. This excludes `getPost(posts, id)` (one property load) and `formatPrice(cents)`. It includes `getCategoryStats`, `getPostsByUser` and `getCommentCount`. Note that it doesn't exclude the last two, which are expensive but never shared here, so cost alone isn't enough.
3. **Likely sharing, from where the arguments come from.** Require at least one object argument that comes straight from `use(...)` or `useContext(...)`, since every reader of that store or context sees the same object in a render. Arguments derived from that object, primitives, and module constants are fine too. Object props, or values built in render, are probably per instance. In this benchmark it separates nothing: `getCategoryStats(posts, comments, category)` passes, and so does `getCommentCount(comments, postId)`. Whether a call hits depends on how many instances pass the same primitive (5–50 per category, but one per `postId`), and only the runtime knows that.
4. **So, an adaptive runtime.** The emitted call goes through a per-callsite cache that counts hits and misses. After N misses (say 64) with a hit rate below a threshold, it permanently switches that callsite to a direct call: one branch, about 1 ns. Here that would turn off `getCommentCount` and `getPostsByUser` (0 hits each) and keep `getCategoryStats` (32 hits per 40 calls at K=5). This is the only rule that handles "expensive but unshared".

My read: rules 2 and 3 are cheap filters, but they can't replace 1 or 4. A default-on pass would need 4, and with 4 the pass becomes a runtime feature that the compiler feeds.

**Lifetime.** A compiler-emitted cache has to live somewhere, and it decides the risk:
- A module-global WeakMap trie (what `sharedCall` does) has every risk above, plus the long-lived-object leak.
- A render-scoped cache provided by React is the safest default for an automatic pass. Entries can't outlive the render, so they can't go stale across time, and memory is bounded with any key types. It's correct per root. It still dedupes all K readers that re-render in the same pass, and that's when they run: they all read the same changed store.
  - It would need a small runtime hook, e.g. `getRenderCache()` on the dispatcher (`ReactSharedInternals.A`, like `cache` uses), reset in `prepareFreshStack`.

### Option 6: derived stores (`store-derived-lazy`, a userland approximation)

**API sketch.**

```js
const categoryStats = createStore([postsStore, commentsStore], (posts, comments) =>
  computeAllCategoryStats(posts, comments),
); // or createDerivedStore(...)
const stats = use(categoryStats)[category];
```

**How it would plug into `ReactFiberStore.js`** (not implemented):
- **Record.** A derived store gets a per-root record like any store. Instead of an update queue, it holds its source records, the source values it last derived from, and the result. Ideally it holds two entries: the last committed result and the current render's.
- **Read.** `readStoreRecord` calls `readStoreRecord` on each source with the same `renderLanes` and `renderSeq`. Those reads are already cached per render (`cachedVersion/cachedLanes/cachedSeq`). If every source value is `Object.is` the cached ones, it returns the cached result. Otherwise it derives once, for this root at this cut.
  - The derived value's skipped lanes are the union of its sources' (`getSkippedStoreLanes`). That keeps DCP-3's "join in-flight transitions" behavior.
  - The derivation runs lazily during render, under the render's lanes. That makes it correct under transitions, which option 2 isn't (§4).
- **Dispatch.** A source dispatch has to schedule the readers of dependent derived records as well as its own (`dispatchStoreUpdate`'s `readers.forEach`). There's no queue to fold at commit. The eager-state trick could compute the derived value at dispatch time when every source queue is empty, and bail out when it's `Object.is` the old one. With object results it never is, so readers re-render, exactly as if they read the sources directly.
- **Lifecycle.** Records are dropped like any other record with no readers (DCP-9).

**Measured:** 8 derivations per update. The approximation computes all 8 categories at once, because a derived store has no parameter. Timing: see §2.

**The honest part:**
- **Parameters push it back toward selectors.** `getCategoryStats(posts, comments, category)` has a parameter, and a derived store can't take a render-time argument. You either derive every category (wasteful when most aren't mounted), or create a family of derived stores keyed by the parameter. A family is a cache of stores, with the same lifetime questions as option 4, plus a store identity per key.
- **It's a selector in a store's clothes.** `createStore(sources, derive)` is a function from store values to a derived value with its own subscription. That is the selector model, without the per-reader equality check.
- **It adds the most API surface of any option:** a new store kind, dependency tracking in dispatch, and DevTools for derived values. The benefit over option 4 is a lifetime tied to records and per-root dedupe, and option 4 gets those from the root `Cache` or a render-scoped cache anyway.

## 6. Recommendation

This is my opinion, separate from the results above.

**1. Drop "compute in the update" (option 2) as a pattern.** It's the fastest variant, but it tears under transitions (§4). No read-outside-render API fixes that, because the derivation runs on the head, not the cut.

**2. Make sharing a React-owned client `cache()` scoped to a render. Leave derived stores and automatic compiler sharing out of v1.**
- **Why a cache.** Options 3–6 all reach the same derivation count, so performance doesn't separate them. Correctness, memory and API cost do.
  - A cache keyed by snapshot identity is correct under concurrency by construction.
  - It adds no new concept to the store API: it memoizes a plain function of values read with `use()`.
  - Readers still subscribe to the sources and re-render, so it doesn't reintroduce selectors.
- **Why scoped to a render.**
  - It matches the server's semantics: per request there, per root render here. "`cache` dedupes calls within a render" is one rule for both.
  - It's correct per root.
  - It bounds memory for any argument types, including primitive-only calls and long-lived objects, which leak under WeakMap keying.
  - It can't return a result computed before the current render, which removes the "stale for new mounts" hazard for impure functions.
  - It costs nothing in hit rate here: all K readers re-render in the same pass because they read the same changed store, and the compiler's per-instance slots still cover re-renders of one instance.
  - Two generations are the fallback if real apps show costly recomputation for components that mount later with unchanged snapshots.
- **What the user writes:** `export const getCategoryStats = cache((posts, comments, category) => ...)`, called in render. The same module works on the server.

**3. Use the compiler as the accelerator, not the decider.** The pass in §5 is feasible: the compiler already knows the callee is module-scope, the arguments are frozen, and the result isn't mutated. It produced the same counts as userland with no user code. Two things argue against turning it on by default:
- The compiler can't tell a 15 µs derivation from a 50 ns one, or a shared call from an unshared one. Blind sharing adds 60–80 ns per per-instance miss in Node. In the browser it cost 70–90 µs per `mixed` update just to route two never-hit callees through the cache (§2). The heuristic that would make it safe ends in an adaptive runtime (§5, rules 1–4).
- Sharing changes the call count and result identity of functions that bend the rules today.

What I'd do instead:
- Ship `cache()`, and let the compiler keep its per-instance check in front of the cache lookup. That's free and already what the compiled `store-memo` does.
- Prototype the automatic pass behind a compiler flag, targeting the same render-scoped runtime with per-callsite adaptive disabling (§5, rule 4). Measure the hit rate and overhead on a real app before deciding. That's the experiment that tests Ricky's instinct at scale; this benchmark can't, because it has one expensive shared derivation and nothing cheap.

**4. Derived stores (option 6): not now.** They're the most API (a new store kind, dependency scheduling in dispatch, DevTools). They can't take a render-time parameter without becoming a family of stores, which brings back the same cache-lifetime questions, and they read as selectors. A render-scoped `cache()` gives the same per-root, per-cut dedupe.

**What Ricky should decide:**
1. Whether cross-component sharing is React's job (a client `cache()`) or userland's (document `weakMapMemoize` / `weakMemo`). Userland works today, and §2 shows it performs the same.
2. If React's job: the lifetime. My order is render-scoped, then two generations, then the existing identity-keyed root `Cache`. Also whether reusing the name `cache` with a client lifetime is acceptable, or it needs a new name. Turning on the client cache also needs a Fizz implementation (`getCacheForType` throws there today).
3. Whether to fund the compiler experiment (an automatic, render-scoped, flag-gated pass), and on which app.
4. Whether to close the door on derived stores for v1.

Before quoting any timing number, run the quiet re-run in §7.

## 7. Files and commands

New files (nothing in `packages/`, `build/`, the compiler, `src/shared/` or the existing variants was changed):

- `fixtures/store-bench/src/redux-suite/derived-selectors/shared-memo.js`: `weakMemo`, `sharedCall`, `generationalMemo` and `nextGeneration`.
- `fixtures/store-bench/src/redux-suite/derived-selectors/apps/`: `store-memo.jsx`, `store-reselect.jsx`, `store-cache-gen.jsx`, `store-cache-render.jsx`, `store-derived-lazy.jsx`, `store-compiled.jsx` (generated), `store-compiled-shared.jsx` (the generated file plus 3 edits marked `SHARED`) and `store-compiled-shared-site.jsx` (the same with per-callsite caches).
- `fixtures/store-bench/spike-shared-derived/`: `compile.mjs`, `concurrency.mjs`, `memory.mjs`, `lookup-cost.mjs` and `summarize.mjs`.

Additive changes to the derived-selectors suite (the default suite, scenarios and commands behave the same):

- `constants.js`: `TIER4_COUNT` is now `let`, and `setReadersPerCategory(k)` is added. The default is still 40.
- `scenarios.js`: generated `<scenario>-k20` and `-k50` entries.
- `harness.jsx`: sets K before each mount from `scenarios[name].k`.
- `suites.mjs`: a new `derived-selectors-spike` suite.

Commands (from `fixtures/store-bench`):

```
# DOM identity and derivation counts
node build.mjs --suite=derived-selectors-spike --react=react-builds/baseline --count --out=dist-spike-count
node run-jsdom.mjs --suite=derived-selectors-spike --dist=dist-spike-count
BENCH_BROWSER=<headless shell> BENCH_SINGLE_PROCESS=1 \
  node run.mjs --verify --suite=derived-selectors-spike --dist=dist-spike-count

# Timing: the reduced run reported in §2 (contended)
node build.mjs --suite=derived-selectors-spike --react=react-builds/baseline --out=dist-spike
BENCH_BROWSER=<headless shell> BENCH_SINGLE_PROCESS=1 \
  node run.mjs --suite=derived-selectors-spike --dist=dist-spike --label=spike-reduced \
  --compiler=on --throttle=1 --restarts=1 --iterations=100 --warmup=30 \
  --variants=redux,store,store-derived,store-memo,store-cache-gen,store-compiled-shared,store-derived-lazy \
  --scenarios=score,score-k50,comment,comment-k50,mixed,mixed-k50

# The option 5 / mixed follow-up (2 restarts)
BENCH_BROWSER=<headless shell> BENCH_SINGLE_PROCESS=1 \
  node run.mjs --suite=derived-selectors-spike --dist=dist-spike --label=spike-callsite \
  --compiler=on --throttle=1 --restarts=2 --iterations=100 --warmup=30 \
  --variants=store-memo,store-compiled-shared,store-compiled-shared-site --scenarios=mixed,comment
```

**Quiet re-run** (the full matrix: all 12 variants, the K=5/20/50 versions of all 4 scenarios, 1× and 4× CPU, 3 restarts; about 3.5 h at load 30, likely much less on a quiet machine):

```
node build.mjs --suite=derived-selectors-spike --react=react-builds/baseline --out=dist-spike
BENCH_BROWSER=<headless shell> BENCH_SINGLE_PROCESS=1 \
  node run.mjs --suite=derived-selectors-spike --dist=dist-spike --label=spike \
  --compiler=on --throttle=1,4 --iterations=100 --warmup=30 --restarts=3
node spike-shared-derived/summarize.mjs results/smoke-spike-<timestamp>.json
```

Also profile `store-memo` vs `store-compiled-shared` on `mixed`, to explain the option 5 gap in §2.

`<headless shell>` is `/Users/rickhanlonii/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`. Chrome has to run outside the sandbox. Results: `results/smoke-spike-reduced-1793397258101.json`, `results/smoke-spike-mixedcheck-1793397286299.json` and `results/smoke-spike-callsite-1793397337063.json`.

```
# Concurrency, memory and lookup cost
node spike-shared-derived/concurrency.mjs
NODE_ENV=production node --expose-gc spike-shared-derived/memory.mjs
NODE_ENV=production node spike-shared-derived/lookup-cost.mjs

# Regenerate the compiled control
node spike-shared-derived/compile.mjs src/redux-suite/derived-selectors/apps/store.jsx
```

The default suite still works as before: `node run-jsdom.mjs --suite=derived-selectors --dist=<a derived-selectors count build>` runs the original 4 variants and 4 scenarios.

## 8. Profile: why `store-compiled-shared` is slower than `store-memo` on `mixed`

Run against `react-builds/final`, `mixed` at K=5, 1× CPU. Files: `profile.mjs --suite=derived-selectors-spike` (unminified bundles in `dist-prof-spike`) and `run.mjs` on the minified `dist-spike-final`.

- **The gap depends on how long the page has run.** Means in ms per update, minified bundles, two runs each:

  | warmup steps | store-compiled-shared | store-memo |
  |---:|---:|---:|
  | 30 (the spike's setting) | 0.344, 0.340 | 0.272, 0.282 |
  | 200 | 0.320, 0.318 | 0.254, 0.245 |
  | 1000 | 0.257, 0.258 | 0.310, 0.315 |

  - `store-compiled-shared` gets faster the longer it runs.
  - `store-memo` doesn't. Its runs are close to each other, but every `mixed` step adds comments, so the derivations themselves get more expensive.
  - At 1000 steps the order flips. The unminified bundles show the same 60–80 µs gap at 30 steps, so minification isn't the cause.
- **Where the time goes in steady state.** The profile ran 100 warmup steps, then 200 samples:
  - The profiled medians were 0.310 vs 0.290 ms, about 20 µs apart. The extra time is in the unshared derivations that `sharedCall` routes through the global cache:
    - `getCommentCount` self time: +12 µs;
    - `getNode` and `sharedCall`: +5 µs;
    - GC: +1.3 µs.
  - The derivation count is the same as `store-memo` (§2), so this isn't extra derivation work. It's the cost of each lookup.
- **Why a lookup costs more than the per-instance memo it replaces:**
  - `PostWithComments` and `UserPostList` already guard the call with the component's memo cache (`$[0] !== postId || $[1] !== t1`). So `sharedCall` only runs when the snapshot changed, and then it always misses: no other component asks for the same `(fn, snapshot, id)`.
  - Each miss costs:
    - an extra `WeakMap` level keyed by the callee;
    - a `WeakMap.get`/`set` on the new snapshot;
    - a new `Map` per snapshot node, plus `Map.set` for the id;
    - two node allocations;
    - `Array.prototype.slice.call(arguments, 1)`;
    - `fn.apply`.
  - The new snapshot keys also leave ephemeron entries in the WeakMaps for the GC to clear.
  - `getNode` loops over `arguments` with a type check per argument, so it's polymorphic and needs more steps to reach optimized code. That accounts for the larger gap at 30 warmup steps.
- **Conclusion.** About 20 µs per update (around 7%) is a real cost: unshared calls go through a global cache and miss on every change. The rest of the 70–90 µs in §2 is warm-up, and it shrinks or reverses with more steps.
  - A compiler pass should only route calls through the shared cache when more than one component or call site can ask for the same arguments (§5's heuristic). In this app that means `getCategoryStats`.
  - The quiet matrix in `results/smoke-spike-final-*` used 30 warmup steps, so its `store-compiled-shared` numbers include the warm-up cost.
