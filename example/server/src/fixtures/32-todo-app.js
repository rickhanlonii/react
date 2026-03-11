const React = require('react');
const {getTodos, updateTodos} = require('../actions/todo-actions');
const TodoApp = require('../components/TodoApp');

const fixture = {
  title: 'Todo App',
  description: 'Server Actions demo — add, toggle, delete todos',
  category: 'Server Actions',
  config: {},
};

function TodoAppPage() {
  const todos = getTodos();

  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Todo App</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Server Actions demo — add, toggle, delete todos
        </p>
      </div>
      <TodoApp
        initialTodos={todos}
        updateTodos={updateTodos}
      />
    </div>
  );
}

module.exports = TodoAppPage;
module.exports.default = TodoAppPage;
module.exports.fixture = fixture;
