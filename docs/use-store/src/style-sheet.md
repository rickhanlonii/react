# use(store) docs style sheet

Shared by the explainer (`src/explainer.src.html`) and the benchmark report (`src/benchmark-report.src.html`). Built in copyedit pass 3 on 2026-11-01 from the explainer's own usage, and extended in the benchmark report's pass 3 on 2026-11-02 (see [Benchmark report terms](#benchmark-report-terms)). Basis order: (1) house rules from the team lead and gate G7; (2) Ricky's style profile (`~/.me/STYLE.md`); (3) majority usage in the explainer; (4) react.dev conventions where the page had no evidence. Counts are from the explainer before pass 3.

## Paste-back sheet

```
US spelling. Sentence-case headings. No em dashes, no semicolons in prose.
Spaced hyphen " - " allowed. Contractions always. Serial (Oxford) comma: yes, per ~/.me/STYLE.md ("Oxford comma usually")
("A, B, and C"). Numbers in prose are words. Digits only in code, DCP-n,
section numbers, and on-screen labels. Sentences under about 30 words.
Code identifiers in <code>. On-screen labels in <q>. Hook (capital H),
Context (the feature) / a context (an instance), Provider, re-render,
StrictMode, Suspense, Activity, HostRoot, work in progress (noun) /
work-in-progress (adjective), the React Compiler, then "the compiler".
"DCP-17", linked to #dcp-17. Scope words are locked.

Benchmark report: "configuration", never "config". Variant ids in <code>
(store-keyed, store-memo, redux-plain), prose names otherwise ("keyed
selection", "the granular control"). Redux Toolkit, react-redux (<code>),
Zustand, Immer, Reselect. "no CPU throttling" / "four times CPU throttling"
in prose. 1× CPU and 4× CPU only in generated labels. Verdicts: "faster",
"slower", "tie"; "matches or beats" = wins plus ties. Ranges and ratios come
only from data-n spans: "1.5–2.4× faster", never typed.
```

## House rules (gate G7 and the team lead)

- No em dashes and no semicolons in prose. A spaced hyphen (" - ") is allowed, but prefer a new sentence.
- Headings are sentence case. Proper nouns allowed capitalized are in `tools/style-allow.json` (`headingTerms`). Code in a heading stays code (`<code>useState</code>`).
- No digits in prose. Use words ("two roots", "one or two values"). Allowed digits: inside `<code>`, in `DCP-n`, in section numbers, and in quoted on-screen labels (<q>Edit row 2</q>).
- Sentences under about 30 words. Split rather than chain with "and".
- The everwrite checker (`tells.py`) stays clean. Exceptions go in `tools/style-allow.json` with a reason, never in the checker.
- US spelling (behavior, color, memoize, serialize).
- Contractions (doesn't, it's, there's). "do not" only for a rule that needs the emphasis.

## Voice (Ricky's, keep it)

- Point first, then the reason in one clause.
- Plain words. Second person for instructions ("Click", "Read the store first").
- First-person hedges stay where they're honest ("I don't think a store-side optimization changes it").
- Short rhetorical questions are allowed when they carry the reason ("Which Provider's value would a shared store see?").
- No rule-of-three padding, no neat moral endings.

## Locked scope words

Never drop, move or strengthen a scope or hedge word in a technical claim. Examples from the explainer: "outside hydration", "normally", "can", "usually", "in open source", "in development", "when no root reads the store", "per root", "by default", "still being decided", "isn't decided", "the leading option". A clarity edit that would move one becomes a query to the claims editor instead.

## Code in prose

Use `<code>` for:

- identifiers, APIs, flags and exports: `use(store)`, `use()`, `createStore`, `unstable_createStore`, `store.update`, `update()`, `useState`, `useReducer`, `useSyncExternalStore`, `startTransition`, `enableStore`, `enableSameElementBailout`;
- component names from sandboxes and explainers (`Count`, `Row`, `RowView`);
- values shown in a demo (`old`, `new`, `light`, `1`) and small expressions (`1 * 2 = 2`);
- file and package names (`ReactFiberStore.js`, `react-dom/server`, `react-redux`).

Don't use `<code>` for:

- React concepts named in prose: Hook, Provider, Context, Suspense, Activity, StrictMode, HostRoot, transition, lane, fiber, record;
- on-screen labels. Those go in `<q>` (see below).

`store.update` names the method. `update()` or `store.update()` names a call, for example "`update()` throws". Both are fine and are not interchangeable with "a store update" (the event).

## On-screen labels

Buttons, toggles and stepper controls are written exactly as on screen, inside `<q>`: <q>Edit</q>, <q>Run</q>, <q>Next commit</q>, <q>Flush all</q>, <q>Add one</q>, <q>Select the next row</q>. `q[data-lit]` marks a label that is also a literal (<q data-lit>+1</q>). Before pass 3, fifteen labels used `<q>` and five didn't (Edit and Run twice each, Next commit, Flush all). Pass 3 made them all `<q>`.

"Click X, and Y" takes a comma when the second clause has its own subject ("Click <q>Flush all</q>, and the console shows ...").

## DCP references

- Written `DCP-17`: capitals, a hyphen, no space, no leading zero.
- In prose, link it to its index row: `<a href="#dcp-17">DCP-17</a>`. In the index table's first column it's plain text.
- A citation at the end of a sentence goes in parentheses before the period: "... when the root commits (DCP-17)."
- Two at once: "(DCP-14, amended by DCP-19)". A range in prose: "DCP-17 to DCP-20".
- Status wording in the index: "Accepted", "Implemented", "Accepted, amended by DCP-n" (a later decision changed it), "Accepted. Amends DCP-n" (this one changes an earlier one), "superseded by DCP-n", "Supersedes parts of DCP-n".
- The file is `DECISIONS.md`, linked as `<a href="DECISIONS.md">DECISIONS.md</a>`.

## Cross-references inside the page

"see X" goes in parentheses: "(see <a href="#hydration">hydration</a>)". Link text is the lowercase section topic unless it starts a sentence. Pass 3 changed two glossary entries from ", see X." to "(see X)."

## Numbers

- Words in prose: one, two, four, "a couple of", "several". "Once per root per render".
- Digits only in code, `DCP-n`, section numbers, and on-screen labels.
- The benchmark report may use digits in tables, charts and measured results. In its running prose, write small counts as words and keep measured values (ratios, milliseconds, percentages) as digits with their unit.

## Benchmark report terms

Added in the benchmark report's pass 3. Counts are from `benchmark-report.src.html` before the pass, prose only (not `data-n` keys or generator ids).

### Variants: prose name vs code id

Use the prose name in running text. Use the id in `<code>` when you point at a column, a chart series or a file, usually in parentheses after the prose name on first use in a section: "keyed selection (`store-keyed`)".

| Prose name | Code id | Notes |
|---|---|---|
| `use(store)`, plain `use(store)` | `store` | "plain" only when contrasting with keyed selection or `weakMemo` |
| keyed selection | `store-keyed` | never "keyed stores" or "the keyed variant" in prose |
| one store holding everything | `store-single` | |
| `use(store)` with `weakMemo` | `store-memo` | the other sharing stand-ins (`store-reselect`, `store-cache-render`, `store-cache-gen`, `store-compiled-shared`, `store-derived-lazy`, `store-derived`) are code ids only |
| Redux, idiomatic Redux | `redux` | Redux Toolkit plus `react-redux` |
| a hand-written reducer | `redux-plain` | |
| auto-freeze off | `redux-nofreeze` | "turning off auto-freeze" as a verb phrase |
| the leaner Redux setups | `redux-plain`, `redux-nofreeze` | "setup", not "config" or "flavor" |
| Zustand | `zustand` | |
| the granular control | `zustand-granular` | defined once: "Zustand with a store per entity". Lowercase, always "the" |
| a context per slice / one context | `context-split` / `context` | "Context" capitalized only for the feature ("Against Context") |
| Zustand with `useDeferredValue` | `zustand-deferred`, `redux-deferred` | |

Group names: "the selector libraries" (Redux and Zustand as libraries), "the selector apps" (their benchmark apps), "the store variants" (every `store-*` app). "The store side" only in the losses tally.

### Libraries

Redux, Redux Toolkit (two words, both capitalized, no "RTK" on the page), `react-redux` (code, lowercase, it's a package name), Zustand, Immer, Reselect, `react-redux-benchmarks` as link text without `<code>`. Immer's feature is "auto-freeze" (hyphenated, 4 of 4). "Solid's `createSelector`" and "Redux Toolkit's `createSlice`" take the possessive.

### Scenarios

Lowercase in prose, with the id in `<code>` in the scenario table: selection, entity edit, filter, the inline conditional read (`details-inline`), the conditional read in a child component (`details-component`), subscribe churn (`details-churn`), add / remove (`structure`, spaced slash, 8 of 8). Capitalized only at the start of a sentence or table cell. Ported suites: rapid dispatch, many components reading the same counter, a deep tree with nested Hooks, derived selectors (the scenario) / the derived-selectors benchmark (hyphenated as a modifier). "The spike" is the derived-selectors benchmark at more readers per category. Point to it with "(below)" before the section that introduces it.

### Configuration, size, throttle

- "configuration" always (35 to 0, no "config"). A configuration is one scenario at one size and one CPU throttle.
- "size" or "N rows" (from a span). "At 1,000 rows" stays exactly as a scope phrase when it's in a claim.
- CPU throttle in prose: "with no CPU throttling" for 1×, "with four times CPU throttling" for 4× (always the preposition "with"), "a CPU throttle" for the control. The digit forms "1× CPU" and "4× CPU" appear only in generated labels, tables and `data-n` values (G5).
- "the compiler on / off" for the setting, "its faster compiler setting" when a library is compared at whichever is faster.

### Verdict wording

- A verdict is "N× faster", "N× slower" or "tie", always from a span. Prose verbs: "wins", "loses", "ties", "matches or beats" (wins plus ties, as in the tallies). "Beats" alone means wins only.
- "The faster of Redux and Zustand" for the two-library headline opponent. "The fastest" only for three or more (the three Redux setups, the sharing options, or every library and compiler setting in a ported suite).
- "Within two standard errors" and "every restart agrees" are the tie rule. Link to `#verdicts` instead of restating it.
- Means decide verdicts. Medians are "easier to read". Don't call a median a verdict.

### Ranges and multipliers

Ranges render from spans as "1.5–2.4× faster", "1.1× slower to 1.4× faster", "up to 1.3× faster (6 faster, 8 tie)". Never type one (G5). Introduce a range with "is", "it's", or a colon: "Adding or removing a row is <range>", "subscribe churn: <range>". "by <range>" after "matches or beats". Write "X of Y" for tallies, both from spans, with the noun after Y on first use ("in X of Y configurations").

### Restarts and the gate

- "restart" (noun): one full pass of a configuration in a fresh browser. "browser restart" on first use in a section, then "restart". "The first three" restarts and "extra restarts" as in the method section. "Under the restart rule" is a locked scope phrase.
- "ambient CPU" (lowercase): CPU used by processes outside the benchmark's own process tree, in cores. "The ambient gate" / "a gate on ambient CPU". The old one is "the load-average gate" (hyphenated as a modifier), "the load average" as a noun.
- "unit" or "timing unit": the small resumable chunk the gate admits.

### Builds

"the frozen build" or "the frozen React build" (`react-builds/head`). Don't write "the head build" or "the head run" in prose, because "head" isn't defined for readers: use "the frozen build" or "the run with the bailout". Also "the build without the same-element bailout" (`react-builds/head-nobailout`), "the counting build" (lowercase, never "the counter build"), "the previous build", "that report's final build" (the last report's).

### Cross-references

One definition per term. "List caught up after" is defined in the typing section only. The fairness-control ranges are given only in the [Redux Toolkit section](#fairness). Other places link there.

## Word list (A to Z)

```
Activity (the component and feature, capitalized), a hidden Activity tree
add / remove (scenario, spaced slash)
ambient CPU (lowercase), the ambient gate
async action
auto-freeze (Immer's)
base state, base queue (prose); baseState, baseQueue (code, diagram)
batch (verb), batching
benchmark report (lowercase in prose; the link text "the benchmark report")
commit (noun and verb), committed state, committed value
compiler: "the React Compiler" on first mention in a section, then "the compiler"
configuration (never "config")
Context (the React feature, as in "Context re-renders every consumer");
  a context, the context, reading context (an instance or its value)
cross-root (adjective)
DevTools (one word, capital D and T); the Profiler
dispatch (an update is dispatched to a root)
eager state
entangle, entangled, entanglement
error boundary (lowercase)
experimental build, experimental channel; stable React
fiber (lowercase)
frozen build (react-builds/head; not "head build" in prose)
granular control, the (zustand-granular)
held update, held transition update
Hook (capital H, as react.dev): a Hook slot, a custom Hook, the invalid Hook
  call error, a Hook's queue, a Hook object, a Store Hook, a Hook name
HostRoot (one word, capital H and R; prose, not code)
hydrate, hydration, hydrating reader
in development (not "in DEV" or "in dev mode")
keyed selection, keyed selector
lane: the sync lane, the default lane, a transition lane, offscreen priority
latest value (the store's head; "head" only when naming the code)
memo, PureComponent (code)
memoize (US)
mock scheduler
offscreen (one word)
partly compiled app
ponyfill, userland
Provider (capital P, also plural: Providers)
re-render (hyphenated, 27 of 27 in prose); "render again" is also fine
reader (a component, or a Suspense boundary, subscribed to a record)
real-app data (adjective), a real app
rebase, rebasing
record (a root's view of a store)
Redux Toolkit (no "RTK"); react-redux (code)
restart, browser restart
render (noun and verb); "while rendering", "in render", "during render"
same-element bailout
selector, selector call
server render (verb and noun, no hyphen); Server Components (capitals)
store (lowercase); a store of stores; a store per row
store update (the event); store.update (the method)
StrictMode (one word, as the component name)
Suspense, a Suspense boundary, the nearest boundary
sync (adjective: sync lane, sync render, sync update); "synchronous" also fine
transition, a transition update, startTransition (code)
urgent (an urgent update or render, opposite of a transition)
useSyncExternalStore in full in prose (no "uSES" on reader-facing pages)
work in progress (noun); work-in-progress (adjective: the work-in-progress
  HostRoot, tree)
```

## Find and replace applied in pass 3

| Find | Replace | Count |
|---|---|---|
| `split providers` | `split Providers` | 1 |
| `a <code>Store</code> hook ... changed hook` | `Hook` | 2 |
| `a hook name` | `a Hook name` | 1 |
| `Where context's subtree scoping` | `Where Context's subtree scoping` | 1 |
| `Click Next commit,` / `Click Flush all and` | `<q>` labels with comma | 2 |
| `press Edit` / `press Run` / `Press Edit` / `Run to try it` | `<q>` labels | 4 |
| `, see <a ...>X</a>.` (glossary) | ` (see <a ...>X</a>).` | 2 |

## Find and replace applied in the benchmark report's pass 3

| Find | Replace | Count |
|---|---|---|
| `as written, The` | `as written. The` | 1 |
| `the head run, which weren't interleaved` | `the run with it, and the two runs weren't interleaved` | 1 |
| `next to the head build's` / `The head build has` | `next to the tally with it` / `The frozen build has` | 2 |
| `every row reads the expanded rows` | `every row reads the expanded-rows store` | 2 |
| `all plain <code>use(store)</code>` | `all with plain <code>use(store)</code>` | 1 |
| `at no CPU throttling` | `with no CPU throttling` | 1 |
| `The every-restart-must-agree rule from` | `The rule that every restart must agree (see ...)` | 1 |
| fairness-control ranges in "How a win is decided" | removed, link to `#fairness` kept | 1 |
| "list caught up after" bullet in "Notes for reading the scenarios" | removed, definition kept in the typing section | 1 |

## Open decisions

| Item | Evidence | Why open |
|---|---|---|
| "Context" vs "context" for borderline cases | Capitalized 13, lowercase 14 before pass 3. Most lowercase uses are instances | "A store in context" (heading) and "Use context for which store a subtree sees" could be read either way. Left lowercase |
| `setState` vs `useState` as the comparison | "the same as `useState`" (concurrency) and "the same as `setState`" (async actions) | Both are accurate. The setter and the Hook are different referents |
| "fastest of Redux and Zustand" in the ported derived-selectors results | One use. The opponent is every non-store variant at each compiler setting, so "fastest" may be deliberate | Left as written. Author to confirm |
| Serial comma | The page uses none ("transitions, entanglement and rebasing"). Ricky's profile says "Oxford comma usually" | Decided by the orchestrator: use the serial comma in both reports (Ricky's profile). Applied in the voice pass |

## Quoted error and warning messages

React's own error and warning text, quoted in prose, goes in `<q>`, copied exactly from the source (for example `<q>A store was updated before this server render.</q>`, from ReactFizzHooks.js). Describing an error without quoting it ("it throws the invalid Hook call error") needs no markup. Added at the explainer refresh, when the server section's three quoted messages were made consistent.

## Store-vs-context terms

Added in the store-vs-context page's editing pass on 2026-11-02.

- "one context" and "a context per slice" are the prose names for `context` and `context-split`, always lowercase with the article. Together they're "either Context approach", "both Context approaches" or "the Context apps" (capital C, the feature).
- "counted renders": renders of `Row`, `RowView`, `DetailsView` and `CountView` only, from the counting build. Never "every render" or "the work". "rows and views" is the plain gloss.
- "with no CPU throttling" / "with four times CPU throttling" for typing results too, the same as everywhere else (changed from "at" in the skim polish). Not "at no throttling".
- "the slowest one in twenty keys (`p95`)" glosses p95 on first use.
