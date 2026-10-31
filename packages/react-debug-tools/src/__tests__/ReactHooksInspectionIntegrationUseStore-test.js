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
let act;
let useMemoCache;
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
    useMemoCache = require('react/compiler-runtime').c;
    createStore = React.unstable_createStore;
  });

  // @gate enableStore
  it('should inspect the current state of useState hooks', async () => {
    const store1 = createStore('hello');
    const store2 = createStore('world');
    function Foo(props) {
      const state1 = React.use(store1);
      const state2 = React.use(store2);
      return (
        <div onMouseDown={store1.update} onMouseUp={store2.update}>
          {state1} {state2}
        </div>
      );
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo prop="prop" />, {
        unstable_isConcurrent: true,
      });
    });

    let childFiber = renderer.root.findByType(Foo)._currentFiber();
    let tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "world",
        },
      ]
    `);

    const {onMouseDown: setStateA, onMouseUp: setStateB} =
      renderer.root.findByType('div').props;

    await act(() => setStateA('Hi'));

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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "Hi",
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
          "value": "world",
        },
      ]
    `);

    await act(() => setStateB('world!'));

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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "Hi",
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
          "value": "world!",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should inspect the current state of all stateful hooks', async () => {
    const outsideRef = React.createRef();
    function effect() {}
    const stateStore = createStore('a');
    const setState = stateStore.update;
    const reducerStore = createStore('b', (s, a) => a.value);
    const dispatch = reducerStore.update;
    function Foo(props) {
      const state1 = React.use(stateStore);
      const state2 = React.use(reducerStore);
      const ref = React.useRef('c');

      React.useLayoutEffect(effect);
      React.useEffect(effect);

      React.useImperativeHandle(outsideRef, () => {
        // Return a function so that jest treats them as non-equal.
        return function Instance() {};
      }, []);

      React.useMemo(() => state1 + state2, [state1]);

      function update() {
        setState('A');
        dispatch({value: 'B'});
        ref.current = 'C';
      }
      const memoizedUpdate = React.useCallback(update, []);
      return (
        <div onClick={memoizedUpdate}>
          {state1} {state2}
        </div>
      );
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo prop="prop" />, {
        unstable_isConcurrent: true,
      });
    });

    let childFiber = renderer.root.findByType(Foo)._currentFiber();

    const {onClick: updateStates} = renderer.root.findByType('div').props;

    let tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "value": "a",
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
          "value": "b",
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
          "name": "Ref",
          "subHooks": [],
          "value": "c",
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
          "name": "LayoutEffect",
          "subHooks": [],
          "value": [Function],
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
          "name": "Effect",
          "subHooks": [],
          "value": [Function],
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
          "name": "ImperativeHandle",
          "subHooks": [],
          "value": [Function],
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 4,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "ab",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 5,
          "isStateEditable": false,
          "name": "Callback",
          "subHooks": [],
          "value": [Function],
        },
      ]
    `);

    await act(() => {
      updateStates();
    });

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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "A",
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
          "value": "B",
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
          "name": "Ref",
          "subHooks": [],
          "value": "C",
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
          "name": "LayoutEffect",
          "subHooks": [],
          "value": [Function],
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
          "name": "Effect",
          "subHooks": [],
          "value": [Function],
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
          "name": "ImperativeHandle",
          "subHooks": [],
          "value": [Function],
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 4,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "AB",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 5,
          "isStateEditable": false,
          "name": "Callback",
          "subHooks": [],
          "value": [Function],
        },
      ]
    `);
  });

  // @gate enableStore
  it('should inspect the current state of all stateful hooks, including useInsertionEffect', async () => {
    const useInsertionEffect = React.useInsertionEffect;
    const outsideRef = React.createRef();
    function effect() {}
    const stateStore = createStore('a');
    const setState = stateStore.update;
    const reducerStore = createStore('b', (s, a) => a.value);
    const dispatch = reducerStore.update;
    function Foo(props) {
      const state1 = React.use(stateStore);
      const state2 = React.use(reducerStore);
      const ref = React.useRef('c');

      useInsertionEffect(effect);
      React.useLayoutEffect(effect);
      React.useEffect(effect);

      React.useImperativeHandle(outsideRef, () => {
        // Return a function so that jest treats them as non-equal.
        return function Instance() {};
      }, []);

      React.useMemo(() => state1 + state2, [state1]);

      async function update() {
        setState('A');
        dispatch({value: 'B'});
        ref.current = 'C';
      }
      const memoizedUpdate = React.useCallback(update, []);
      return (
        <div onClick={memoizedUpdate}>
          {state1} {state2}
        </div>
      );
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo prop="prop" />, {
        unstable_isConcurrent: true,
      });
    });

    let childFiber = renderer.root.findByType(Foo)._currentFiber();

    const {onClick: updateStates} = renderer.root.findByType('div').props;

    let tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "value": "a",
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
          "value": "b",
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
          "name": "Ref",
          "subHooks": [],
          "value": "c",
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
          "name": "InsertionEffect",
          "subHooks": [],
          "value": [Function],
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
          "name": "LayoutEffect",
          "subHooks": [],
          "value": [Function],
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
          "name": "Effect",
          "subHooks": [],
          "value": [Function],
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 4,
          "isStateEditable": false,
          "name": "ImperativeHandle",
          "subHooks": [],
          "value": [Function],
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 5,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "ab",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 6,
          "isStateEditable": false,
          "name": "Callback",
          "subHooks": [],
          "value": [Function],
        },
      ]
    `);

    await act(() => {
      updateStates();
    });

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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "A",
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
          "value": "B",
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
          "name": "Ref",
          "subHooks": [],
          "value": "C",
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
          "name": "InsertionEffect",
          "subHooks": [],
          "value": [Function],
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
          "name": "LayoutEffect",
          "subHooks": [],
          "value": [Function],
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
          "name": "Effect",
          "subHooks": [],
          "value": [Function],
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 4,
          "isStateEditable": false,
          "name": "ImperativeHandle",
          "subHooks": [],
          "value": [Function],
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 5,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "AB",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": 6,
          "isStateEditable": false,
          "name": "Callback",
          "subHooks": [],
          "value": [Function],
        },
      ]
    `);
  });

  it('should inspect the value of the current provider in useContext', async () => {
    const MyContext = React.createContext('default');
    const ThemeContext = React.createContext('default');
    ThemeContext.displayName = 'Theme';
    function Foo(props) {
      const value = React.useContext(MyContext);
      React.useContext(ThemeContext);
      return <div>{value}</div>;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(
        <MyContext.Provider value="contextual">
          <Foo prop="prop" />
        </MyContext.Provider>,
        {unstable_isConcurrent: true},
      );
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "name": "Context",
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
          "name": "Theme",
          "subHooks": [],
          "value": "default",
        },
      ]
    `);
  });

  // @reactVersion >= 16.8
  it('should inspect the value of the current provider in useContext reading the same context multiple times', async () => {
    const ContextA = React.createContext('default A');
    const ContextB = React.createContext('default B');
    function Foo(props) {
      React.useContext(ContextA);
      React.useContext(ContextA);
      React.useContext(ContextB);
      React.useContext(ContextB);
      React.useContext(ContextA);
      React.useContext(ContextB);
      React.useContext(ContextB);
      React.useContext(ContextB);
      return null;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(
        <ContextA.Provider value="contextual A">
          <Foo prop="prop" />
        </ContextA.Provider>,
        {unstable_isConcurrent: true},
      );
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

  it('should inspect forwardRef', async () => {
    const obj = function () {};
    const Foo = React.forwardRef(function (props, ref) {
      React.useImperativeHandle(ref, () => obj);
      return <div />;
    });
    const ref = React.createRef();
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo ref={ref} />, {
        unstable_isConcurrent: true,
      });
    });

    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": null,
            "lineNumber": 0,
          },
          "id": 0,
          "isStateEditable": false,
          "name": "ImperativeHandle",
          "subHooks": [],
          "value": [Function],
        },
      ]
    `);
  });

  // @gate enableStore
  it('should inspect memo', async () => {
    const store = createStore('hello');
    function InnerFoo(props) {
      const value = React.use(store);
      return <div>{value}</div>;
    }
    const Foo = React.memo(InnerFoo);
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    // TODO: Test renderer findByType is broken for memo. Have to search for the inner.
    const childFiber = renderer.root.findByType(InnerFoo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "InnerFoo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "hello",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should inspect custom hooks', async () => {
    const store = createStore('hello');
    function useCustom() {
      const value = React.use(store);
      return value;
    }
    function Foo(props) {
      const value = useCustom();
      return <div>{value}</div>;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "name": "Custom",
          "subHooks": [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "useCustom",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Store",
              "subHooks": [],
              "value": "hello",
            },
          ],
          "value": undefined,
        },
      ]
    `);
  });

  it('should support composite useTransition hook', async () => {
    function Foo(props) {
      React.useTransition();
      const memoizedValue = React.useMemo(() => 'hello', []);
      React.useMemo(() => 'not used', []);
      return <div>{memoizedValue}</div>;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "isStateEditable": false,
          "name": "Transition",
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should update isPending returned from useTransition', async () => {
    const IndefiniteSuspender = React.lazy(() => new Promise(() => {}));
    let startTransition;
    const showStore = createStore(false);
    const setShow = showStore.update;
    function Foo(props) {
      const show = React.use(showStore);
      const [isPending, _startTransition] = React.useTransition();
      React.useMemo(() => 'hello', []);
      React.useMemo(() => 'not used', []);

      // Otherwise we capture the version from the react-debug-tools dispatcher.
      if (startTransition === undefined) {
        startTransition = () => {
          _startTransition(() => {
            setShow(true);
          });
        };
      }

      return (
        <React.Suspense fallback="Loading">
          {isPending ? 'Pending' : null}
          {show ? <IndefiniteSuspender /> : null}
        </React.Suspense>
      );
    }
    const renderer = await act(() => {
      return ReactTestRenderer.create(<Foo />, {unstable_isConcurrent: true});
    });
    expect(renderer).toMatchRenderedOutput(null);
    let childFiber = renderer.root.findByType(Foo)._currentFiber();
    let tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "id": 0,
          "isStateEditable": false,
          "name": "Transition",
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);

    await act(() => {
      startTransition();
    });

    expect(renderer).toMatchRenderedOutput('Pending');

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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
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
          "id": 0,
          "isStateEditable": false,
          "name": "Transition",
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });

  it('should support useDeferredValue hook', async () => {
    function Foo(props) {
      React.useDeferredValue('abc');
      const memoizedValue = React.useMemo(() => 1, []);
      React.useMemo(() => 2, []);
      return <div>{memoizedValue}</div>;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
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
          "isStateEditable": false,
          "name": "DeferredValue",
          "subHooks": [],
          "value": "abc",
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": 2,
        },
      ]
    `);
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
    const Context = React.createContext('default');
    const showStore = createStore(false);
    let setShow;
    function Foo(props) {
      const show = React.use(showStore);
      const _setShow = showStore.update;
      const deferredShow = React.useDeferredValue(show);
      const isPending = show !== deferredShow;
      const contextDisplay = isPending ? React.use(Context) : '<none>';
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
      return ReactTestRenderer.create(
        <Context.Provider value="provided">
          <Foo />
        </Context.Provider>,
        {unstable_isConcurrent: true},
      );
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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
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
          "id": 0,
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
          "id": 1,
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
          "id": 2,
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
          "id": 0,
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
          "name": "Context",
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
          "id": 1,
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
          "id": 2,
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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
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
          "id": 0,
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
          "id": 1,
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should support useId hook', async () => {
    const store = createStore('hello');
    function Foo(props) {
      const id = React.useId();
      const state = React.use(store);
      return <div id={id}>{state}</div>;
    }

    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    const childFiber = renderer.root.findByType(Foo)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);

    expect(tree.length).toEqual(2);

    expect(tree[0].id).toEqual(0);
    expect(tree[0].isStateEditable).toEqual(false);
    expect(tree[0].name).toEqual('Id');
    expect(String(tree[0].value).startsWith('_r_')).toBe(true);

    expect(normalizeSourceLoc(tree)[1]).toMatchInlineSnapshot(`
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
        "value": "hello",
      }
    `);
  });

  describe('useMemoCache', () => {
    it('should not be inspectable', async () => {
      function Foo() {
        const $ = useMemoCache(1);
        let t0;

        if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
          t0 = <div>{1}</div>;
          $[0] = t0;
        } else {
          t0 = $[0];
        }

        return t0;
      }

      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Foo />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Foo)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);

      expect(tree.length).toEqual(0);
    });

    // @gate enableStore
    it('should work in combination with other hooks', async () => {
      const somethingStore = createStore(null);
      function useSomething() {
        const something = React.use(somethingStore);
        const changeOtherSomething = React.useCallback(() => {}, [something]);

        return [something, changeOtherSomething];
      }

      const oneStore = createStore(1);
      function Foo() {
        const $ = useMemoCache(10);

        useSomething();
        React.use(oneStore);
        React.useEffect(() => {});

        let t0;

        if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
          t0 = <div>{1}</div>;
          $[0] = t0;
        } else {
          t0 = $[0];
        }

        return t0;
      }

      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Foo />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Foo)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);

      expect(tree.length).toEqual(3);
    });
  });

  describe('useDebugValue', () => {
    // @gate enableStore
    it('should support inspectable values for multiple custom hooks', async () => {
      // Each call has its own state, so each one gets its own store.
      const stores = {
        a: createStore('a'),
        b: createStore('b'),
        c: createStore('c'),
        d: createStore('d'),
      };
      function useLabeledValue(label) {
        const value = React.use(stores[label]);
        React.useDebugValue(`custom label ${label}`);
        return value;
      }
      function useAnonymous(label) {
        const value = React.use(stores[label]);
        return value;
      }
      function Example() {
        useLabeledValue('a');
        React.use(stores.b);
        useAnonymous('c');
        useLabeledValue('d');
        return null;
      }
      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Example />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Example)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
      if (__DEV__) {
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "LabeledValue",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useLabeledValue",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": "a",
                },
              ],
              "value": "custom label a",
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Store",
              "subHooks": [],
              "value": "b",
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Anonymous",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useAnonymous",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": "c",
                },
              ],
              "value": undefined,
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "LabeledValue",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useLabeledValue",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": "d",
                },
              ],
              "value": "custom label d",
            },
          ]
        `);
      } else
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "LabeledValue",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useLabeledValue",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": "a",
                },
              ],
              "value": undefined,
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Store",
              "subHooks": [],
              "value": "b",
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Anonymous",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useAnonymous",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": "c",
                },
              ],
              "value": undefined,
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "LabeledValue",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useLabeledValue",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": "d",
                },
              ],
              "value": undefined,
            },
          ]
        `);
    });

    // @gate enableStore
    it('should support inspectable values for nested custom hooks', async () => {
      const store = createStore(0);
      function useInner() {
        React.useDebugValue('inner');
        React.use(store);
      }
      function useOuter() {
        React.useDebugValue('outer');
        useInner();
      }
      function Example() {
        useOuter();
        return null;
      }
      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Example />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Example)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
      if (__DEV__) {
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Outer",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useOuter",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Inner",
                  "subHooks": [
                    {
                      "debugInfo": null,
                      "hookSource": {
                        "columnNumber": 0,
                        "fileName": "**",
                        "functionName": "useInner",
                        "lineNumber": 0,
                      },
                      "id": null,
                      "isStateEditable": false,
                      "name": "Store",
                      "subHooks": [],
                      "value": 0,
                    },
                  ],
                  "value": "inner",
                },
              ],
              "value": "outer",
            },
          ]
        `);
      } else
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Outer",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useOuter",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Inner",
                  "subHooks": [
                    {
                      "debugInfo": null,
                      "hookSource": {
                        "columnNumber": 0,
                        "fileName": "**",
                        "functionName": "useInner",
                        "lineNumber": 0,
                      },
                      "id": null,
                      "isStateEditable": false,
                      "name": "Store",
                      "subHooks": [],
                      "value": 0,
                    },
                  ],
                  "value": undefined,
                },
              ],
              "value": undefined,
            },
          ]
        `);
    });

    // @gate enableStore
    it('should support multiple inspectable values per custom hooks', async () => {
      // Each call has its own state, so each one gets its own store.
      const multiLabelStore = createStore(0);
      const singleLabelStores = {one: createStore(0), two: createStore(0)};
      function useMultiLabelCustom() {
        React.useDebugValue('one');
        React.useDebugValue('two');
        React.useDebugValue('three');
        React.use(multiLabelStore);
      }
      function useSingleLabelCustom(value) {
        React.useDebugValue(`single ${value}`);
        React.use(singleLabelStores[value]);
      }
      function Example() {
        useSingleLabelCustom('one');
        useMultiLabelCustom();
        useSingleLabelCustom('two');
        return null;
      }
      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Example />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Example)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
      if (__DEV__) {
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "SingleLabelCustom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useSingleLabelCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": "single one",
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "MultiLabelCustom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useMultiLabelCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": [
                "one",
                "two",
                "three",
              ],
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "SingleLabelCustom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useSingleLabelCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": "single two",
            },
          ]
        `);
      } else
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "SingleLabelCustom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useSingleLabelCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": undefined,
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "MultiLabelCustom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useMultiLabelCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": undefined,
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "SingleLabelCustom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useSingleLabelCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": undefined,
            },
          ]
        `);
    });

    it('should ignore useDebugValue() made outside of a custom hook', async () => {
      function Example() {
        React.useDebugValue('this is invalid');
        return null;
      }
      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Example />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Example)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
      expect(tree).toHaveLength(0);
    });

    // @gate enableStore
    it('should support an optional formatter function param', async () => {
      const store = createStore(0);
      function useCustom() {
        React.useDebugValue({bar: 123}, object => `bar:${object.bar}`);
        React.use(store);
      }
      function Example() {
        useCustom();
        return null;
      }
      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<Example />, {
          unstable_isConcurrent: true,
        });
      });
      const childFiber = renderer.root.findByType(Example)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
      if (__DEV__) {
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Custom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": "bar:123",
            },
          ]
        `);
      } else
        expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
          [
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "Example",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Custom",
              "subHooks": [
                {
                  "debugInfo": null,
                  "hookSource": {
                    "columnNumber": 0,
                    "fileName": "**",
                    "functionName": "useCustom",
                    "lineNumber": 0,
                  },
                  "id": null,
                  "isStateEditable": false,
                  "name": "Store",
                  "subHooks": [],
                  "value": 0,
                },
              ],
              "value": undefined,
            },
          ]
        `);
    });
  });

  // This test case is based on an open source bug report:
  // https://github.com/facebookincubator/redux-react-hook/issues/34#issuecomment-466693787
  // @gate enableStore
  it('should properly advance the current hook for useContext', async () => {
    const MyContext = React.createContext(1);

    let incrementCount;

    // The initial value can't be computed from context during render, so the
    // store starts with the context's default value.
    const dataStore = createStore({count: 1});

    function Foo(props) {
      React.useContext(MyContext);
      const data = React.use(dataStore);

      incrementCount = () =>
        dataStore.update(({count}) => ({count: count + 1}));

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
          "name": "Context",
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
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": {
            "count": 2,
          },
        },
      ]
    `);
  });

  it('should support composite useSyncExternalStore hook', async () => {
    const useSyncExternalStore = React.useSyncExternalStore;
    function Foo() {
      const value = useSyncExternalStore(
        () => () => {},
        () => 'snapshot',
      );
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
          "isStateEditable": false,
          "name": "SyncExternalStore",
          "subHooks": [],
          "value": "snapshot",
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });

  it('should support use(Context) hook', async () => {
    const Context = React.createContext('default');
    function Foo() {
      const value = React.use(Context);
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
          "name": "Context",
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

  it('should support useOptimistic hook', async () => {
    const useOptimistic = React.useOptimistic;
    function Foo() {
      const [value] = useOptimistic('abc', currentState => currentState);
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
          "isStateEditable": false,
          "name": "Optimistic",
          "subHooks": [],
          "value": "abc",
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });

  it('should support useActionState hook', async () => {
    function Foo() {
      const [value] = React.useActionState(function increment(n) {
        return n;
      }, 0);
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
          "isStateEditable": false,
          "name": "ActionState",
          "subHooks": [],
          "value": 0,
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
          "id": 2,
          "isStateEditable": false,
          "name": "Memo",
          "subHooks": [],
          "value": "not used",
        },
      ]
    `);
  });
});
