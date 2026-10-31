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

// The context cases of ReactHooksInspectionIntegration-test.js, with context
// replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

let React;
let ReactTestRenderer;
let ReactDebugTools;
let act;
let createStore;

function normalizeSourceLoc(tree) {
  tree.forEach(node => {
    if (node.hookSource) {
      node.hookSource.fileName = '**';
      node.hookSource.lineNumber = 0;
      node.hookSource.columnNumber = 0;
    }
    normalizeSourceLoc(node.subHooks);
  });
  return tree;
}

describe('ReactHooksInspectionIntegration', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');
    ({act} = require('internal-test-utils'));
    ReactDebugTools = require('react-debug-tools');
    createStore = React.unstable_createStore;
  });

  // @gate enableStore
  it('should inspect the value of the current provider in useContext', async () => {
    // The Provider's value is the store's initial value.
    const myStore = createStore('contextual');
    const themeStore = createStore('default');
    function Foo(props) {
      const value = React.use(myStore);
      React.use(themeStore);
      return <div>{value}</div>;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo prop="prop" />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default, or its
    // displayName, "Theme"). Stores don't have a displayName.
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "contextual",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "default",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should inspect the value of the current provider in useContext reading the same context multiple times', async () => {
    // The Provider's value is the store's initial value.
    const storeA = createStore('contextual A');
    const storeB = createStore('default B');
    function Foo(props) {
      React.use(storeA);
      React.use(storeA);
      React.use(storeB);
      React.use(storeB);
      React.use(storeA);
      React.use(storeB);
      React.use(storeB);
      React.use(storeB);
      return null;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo prop="prop" />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);

    expect(normalizeSourceLoc(tree)).toEqual([
      expect.objectContaining({value: 'contextual A'}),
      expect.objectContaining({value: 'contextual A'}),
      expect.objectContaining({value: 'default B'}),
      expect.objectContaining({value: 'default B'}),
      expect.objectContaining({value: 'contextual A'}),
      expect.objectContaining({value: 'default B'}),
      expect.objectContaining({value: 'default B'}),
      expect.objectContaining({value: 'default B'}),
    ]);
  });

  // @gate enableStore
  it('should return the deferred value', async () => {
    let unsuspend;
    function Lazy() {
      return 'Lazy';
    }
    const Suspender = React.lazy(
      () =>
        new Promise(resolve => {
          unsuspend = () => resolve({default: Lazy});
        }),
    );
    // The Provider's value is the store's initial value.
    const store = createStore('provided');
    let setShow;
    function Foo(props) {
      const [show, _setShow] = React.useState(false);
      const deferredShow = React.useDeferredValue(show);
      const isPending = show !== deferredShow;
      const contextDisplay = isPending ? React.use(store) : '<none>';
      React.useMemo(() => 'hello', []);
      React.useMemo(() => 'not used', []);

      // Otherwise we capture the version from the react-debug-tools dispatcher.
      if (setShow === undefined) {
        setShow = _setShow;
      }

      return (
        <React.Suspense fallback="Loading">
          Context: {contextDisplay}, {isPending ? 'Pending' : 'Nothing Pending'}
          {deferredShow ? [', ', <Suspender key="suspender" />] : null}
        </React.Suspense>
      );
    }
    const renderer = await act(() => {
      return ReactTestRenderer.create(<Foo />, {unstable_isConcurrent: true});
    });
    let childFiber = renderer.root.findByType(Foo)._currentFiber();
    let tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    expect(renderer).toMatchRenderedOutput('Context: <none>, Nothing Pending');
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 0,
          "isStateEditable": true,
          "name": "State",
          "subHooks": [],
          "value": false,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 1,
          "isStateEditable": false,
          "name": "DeferredValue",
          "subHooks": [],
          "value": false,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "hello",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 3,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);

    await act(() => {
      setShow(true);
    });

    expect(renderer).toMatchRenderedOutput('Context: provided, Pending');
    childFiber = renderer.root.findByType(Foo)._currentFiber();
    tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 0,
          "isStateEditable": true,
          "name": "State",
          "subHooks": [],
          "value": true,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 1,
          "isStateEditable": false,
          "name": "DeferredValue",
          "subHooks": [],
          "value": false,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "provided",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "hello",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 3,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);

    await act(() => {
      unsuspend();
    });

    expect(renderer).toMatchRenderedOutput(
      'Context: <none>, Nothing Pending, Lazy',
    );
    childFiber = renderer.root.findByType(Foo)._currentFiber();
    tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 0,
          "isStateEditable": true,
          "name": "State",
          "subHooks": [],
          "value": true,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 1,
          "isStateEditable": false,
          "name": "DeferredValue",
          "subHooks": [],
          "value": true,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "hello",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 3,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should properly advance the current hook for useContext', async () => {
    const store = createStore(1);

    let incrementCount;

    function Foo(props) {
      const context = React.use(store);
      const [data, setData] = React.useState({count: context});

      incrementCount = () => setData(({count}) => ({count: count + 1}));

      return <div>count: {data.count}</div>;
    }

    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    expect(renderer.toJSON()).toEqual({
      type: 'div',
      props: {},
      children: ['count: ', '1'],
    });

    await act(() => incrementCount());
    expect(renderer.toJSON()).toEqual({
      type: 'div',
      props: {},
      children: ['count: ', '2'],
    });

    const childFiber = renderer.root._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": 1,
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 0,
          "isStateEditable": true,
          "name": "State",
          "subHooks": [],
          "value": {
            "count": 2,
          },
        },
      ]
    `);
  });

  // @gate enableStore
  it('should support use(Context) hook', async () => {
    const store = createStore('default');
    function Foo() {
      const value = React.use(store);
      React.useMemo(() => 'memo', []);
      React.useMemo(() => 'not used', []);

      return value;
    }

    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "default",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 0,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "memo",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 1,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });
});
