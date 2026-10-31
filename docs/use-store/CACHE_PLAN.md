# Plan: a render-scoped client `cache()`

Status: plan only, not implemented. Implements decisions D1–D3 in
`NEXT_STEPS.md` (option A for shared derived data). Background:
`shared-derived-data.html`, `research/shared-derived-data.md` and
`research/signals-review.md`.

## Goal

Make `cache(fn)` on the client dedupe calls **within a render**, so K
components that derive the same value from the same store snapshots compute it
once:

```js
const getStats = cache(computeStats);

function CategoryStats({category}) {
  const posts = use(postsStore);
  const comments = use(commentsStore);
  const stats = getStats(posts, comments, category); // computed once per render per args
  ...
}
```

The server semantics stay as they are ("dedupe within a request"). The client
gets the analogous rule: **dedupe within a render**.

### Non-goals (this plan)

- **Option B,** dependency-tracked entries that skip readers. It's a separate,
  later experiment (`NEXT_STEPS.md` §4).
- **The handle form** (`use(family(args))` with `use()` inside the cached
  function). That's phase 3, sketched at the end, and needs a decision first.
- **Data fetching on the client.** Async functions are deliberately out of
  scope for v1 (see "Async functions").
- **Reviving `<Cache>`, `CacheContext` scoping, refresh or the cache pool.**

## Current state (verified in code)

- **`packages/react/src/ReactCacheClient.js`:** `cache` is `noopCache` when
  `disableClientCache` (it's `true` in every fork), otherwise `cacheImpl` from
  `ReactCacheImpl.js`.
- **`packages/react/src/ReactCacheImpl.js`:**
  - the identity trie (status, value, a WeakMap for objects, a Map for
    primitives);
  - errors are cached (`ERRORED`);
  - the root comes from `ReactSharedInternals.A.getCacheForType(createCacheRoot)`;
  - with no dispatcher, it calls `fn` directly.
- **Async dispatchers.** All three implement the `AsyncDispatcher` type
  (`ReactInternalTypes.js`: `getCacheForType`, `cacheSignal`, and DEV
  `getOwner`).
  - **Fiber** (`react-reconciler/src/ReactFiberAsyncDispatcher.js`):
    `getCacheForType` reads `CacheContext`.
  - **Fizz** (`react-server/src/ReactFizzAsyncDispatcher.js`):
    `getCacheForType` throws "Not implemented".
  - **Flight** (`react-server/src/flight/ReactFlightAsyncDispatcher.js`): a
    per-request map (`getCache(request)`).
- **Where the Fiber dispatcher is set:** `ReactSharedInternals.A` is set only
  during render, through `pushAsyncDispatcher()`/`popAsyncDispatcher()` in
  `renderRootSync` and `renderRootConcurrent` (`ReactFiberWorkLoop.js`). Fizz
  sets it in `performWork` (`ReactFizzServer.js`).
- **The `CacheContext` path is still used.** The DevTools frontend
  (`react-devtools-shared/src/inspectedElementCache.js`) calls
  `unstable_getCacheForType`, and `useCacheRefresh` relies on it. **Don't delete
  it.**
- **Fizz uses the client build of `react`.** Shared components rendered by Fizz
  get the client `cache`, so Fizz needs the new mechanism too. Flight uses
  `ReactCacheServer` (the `react-server` condition), which is unchanged.
- **`cache` is exported from stable `react` (`index.js`).** #27977 promised
  client caching "in a future major release", so the new behavior must be
  flagged and must not change stable until then.

## Design

### Semantics

1. **Key:** `(fn, ...args)` by identity, using the existing trie, unchanged.
   It's correct under concurrency because store values are immutable snapshots
   and every component in a render reads the same snapshot at one cut.
2. **Lifetime: one render of one root.**
   - The cache is created when a render starts (`prepareFreshStack`) and
     survives yields and resumes of that render.
   - It's dropped when the render restarts (the next `prepareFreshStack`) or
     commits.
   - Separate renders never share: a sync render that interrupts a
     transition, an Offscreen or hidden pre-render pass, a Suspense retry, or
     another root.
3. **Outside render** (no dispatcher: event handlers, effects, module scope),
   it calls `fn` directly. That's the existing behavior, now documented.
4. **Errors:** cached for the lifetime of the cache, like the server. Every
   caller in that render gets the same error, and the next render recomputes.
5. **StrictMode (DEV):** the second render pass is part of the same render,
   so it would always hit the cache and never double-invoke `fn`. Decision
   needed: invoke `fn` twice on a miss in StrictMode, matching `useMemo`'s DEV
   double-invoke (**recommended**), or don't.
6. **`cacheSignal()` on the client** returns `null` in v1. A render-scoped
   cache has no meaningful abort lifetime for users.

### Async functions: the main design risk

`use(cache(fetchUser)(id))` with a render-scoped lifetime can loop forever.
1. The render suspends on promise P.
2. A fallback commits.
3. The retry is a new render with a fresh cache, so it creates promise P′ and
   suspends again.

React already detects this pattern (`ReactFiberThenable.js`, "suspended by an
uncached promise"). Options:
- **(a) Recommended for v1:** in DEV, warn if a cached function returns a
  thenable on the client: "cache() on the client is for synchronous derived
  data; use a data library or pass promises from the server." No behavior
  change in prod.
- **(b)** Carry the render cache over to retries of the same lanes (a
  per-lanes pool, like the old suspended-transition cache pool) until those
  lanes commit without suspending. This brings back the complexity #27977
  removed.
- **(c)** Two generations (phase 2), where a committed fallback's cache
  becomes the "previous" generation for the retry. This only partly helps.

**Decision needed:** (a) now, and revisit async with the data-fetching story.

### Where the cache lives

- Add `renderCache: CacheRoot | null` to `FiberRoot` (`ReactFiberRoot.js`,
  `ReactInternalTypes.js`).
- In `prepareFreshStack(root, lanes)`, set
  `root.renderCache = null`. It's created lazily on the first `cache()` call,
  so renders that never call `cache()` don't allocate.
- In `commitRoot`, after the commit is applied, set `root.renderCache = null`.
  (In phase 2, move it to `root.committedRenderCache` instead.)
- Rendering happens on one root at a time, and switching roots goes through
  `prepareFreshStack`. So the dispatcher can read the current root from the
  work loop's `workInProgressRoot`.
  - To avoid a circular import, keep a module-level `currentRenderCacheRoot`
    in a small new module, `ReactFiberRenderCache.js`, set and cleared by the
    work loop. Or export a getter from the work loop, the way
    `getWorkInProgressRoot` already is.

### Dispatcher API

- Add `getRenderCache(): WeakMap<Function, CacheNode<mixed>>` to the
  `AsyncDispatcher` type.
  - **Fiber:** returns `root.renderCache`, creating it if it's null, for the
    root being rendered.
  - **Fizz:** returns a per-request `WeakMap`, stored on the request and
    created lazily. A per-request cache is the server-rendering equivalent of
    one render. Suspense retries within a request share it, which avoids the
    async loop on the server.
  - **Flight:** not needed, since it uses `ReactCacheServer`. Implement it as
    the request cache anyway, for type completeness.
  - **`react-suspense-test-utils`:** add a stub.
- **`getCacheForType` is unchanged** (CacheContext on Fiber, throws on Fizz),
  for DevTools and `useCacheRefresh`.

### The client `cache` implementation

- Add `ReactCacheClientRender.js`, or a parameterized `ReactCacheImpl`. It's
  the same trie walk, but it gets its root from `dispatcher.getRenderCache()`
  instead of `getCacheForType(createCacheRoot)`. Factor the walk out of
  `ReactCacheImpl.js` into a shared helper, so server and client can't drift.
- In `ReactCacheClient.js`:
  ```js
  export const cache = enableRenderScopedClientCache
    ? renderScopedCache
    : disableClientCache
      ? noopCache
      : cacheImpl;
  ```
- Add the DEV-only thenable warning and StrictMode double-invoke from the
  semantics above.

### Flags

- **New:** `enableRenderScopedClientCache`.
  - OSS: `__EXPERIMENTAL__`.
  - www: `__VARIANT__`, to test both paths.
  - RN and test renderers: `false` to start.
  - Add it to every fork in `packages/shared/forks/`.
- `disableClientCache` keeps meaning "the old CacheContext implementation is
  off". The new flag takes precedence when it's on.

## Implementation steps

Each step lands with its tests.

1. **Factor the trie walk.** `ReactCacheImpl.js` gets a shared
   `getCacheNode(root, fn, args)`. Server behavior must be byte-for-byte the
   same (run the Flight and server suites).
2. **Add the flag** to all forks, with `__VARIANT__` on www.
3. **Change the `AsyncDispatcher` type,** and implement `getRenderCache` on
   Fiber, Fizz, Flight and the suspense test utils.
4. **Fiber render cache:**
   - add `root.renderCache`;
   - reset it in `prepareFreshStack`;
   - clear it in `commitRoot`;
   - add the getter for the dispatcher.
5. **Client `cache`:** the render-scoped implementation, the switch in
   `ReactCacheClient.js`, the DEV thenable warning, and StrictMode
   double-invoke (once decided).
6. **Fizz per-request cache:** store it on the request, and make sure it's
   released when the request completes or aborts.
7. **Docs:** update the `cache` JSDoc comment in `ReactCacheClient.js`, and
   `DECISIONS.md` (a new DCP).

Estimated size: about 80–150 lines of source plus tests. Most of it is plumbing
the dispatcher method through 4 implementations.

## Tests

New `packages/react-reconciler/src/__tests__/ReactClientCache-test.js`, plus a
DOM/Fizz file. All gated on `enableRenderScopedClientCache`.

| Behavior | Test |
|---|---|
| Dedupe across components | K components call `getStats(a, b, x)` in one render, so `fn` runs once per distinct args |
| Identity keys | New snapshots give new entries; the same snapshot plus a different primitive gives a separate entry |
| Fresh per render | Re-rendering after a store update recomputes; nothing carries over after commit |
| Interrupted transition | A transition render yields; a sync update commits (its own cache); the transition restarts with a fresh cache; every commit matches direct computation |
| Yield and resume | A render that yields and resumes (no restart) keeps its cache: `fn` isn't called again |
| Two roots | The same snapshot read by two roots computes once per root |
| Outside render | Calls in event handlers and effects aren't cached |
| Errors | One throw is shared by every caller in a render; the next render retries |
| StrictMode | Matches the chosen double-invoke behavior |
| Thenables | DEV warning when the cached function returns a thenable on the client |
| Hidden or Offscreen pre-render | A separate render, so a separate cache |
| Fizz | A per-request cache shared across the request's Suspense retries; isolated between requests |
| Hydration | Calls during hydration are cached for that render |
| Flag off | `cache` behaves as today (noop on the client) |
| Server unchanged | Existing Flight and server cache tests pass unchanged |
| Memory | A long-lived object plus changing primitives doesn't grow across renders (the cache is dropped per render) |

Run the full `yarn test` on 4 channels, plus `yarn flow dom-node` and
`yarn linc`.

## Benchmarks

- Add a `store-cache-real` variant to the `derived-selectors-spike` suite,
  using the real `cache` from `react`, next to `store-cache-render`, the
  userland stand-in that's already measured.
- **Expect** about the same derivation counts (8 per update at any K) and
  timing within noise of the stand-in. The stand-in rendered one extra
  component per update to rotate generations, which the real API doesn't need.
- Run it gated on load, interleaved, with 3 restarts, at K = 5/20/50 and
  1×/4× CPU. Add it to the report's spike table.

## Phase 2 (optional): two generations

Only if real apps show costly recomputation for components that mount after
the commit with unchanged snapshots.
- In `commitRoot`, move `root.renderCache` to `root.committedRenderCache`
  instead of clearing it.
- On a miss in the current cache, check the committed generation before
  calling `fn`, and copy the hit forward.
- This partly helps async retries (option (c)).
- Tests: a later mount hits the previous generation; memory is bounded by two
  renders.

## Phase 3 (needs D3): the handle form

```js
const categoryStats = cache(category => {
  const posts = use(postsStore);
  const comments = use(commentsStore);
  return computeStats(posts, comments, category);
});
const stats = use(categoryStats(category));
```

- **Handles:** `categoryStats(category)` returns a stable handle per key.
  `use(handle)` evaluates it through the render cache.
- **Dependency recording:** while a cached function runs, `useStore` records
  reads on the entry. On a hit, those reads are replayed into the calling
  fiber's `storeReads`, so it subscribes as if it had called `use()` itself.
- **Slotless reads only inside a cached function:** a dispatcher switch makes
  `useState` and `use(promise)` throw. `use(context)` is allowed, but its value
  is validated on lookup, since contexts differ per subtree.
- **Handle lifetime:** refcounted by committed readers, evicted at zero. That
  bounds primitive-keyed families.
- **DCP-16:** a reader that suspends behind a handle subscribes its boundary
  to the entry's stores.
- **Compiler and lint:** handle creation is memoized by argument (valid);
  `use(handle)` stays reactive; lint must allow `use()` inside `cache()`d
  functions.

This is the API shape that option B would build on later, with no user-facing
change.

## Risks and open decisions

1. **Async functions** (above). Recommend the DEV warning for v1.
2. **StrictMode double-invoke:** recommend matching `useMemo`.
3. **Naming:** keep `cache` (one rule, "dedupe within a render/request", on
   both server and client), or a new export? Recommend keeping `cache`.
4. **Stable:** client semantics change only behind the flag and in a major
   (the #27977 promise). Experimental and www first.
5. **The compiler idiom:** `getStats(use(a), use(b), x)` written inline isn't
   memoized per instance today (scope flattening). The render cache still
   dedupes across components, but the per-instance check is lost. Fix the
   compiler (`NEXT_STEPS.md` §5.1) before documenting the inline form; until
   then, teach hoisted reads.
6. **Fizz memory:** the per-request cache must be released when the request
   completes or aborts. A test covers it.
7. **Interaction with `getCacheForType`:** the two are independent. Make sure
   DevTools' `inspectedElementCache` still works (run the DevTools suite with
   the flag on).
