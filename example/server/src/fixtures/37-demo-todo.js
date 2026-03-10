const React = require('react');
const {Suspense} = React;
const {getTodos, toggleTodo, deleteTodo, updateTodos} = require('../actions/todo-actions');
const TodoApp = require('../components/TodoApp');
const TodoAppItem = require('../components/TodoAppItem');

const fixture = {
  title: 'Demo Todo',
  description: 'Standalone demo — Todo app with Suspense loading',
  category: 'Full Pages',
  config: {
    hideNavBar: true,
  },
};

const colors = {
  bg: '#f2f2f7',
  card: '#ffffff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  skeleton: '#e5e5ea',
  divider: '#e5e5ea',
};

const card = {
  backgroundColor: colors.card,
  borderRadius: 16,
  paddingTop: 2,
  paddingBottom: 14,
  paddingLeft: 16,
  paddingRight: 16,
};

function SkeletonRow() {
  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14}}>
      <div style={{width: 26, height: 26, borderRadius: 13, backgroundColor: colors.skeleton}} />
      <div style={{flex: 1, height: 14, backgroundColor: colors.skeleton, borderRadius: 7}} />
    </div>
  );
}

async function DelayedTodoItem({todo, delay, isLast}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return (
    <div>
      <TodoAppItem
        todo={todo}
        toggleTodo={toggleTodo.bind(null, todo.id)}
        deleteTodo={deleteTodo.bind(null, todo.id)}
      />
      {!isLast ? (
        <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 40}} />
      ) : null}
    </div>
  );
}

function TodoListSection() {
  const todos = getTodos();
  return (
    <TodoApp
      initialTodos={todos}
      updateTodos={updateTodos}
      toggleTodo={toggleTodo}
      deleteTodo={deleteTodo}
    >
      {todos.map(function(todo, index) {
        return (
          <Suspense key={todo.id} fallback={
            <div>
              <SkeletonRow />
              {index < todos.length - 1 ? (
                <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 38}} />
              ) : null}
            </div>
          }>
            <DelayedTodoItem
              todo={todo}
              delay={(index + 1) * 150}
              isLast={index === todos.length - 1}
            />
          </Suspense>
        );
      })}
    </TodoApp>
  );
}

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.bg,
        height: '100%',
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 20,
        gap: 14,
      }}>
      {/* Static shell — renders immediately, cached by PPR */}
      <div style={{paddingTop: 64, paddingBottom: 2}}>
        <h1 style={{color: colors.text, fontSize: 34, marginTop: 0, marginBottom: 6}}>Todos</h1>
        <p style={{color: colors.secondary, fontSize: 15, marginTop: 0, marginBottom: 0}}>
          Powered by React Server Components
        </p>
      </div>

      {/* Search bar — part of the static shell, renders immediately */}
      <input
        type="search"
        placeholder="Search todos..."
        style={{width: '100%', height: 44}}
      />

      {/* Dynamic section — each item streams in with increasing delay */}
      <TodoListSection />
    </div>
  );
}

module.exports = App;
module.exports.default = App;
module.exports.fixture = fixture;
