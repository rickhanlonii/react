'use server';

// In-memory todo storage (shared across requests for the demo).
// Stored on globalThis so it survives require.cache invalidation
// (clearServerSourceCache() wipes module-scoped vars on every request).
if (!globalThis.__todoStore) {
  globalThis.__todoStore = {
    nextId: 3,
    todos: [
      {id: 1, text: 'Learn React Server Components', completed: true},
      {id: 2, text: 'Build with Server Actions', completed: false},
    ],
  };
}
var todos = globalThis.__todoStore.todos;

async function addTodo(previousState, formData) {
  // useActionState calls with (previousState, formData).
  // formData is a plain object with input name/value pairs from the native form.
  var text = formData && formData.text;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {error: 'Text is required'};
  }
  var todo = {id: globalThis.__todoStore.nextId++, text: text.trim(), completed: false};
  todos.push(todo);
  return {error: null};
}

async function toggleTodo(id) {
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].id === id) {
      todos[i] = Object.assign({}, todos[i], {completed: !todos[i].completed});
      return {success: true};
    }
  }
  return {error: 'Todo not found'};
}

async function deleteTodo(id) {
  var index = -1;
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].id === id) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return {error: 'Todo not found'};
  }
  todos.splice(index, 1);
  return {success: true};
}

function getTodos() {
  return todos.slice();
}

exports.addTodo = addTodo;
exports.toggleTodo = toggleTodo;
exports.deleteTodo = deleteTodo;
exports.getTodos = getTodos;
