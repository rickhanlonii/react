/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment node
 */

'use strict';

// exhaustive-deps applied to state read with use(store). A value read from a
// store is a reactive value like any other, so effects and callbacks that use
// it must list it. A store created outside the component is not reactive, so
// effects that call store.update on it don't need to list it. A store passed as
// a prop is reactive.

const ESLintTesterV7 = require('eslint-v7').RuleTester;
const ESLintTesterV9 = require('eslint-v9').RuleTester;
const ReactHooksESLintPlugin = require('eslint-plugin-react-hooks');
const ReactHooksESLintRule =
  ReactHooksESLintPlugin.default.rules['exhaustive-deps'];

function normalizeIndent(strings) {
  const codeLines = strings[0].split('\n');
  const leftPadding = codeLines[1].match(/\s+/)[0];
  return codeLines.map(line => line.slice(leftPadding.length)).join('\n');
}

const tests = {
  valid: [
    {
      code: normalizeIndent`
        // A module-level store is not a reactive value.
        const countStore = createStore(0);
        function Counter() {
          const count = use(countStore);
          useEffect(() => {
            const id = setInterval(() => {
              countStore.update(c => c + 1);
            }, 1000);
            return () => clearInterval(id);
          }, []);
          return count;
        }
      `,
    },
    {
      code: normalizeIndent`
        // Values read from a store are listed.
        const countStore = createStore(0);
        function Counter() {
          const count = use(countStore);
          useEffect(() => {
            document.title = String(count);
          }, [count]);
          return count;
        }
      `,
    },
    {
      code: normalizeIndent`
        // A store passed as a prop is listed.
        function Counter({store}) {
          const count = use(store);
          const increment = useCallback(() => {
            store.update(c => c + 1);
          }, [store]);
          return <button onClick={increment}>{count}</button>;
        }
      `,
    },
    {
      code: normalizeIndent`
        // A conditionally read store value is listed.
        function Profile({store, showName}) {
          const name = showName ? use(store).name : null;
          const label = useMemo(() => 'Name: ' + name, [name]);
          return label;
        }
      `,
    },
    {
      code: normalizeIndent`
        // A store created outside the component and read in a loop.
        const stores = [createStore(1), createStore(2)];
        function Sum() {
          let sum = 0;
          for (const store of stores) {
            sum += use(store);
          }
          useEffect(() => {
            stores[0].update(sum);
          }, [sum]);
          return sum;
        }
      `,
    },
  ],
  invalid: [
    {
      code: normalizeIndent`
        const countStore = createStore(0);
        function Counter() {
          const count = use(countStore);
          useEffect(() => {
            document.title = String(count);
          }, []);
          return count;
        }
      `,
      errors: [
        {
          message:
            "React Hook useEffect has a missing dependency: 'count'. " +
            'Either include it or remove the dependency array.',
          suggestions: [
            {
              desc: 'Update the dependencies array to be: [count]',
              output: normalizeIndent`
                const countStore = createStore(0);
                function Counter() {
                  const count = use(countStore);
                  useEffect(() => {
                    document.title = String(count);
                  }, [count]);
                  return count;
                }
              `,
            },
          ],
        },
      ],
    },
    {
      code: normalizeIndent`
        function Counter({store}) {
          const count = use(store);
          const increment = useCallback(() => {
            store.update(c => c + 1);
          }, []);
          return <button onClick={increment}>{count}</button>;
        }
      `,
      errors: [
        {
          message:
            "React Hook useCallback has a missing dependency: 'store'. " +
            'Either include it or remove the dependency array.',
          suggestions: [
            {
              desc: 'Update the dependencies array to be: [store]',
              output: normalizeIndent`
                function Counter({store}) {
                  const count = use(store);
                  const increment = useCallback(() => {
                    store.update(c => c + 1);
                  }, [store]);
                  return <button onClick={increment}>{count}</button>;
                }
              `,
            },
          ],
        },
      ],
    },
    {
      code: normalizeIndent`
        const todosStore = createStore([]);
        function TodoCount() {
          const todos = use(todosStore);
          const count = useMemo(() => todos.length, []);
          return count;
        }
      `,
      errors: [
        {
          message:
            "React Hook useMemo has a missing dependency: 'todos.length'. " +
            'Either include it or remove the dependency array.',
          suggestions: [
            {
              desc: 'Update the dependencies array to be: [todos.length]',
              output: normalizeIndent`
                const todosStore = createStore([]);
                function TodoCount() {
                  const todos = use(todosStore);
                  const count = useMemo(() => todos.length, [todos.length]);
                  return count;
                }
              `,
            },
          ],
        },
      ],
    },
  ],
};

describe('rules-of-hooks/exhaustive-deps', () => {
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
