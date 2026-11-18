# A signals-expert review of use(store) and derived-data option B

2026-10-31. A role-played review, not a real person's opinion. A subagent was
prompted to argue from the public positions of the fine-grained-reactivity
community (Solid, the TC39 Signals proposal, Preact, Vue and Angular
signals), with no fabricated quotes. It read DESIGN.md, DECISIONS.md, the
shared-derived-data material, selection-floor.md, the benchmark caveats and
`ReactFiberStore.js`. This doc is two rounds of review plus my pushback,
condensed.

"Option B" is the dependency-tracked cache proposal:
- `use(store)` inside a `cache()`d function records the store on the cache
  entry. Components read entries through `use(handle)`, for example
  `use(isSelected(id))`.
- A store update decides, per entry, whether the value changed, and only
  re-renders the readers of changed entries. That decision is made eagerly at
  dispatch when no other updates are queued, and lazily at render otherwise.

## The framing

> use(store) is a signals system with coarse granularity. Stores are writable
> atoms, `use()` auto-tracks dependencies (dynamic and conditional), and
> components are the only computation.

The weakness is that equality cutoff exists only at the source (the eager
`Object.is` bailout) and at the leaf (the compiler memo), with nothing in
between. That's exactly what `selection-floor.md` measures. **Option B is the
missing middle node: a computed signal.** The expert recommends naming it
that. React's old "no selectors" argument targeted user-written selectors that
subscribe outside render and duplicate render logic. Handles are evaluated in
render, at a consistent cut, and can be read conditionally.

## Benefits it credited

- **Consistent cuts with forked state.** Most signals libraries read the
  latest value synchronously and tear under concurrent rendering. The TC39
  proposal leaves async and transitions out of scope, and forked transition
  state is hard, ongoing work elsewhere. Per-root lane queues with rebasing give
  every store one cut, with no tearing. "A real advance over typical signals
  implementations."
- **Async-aware reactivity without new primitives.** Async actions suspend
  readers, and Suspense boundaries subscribe to the reads of their suspended
  children (DCP-16).
- **No zombie children or stale props,** because everything evaluates inside
  render.
- **Mutation-free forking,** paid for by reducer replay.

## Critiques that held up after pushback

1. **Dependencies per cut are mostly solved by existing machinery.** The
   expert's top round-1 worry: an entry evaluated at a transition cut can
   read different stores than at the committed cut.
   - It agreed after checking the code: a render never subscribes;
     subscriptions change only at commit (DCP-8); missed updates are caught up
     by marking pending lanes on subscribe (DCP-15); and an abandoned
     transition never subscribes.
   - Entries reuse this, with deps per (entry, root) evaluation.
2. **The cutoff baseline must be per reader, not per entry.** This is a
   correctness bug in my sketch. The interleaving:
   1. `E = isSelected(3)`. R1 is visible, and R2 is in a hidden Activity.
   2. An urgent `select(3)` flips E. R1 commits `true`, and R2 is deferred.
   3. If re-render lite compares E's value at the cut with the *entry's* last
      committed value, it skips R2, which still shows `false`, and revealing
      the Activity tears.

   Fix: store `(entry, value)` pairs on the fiber, like `storeReads`, and
   compare against what each fiber rendered. It's the same idea as DCP-13,
   one level up.
3. **Swap entry deps at the root's commit, not when a reader commits.** Under
   B, unchanged readers are skipped and commit no work. Swap per (entry, root)
   whenever the committing render evaluated the entry, like
   `commitStoreRecords`.
4. **DCP-16 has to collect entries.** A reader that suspends behind
   `use(handle)` must subscribe its boundary to the entry or its deps, or B-18
   comes back.
5. **The eager path must abort to lazy.** Dependencies are dynamic, so it only
   finds out mid-evaluation whether a store it reads has a non-empty queue. It
   has to abort on a non-empty queue, a suspend or a throw, and it must never
   throw at the dispatch site (DCP-14). Use one mode per propagation, never a
   mix within an entry chain.
6. **Values are per root.** Entry values are keyed by (root, cut), not only by
   (fn, args).
7. **Ownership.** Entries hold upstream subscriptions only while a committed
   reader holds them, refcounted in the insertion effect, and are evicted at
   zero. That also bounds the memory of primitive-keyed families.
8. **A correction to my numbers.** I claimed B costs about 5 ns per row on
   selection. That's only true on the **eager** path, where 2 fibers are
   marked.
   - On the **lazy** path every reader is still marked and visited (about
     28 ns for the visit plus 12 ns for marking, per the profile), so it lands
     around 60–80 ns per row against Zustand's 119.
   - **The eager path is where the selection win is.**
9. **Object results degrade B to A** under `Object.is`. Idioms, best first:
   1. return ids or primitives;
   2. per-field handles;
   3. structural sharing at the source.

   A filtered list of ids is the case none of them covers, which is why
   Zustand ships `useShallow`. The expert revised its view: **opt-in `equals`
   on the handle only**, never per read.

## Points that change the pitch

- **Re-render lite doesn't need the compiler.** The skip decision comes from
  entry values in the runtime. An *uncompiled* row whose reads all go through
  handles doesn't re-run, which shrinks the 3–10× partial-coverage cliff
  exactly where it bites: fan-out lists.
- **Handles are a fan-out tool, not the primary API.** The Solid lesson is
  that plain derived functions are the default and `createMemo` is for fan-out
  or expensive work. "Memo everywhere is an anti-pattern." Handle-everything
  costs nodes, keys, per-root values and refcounts on cold paths, and churns
  entries when object args come from props. Guidance: "fan-out reads go
  through a handle". A lint or compiler hint could suggest it for `use(store)`
  in list items.
- **The keyed index (Solid `createSelector`, O(changed)) isn't needed yet.**
  It matters at 10k+ rows with high-frequency changes (keyboard navigation,
  hover, drag), or when the eager path is unavailable because a transition is
  pending. Gate it on a 10k-row run with a pending transition.
- **No derived reads outside render.** A handler wants either "what I showed",
  which the render closure has at the right cut, or "what will be true after my
  write", which is an action or updater that applies at the head and rebases.
  If a read is forced, use a committed `peek(root)`, never the head. Forked-state
  designs make out-of-scope reads see the settled world.
- **TC39 interop only at the edges.** A `Signal.Computed` has one value in one
  world, so it can't sit underneath per-(root, cut) evaluation. Borrow the
  algorithm instead (pull-validation with versions, as TC39, Preact and
  Angular do). A `Signal.State` can feed a store through a `Watcher`. Open
  question: does notify pick up the ambient transition lane?

## Its updated recommendation

1. Ship `use(cache(fn)(args))` with **A's semantics** (memoization only) now.
   The handle is the hinge: B can land later with no API change.
2. Build B as push-pull:
   - mark dirty on dispatch, with no evaluation;
   - pull-validate at the render's cut, with a per-reader baseline;
   - dep sets per (entry, root), swapped at root commit;
   - committed readers own subscriptions;
   - DCP-16 extended to entries.
3. Invest in the **eager path** (it's where the selection win is). Gate a
   keyed index on a 10k-row run with a pending transition.
4. `Object.is` by default, opt-in `equals` on handles only. Teach ids,
   per-field handles and structural sharing.
5. Position handles as the fan-out tool. Pitch re-render lite as the runtime
   answer to the compiler cliff. No derived reads outside render.

## Its three hardest questions

1. Who owns and releases deps picked up only at a transition cut?
   **Answered:** commit-time subscription plus catch-up. The open part is the
   per-reader baseline and swapping at root commit.
2. Does B stop at Zustand parity, or add keyed indexing? What does B buy over
   A otherwise? **Partly answered:** components stop re-running, and re-render
   lite removes the compiler dependence for fan-out lists.
3. What fraction of real Meta surfaces is compiled today? The coverage cliff
   depends on it. **Open; needs data.**

## Prior art in React: option B has been tried before (added 2026-10-31)

Option B is the same idea as context selectors, which React has tried twice.

- **acdlite, "[Experiment] Context Selectors" (facebook/react#20646, 2021,
  closed unmerged).** `useContextSelector(Context, c => c.field)`. Selectors
  were cheap subfield reads called "during the propagation scan", so React
  could "bail out really early, without having to visit the component during
  the render phase". It returned the full context, to discourage derived
  values inside selectors.
- **Jack Pope, `unstable_useContextWithBailout` (#30407, Jul 2024).** A compare
  function returning an array, checked during lazy context propagation. It was
  a proxy for compiler-driven context selectors (reactwg #322). **Removed in
  #31806 (Dec 2024): "inconclusive. Since most of our performance critical
  usage is already optimized, we weren't able to find a clear win."**
- **acdlite, tweets (Dec 2023).** "Allow you to call use(context) inside of
  useMemo. Then the whole memo function acts as a 'selector'", with React
  skipping the render when the memo result is unchanged. This was never
  implemented.

How B differs:

- **Entries can be evaluated without running the component.** They're
  module-level `cache()` functions plus args. A `useMemo` inside a component
  can't be evaluated without running the component, because hooks are
  ordered.
- **Entries are shared across components,** so they also solve the
  derived-data problem.
- **Store dispatch already has a readers set,** so no tree-walking
  propagation is needed.
- **But the eager check needs the empty-queue guard** to stay consistent
  under transitions. A context selector checks the value being rendered,
  which is consistent by construction.

The lesson from #31806: pre-render bailouts must prove a win on real apps, not
synthetic fan-out. That supports shipping A first and gating B on real-app
data.

### reactwg #171 and #296: the team's stated positions

- **#171, "What To Do About Context Selectors" (Joe, Jun 2023).**
  - Reasons not to ship selectors: new objects negate the benefit; logic
    migrates into selectors; Forget will solve it.
  - Joe's option 2 was "subscribable contexts… basically signals, but… plays
    nice with concurrent mode". **use(store) is that primitive.**
  - Andrew: "allow hooks inside useMemo… basically selectors", and "In a
    Forget world, every reactive expression should act like this."
  - Seb: the useMemo approach "would solve both issues at once", including
    Jordan's.
- **#296, "RCP: Optimizing Context Access" (Jack, Jul 2024).** Compiler-only
  context selectors.
  - Seb: "selectors just didn't make sense".
  - Sophie: why would it be faster than the post-Forget body, which already
    skips most logic? Also: "enabling abstraction".
  - Dan: it makes `useContext(Foo)` faster than `useFoo()` and penalizes
    custom Hooks; "the useMemo proposal solves that problem".
  - It became the `useContextWithBailout` experiment, which was inconclusive
    (#31806).

**Implications:**
- **Sophie's question is answered by our selection-floor data.** "Skip children
  after the body runs" is already what compiled use(store) does (about
  150 ns per row). A `useMemo` with hooks inside the component can't be
  evaluated without running the component, because hooks are ordered, so it
  would deliver about the same. The extra win needs the derivation to be
  evaluable outside the component: module-level `cache()` entries (B), or
  compiler-hoisted ones.
- **B passes Dan's custom-Hook test.** Handles work inside custom Hooks and
  can call each other, which covers layered abstraction.
- **B partly inherits the "new objects negate it" concern** (`Object.is`
  cutoff).
- **Pitch B to the team as** "Andrew's useMemo-with-hooks idea, made evaluable
  without running the component", and ask Seb directly whether general,
  parameterized derived computations escape "selectors just didn't make
  sense".
