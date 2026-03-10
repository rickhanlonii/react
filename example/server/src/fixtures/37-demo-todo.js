const React = require('react');
const {Suspense} = React;
const {getTodos, updateTodos} = require('../actions/todo-actions');
const TodoApp = require('../components/TodoApp');
const TodoAppItem = require('../components/TodoAppItem');

const fixture = {
  title: 'Demo Todo',
  description: 'Standalone demo — Todo app with optimistic UI',
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

function TodoListSkeleton() {
  return (
    <div style={card}>
      <SkeletonRow />
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 38}} />
      <SkeletonRow />
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 38}} />
      <SkeletonRow />
    </div>
  );
}

async function DelayedTodoItem({todo, delay}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return <TodoAppItem todo={todo} />;
}

async function TodoListSection() {
  // Simulate fetching the todo list from a database
  await new Promise(resolve => setTimeout(resolve, 500));
  const todos = getTodos();
  return (
    <TodoApp
      initialTodos={todos}
      updateTodos={updateTodos}>
      {todos.map(function(todo, index) {
        return (
          <div key={todo.id}>
            <Suspense fallback={<SkeletonRow />}>
              <DelayedTodoItem todo={todo} delay={(index + 1) * 50} />
            </Suspense>
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
        placeholder="Search todos123..."
        style={{width: '100%', height: 44}}
      />

      {/* Dynamic section — fetches the list then renders with optimistic UI */}
      <Suspense fallback={<TodoListSkeleton />}>
        <TodoListSection />
      </Suspense>
    </div>
  );
}

module.exports = App;
module.exports.default = App;
module.exports.fixture = fixture;
