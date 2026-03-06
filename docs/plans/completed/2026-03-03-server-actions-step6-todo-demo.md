# Step 6: Todo Demo Fixture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Working Todo app fixture that exercises all server action patterns: basic actions, bind, useActionState, useTransition, form submission.

**Architecture:** Server component renders todo list with data from server. Client components handle interaction with server actions via callServer (interactive) and form POST (MPA).

**Tech Stack:** React Server Components, Server Actions, useActionState, useTransition

**Depends on:** Steps 1-5 (all infrastructure)

---

## Codebase Context

### Fixture conventions
- Files are numbered sequentially: `XX-name.js` in `example/server/src/fixtures/`. The next number is **32**.
- Fixtures are **auto-discovered** from the directory — no registration needed. The server reads all `.js` files from the directory, sorted by filename.
- The web-example also auto-discovers fixtures from the same directory via `require.context`.
- Fixture metadata format (defined at top of file, exported as `module.exports.fixture`):
  ```js
  const fixture = {
    title: 'Todo App',
    description: 'Server Actions demo — add, toggle, delete todos',
    category: 'Server Actions',
    config: {},
  };
  ```
- Exports pattern: `module.exports = Component; module.exports.default = Component; module.exports.fixture = fixture;`

### Code conventions
- Use `const` (not `var`) — all existing fixtures and components use `const`.
- Function declarations (not arrow functions) for components.
- Standard card layout: `backgroundColor: '#f2f2f7'` background, white `#ffffff` cards with `borderRadius: 12`, `padding: 16`.
- iOS color palette: `#1c1c1e` (text), `#8e8e93` (secondary), `#007aff` (accent/blue), `#ff3b30` (danger/red), `#34c759` (success/green).
- All interactive elements (`<button>`, `<input>`) must have `id` props (maps to `accessibilityIdentifier` in UIKit).
- `display: 'flex'` must be explicitly set on flex containers.

### Supported native elements
- `<div>` — UIView container (column by default)
- `<span>`, `<p>`, `<h1>`-`<h6>` — UILabel text elements
- `<button>` — UIButton
- `<input>` — UITextField
- `<form>` — renders as a generic UIView container (same as an unstyled div). Works as a container but has no special native form behavior — form action handling is done in JS by the renderer (Step 4).
- `<img>` — UIImageView
- `<fieldset>`, `<legend>` — supported
- **NOT supported natively**: `<textarea>`, `<select>`. Use `<input>` for text entry.

### Existing TodoList component
There is an existing `TodoList.jsx` in `example/server/src/components/` that uses **client-side state only** (useState). It's used by the kitchen-sink fixture (fixture 06). The new server-action-powered components should use **different names** to avoid conflict:
- `TodoAppList.jsx` — server-action-powered todo list
- `TodoAppItem.jsx` — individual todo item with useTransition
- `AddTodoForm.jsx` — form with useActionState

### Client component bundling
- webpack + `ReactFlightWebpackPlugin` auto-discovers `'use client'` files in `example/server/src/components/`.
- New `.jsx` files with `'use client'` at the top are automatically included in the client manifest.
- No manual registration or config changes needed.

### Server actions (from Steps 1-5)
- Server action files go in `example/server/src/actions/` with `'use server'` directive.
- `node-register` (already active in `server.js`) intercepts requires for `'use server'` files and registers server references.
- The server POST endpoint (`/fixtures/:name`) processes action invocations and returns Flight streams.
- `callServer` in `entry.js` handles the client-side invocation.
- The todo actions file (`todo-actions.js`) is created in Step 2 with `getTodos`, `addTodo`, `toggleTodo`, `deleteTodo`.

---

### Task 1: Create the Todo app server component

**Files:**
- Create: `example/server/src/fixtures/32-todo-app.js`

**Step 1: Create the fixture**

```jsx
const React = require('react');
const {getTodos, addTodo, toggleTodo, deleteTodo} = require('../actions/todo-actions');
const TodoAppList = require('../components/TodoAppList');
const AddTodoForm = require('../components/AddTodoForm');

const fixture = {
  title: 'Todo App',
  description: 'Server Actions demo — add, toggle, delete todos',
  category: 'Server Actions',
  config: {},
};

function TodoApp() {
  const todos = getTodos();

  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Todo App</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Server Actions demo — add, toggle, delete todos
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <AddTodoForm addTodo={addTodo} />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <TodoAppList
          todos={todos}
          toggleTodo={toggleTodo}
          deleteTodo={deleteTodo}
        />
      </div>
    </div>
  );
}

module.exports = TodoApp;
module.exports.default = TodoApp;
module.exports.fixture = fixture;
```

**Notes:**
- `getTodos()` is a plain synchronous function (not a server action), called on the server during rendering. It returns the current in-memory todo list.
- `addTodo`, `toggleTodo`, `deleteTodo` are server action functions (marked with `'use server'`). When passed as props to client components, React serializes them as server references in the Flight stream.
- The fixture follows the standard card layout pattern used by all other fixtures.

**Step 2: Commit**

```bash
git add example/server/src/fixtures/32-todo-app.js
git commit -m "feat: add TodoApp server component fixture"
```

---

### Task 2: Create AddTodoForm client component

**Files:**
- Create: `example/server/src/components/AddTodoForm.jsx`

**Step 1: Create the component with useActionState**

```jsx
'use client';

const React = require('react');
const {useActionState} = React;

function AddTodoForm({addTodo}) {
  const [state, dispatch, isPending] = useActionState(addTodo, {error: null});

  return (
    <form action={dispatch} style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <input
          id="todo-input"
          name="text"
          placeholder="What needs to be done?"
          style={{
            flex: 1,
            backgroundColor: '#f2f2f7',
            borderRadius: 8,
            padding: 10,
            fontSize: 15,
            color: '#1c1c1e',
          }}
        />
        <button
          id="todo-add"
          type="submit"
          style={{
            backgroundColor: '#007aff',
            borderRadius: 8,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          <span style={{color: '#ffffff', fontSize: 15, fontWeight: '600'}}>
            {isPending ? 'Adding...' : 'Add'}
          </span>
        </button>
      </div>
      {state && state.error ? (
        <p style={{color: '#ff3b30', fontSize: 12, marginTop: 0, marginBottom: 0}}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

module.exports = AddTodoForm;
module.exports.default = AddTodoForm;
```

**Notes:**
- Uses `useActionState` to wrap the `addTodo` server action. The `dispatch` function is passed as the `<form action>`, which React intercepts on submit.
- `isPending` shows optimistic "Adding..." text while the server action is in flight.
- `state.error` displays validation errors returned by the server action (e.g., empty text).
- The `name="text"` on the input is required — `useActionState` passes a `FormData` to the server action, and `formData.get('text')` reads the input value.
- `<form>` renders as a generic UIView container on native (no special behavior) — form submission is handled entirely in JS by React's form action handling (Step 4).
- Button text uses `<span>` inside `<button>` because `<button>` maps to UIButton which handles child text nodes.
- Styles use individual padding properties (`paddingTop`, `paddingLeft`, etc.) because shorthand `padding` with different horizontal/vertical values is not reliably supported.

**Step 2: Commit**

```bash
git add example/server/src/components/AddTodoForm.jsx
git commit -m "feat: add AddTodoForm client component with useActionState"
```

---

### Task 3: Create TodoAppItem client component

**Files:**
- Create: `example/server/src/components/TodoAppItem.jsx`

**Step 1: Create the component with useTransition**

```jsx
'use client';

const React = require('react');
const {useTransition} = React;

const colors = {
  text: '#1c1c1e',
  secondary: '#8e8e93',
  accent: '#007aff',
  danger: '#ff3b30',
  divider: '#c6c6c8',
  checkBg: '#34c759',
};

function TodoAppItem({todo, toggleTodo, deleteTodo}) {
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const isPending = isToggling || isDeleting;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 10,
        gap: 12,
        opacity: isPending ? 0.5 : 1,
      }}>
      {/* Checkbox */}
      <button
        id={'todo-toggle-' + todo.id}
        onClick={function() {
          startToggle(function() {
            toggleTodo();
          });
        }}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: todo.completed ? colors.checkBg : 'transparent',
          borderWidth: 2,
          borderColor: todo.completed ? colors.checkBg : colors.divider,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {todo.completed ? (
          <span style={{color: '#ffffff', fontSize: 14, fontWeight: '700'}}>
            ✓
          </span>
        ) : null}
      </button>

      {/* Text */}
      <div style={{flex: 1}}>
        <p
          style={{
            color: todo.completed ? colors.secondary : colors.text,
            fontSize: 15,
            marginTop: 0,
            marginBottom: 0,
          }}>
          {todo.text}
        </p>
      </div>

      {/* Delete button */}
      <button
        id={'todo-delete-' + todo.id}
        onClick={function() {
          startDelete(function() {
            deleteTodo();
          });
        }}
        style={{
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 8,
          paddingRight: 8,
        }}>
        <span style={{color: colors.danger, fontSize: 13}}>Delete</span>
      </button>
    </div>
  );
}

module.exports = TodoAppItem;
module.exports.default = TodoAppItem;
```

**Notes:**
- Uses two separate `useTransition` calls so toggle and delete can show independent pending states.
- `opacity: 0.5` gives visual feedback while a server action is in flight.
- `toggleTodo` and `deleteTodo` are pre-bound server actions (bound with `.bind(null, todo.id)` in the parent component, which uses React's server reference bind support).
- Uses `<button>` for interactive elements (not `<div onClick>`) per project conventions. Each button has a unique `id` for UI automation (`todo-toggle-{id}`, `todo-delete-{id}`).
- Uses "Delete" text instead of "✕" symbol for better accessibility and clearer intent.
- Uses the same color palette as the existing `TodoList.jsx` for visual consistency.

**Step 2: Commit**

```bash
git add example/server/src/components/TodoAppItem.jsx
git commit -m "feat: add TodoAppItem client component with useTransition"
```

---

### Task 4: Create TodoAppList client component

**Files:**
- Create: `example/server/src/components/TodoAppList.jsx`

**Step 1: Create the component**

```jsx
'use client';

const React = require('react');
const TodoAppItem = require('./TodoAppItem');

const colors = {
  secondary: '#8e8e93',
  divider: '#c6c6c8',
};

function TodoAppList({todos, toggleTodo, deleteTodo}) {
  if (todos.length === 0) {
    return (
      <p style={{color: colors.secondary, fontSize: 14, textAlign: 'center', marginTop: 16, marginBottom: 16}}>
        No todos yet. Add one above!
      </p>
    );
  }

  const remaining = todos.filter(function(t) { return !t.completed; }).length;

  return (
    <div>
      {todos.map(function(todo, index) {
        return (
          <div key={todo.id}>
            <TodoAppItem
              todo={todo}
              toggleTodo={toggleTodo.bind(null, todo.id)}
              deleteTodo={deleteTodo.bind(null, todo.id)}
            />
            {index < todos.length - 1 ? (
              <div
                style={{
                  height: 1,
                  backgroundColor: colors.divider,
                  marginLeft: 36,
                }}
              />
            ) : null}
          </div>
        );
      })}
      {/* Footer with remaining count */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}>
        <p
          style={{
            color: colors.secondary,
            fontSize: 12,
            marginTop: 0,
            marginBottom: 0,
          }}>
          {remaining} {remaining === 1 ? 'task' : 'tasks'} remaining
        </p>
      </div>
    </div>
  );
}

module.exports = TodoAppList;
module.exports.default = TodoAppList;
```

**Notes:**
- `toggleTodo.bind(null, todo.id)` and `deleteTodo.bind(null, todo.id)` — React recognizes `.bind()` on server references and creates bound server references that include the bound arguments in the serialized reference. This is how individual todo IDs get passed to the server actions.
- The divider between items uses `marginLeft: 36` to align with text (past the checkbox).
- This is a `'use client'` component even though it doesn't use hooks directly — it needs to be a client component because it renders `TodoAppItem` (which uses `useTransition`) and because it receives server action function props that need to be callable on the client.
- The remaining count updates after server actions complete (React re-renders with fresh data from the server).

**Step 2: Commit**

```bash
git add example/server/src/components/TodoAppList.jsx
git commit -m "feat: add TodoAppList client component"
```

---

### Task 5: Add web-example reference page (optional)

The web-example auto-discovers fixtures via `require.context` from the same `example/server/src/fixtures/` directory. However, the server action fixture (`32-todo-app.js`) requires a server with `'use server'` support and the `todo-actions.js` file. The web-example (Next.js) would need its own server action implementation.

**Decision:** Skip for now. The web-example will show the fixture in its list but clicking it will error (server actions not available in the Next.js reference app). This is acceptable — the web-example is for visual comparison of layout/styling, not for testing server-side features. A follow-up task can add a Next.js-compatible version of the todo actions.

---

### Task 6: Integration testing

**Step 1: Build and run**

Run: `/build demo`

This rebuilds the JS bundle (webpack) and builds/launches the iOS app on the "Falcon Demo" simulator.

**Step 2: Navigate to the fixture**

The Todo App fixture should appear under the "Server Actions" category in the fixture list.

```bash
# Find the Todo App fixture in the UI
npm run app:snapshot-ui -- --filter "Todo App"
```

Tap on it to navigate:
```bash
# Get coordinates from snapshot-ui output, then tap
npm run app:tap -- <x> <y>
```

**Step 3: Verify initial render**

```bash
npm run app:snapshot-ui
```

Expected elements:
- "Todo App" heading
- Input field with placeholder "What needs to be done?"
- "Add" button
- 2 initial todo items: "Learn React Server Components" (completed) and "Build with Server Actions" (not completed)
- "1 task remaining" footer

```bash
npm run app:screenshot
```

Verify visual appearance matches the iOS-styled card layout.

**Step 4: Test adding a todo (interactive via server action)**

```bash
# Tap the input field
npm run app:tap -- <todo-input-x> <todo-input-y>
# Type text
npm run app:type-text -- "Test server action"
# Tap Add button
npm run app:tap -- <todo-add-x> <todo-add-y>
```

Expected:
1. Button text changes to "Adding..." (isPending = true)
2. Server action executes on server, adds todo to in-memory store
3. Server returns new Flight stream with updated UI
4. Todo list re-renders with 3 items including "Test server action"
5. "2 tasks remaining" footer

```bash
npm run app:screenshot
```

**Step 5: Test adding empty todo (validation)**

```bash
# Tap Add without entering text
npm run app:tap -- <todo-add-x> <todo-add-y>
```

Expected: Error message "Text is required" appears in red below the input.

**Step 6: Test toggling a todo**

```bash
# Tap the checkbox on "Build with Server Actions" (id: todo-toggle-2)
npm run app:snapshot-ui -- --filter "todo-toggle"
npm run app:tap -- <toggle-x> <toggle-y>
```

Expected:
1. Item shows `opacity: 0.5` during pending state
2. Server action toggles `completed` status
3. Re-render shows checkmark and strikethrough-style color change
4. "0 tasks remaining" footer

**Step 7: Test deleting a todo**

```bash
# Tap delete on first todo (id: todo-delete-1)
npm run app:snapshot-ui -- --filter "todo-delete"
npm run app:tap -- <delete-x> <delete-y>
```

Expected:
1. Item shows `opacity: 0.5` during pending state
2. Server action removes todo from in-memory store
3. Re-render removes the item from the list

**Step 8: Take final screenshot**

```bash
npm run app:screenshot
```

Verify the final state looks correct.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: complete Todo App fixture exercising all server action patterns"
```

---

## Edge Cases and Error Handling

### Network errors
If the server is unreachable (e.g., dev server not running), `callServer` will fail with a fetch error. The current `callServer` implementation (Step 3) does not have error handling — it will reject the promise, which React will handle by throwing during render (caught by an error boundary if one exists, otherwise an unhandled error). This is acceptable for a demo fixture. Production apps should add error boundaries around interactive sections.

### Concurrent submissions
Multiple rapid taps on toggle/delete buttons could cause concurrent server actions. This is safe because:
- Each action operates on a specific todo by ID
- React's `useTransition` queues transitions properly
- The in-memory store uses synchronous array operations (no race conditions)
- However, rapid add + delete of the same item could produce unexpected ordering. This is a known limitation of in-memory state.

### Server restart
The in-memory todo store resets when the server restarts. This is expected behavior for a demo. The todos reset to the initial 2 items.

### Form MPA fallback
If JS hydration hasn't completed, the `<form action={dispatch}>` should still work via MPA form submission (Step 1 + Step 5). The form POSTs to the server, which executes the action and returns a full-page Flight stream. The native app navigates to show the updated state. This is the progressive enhancement story for server actions.

---

## File Summary

| File | Type | Description |
|------|------|-------------|
| `example/server/src/fixtures/32-todo-app.js` | Server component | Root fixture — renders todo list from server data |
| `example/server/src/components/AddTodoForm.jsx` | Client component | Form with useActionState for adding todos |
| `example/server/src/components/TodoAppList.jsx` | Client component | Renders list of TodoAppItem components |
| `example/server/src/components/TodoAppItem.jsx` | Client component | Individual todo with useTransition for toggle/delete |
| `example/server/src/actions/todo-actions.js` | Server actions | Created in Step 2 — getTodos, addTodo, toggleTodo, deleteTodo |

**Dependencies created by earlier steps (not created here):**
- Step 1: `$$fetch` POST support, form submit handling in Swift
- Step 2: Server POST endpoint, `todo-actions.js`, webpack globals
- Step 3: `callServer` in `entry.js`, `encodeReply` import
- Step 4: Form action serialization in Fizz, renderer form submit handling
- Step 5: SSR MPA form handling

---

## Testing & Verification

This is the most important verification plan in the server actions series because the Todo Demo fixture exercises ALL prior steps (1a through 5) end-to-end.

### Automated Tests

#### Server tests (`packages/react-dom-native/src/server/__tests__/` or `example/server/__tests__/`)

- **`todo-actions.js` function correctness:**
  - `getTodos()` returns the initial 2 todos (`Learn React Server Components` completed, `Build with Server Actions` not completed)
  - `addTodo('test')` adds a todo and returns `{success: true, todo: {id: 3, text: 'test', completed: false}}`
  - `addTodo('')` returns `{error: 'Text is required'}` without modifying the store
  - `toggleTodo(1)` toggles completed status and returns `{success: true}`
  - `toggleTodo(999)` returns `{error: 'Todo not found'}`
  - `deleteTodo(1)` removes the todo from the store and returns `{success: true}`
  - `deleteTodo(999)` returns `{error: 'Todo not found'}`

- **`node-register` server reference assignment:**
  - Verify that requiring `todo-actions.js` through `node-register` assigns `$$id` to all exported functions (`addTodo`, `toggleTodo`, `deleteTodo`)
  - Verify that `getTodos` (a plain function, not a server action) does NOT get a `$$id`

#### Fantom integration tests (`tests/integration/`)

- **TodoApp Flight rendering:**
  - Render the `32-todo-app.js` fixture through the Flight pipeline (RSC server render -> Flight stream -> client deserialization)
  - Verify `Fantom.getRenderedOutput()` contains: heading "Todo App", input field, "Add" button, 2 todo items, "1 task remaining" footer
  - Verify server action references are serialized correctly in the Flight stream (they appear as `$F` references)

#### Unit tests

- **AddTodoForm rendering:**
  - Renders an `<input>` with `name="text"` and `placeholder="What needs to be done?"`
  - Renders a `<button>` with text "Add" (not "Adding..." initially since `isPending` starts false)
  - When `isPending` is true, button text switches to "Adding..."
  - When `state.error` is set, displays the error message in a `<p>` with red color `#ff3b30`
  - All interactive elements have `id` props: `todo-input`, `todo-add`

- **TodoAppItem rendering:**
  - Renders a checkbox `<button>` with `id="todo-toggle-{id}"` and a delete `<button>` with `id="todo-delete-{id}"`
  - When `todo.completed` is true, checkbox shows green background (`#34c759`) and checkmark
  - When `todo.completed` is false, checkbox shows transparent background with border
  - When `isPending` (either `isToggling` or `isDeleting`), container opacity is 0.5
  - Clicking toggle button calls `toggleTodo()` inside `startTransition`
  - Clicking delete button calls `deleteTodo()` inside `startTransition`

- **TodoAppList rendering:**
  - Given an empty array, renders "No todos yet. Add one above!" message
  - Given 2 todos (1 completed, 1 not), renders 2 `TodoAppItem` components with a divider between them
  - Footer shows correct remaining count: "1 task remaining" (singular) vs "2 tasks remaining" (plural)
  - Calls `toggleTodo.bind(null, todo.id)` and `deleteTodo.bind(null, todo.id)` for each item

### Manual Testing -- Full Integration Walkthrough

This exercises the entire server action pipeline from UI interaction through server execution and back to UI update.

#### Initial Load

1. Start dev server: `cd example && npm run dev`
2. Build demo app: `/build demo`
3. Find "Todo App" in fixture list: `npm run app:snapshot-ui -- --filter "Todo"`
4. Tap to navigate to the Todo App fixture
5. Verify initial render:
   - `npm run app:snapshot-ui` -- check for heading "Todo App", input field with placeholder, "Add" button, 2 todo items ("Learn React Server Components" with checkmark, "Build with Server Actions" without), "1 task remaining" footer
   - `npm run app:screenshot` -- verify visual appearance matches iOS card layout (white cards on `#f2f2f7` background, rounded corners, proper spacing)

#### Test: Add a Todo (Interactive Server Action via callServer)

1. Tap the input field: `npm run app:tap -- <todo-input coords>` (find via `npm run app:snapshot-ui -- --filter "todo-input"`)
2. Type text: `npm run app:type-text -- "Buy groceries"`
3. Tap Add button: `npm run app:tap -- <todo-add coords>` (find via `npm run app:snapshot-ui -- --filter "todo-add"`)
4. Verify:
   - `npm run app:log-start` before tapping, then `npm run app:log-read` after -- look for POST request to RSC server and Flight stream response
   - Button text momentarily shows "Adding..." (`isPending` from `useActionState`)
   - After server action completes, new todo "Buy groceries" appears in the list
   - Footer shows "2 tasks remaining"
   - `npm run app:screenshot` to capture the updated state

#### Test: Add Empty Todo (Validation Error)

1. Ensure input field is empty (or tap input and clear it)
2. Tap Add button: `npm run app:tap -- <todo-add coords>`
3. Verify error message appears:
   - `npm run app:snapshot-ui -- --filter "required"` -- should show "Text is required"
   - `npm run app:screenshot` -- red error text should be visible below input

#### Test: Toggle a Todo (Server Action with useTransition)

1. Find toggle button: `npm run app:snapshot-ui -- --filter "todo-toggle"`
2. Tap the checkbox for "Build with Server Actions": `npm run app:tap -- <todo-toggle-2 coords>`
3. Verify:
   - Item briefly shows reduced opacity (`opacity: 0.5` from `isPending`)
   - After completion, checkmark appears (green circle with "checkmark") and text color changes to secondary (`#8e8e93`)
   - Remaining count updates (should decrease)
   - `npm run app:screenshot` to verify visual state

#### Test: Delete a Todo (Server Action with useTransition)

1. Find delete button: `npm run app:snapshot-ui -- --filter "todo-delete"`
2. Tap delete on the first todo: `npm run app:tap -- <todo-delete-1 coords>`
3. Verify:
   - Item briefly shows reduced opacity
   - Item is removed from the list entirely
   - `npm run app:snapshot-ui` -- the deleted todo text should no longer appear
   - Remaining count and list update correctly

#### Test: MPA Form Submission (Pre-hydration, if Step 5 is implemented)

1. Load the Todo fixture via the prerender endpoint: navigate to `/prerender/32-todo-app` on the SSR server (port 6001)
2. Before hydration completes, tap the input and type text, then tap Add
3. Verify the form submits via the MPA path (native POST to SSR server)
4. Verify the page re-renders with the new todo (full page refresh, not incremental update)
5. `npm run app:log-read` -- look for the MPA POST request in logs

### Regression Checklist

After implementing the Todo Demo fixture, verify that nothing in the existing app is broken:

- [ ] All OTHER existing fixtures still render correctly (navigate through the full fixture list via `npm run app:gesture -- scroll-down` and tapping each)
- [ ] Staggered Loading fixture prerender works -- hydration runs in parallel to SSR streaming
- [ ] Counter in Staggered Loading increments correctly (tap increment, verify count changes)
- [ ] Kitchen Sink fixture renders all supported elements (`<div>`, `<span>`, `<p>`, `<h1>`-`<h6>`, `<button>`, `<input>`, `<img>`, `<form>`, `<fieldset>`, `<legend>`)
- [ ] Counter fixture (basic) increments correctly
- [ ] Suspense fixtures (including `05-nested-suspense`) load correctly with progressive content
- [ ] Flight deserialization works for all fixtures (no console errors during navigation)
- [ ] No console errors during normal operation: `npm run app:log-start`, navigate through fixtures, `npm run app:log-read`
- [ ] `npm test` passes all test suites
- [ ] `npm run test:swift` passes
- [ ] `npm run test:fantom` passes
- [ ] Server hot-reload works (modify `32-todo-app.js`, verify the fixture auto-refreshes via WebSocket)

### Smoke Test: Staggered Loading (Critical Regression Test)

This smoke test MUST pass after implementing ALL server action steps to confirm the SSR -> Flight -> hydration -> interaction pipeline is intact:

1. **Setup:** `cd example && npm run dev`
2. **Navigate to Staggered Loading** in the fixture list
3. **Load via prerender endpoint:**
   - The prerender path renders the static shell (skeletons) immediately
   - Dynamic content streams in progressively (500ms, 1000ms, 2000ms, 3000ms delays)
4. **Verify hydration starts in parallel to SSR stream:**
   - `npm run app:log-start`
   - Load the Staggered Loading fixture
   - `npm run app:log-read`
   - **Expected:** Log entries show hydration processing starting while later Suspense boundaries are still pending
   - Section 1 content should become interactive (hydrated) before Section 4's 3000ms delay completes
   - This proves hydration and SSR streaming happen concurrently, not sequentially
5. **Verify counter interactivity (proves hydration completed for Section 1):**
   - Find Counter: `npm run app:snapshot-ui -- --filter Counter` (or `-- --filter increment`)
   - Note the initial count value (should be 0)
   - Tap the increment button: `npm run app:tap -- <x> <y>`
   - `npm run app:snapshot-ui -- --filter Counter` -- value should now be 1
   - Tap again -- value should be 2
   - This MUST work even while later sections are still streaming in
6. **Verify all sections eventually load:**
   - Wait ~4 seconds for all Suspense boundaries to resolve
   - `npm run app:screenshot`
   - All 4 sections should show content (no remaining skeleton placeholders)
   - Each section should display its numbered label and content

### End-to-End Server Actions Verification Matrix

After ALL steps (1a through 6) are implemented, run this comprehensive test matrix covering every server action code path:

| Test Case | Path | Expected Result | How to Verify |
|---|---|---|---|
| Add todo (interactive) | callServer -> RSC POST -> Flight response | New todo appears in list | `npm run app:snapshot-ui` after add |
| Add empty todo (validation) | callServer -> RSC POST -> validation error | Error message "Text is required" shown | `npm run app:snapshot-ui -- --filter "required"` |
| Toggle todo | callServer -> RSC POST -> state change | Checkbox toggles, remaining count updates | `npm run app:screenshot` |
| Delete todo | callServer -> RSC POST -> item removed | Item disappears from list | `npm run app:snapshot-ui` |
| MPA add todo (pre-hydration) | Native POST -> SSR server -> re-render | Full page refresh with new todo | Load prerender, submit before hydration |
| Concurrent actions | Rapid toggle + delete | Both complete without error | Rapid taps, verify final state with `snapshot-ui` |
| Server restart | Restart RSC server mid-session | Todos reset to initial 2 | Restart server, reload fixture, verify 2 items |
| Network error | Stop RSC server, trigger action | Error surfaces (console or error boundary) | Stop server, tap button, `npm run app:log-read` |
| Fixture navigation | Navigate away and back to Todo App | Todo state persists (in-memory on server) | Navigate to Kitchen Sink, back to Todo, verify state |
| Staggered Loading (regression) | Prerender -> parallel hydration -> interaction | Counter works, all 4 sections load | Full smoke test above |
| Add after delete | Delete all todos, then add a new one | "No todos yet" message, then new todo appears | Delete all, verify empty state, add one |
| Rapid adds | Add 3 todos in quick succession | All 3 appear in correct order | Type and submit 3 times quickly, verify list |
