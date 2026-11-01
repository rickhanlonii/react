# use(store) docs style sheet

Shared by the explainer (`src/explainer.src.html`) and the benchmark report. Built in copyedit pass 3 on 2026-11-01 from the explainer's own usage. Basis order: (1) house rules from the team lead and gate G7; (2) Ricky's style profile (`~/.me/STYLE.md`); (3) majority usage in the explainer; (4) react.dev conventions where the page had no evidence. Counts are from the explainer before pass 3.

## Paste-back sheet

```
US spelling. Sentence-case headings. No em dashes, no semicolons in prose.
Spaced hyphen " - " allowed. Contractions always. Serial (Oxford) comma: yes, per ~/.me/STYLE.md ("Oxford comma usually")
("A, B and C"). Numbers in prose are words; digits only in code, DCP-n,
section numbers and on-screen labels. Sentences under about 30 words.
Code identifiers in <code>. On-screen labels in <q>. Hook (capital H),
Context (the feature) / a context (an instance), Provider, re-render,
StrictMode, Suspense, Activity, HostRoot, work in progress (noun) /
work-in-progress (adjective), the React Compiler, then "the compiler".
"DCP-17", linked to #dcp-17. Scope words are locked.
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

## Word list (A to Z)

```
Activity (the component and feature, capitalized), a hidden Activity tree
async action
base state, base queue (prose); baseState, baseQueue (code, diagram)
batch (verb), batching
benchmark report (lowercase in prose; the link text "the benchmark report")
commit (noun and verb), committed state, committed value
compiler: "the React Compiler" on first mention in a section, then "the compiler"
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

## Open decisions

| Item | Evidence | Why open |
|---|---|---|
| "Context" vs "context" for borderline cases | Capitalized 13, lowercase 14 before pass 3. Most lowercase uses are instances | "A store in context" (heading) and "Use context for which store a subtree sees" could be read either way. Left lowercase |
| `setState` vs `useState` as the comparison | "the same as `useState`" (concurrency) and "the same as `setState`" (async actions) | Both are accurate. The setter and the Hook are different referents |
| Serial comma | The page uses none ("transitions, entanglement and rebasing"). Ricky's profile says "Oxford comma usually" | Decided by the orchestrator: use the serial comma in both reports (Ricky's profile). Applied in the voice pass |
