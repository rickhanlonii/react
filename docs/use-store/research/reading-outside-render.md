# Should a store be readable outside render?

Research for Ricky, 2026-10-30. The question is whether `createStore` + `use(store)` should have a public read outside render: in event handlers, actions, effects, or other stores' updates.

Sections 1 to 3 summarize the sources. Section 4 is my recommendation, and it's kept separate.

## Sources read

- **reactwg/react discussions:** [#52](https://github.com/reactwg/react/discussions/52), [#56](https://github.com/reactwg/react/discussions/56), [#74](https://github.com/reactwg/react/discussions/74), [#109](https://github.com/reactwg/react/discussions/109), [#140](https://github.com/reactwg/react/discussions/140), [#171](https://github.com/reactwg/react/discussions/171), [#251](https://github.com/reactwg/react/discussions/251), [#322](https://github.com/reactwg/react/discussions/322), [#362](https://github.com/reactwg/react/discussions/362), [#387](https://github.com/reactwg/react/discussions/387), [#403](https://github.com/reactwg/react/discussions/403), [#416](https://github.com/reactwg/react/discussions/416), [#420](https://github.com/reactwg/react/discussions/420). I fetched these in full, with every comment and reply.
- **Skimmed, nothing relevant:** #53, #57, #72, #112, #119, #127, #154, #155, #186, #389, #421, #422. I found them by searching for "store", "getState", "getSnapshot", "outside render", "concurrent store", "useSyncExternalStore", "mutable source", "createStore", "useStore", "event handler" and "latest value".
- **PRs:**
  - [react/react#33215](https://github.com/react/react/pull/33215) (the skeleton). It has a body, three type-level review comments from nmn, one naming comment from gaearon, and nothing about reads.
  - [react/react#35449](https://github.com/react/react/pull/35449) (Jordan's `useStore`/`createStore` RFC PR). captbaritone mentions it in #403. It has a body and community comments, but no review comments.
- **Code:**
  - [thejustinwalsh/react-concurrent-store](https://github.com/thejustinwalsh/react-concurrent-store): `main`, the `experimental/` package, and open [PR #26](https://github.com/thejustinwalsh/react-concurrent-store/pull/26).
  - Gists [7c794c5f](https://gist.github.com/captbaritone/7c794c5fed648b75e74948e62e7d086f) (the store) and [a8f5668e](https://gist.github.com/captbaritone/a8f5668e49393c5eb380a89663818182) (its tests).
- **Jordan's Google Doc,** "[Draft Proposal] Global State + Concurrent Features Proposal" ([link](https://docs.google.com/document/d/1iHXtERCQtucbPtovbwbDeUXxBfLB6hRWlpLrOa9vhmw)). I read it with `meta google.docs get`, including the 12 comment threads.
- **Background:** the [React Labs post](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more#concurrent-stores) and the [useMutableSource RFC](https://github.com/reactjs/rfcs/pull/147).
- **This branch:** `docs/use-store/DESIGN.md`, `DECISIONS.md`, `OVERNIGHT.md`, `packages/react/src/ReactStore.js`, `packages/react-reconciler/src/ReactFiberStore.js`, and `fixtures/store-bench/src/redux-suite/derived-selectors/apps/store-derived.jsx`.

**Headline:** no source decides the question. No thread is titled "read a store outside render". The positions below come from statements made while discussing other things. Each one is marked **explicit** if it directly addresses reading outside render, or **adjacent** if it's a principle that bears on it.

---

## 1. Positions

### Core team

**A. Reads should go through `use()` in a React scope (Sebastian; adjacent, but consistent over four years).**

- In [#140](https://github.com/reactwg/react/discussions/140), Signals (sebmarkbage, 2023-02-21), Seb says he dislikes Solid's out-of-scope reads:
  > "One thing that I dislike about signals as implemented in Solid is that you can read them outside of a reactive scope and then they're subtly not reactive. … The reason we went with use(…) is so that the unwrapping is limited to a react scope that can be both suspensey and reactive. The idea is to let it unwrap Stores and maybe other types of Signals."

  On the same thread ([comment](https://github.com/reactwg/react/discussions/140#discussioncomment-11974061)):
  > "A Store in this model is a two-way value. It can be use():ed or written to. It can only be written/updated out-side of render. Same as state."

  Note that he names the two operations, `use()` and write, and says writes happen outside render. He doesn't name a third operation.
- In [#52](https://github.com/reactwg/react/discussions/52), the `use` Hook (sebmarkbage, 2022-04-22), the typing is `use<T>(Context<T> | Promise<T> | Store<T> | Lazy<T>): T`, and the post adds:
  > "Lint against using this method from outside Components and other Hooks."

  > "It can be called in 'reducers'. So you can use it to conditionally load code or data to support actions being performed."

  The second quote is the only place a source proposes reading one store from another store's update function. More on this in §2-E.
- In [#74](https://github.com/reactwg/react/discussions/74#discussioncomment-11976744) (sebmarkbage, 2022-09-07), a read inside an effect is sugar for a read during render:
  > "I think we can have `use(identifier)` inside any closure / effect in a reactive function. … it's unwrapped in render, whether it's a Promise, Context or a Store. So it's less of a foot gun to consume a store from an effect."
- In [#403](https://github.com/reactwg/react/discussions/403#discussioncomment-14972186) (2025-11-14), Ricky asked: "Could you read the observable outside of render?" He used an internal `useObserver` example, where play/pause is driven by an imperative notify. Seb [answered](https://github.com/reactwg/react/discussions/403#discussioncomment-14972743) with a subscription, not a snapshot read: pass an async generator to `useEffect` and `for await` the observable. He [added](https://github.com/reactwg/react/discussions/403#discussioncomment-14972772):
  > "Ideally in something like `ReactScript` you could just `use(currentVideoObservable)` in some effect and it'd just subscribe the scope but it's not safe to support `use()` in side-effectful scopes since it would have to throw on the first access."
- In [#251](https://github.com/reactwg/react/discussions/251#discussioncomment-11978233) (2024-03-09), Seb says the motivating problem is writes, which in practice often need a read:
  > "Regarding stores, the main thing about stores for me is write - not the read. I haven't seen anything about optimizing the render that helps with the awkwardness of writing to a global state or a keyed state inside a large Map - which is the thing that Recoil really helped with."

**B. Seb's store design (via Ricky's RCP): reading the last committed value outside React needs a third slot, and multiple roots lose it (explicit).**

[#362](https://github.com/reactwg/react/discussions/362), RCP: use(Store), was posted by rickhanlonii on 2025-04-01. It summarizes Seb's notes and is the only source that directly discusses reading outside React.

- On the base state:
  > "If you also want to be able to read the last committed one outside React, you also need a third base state."

  That third base state is the `_current` field, next to `_sync` and `_transition`.
- On multiple roots:
  > "Where you can chain multiple roots. But notice how there's no longer a `_current` field, so there's no way to read last committed. That means, in addition to being more data to store, you can only read and update the store from within a React context (like render, events, effects) with access to a root. It's also a bit unclear what the value should be the first time a new root uses it (maybe any random other root's value)?"

So the RCP's notion of an outside read was **the last committed value**, and it treated multiple roots as what makes that undefined. Its proposed escape was to make React Native use one root with portal-like surfaces. Seb's [reply](https://github.com/reactwg/react/discussions/362#discussioncomment-12691757) also suggests adding Portal support to RN. The 2025 skeleton (#33215) followed this design: it had `_current`/`_sync`/`_transition` fields and no public read.

**C. acdlite: values only effects need shouldn't be read during render, and returning values from event functions is an escape hatch (adjacent).**

- In [#109](https://github.com/reactwg/react/discussions/109#discussioncomment-11977204) (2022-11-28), comparing refs and stores:
  > "you should be able to access the value of a store during render, but only if the value is immutable."

  And [here](https://github.com/reactwg/react/discussions/109#discussioncomment-11977207):
  > "if you restrict refs from being read during render, then you don't have to re-render the component in order to update the effects. You can update the effects with a subscription and skip the render phase."

  And [here](https://github.com/reactwg/react/discussions/109#discussioncomment-11973862):
  > "We could allow `use` to be called in `useEffect`. … I think Sebastian had suggested this feature more generally for stores and context."
- In [#56](https://github.com/reactwg/react/discussions/56#discussioncomment-11973325) (2022-05-08), on event functions that return values:
  > "maybe what you're suggesting is that it's usually a code smell for event functions defined within a component body to return values? Since that implies it's being used to read React-owned state? I suppose maybe that's true in the same way reading ref.current is an escape hatch for interacting with imperative, non-React code. An 'idiomatic' example I can think of for an event function that returns a value by design is the getSnapshot argument to useSyncExternalStore".
- [#420](https://github.com/reactwg/react/discussions/420#discussioncomment-18255233), Optimistic Actions (2026-08), is the most recent store-shaped proposal. It's also read only through `use()`, and the state belongs to the running action:
  > "the component doesn't have any state it all. It all belongs to the running action/transition."

**D. Ricky: React owns the state (explicit on ownership; it implies a position on reads).**

In Jordan's Google Doc, on the phrase "state which is not owned by React at all" (2025-03-17):
> "nit: the APIs we're designing are giving react ownership of the state"

The [#403 question](https://github.com/reactwg/react/discussions/403#discussioncomment-14972186) above, with its `useObserver` example, shows Ricky also has use cases for consuming a value imperatively.

**E. Jordan (captbaritone): the store is a data source that exists independently of React, with a public `getState()` returning the chronological head (explicit, the strongest pro-read position).**

- [react/react#35449](https://github.com/react/react/pull/35449) (2026-01-05, updated 2026-01-07 to "clarif[y] behavior of `getState`") has this interface:
  ```ts
  export interface ReactExternalDataSource<S, A> {
    // Get the current state of the store. State must be immutable.
    getState(): S,
    reducer: (S, A) => S,
    subscribe: (callback: (action: A) => void) => () => void,
  };
  ```
  The PR body says:
  > "Note that `getState()` here must always returns the 'current' version of the data source (the result of applying all the actions in the order in which they were triggered) irrespective of any React transition. Different React roots may be rendering different states at any given time, but the data source itself does not need to be aware of that."

  `ReactStore` "implements `ReactExternalDataSource`", so `createStore(...).getState()` is public in that PR.
- In the Google Doc, Jordan replied to Ricky's ownership nit (2025-03-17):
  > "By 'state which is not owned by React' I was imply that the state exists independent of React. React roots might come and go and the state could continue to change independent of React's presence on the page at any given time. Other non-React consumers may also exist."
- markerikson [quotes](https://github.com/react/react/pull/35449#issuecomment-4709165167) Jordan's Reddit reply (2026-06), which frames the disagreement:
  > "Do we acknowledge that there is a valid use case for in-browser state that is not owned by React? If so, is the only valid use case cache? … Do we acknowledge that there exist, or need to exist, compute graphs outside of React? … More broadly, the whole topic is quite contentious."
- Jordan's earlier userland prototype ([#387](https://github.com/reactwg/react/discussions/387) and the gists) had `getState()` (head) and `getCommittedState()` on the internal `StoreWrapper`. Only `dispatch`, `useStoreSelector`, `useStoreDispatch` and `StoreProvider` were returned to users. So the prototype needed both reads internally but didn't make either public.

**F. Evan Yeung (Meta, building the Recoil-based test app): "can only be read during render" causes awkward patterns (explicit, a use case).**

In [#362](https://github.com/reactwg/react/discussions/362#discussioncomment-13067175) (2025-05-07):
> "our current design adds some strange code patterns as the React stores can only be read during render. This means we need to create a component for URL syncing which will be forced to update whenever any stores update. It also means that the URL will only update after render and will only ever reflect the rendered state, ignoring optimistic updates. This departs from current browser semantics where the URL tends to update first."

In the Google Doc (2025-03-14), using a database analogy:
> "To be write-only, the data for a write operation cannot depend on other store data. Most components/operations should use RW (sync) access because the state transitions they can make depend on the current DB state."

**G. Hazards of reading global mutable stores (adjacent; about reads during render, but the reasoning carries over).**

In [#52](https://github.com/reactwg/react/discussions/52#discussioncomment-11976498):
- sophiebits: "people would need more discipline about reading from global stores."
- josephsavona [gave a race](https://github.com/reactwg/react/discussions/52#discussioncomment-11976501) in which a store read and an async fetch disagree.
- acdlite [replied](https://github.com/reactwg/react/discussions/52#discussioncomment-11976502): "Those are all supposed to go through `useSyncExternalStore` anyway."

josephsavona in [#251](https://github.com/reactwg/react/discussions/251#discussioncomment-11978230): "We're not convinced that stores as a concept are necessary". This is about stores in general, not reads.

### Community

- **Justin Walsh** ([react-concurrent-store PR #26](https://github.com/thejustinwalsh/react-concurrent-store/pull/26), 2026-09-16, open): the store is `{getState, dispatch, subscribe}`. Its API docs say:
  > "`getState()`: Returns every action in dispatch order — the chronological value, which is not necessarily what any component is showing. For reading outside React. Components use `useStore`."

  > "The value a component reads is what it is allowed to show, which is not always what `getState()` returns. While a Transition is in flight they differ on purpose".

  The docs give a persistence example, `store.subscribe(() => persist(store.getState()))`. The Redux integration guide relies on `getState`/`dispatch` parity.
- **react-concurrent-store `main`:** the published ponyfill's `ReactStore` type is `{ update }` only. It has no public read. The `experimental/` package exports a `Store` class with public `getState()` and `getCommittedState()`, and `createStoreFromSource` requires a source with `getState()`.
- **zeorin** ([comment](https://github.com/react/react/pull/35449#issuecomment-5741355267)) and **markerikson** ([comment](https://github.com/react/react/pull/35449#issuecomment-4099194451), [react-redux#2263](https://github.com/reduxjs/react-redux/pull/2263)): their integrations assume an external store that owns its state and keeps its own `getState`. Neither discusses React-side reads.
- **No community voice in these sources argues against a read.** The arguments against are all core-team principles.

### Where it landed

Nowhere. There are three snapshots:
1. **The 2025 RCP (#362) and skeleton (#33215):** no public read. An outside read would be "last committed", and multiple roots make it impossible.
2. **Jordan's 2026 RFC PR (#35449):** public `getState()` returning the head. It's stalled; Jordan says he lacks bandwidth and that it's "contentious".
3. **This branch:** no public read. `_head` exists, and DESIGN.md:36 already makes it what a new root starts from. The disagreement is mostly D vs E: who owns the state.

---

## 2. What a read outside render could mean

These are the semantics the sources proposed or implied. They're mapped onto this branch's internals: `_head`, and per-root `StoreRecord` queues with `{lane, action, seq}`.

### A. The latest dispatched value (`_head`)

- **Proposed by:** Jordan (#35449 `getState`) and Justin (PR #26). The benchmark's `latest` mirror is a userland copy of this.
- **Internals:** `getStoreHead(store)` in `ReactFiberStore.js:128` already folds `_headQueue` lazily.
- **For:**
  - It's root-independent, so it's defined in module scope, actions, tests, other roots, and with no root at all.
  - Read-your-writes: `store.update(x); read()` includes `x`.
  - It matches Redux, Zustand, Recoil/Jotai `get`, and the `getSnapshot` of `useSyncExternalStore` and `useMutableSource`, where the source is the truth.
  - It's what a root that newly starts reading the store renders (DESIGN.md:36).
- **Against:**
  - It can be a value that no UI shows, or ever will show as such, while a transition is pending. Justin's docs say so outright.
  - Feeding it back into React can tear. See the worked example below.
  - Reading the head while records have queued updates runs the reducer again for those actions. That breaks DCP-6's goal that "the reducer runs as often as it does for useReducer". The cost is small, but the invariant is gone.
  - Async actions: after an `await`, the head includes other actions' updates and urgent updates. That's fine for a database-style read, but it's not what this action will render.

### B. The last committed value on a root

- **Proposed by:** Seb's design in #362 (`_current`).
- **Internals:** `getCommittedStoreState(record)` already exists (`ReactFiberStore.js:281`). It applies `NoLane` updates on top of `baseState`.
- **For:** it's what the user sees. Reading it never shows unrendered state.
- **Against:**
  - It needs a root. In module-scope actions and with multiple roots, it's undefined. #362 said so itself, and the RN root-per-surface problem is unchanged.
  - Inside a component, the render closure already gives this value for that component's root, so the API is redundant in event handlers.
  - **No read-your-writes:**
    - `store.update(x); read()` doesn't include `x` until a commit.
    - Inside an async action, the action's own updates aren't committed until the whole action finishes, so every read in the action misses them.

    This is the main ergonomic trap.
  - If the root has no record for the store, it falls back to the head anyway.

### C. The value as the current action or transition would render it (committed plus this action's pending updates)

- **Proposed by:** not proposed explicitly. The closest are acdlite's #420 ("It all belongs to the running action/transition") and the optimistic-store discussion in the Google Doc comments (Ricky, 2025-03-18: separate `createStore` and `createOptimisticStore`).
- **Internals:** it would be `readStoreRecord(record, laneOf(currentTransition) ∪ committed, seq = now)` per root.
- **For:** it has read-your-writes within the action, and it's consistent with what that transition will commit.
- **Against:**
  - It's still per root.
  - It needs to know the current transition. After an `await` there's no AsyncContext, which is the same reason updates after `await` need another `startTransition`.
  - It still differs from what will finally render if urgent updates interleave and get rebased.
  - It's the most complex option, and nobody has asked for it.

### D. Only inside `update()` on the store's own state (status quo)

- **Proposed by:** this is the current API: `store.update(prev => …)` or a reducer. It mirrors `useState`'s "state as a snapshot" plus updater functions.
- **For:** it's replayable per lane, so it rebases correctly. It can't tear, and it has no root ambiguity.
- **Against:**
  - It can't read other stores.
  - It can't do side effects (persist, log, URL).
  - It can't return a value to the caller.
  - The cross-store derived-data case and persistence aren't covered.

### E. Reading other stores inside a store's reducer, via `use()`

- **Proposed by:** Seb in #52 ("It can be called in 'reducers'"). OVERNIGHT.md lists "derived stores" as option (c).
- **For:** if it's evaluated at read time, with the root's render lanes, every input is lane-consistent. That's the only option where derived data stays correct under transitions.
- **Against:**
  - Store reducers also run outside render: the eager state at dispatch, the head fold, and the commit fold. There's no defined answer for what `use(other)` returns there.
  - In DEV they run under the invalid-nested-hooks dispatcher (DECISIONS.md, "Reducer errors"), so `use()` throws today.
  - It needs dependency tracking between stores.
  - It's in tension with "no selectors".

### F. Subscribe instead of read

- **Proposed by:**
  - Seb in #403: async generators in `useEffect`.
  - Ricky's `useObserver`.
  - `subscribe(cb)` in #35449 and PR #26.
- **For:** it covers persistence, logging, URL sync and imperative reactions without a synchronous snapshot API.
- **Against:** it needs its own semantics.
  - Notifying on dispatch gives head values. That's what Evan wanted for "URL updates first".
  - Notifying on commit is per root and lags.

### Worked example: why reading outside render doesn't fix "derived data in actions" under transitions

This is my analysis, not from a source. It follows the read rules in DESIGN.md and `readStoreRecord`.

`store-derived.jsx` computes `categoryStats = f(posts, comments)` in actions and writes it as a value (`s.categoryStats.update(stats)`). Suppose:
1. Transition T updates `posts`. It's pending, so `categoryStats` gets `V1 = f(postsT, commentsOld)`.
2. While T is pending, an urgent `addComment` runs. It writes `V2`.

The two read semantics give:
- **With head reads (A):** `V2 = f(postsT, commentsNew)`. The urgent render shows the old `posts` with `V2`, so the stats include T's unrendered posts. That's torn derived data during the transition. The final value is correct.
- **With committed reads (B):** `V2 = f(postsOld, commentsNew)`. The urgent render is consistent. When T commits, the `categoryStats` queue is `[V1 (T), V2 (sync)]`, and value updates are last-write-wins, so the final value is `V2` and **permanently lacks T's posts**.

Writing a snapshot of other stores as a value can't be rebased, whatever the read returns. Only head reads are eventually correct, and only a lane-consistent derivation (E, or deriving during render with the compiler) is correct throughout. In an all-urgent app, A and B differ only in read-your-writes before the commit.

---

## 3. Use cases cited

| Use case | Cited by | Notes |
| --- | --- | --- |
| Derived data in actions from other stores | This branch: `store-derived.jsx:7`, OVERNIGHT.md:198 | Hand-rolled `latest` mirror = head semantics. It goes wrong as soon as anything updates the store through another path (an updater function, another module). See the worked example for the transition caveat. |
| URL sync / external persistence | Evan, #362; Justin, PR #26 (`persist(store.getState())`) | Evan wants it **before** render ("URL tends to update first"), so head or on-dispatch. |
| Imperative reactions without re-rendering (play/pause) | Ricky, #403 (`useObserver`) | Seb answered with a subscription in an effect, not a read. |
| Effects reading stores | Seb, #74; acdlite, #109 | Framed as `use` in an effect = the value read in render. No separate read API. |
| Interop with external stores and non-React consumers | Jordan, #35449 and the Google Doc; markerikson; PR #26 Redux guide | The motivation for `ReactExternalDataSource.getState()`. |
| Writes that depend on current state ("RW access") | Evan, Google Doc; Seb, #251 ("the main thing about stores for me is write") | Own-store reads are covered by `update(prev => …)`. Cross-store reads aren't. |
| Event handlers (generic) | None explicitly | In components, the render closure covers this. |
| Logging, tests | None found | Tests can use `use()` in a probe component today. |

---

## 4. Recommendation (mine, kept separate from the summary)

**1. Don't add a per-root "committed" read (B) or an action-scoped read (C).**
- B is undefined in module scope and across roots; #362 already concluded this.
- B is redundant inside components, because the render closure has the value.
- B breaks read-your-writes, including for a whole async action.
- C has no AsyncContext to stand on, and nobody asked for it.

**2. If you add a read, make it the head (A), and frame it as "the source's value, not the UI's".** This is the only definition that is root-independent and has read-your-writes. It matches Jordan's RFC, Justin's ponyfill and every external store. The benchmark shows users will rebuild it in userland anyway, and a userland mirror is strictly worse: it silently diverges when the store is updated through an updater or another module. Constraints I'd put on it:
- **Name it so it doesn't read like render state.** Use `getSnapshot()` or something with the same feel, and document that it can differ from what any component shows while a transition is pending (Justin's wording is good).
- **Warn in DEV when it's called during render** (and in `useMemo`, and inside store reducers). This addresses Seb's "subtly not reactive" objection where it bites: in render, `use(store)` is the only correct read. This is the same move as the ref-read-in-render warning acdlite mentions in #52.
- **Accept the DCP-6 cost.** Reading forces the head fold, so the reducer can run more often than with `useReducer` while queues are pending. Record it as a decision.

**3. Don't sell it as the fix for derived data.** Per the worked example, no outside-render read makes `store-derived`'s pattern correct under transitions. If derived data is the real driver, that's a separate decision: derived stores (E) or deriving during render with the compiler, which `store-derived`+compiler already does well per OVERNIGHT.md. `getSnapshot()` only makes the urgent-only case less awkward.

**4. Persistence, URL sync and logging may be better served by a subscription (F) than by a read.** If you add one, choose on-dispatch (head, what Evan asked for) or on-commit, and say which.

### What I'd want you to decide

1. **Ownership (D vs E).** Is a store state React owns (your Google Doc comment), or a data source that exists independently of React (Jordan)? If it's React-owned, "no outside read, like `useState`" is principled, and the benchmark's `latest` is the cost you accept. If it's independent, a head read is required for interop.
2. **If there's a read, head vs committed.** I recommend head, for the reasons above.
3. **Where it's allowed.** Warn in render and in reducers? (I'd warn in both.)
4. **Whether cross-store derived data gets its own primitive** (derived stores / `use` in reducers), since a read doesn't solve it under transitions.
5. **Whether to add `subscribe`, and whether it fires on dispatch or on commit.**
6. **Ask Seb directly.** His #362 notes treated "read last committed outside React" as desirable but blocked by multiple roots. None of his statements address a head read, so his view on A is unrecorded.

### Side note found while reading

DESIGN.md:29 says "Fizz reads `_head`", but DCP-4 (DECISIONS.md) says Fizz reads `_initial`. DESIGN.md looks stale on that line.
