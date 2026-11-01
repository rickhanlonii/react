# Claims ledger: explainer.src.html

Scratch ledger for the claim-boundary pass. One row per technical claim, in page order: claim, then source (file:line at the working tree on 2026-11-01, a DCP, a test name, or a sandbox/explainer that demonstrates it live). Paths: `RS` = `packages/react/src/ReactStore.js`, `FS` = `packages/react-reconciler/src/ReactFiberStore.js`, `FH` = `packages/react-reconciler/src/ReactFiberHooks.js`, `UST` = `ReactUseStore-test.js`, `DST` = `ReactDOMStore-test.js`.

Status: **V** verified in code or a test, **L** shown live by a sandbox (G3 steps assert it) or explainer (G4), **D** from DESIGN/DECISIONS/NEXT_STEPS only, **X** outside these sources (React docs or general knowledge).

## Header

| Claim | Source | Status |
|---|---|---|
| Updates follow `useState`'s rules, incl. transitions and rebasing | DESIGN.md "Intentional differences" ("Otherwise, store updates follow the same rules as useState") | D |
| Updates only re-render components that read the store | `dispatchStoreUpdate` FS:714, readers loop FS:781; UST "only re-renders the components that read the store"; sandbox `intro` (expectRenders Count 1, App 0) | V L |
| Behind `enableStore`, experimental only, exported as `unstable_createStore` | RS:12 `enableStore`, RS:110; DESIGN.md "API (experimental, enableStore)"; UST uses `React.unstable_createStore` | V |
| Sandboxes run the dev build, no compiler, StrictMode off | `gen:sandbox-build` (from vendor/VERSIONS.json); sandbox/API.md intro | V |
| Stepped explainers use the mock scheduler | sandbox/explainers/README.md; API.md §8 | V |

## The problem

| Claim | Source | Status |
|---|---|---|
| Context re-renders every consumer when the Provider value changes, even consumers whose part didn't change | React semantics; sandbox `context` (ContextTheme renders on a count change) | L X |
| Teams split providers / memoize values to work around it | general knowledge (old explainer) | X |
| `useSyncExternalStore` re-renders only components whose snapshot changed, usually with selectors | React semantics; `rerenders` explainer selectors panel | L X |
| An external store change always renders synchronously, even in `startTransition` | `forceStoreRerender` FH:2181 (SyncLane); README tearing G4 check "useSyncExternalStore renders every cell synchronously" | V L |
| If that render suspends, the nearest boundary shows its fallback instead of keeping the UI | react.dev `useSyncExternalStore` caveats; confirmed by the reviewer at checkpoint 3 | X |
| A mutable value read during a yielding render can tear | `tearing` explainer ("the global tears", G4) | L |
| `use(store)`: only readers re-render, and an update in a transition is a transition, without tearing | UST "renders a transition update without blocking", "never commits readers showing different versions of the store"; tearing G4 | V L |

## The API

| Claim | Source | Status |
|---|---|---|
| No reducer: function is an updater, anything else replaces | `basicStateReducer` RS:16-19; UST "reads updates made before the first render" | V |
| With a reducer, the argument is passed as the action, even a function | RS:121 (reducer used as-is, no function check) | V |
| Reducer fixed at creation, which lets React replay updates on any version (rebasing) | RS:111-121 comment; DESIGN "The reducer is fixed when the store is created" | V |
| No lazy initializer | DESIGN "No lazy initializer" | D |
| `store.update` is bound to the store, one argument | RS:135 `updateStore.bind(store)`; UST "store.update has an arity of 1, like a setState function" | V |
| A second callback argument warns in DEV | RS:22-31; UST "warns about a second callback argument to store.update" | V |
| Update from anywhere, incl. before first render | UST "reads updates made before the first render"; RS:47-66 (no-record path) | V |
| `update()` inside `startGestureTransition` throws | RS:33-44; UST "a store update that throws inside a gesture transition does not change the store" | V |
| `use(store)` outside a function component throws the invalid Hook call error | FH:1197-1199; UST "throws an invalid hook call error when read outside a function component" | V |
| In `useMemo`/reducer/effect: same warning or error as other Hooks | DESIGN "Differences from context: Disallowed reads" | D |
| No way to read outside render; recommendation still a decision | RS (store has no read method, RS:117-135); NEXT_STEPS D5 | V D |
| No selectors; granular stores + compiler | DESIGN "There are no selectors" | D |
| Sandbox `api-demo` | reducer + value store, asserted by steps | L |

## Mental model

| Claim | Source | Status |
|---|---|---|
| Each root that reads a store keeps its own record (queue) | FS:63-70 header; `getStoreRecord` FS:197 | V |
| The HostRoot computes the store's value once per render with useReducer's rules | `processStoreRecords` FS:429-475, called from `updateHostRoot` ReactFiberBeginWork.js:1937; DCP-17 | V |
| Every component in the render reads that one value | `getStoreStateForRender` FS:591; FH:1207-1217 | V |
| Dispatch goes to every record; lane from the event's priority like `setState` (transition in startTransition, sync in a click, other events their own, default outside any event) | RS:76-98; `requestStoreUpdateLane` ReactFiberWorkLoop.js:912-931 (`eventPriorityToLane(resolveUpdatePriority())`); reviewer fix 1 | V |
| Queued on the HostRoot through the concurrent queue; readers marked with the lane; a render in progress doesn't see it | FS:771-787 (`enqueueConcurrentStoreUpdate`, `enqueueConcurrentRenderForLaneOnMountedFiber`); DCP-17 "so a render that's in progress never sees them" | V |
| Process: render lanes applied, others skipped, later updates kept after a skipped one (NoLane clones) | `processStoreRecord` FS:477-586 (skip FS:511-526, rebase clone FS:547-561) | V |
| Once per root, not per component | FS:63-70 ("the reducer runs once per root, no matter how many components read the store") | V |
| A reader that skipped updates gets their lanes and renders again | FH:1233-1247; DCP-3 | V |
| Commit is a pointer swap; reducer doesn't run again | `commitStoreState` FS:1013-1021; `commitStoreStates` FS:1050-1066 ("Nothing is computed again"); DCP-17 | V |
| Two components in one commit can't show different versions | UST "never commits readers showing different versions of the store"; tearing G4 | V L |
| Store keeps the latest value in dispatch order; a new root starts from it, plus held transition updates (FS:239-305; DESIGN Model "With no records"; reviewer fix 4) | RS:122-124 `_head` comment; `getStoreRecord` FS:208-221; DESIGN "A root that starts reading a store starts from _head" | V |
| Latest value computed lazily; reducer runs about as often as useReducer | DCP-6; RS:67-70 comment; UST "runs the reducer as often as useReducer" | V |
| Glossary: record contents (pending, lanes, readers) | `StoreRecord` FS:131-165 | V |
| Glossary: base state / base queue / skipped lanes | `StoreState` FS:85-110 | V |
| Glossary: eager state is per root (record has nothing pending); same value dropped without rendering | FS:740-758 (`hasPendingStoreUpdates(record)`); DESIGN Model "Dispatch" ("when the record has nothing pending"); reviewer fix 2; DESIGN "Eager computation and bailout"; UST "bails out when the value does not change" | V |
| Glossary: transitions that update the same store are entangled | FS:797-806; UST "multiple transitions that update the same store are entangled" | V |
| Details: a record is split like a Hook; HostRoot holds `StoreState`s | DCP-17 "Model"; FS:63-70, `StoreStates` FS:112-120 | V |

## Conditional reads and subscriptions

| Claim | Source | Status |
|---|---|---|
| No Hook slot, so conditional/loops/after early return | DCP-2; FH:1355 comment ("Reads are tracked on the update queue instead of in a Hook slot, so they can be conditional"); UST "can be read conditionally", "can read a list of stores in a loop" | V |
| Subscribed to exactly the stores the last committed render read | `finishStoreReads` FH:1356-1419; UST "subscribes to an added store and unsubscribes from a dropped one, keeping the rest" | V |
| Reads stored as record (per root)/value pairs, compared with previous render; change = update; else bail out | FH:1266-1278 (`storeReads.push(record, value)`); DESIGN Readers; reviewer fix 7; `compareStoreReads` FH:1314-1347; DESIGN Readers | V |
| One insertion effect per component, pushed only when the set changes | DCP-8; FH:1349-1355, FH:1390-1396 | V |
| Subscribes in the commit before layout effects, so layout-effect updates aren't missed | DCP-2 ("Insertion effects run synchronously in the mutation phase"); UST "does not miss updates dispatched in a layout effect before the reader subscribes" | V |
| Deletion unsubscribes | `unsubscribeFromStoresOnDeletion` FS:878, called at ReactFiberCommitWork.js:1682; UST "unsubscribes on unmount after re-rendering with the same stores" | V |
| On subscribe, marked with every pending lane | `subscribeToStores` FS:809-826; DCP-15 | V |
| Record dropped in the same commit once no readers and nothing pending | `flushStoreSubscriptions` FS:1201-1223; DCP-11; UST "stops updating unmounted readers and releases the root"; DST "releases the root when it unmounts, without another store update" | V |
| Subscriptions explainer: records and subscribed components read from internals; no record when nothing reads | README `subscriptions`; src/demos/frames/subscriptions.js header; G4 "reader counts" | L |

## Concurrency

| Claim | Source | Status |
|---|---|---|
| Batches with other updates in the same event | UST "batches updates to the store with state updates in the same event" | V |
| Transition update is a transition; sync rebased over a pending transition | UST "renders a transition update without blocking", "a sync update interrupts a transition and is rebased" | V |
| Queue explainer: real React, mock scheduler, preview checked vs React on random sequences | README queue + G4 "queue preview matches React: 200 seeds" | L |
| Try-this numbers: T +1 then S ×2 shows `1 * 2 = 2`, step shows `(1 + 1) * 2 = 4` | `processStoreRecord` rules; queue explainer starts at `1` (queue-ui.js reset `initial: 1`); same shape as UST "(2 + 1) * 2" | V |
| Experimental-only default flush when a transition is dispatched with default updates waiting | README "Notes for authors"; queue-ui.js log text | D |
| No tearing: one state per render from the HostRoot; updates during render wait | DCP-17; FS:771-775 comment | V |
| Tearing demo script and four outcomes | README tearing; tearing-ui.js strings; G4 notes (global tears, uSES de-opts, default lane transition-first, click update-first) | L |
| A reader mounting mid-transition shows the committed value, then updates with the transition in one commit | UST "a reader that mounts during a transition shows the committed value, then updates with the transition", "...non-blocked transition joins it"; sandbox `join-demo` | V L |
| Mechanism: skipped lanes merged into the fiber, like updateReducerImpl, no extra render/fixup | DCP-3; FH:1240-1247 | V |
| A component that mounts as part of the transition reads the new value | UST "a reader that mounts as part of the transition that updates the store reads the new value" | V |
| Async actions: before/after `await` commit together | UST "async actions batch store updates with updates after await"; sandbox `async-action-demo` | V L |
| A component whose value comes from a pending action suspends until it's done | FH:1279-1306; DESIGN Readers | V |
| Held: transition update to an unread store held until done; urgent mount doesn't see it | DCP-18; `dispatchUnreadStoreUpdate` FS:316-344; UST "a reader that mounts urgently does not see a transition update to a store no root read yet"; sandbox `held-demo` | V L |
| Originally applied right away; found by the react-concurrent-store port | DCP-18 "Bug" | D |
| Urgent update after a held one is held too and rebased | FS:316-320 comment, FS:327-342; UST "an urgent update behind a held update is rebased on top of it" | V |
| A root that starts reading takes held updates into its record, schedules lanes on HostRoot, entangles | FS:239-305; DCP-20 | V |
| Done updates applied to the latest value at every commit and when a root starts reading | `settlePendingTransitionUpdates` FS:350-394, called FS:217 and FS:1054-1058; DCP-18 | V |
| Same-transition mount sees the held update | UST "a reader that mounts in the same transition sees a held update" | V |
| Limit: with several roots, "done" is judged on the committing root | DCP-18 "Limits" | D |

## Suspense, Activity, hydration

| Claim | Source | Status |
|---|---|---|
| A store update retries the boundary of a component that suspended after reading it | DCP-16; UST "a store update retries a boundary whose reader suspended on mount", "...new reader suspended during an update"; sandbox `suspense-demo` | V L |
| Without it: never subscribes; `use(use(store))` on a never-resolving promise hung | DCP-16 "Problem" (B-18) | D |
| Collects stores of the suspended component and ancestors up to the nearest boundary | `collectStoreReadsOfSuspendedTree` FS:894-933, called at ReactFiberThrow.js:473 | V |
| Boundary subscribes while the fallback shows; unsubscribes when children commit | `commitSuspenseStoreReads` FS:964-983; ReactFiberBeginWork.js:2418; UST test asserts readers switch to Consumer | V |
| Store panel lists `Suspense` as reader, then `Profile` | sandbox `suspense-demo` steps (`record.readers` contains) | L |
| Siblings rendered before aren't collected; context doesn't retry for them | DCP-16 Decision bullet 1 | D |
| Collection only on the suspend path; `use(store)` does no extra work | DCP-16 Decision bullet 2 | D |
| Children that don't read the store aren't retried; Provider change retries every boundary showing a fallback | DESIGN "Differences from context: Suspense retries" | D |
| Hidden Activity readers stay subscribed, update in background at offscreen priority, reveal with latest | UST "readers in a hidden Activity update in the background"; DCP-2 (not disconnected by Activity); sandbox `activity-demo` | V L |
| A click is sync | `requestStoreUpdateLane` ReactFiberWorkLoop.js:930 (`eventPriorityToLane`), API.md §2 step | V |
| Scoped: when a transition's store update commits at the root before the hidden tree renders, the hidden reader renders the committed value; `useState` renders the older value first | ActivitySuspense-test.js "updates at multiple priorities that suspend inside hidden tree" (store-semantics note ~line 683); DCP-17 "Observable differences"; DESIGN "Hidden trees" still says "never", page scoped per reviewer | V |
| Revealed-tree readers read the same version (root lanes, not subtree lanes) | FH:1233-1239; DCP-13; UST "readers inside a revealed Activity read the same version as the rest of the tree" | V |
| Server renders the initial value; client hydrates with it; readers re-render with latest after hydrating; no mismatch | DCP-4, DCP-12; FH:1249-1258; DST "hydrates with the initial value of the store"; sandbox `hydration-demo` (logs light, light, dark; no recoverable error) | V L |
| uSES model with the initial value as server snapshot | DCP-4 | D |
| Hydrating reader computes the client value, joins pending transitions, re-renders at sync lane after commit | DCP-12; FS:1190-1199 (SyncLane); DST "a reader that hydrates while a transition is pending joins the transition" | V |
| Updates on the server aren't rendered; create the store with the value instead | DCP-4 "Consequence"; DST "the server renders the initial value, not updates" | V |
| No warning for `store.update` during server render; only changes the latest value | DECISIONS "No warning for store.update during server rendering" | D |
| Store updates aren't routed into dehydrated boundaries; server HTML stays until it hydrates | DESIGN "Server and hydration"; DST "keeps the server HTML when a store changes before a suspended dehydrated reader hydrates" | V |
| Server Components throw "Cannot read a store from a Server Component." | packages/react-server/src/ReactFlightHooks.js:123,174 | V |

## Rules and errors

| Claim | Source | Status |
|---|---|---|
| Updating during render warns, even when the component reads that store | DCP-7; `warnAboutStoreUpdateInRenderDEV` ReactFiberWorkLoop.js:887-899; UST "warns when a store is updated during render, and renders the update after"; sandbox `render-update-demo` | V L |
| Rendered after the current render; not discarded if the render suspends or is thrown away | DCP-7; DESIGN "Updates during render" | D |
| An unconditional render-phase update loops | DCP-7 "Not supported"; DESIGN | D |
| Derive-state-during-render doesn't carry over | DCP-7 "Not supported" | D |
| Reducer runs outside any component; Hook/context in it throws; readers throw it | DCP-17; FS:449-454 comment; DESIGN "Reducers run outside any component" | V |
| "Which Provider's value would a shared store see?" | DESIGN (same question) | D |
| Reducer runs at dispatch to a root if nothing is pending on that root (eager), so once per root with several roots; else at the HostRoot; readers don't run it | FS:740-758 (per record); FS:429-475; DCP-6, DCP-17; DESIGN Model "Dispatch"; reviewer fix 2 | V |
| StrictMode extra reducer call for readers in DEV | DCP-17 "StrictMode"; `doubleInvokeStoreReducerDEV` FS:691-712; UST "works in StrictMode", "double invokes reducers in StrictMode even when a reader outside StrictMode reads first" | V |
| Reducer error throws in every reader during render; boundaries catch; update dropped, store recovers | `readStoreState` FS:662-675; DCP-14; UST "drops an update whose reducer throws once an error boundary handles it"; sandbox `errors-demo` | V L |
| Dropped like an error boundary drops a useReducer queue it unmounts | DCP-14 "With readers" | D |
| Reported if no committed boundary logs it (e.g. only reader hidden) | DCP-19; FS:1022-1036, `flushStoreErrors` FS:1110-1129; UST "reports a reducer error that no component rendered, and drops the update" | V |
| "the way it reports uncaught errors" | `reportGlobalError` (shared/reportGlobalError.js: `reportError` or an ErrorEvent) | V |
| No root reads: outside a transition `store.update()` throws, not applied; inside a transition it's held, and a reducer error when it's applied is reported | RS:47-65; FS:376-386 (`reportGlobalError` in `settlePendingTransitionUpdates`); DESIGN Model "With no records"; DCP-14, DCP-19; UST "reports a reducer error from a held transition update"; reviewer fix 3; UST "throws a reducer error from store.update when nothing reads the store"; sandbox `errors-demo` (unread button) | V L |
| No unmounted-component warnings | DECISIONS "Store updates never warn about unmounted or not-yet-mounted components" | D |
| No large-number-of-updates-in-startTransition warning; stores are the primitive | DECISIONS "No transition update-count warning for stores"; DESIGN "No component warnings" | D |

## Performance model

| Claim | Source | Status |
|---|---|---|
| Update schedules the readers directly; no tree walk; nothing in between renders | FS:776-787; DECISIONS "Store updates mark readers without walking to the root from each one" | V |
| Reaches readers past `memo`, `PureComponent`, hidden trees | DESIGN "Differences from context: Bailouts" | D |
| No selectors: reader re-renders on any change to its store | DESIGN API; `rerenders` explainer | D L |
| Compiler returns the memoized element; same-element bailout skips reconciling; own flag `enableSameElementBailout` | DCP-10 ("Problem", "Why a flag") | D |
| Rerenders explainer: selectors run every selector each update, re-render changed rows; use(store) re-renders every Row; no compiler also every RowView; compiler only the RowViews whose output changed (old and new selection; reviewer fix 5); edit renders one Row in each | rerenders explainer (observed: select = Row/RowView 1/1, 6/6, 6/1, selector calls 13; edit = 1/1 in all three); src/demos/rerenders/stores.jsx header; G4 "renders, and flashes match body counters" | L |
| Selection floor: with one or two reads per row, selectors win; inherent; store-side trims didn't close it | research/selection-floor.md ("What's left is inherent to the model", opt11 trims about 2%) | D |
| Keyed selection: per-row selected store, two rows re-render | sweep-store-keyed.jsx header; NEXT_STEPS §0; sandbox `keyed-demo` | D L |
| Partly compiled apps: uncompiled readers re-render everything they return | NEXT_STEPS §0 ("worse with partial coverage"); React semantics without memoization | D X |
| Shared derived data computed per reader unless shared | NEXT_STEPS §0 (derived-selectors: plain store loses; weakMemo recommended) | D |
| Benchmarks are synthetic; real-app data missing | NEXT_STEPS §2.2 | D |

## Patterns

| Claim | Source | Status |
|---|---|---|
| Store of stores: changing one item re-renders one component; adding re-renders the list | UST "supports stores of stores for granular updates"; sandbox `store-of-stores-demo` | V L |
| Keyed: like Solid's `createSelector`; first click one Row, then two | sweep-store-keyed.jsx header; sandbox `keyed-demo` steps | D L |
| Derived: immutable snapshots cached by identity; shared across components; different snapshot = different key, can't tear | shared-memo.js header comment; sandbox `derived-demo` (computed once per category per snapshot) | D L |
| Compiler doesn't memoize `f(use(a), use(b))` inline; hoisted reads work | NEXT_STEPS §5.1 | D |
| Deriving outside render from several stores can tear with a pending transition | UST "a value derived from several stores outside of render tears with a pending transition" | V |
| Shared derived data still open; client `cache()` leading option; weakMemo is the measured userland version | NEXT_STEPS D1, D2, §0 | D |
| Async actions sandbox: cart and status commit together | sandbox `async-action-demo` (expectNoConsole "cart=1, Not saved") | L |
| A store in context composes (`use(use(Ctx))`) | follows from `use()` accepting a context (returns the store) and then a store, FH:1433-1441; DESIGN "Differences from context" | V |

## Differences

| Claim | Source | Status |
|---|---|---|
| useState table rows ("can render less than useState": useState's eager bailout also skips renders, under narrower conditions, reviewer fix 6; hidden-reader row scoped as above) | DESIGN "Intentional differences from useState", DECISIONS (StrictMode, unmounted warnings) | D |
| Remount detection by setter identity needs another signal | DESIGN "Remounts" | D |
| Store can replace an app-wide context; no analog where scoping matters | DESIGN "Differences from context" intro | D |
| Context table rows (source, trigger, who re-renders, Suspense retries, roots, DevTools Store hook) | DESIGN "Differences from context"; DECISIONS B-16 | D |
| Each root commits updates on its own schedule | FS:63-66 comment ("each root commits on its own schedule") | V |

## Limits and decisions

| Claim | Source | Status |
|---|---|---|
| Consistency across roots not guaranteed; new root starts from latest | DESIGN "Intentional differences" | D |
| One work-in-progress tree per root assumed | DCP-17 "Still single-tree"; FH:1207-1215 (`root.current.alternate`) | V |
| Compiler inline `f(use(a), use(b))` | NEXT_STEPS §5.1 | D |
| Shared derived data undecided | NEXT_STEPS D1-D3 | D |
| Reading outside render undecided; recommendation is not to ship a latest-value read | NEXT_STEPS D5 | D |
| DevTools: no editing, no hook name (same for `use(context)`), Profiler detail view fallback | DECISIONS "Store values aren't editable...", "Follow-up (DevTools hook names)"; NEXT_STEPS §5.6 | D |
| Same-element bailout: own PR | NEXT_STEPS D6; DCP-10 "Why a flag" | D |
| No real-app data; plan to dogfood a store-heavy surface | NEXT_STEPS §2.2 | D |
| Optimistic stores and external interop not in v1 | NEXT_STEPS §5.7 | D |
| Independent writes rebase together; reading another store in a reducer is a possible spike | NEXT_STEPS §5.4; UST "two stores rebase like one combined store when a sync update interrupts a transition" | V D |
| Reducer error reporting edge cases | "Known limits of DCP-19" in DECISIONS; UST describes "reducer errors and held updates", "reducer error reporting and retention", "reducer errors passed to an outer boundary" | V |
| DCP index lines | DECISIONS DCP-1..20 headings and Decision bullets | D |
| DCP statuses: 1 superseded in part by 17 (state location, seq); 2 amended by 8; 4 by 12; 5 by 15; 9 by 11 and in part superseded by 17; 13 mechanism superseded by 17; 14 amended by 19; 18 by 20; 10 behind its own flag | DECISIONS headings ("amends ...", "supersedes the record-local state of DCP-1, DCP-9 and DCP-13") | D |
| DCP-17..20 have no Status line; listed as implemented | DECISIONS (no Status bullet); NEXT_STEPS §0 (implemented behind enableStore) | D |
| Indicator note: experimental-only `enableDefaultTransitionIndicator` flush applies to setState too | sandbox/explainers/README.md "Notes for authors" (processRootScheduleInMicrotask, not a rule of use(store) or lanes) | D |

## Diagram (mental model SVG)

| Claim | Source | Status |
|---|---|---|
| Record holds pending, lanes, readers and the committed state (baseState, baseQueue, value); like a Hook's queue, shared by every version of the root | `StoreRecord` FS:131-165 (`committed`); DESIGN Model "The record" | V |
| Work-in-progress HostRoot holds the states its render processed (render lanes, skipped lanes, value); like a Hook object, one per version of the tree | `StoreStates` FS:112-120; `processStoreRecords` FS:436; DESIGN Model "The HostRoot owns the states its render processed" | V |
| On commit, the state becomes the committed state (pointer swap) | `commitStoreState` FS:1021; DESIGN Model "Commit" | V |
| Readers read the HostRoot's state if the render processed the record, else the committed state | `getStoreStateForRender` FS:591-621; DESIGN Model "Read" | V |
| Readers subscribe to the record when they commit | FS:809-826, FH:1402-1418 | V |

## DESIGN.md re-check (after the reviewer's DCP-17..20 rewrite of Model)

Every row above that cites DESIGN was re-read against the new text. Changes: eager state and dispatch are per record ("when the record has nothing pending"), the no-record transition path (held updates, reported reducer error) is now in DESIGN Model, and reads of an unprocessed record use `record.committed`. The page now says all three. "Hidden trees" in DESIGN still says "never renders the older one"; the page uses the reviewer's scoped wording, backed by the ActivitySuspense test. No other row disagrees.

## Pass 1 fixes (claim-boundary audit, explainer.claim-ledger.md)

| Change on the page | Source | Status |
|---|---|---|
| Hydration exception added to "one commit never shows two versions" (mental model and No tearing) | FH:1249-1258 (`value = store._initial`); DESIGN "Server and hydration" (dehydrated HTML stays) | V |
| Suspense details: dropped "a context update doesn't retry for them" (contradicted) | ReactFiberNewContext.js retries every boundary showing a fallback; DESIGN "Suspense retries" | V |
| "React doesn't search the tree for readers; each is marked like setState marks its component" (was "no tree walk") | FS:776-787 (`enqueueConcurrentRenderForLaneOnMountedFiber`, path marked when the next render starts) | V |
| "Treat store values as immutable snapshots" (was "are") | nothing enforces immutability; shared-memo.js header assumes it | D |
| Reducer "never runs as part of a component", even when a read triggers it (first read on a new root) (was "readers don't run it") | FS:213-221, FS:625-633 (dispatcher nulled); `doubleInvokeStoreReducerDEV` runs from `useStore` FH:1218-1228 | V |
| No-root throw: held inside a transition or behind an already-held update | FS:325-343 (`pending !== null` holds urgent updates too); UST "an urgent update behind a held update is rebased on top of it" | V |
| DCP-14 index: "when no root reads the store" | RS:47 (`records.length === 0`) | V |
| useState table: "Suspense, and Activity except for the hidden-reader case"; drop-and-recover and no-root throw moved to the different column | DCP-14; ActivitySuspense-test store-semantics note | V |
| Benchmark link narrowed to "Measurements are in the benchmark report" | report is stale and on hold (orchestrator) | D |
| "A common workaround is to split providers and memoize values" | common practice, hedged | X |
| Hedges: "open source" added to experimental-only claims; "once" dropped from computation claims (reads still see one state); fixed-reducer rationale is replaying outside any component; selection floor stated as mechanism (what runs), heading renamed; compiler reuses an element when its inputs didn't change and the bailout needs an only child (DCP-10); uncompiled readers re-render children unless memoized by hand; store-of-stores add re-renders every item in the uncompiled sandbox (steps: Todo 3); store in context also re-renders on a Provider switch; single-tree claim attributed to DCP-17 and marked untested (FS:155-160, FS:957 are render-scoped too) | explainer.claim-ledger.md "Hedges to check" 1-10 | D V |

## Reviewer wording for pass 1 (applied)

| Change on the page | Source | Status |
|---|---|---|
| "Outside hydration, two components in one commit can't show different versions"; hydrating readers render the initial value while client-rendered readers can show the latest, and catch up in a sync render right after | FH:1249-1258; FS:1190-1199; DCP-12; reviewer | V |
| Suspense details: "a store update retries only boundaries waiting on that store, and a context update retries every fallback boundary below its Provider" | DCP-16 (amended in DECISIONS.md); ReactFiberNewContext.js; reviewer | V |
| Performance: store update goes straight to subscribed readers without a search; context walks the subtree for consumers; each reader marked like a setState on it, which marks its path to the root | FS:776-787; DECISIONS "Store updates mark readers without walking to the root from each one"; reviewer | V |
| Reducers: normally the HostRoot, once per root per render; eager at dispatch when nothing is pending; always without a dispatcher. Details: first read on a root (latest value, settle held), first read of a record created mid-render (render lanes), StrictMode replay, eager once per root with several roots | FS:213-221, FS:622-633, FS:740-758; FH:1218-1228; reviewer | V |
| Reducer errors: `update()` throws only outside a transition with nothing held. Details: transition updates held, and so is any update after a held one; held reducer errors are reported when applied, not thrown | RS:47-65; FS:321-343, FS:376-386; reviewer | V |

## Glossary entries added in pass 2

| Claim | Source | Status |
|---|---|---|
| Root: a tree created with `createRoot` or `hydrateRoot`; a page can have several | React API; UST "works with multiple roots" | V |
| Fiber: React's internal object for one component in the tree (simplified) | ReactInternalTypes.js `Fiber` | V |
| HostRoot: top fiber of a root's tree; the states of the stores a render processed live on it and become each store's committed state at commit | DESIGN Model "The HostRoot owns the states its render processed" and "Commit"; `RootState.storeStates` FS:112-120; `commitStoreState` FS:1021; DCP-17 | V |
| Work in progress: the version of the tree React is rendering, before it commits | React fiber model; FH:1207-1215 (`root.current.alternate`) | V |
