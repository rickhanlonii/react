const React = require('react');
const {getTodos, addTodo, toggleTodo, deleteTodo} = require('../actions/todo-actions');
const TodoAppList = require('../components/TodoAppList');
const AddTodoForm = require('../components/AddTodoForm');

const fixture = {
  title: 'Todo App',
  description: 'Server Actions demo — add, toggle, delete todos',
  category: 'Server Actions',
  config: {},
};

function TodoApp() {
  const todos = getTodos();

  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Todo App</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Server Actions demo — add, toggle, delete todos
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <AddTodoForm addTodo={addTodo} />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <TodoAppList
          todos={todos}
          toggleTodo={toggleTodo}
          deleteTodo={deleteTodo}
        />
      </div>
    </div>
  );
}

module.exports = TodoApp;
module.exports.default = TodoApp;
module.exports.fixture = fixture;
