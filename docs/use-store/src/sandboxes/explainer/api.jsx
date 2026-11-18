import {use, unstable_createStore as createStore} from 'react';

// No reducer: update() takes a value or an updater, like setState.
const filter = createStore('all');

// A reducer: update() passes its argument to the reducer as the action.
const todos = createStore(
  [{text: 'Write the explainer', done: false}],
  (state, action) => {
    switch (action.type) {
      case 'add':
        return [...state, {text: action.text, done: false}];
      case 'toggle':
        return state.map((todo, i) =>
          i === action.index ? {...todo, done: !todo.done} : todo
        );
      default:
        return state;
    }
  }
);

export default function App() {
  const show = use(filter);
  const list = use(todos);
  return (
    <>
      <button
        className="add"
        onClick={() => todos.update({type: 'add', text: 'Ship it'})}>
        Add
      </button>
      <button
        className="filter"
        onClick={() => filter.update(f => (f === 'all' ? 'open' : 'all'))}>
        Showing {show}
      </button>
      <ul>
        {list.map((todo, i) =>
          show === 'open' && todo.done ? null : (
            <li
              key={i}
              onClick={() => todos.update({type: 'toggle', index: i})}>
              {todo.done ? 'Done: ' : ''}
              {todo.text}
            </li>
          )
        )}
      </ul>
    </>
  );
}
