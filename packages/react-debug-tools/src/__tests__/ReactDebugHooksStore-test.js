/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

let React;
let ReactTestRenderer;
let ReactDebugTools;
let Scheduler;
let act;
let assertLog;
let startTransition;
let createStore;

describe('ReactDebugHooks stores', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog} = require('internal-test-utils'));
    startTransition = React.startTransition;
    ReactDebugTools = require('react-debug-tools');
    createStore = React.unstable_createStore;
  });

  // @gate enableStore
  it('identifies the store each Store node read, without putting it on the node', async () => {
    const storeA = createStore('a');
    const storeB = createStore('b');
    const Context = React.createContext('c');
    function Foo() {
      const [state] = React.useState(0);
      return [
        state,
        React.use(storeA),
        React.use(Context),
        React.use(storeB),
        React.use(storeA),
      ].join('');
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    const tree = ReactDebugTools.inspectHooksOfFiber(
      renderer.root.findByType(Foo)._currentFiber(),
    );
    expect(tree.map(node => [node.name, node.value])).toEqual([
      ['State', 0],
      ['Store', 'a'],
      ['Context', 'c'],
      ['Store', 'b'],
      ['Store', 'a'],
    ]);

    const keys = tree.map(ReactDebugTools.getStoreKeyOfHooksNode);
    expect(keys[0]).toBe(null);
    expect(keys[1]).not.toBe(null);
    expect(keys[2]).toBe(null);
    expect(keys[3]).not.toBe(null);
    expect(keys[3]).not.toBe(keys[1]);
    expect(keys[4]).toBe(keys[1]);

    // A second inspection gives new nodes with the same keys.
    const nextTree = ReactDebugTools.inspectHooksOfFiber(
      renderer.root.findByType(Foo)._currentFiber(),
    );
    expect(nextTree[1]).not.toBe(tree[1]);
    expect(ReactDebugTools.getStoreKeyOfHooksNode(nextTree[1])).toBe(keys[1]);

    // The store isn't reachable from the node, which DevTools serializes.
    tree.forEach(node => {
      Object.keys(node).forEach(key => {
        expect(node[key]).not.toBe(storeA);
        expect(node[key]).not.toBe(storeB);
      });
    });
  });

  // @gate enableStore
  it('inspecting a component does not run the reducer of a store it did not read', async () => {
    const store = createStore(0, (state, action) => {
      Scheduler.log('reducer');
      return action;
    });
    let readStore = false;

    function Reader() {
      return React.use(store);
    }

    function Foo() {
      return readStore ? React.use(store) : 'none';
    }

    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(
        <>
          <Reader />
          <Foo />
        </>,
        {unstable_isConcurrent: true},
      );
    });

    await act(() => {
      startTransition(() => {
        store.update(1);
      });
      // The eager state of the update.
      assertLog(['reducer']);

      // Inspect while the transition is pending. Foo didn't read the store
      // when it rendered, so it reads it during inspection.
      readStore = true;
      const tree = ReactDebugTools.inspectHooksOfFiber(
        renderer.root.findByType(Foo)._currentFiber(),
      );
      assertLog([]);
      expect(tree.map(node => [node.name, node.value])).toEqual([['Store', 0]]);
    });
  });
});
