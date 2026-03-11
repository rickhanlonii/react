'use client';

const React = require('react');
const {useState} = React;

const colors = {
  text: '#1c1c1e',
  secondary: '#8e8e93',
  accent: '#007aff',
  danger: '#ff3b30',
  divider: '#c6c6c8',
  inputBg: '#f2f2f7',
  checkBg: '#34c759',
};

function TodoItem({todo, onToggle, onDelete}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 10,
        gap: 12,
      }}>
      {/* Checkbox */}
      <div
        onClick={() => onToggle(todo.id)}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: todo.done ? colors.checkBg : colors.divider,
          backgroundColor: todo.done ? colors.checkBg : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {todo.done ? (
          <p
            style={{
              color: '#ffffff',
              fontSize: 14,
              fontWeight: '700',
              marginTop: 0,
              marginBottom: 0,
              textAlign: 'center',
            }}>
            ✓
          </p>
        ) : null}
      </div>

      {/* Text */}
      <div style={{flex: 1}}>
        <p
          style={{
            color: todo.done ? colors.secondary : colors.text,
            fontSize: 15,
            marginTop: 0,
            marginBottom: 0,
          }}>
          {todo.text}
        </p>
      </div>

      {/* Delete button */}
      <div onClick={() => onDelete(todo.id)}>
        <p
          style={{
            color: colors.danger,
            fontSize: 13,
            marginTop: 0,
            marginBottom: 0,
          }}>
          Delete
        </p>
      </div>
    </div>
  );
}

function TodoList({initialTodos}) {
  const [todos, setTodos] = useState(initialTodos || []);
  const [inputValue, setInputValue] = useState('');

  function handleAdd() {
    const text = inputValue.trim();
    if (!text) return;
    setTodos((prev) => [
      ...prev,
      {id: Date.now(), text, done: false},
    ]);
    setInputValue('');
  }

  function handleToggle(id) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? {...t, done: !t.done} : t)),
    );
  }

  function handleDelete(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <div>
      {/* Input row */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
        }}>
        <div style={{flex: 1}}>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Add a task..."
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 8,
              padding: 10,
              fontSize: 15,
              color: colors.text,
              width: '100%',
            }}
          />
        </div>
        <div
          onClick={handleAdd}
          style={{
            backgroundColor: colors.accent,
            borderRadius: 8,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 16,
            paddingRight: 16,
          }}>
          <p
            style={{
              color: '#ffffff',
              fontSize: 15,
              fontWeight: '600',
              marginTop: 0,
              marginBottom: 0,
            }}>
            Add
          </p>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          backgroundColor: colors.divider,
          marginTop: 12,
          marginBottom: 4,
        }}
      />

      {/* Todo items */}
      {todos.length === 0 ? (
        <p
          style={{
            color: colors.secondary,
            fontSize: 14,
            textAlign: 'center',
            marginTop: 16,
            marginBottom: 16,
          }}>
          No tasks yet. Add one above!
        </p>
      ) : (
        <div>
          {todos.map((todo, index) => (
            <div key={todo.id}>
              <TodoItem
                todo={todo}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
              {index < todos.length - 1 ? (
                <div
                  style={{
                    height: 1,
                    backgroundColor: colors.divider,
                    marginLeft: 36,
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {todos.length > 0 ? (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.divider,
          }}>
          <p
            style={{
              color: colors.secondary,
              fontSize: 12,
              marginTop: 0,
              marginBottom: 0,
            }}>
            {remaining} {remaining === 1 ? 'task' : 'tasks'} remaining
          </p>
        </div>
      ) : null}
    </div>
  );
}

module.exports = TodoList;
module.exports.default = TodoList;
