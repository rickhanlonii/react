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
