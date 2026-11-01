import {use, unstable_createStore as createStore} from 'react';

// A store per todo, in a store that holds the list.
const todos = createStore([
  createStore({text: 'Read the explainer', done: false}),
  createStore({text: 'Try the sandboxes', done: false}),
]);

function Todo({todo}) {
  const {text, done} = use(todo);
  return (
    <li onClick={() => todo.update(t => ({...t, done: !t.done}))}>
      {done ? 'Done: ' : ''}
      {text}
    </li>
  );
}

export default function TodoList() {
  const list = use(todos);
  return (
    <>
      <button
        onClick={() =>
          todos.update(l => [...l, createStore({text: 'Ship it', done: false})])
        }>
        Add a todo
      </button>
      <ul>
        {list.map((todo, i) => (
          <Todo key={i} todo={todo} />
        ))}
      </ul>
    </>
  );
}
