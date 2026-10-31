# use(store) blockers

Open blockers found by the spec suite or the copy campaign. Each has a minimal repro and an owner. Tests pinned by an open blocker are gated `// @gate enableStore && TODO` with `// BLOCKER: <id>`.

| ID | Status | Found in | Summary | Resolution |
|---|---|---|---|---|
| B-1 | fixed | ReactUseStore-test | An update dispatched mid-render with no subscribed readers was dropped, because the root wasn't scheduled through the concurrent queue and `commitRoot` marked the lane finished | Schedule the HostRoot with `enqueueConcurrentRenderForLane` (see DECISIONS.md) |
| B-2 | env | full experimental run | `ReactFlightAsyncDebugInfo-test` (fs.readFile async stack snapshot) and `ReactFlightDOMEdge-test` (SharedArrayBuffer error message) fail on Node 25 | Unrelated to stores. Both depend on the Node runtime version, not on any code path touched here |
| B-3 | env | eslint-plugin-react-hooks | The compiler lint tests need a fresh `compiler/packages/babel-plugin-react-compiler/dist`. The checked-out dist was stale, and the original suite failed 9/17 | Ran `yarn workspace babel-plugin-react-compiler build`, which the package's own `test` script does first |
| B-4 | fixed | ReactTransitionUseStore (copies-transitions) | Store reads used the root's raw render lanes, not the entangled lanes. A render of an older transition skipped a newer entangled update and committed an intermediate state | Read with the hook's `renderLanes` (`entangledRenderLanes`), the same lanes useState processes. Pinned by "multiple transitions that update the same store are entangled" in ReactUseStore-test |
| B-5 | fixed | ReactUpdatesUseStore (copies-dom-inputs) | False "hasn't mounted yet" DEV warning when a new reader inside a newly inserted host parent caught up on missed updates during the mutation phase | DCP-5: catch-up runs after the mutation phase |
| B-6 | fixed | ReactDOMServerPartialHydration copies (copies-fizz) | Hydration mismatch when the store updated before a dehydrated reader hydrated | DCP-4: the initial value is the server snapshot |
| B-7 | fixed | ReactIncrementalUpdatesUseStore (copies-transitions) | The reducer ran more often than for useReducer: eagerly for _head, again for the eager state, and again at commit | DCP-6: lazy head, reused eager state, and a cached commit |
| B-8 | fixed | copies-suspense, copies-hooks | An urgent update followed by a transition on the same store got entangled, because urgent lanes went into the entanglement set | Only transition lanes are entangled |
| B-9 | fixed | copies-transitions | The commit folded the raw lanes while reads used entangled lanes, so an entangled update could be reverted | The commit uses root.storeRenderLanes |
| B-10 | fixed | copies-hooks | use(store) in a class render or memo compare threw a TypeError | Invalid hook call error |
| B-11 | fixed | copies-hooks | A throwing updater threw at store.update() (no readers) or during the commit | Deferred to render |
| B-12 | decided | copies-hooks, copies-suspense | A render-phase self-update warned "while rendering a different component (X)" | DCP-7: store-specific warning, rendered after the render |
| B-13 | decided | copies-activity-context, copies-dom-classes | No "not mounted yet" warning for store updates | Intentional: store updates aren't tied to a fiber |
| B-14 | fixed | copies-react-pkg | StrictMode did not double-invoke store reducers/updaters | Extra reducer call in readStoreRecord under shouldDoubleInvokeUserFnsInHooksDEV |
| B-15 | fixed | copies-react-pkg | debug-tools: Store not in primitive stack cache (wrong name, no hookSource, not nested) and given a nativeHookID (shifted later hook ids) | Seeded cache; Store gets id null |
| B-16 | fixed | copies-devtools | Profiler change descriptions did not detect changed store reads ("The parent component rendered.") | Store HooksNode named Store; treated as stateful in change detection |
| B-17 | fixed | copies-devtools | Inspector showed hooks: null for components whose only hook is use(store) | DevTools renderer usesHooks also checks updateQueue.storeReads |
| B-18 | fixed | ReactContextPropagationUseStoreContext (context copies) | A reader that suspends on its first mount never subscribes, so a store update doesn't retry its Suspense boundary | DCP-16: the boundary subscribes to the stores its suspended primary children read |
| B-19 | open | ReactFlightUseStoreContext (context copies) | `use()` of a client reference to a store in a Server Component gives the generic "Cannot use() an already resolved Client Reference." error instead of the store error | See below |
| B-20 | fixed (source); build-level DevTools run pending a rebuild | profilingCacheUseStoreContext (context copies) | DevTools profiler change detection crashed when a conditional `use(store)` read was dropped between renders, and paired reads by position | Hooks are matched by id, and store reads by store identity (see below) |

## B-18: a store update doesn't retry a boundary whose readers suspended on mount

- **Resolved 2026-10-30 (DCP-16):** when a component suspends, the stores it and the components above it read, up to the nearest Suspense boundary, are kept on the boundary's `SuspenseState` while it shows its fallback. The boundary subscribes to them in the mutation phase, catches up on pending lanes, and unsubscribes when its primary children commit or it's deleted. A store update marks the boundary with the update's lane, so it retries its primary children. Both context copies are un-gated, and `ReactUseStore-test.js` covers the first-mount case, the urgent-update variant, and unsubscribing on unmount.

- **Found by:** the context copies of `ReactContextPropagation-test.js`, "regression: context change triggers retry of suspended Suspense boundary on initial mount" and its "(nested)" variant. Both are gated `@gate enableStore && TODO`.
- **Repro:**
  ```js
  const store = createStore(new Promise(() => {})); // never resolves
  function Consumer() {
    return <Text text={use(use(store))} />;
  }
  await act(() =>
    root.render(
      <Suspense fallback={<Text text="Loading" />}>
        <Consumer />
      </Suspense>,
    ),
  );
  // Logs ['Loading']
  await act(() =>
    store.update({status: 'fulfilled', value: 'Result', then() {}}),
  );
  ```
- **Expected:** `['Result']`, the way the context version retries.
- **Actual:** nothing renders, and the root stays on "Loading" forever.
- **Diagnosis:** readers are added to `record.readers` only when they commit (`subscribeToStoreReads`, from the insertion effect). On a first mount, when the primary children of a Suspense boundary suspend, their fibers are thrown away, so `Consumer` never commits and never subscribes. `dispatchStoreUpdate` (`ReactFiberStore.js`) finds no reader to schedule. It schedules the HostRoot (or whichever subscribed readers exist above), which renders and bails out at the Suspense boundary, because nothing marked it. The boundary only retries when the promise it suspended on resolves. Context handles the same case in `propagateContextChanges` (`ReactFiberNewContext.js`) by conservatively marking every client-rendered Suspense boundary that shows a fallback below the changed Provider. Stores have no Provider to walk from, so they need to know which boundaries depend on them.
- **Suggested fix:** when the primary children of a boundary are discarded (a suspended first mount), keep the stores they read and subscribe the Suspense fiber to them when the fallback commits, e.g. by collecting `use(store)` reads on the nearest Suspense handler (`getSuspenseHandler()`) during the render. Then a store update schedules the boundary itself, and its retry remounts the primary children with the new value. The same gap affects a new reader that mounts inside primary children that suspend during an urgent update (verified with a scratch test: `<Suspense><Show /></Suspense>`, where `Show` switches to the `Consumer` above after a store update, also stays on "Loading"), since its work-in-progress fiber is also discarded.
- **Scope:** latency for most code, because the boundary still retries when the original promise resolves and then reads the latest value. It's a hang when the store holds a promise that never resolves or is replaced, which is the "store of promises" pattern (`use(use(store))`).

## B-19: Flight gives a generic error for use() of a client reference to a store (RESOLVED)

- **Resolved 2026-10-30:** `ReactFlightHooks.js` `use()` now throws "Cannot read a store from a Server Component." for client references to stores. The case is un-gated and passes on experimental, stable and www-modern (variant true and false).

- **Found by:** the context copy of `ReactFlight-test.js`, "should error if a client reference is passed to use()". Gated `@gate enableStore && TODO`.
- **Repro:**
  ```js
  const ClientStore = clientReference(createStore());
  function ServerComponent() {
    return ReactServer.use(ClientStore);
  }
  ReactNoopFlightServer.render(<ServerComponent />, {onError});
  ```
- **Expected:** "Cannot read a store from a Server Component.", the store version of "Cannot read a Client Context from a Server Component."
- **Actual:** "Cannot use() an already resolved Client Reference."
- **Diagnosis:** `use()` in `packages/react-server/src/ReactFlightHooks.js` handles a store passed directly (`unsupportedStore()`), but its `isClientReference(usable)` branch only special-cases `clientReference.value.$$typeof === REACT_CONTEXT_TYPE`. It needs the same check for `REACT_STORE_TYPE` that calls `unsupportedStore()`. This is a developer-experience gap, not a correctness bug: it throws either way. Ricky may prefer to accept the generic message.

## B-20: DevTools change detection crashes on a dropped conditional store read (RESOLVED)

- **Resolved 2026-10-30:** all 9 DevTools files pass on a full experimental build that includes `getStoreKeyOfHooksNode`, with `enableSameElementBailout` on (9/9 suites, 38 passed, 7 skipped). Run by zustand-gap.

- **Resolution:** fixed in source.
  - `react-debug-tools` records the store on the hook log entry for `use(store)`. `buildTree` keeps a module-level WeakMap from each Store HooksNode to its store. The store isn't put on the node, which is serialized over the bridge and references roots through `_records`. The only new export is `getStoreKeyOfHooksNode(node)`, which returns an opaque key, or null for other nodes.
  - `getChangedHooksIndices` flattens both trees to their leaves. It matches hooks that take a slot by `id`, and Store leaves by store key (the k-th read with the k-th read). Unmatched leaves aren't changes: a dropped read, a newly added read, Context, DebugValue. Indices are positions in the next render's leaf list, which is what "Hook N changed" shows. They equal the old positional result when no store read was added or dropped.
  - Pinned by `ReactDebugHooksStore-test.js` (react-debug-tools), `profilingStoreChangeDetection-test.js` (dropped read, added read, a read in both renders reported at its new position, repeated reads of one store, all with different store values), and the un-gated conditional `use()` case in `profilingCacheUseStoreContext-test.js`.
- **Verification:**
  - Source-level verification passed. The DevTools profiler tests were run with every React package and `react-debug-tools` loaded from source, using a throwaway jest config. With the old positional matching, three of the new cases and the profilingCache copy fail.
  - The `--build --project devtools` run is pending a rebuild. The 13:09 build of React predates the change of `updateQueue.storeReads` to `[record, value]` pairs, so source `react-debug-tools` can't run against it.
- **To run after the rebuild:**
  ```
  yarn test --build --project devtools -r=experimental --ci \
    packages/react-devtools-shared/src/__tests__/profilingStoreChangeDetection-test.js \
    packages/react-devtools-shared/src/__tests__/profilingCacheUseStoreContext-test.js \
    packages/react-devtools-shared/src/__tests__/profilerChangeDescriptionsUseStoreContext-test.js \
    packages/react-devtools-shared/src/__tests__/inspectedElementUseStoreContext-test.js \
    packages/react-devtools-facade/src/__tests__/DevToolsFacadeUseStoreContext-test.js \
    packages/react-devtools-shared/src/__tests__/profilingCache-test.js \
    packages/react-devtools-shared/src/__tests__/profilingCacheUseStore-test.js \
    packages/react-devtools-shared/src/__tests__/profilerChangeDescriptions-test.js \
    packages/react-devtools-shared/src/__tests__/profilerChangeDescriptionsUseStore-test.js
  ```
  The first five are the new test and the DevTools context copies. The last four check for regressions in change descriptions. Mark B-20 resolved if they pass.
- **Pre-existing, not changed:** `HookChangeSummary` (the Profiler's "Why did this render?") picks the hooks to show in its detailed view by `hook.id`. The reported indices are leaf positions, which also count id-less nodes (Context, Store, DebugValue). When such a node comes at or before a changed hook, the ids and positions disagree. The detailed view then finds fewer hooks than were reported, and falls back to the compact "Hook N changed" text, where N is the position plus one. A Store node can never show in the detailed view, because its `id` is null. Fixing this would mean reporting ids (or ids plus store keys) and teaching the frontend about Store nodes.

- **Found by:** the context copy of `profilingCache-test.js`, "should detect context changes or lack of changes with conditional use()". It was gated `@gate enableStore && TODO` and is now un-gated.
- **Repro:** while profiling, render
  ```js
  const [state, setState] = useState('abc');
  if (state.includes('a')) use(storeA);
  use(storeB);
  ```
  then call `setState('def')`, so the `storeA` read is dropped.
- **Expected:** the commit's change description is hooks `[0]` (only the state changed).
- **Actual:** the commit throws `TypeError: Cannot read properties of undefined (reading 'value')` in `didStatefulHookChange` (`DevToolsFiberChangeDetection.js`).
- **Diagnosis:** `getChangedHooksIndices` walks `prevTree` by position and reads `nextTree[i]` without checking that it exists. Since B-16, `Store` nodes count as stateful, so `didStatefulHookChange` dereferences `next.value`, and a shorter next tree crashes. `use(context)` can be conditional too, but context nodes aren't stateful, so `next` was never dereferenced before. Even without the crash, comparing by position pairs the `storeA` read with the `storeB` read and reports a false change. The fix needs to guard a missing `nextHook` and match `Store` nodes by store identity rather than by position.
