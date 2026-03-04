'use client';

const React = require('react');

const colors = {
  text: '#1c1c1e',
  secondary: '#8e8e93',
  accent: '#007aff',
  danger: '#ff3b30',
  divider: '#c6c6c8',
  checkBg: '#34c759',
};

function TodoAppItem({todo, toggleTodo, deleteTodo}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 10,
        gap: 12,
      }}>
      {/* Checkbox - wrapped in form for MPA */}
      <form action={toggleTodo} style={{display: 'contents'}}>
        <button
          id={'todo-toggle-' + todo.id}
          type="submit"
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
      </form>

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

      {/* Delete button - wrapped in form for MPA */}
      <form action={deleteTodo} style={{display: 'contents'}}>
        <button
          id={'todo-delete-' + todo.id}
          type="submit"
          style={{
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 8,
            paddingRight: 8,
          }}>
          <span style={{color: colors.danger, fontSize: 13}}>Delete</span>
        </button>
      </form>
    </div>
  );
}

module.exports = TodoAppItem;
module.exports.default = TodoAppItem;
