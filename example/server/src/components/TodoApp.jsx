'use client';

const React = require('react');
const {useActionState} = React;

const colors = {
  card: '#ffffff',
  secondary: '#8e8e93',
};

const card = {
  backgroundColor: colors.card,
  borderRadius: 16,
  paddingTop: 2,
  paddingBottom: 14,
  paddingLeft: 16,
  paddingRight: 16,
};

function TodoApp({initialTodos, toggleTodo, deleteTodo, updateTodos, children}) {
  const [state, dispatch] = useActionState(updateTodos, {
    todos: initialTodos,
    query: '',
    addError: null,
  });

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
      <div style={card}>
        {children}
        {/* Inline add input */}
        <div style={{height: 1, backgroundColor: '#e5e5ea', marginLeft: 40}} />
        <form action={dispatch}>
          <input
            id="todo-add-input"
            name="text"
            placeholder="Add new todo"
            style={{width: '100%', height: 44, fontSize: 16}}
          />
          {state.addError ? (
            <p style={{color: '#ff3b30', fontSize: 13, marginTop: 0, marginBottom: 0}}>
              {state.addError}
            </p>
          ) : null}
        </form>
        {/* Footer with remaining count */}
        <div
          style={{
            marginTop: 6,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: '#e5e5ea',
          }}>
          <p
            style={{
              color: colors.secondary,
              fontSize: 13,
              marginTop: 0,
              marginBottom: 0,
            }}>
            {state.todos.filter(function(t) { return !t.completed; }).length}{' '}
            {state.todos.filter(function(t) { return !t.completed; }).length === 1 ? 'task' : 'tasks'} remaining
          </p>
        </div>
      </div>
    </div>
  );
}

module.exports = TodoApp;
module.exports.default = TodoApp;
