/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {RuleTester} from 'eslint';
import {allRules} from '../src/shared/ReactCompiler';

const ESLintTesterV8 = require('eslint-v8').RuleTester;

// The React Compiler rules applied to state read with use(store).

function normalizeIndent(strings: TemplateStringsArray): string {
  const codeLines = strings[0]?.split('\n') ?? [];
  const leftPadding = codeLines[1]?.match(/\s+/)![0] ?? '';
  return codeLines.map(line => line.slice(leftPadding.length)).join('\n');
}

type CompilerTestCases = {
  valid: RuleTester.ValidTestCase[];
  invalid: RuleTester.InvalidTestCase[];
};

const tests: CompilerTestCases = {
  valid: [
    {
      name: 'Reading a store',
      filename: 'test.tsx',
      code: normalizeIndent`
        import {use, unstable_createStore as createStore} from 'react';
        const countStore = createStore<number>(0);
        function Counter() {
          const count = use(countStore);
          return <button onClick={() => countStore.update(c => c + 1)}>{count}</button>;
        }
      `,
    },
    {
      name: 'Reading a store conditionally',
      filename: 'test.tsx',
      code: normalizeIndent`
        import {use} from 'react';
        function Profile({store, showName}: {store: any, showName: boolean}) {
          if (showName) {
            return <div>{use(store).name}</div>;
          }
          return null;
        }
      `,
    },
    {
      name: 'Updating a store with a new value',
      filename: 'test.tsx',
      code: normalizeIndent`
        import {use} from 'react';
        function Todos({store}: {store: any}) {
          const todos = use(store);
          const add = (text: string) => store.update((prev: any) => [...prev, text]);
          return <List todos={todos} onAdd={add} />;
        }
      `,
    },
  ],
  invalid: [
    {
      name: 'Mutating a value read from a store',
      filename: 'test.tsx',
      code: `
        import { use } from 'react';
        function Component({store}) {
          // typescript syntax that hermes-parser doesn't understand yet
          const x: \`foo\${1}\` = 'foo1';
          const state = use(store);
          state.a = 1;
          return <div>{state.a}</div>;
        }
      `,
      errors: [
        {
          message: /This value cannot be modified/,
          line: 7,
        },
      ],
    },
  ],
};

const eslintTester = new ESLintTesterV8({
  parser: require.resolve('@typescript-eslint/parser-v5'),
});
eslintTester.run('react-compiler', allRules['immutability'].rule, tests);
