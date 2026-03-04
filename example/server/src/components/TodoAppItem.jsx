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
