'use client';

const React = require('react');
const {useActionState} = React;

function AddTodoForm({addTodo}) {
  const [state, dispatch, isPending] = useActionState(addTodo, {error: null});

  return (
    <form action={dispatch}>
      <input
        id="todo-input"
        name="text"
        type="search"
        placeholder="What needs to be done?"
        style={{width: '100%', height: 44}}
      />
      {state && state.error ? (
        <p style={{color: '#ff3b30', fontSize: 13, marginTop: 0, marginBottom: 0}}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

module.exports = AddTodoForm;
module.exports.default = AddTodoForm;
