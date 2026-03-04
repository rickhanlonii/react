'use server';

// In-memory todo storage (shared across requests for the demo)
var nextId = 3;
var todos = [
  {id: 1, text: 'Learn React Server Components', completed: true},
  {id: 2, text: 'Build with Server Actions', completed: false},
];

async function addTodo(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {error: 'Text is required'};
  }
  var todo = {id: nextId++, text: text.trim(), completed: false};
  todos.push(todo);
  return {success: true, todo: todo};
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
