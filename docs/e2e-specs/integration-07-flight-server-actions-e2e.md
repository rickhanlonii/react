# Flight Server Actions End-to-End

## Category
integration

## Description
Validates the complete Server Actions flow through the Flight protocol: a Client Component triggers a server action (either via form submission or direct invocation), the action is encoded and sent to the server via the Flight reply protocol, the server decodes and executes the action using `decodeAction` / `decodeReply`, the action's return value is sent back through a new Flight stream, and the client receives the updated UI. This tests the full round-trip of server actions including serialization of arguments, bound values, and return values through the Flight wire format.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` - Server action submission without hydration, `decodeAction`, `decodeFormState`, `serverExports`
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` - Flight rendering with server/client component interop
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMReply-test.js` - Reply encoding/decoding for server action arguments

## App Setup
```jsx
// RSC Server: rsc-server.js
import { renderToPipeableStream, decodeReply, decodeAction } from 'react-server-dom-webpack/server';

// Server Action: addTodo
async function addTodo(prevTodos, formData) {
  'use server';
  const text = formData.get('todo-text');
  const newTodo = { id: Date.now(), text, completed: false };
  return [...prevTodos, newTodo];
}

// Server Action: toggleTodo
async function toggleTodo(todos, todoId) {
  'use server';
  return todos.map(todo =>
    todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
  );
}

// Server Action: deleteTodo
async function deleteTodo(todos, todoId) {
  'use server';
  return todos.filter(todo => todo.id !== todoId);
}

// Server Component
function App({ todos }) {
  return (
    <div id="todo-app">
      <h1>Todo List</h1>
      <TodoList todos={todos} />
      <AddTodoForm addAction={addTodo.bind(null, todos)} />
    </div>
  );
}

// Handle initial RSC render
function handleRSCRequest(req, res) {
  const todos = getTodosFromDB();
  const { pipe } = renderToPipeableStream(
    <App todos={todos} />,
    webpackMap
  );
  pipe(res);
}

// Handle server action invocation
async function handleActionRequest(req, res) {
  const formData = await parseFormData(req);
  const action = await decodeAction(formData, webpackServerMap);
  const result = await action();
  // Re-render with updated state
  const { pipe } = renderToPipeableStream(
    <App todos={result} />,
    webpackMap
  );
  pipe(res);
}

// ClientComponents.js ('use client')
'use client';
import { useState, useTransition } from 'react';

export function TodoList({ todos, onToggle, onDelete }) {
  return (
    <ul id="todo-list">
      {todos.map(todo => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function TodoItem({ todo, onToggle, onDelete }) {
  const [isPending, startTransition] = useTransition();

  return (
    <li
      className={`todo-item ${todo.completed ? 'completed' : ''} ${isPending ? 'pending' : ''}`}
      data-id={todo.id}
    >
      <span
        className="todo-text"
        style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}
      >
        {todo.text}
      </span>
      <button
        className="toggle-btn"
        onClick={() => startTransition(() => onToggle(todo.id))}
        disabled={isPending}
      >
        {todo.completed ? 'Undo' : 'Done'}
      </button>
      <button
        className="delete-btn"
        onClick={() => startTransition(() => onDelete(todo.id))}
        disabled={isPending}
      >
        Delete
      </button>
    </li>
  );
}

export function AddTodoForm({ addAction }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      id="add-todo-form"
      action={addAction}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        startTransition(() => addAction(formData));
        e.target.reset();
      }}
    >
      <input
        id="todo-input"
        type="text"
        name="todo-text"
        placeholder="Add a todo..."
        disabled={isPending}
      />
      <button id="add-btn" type="submit" disabled={isPending}>
        {isPending ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
}
```

## Load Sequence
1. Client navigates to the page. The SSR server fetches the Flight stream from the RSC server.
2. RSC server renders `<App />` with initial todos from the database. Server actions (`addTodo`, `toggleTodo`, `deleteTodo`) are serialized as server references in the Flight payload.
3. Fizz SSR generates HTML from the Flight response: the todo list with existing items and the add-todo form.
4. HTML is streamed to the browser and displayed.
5. Client JavaScript loads. The Flight client decodes the server action references into callable functions that, when invoked, send an HTTP POST to the server with the Flight reply encoding.
6. `hydrateRoot` attaches event handlers to the form and buttons.
7. The page is now interactive with server actions wired up.

## Actions
1. Navigate to the page and verify the initial todo list renders with pre-existing items.
2. Wait for hydration to complete.
3. Type "Buy groceries" into the todo input and click "Add".
4. Observe the pending state (button shows "Adding...").
5. Wait for the server action to complete and the UI to update.
6. Type "Walk the dog" into the todo input and click "Add".
7. Wait for the UI to update with the second todo.
8. Click "Done" on the "Buy groceries" todo item.
9. Wait for the toggle action to complete.
10. Click "Delete" on the "Walk the dog" todo item.
11. Wait for the delete action to complete.

## Assertions
1. Initial render: the todo list displays pre-existing items from the database.
2. After adding "Buy groceries": the todo list contains a new `<li>` with text "Buy groceries", `completed: false`.
3. During the add action: the "Add" button shows "Adding..." and the input is disabled (pending state via `useTransition`).
4. After the action completes: the input re-enables and the button text returns to "Add".
5. After adding "Walk the dog": the todo list now contains both new items.
6. After clicking "Done" on "Buy groceries": the todo item gets the `completed` class and its text has `text-decoration: line-through`. The button text changes to "Undo".
7. During the toggle action: the todo item has the `pending` class and the buttons are disabled.
8. After clicking "Delete" on "Walk the dog": the item is removed from the list.
9. The server action arguments are correctly serialized through the Flight reply protocol: `formData` for the add action, `todoId` for toggle and delete.
10. Server actions with `.bind(null, todos)` correctly receive the bound `todos` array as the first argument.
11. Each server action round-trip results in a fresh Flight stream that updates the UI without a full page reload.
12. No errors appear in the console during any server action invocation.
