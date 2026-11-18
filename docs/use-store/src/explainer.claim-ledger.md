# Claim ledger: explainer.src.html (pass 1, claim boundaries)

This is an independent audit of every factual or technical claim on `docs/use-store/src/explainer.src.html`, checked against the working tree on 2026-11-01. The author's ledger (`explainer.claims.md`) was used as a lead only. Each source below was re-read.

**Verdicts:** **supported**; **overreach** (the source supports a narrower claim); **unsupported** (no source found); **contradicted** (the source says otherwise).

**Path keys:**
- `RS` = `packages/react/src/ReactStore.js`
- `FS` = `packages/react-reconciler/src/ReactFiberStore.js`
- `FH` = `packages/react-reconciler/src/ReactFiberHooks.js`
- `WL` = `packages/react-reconciler/src/ReactFiberWorkLoop.js`
- `CU` = `packages/react-reconciler/src/ReactFiberConcurrentUpdates.js`
- `NC` = `packages/react-reconciler/src/ReactFiberNewContext.js`
- `UST` = `packages/react-reconciler/src/__tests__/ReactUseStore-test.js`
- `DST` = `packages/react-dom/src/__tests__/ReactDOMStore-test.js`
- `AST` = `packages/react-reconciler/src/__tests__/ActivitySuspense-test.js`
- `HNR` = `packages/react-reconciler/src/__tests__/ReactHooksWithNoopRendererUseStore-test.js`
- `D-n` = `docs/use-store/DECISIONS.md` line n
- `DS-n` = `docs/use-store/DESIGN.md` line n
- `NS` = `docs/use-store/NEXT_STEPS.md`
- `steps:x` = `docs/use-store/src/sandboxes/explainer/x.steps.json`
- `G4` = `docs/use-store/sandbox/explainers/README.md` "Checking (G4)"

Test references use the line where the `it(` starts.

## Header

| ID | Claim | Verdict | Source |
|---|---|---|---|
| H1 | "Updates follow the same rules as `useState`, including transitions and rebasing" | supported | DS-46; UST:223, UST:248 |
| H2 | "they only re-render the components that read the store" | supported | FS:776-787; UST:164 |
| H3 | "Only `Count` renders. `App` doesn't … re-render, and there's no Provider" | supported | steps:intro (`expectRenders` Count 1, App 0) |
| H4 | "behind the `enableStore` flag, it's only in the experimental build, and the export is `unstable_createStore`" | supported (OSS) | `shared/ReactFeatureFlags.js:117` (`__EXPERIMENTAL__`); `packages/react/index.experimental.js:39`. See hedge 1: www and RN-fb are `__VARIANT__` (`ReactFeatureFlags.www-dynamic.js:38`, `native-fb-dynamic.js:25`) |
| H5 | "Nothing here has shipped" | supported | NS §0 ("local WIP commits") |
| H6 | "Every sandbox runs in your browser, offline" | supported | G4 (file://, non-file requests blocked) |
| H7 | The stepped ones use React's mock scheduler; "not how a browser schedules work" | supported | `sandbox/explainers/README.md`; join and activity use `data-stepper` |

## The problem

| ID | Claim | Verdict | Source |
|---|---|---|---|
| P1 | Context "works with transitions but re-renders every consumer" | supported | React semantics; steps:context |
| P2 | Context re-renders every reader "even components that only use a part of the value that didn't change" | supported | steps:context (`ContextTheme` 1) |
| P3 | "Teams split providers and memoize values to work around it" | unsupported | Not in any repo source. I searched DESIGN, DECISIONS, NEXT_STEPS and research/. It's general React practice, so the fix is optional |
| P4 | `ContextTheme` re-renders "because the Provider's value is a new object" | supported | `sandboxes/explainer/context.jsx:9` (`value={{count, theme}}`); steps:context |
| P5 | `useSyncExternalStore` only re-renders "the components whose snapshot changed" | supported | FH:2157-2164 (`checkIfSnapshotChanged`) |
| P6 | An external store change "always renders synchronously, even inside `startTransition`" | supported | FH:2181-2186 (`forceStoreRerender`, `SyncLane`) |
| P7 | "If that render suspends, the nearest Suspense boundary shows its fallback" | supported | Follows from P6: a sync-lane render that suspends shows the fallback. Documented in the react.dev `useSyncExternalStore` caveats (not checkable offline) |
| P8 | Tearing definition | supported | G4 tearing check ("the global tears") |
| P9 | `use(store)` gets both: only readers re-render, and a transition update is a transition, "without tearing" | supported | UST:223, UST:669; G4 tearing |

## The API

| ID | Claim | Verdict | Source |
|---|---|---|---|
| A1 | Without a reducer, a function is called with the current value; anything else replaces it | supported | RS:16-19 |
| A2 | With a reducer, the argument is the action, "even when it's a function" | supported | RS:121 (the reducer is used as is) |
| A3 | "The reducer is fixed when the store is created. That's what lets React replay an update on top of any version of the value" | supported (rationale) | RS:118-121 comment. See hedge 3 |
| A4 | "There's no lazy initializer. The initial value is computed before anything renders" | supported | RS:123 (no function check); DS-51 |
| A5 | `store.update` is bound to the store and takes one argument | supported | RS:135; UST:2367 |
| A6 | A second callback argument warns in development, like `setState` | supported | RS:22-31; UST:1622 |
| A7 | Update from anywhere: before the first render, an event handler, an effect, an async action, a timer, outside React | supported | UST:83, UST:513, UST:542, UST:1267 |
| A8 | "An update inside `startTransition` is a transition" | supported | WL:924-928; UST:223 |
| A9 | "Inside `startGestureTransition`, `update()` throws" | supported | RS:33-44; UST:2203 |
| A10 | Outside a function component, `use(store)` throws the invalid Hook call error | supported | FH:1196-1199; UST:1560 |
| A11 | In `useMemo`, a reducer or an effect, it gets "the same warning or error as calling any Hook there" | supported | DS-66; `ReactHooksUseStore-test.internal.js:751` (useMemo). The effect and reducer cases are DESIGN only |
| A12 | "There's no way to read a store outside render, so no `store.get()`" | supported | RS:116-134 (no read method) |
| A13 | Reading outside render "is still being decided" | supported | NS D5 |
| A14 | No selectors: use granular stores and the compiler | supported | DS-13 |
| A15 | The api-demo sandbox (a store with a reducer and one without) | supported | steps:api |

## The mental model

| ID | Claim | Verdict | Source |
|---|---|---|---|
| M1 | "Each root that reads the store keeps its own copy of the update queue" | supported | FS:63-70, FS:197-238 |
| M2 | "the root computes the store's value for that render once, with the same rules `useReducer` uses" | supported | FS:429-586; DCP-17 (D-258). See hedge 2 on "once" |
| M3 | "Every component in the render reads that one value" | supported | FH:1207-1217; FS:591-621 |
| M4 | The update goes to every root that reads the store. The lane comes from the event's priority, like `setState`: transition, sync in a click, default outside any event | supported | RS:73-95; WL:912-931 |
| M5 | The root queues it on its HostRoot through the concurrent queue and marks every reader with the lane | supported | FS:771-787 |
| M6 | "A render that's already running doesn't see the update" | supported | FS:771-773; D-257; UST:571 |
| M7 | Render lanes are applied, other lanes skipped, and the updates after a skipped one are kept | supported | FS:509-572 |
| M8 | "`useReducer`'s algorithm, run once per root instead of once per component" | supported | FS:63-70 |
| M9 | "A store with nothing pending is read from the committed state directly" | supported | FS:595-600 |
| M10 | If the render skipped updates, the component gets their lanes and renders again | supported | FH:1235-1247 |
| M11 | Commit is a pointer swap, and "the reducer doesn't run again" | supported | FS:1013-1021, FS:1050-1066 |
| M12 | "An update made during the render waits for the next one" | supported | FS:771-773; HNR "keeps restarting until there are no more new updates" |
| M13 | "Two components in the same commit can't show different versions of a store" | **overreach** | UST:669 covers non-hydrating readers. But a hydrating reader renders `_initial` whatever the client value is (FH:1250-1258), and a dehydrated boundary keeps the server HTML after a store update (DST:1099; the page's own hydration section). So readers outside a boundary can show the new value while the boundary shows the initial one, until the sync catch-up (FS:1190-1199) |
| M14 | The store keeps the latest value in dispatch order, and a new root starts from it plus held transition updates | supported | RS:122-123; FS:208-221, FS:239-305 |
| M15 | The latest value is lazy, "so the reducer runs about as often as it would for `useReducer`" | supported | RS:63-72; UST:1492; DCP-6 |
| G1 | Glossary, Store: holds the reducer, initial value, latest value and records | supported | RS:116-134 |
| G2 | Glossary, Record: uncommitted updates, their lanes, and the readers | supported | FS:131-165 |
| G3 | Glossary, Base state and base queue mean the same as in `useReducer` | supported | FS:85-96 |
| G4 | Glossary, Skipped lanes: readers render again in them | supported | FS:94-96; FH:1240-1247 |
| G5 | Glossary, Reader: a Suspense boundary can be one | supported | FS:145-148 |
| G6 | Glossary, Eager state: computed per root when nothing is pending there; an unchanged value is dropped without rendering | supported | FS:740-751; UST:189 |
| G7 | Glossary, Entangled: transitions that update the same store commit together | supported | FS:797-806; UST:1420 |
| G8 | Glossary, Held update | supported | FS:316-344; DCP-18 |
| C1 | "Where this lives": file roles; a record is split like a Hook; the HostRoot holds the `StoreState`s | supported | FS:63-70, FS:112-120; DCP-17 (D-253-256) |
| DG1 | Diagram: the record holds pending, lanes, readers and the committed state; the WIP HostRoot holds the processed states; readers fall back to committed; commit is a swap; readers subscribe at commit | supported | FS:131-165, FS:591-621, FS:1021, FS:809-826 |

## Conditional reads and subscriptions

| ID | Claim | Verdict | Source |
|---|---|---|---|
| S1 | No Hook slot, so a store can be read in a condition, a loop or after an early return | supported | FH:1349-1355; UST:724, UST:768 |
| S2 | "subscribed to exactly the stores its last committed render read" | supported | FH:1356-1419; UST:966, UST:2165 |
| S3 | Reads are record/value pairs compared with the last render; a change counts as an update, otherwise it bails out | supported | FH:1266-1278, FH:1314-1347 |
| S4 | One insertion effect per component, "only pushed when the set of stores changes" | supported | FH:1389-1397; DCP-8; UST:928 |
| S5 | Subscribes in the commit before layout effects, so a layout-effect update isn't missed | supported | FH:1402-1406; UST:513 |
| S6 | "Deleting the component unsubscribes it" | supported | FS:878-892; UST:887 |
| S7 | On subscribe, the component is marked with every pending lane | supported | FS:809-826; DCP-15 |
| S8 | When the last reader unsubscribes and nothing is pending, the record is dropped in the same commit, and the root isn't kept alive | supported | FS:1201-1223; UST:858; DST:229 |
| S9 | Panel: "A store that nothing reads has no record" | supported | G4 subscriptions check; FS:1205-1223 |

## Concurrency

| ID | Claim | Verdict | Source |
|---|---|---|---|
| K1 | Batches with other updates in the same event | supported | UST:1219 |
| K2 | A transition update is a transition, and a sync update is rebased over a pending transition | supported | UST:223, UST:248 |
| K3 | Queue explainer: real React, mock scheduler, and the preview is checked against React on random sequences | supported | G4 queue (200 seeds) |
| K4 | `1 * 2 = 2`, then `(1 + 1) * 2 = 4` | supported | FS:509-572; same shape as UST:248 |
| K5 | `enableDefaultTransitionIndicator` is "only on in experimental"; it flushes waiting default updates at the end of the event, `setState` does the same, and stable waits | supported (OSS) | `ReactFeatureFlags.js:113`; `ReactFiberRootScheduler.js:271-285`. See hedge 1 (www and native-fb are `true`) |
| K6 | "So one commit never shows two versions of a store" | **overreach** | Same as M13 (hydration) |
| K7 | Tearing demo: the global tears; uSES re-renders every cell synchronously; from a message event the update gets the default lane and the transition commits first; from a click it gets sync and the transition restarts | supported | G4 tearing; `getNextLanes` (default doesn't interrupt a transition) |
| K8 | A reader that mounts mid-transition shows the committed value, then updates in the same commit | supported | UST:298, UST:350; steps:join |
| K9 | The read skips the update and merges its lanes; "no extra render or fixup effect" | supported | FH:1235-1247; DCP-3 |
| K10 | Join sandbox walkthrough | supported | steps:join |
| K11 | A component mounted by the transition itself reads the new value | supported | UST:392 |
| K12 | Async actions: updates before and after `await` commit together | supported | UST:1267; steps:async-action |
| K13 | A component whose value comes from a pending action suspends until it's done | supported | FH:1279-1306. It applies to re-renders whose value changed, like `useState` |
| HD1 | A transition update to an unread store is held, so an urgent mount doesn't see it early | supported | FS:316-344; UST:2378; steps:held |
| HD2 | At first it was applied right away; the ponyfill port found that | supported | DCP-18 "Bug" (D-268) |
| HD3 | Held sandbox: reader shows 1, panel shows held, then 2 | supported | steps:held |
| HD4 | An urgent update after a held one is held too and rebased | supported | FS:327-342; UST:2528 |
| HD5 | A root that starts reading takes the held updates, schedules their lanes and entangles them | supported | FS:239-305; DCP-20 |
| HD6 | Done updates are applied to the latest value at every commit and when a root starts reading | supported | FS:1054-1058, FS:217, FS:350-394; UST:2454 |
| HD7 | A same-transition mount sees the held update | supported | UST:2422 |
| HD8 | With several roots, "done" is judged on the committing root | supported | FS:365-369; DCP-18 Limits (D-272) |

## Suspense, Activity and hydration

| ID | Claim | Verdict | Source |
|---|---|---|---|
| SU1 | A store update retries the boundary of a component that suspended after reading it | supported | UST:1917, UST:1948; steps:suspense |
| SU2 | A component that suspends on mount never subscribes; `use(use(store))` would hang | supported | DCP-16 Problem (D-207) |
| SU3 | React collects the stores read by the suspended component and the ones above it, up to the boundary | supported | FS:900-933; `ReactFiberThrow.js:473` |
| SU4 | The boundary subscribes while the fallback shows, re-renders on an update, and unsubscribes when its children commit | supported | FS:966-983; UST:1917 |
| SU5 | Panel lists `Suspense` as the reader, then `Profile` | supported | steps:suspense |
| SU6 | Siblings rendered before the suspended component aren't collected, because they can't change what it renders | supported | FS:906-928 (return path only) |
| SU7 | "…and a context update doesn't retry for them either" | **contradicted** | NC:305-322 (upstream #35839, #36160): a context change marks every client-rendered boundary showing a fallback for retry, without checking who read the context: "conservatively mark the Suspense boundary itself for retry." The page's own third bullet says so. DCP-16 (D-209) repeats the stale claim |
| SU8 | Collection happens only when a component suspends; a normal read does no extra work | supported | FH:1194-1308 (no collection); FS:894-933 is called from the throw path |
| SU9 | A store update only schedules its readers, while a Provider change retries every boundary below it that's showing a fallback | supported | FS:776-787; NC:305-322 |
| AC1 | Hidden Activity readers stay subscribed, update at offscreen priority, and show the latest value when revealed | supported | FH:1402-1406; UST:1137; steps:activity |
| AC2 | Activity walkthrough (click is sync, hidden reader waits, flush, reveal) | supported | steps:activity; WL:930 |
| AC3 | Difference from `useState`: a hidden reader renders the committed value | supported | AST:644 (note at :683); DCP-17 (D-263); DS-56 |
| AC4 | Readers in a revealed tree read the same version, using the root's lanes | supported | FH:1233-1239; UST:1650; DCP-13 |
| HY1 | The server renders the initial value, the client hydrates with it, and readers catch up after; "no mismatch and no extra API" | supported | DST:87, DST:123, DST:135; FH:1249-1258; FS:1190-1199; steps:hydration |
| HY2 | Console shows server `light`, hydration `light`, then `dark`, with no hydration errors | supported | steps:hydration asserts server HTML, `rendered dark` and no `hydration error`. The hydration `light` follows from FH:1257 |
| HY3 | It's the uSES model, with the initial value as the server snapshot | supported | DCP-4 (D-42) |
| HY4 | A hydrating reader computes the client value, joins a pending transition, and renders again at sync after the commit | supported | FH:1216-1258; FS:1190-1199; DST:315 |
| HY5 | Server updates aren't rendered; create the store with the value instead | supported | DST:123; DCP-4 |
| HY6 | An update during a server render doesn't warn, and can't change this request's HTML or another's | supported | D-94; `react-server/src/ReactFizzHooks.js:852` (Fizz reads `_initial`) |
| HY7 | A store update isn't routed into a dehydrated boundary, and the server HTML stays until it hydrates | supported | DST:1099 |
| HY8 | Server Components throw "Cannot read a store from a Server Component." | supported | `react-server/src/ReactFlightHooks.js:123,174` |

## Rules and errors

| ID | Claim | Verdict | Source |
|---|---|---|---|
| R1 | Updating a store while rendering warns, even when the component reads it | supported | FS:724-730; UST:1526; steps:render-update |
| R2 | It renders after the current render and "isn't thrown away if that render suspends or is discarded" | supported | HNR:274 (store-semantics: "aren't discarded when the render suspends"); DCP-7 |
| R3 | "An update in render that always runs loops" | supported | DST:536 ("Maximum update depth exceeded") |
| R4 | Adjusting state while rendering doesn't carry over | supported | DCP-7 "Not supported" (D-68) |
| R5 | The reducer runs outside any component; a Hook or context read in it throws, and readers throw that error | supported | FS:449-454; UST:3095; `ReactHooksUseStore-test.internal.js:602` |
| R6 | If nothing is pending on a root, the reducer runs at dispatch; with several roots, once per root | supported | FS:740-758 |
| R7 | "Otherwise it runs at the HostRoot … Components that read the store don't run it" | **overreach** | A reader's `use()` call can run the reducer, though always without a dispatcher: the first read on a root folds the latest value and settles held updates (FH:1216 → FS:213-221); a record created after the HostRoot began is processed on its first read (FS:622-633); StrictMode replays it for readers (FH:1218-1227). The very next bullet says "runs the reducer an extra time for readers" |
| R8 | StrictMode runs the reducer an extra time for readers in development | supported | FH:1218-1227; FS:693-712; UST:1332, UST:1882 |
| E1 | A reducer that throws is handled like a render error: every reader throws, boundaries catch, the update is dropped and the store recovers | supported | FS:533-544, FS:662-675, FS:1022-1042; UST:1745; steps:errors |
| E2 | Errors sandbox: after retry the count is back to its value before the update | supported | steps:errors |
| E3 | The commit drops the update the way an error boundary drops a `useReducer` queue | supported | FS:536-538; DCP-14 (D-185) |
| E4 | If no committed boundary logs it (e.g. the only reader is hidden), it's reported like an uncaught error | supported | FS:1022-1036, FS:1111-1129; UST:1806; DCP-19 |
| E5 | "If no root reads the store … `store.update()` throws, and the update isn't applied. Inside a transition, the update is held instead" | **overreach** | RS:47-61 and UST:1856 cover the plain case. But an urgent update behind a held update is held too (FS:327-328), so `update()` doesn't throw and the error is reported later (DCP-19, D-286). A held update a root takes over throws in its reader instead of being reported (UST:2573) |
| E6 | Store updates never warn about unmounted components | supported | D-71-73 |
| E7 | No warning about a large number of updates in `startTransition` | supported | D-86; WL:912-931 (no `_updatedFibers`) |

## The performance model

| ID | Claim | Verdict | Source |
|---|---|---|---|
| PF1 | Which stores a component reads decides when it re-renders; an update schedules the readers directly | supported | FS:776-787 |
| PF2 | "There's no tree walk" | **overreach** | Each reader is marked by walking its return path to the root when the next render starts (CU:84-96, CU:230-258), with a shortcut for siblings. FS:776-779 says so: "The concurrent queue walks to the root from each one." What's true: there's no search of the tree for readers, and no walk down the tree like context propagation (NC) |
| PF3 | "nothing in between renders" | supported | childLanes bailout; see PF4 |
| PF4 | An update reaches readers past `memo`, `PureComponent` and hidden trees without rendering the components in between | supported | DS-65; `ReactNewContextUseStore-test.js:100`; `ReactContextPropagationUseStore-test.js:228, 518, 638` |
| PF5 | "Every reader of a changed store re-renders, and the React Compiler is what keeps that cheap" | supported (mechanism) | DCP-10 Problem (D-130). See hedge 4 |
| PF6 | No selectors, so a reader re-renders when any part of its store changes | supported | DS-13; `src/demos/runtime/rerenders-check.js:43-46` |
| PF7 | "When a reader re-renders and its output didn't change, the compiler returns the element it returned last time" | supported | `src/demos/rerenders/stores.jsx:1-6`; rerenders-check.js:46. See hedge 5 |
| PF8 | The same-element bailout skips reconciling that element, behind `enableSameElementBailout` "because it runs for every function component" | supported | DCP-10 (D-131, D-145); `ReactFeatureFlags.js:122`. See hedge 5 |
| PF9 | Rerenders explainer: selectors run for every row and re-render the changed rows; without the compiler every Row and RowView re-render; with it, only the old and new selection's RowViews; an edit renders one Row | supported | rerenders-check.js:32-46; `rerenders/selectors.jsx:1-4` |
| PF10 | "When each row reads only one or two values, selectors win" | supported (measured) | `research/selection-floor.md:3, 44`; NS §0 sweeps (1.3–1.5×). See hedge 4 |
| PF11 | "That's inherent to having no selectors, and I don't think a store-side optimization closes it" | supported (opinion) | selection-floor.md:40-44 (store-side trims about 2%) |
| PF12 | Keyed selection: a selection updates two stores, and two rows re-render | supported | steps:keyed |
| PF13 | "In a partly compiled app, readers that aren't compiled re-render everything they return" | supported | React semantics; NS §0. See hedge 6 |
| PF14 | Shared expensive derived data "is computed by each reader, unless you share it" | supported | `benchmark-report.html` ("the compiler memoizes per component, so use(store) computes it five times"); NS §0 |
| PF15 | "The benchmark report has the measurements for all of this, against Redux and Zustand, with and without the compiler" | **overreach** | `benchmark-report.html` (Oct 31 06:04) has no keyed-selection results: `store-keyed` gets 0 hits, though `data/KEYS.md` has 155. Keyed results exist only in NS §0 and `data/bench-data.json`. Redux, Zustand, with and without the compiler, partial coverage and `store-memo` are present |
| PF16 | "Those are synthetic benchmarks. Data from a real app is still missing" | supported | NS §2.2 |

## Patterns

| ID | Claim | Verdict | Source |
|---|---|---|---|
| PT1 | Store of stores: changing an item re-renders its one reader; adding an item re-renders the list | supported | UST:792; steps:store-of-stores (Todo 1 / TodoList 0; add: TodoList 1, Todo 3). See hedge 7 |
| PT2 | Keyed selection updates the previous row's store and the next row's | supported | `sandboxes/explainer/keyed.jsx:12-16`; steps:keyed |
| PT3 | "like Solid's `createSelector`" | supported | NS §0 |
| PT4 | First click renders one Row, then two | supported | steps:keyed |
| PT5 | "Store values are immutable snapshots" | **overreach** | Nothing enforces it. `createStore` and `update` neither copy nor freeze (RS:60, RS:121-123), and a reducer that mutates and returns the same object is dropped by the eager bailout (FS:745-751). The weakMemo caching and "can't tear" claims rest on it being a convention |
| PT6 | A derivation cached by argument identity is shared, and a different snapshot is a different key, "so it can't tear" | supported (given PT5's convention) | `sandboxes/explainer/derived.jsx:1-20`; steps:derived |
| PT7 | Derived sandbox: computed twice; after an add, five re-render and it's still once per category | supported | steps:derived ("(2 so far)", "(4 so far)", `CategoryStats` 5) |
| PT8 | The compiler doesn't memoize `f(use(a), use(b))` inline yet; hoisted reads work | supported | NS §5.1 (`FlattenScopesWithHooksOrUseHIR`). Doc only; I didn't find a compiler fixture |
| PT9 | Deriving outside render from several stores can tear with a pending transition | supported | UST:2107 |
| PT10 | Shared derived data is open; a render-scoped `cache()` is the leading option; `weakMemo` is what the benchmarks measure | supported | NS D1, D2; benchmark report (`store-memo`) |
| PT11 | Async action sandbox: the cart waits, then cart and status change in one commit | supported | steps:async-action |
| PT12 | Context and stores compose: `use(use(SessionStore))` | supported | FH:1424-1441 (`use` handles a context, then a store). No direct test of a context holding a store |
| PT13 | "Components still only re-render when the store changes" | supported | Holds while the Provider value is stable. See hedge 8 |

## Differences from useState and Context

| ID | Claim | Verdict | Source |
|---|---|---|---|
| D1 | By default, store updates follow `useState`'s rules | supported | DS-46 |
| D2 | Same: batching | supported | UST:1219 |
| D3 | Same: transitions, entanglement, rebasing | supported | UST:223, UST:248, UST:1420 |
| D4 | Same: async actions, `flushSync`, `useDeferredValue` | supported | UST:1267, UST:1244, UST:1304 |
| D5 | Same: "Suspense and Activity" | **overreach** | Contradicted by the same table's last row and by the Activity section ("There's one difference from `useState` here"): AST:683, DS-56 |
| D6 | Same: eager state when nothing is pending | supported | FS:740-758; DS-50 |
| D7 | Same: StrictMode runs reducers twice in development | supported | FH:1218-1227; UST:1332 |
| D8 | Same: reducer errors caught by error boundaries | supported | UST:1578, UST:1745. See hedge 9 |
| D9 | Same: readers that mount during a transition join it | supported | UST:298 |
| D10 | Different: keeps its value across unmount and remount | supported | UST:1064 |
| D11 | Different: shared by every component and root | supported | UST:1186 |
| D12 | Different: updating during render warns | supported | UST:1526 |
| D13 | Different: never warns about unmounted components | supported | D-71 |
| D14 | Different: an update to the same value doesn't render at all, "so it can render less than `useState`" | supported | FS:740-751; DS-50 |
| D15 | Different: fixed reducer, no lazy initializer | supported | RS:108-123 |
| D16 | Different: the server renders the initial value, and clients catch up | supported | DCP-4, DCP-12 |
| D17 | Different: a hidden reader can render the committed value without the older one first | supported | AST:683 |
| D18 | A stable `update`, so remount detection by setter identity needs another signal | supported | RS:135; DS-48 |
| CX1 | A store can replace an app-wide context, but has no equivalent of the nearest Provider, defaults, shadowing or per-request values | supported | DS-61 |
| CX2 | Context table: where the value comes from, and what changes it | supported | RS:108-135; React semantics |
| CX3 | Who re-renders: every consumer vs only readers of that store | supported | FS:776-787; steps:context |
| CX4 | Suspense retries: every boundary below the Provider that shows a fallback vs only boundaries waiting on the store | supported | NC:305-322; FS:966-983 |
| CX5 | Several roots: shared, and each root commits on its own schedule | supported | FS:63-67; UST:1186 |
| CX6 | DevTools: shows a `Store` hook and reports a changed hook | supported | D-96 (B-16); DS-63 |

## Limits and decisions

| ID | Claim | Verdict | Source |
|---|---|---|---|
| L1 | Consistency across roots isn't guaranteed; a new root starts from the latest value | supported | DS-44; FS:208-221 |
| L2 | One render in progress per root; "Supporting several in-progress trees would change only how it finds it" | supported (design claim) | FH:1207-1215; DCP-17 "Still single-tree" (D-264). See hedge 10 |
| L3 | Inline `f(use(a), use(b))` isn't memoized and "needs a compiler fix before people learn the inline form" | supported | NS §5.1 |
| L4 | Shared derived data isn't decided; `cache()` leads; `weakMemo` works today | supported | NS D1 |
| L5 | Reading outside render isn't decided; the recommendation is not to ship a latest-value read | supported | NS D5 |
| L6 | DevTools: not editable; no hook name (also true of `use(context)`); the Profiler detail view can fall back | supported | D-92, D-98; NS §5.6 |
| L7 | The same-element bailout gets its own review and PR | supported | NS D6; D-145 |
| L8 | No real-app data; the plan is a store-heavy surface, measuring renders and latency | supported | NS §2.2 |
| L9 | Not in v1: optimistic stores, external interop and observables | supported | NS §5.7 |
| L10 | Independent updates to several stores rebase together; reading another store in a reducer is a possible follow-up | supported | UST:2011, UST:2067; NS §5.4 |
| L11 | Edge cases: identity matching; a hidden boundary deleted before reveal; this needs an offscreen render, which in practice means an update during render | supported | D-300-302 |
| X1 | DCP index: the DCP-1–13, 15, 16 and 18–20 one-liners and statuses | supported | DECISIONS headings and Decision bullets; DCP-17 header (D-250) for the supersessions |
| X2 | DCP-14: "…and with no readers `update()` throws" | **overreach** | The condition is no records, i.e. no root reads the store (RS:46-47), not no readers. A record with no readers but pending updates survives (FS:1212-1216), and `update()` doesn't throw then. The page's body text ("If no root reads the store") is right |
| X3 | DCP-17: "Updates are processed once per root per render" | supported | D-258. See hedge 2 |
| X4 | "DCP-17 to DCP-20 don't have a status line in DECISIONS.md" | supported | D-250-292 |

**Counts (190 claims):** 179 supported, 9 overreach, 1 contradicted, 1 unsupported. The ledger passes `validate_claim_ledger.py`, with overreach and contradicted mapped to `uncertain`/`qualify`.

## Required fixes

1. **M13 / K6, tearing exception (overreach).** Mental model: "Two components in the same commit can't show different versions of a store." No tearing: "So one commit never shows two versions of a store." Proposed: "…can't show different versions of a store. The one exception is hydration: a reader that's hydrating shows the initial value, to match the server HTML, and renders the latest value right after."
2. **SU7, context and siblings (contradicted).** "They can't change what it renders, and a context update doesn't retry for them either." Proposed: "Siblings that rendered before the component that suspended aren't collected, because they can't change what it renders." Drop the context half. (DCP-16 at D-209 has the same stale clause, for the author to raise; it isn't a page fix.)
3. **PF2, "no tree walk" (overreach).** "There's no tree walk, and nothing in between renders." Proposed: "React doesn't search the tree for readers. Each one is marked the way a `setState` marks its component, and nothing in between renders."
4. **PT5, immutable snapshots (overreach).** "Store values are immutable snapshots, so a derivation can be cached by the identity of its arguments." Proposed: "Treat store values as immutable snapshots, the way you treat `useState` values. Then a derivation can be cached by the identity of its arguments."
5. **R7, readers don't run the reducer (overreach).** "Otherwise it runs at the HostRoot, when a render processes the update. Components that read the store don't run it." Proposed: "Otherwise it runs at the HostRoot, when a render processes the update. It never runs as part of a component: even when a read triggers it, such as the first read on a new root, it runs without the component's Hooks or context."
6. **E5, no-root throw (overreach).** "So `store.update()` throws, and the update isn't applied. Inside a transition, the update is held instead…" Proposed: "So `store.update()` throws, and the update isn't applied. Inside a transition, or behind an update that's already held, the update is held instead, and if its reducer throws when it's applied, React reports the error."
7. **X2, DCP-14 index (overreach).** "…and with no readers `update()` throws." Proposed: "…and when no root reads the store, `update()` throws."
8. **D5, table row (overreach).** "Same as useState: Suspense and Activity." Proposed: "Suspense, and Activity except for the hidden-reader case."
9. **PF15, benchmark report scope (overreach).** "The benchmark report has the measurements for all of this." The report has no keyed-selection results. Proposed: either regenerate the report with the `store-keyed` sweeps (coordinate with data-eng), or write "The benchmark report has the measurements for selectors, partial compiler coverage and derived data…"
10. **P3 (unsupported, optional).** "Teams split providers and memoize values to work around it." It's common practice but no source backs it. Keep it, or write "The usual workaround is to split providers and memoize values."

## Hedges to check

1. **"Only in the experimental build"** (H4, K5). True for OSS. `enableStore` and `enableSameElementBailout` are `__VARIANT__` on www and RN-fb, and `enableDefaultTransitionIndicator` is `true` on www and native-fb. Fine for a public reader. Add "in open source" if Meta readers are in scope.
2. **"Once" per render** (M2, X3, the No tearing "computed once for that render"). DCP-17 (D-263) says that on error paths the reducer runs once per HostRoot begin, and a record created mid-render is processed on its first read (FS:622-633). Readers still see one state, so the claim about reads holds. The claim about computation is slightly strong.
3. **Fixed-reducer rationale** (A3). `useReducer` rebases with a reducer that can change between renders, so being fixed isn't strictly "what lets React replay." What forces it is that the reducer runs outside any component. Consider: "That's what lets React replay an update on any version of the value, outside any component."
4. **Perf claims that imply measurement** (PF5 "keeps that cheap", PF10 "selectors win"). Both are backed by benchmarks the page links to, so neither is a number. "Selectors win" is a measured result stated as fact. Consider making it a mechanism: "a couple of selector calls cost less than running the row's component."
5. **The compiler's element and the bailout** (PF7, PF8). The compiler reuses the element when the values it depends on didn't change, not when the "output didn't change." The same-element bailout applies only when that element is the component's only child and of a supported type (DCP-10, D-143-144). Consider "when its inputs didn't change" and "skips reconciling it when it's the only child."
6. **"Re-render everything they return"** (PF13). Children wrapped in `memo`, or passed in as `children`, still bail out. Consider "re-render their children, unless you memoize them by hand."
7. **Store of stores, add** (PT1). The sandbox (no compiler) also re-renders every `Todo` on add (steps: Todo 3). The page's "re-renders the list" is true but reads as list-only.
8. **Store in context** (PT13). Readers also re-render when the Provider switches to a different store.
9. **"Reducer errors are caught by error boundaries" listed as same** (D8). The store drops the update and keeps its prior value, and with no root reading it, `update()` throws. Neither is `useState` behavior. Consider moving the drop-and-recover part to the right column.
10. **Single-tree assumption** (L2). "Would change only how it finds it" repeats DCP-17's assertion (D-264). It's untested, and other render-scoped state assumes one render at a time: module-level `storeRenderLanes` (FS:957) and the per-record `lastVersion`/`lastState` cache (FS:155-160). Consider "DCP-17 found nothing else that depends on there being one."
