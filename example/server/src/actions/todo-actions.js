'use server';

// In-memory todo storage (shared across requests for the demo).
// Stored on globalThis so it survives require.cache invalidation
// (clearServerSourceCache() wipes module-scoped vars on every request).
if (!globalThis.__todoStore) {
  globalThis.__todoStore = {
    nextId: 6,
    todos: [
      {id: 1, text: 'Learn Server Components', completed: true},
      {id: 2, text: 'Build with Server Actions', completed: true},
      {id: 3, text: 'Add Suspense loading', completed: true},
      {id: 4, text: 'Try Partial Prerendering', completed: false},
      {id: 5, text: 'Ship it!', completed: false},
    ],
  };
}
var todos = globalThis.__todoStore.todos;

async function addTodo(previousState, formData) {
  // useActionState calls with (previousState, formData).
  // In hydrated mode, formData is a plain object {text: "..."} from native form collection.
  // In MPA mode, formData is a web FormData object from decodeAction.
  var text = formData && (typeof formData.get === 'function' ? formData.get('text') : formData.text);
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

function getTodos(query) {
  if (query && typeof query === 'string' && query.trim() !== '') {
    var q = query.trim().toLowerCase();
    return todos.filter(function(t) {
      return t.text.toLowerCase().indexOf(q) !== -1;
    });
  }
  return todos.slice();
}

async function updateTodos(previousState, formData) {
  var get = formData && typeof formData.get === 'function'
    ? function(k) { return formData.get(k); }
    : function(k) { return formData && formData[k]; };

  var action = get('_action');
  var id = get('_id');
  var text = get('text');
  var query = get('query');

  // Preserve the active search query on the store so MPA re-renders
  // (which re-run TodoListSection from scratch) keep the filter active.
  if (previousState && previousState.query) {
    globalThis.__todoStore.query = previousState.query;
  }

  // Toggle mode
  if (action === 'toggle' && id != null) {
    var toggleId = Number(id);
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === toggleId) {
        todos[i] = Object.assign({}, todos[i], {completed: !todos[i].completed});
        break;
      }
    }
    return {todos: getTodos(previousState.query), query: previousState.query, addError: null};
  }

  // Delete mode
  if (action === 'delete' && id != null) {
    var deleteId = Number(id);
    for (var j = 0; j < todos.length; j++) {
      if (todos[j].id === deleteId) {
        todos.splice(j, 1);
        break;
      }
    }
    return {todos: getTodos(previousState.query), query: previousState.query, addError: null};
  }

  // Add mode — text field present
  if (text != null) {
    if (typeof text !== 'string' || text.trim() === '') {
      return {todos: previousState.todos, query: previousState.query, addError: 'Text is required'};
    }
    todos.push({id: globalThis.__todoStore.nextId++, text: text.trim(), completed: false});
    return {todos: getTodos(previousState.query), query: previousState.query, addError: null};
  }

  // Search mode
  if (action === 'search') {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      globalThis.__todoStore.query = '';
      return {todos: getTodos(), query: '', addError: null};
    }
    globalThis.__todoStore.query = query.trim();
    return {todos: getTodos(query), query: query.trim(), addError: null};
  }

  // Default — return current state unchanged
  return {todos: getTodos(previousState.query), query: previousState.query || '', addError: null};
}

exports.addTodo = addTodo;
exports.toggleTodo = toggleTodo;
exports.deleteTodo = deleteTodo;
exports.getTodos = getTodos;
exports.updateTodos = updateTodos;
