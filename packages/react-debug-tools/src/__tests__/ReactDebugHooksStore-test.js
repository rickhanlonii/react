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

  // Cases folded in from the cleanup of the use(store) test copies (see each case's source comment).
  describe('folded copies', () => {
    beforeEach(() => {
      jest.resetModules();
      React = require('react');
      ReactDebugTools = require('react-debug-tools');
      createStore = React.unstable_createStore;
    });

    // @gate enableStore
    it('should inspect a simple useState hook', () => {
      const store = createStore('hello world');
      function Foo(props) {
        const state = React.use(store);
        return <div>{state}</div>;
      }
      const tree = ReactDebugTools.inspectHooks(Foo, {});
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
            "value": "hello world",
          },
        ]
      `);
    });

    // @gate enableStore
    it('should inspect a tree of multiple hooks', () => {
      function effect() {}
      // Each call to useCustom has its own state, so each one gets its own store.
      const helloStore = createStore('hello');
      const worldStore = createStore('world');
      function useCustom(store) {
        const state = React.use(store);
        React.useEffect(effect);
        return state;
      }
      function Foo(props) {
        const value1 = useCustom(helloStore);
        const value2 = useCustom(worldStore);
        return (
          <div>
            {value1} {value2}
          </div>
        );
      }
      const tree = ReactDebugTools.inspectHooks(Foo, {});
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
              {
                "debugInfo": null,
                "hookSource": {
                  "columnNumber": 0,
                  "fileName": "**",
                  "functionName": "useCustom",
                  "lineNumber": 0,
                },
                "id": 0,
                "isStateEditable": false,
                "name": "Effect",
                "subHooks": [],
                "value": [Function],
              },
            ],
            "value": undefined,
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
                "value": "world",
              },
              {
                "debugInfo": null,
                "hookSource": {
                  "columnNumber": 0,
                  "fileName": "**",
                  "functionName": "useCustom",
                  "lineNumber": 0,
                },
                "id": 1,
                "isStateEditable": false,
                "name": "Effect",
                "subHooks": [],
                "value": [Function],
              },
            ],
            "value": undefined,
          },
        ]
      `);
    });
  });

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

    // The transition suspends, so the store holds the new value while the
    // committed render, and the inspected Store node, still show the old one.
    // @gate enableStore
    it('should update isPending returned from useTransition', async () => {
      const IndefiniteSuspender = React.lazy(() => new Promise(() => {}));
      let startFooTransition;
      const showStore = createStore(false);
      const setShow = showStore.update;
      function Foo(props) {
        const show = React.use(showStore);
        const [isPending, _startTransition] = React.useTransition();
        React.useMemo(() => 'hello', []);
        React.useMemo(() => 'not used', []);

        // Otherwise we capture the version from the react-debug-tools dispatcher.
        if (startFooTransition === undefined) {
          startFooTransition = () => {
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
        startFooTransition();
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

    // The store is read only during the pending deferred render, so the Store
    // node appears and disappears between inspections.
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
            Context: {contextDisplay},{' '}
            {isPending ? 'Pending' : 'Nothing Pending'}
            {deferredShow ? [', ', <Suspender key="suspender" />] : null}
          </React.Suspense>
        );
      }
      const renderer = await act(() => {
        return ReactTestRenderer.create(<Foo />, {unstable_isConcurrent: true});
      });
      let childFiber = renderer.root.findByType(Foo)._currentFiber();
      let tree = ReactDebugTools.inspectHooksOfFiber(childFiber);
      expect(renderer).toMatchRenderedOutput(
        'Context: <none>, Nothing Pending',
      );
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
  });

  describe('React hooks DevTools integration', () => {
    let overrideHookState;

    global.IS_REACT_ACT_ENVIRONMENT = true;

    beforeEach(() => {
      global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        inject: injected => {
          overrideHookState = injected.overrideHookState;
        },
        supportsFiber: true,
        onCommitFiberRoot: () => {},
        onCommitFiberUnmount: () => {},
      };

      jest.resetModules();

      React = require('react');
      ReactDebugTools = require('react-debug-tools');
      ReactTestRenderer = require('react-test-renderer');
      createStore = React.unstable_createStore;

      act = require('internal-test-utils').act;
    });

    // A store read doesn't take a hook slot, so overriding the useState after
    // it targets the right hook.
    // This test case is based on an open source bug report:
    // https://github.com/facebookincubator/redux-react-hook/issues/34#issuecomment-466693787
    // @gate enableStore
    it('should handle interleaved stateful hooks (e.g. useState) and non-stateful hooks (e.g. useContext)', async () => {
      const store = createStore(1);

      let setStateFn;
      function useCustomHook() {
        const context = React.use(store);
        const [state, setState] = React.useState({count: context});
        React.useDebugValue(state.count);
        setStateFn = setState;
        return state.count;
      }

      function MyComponent() {
        const count = useCustomHook();
        return <div>count:{count}</div>;
      }

      let renderer;
      await act(() => {
        renderer = ReactTestRenderer.create(<MyComponent />, {
          unstable_isConcurrent: true,
        });
      });
      expect(renderer.toJSON()).toEqual({
        type: 'div',
        props: {},
        children: ['count:', '1'],
      });

      const fiber = renderer.root.findByType(MyComponent)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(fiber);
      const stateHook = tree[0].subHooks[1];
      expect(stateHook.isStateEditable).toBe(true);

      if (__DEV__) {
        await act(() => overrideHookState(fiber, stateHook.id, ['count'], 10));
        expect(renderer.toJSON()).toEqual({
          type: 'div',
          props: {},
          children: ['count:', '10'],
        });
        await act(() => setStateFn(state => ({count: state.count + 1})));
        expect(renderer.toJSON()).toEqual({
          type: 'div',
          props: {},
          children: ['count:', '11'],
        });
      }
    });
  });
});
