# Interactive explainers

Four explainers for the use(store) reports. Each one drives the **real**
React build in frames (the same vendored build and frame helpers as the
sandboxes, see `../API.md`), never a re-implementation:

| `data-explainer` | What it shows | Frames |
| --- | --- | --- |
| `queue` | The queue and lanes. The reader dispatches default, transition and sync updates to a store and steps renders. The panel shows the root's record of the store (base state, base queue with lane names, updates waiting for a render, readers) and the renders the preview predicts, in order. | 1 step frame |
| `tearing` | A time-sliced render with four columns side by side (a mutable global, `useSyncExternalStore`, and `use(store)` changed from a message event and from a click), and the source changed between two steps of the render. | 4 step frames, stepped in lockstep |
| `rerenders` | "Who re-renders": the same list with selectors (`useSyncExternalStoreWithSelector`), with `use(store)` and no compiler, and with `use(store)` compiled by the React Compiler. Flashes what rendered and counts renders and selector calls. Read-only. | 3 dev frames |
| `subscriptions` | Conditional reads: a component that reads stores behind toggles, and each store's records and subscribed components, read from the store's internals. | 1 step frame |

## Embedding

Put the placeholder where the explainer goes, and include the script once per
page, after the last placeholder:

```html
<div class="explainer" data-explainer="queue"></div>

<script src="sandbox/explainers/generated/explainers.js"></script>
```

The script path is relative to the page (`docs/use-store/*.html`). The
script finds the vendored build and the frame helpers relative to itself, so
it works from any page under `docs/use-store/`. Its styles are injected; they
use the page's `--panel`, `--panel-2`, `--text`, `--muted`, `--border`,
`--accent`, `--good` and `--bad` variables when they're defined.

- Each explainer builds its UI and frames when it comes within 600 px of the
  viewport.
- No other attributes. Ids inside an explainer are generated, so several
  explainers can share a page (one of each kind is what the gate checks).
- Say in the prose that the explainers run the development build, and that
  the stepped ones use a mock scheduler ("stepped for illustration"). Each
  explainer's footer says it too.

## Notes for authors

- **Default work can render early when a transition is dispatched. This is
  experimental-channel only.** In the queue explainer, dispatching a
  transition while default-lane updates are queued renders those default
  updates at the end of that event, without a step. That comes from the
  default transition indicator (`enableDefaultTransitionIndicator`,
  `processRootScheduleInMicrotask` in `ReactFiberRootScheduler.js`), which is
  `__EXPERIMENTAL__` in OSS, so it's on in the vendored build. Stable React
  waits. Don't present it as a rule of use(store) or of lanes; the explainer's
  log says the same.
- Footnote, if you mention it: a transition update that the eager bailout
  drops (the value didn't change) still claims the event's transition lane,
  and the next event's transition reuses it. `useState` does the same.

## What's generated

`node docs/use-store/src/demos/build-demos.mjs` (or `buildDemos()`, which
`tools/build-docs.mjs` calls) writes `generated/`:

- `explainers.js`: the page side, the only file a page includes;
- `*.frame.js`: the code each frame runs, from `src/demos/frames/` and
  `src/demos/rerenders/`;
- the `rerenders-*` frames are compiled at build time with the React Compiler
  build the benchmarks use (`fixtures/store-bench/compiler-plugin.mjs`), and
  `rerenders-code.json` holds the source and compiled `Row` the page shows;
- `MANIFEST.json`: the React build and compiler the files came from, and each
  file's size and hash.

Don't edit `generated/`. The sources are in `docs/use-store/src/demos/`.

## Checking (G4)

`node docs/use-store/tools/check-explainers.mjs` builds, opens
`sandbox/explainers/demo.html` from `file://` in headless Chrome with every
non-file request blocked, and runs the checks the page exposes on
`window.__explainers.checks`:

- **queue:** the preview (`src/demos/runtime/queue-preview.js`) matches React
  on 200 seeded random sequences of dispatches and steps: the lane each
  update got (read from the record's lanes), the committed value, the base
  state, the queue with its lanes, the latest value, and what the component
  rendered after every command. It prints the first mismatch
  and its sequence.
- **tearing:** the global tears; `useSyncExternalStore` renders every cell
  synchronously when its source changes; `use(store)` never tears. A store
  update from a message event gets the default lane (read from the record,
  not assumed), and the transition keeps rendering and commits first
  (`getNextLanes`: default doesn't interrupt a transition). From a click it
  gets the sync lane, renders right away, and the transition restarts. The
  observed order is printed too.
- **rerenders:** each panel renders the components it should, and the frame's
  flashes (`sandbox/frame-hook.js`) match the components' body counters.
- **subscriptions:** records and subscribed components match the model on
  random sequences of toggles, mounts and updates.

`--page=<file>` runs it against another page (it needs one explainer of each
kind). `--no-build` skips the build. `check-docs.mjs` runs it as a module
without a `check` export (exit code).

For quick checks while editing, `node docs/use-store/src/demos/test/queue-node.js`,
`tearing-node.js` and `subscriptions-node.js` run the frame code against the
frozen build in jsdom.
