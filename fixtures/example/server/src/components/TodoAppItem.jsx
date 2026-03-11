'use client';

const React = require('react');
const {use} = React;
const TodoContext = require('./TodoContext');

const colors = {
  text: '#1c1c1e',
  secondary: '#8e8e93',
  accent: '#007aff',
  danger: '#ff3b30',
  dangerBg: '#fff2f2',
  divider: '#c6c6c8',
  checkBg: '#34c759',
  uncheckBorder: '#d1d1d6',
};

function TodoAppItem({todo, todoPromise}) {
  if (todoPromise) {
    use(todoPromise);
  }
  var ctx = React.useContext(TodoContext);
  var dispatch = ctx.dispatch;
  var addOptimistic = ctx.addOptimistic;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 12,
        gap: 14,
      }}>
      {/* Checkbox - form with hidden fields for MPA, onSubmit for optimistic */}
      <form
        action={dispatch}
        onSubmit={function() {
          addOptimistic({type: 'toggle', id: todo.id});
        }}
        style={{display: 'contents'}}>
        <input type="hidden" name="_action" value="toggle" />
        <input type="hidden" name="_id" value={todo.id} />
        <button
          id={'todo-toggle-' + todo.id}
          type="submit"
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: todo.completed ? colors.checkBg : 'transparent',
            borderWidth: 2,
            borderColor: todo.completed ? colors.checkBg : colors.uncheckBorder,
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
            textDecorationLine: todo.completed ? 'line-through' : 'none',
            fontSize: 16,
            marginTop: 0,
            marginBottom: 0,
          }}>
          {todo.text}
        </p>
      </div>

      {/* Delete button - form with hidden fields for MPA, onSubmit for optimistic */}
      <form
        action={dispatch}
        onSubmit={function() {
          addOptimistic({type: 'delete', id: todo.id});
        }}
        style={{display: 'contents'}}>
        <input type="hidden" name="_action" value="delete" />
        <input type="hidden" name="_id" value={todo.id} />
        <button
          id={'todo-delete-' + todo.id}
          type="submit"
          style={{
            backgroundColor: colors.dangerBg,
            borderRadius: 8,
            paddingTop: 6,
            paddingBottom: 6,
            paddingLeft: 10,
            paddingRight: 10,
          }}>
          <span style={{color: colors.danger, fontSize: 13, fontWeight: '500'}}>Delete</span>
        </button>
      </form>
    </div>
  );
}

module.exports = TodoAppItem;
module.exports.default = TodoAppItem;
