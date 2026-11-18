/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Review (slice 5): components compiled by the real React Compiler that read
// stores. The compiler's dist must exist at
// compiler/packages/babel-plugin-react-compiler/dist/index.js (it's built by
// `yarn workspace babel-plugin-react-compiler build` in compiler/).

const babel = require('@babel/core');
const path = require('path');

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let createStore;
let startTransition;
let registered;

const compilerPath = path.resolve(
  __dirname,
  '../../../../compiler/packages/babel-plugin-react-compiler/dist/index.js',
);

function compileModule(source) {
  const ReactCompiler = require(compilerPath);
  const compiled = babel.transform(source, {
    babelrc: false,
    configFile: false,
    filename: 'module.js',
    plugins: [
      '@babel/plugin-syntax-jsx',
      [
        ReactCompiler.default,
        {target: '19', panicThreshold: 'all_errors', compilationMode: 'all'},
      ],
    ],
  }).code;
  const code = babel.transform(compiled, {
    babelrc: false,
    configFile: false,
    presets: ['@babel/preset-react'],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const exports = {};
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', 'React', 'Scheduler', 'register', code)(
    id => (id === 'react' ? React : require(id)),
    exports,
    React,
    Scheduler,
    value => (registered = value),
  );
  return {exports, compiled};
}

describe('ReactUseStoreReviewCompiled', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog} = require('internal-test-utils'));
    createStore = React.unstable_createStore;
    startTransition = React.startTransition;
  });

  // @gate enableStore
  it('compiled rows re-render only the views whose memoized output changed, through a rebase', async () => {
    const {exports, compiled} = compileModule(`
      import {use} from 'react';
      function RowView({id, selected}) {
        Scheduler.log('RowView ' + id + (selected ? ' selected' : ''));
        return id + (selected ? '*' : '') + ' ';
      }
      export function Row({id, selectedStore}) {
        const selected = use(selectedStore) === id;
        return <RowView id={id} selected={selected} />;
      }
    `);
    // The compiler memoized the element.
    expect(compiled).toContain('_c(');
    const {Row} = exports;
    const selectedStore = createStore(1);
    function List() {
      return [1, 2, 3, 4].map(id => (
        <Row key={id} id={id} selectedStore={selectedStore} />
      ));
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<List />));
    assertLog(['RowView 1 selected', 'RowView 2', 'RowView 3', 'RowView 4']);

    await act(() => selectedStore.update(3));
    assertLog(['RowView 1', 'RowView 3 selected']);
    expect(root).toMatchRenderedOutput('1 2 3* 4 ');

    await act(() => {
      startTransition(() => selectedStore.update(() => 4));
      ReactNoop.flushSync(() => selectedStore.update(id => id - 1));
      assertLog(['RowView 2 selected', 'RowView 3']);
      expect(root).toMatchRenderedOutput('1 2* 3 4 ');
    });
    assertLog(['RowView 2', 'RowView 3 selected']);
    expect(root).toMatchRenderedOutput('1 2 3* 4 ');
  });

  // @gate enableStore
  it('a compiled component with conditional reads and reads in a loop updates when any store changes', async () => {
    const {exports} = compileModule(`
      import {use} from 'react';
      export function Total({showStore, stores}) {
        if (!use(showStore)) {
          return 'hidden';
        }
        let sum = 0;
        for (let i = 0; i < stores.length; i++) {
          sum += use(stores[i]);
        }
        return 'Total: ' + sum;
      }
    `);
    const {Total} = exports;
    const showStore = createStore(false);
    const stores = [createStore(1), createStore(2), createStore(3)];
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(<Total showStore={showStore} stores={stores} />),
    );
    expect(root).toMatchRenderedOutput('hidden');

    // Not read yet, so these don't render anything.
    await act(() => stores[0].update(10));
    expect(root).toMatchRenderedOutput('hidden');

    await act(() => showStore.update(true));
    expect(root).toMatchRenderedOutput('Total: 15');

    await act(() => stores[2].update(30));
    expect(root).toMatchRenderedOutput('Total: 42');

    await act(() => showStore.update(false));
    expect(root).toMatchRenderedOutput('hidden');
    // The loop's stores are no longer read, so they're released.
    expect(stores.every(store => store._records.length === 0)).toBe(true);
  });

  // @gate enableStore
  it('a compiled parent that memoizes its children lets a reader below update', async () => {
    const {exports} = compileModule(`
      import {use, useState} from 'react';
      function Reader({store}) {
        const value = use(store);
        Scheduler.log('Reader: ' + value);
        return 'Reader: ' + value;
      }
      export function Parent({store}) {
        const [label, setLabel] = useState('x');
        register(setLabel);
        Scheduler.log('Parent ' + label);
        return <Reader store={store} />;
      }
    `);
    const {Parent} = exports;
    const store = createStore(0);
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent store={store} />));
    assertLog(['Parent x', 'Reader: 0']);
    const setLabel = registered;

    await act(() => setLabel('y'));
    assertLog(['Parent y']);

    await act(() => {
      setLabel('z');
      store.update(1);
    });
    assertLog(['Parent z', 'Reader: 1']);
    expect(root).toMatchRenderedOutput('Reader: 1');
  });
});
