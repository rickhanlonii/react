# Server Actions Design

**Goal:** Full server action support in Falcon Demo — interactive (callServer) and MPA (form POST) paths, demonstrated with a Todo app fixture.

**Architecture:** Mirror the Next.js RSC pattern. RSC server (port 6000) handles action POST + re-render. SSR server (port 6001) handles MPA form submissions with decodeFormState. Client uses callServer via bridge fetch. `<form>` element supports both string URL actions (MPA) and function actions (interactive).

## Data Flow

### Interactive Mode (hydrated)

```
User taps button → React calls server action function
  → callServer(actionId, args)
  → encodeReply(args) → body
  → bridge $$fetch POSTs to RSC server (port 6000)
  → RSC server: decodeReply → execute action → re-render → Flight stream
  → Client: createFromReadableStream → React reconciles → UI updates
```

**Key APIs (from `react-server-dom-webpack`):**
- Client: `encodeReply` from `react-server-dom-webpack/client.browser` — serializes action args
- Client: `createFromReadableStream` accepts `{ callServer }` option to wire up server references
- Server: `decodeReply` from `react-server-dom-webpack/server` — deserializes action args
- Server: `renderToPipeableStream` from `react-server-dom-webpack/server` — re-renders after action

### MPA Mode (before hydration)

```
User taps submit → Swift collects input values from <input> descendants
  → POSTs FormData to SSR server (port 6001)
  → SSR server: decodeAction → execute → decodeFormState
  → Fetches fresh Flight stream from RSC server (port 6000)
  → Renders via Fizz with formState
  → Returns SSR instruction stream → native re-renders full page
```

**Key APIs (from `react-server-dom-webpack/server`):**
- `decodeAction(body, serverManifest)` — extracts action function from FormData
- `decodeFormState(actionResult, body, serverManifest)` — produces formState for Fizz

**Note on MPA re-render:** The native app must reload the entire instruction stream (equivalent to a full page navigation in web MPA). The SSR coordinator in Swift (`SSRCoordinator.swift`) handles instruction stream parsing; for MPA, it would need to tear down the current tree and rebuild from the new stream.

## Components

| Component | Changes | Key Files |
|---|---|---|
| Bridge `$$fetch` (Swift) | Extend for POST method + request body | `Bindings+Registration.swift:769-836` |
| `<form>` element (Swift) | Submit handling: collect inputs, POST to action URL | `UIKitMutationApplier.swift` (falls through to default UIView), `EventDispatcher.swift` |
| RSC server (server.js) | POST endpoint, server action registration, server manifest | `example/server/server.js` |
| SSR server (ssr-server.js) | POST endpoint for MPA, decodeFormState | `example/server/ssr-server.js` |
| Client entry (entry.js) | callServer implementation, pass to createFromReadableStream | `example/src/entry.js` |
| Fizz config (NativeFizzConfig.js) | Serialize form action references, formState markers | `packages/react-dom-native/src/server/NativeFizzConfig.js` |
| HostConfig.js | Form function action support, HostTransitionContext (already exists at line 535) | `packages/react-dom-native/src/renderer/HostConfig.js` |
| JS bridge (bridge/index.js) | Update fetch wrapper signature | `packages/react-dom-native/src/bridge/index.js:93-95` |

## Current State of Key Infrastructure

### Already in place:
- **`form` element defaults** — `ElementDefaults.swift:25` treats `form` as a block container (same as `div`)
- **`<button>` tap handling** — `UIKitMutationApplier.swift` creates UIButton with `handleButtonTap` target action, dispatches "click" event
- **`<input>` with change events** — UITextField with `handleTextFieldChanged`, dispatches "change" event with `value`
- **HostTransitionContext** — Already defined in `HostConfig.js:535-545` with `NotPendingTransition = null`
- **Event handler bridging** — `replaceEventHandlers()` in HostConfig.js converts function props to `true` canary values (since JSC's `toDictionary()` drops functions)
- **ViewRegistry** — Two-way mapping from ShadowNodeFamily to UIView, used for event dispatch

### Not yet in place:
- No POST support in `$$fetch` (currently GET-only with `(url, headers, callback)` signature)
- No form submit detection (button taps dispatch "click" but don't check for ancestor `<form>`)
- No server action registration or POST endpoints on RSC/SSR servers
- No `callServer` passed to `createFromReadableStream` in entry.js
- No `encodeReply` usage on the client
- Fizz formState markers are no-ops (`NativeFizzConfig.js:213-219`)

## Architecture Considerations

### Form submit in native vs web
In web, `<form>` has native submit behavior. In Falcon, we need to implement this from scratch:
1. When a `<button>` inside a `<form>` is tapped, the `handleButtonTap` handler fires a "click" event
2. For MPA mode: Swift must walk up the UIView hierarchy from the button to find an ancestor `<form>` view, then collect `<input>` values and POST
3. For interactive mode: React intercepts the submit via the JS event system (form action function)

The preferred approach for MPA is to dispatch a "submit" event to JS with form data, letting JS handle the POST (keeps network logic in JS). For interactive mode, React handles it entirely through the reconciler's form action support.

### callServer wiring
In Next.js, `callServer` is wired into `createFromReadableStream` options. In Falcon, `entry.js:253` calls `createFromReadableStream` without `callServer` — this needs to be added. The `callServer` function should:
1. Call `encodeReply(args)` to serialize arguments
2. POST to the RSC server via `$$fetch`
3. Create a new `ReadableStream` from the response Flight data
4. Call `createFromReadableStream` on the response to get the new React tree
5. Use `startTransition` to update the root

## Demo Fixture: Todo App

- **Server actions** (`example/server/src/todo-actions.js`): addTodo, toggleTodo, deleteTodo — registered with `registerServerReference`
- **Server component** (`example/server/src/fixtures/todo-app.js`): renders todo list with initial data
- **Client components** (`example/server/src/components/`): TodoList, TodoItem (useTransition), AddTodoForm (useActionState)
- **Web reference** — should also add matching fixture in `web-example/` for visual comparison

## Implementation Steps

Ordered from least breaking to most breaking:

1a. **Bridge POST support** — Extend `$$fetch` for POST method + request body
1b. **Form string action + submit dispatch** — Fizz prop verification + Swift submit event dispatch + JS string action POST
1c. **Native MPA form POST** — Pre-hydration form submission from Swift (progressive enhancement for string action URLs)
2. **Server action infrastructure** — Registration, POST endpoint, server manifest on RSC server
3. **Client callServer** — encodeReply, bridge POST, Flight stream consumption
4a. **Fizz form action serialization** — `$$FORM_ACTION` serialization, formState markers
4b. **Form submit event handling** — Swift submit dispatch refinement, JS `startHostTransition`, HostConfig canaries
5. **SSR formState plumbing** — renderToPipeableStream formState, SSR POST endpoint, FSM instruction handling, hydrateRoot formState
6. **Todo demo fixture** — Server actions + components exercising all patterns

---

## Cross-Cutting Testing Strategy

### Per-Step Verification Gates

Each step must pass its own tests AND all prior steps' tests before proceeding to the next step. This prevents regressions from accumulating across the implementation sequence.

| Step | Test Commands | Manual Verification |
|---|---|---|
| 1a (Bridge POST) | `npm test` (bridge tests pass) | curl POST to a test endpoint via `$$fetch` |
| 1b (Form string action) | `npm test` (bridge + server tests pass) | Render a `<form action="/url">`, verify submit event dispatches |
| 1c (Native MPA POST) | `npm run test:swift` (Swift tests pass) | Pre-hydration form submit collects inputs and POSTs |
| 2 (Server infrastructure) | `npm test` + manual `curl -X POST` to RSC server action endpoint | Verify `todo-actions.js` functions execute via POST, return Flight stream |
| 3 (callServer) | `npm test` + manual test with real server action | Tap a button wired to a server action, verify round-trip through callServer |
| 4a (Fizz serialization) | `npm test` (server tests for `$$FORM_ACTION` serialization) | Verify Fizz output includes serialized form action references |
| 4b (Form submit handling) | `npm test` + `npm run test:fantom` (form submit in renderer) | `<form action={fn}>` submit triggers `startHostTransition` |
| 5 (SSR formState) | `npm test` + `npm run test:swift` + manual MPA test | Load prerendered page, submit form before hydration, verify formState plumbing |
| 6 (Todo demo) | All test suites + full manual integration walkthrough | Complete CRUD operations in Todo App fixture (see Step 6 plan) |

### Regression Test Suite

After completing each step, run the full regression suite to catch any breakage:

1. **JS unit tests:** `npm test` -- all existing and new test suites pass
2. **Swift unit tests:** `npm run test:swift` -- all Swift tests pass (layout, shadow tree, UIKit bindings)
3. **Fantom integration tests:** `npm run test:fantom` -- all JS-to-Swift integration tests pass
4. **Manual fixture check:** Load at least 3 existing fixtures in the demo app and verify they render correctly:
   - Kitchen Sink (fixture 06) -- exercises all supported elements
   - Counter (basic) -- exercises client-side interactivity
   - Staggered Loading (fixture 05) -- exercises SSR streaming + hydration
5. **Smoke test:** Staggered Loading prerender -> hydration parallel to SSR -> counter increment (see below)

### Staggered Loading Smoke Test (Required After Every Step)

This is the single most important regression test because it exercises the full SSR -> Flight -> hydration -> interaction pipeline. Any breakage in the server, Flight client, renderer, or bridge will surface here.

1. **Load Staggered Loading via partial prerender:**
   - Start dev server: `cd example && npm run dev`
   - Build demo app: `/build demo`
   - Navigate to the Staggered Loading fixture in the fixture list

2. **Confirm hydration starts in parallel to SSR stream delivery:**
   - `npm run app:log-start`
   - Load the Staggered Loading fixture (via prerender path)
   - `npm run app:log-read`
   - **Expected:** Log entries show hydration processing starting while later Suspense boundaries are still pending (Section 1 hydrates before Section 4's 3000ms delay completes)
   - This proves: Flight deserialization is working, the renderer is processing the stream incrementally, and hydration is not blocked on SSR completion

3. **Confirm counter can be incremented (proves hydration completed):**
   - Find the Counter button: `npm run app:snapshot-ui -- --filter increment`
   - Tap the increment button: `npm run app:tap -- <x> <y>`
   - Verify the count increases: `npm run app:snapshot-ui -- --filter Counter`
   - Tap again and verify count is 2
   - This proves: Flight deserialization worked, hydration attached event handlers to the correct UIKit views, React state updates propagate through the renderer

4. **Confirm all sections eventually load:**
   - Wait ~4 seconds for all Suspense boundaries to resolve
   - `npm run app:screenshot`
   - All 4 sections should show content (no remaining skeleton placeholders)

**If this smoke test fails after any step, do not proceed to the next step.** Debug and fix the regression first.

### Final Integration Test (After Step 6)

After all steps (1a through 6) are implemented, run this comprehensive end-to-end verification:

1. **Build and launch the full demo app:**
   - `cd example && npm run dev`
   - `/build demo`

2. **Navigate through ALL fixtures:**
   - Use `npm run app:snapshot-ui` and `npm run app:gesture -- scroll-down` to find each fixture
   - Tap into each fixture and verify it renders correctly
   - Take screenshots of any fixture that looks wrong
   - Pay special attention to fixtures that use `<form>`, `<button>`, and `<input>` elements since those are the elements modified by the server actions implementation

3. **Open the Todo App fixture and perform all CRUD operations:**
   - **Add:** Type "Test todo" in the input, tap Add, verify it appears in the list
   - **Add empty (validation):** Tap Add with empty input, verify "Text is required" error
   - **Toggle:** Tap a todo checkbox, verify checkmark appears and remaining count updates
   - **Delete:** Tap a delete button, verify item is removed from list
   - **Verify pending states:** Each operation should show `opacity: 0.5` or "Adding..." while in flight

4. **Load Todo App via prerender -- test MPA form submission:**
   - Navigate to the prerender endpoint for the Todo App fixture
   - Before hydration completes, type text in the input and tap Add
   - Verify the form submits via MPA path (native POST)
   - Verify the page re-renders with the new todo

5. **Load Staggered Loading -- verify parallel hydration + counter:**
   - Run the full Staggered Loading smoke test described above
   - Counter MUST increment correctly

6. **Navigate between Todo App and other fixtures:**
   - Go to Todo App, add a todo, then navigate to Kitchen Sink
   - Navigate back to Todo App -- verify the added todo persists (in-memory server state)
   - Navigate to Counter fixture -- verify it increments correctly
   - This tests that navigation and state management are not broken by server action infrastructure

7. **Check for errors:**
   - `npm run app:log-start` at the beginning of the test
   - `npm run app:log-read` at the end
   - There should be no unexpected errors or warnings in the logs
   - Verify no JS exceptions or Swift crashes occurred

8. **Run all automated test suites:**
   - `npm test` -- all JS unit and server tests
   - `npm run test:swift` -- all Swift unit tests
   - `npm run test:fantom` -- all Fantom integration tests
   - All suites must pass with zero failures
