'use client';

const React = require('react');
const TodoAppItem = require('./TodoAppItem');

const colors = {
  secondary: '#8e8e93',
  divider: '#e5e5ea',
};

function TodoAppList({todos, toggleTodo, deleteTodo, dispatch, addError}) {
  if (todos.length === 0) {
    return (
      <div>
        <div style={{paddingTop: 20, paddingBottom: 20}}>
          <p style={{color: colors.secondary, fontSize: 15, textAlign: 'center', marginTop: 0, marginBottom: 0}}>
            No todos yet. Add one below!
          </p>
        </div>
        <div style={{height: 1, backgroundColor: colors.divider}} />
        <form action={dispatch}>
          <input
            id="todo-add-input"
            name="text"
            placeholder="Add new todo"
            style={{width: '100%', height: 44, fontSize: 16}}
          />
          {addError ? (
            <p style={{color: '#ff3b30', fontSize: 13, marginTop: 4, marginBottom: 0}}>
              {addError}
            </p>
          ) : null}
        </form>
      </div>
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
                  marginLeft: 40,
                }}
              />
            ) : null}
          </div>
        );
      })}
      {/* Inline add input */}
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 40}} />
      <form action={dispatch}>
        <input
          id="todo-add-input"
          name="text"
          placeholder="Add new todo"
          style={{width: '100%', height: 44, fontSize: 16}}
        />
        {addError ? (
          <p style={{color: '#ff3b30', fontSize: 13, marginTop: 0, marginBottom: 0}}>
            {addError}
          </p>
        ) : null}
      </form>
      {/* Footer with remaining count */}
      <div
        style={{
          marginTop: 6,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}>
        <p
          style={{
            color: colors.secondary,
            fontSize: 13,
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
