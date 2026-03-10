const React = require('react');
const {Suspense} = React;
const {getTodos, addTodo, toggleTodo, deleteTodo} = require('../actions/todo-actions');
const TodoAppList = require('../components/TodoAppList');
const AddTodoForm = require('../components/AddTodoForm');

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
  divider: '#c6c6c8',
};

const card = {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
};

function SkeletonRow() {
  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 12}}>
      <div style={{width: 24, height: 24, borderRadius: 12, backgroundColor: colors.skeleton}} />
      <div style={{flex: 1, height: 14, backgroundColor: colors.skeleton, borderRadius: 7}} />
    </div>
  );
}

function TodoListSkeleton() {
  return (
    <div style={card}>
      <SkeletonRow />
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 36}} />
      <SkeletonRow />
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 36}} />
      <SkeletonRow />
    </div>
  );
}

async function TodoListSection() {
  await new Promise(resolve => setTimeout(resolve, 800));
  const todos = getTodos();
  return (
    <div style={card}>
      <TodoAppList
        todos={todos}
        toggleTodo={toggleTodo}
        deleteTodo={deleteTodo}
      />
    </div>
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
        padding: 16,
        gap: 12,
      }}>
      {/* Static shell — renders immediately, cached by PPR */}
      <div style={{paddingTop: 56, paddingBottom: 4}}>
        <h1 style={{color: colors.text, marginTop: 0, marginBottom: 4}}>Todos</h1>
        <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
          A simple todo app powered by React Server Components
        </p>
      </div>

      <div style={card}>
        <AddTodoForm addTodo={addTodo} />
      </div>

      {/* Dynamic section — streams in via Suspense, resumed by PPR */}
      <Suspense fallback={<TodoListSkeleton />}>
        <TodoListSection />
      </Suspense>
    </div>
  );
}

module.exports = App;
module.exports.default = App;
module.exports.fixture = fixture;
