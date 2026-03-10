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

function TodoApp({initialTodos, updateTodos, todoPromises}) {
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
      case 'search':
        if (!action.query || action.query.trim() === '') {
          return current;
        }
        var q = action.query.trim().toLowerCase();
        return current.filter(function(t) {
          return t.text.toLowerCase().indexOf(q) !== -1;
        });
      default:
        return current;
    }
  });

  return (
    <TodoContext.Provider value={{dispatch: dispatch, addOptimistic: addOptimistic}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
        <form
          action={dispatch}
          onSubmit={function(e) {
            var input = e.target.elements.query;
            var query = input && input.value;
            addOptimistic({type: 'search', query: query || ''});
          }}>
          <input type="hidden" name="_action" value="search" />
          <input
            id="todo-search"
            type="search"
            name="query"
            defaultValue={state.query}
            placeholder="Search todos..."
            style={{width: '100%', height: 44, fontSize: 16}}
          />
        </form>
        <div style={card}>
          <TodoAppList
            todos={optimisticTodos}
            addError={state.addError}
            todoPromises={todoPromises} />
        </div>
      </div>
    </TodoContext.Provider>
  );
}

module.exports = TodoApp;
module.exports.default = TodoApp;
