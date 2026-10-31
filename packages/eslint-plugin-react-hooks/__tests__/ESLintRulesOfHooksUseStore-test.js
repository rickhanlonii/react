/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment node
 */

'use strict';

// The rules of Hooks, applied to stores created with createStore and read with
// use(store). Reading a store with use() follows the rules of use(): it can be
// called conditionally and in loops, but only while rendering a component or
// Hook.

const ESLintTesterV7 = require('eslint-v7').RuleTester;
const ESLintTesterV9 = require('eslint-v9').RuleTester;
const ReactHooksESLintPlugin = require('eslint-plugin-react-hooks');
const ReactHooksESLintRule =
  ReactHooksESLintPlugin.default.rules['rules-of-hooks'];

function normalizeIndent(strings) {
  const codeLines = strings[0].split('\n');
  const leftPadding = codeLines[1].match(/\s+/)[0];
  return codeLines.map(line => line.slice(leftPadding.length)).join('\n');
}

const tests = {
  valid: [
    {
      code: normalizeIndent`
        // Valid because components can read stores.
        const countStore = createStore(0);
        function Counter() {
          const count = use(countStore);
          return <button onClick={() => countStore.update(c => c + 1)}>{count}</button>;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because Hooks can read stores.
        function useCount(store) {
          return use(store);
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because stores can be read conditionally.
        function Profile({store, showName}) {
          if (showName) {
            return <Name name={use(store).name} />;
          }
          return null;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because stores can be read in an early return branch.
        function Profile({store, isLoggedIn}) {
          if (!isLoggedIn) {
            return null;
          }
          const user = use(store);
          return <Name name={user.name} />;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because stores can be read in loops.
        function Sum({stores}) {
          let sum = 0;
          for (const store of stores) {
            sum += use(store);
          }
          return sum;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because stores can be read in a ternary.
        function Label({primary, secondary, usePrimary}) {
          return <Text text={usePrimary ? use(primary) : use(secondary)} />;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because stores of stores can be unwrapped twice.
        function Todo({todosStore, index}) {
          const todo = use(use(todosStore)[index]);
          return <Text text={todo.text} />;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because store.update is not a Hook and can be called anywhere.
        const countStore = createStore(0);
        function increment() {
          countStore.update(c => c + 1);
        }
        class Button extends React.Component {
          onClick() {
            countStore.update(c => c + 1);
          }
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because createStore is not a Hook and can be called at the top
        // level or in event handlers.
        const store = createStore({todos: []});
        function onAdd(text) {
          const todo = createStore({text});
          store.update(s => ({todos: [...s.todos, todo]}));
        }
      `,
    },
    {
      code: normalizeIndent`
        // Valid because React.use can be used with a namespace.
        function Counter({store}) {
          const count = React.use(store);
          return count;
        }
      `,
    },
  ],
  invalid: [
    {
      code: normalizeIndent`
        // Invalid because stores can only be read while rendering.
        function notAComponent(store) {
          return use(store);
        }
      `,
      errors: [functionError('use', 'notAComponent')],
    },
    {
      code: normalizeIndent`
        // Invalid because stores can't be read at the top level.
        const countStore = createStore(0);
        const count = use(countStore);
      `,
      errors: [topLevelError('use')],
    },
    {
      code: normalizeIndent`
        // Invalid because stores can't be read in a class.
        class Counter extends React.Component {
          render() {
            return use(this.props.store);
          }
        }
      `,
      errors: [classError('use')],
    },
    {
      code: normalizeIndent`
        // Invalid because stores can't be read in an async component.
        async function Counter({store}) {
          return use(store);
        }
      `,
      errors: [asyncComponentHookError('use')],
    },
    {
      code: normalizeIndent`
        // Invalid because use can't be called inside a try/catch block.
        function Counter({store}) {
          try {
            return use(store);
          } catch (error) {
            return null;
          }
        }
      `,
      errors: [tryCatchUseError('use')],
    },
  ],
};

function functionError(hook, fn) {
  return {
    message:
      `React Hook "${hook}" is called in function "${fn}" that is neither ` +
      'a React function component nor a custom React Hook function.' +
      ' React component names must start with an uppercase letter.' +
      ' React Hook names must start with the word "use".',
  };
}

function topLevelError(hook) {
  return {
    message:
      `React Hook "${hook}" cannot be called at the top level. React Hooks ` +
      'must be called in a React function component or a custom React ' +
      'Hook function.',
  };
}

function classError(hook) {
  return {
    message:
      `React Hook "${hook}" cannot be called in a class component. React Hooks ` +
      'must be called in a React function component or a custom React ' +
      'Hook function.',
  };
}

function asyncComponentHookError(fn) {
  return {
    message: `React Hook "${fn}" cannot be called in an async function.`,
  };
}

function tryCatchUseError(fn) {
  return {
    message: `React Hook "${fn}" cannot be called in a try/catch block.`,
  };
}

describe('rules-of-hooks/rules-of-hooks', () => {
  new ESLintTesterV7({
    parser: require.resolve('babel-eslint'),
    parserOptions: {
      ecmaFeatures: {jsx: true},
      ecmaVersion: 6,
      sourceType: 'module',
    },
  }).run('eslint: v7, parser: babel-eslint', ReactHooksESLintRule, tests);

  new ESLintTesterV9({
    languageOptions: {
      ecmaVersion: 6,
      sourceType: 'module',
      parser: require('@babel/eslint-parser'),
      parserOptions: {ecmaFeatures: {jsx: true}},
    },
  }).run(
    'eslint: v9, parser: @babel/eslint-parser',
    ReactHooksESLintRule,
    tests
  );

  new ESLintTesterV9({
    languageOptions: {
      ecmaVersion: 6,
      sourceType: 'module',
      parser: require('@typescript-eslint/parser-v5'),
      parserOptions: {ecmaFeatures: {jsx: true}},
    },
  }).run(
    'eslint: v9, parser: @typescript-eslint/parser@^5.0.0',
    ReactHooksESLintRule,
    tests
  );
});
