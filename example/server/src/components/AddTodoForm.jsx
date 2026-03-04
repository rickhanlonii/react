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
