# Sandbox API

Sandboxes run real React code in the page, offline from `file://`. Each
sandbox is an iframe that loads the frozen React build from
`docs/use-store/vendor/`. The page and the iframes only talk through
`postMessage`.

Owner: sandbox engineer. Ask for a helper rather than editing these files.

- `sandbox/host.js`, `sandbox/host.css`: run in the page. They turn every
  `.sandbox` block into a code view, a preview iframe and its panels.
- `sandbox/frame-hook.js`, `sandbox/frame.js`, `sandbox/frame.css`: run in
  each iframe.
- `vendor/*.js`: built by `tools/build-vendor.mjs` from
  `fixtures/store-bench/react-builds/head`. `vendor/VERSIONS.json` records the
  build (sha, dirty state, hashes) and each bundle's size and hash.

What the sandboxes run, and what the page must say: the **development**
build, **without** the React Compiler, with **StrictMode off** unless the
sandbox turns it on. Stepper sandboxes use the mock scheduler, so they're
"stepped for illustration", not real scheduling. Every sandbox shows this in
its footer, and `<!-- gen:sandbox-build -->` prints it in the prose.

## 1. Markup

A page loads the host once (`build-docs.mjs` adds these when a page has a
sandbox and they're missing):

```html
<link rel="stylesheet" href="sandbox/host.css">
<script src="sandbox/host.js" defer></script>
```

Each sandbox is a `div.sandbox` with its code in an inline
`<script type="text/plain">` (`fetch` doesn't work from `file://`):

```html
<div class="sandbox" id="counter" data-title="A counter in a store">
<script type="text/plain">
import {use, unstable_createStore as createStore} from 'react';

const count = createStore(0);

export default function App() {
  return <button onClick={() => count.update(n => n + 1)}>{use(count)}</button>;
}
</script>
</div>
```

In `src/*.src.html` you don't paste the code. Point at a file instead, and
`build-docs.mjs` inlines it (and its steps file, see section 5):

```html
<div class="sandbox" id="counter" data-src="sandboxes/explainer/counter.jsx"></div>
```

`data-src` is relative to `docs/use-store/src/`. A literal `</script` in the
code is written as `<\/script`, and the host turns it back.

### Attributes

| Attribute | Meaning |
| --- | --- |
| `id` | Required, unique on the page. Gates and anchors use it. |
| `data-title` | Caption above the sandbox. |
| `data-src` | Source file, inlined at build time (`src/`-relative). |
| `data-steps` | The G3 steps file, relative to the page. `build-docs.mjs` sets it when `<name>.steps.json` sits next to the `data-src` file. You can also put the steps inline as a child `<script type="application/json" class="steps">`. |
| `data-height` | Preview height in px, or `auto` (default: follow the content, 80 to 600 px). |
| `data-stepper` | Load `vendor/react-step.js` (mock scheduler) and show the stepper toolbar. The value is the buttons to show: `paint flush` (default), add `yield` for "Next yield". |
| `data-server` | Also load `vendor/react-server-dev.js`, so the code can import `react-dom/server`. |
| `data-scripts` | Space-separated classic scripts (page-relative) the iframe loads after React and before your code. For shared explainer libraries in `sandbox/explainers/`. |
| `data-styles` | Space-separated stylesheets (page-relative) the iframe loads. |
| `data-compile` | `react-compiler`: `build-docs.mjs` runs the React Compiler on the `data-src` file before inlining it. Implies read-only. |
| `data-readonly` | No Edit button. |
| `data-autorun` | `false`: wait for a Run click. Default: run when it scrolls near the viewport. |
| `data-strict` | Start with StrictMode on (the toolbar has a toggle either way). |
| `data-panels` | Panels to show, space-separated, from `console renders stores`. Default `console renders`. `stores` appears on its own once the code calls `watchStore`. |
| `data-flash` | `false`: don't outline components that rendered. |

### What the host draws

- **Code view** with Edit, Run and Reset. Edit swaps in a textarea. Run starts
  a fresh iframe with the edited code. Reset restores the original and runs it.
- **Preview** iframe, with an **error overlay** for compile errors, errors
  thrown while loading the module, uncaught render errors and errors in event
  handlers or promises.
- **Render strip**: each component's render count since the last run, with
  the components of the last commit marked (bold and a dot, not only color).
- **Console panel**: `console.*` and `log()` from the iframe, React's own
  warnings included. Repeats collapse with a count.
- **Store panel** (after `watchStore`): the inspector snapshot of each watched
  store.
- **Stepper toolbar** (with `data-stepper`): Next commit, Flush all, optional
  Next yield, a "pending work" indicator and the scheduler log.
- **Footer**: React version and sha, "development build, no compiler,
  StrictMode off|on", and "stepped for illustration" in stepper sandboxes.

## 2. Writing sandbox code

The code is a module. `build-docs`-free pages work the same way: the host
compiles it with sucrase (`jsx` with the automatic runtime, and `imports`).

- **`export default` a component** and the frame renders it into `#root` with
  `createRoot`. This is the normal case.
- **No default export:** the code renders itself, for example
  `hydrateRoot(document.getElementById('root'), <App />)`. The `react-dom/client`
  the code gets is wrapped so its roots still report uncaught errors to the
  overlay and honor the StrictMode toggle. Your own root options still run. The experimental build's default
  transition indicator (a fake `navigation.navigate()` while a transition is
  pending) is off unless you pass `onDefaultTransitionIndicator` yourself.

### Modules (`require` shim)

`import` compiles to `require`, which reads `window.__modules`:

| Module | From |
| --- | --- |
| `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react/compiler-runtime`, `scheduler`, `use-sync-external-store/shim`, `use-sync-external-store/shim/with-selector` | `react-dev.js` or `react-step.js` |
| `scheduler/unstable_mock` | `react-step.js` only (same object as `scheduler` there) |
| `react-dom/server` | `react-server-dev.js` (`data-server`). It uses the client bundle's React, so a store created in the code is the same object on both sides. |
| `sandbox` | `frame.js`: the helpers below. They're also globals. |

### Helpers (globals, or `import {...} from 'sandbox'`)

| Helper | What it does |
| --- | --- |
| `log(...values)` | Writes a `log` entry to the console panel. In stepper frames it also calls `Scheduler.log`, so it's a yield point for "Next yield". |
| `<Slow ms={n}>{children}</Slow>` | Blocks the thread for `ms` (default 100) while rendering, then renders its children. |
| `<SlowList count={n} ms={m} render={i => ...} />` | A `<ul>` of `count` items (default 200). Each item blocks `ms` (default 1) while rendering. `render(i)` gives an item's content (default `Item #i`). |
| `createResource(load?, {delay?})` | A cache of promises for `use()`. `resource.read(key)` returns the same promise for the same key. `load(key)` gives the value (or a promise). With `delay` (ms) it resolves after that long. Without `load` it's manual: `resource.resolve(key, value)` and `resource.reject(key, error)`. Also `resource.status(key)` (`'missing'`, `'pending'`, `'fulfilled'` or `'rejected'`) and `resource.clear(key?)`. |
| `inspectStore(store)` | A snapshot of a store's internals, see below. |
| `watchStore(store, label)` | Shows the store in the store panel. The panel refreshes after every commit, every `store.update` and every stepper command. Returns the store. |
| `renders` | `renders.counts()` gives `{Name: count}` since the run, `renders.reset()` clears them. Same numbers as the render strip. |
| `step` | Stepper frames only, see below. |

### `inspectStore(store, {computeHead}?)`

By default it never calls the reducer: it only reads fields. With
`{computeHead: true}` it also replays `_headQueue` through the reducer on a
copy, to get every update in dispatch order. That replay runs with the
console and `log()` muted (a reducer that logs adds no lines), never throws
(an update that throws is skipped, as in `getStoreHead`, and the first error
is `headError`), and doesn't change the store. The store panel uses the
default.

Reads `store._records`, `_head`, `_headQueue` and `_pendingTransitionUpdates`.
Each record is `{pending, committed: {baseQueue, ...}, readers}` (see
`packages/react-reconciler/src/ReactFiberStore.js`). Values and actions are the
live objects, by reference, not copies. Every update has its raw `lane` number
and its `laneName`. Updates sit in React's concurrent queue, out of reach,
until the next render starts, so `pending` is usually empty between steps:

```js
{
  ok: true,
  headBase: value,             // store._head as stored: before the _headQueue actions
  headQueue: [action],         // updates not folded into store._head yet
  // Only with inspectStore(store, {computeHead: true}):
  head: value,                 // _headQueue applied to a copy of headBase
  headError: error,            // the first update that threw (skipped), if any
  heldTransitionUpdates: [{lane, laneName, action}],  // DCP-18/20: no root reads it yet
  records: [{                  // one per root
    pending: [{lane, laneName, action}],    // not picked up by a render yet
    baseQueue: [{lane, laneName, action}],  // committed.baseQueue: skipped and later
    committed: {baseState, memoizedState, skippedLanes: ['Transition1']},
    lanes: ['Default'], transitionLanes: ['Transition1'],
    rawLanes: 32, rawTransitionLanes: 256,              // the same, as numbers
    rootPendingLanes: ['Transition1'], rawRootPendingLanes: 256,  // record.root.pendingLanes
    readers: ['Row', 'Suspense'], readerCount: 2,
  }],
  record: records[0] || null,  // the usual case: one root
}
```

Lane names are `Sync`, `InputContinuous`, `Default`, `Gesture`,
`Transition1`..`Transition14`, `Retry1`..`Retry4`, `SelectiveHydration`,
`Idle`, `Offscreen`, `Deferred`, and the `*Hydration` lanes, taken from
`ReactFiberLane.js` at the build's sha.

**Version guard.** If the shape differs (a field missing, `readers` not a
Set), it returns `{ok: false, reason}`, logs
`inspector unavailable for this build: <reason>` as an error, and the store
panel shows that message. G3 and G4 fail on it. Never show nothing.

### `step` (stepper frames)

The frame loads `react-step.js`, where `scheduler` is `scheduler/unstable_mock`.
Discrete events (clicks) still render synchronously in a microtask, like in a
real browser. Default-lane updates, transitions, passive effects of
non-sync renders and Suspense retries wait for a step. The frame flushes the
first render for you.

| Call | Does |
| --- | --- |
| `step.paint()` | Runs scheduled work until React commits and asks to paint (`unstable_flushUntilNextPaint`). The "Next commit" button. |
| `step.flush()` | Runs everything (`unstable_flushAllWithoutAsserting`). "Flush all". |
| `step.yields(n = 1)` | Runs until `n` more `log()`/`step.log()` calls (`unstable_flushNumberOfYields`). "Next yield". |
| `step.log(value)` | `Scheduler.log(value)` without a console entry. |
| `step.advance(ms)` | Advances mock time, firing timers React scheduled with the mock. |
| `step.pending()` | Whether React has scheduled work. |
| `step.clearLog()` | Returns and clears the scheduler log. |

Each command returns the scheduler log values it produced. The toolbar shows
them and the pending indicator after every command.

### Render counts and flashing

`frame-hook.js` installs a stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` before React
loads. On every commit it walks the new tree the way React DevTools does
(`didFiberRender`, ported from
`react-devtools-shared/src/backend/fiber/shared/DevToolsFiberChangeDetection.js`):

- a component counts as rendered if it mounted, or if it was cloned and has
  the `PerformedWork` flag;
- a subtree whose `child` pointer didn't change is skipped (it bailed out);
- so a component whose function ran but bailed out (a `useReducer` that
  returned the same state) is **not** counted, the same as DevTools; and
  StrictMode's second call counts once.

Each rendered component's nearest DOM nodes get an outline and a
label with the component names (the render strip has the counts), which fades unless `prefers-reduced-motion` is set.

`window.__renders` (frame-hook.js) is the raw interface: `counts()`,
`reset()`, `onCommit(listener)` where `listener(root, names, fibers)` runs
once per commit with the names of the components that rendered in it,
`setFlash(enabled)`, and `setFlashScope(element)` to outline only nodes inside
an element (`null` for the whole document).

## 3. postMessage protocol

Every message is `{__sandbox: 1, id, type, ...}`, where `id` is the
sandbox's `id`. Both sides check `event.source` (the parent, or the
sandbox's iframe) and ignore anything else.

Host to frame:

| `type` | Fields | Effect |
| --- | --- | --- |
| `run` | `code` (compiled CommonJS), `strict`, `flash` | Evaluates the module and renders its default export. Sent once per iframe. |
| `step` | `reqId`, `cmd` (`paint`, `flush`, `yield`, `advance`), `count` | Stepper command. Replies `step-state`. |
| `inspect` | `reqId` | Replies `stores` with fresh snapshots. |
| `reset-renders` | | Clears render counts. Replies `commit` with empty counts. |

Frame to host:

| `type` | Fields | Meaning |
| --- | --- | --- |
| `ready` | `build: {version, sha, dirty, channel}`, `runtime` (`dev` or `step`), `server` | Scripts loaded. The host sends `run`. |
| `ran` | `ok` | The module ran and the first commit happened (or 1 s passed with no root). Gates wait for this. |
| `console` | `kind` (`log`, `info`, `warn`, `error`, `debug`), `text`, `source` (`console` or `sandbox`) | One console entry, formatted (`%s`, `%o`...). |
| `error` | `phase` (`compile`, `module`, `uncaught`, `event`, `promise`, `hook`), `message`, `stack`, `componentStack` | Shown in the overlay. |
| `commit` | `counts: {Name: n}`, `last: [Name]` | After each commit (batched per frame). |
| `stores` | `reqId?`, `stores: [{label, ok, reason?, snapshot}]` | Snapshots with values turned into short strings. |
| `step-state` | `reqId?`, `pending`, `log` | After a stepper command. |
| `size` | `height` | Content height, for `data-height="auto"`. |

Compile errors are found in the host (it runs sucrase) and shown without
starting an iframe.

## 4. Host API for gates and tests

`window.__sandboxHost`:

- `list()`: sandbox ids on the page.
- `runAll()`: starts every sandbox (ignoring `data-autorun`), resolves when
  all have sent `ran` or an error.
- `get(id)` returns:
  - `ran()`: a promise for the current iframe's `ran`;
  - `run(code?)`: run the given code (or the editor's), resolves on `ran`;
  - `reset()`: restore the original code and run it, resolves on `ran`;
  - `getCode()`, `setCode(code)`, `originalCode()`;
  - `state()`: `{console: [...], errors: [...], counts, last, stores, stepper: {pending, log}, build}`;
  - `clearConsole()`, `resetRenders()`;
  - `step(cmd, count?)`, `inspect()`: promises for the reply;
  - `frame()`: the iframe element.

## 5. G3 steps file

`<name>.steps.json` next to the sandbox's source (or inline in a
`<script type="application/json" class="steps">`). `check-docs.mjs` runs it in
headless Chrome against the built page.

```json
{
  "allowConsole": [{"kind": "error", "matches": "The above error occurred"}],
  "expectErrors": false,
  "steps": [
    {"expectText": "button", "equals": "0"},
    {"click": "button"},
    {"expectText": "button", "equals": "1"},
    {"expectRenders": {"App": 2}},
    {"expectConsole": {"kind": "log", "contains": "clicked"}}
  ],
  "edit": {
    "replace": {"find": "n + 1", "with": "n + 10"},
    "steps": [{"click": "button"}, {"expectText": "button", "equals": "10"}]
  }
}
```

Selectors are CSS selectors inside the sandbox's iframe. Text checks retry
until `timeout` (default 2000 ms). Steps run in order:

| Step | Checks or does |
| --- | --- |
| `{"click": sel}` | Clicks the first match. |
| `{"fill": sel, "value": s}` | Types into an input (replaces its value). |
| `{"press": sel, "key": k}` | Presses a key in it. |
| `{"stepper": "paint" \| "flush" \| "yield" \| "advance", "count"?: n}` | Stepper command. |
| `{"wait": ms}` / `{"waitFor": sel}` | Waits for time, or for a selector to exist. |
| `{"expectText": sel, "equals" \| "contains" \| "matches": s}` | Text of the first match. |
| `{"expectCount": sel, "equals": n}` | Number of matches. |
| `{"expectConsole": {"kind"?, "contains" \| "matches"}}` | Some entry since the last `clearConsole` matches. |
| `{"expectNoConsole": {"kind"?, "contains" \| "matches"}}` | No entry matches. |
| `{"clearConsole": true}` | |
| `{"expectRenders": {"Name": n}}` | Render counts since the run or the last `resetRenders`. Names not listed aren't checked. |
| `{"resetRenders": true}` | |
| `{"expectStore": label, "path": "record.readerCount", "equals" \| "contains" \| "matches": v}` | A watched store's snapshot, by dotted path. Values in snapshots are strings (`describe()`d), counts are numbers. Fails if the inspector is unavailable. |
| `{"expectStepper": {"pending"?: bool, "log"?: [...]}}` | The stepper state after the last command. |
| `{"expectError": {"contains" \| "matches": s}}` / `{"expectNoError": true}` | The error overlay. |

After the steps, the gate checks:

- **No unexpected console output:** every `warn` or `error` entry must match
  `allowConsole`. Errors in the overlay fail unless `expectErrors` is true or
  an `expectError` step consumed them.
- **Edit and Run:** applies `edit.replace` (or, without `edit`, appends a
  comment), clicks Run, and runs `edit.steps`.
- **Reset:** clicks Reset, checks the editor holds the original code, and runs
  the steps again up to and including the first `expect*` step.

## 6. Plugging a checker into `check-docs.mjs`

`tools/check-docs.mjs` runs G4 (`tools/check-explainers.mjs`) and G5
(`tools/check-numbers.mjs`) when those files exist. A checker module exports:

```js
export async function check(ctx) {
  // ctx.docs        absolute path of docs/use-store
  // ctx.repo        absolute path of the repo
  // ctx.pages       absolute paths of the built pages being checked
  // ctx.openPage(file, {block: true})
  //                 a Playwright page on file://<file>, with every non-file
  //                 request blocked and errors collected in page.__errors.
  //                 Browser launched lazily, shared, closed by check-docs.
  // ctx.log(...)    progress output
  return {failures: ['message', ...], notes: ['message', ...]};
}
```

The gate passes when `failures` is empty. A module without a `check` export
is run as `node <file>` instead, and passes on exit code 0.

## 7. What `build-docs.mjs` does to a source page

`node docs/use-store/tools/build-docs.mjs` turns `src/<page>.src.html` into
`<page>.html` (`--check` fails if an output is stale). In order:

1. `<!-- gen:NAME {json args} -->…<!-- /gen:NAME -->` (or `<!-- gen:NAME /-->`)
   gets `generators[NAME](data, {page, args})` from `tools/charts.mjs`. The
   markers stay in the output. Built in:
   - `gen:code:<path>[#Function] {"marks": [...], "bad": [...], "notes": {...}, "compiled": true, "width": 64}`:
     a static code block (`code-examples.mjs` `block()`, styled by
     `sandbox/code.css`). Paths starting with `fixtures/`, `packages/` or
     `compiler/` start at the repo root, others at `src/`. Bench sources lose
     their counting instrumentation and are formatted, as in
     `code-examples.mjs`. `compiled` runs the React Compiler first.
   - `gen:sandbox-build`: the sentence saying which build the sandboxes run,
     from `vendor/VERSIONS.json`.
2. `<span data-n="key"></span>` gets `values[key].display` from
   `data/bench-data.json`.
3. Sandboxes with `data-src` get their code inlined (and `data-steps` when a
   steps file sits next to the source).
4. `sandbox/host.css`, `sandbox/host.js` and `sandbox/code.css` are added to
   `<head>` when the page needs them.

An unknown generator, a missing key or a missing file is a build error.
Test fixtures for all of this live in `tools/fixtures/`.

## 8. Custom frames (explainers)

An explainer can build its own iframes the way `host.js` `createFrame` does:
`srcdoc` with `window.__SANDBOX__ = {id, runtime: 'dev' | 'step'}`,
`frame.css`, `frame-hook.js`, the vendor bundle, `frame.js`, then its own
script last. `frame.js` finishes its setup without a `run` message, so a
custom frame never has to send one. These stay stable: `window.__SANDBOX__`,
the globals in section 2 (`require`, `inspectStore`, `watchStore`, `log`,
`step`...), `window.__renders`, and `window.__modules` (in step frames
`__modules.scheduler` is the raw `scheduler/unstable_mock` module). `frame.js`
still posts its own `{__sandbox: 1}` messages to the parent (`ready`, `commit`,
`step-state` every 200 ms when pending work changes), which a custom page can
ignore. Use your own message tag (`{__explainer: true}`) for everything else.
In step frames, nothing flushes the first render for you outside `run`: call
`step.flush()` after your first `root.render`, in a microtask (React schedules
the render task from one).
