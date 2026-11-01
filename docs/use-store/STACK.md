# use(store) PR stack

Built 2026-11-01 from `rh/use-store`, which is unchanged and keeps the full history. Each branch is one commit on top of the one before it. Review them in order. The bottom of the stack is `main` (a703ca64f9).

| # | Branch | PR title |
|---|---|---|
| 1 | `rh/store-1-same-element-bailout` | Skip reconciling a child when a function component returns the same element |
| 2 | `rh/store-2-core` | Add experimental use(store) |
| 3 | `rh/store-3-server` | use(store): server rendering and hydration |
| 4 | `rh/store-4-devtools` | use(store): DevTools support, and report hook ids in "Why did this render?" |
| 5 | `rh/store-5-tests` | use(store): Fast Refresh and ESLint tests |

Not in the stack (each is one commit on `main`):
- `rh/store-compiler-fixtures`: "[compiler] Add use(store) fixtures".
- `rh/sibling-lane-fast-path`: the concurrent-queue shortcut, opened as a question.

Kept locally, not for review:
- `rh/use-store`: the full working history, plus the docs and benchmark snapshot.
- `rh/use-store-copies-smoke`: the copy tests, as a smoke suite.
- `rh/use-store-three-slot`: the three-slot model, kept as a reference.

The PR descriptions are below. #2 is the long one; the full text is also in `PR_DESCRIPTION.md`.

---

## 1. Skip reconciling a child when a function component returns the same element

## Overview

Adds `enableSameElementBailout`: `__EXPERIMENTAL__` in OSS, `__VARIANT__` on www, and off in React Native and the test renderers.

When a function component re-renders and returns the exact element its only child was rendered with (the same props object, type and key, which is what the React Compiler's memo cache returns), the child would reach `beginWork` with the same props and bail out anyway. Today we still clone the child fiber, begin it, bail out and complete it. This skips that by calling `bailoutOnChildren` (the part of `bailoutOnAlreadyFinishedWork` that checks `childLanes`, propagates context and clones children with work) instead of `reconcileChildren`.

It's the same as the normal path in each case that matters, each tested in `ReactSameElementBailout-test.js`:
- **Pending work on the child or below:** it still renders.
- **Context changes:** they still propagate to consumers below.
- **The parent's own render is kept:** dependencies, the profiler timer, hooks and effects.
- **A new ref:** it gets attached.
- **Multiple children or a fragment:** they take the normal path.

It's excluded for legacy context, hydration, Fast Refresh family changes (tested in `ReactFresh-test`) and child types whose begin phase does bookkeeping (Suspense, Profiler, Activity, portals and so on).

It's not specific to stores, which is why it has its own flag. With stores it matters a lot. Without selectors, every reader of a changed store re-renders, and the compiler keeps that cheap by returning the memoized element. In the `selection` benchmark, the reconcile-and-bail-out was about 60 ns of the ~220 ns per row.

---

## 2. Add experimental use(store)

See `PR_DESCRIPTION.md`.

---

## 3. use(store): server rendering and hydration

## Overview

Stacked on #2.

- **Fizz renders the value the store was created with,** and the client hydrates with the same value, so nothing mismatches. After hydration, readers catch up to the latest value. In DEV, Fizz warns once per store if the store was updated before the server render, since that update isn't included.
- **Flight:** reading a store in a Server Component throws "Cannot read a store from a Server Component.", and so does passing a store as a prop to a Client Component ("Stores can't be passed from a Server Component to a Client Component.").
- **Tests:**
  - `ReactDOMStore-test.js`: client DOM, hydration, dehydrated Suspense boundaries, and the reducer error during hydration.
  - The store cases in the Fizz, Flight and Markup suites.

---

## 4. use(store): DevTools support, and report hook ids in "Why did this render?"

## Overview

Stacked on #3.

- **react-debug-tools** reports a `Store` node with the value the component rendered. It takes no hook slot, so it has no id, and `overrideHookState` keeps targeting the right hooks.
- **The Profiler** detects store changes: store reads are stateful, so a store update is reported as a changed hook.
- **The Profiler's "Why did this render?" names the right hook.** The backend reports changed hooks by id again, plus the positions of changed store reads (`storeReads`).
  - Since #35123, the backend reported positions among leaf hooks, but the frontend matches ids. Positions also count hooks without an id (Context, `use(promise)`, HostTransitionStatus).
  - So on main, `[useContext, useState]` shows "Hook 2 changed" for what the Components panel calls hook 1. With stores, `[use(store), useState]` named the State hook.
  - This part fixes a bug on main and can be split out on its own if you'd prefer.
- **Older and newer versions:** a new frontend with an older backend behaves as it does today. An older frontend with a new backend gets the Context fix, but shows "No hooks changed" for a store-only change.
- **Tests:**
  - `profilerHookChangeSummary-test.js` (new) renders the real detailed view.
  - `ReactDebugHooksStore-test.js`.
  - The store cases in `profilingCache`, `profilingStoreChangeDetection`, `inspectedElement`, `parseHookNames` and `DevToolsFacade`.

---

## 5. use(store): Fast Refresh and ESLint tests

## Overview

Stacked on #4. Tests only:
- **Fast Refresh:** `use(store)` isn't part of a component's refresh signature, because a store holds no component state. Renaming a variable read from a store doesn't remount.
- **ESLint:** `use(store)` follows the rules of hooks like any `use()`, and a store from props must be listed as a dependency, since its identity can change.

---

## [compiler] Add use(store) fixtures

Three fixtures that lock in how the compiler handles `use(store)`. No compiler changes:
- `use-operator-store-prop-update`: a store passed as a prop and updated in a handler. The read is plain, and the handler is memoized on the store.
- `use-operator-store-conditional-loop`: conditional and looped `use(store)`. A value built across `use()` calls in a loop isn't memoized, because its scope contains `use()` and gets flattened.
- `use-operator-store-derived-value`: `f(use(a), use(b))` is memoized on the two values. An array built with `push(use(a))` isn't.
