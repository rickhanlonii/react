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

// The fields these tests check. A store read takes no hook slot, so a Store
// node has no id, and the ids of the hooks after it don't shift.
function summarize(tree) {
  return tree.map(node => {
    const summary = {name: node.name, id: node.id, value: node.value};
    if (node.subHooks.length > 0) {
      summary.subHooks = summarize(node.subHooks);
    }
    return summary;
  });
}

function inspect(renderer, type) {
  return ReactDebugTools.inspectHooksOfFiber(
    renderer.root.findByType(type)._currentFiber(),
  );
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
    const tree = inspect(renderer, Foo);
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
    const nextTree = inspect(renderer, Foo);
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
      const tree = inspect(renderer, Foo);
      assertLog([]);
      expect(tree.map(node => [node.name, node.value])).toEqual([['Store', 0]]);
    });
  });

  // @gate enableStore
  it('a store read is a Store node under the custom Hook that read it', () => {
    function effect() {}
    const helloStore = createStore('hello');
    const worldStore = createStore('world');
    function useCustom(store) {
      const state = React.use(store);
      React.useEffect(effect);
      return state;
    }
    function Foo() {
      return [useCustom(helloStore), useCustom(worldStore)].join(' ');
    }
    const tree = ReactDebugTools.inspectHooks(Foo, {});
    expect(summarize(tree)).toEqual([
      {
        name: 'Custom',
        id: null,
        value: undefined,
        subHooks: [
          {name: 'Store', id: null, value: 'hello'},
          {name: 'Effect', id: 0, value: effect},
        ],
      },
      {
        name: 'Custom',
        id: null,
        value: undefined,
        subHooks: [
          {name: 'Store', id: null, value: 'world'},
          {name: 'Effect', id: 1, value: effect},
        ],
      },
    ]);
    expect(tree[0].subHooks[0]).toEqual({
      id: null,
      isStateEditable: false,
      name: 'Store',
      value: 'hello',
      debugInfo: null,
      subHooks: [],
      hookSource: expect.objectContaining({functionName: 'useCustom'}),
    });
  });

  // @gate enableStore
  it('Store nodes show the committed value and take no hook id', async () => {
    function effect() {}
    const stateStore = createStore('a');
    const reducerStore = createStore('b', (s, a) => a.value);
    function Foo() {
      const state1 = React.use(stateStore);
      const state2 = React.use(reducerStore);
      React.useRef('c');
      React.useLayoutEffect(effect);
      React.useEffect(effect);
      React.useMemo(() => state1 + state2, [state1]);
      return state1 + state2;
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<Foo />, {
        unstable_isConcurrent: true,
      });
    });
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'Store', id: null, value: 'a'},
      {name: 'Store', id: null, value: 'b'},
      {name: 'Ref', id: 0, value: 'c'},
      {name: 'LayoutEffect', id: 1, value: effect},
      {name: 'Effect', id: 2, value: effect},
      {name: 'Memo', id: 3, value: 'ab'},
    ]);

    await act(() => {
      stateStore.update('A');
      reducerStore.update({value: 'B'});
    });
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'Store', id: null, value: 'A'},
      {name: 'Store', id: null, value: 'B'},
      {name: 'Ref', id: 0, value: 'c'},
      {name: 'LayoutEffect', id: 1, value: effect},
      {name: 'Effect', id: 2, value: effect},
      {name: 'Memo', id: 3, value: 'AB'},
    ]);
  });

  // The transition suspends, so the store holds the new value while the
  // committed render, and the inspected Store node, still show the old one.
  // @gate enableStore
  it('a Store node shows the committed value while a transition that updated the store is suspended', async () => {
    const IndefiniteSuspender = React.lazy(() => new Promise(() => {}));
    let startFooTransition;
    const showStore = createStore(false);
    function Foo() {
      const show = React.use(showStore);
      const [isPending, _startTransition] = React.useTransition();

      // Otherwise we capture the version from the react-debug-tools dispatcher.
      if (startFooTransition === undefined) {
        startFooTransition = () => {
          _startTransition(() => {
            showStore.update(true);
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
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'Store', id: null, value: false},
      {name: 'Transition', id: 0, value: false},
    ]);

    await act(() => {
      startFooTransition();
    });
    expect(renderer).toMatchRenderedOutput('Pending');
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'Store', id: null, value: false},
      {name: 'Transition', id: 0, value: true},
    ]);
  });

  // The store is read only during the pending deferred render, so the Store
  // node appears and disappears between inspections.
  // @gate enableStore
  it('a Store node appears only in renders that read the store', async () => {
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
    const store = createStore('stored');
    let setShow;
    function Foo() {
      const [show, _setShow] = React.useState(false);
      const deferredShow = React.useDeferredValue(show);
      const isPending = show !== deferredShow;
      const storeDisplay = isPending ? React.use(store) : '<none>';

      // Otherwise we capture the version from the react-debug-tools dispatcher.
      if (setShow === undefined) {
        setShow = _setShow;
      }

      return (
        <React.Suspense fallback="Loading">
          Store: {storeDisplay}, {isPending ? 'Pending' : 'Nothing Pending'}
          {deferredShow ? [', ', <Suspender key="suspender" />] : null}
        </React.Suspense>
      );
    }
    const renderer = await act(() => {
      return ReactTestRenderer.create(<Foo />, {unstable_isConcurrent: true});
    });
    expect(renderer).toMatchRenderedOutput('Store: <none>, Nothing Pending');
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'State', id: 0, value: false},
      {name: 'DeferredValue', id: 1, value: false},
    ]);

    await act(() => {
      setShow(true);
    });
    expect(renderer).toMatchRenderedOutput('Store: stored, Pending');
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'State', id: 0, value: true},
      {name: 'DeferredValue', id: 1, value: false},
      {name: 'Store', id: null, value: 'stored'},
    ]);

    await act(() => {
      unsuspend();
    });
    expect(renderer).toMatchRenderedOutput(
      'Store: <none>, Nothing Pending, Lazy',
    );
    expect(summarize(inspect(renderer, Foo))).toEqual([
      {name: 'State', id: 0, value: true},
      {name: 'DeferredValue', id: 1, value: true},
    ]);
  });

  describe('with DevTools injected', () => {
    let overrideHookState;

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

    afterEach(() => {
      delete global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    });

    // A store read doesn't take a hook slot, so overriding the useState after
    // it targets the right hook.
    // @gate enableStore
    it('overriding the state of a Hook after a store read targets that Hook', async () => {
      const store = createStore(1);

      function useCustomHook() {
        const initial = React.use(store);
        const [state] = React.useState({count: initial});
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
      expect(renderer).toMatchRenderedOutput(<div>count:1</div>);

      const fiber = renderer.root.findByType(MyComponent)._currentFiber();
      const tree = ReactDebugTools.inspectHooksOfFiber(fiber);
      expect(summarize(tree)).toEqual([
        {
          name: 'CustomHook',
          id: null,
          value: undefined,
          subHooks: [
            {name: 'Store', id: null, value: 1},
            {name: 'State', id: 0, value: {count: 1}},
          ],
        },
      ]);
      const stateHook = tree[0].subHooks[1];
      expect(stateHook.isStateEditable).toBe(true);

      if (__DEV__) {
        await act(() => overrideHookState(fiber, stateHook.id, ['count'], 10));
        expect(renderer).toMatchRenderedOutput(<div>count:10</div>);
      }
    });
  });
});
