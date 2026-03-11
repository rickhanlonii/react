'use client';

const React = require('react');
const {Suspense} = React;
const TodoContext = require('./TodoContext');
const TodoAppItem = require('./TodoAppItem');

const colors = {
  secondary: '#8e8e93',
  divider: '#e5e5ea',
  skeleton: '#e5e5ea',
};

function SkeletonRow() {
  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14}}>
      <div style={{width: 26, height: 26, borderRadius: 13, backgroundColor: colors.skeleton}} />
      <div style={{flex: 1, height: 14, backgroundColor: colors.skeleton, borderRadius: 7}} />
    </div>
  );
}

function TodoAppList({todos, addError, todoPromises}) {
  var ctx = React.useContext(TodoContext);
  var dispatch = ctx.dispatch;
  var addOptimistic = ctx.addOptimistic;

  if (todos.length === 0) {
    return (
      <div>
        <div style={{paddingTop: 20, paddingBottom: 20}}>
          <p style={{color: colors.secondary, fontSize: 15, textAlign: 'center', marginTop: 0, marginBottom: 0}}>
            No todos yet. Add one below!
          </p>
        </div>
        <div style={{height: 1, backgroundColor: colors.divider}} />
        <form
          action={dispatch}
          onSubmit={function(e) {
            var input = e.target.elements.text;
            var text = input && input.value && input.value.trim();
            if (text) {
              addOptimistic({type: 'add', text: text});
            }
          }}>
          <input
            id="todo-add-input"
            name="text"
            placeholder="Add new todo"
            style={{width: '100%', height: 44, fontSize: 16}}
          />
          {addError ? (
            <p style={{color: '#ff3b30', fontSize: 13, marginTop: 4, marginBottom: 0}}>
              {addError}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  var remaining = todos.filter(function(t) { return !t.completed; }).length;

  return (
    <div>
      {todos.map(function(todo, index) {
        var todoPromise = todoPromises && todoPromises[todo.id];
        return (
          <div key={todo.id}>
            <Suspense fallback={<SkeletonRow />}>
              <TodoAppItem todo={todo} todoPromise={todoPromise} />
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
      {/* Inline add input */}
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 40}} />
      <form
        action={dispatch}
        onSubmit={function(e) {
          var input = e.target.elements.text;
          var text = input && input.value && input.value.trim();
          if (text) {
            addOptimistic({type: 'add', text: text});
          }
        }}>
        <input
          id="todo-add-input"
          name="text"
          placeholder="Add new todo"
          style={{width: '100%', height: 44, fontSize: 16}}
        />
        {addError ? (
          <p style={{color: '#ff3b30', fontSize: 13, marginTop: 0, marginBottom: 0}}>
            {addError}
          </p>
        ) : null}
      </form>
      {/* Footer with remaining count */}
      <div
        style={{
          marginTop: 6,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}>
        <p
          style={{
            color: colors.secondary,
            fontSize: 13,
            marginTop: 0,
            marginBottom: 0,
          }}>
          {remaining} {remaining === 1 ? 'task' : 'tasks'} remaining
        </p>
      </div>
    </div>
  );
}

module.exports = TodoAppList;
module.exports.default = TodoAppList;
