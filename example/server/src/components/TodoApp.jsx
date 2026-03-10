'use client';

const React = require('react');
const {useActionState, useOptimistic} = React;
const TodoAppList = require('./TodoAppList');
const TodoContext = require('./TodoContext');

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

function TodoApp({initialTodos, updateTodos, children}) {
  const [state, dispatch] = useActionState(updateTodos, {
    todos: initialTodos,
    query: '',
    addError: null,
  });

  const [optimisticTodos, addOptimistic] = useOptimistic(state.todos, function(current, action) {
    switch (action.type) {
      case 'toggle':
        return current.map(function(t) {
          return t.id === action.id ? Object.assign({}, t, {completed: !t.completed}) : t;
        });
      case 'delete':
        return current.filter(function(t) { return t.id !== action.id; });
      case 'add':
        return current.concat({id: -Date.now(), text: action.text, completed: false});
      default:
        return current;
    }
  });

  return (
    <TodoContext.Provider value={{dispatch: dispatch, addOptimistic: addOptimistic}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
        <div style={card}>
          <TodoAppList
            todos={optimisticTodos}
            addError={state.addError}>
            {children}
          </TodoAppList>
        </div>
      </div>
    </TodoContext.Provider>
  );
}

module.exports = TodoApp;
module.exports.default = TodoApp;
