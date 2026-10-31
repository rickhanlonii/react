# Rules for `use(store)` test copies

Goal: every test file that uses state (`useState`, `useReducer`, `this.setState`) has a sibling copy where state is replaced with a store created by `React.unstable_createStore` and read with `use(store)`. Every test case of the original exists in the copy, with the same title, and passes.

`node scripts/store-parity/check.js` measures progress. `node scripts/store-parity/check.js <original>` lists the missing titles for one file.

## Naming

- `Foo-test.js` → `FooUseStore-test.js`; `Foo-test.internal.js` → `FooUseStore-test.internal.js`. The copy sits in the same directory as the original.
- Keep `describe` blocks. Test titles must match the original exactly, because the parity checker matches by title.

## Setup in the copy

- At module scope: `let createStore;`. In `beforeEach`: `createStore = React.unstable_createStore;` (use whichever React binding the file already has).
- Gate every case that creates or reads a store with `enableStore`, combined with any existing gate: `// @gate enableStore`, or `// @gate enableStore && (X)` where the original has `// @gate X`. Cases copied verbatim (rule 7) keep the original gate unchanged. `-r=stable` checks this: a store case without the gate fails, and a verbatim case with the gate is reported as `[GATED, SHOULD FAIL]`. If a store case returns early (e.g. `if (!gate(...)) return;`) before touching a store, OR that early-return condition into its gate.
- `use` comes from `React.use`.

## Translating state

1. **Single-instance component state** becomes a store created in the test (or in `beforeEach` when it's shared):
   ```js
   // original
   function Counter() { const [count, setCount] = useState(0); _setCount = setCount; ... }
   // copy
   const countStore = createStore(0);
   function Counter() { const count = use(countStore); ... }
   _setCount = countStore.update; // or call countStore.update(...) directly
   ```
   Updater functions work the same way: `countStore.update(c => c + 1)`. `store.update` is a stable function, so it can be captured like a setter.
2. **Lazy initializers.** `useState(() => init())` becomes `createStore(init())`. If the test asserts how many times the initializer runs, see rule 6.
3. **`useReducer(reducer, initialArg, init)`** becomes `createStore(init ? init(initialArg) : initialArg, reducer)`, and `dispatch(action)` becomes `store.update(action)`.
4. **Multiple instances with independent state** (lists, a component rendered twice, keyed remounts that expect fresh state): give each instance its own store. Create the stores in the test and pass them as props, or keep a `Map` from key to store in the test. Don't use hooks to hold stores. When the original relies on state being **reset** on remount (a key change, unmount and remount), create a new store for the new instance at the point where the original remounts, usually where the key changes. Annotate it `// store-semantics: stores persist across remounts, so a new store is passed for the new instance`.
5. **Class components with `this.setState`.** Convert the component to a function component that reads a store, but only when the test isn't about class semantics. Lifecycles map to effects only when the ordering assertions still hold. If the test is about class-only behavior (setState callbacks, `getDerivedStateFromProps`, `componentDidUpdate` prevState, `forceUpdate`, legacy-mode batching specifics), copy the case unchanged so the class still uses `this.setState`. Store state you can't express in a class isn't the point of that test. If it truly can't be copied, add a skip (below).
6. **Hook-only semantics** (lazy initializer call counts, the setState eager-bailout warning, render-phase `setState`, "Too many re-renders" for setState in render, the stable identity of the `setState` function): write the store analog when there is one. A render-phase `store.update` should be scheduled for the next render; it isn't processed in the current one. Otherwise add a skip.
7. **Cases that don't touch state** are copied verbatim, so the copy fully mirrors the original.
8. **Props, context and refs** stay as they are. Only component state becomes stores. Keep `useState` used purely as test plumbing (e.g. to force a parent re-render) only if converting it would change what the test checks; prefer converting.

## Expected values

- Store updates follow the same rules as `useState`. They batch with other updates in the same event. A transition update is a transition. Sync updates are rebased over pending transitions. A component that reads a store mid-transition joins that transition. So most expectations are unchanged.
- **Differences to expect, and to annotate with `// store-semantics: ...` when you change an expectation:**
  - A store keeps its value across unmount and remount (see rule 4).
  - A component that only reads a store doesn't re-render when the parent's state changes, unless the parent re-renders it.
  - Updating a store re-renders every component that reads it, on every root.
  - Updates to a store are applied in the order they were dispatched, across all components that read it.
  - Like `useState`, the first update to an idle store is computed eagerly when it is dispatched. Updater and reducer logs follow `useState`, not class `setState`.
  - **A `store.update` during render warns**: "Cannot update a store while rendering a component (`X`). Updating a store is a side effect, so it should happen in an event handler or an effect. The update will be rendered after the current render. ..." This holds even when `X` reads the store itself, because a store is shared. The update is rendered after the current render, the way an update to another component is, and it isn't discarded if that render suspends or is thrown away. Assert the warning with `assertConsoleErrorDev` and annotate it `// store-semantics: store updates during render warn and are rendered after the current render`. An unconditional render-phase update loops the way updating another component in render does. If the original asserts "Too many re-renders", skip it as `hook-only-semantics`.
  - **Store updates never warn about unmounted or not-yet-mounted components.** An update isn't tied to a component. If the original asserts "Can't perform a React state update on a component that hasn't mounted yet" (or on an unmounted component), drop that assertion with a `store-semantics` annotation.
  - **No "Detected a large number of updates inside startTransition" warning.** That warning points userland subscriptions at React-provided primitives, and a store is one. Many store updates in a transition are expected. Drop the assertion with a `store-semantics` annotation.
  - **Render-phase store updates aren't computed eagerly.** A reducer that reads context (which warns) warns when the update is rendered, attributed to the component that renders it, not the one that called `store.update`.
  - **Eager bailout at dispatch:** when nothing is pending for the store, an update to the same value bails out without rendering at all. Where `useState` renders and then bails out, expect fewer renders.
  - The value passed to `createStore` is computed before rendering; there's no lazy initializer.
  - Conditional `use(store)` is supported. Cases that document "not supported" conditional Hooks should assert the supported behavior.
  - The server renders, and the client hydrates with, the value the store was **created** with. Updates made before rendering on the server aren't rendered. After hydration, readers catch up to the latest value.
- **Don't** weaken an assertion to make a copy pass. If a copy fails and you believe the store is behaving incorrectly, i.e. it differs from `useState` in a way the list above doesn't explain, keep the faithful assertion, mark the case `// @gate enableStore && TODO` with a comment `// BLOCKER: <short description>`, and report it. `@gate TODO` expects the test to fail and errors if it starts passing.

## Mechanics

- **Snapshots:** don't use `toMatchSnapshot` in a copy, because it would create a new `.snap` file. Assert the original snapshot's value inline.
- **Stack frames:** stack assertions that include the test file's name should use the copy's file name.
- **Files with no store cases:** if every case in a copy is verbatim, leave out the `createStore` setup so lint doesn't flag an unused variable.
- **Remount detection:** `store.update` is stable, so a test that detects a remount through setter identity needs a different signal, such as a `useRef` identity. Annotate it `store-semantics`.

## Skips

Add to your shard's file in `scripts/store-parity/skips/` (e.g. `skips/react-dom-forms.json`; never edit another shard's file) only when a case can't be expressed with stores at all:

```json
{
  "packages/react/src/__tests__/Foo-test.js": {
    "exact test title": {"reason": "class-only-semantics", "note": "asserts setState callback ordering"}
  }
}
```

Reasons: `class-only-semantics`, `hook-only-semantics`, `not-applicable` (explain in the note). Prefer copying verbatim over skipping: a verbatim copy still counts.

## Running

- `yarn test -r=experimental --watchman=false <copy path>`. The `--watchman=false` flag is required in this sandbox.
- Also run `-r=www-modern --variant=true --watchman=false` for files under `react-reconciler` and `react-dom`.
- `-r=stable` must pass too: there `enableStore` is off, and gated tests are expected to fail.

## Context copies

Goal: every test case that reads React context (`useContext(C)`, `use(C)`, `<C.Consumer>`, `static contextType`, `readContext`) has a copy that uses `use(store)` in place of context, or a skip with a reason. The skips define where a store can't replace context. Rule 8 above still applies to the state copies; these copies only replace context.

`node scripts/store-parity/check.js --context` measures progress (`scripts/store-parity/context.js`). `--context <original>` lists what's missing for one file, and `--context --list --why` prints every context case with the API or binding that made the checker count it.

### Scope and matching

- A case reads context when its source mentions a context API, or a binding declared outside the case whose declaration does (a context object, a component that reads it, a helper that renders a Provider, ...), computed to a fixpoint. Strings, JSX text and comments are ignored, so a legacy-context warning that says "Use React.createContext() instead" doesn't count.
- Copy only the context cases. `Foo-test.js` → `FooUseStoreContext-test.js` in the same directory. Keep the `describe` nesting and titles: cases are matched by `describe > ... > title`. A `describe` title that isn't a static string is matched by its source text, so keep the same template literal (e.g. `` `reading context with ${label}` ``).
- Out of scope: legacy context (`contextTypes`/`childContextTypes`), DevTools' own frontend contexts, and context that only appears in source-text fixtures. Whole files go in `excludedFiles`. DevTools UI bindings inside an otherwise in-scope file go in `ignoredBindings`.

### Setup

- Same as the state copies: `createStore = React.unstable_createStore`, `use = React.use`, and `// @gate enableStore` (AND-ed with the original's gate) on every case. DevTools copies follow the existing DevTools UseStore copies and use `@reactVersion`.
- Start the file with: "The context cases of `<original>`, with context replaced by `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md."

### Translating context

1. **The value:** `createContext(default)` becomes `createStore(value)`. When every reader is under a Provider, the store's initial value is the Provider's first value; otherwise it's the context's default. Several contexts become several stores.
2. **Provider value changes become `store.update(next)`**, with the same priority and timing as the original trigger: a re-render in `act` becomes an update in `act`, `startTransition(() => root.render(...))` becomes `startTransition(() => store.update(...))`, `flushSync` stays `flushSync`.
3. **Keep the parent re-render when the update has to get past a bailout.** If the original's update re-renders a component above a `memo`/`PureComponent`/`shouldComponentUpdate`/Suspense/hidden boundary, the store version has to exercise the same path, or it only tests that a store schedules its readers. Either:
   - batch the original re-render with the store update (`ReactNoop.render(<App />); store.update(3);`), or
   - when the Provider's owner held the value in state, have the owner read the store in place of its `useState` (`// Stands in for the useState that owned the Provider value.`), so it still re-renders on the update.

   Then the original's render logs stay unchanged. When nothing between the update and the readers bails out, update the store alone and drop the parent re-render.
4. **Readers:**
   - `useContext(C)` and `use(C)` become `use(store)`. `readContext(C)` in a function component becomes `use(store)` too.
   - `<C.Consumer>{fn}</C.Consumer>` becomes a small function component that calls `use(store)` and returns `fn(value)`.
   - Class readers (`static contextType`, `readContext` in a class) can't read stores. Wrap the class in a function component that passes the value as a prop only when the case isn't about the class reading context. Otherwise skip as `class-reader`.
   - A parametrized suite that runs once per way of reading context keeps the runs for function readers and drops the class runs. Record the dropped runs in `droppedVariants` with their case count.
5. **Nested Providers:** if each reader statically knows which level it reads, give each level its own store, and dispatch every level's new value when the original's derived value changes. If the case tests nearest-Provider resolution, the default value outside a Provider, shadowing, or restoring the outer value, skip as `no-subtree-scoping`.
6. **Server:**
   - Fizz renders, and hydration reads, the store's initial value (DCP-4). A constant server Provider value becomes the store's initial value, and the client's initial value must match.
   - Different values per request, per subtree, or per root on the server: skip as `server-subtree-value`.
   - A Server Component that reads context: the store analog throws "Cannot read a store from a Server Component." Translate cases about that error. Skip cases where a Server Component provides a value to client components as `server-component`.
7. **Context-only APIs and warnings** don't apply: skip as `context-only-api`. This covers Provider/Consumer warnings, `useContext(Context.Consumer)`, `Context === Context.Provider`, contexts as renderable nodes, lazy Providers, `changedBits`, `getChildContextValues`, test-renderer traversal and `toTree()` of Provider/Consumer fibers, ReactIs, contextType validation, and the hook-order lists that contain useContext (`use(store)` takes no hook slot).
8. **Context implementation details with an observable behavior get translated as that behavior.** For example, the context stack unwinding regressions become "a render that read the store and then threw, or was interrupted, doesn't break later renders". Reading context where it's not allowed (inside `useMemo`, `useReducer`, effects) becomes reading a store there, which is flagged with the Hooks warning or the invalid Hook call error instead of the context message.
9. **Multiple roots or renderers share a store.** Context can give each root its own value. A store has one value for every root, and every root that reads it re-renders on an update. A test that leaves roots mounted while it keeps updating the store may need to unmount them (`ReactSuspenseFuzzUseStoreContext`); say why in a comment.

### Expectations

- Keep assertions unchanged: logs, output, warnings, act/scheduler sequencing.
- Change an expectation only when the difference is explained by store semantics, with a `// store-semantics: ...` comment. The differences found so far:
  - No Provider fiber: DevTools element indices and ids shift, and profiler change descriptions report a changed `Store` hook (`hooks: [n]`) instead of `context: true` (B-16).
  - Hook inspection shows `Store` (with `id: null`), not the context's name.
  - Context conservatively retries every Suspense boundary that shows a fallback below a changed Provider. A store update only schedules its readers, so primary children that don't read the store aren't retried or pre-warmed.
  - A store update isn't routed into dehydrated boundaries. The server HTML stays until the boundary hydrates with the initial value, and then the reader catches up. Where the original deletes or hides the server HTML and shows the fallback, the store version keeps the HTML (DCP-4).
  - `use(store)` in a disallowed place gets the Hooks warning or the invalid Hook call error, not the context-read message. The eager computation of a `setState` updater that calls `use(store)` while a class renders throws, so the updater runs again in the component that owns the state, and warns again there.
- When a store should pass and doesn't, it's a bug. Keep the faithful assertion, gate `// @gate enableStore && TODO` with `// BLOCKER: B-n`, and add the blocker to `BLOCKERS.md`.

### Skips

Context skips live in `scripts/store-parity/skips/context-*.json`. Keys are `describe > ... > title`:

```json
{
  "packages/react/src/__tests__/Foo-test.js": {
    "Foo > nested > title": {"reason": "no-subtree-scoping", "note": "..."}
  },
  "excludedFiles": {"<path>": {"reason": "devtools-ui-context", "note": "..."}},
  "ignoredBindings": {"<path>": {"Contexts": "why it isn't React context under test"}},
  "droppedVariants": {"<path>": {"<label>": {"reason": "class-reader", "note": "...", "cases": 13}}}
}
```

Reasons:
- `class-reader`: the reader is a class.
- `no-subtree-scoping`: the case tests nearest-Provider resolution, defaults outside a Provider, shadowing, or restoring.
- `context-only-api`: see rule 7.
- `server-subtree-value`: different server values per request, subtree or root.
- `server-component`: a Server Component provides the value.
- `no-client-apis`: the renderer runs without client APIs (renderToHTML-like), where `use(store)` throws like `useState`.
- `not-context`: a checker false positive; explain why.
- For files only: `devtools-ui-context`, `source-fixture`.

The checker reports skips that no longer match a context case as stale.
